import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OutletStoreState, RoleConfig, WorkingDayAdjustment } from '../src/types/outlet';
import { buildExportReport } from '../src/utils/exportReports';
import {
  DEFAULT_ROLE_CONFIGS,
  buildMonthWorkingDays,
  calcRecap,
  calcVisitLeaderboard,
  countAdjustedWorkingDays,
  countWorkingDaysInRange,
  getAdjustmentForPersonDay,
  parseDayAdjustments,
} from '../src/utils/outletLogic';

describe('Working-day adjustments & KPI denominator averaging', () => {
  it('computes 25 - 4 = 21 effective working days (2 cuti + 2 off) and averages KPI strictly over 21 days', () => {
    const novDays = buildMonthWorkingDays('2026-11');
    assert.equal(novDays.length, 25);

    const adjustments: WorkingDayAdjustment[] = [
      {
        id: 'adj_cuti_1',
        type: 'cuti_izin',
        scope: 'person',
        pic: 'PETER',
        dateFrom: '2026-11-02',
        dateTo: '2026-11-03',
        note: 'Cuti 2 hari kerja',
      },
      {
        id: 'adj_off_1',
        type: 'off_day',
        scope: 'person',
        pic: 'PETER',
        dateFrom: '2026-11-04',
        dateTo: '2026-11-05',
        note: 'Off 2 hari kerja',
      },
    ];

    const statsPeter = countAdjustedWorkingDays(novDays, adjustments, 'PETER');
    assert.equal(statsPeter.total, 25);
    assert.equal(statsPeter.adjusted, 4);
    assert.equal(statsPeter.effective, 21);
    assert.equal(statsPeter.byType.cuti_izin, 2);
    assert.equal(statsPeter.byType.off_day, 2);

    // Other PIC is unaffected by person-scoped adjustments
    const statsHabel = countAdjustedWorkingDays(novDays, adjustments, 'HABEL');
    assert.equal(statsHabel.total, 25);
    assert.equal(statsHabel.adjusted, 0);
    assert.equal(statsHabel.effective, 25);

    // Construct a store where PETER has same-day input on 20 effective days (pm = tol) and
    // 3-working-day lag on 1 effective day (pm = -3 + tol), with NO input on the 4 adjusted days.
    const task = {
      ...DEFAULT_ROLE_CONFIGS.stock_accounting.tasks.find((t) => t.key === 'bm')!,
      toleranceOffset: 0,
    };
    const ent: OutletStoreState['ent'] = { DLS: {} };
    const effectiveDays = novDays.filter(
      (d) => !getAdjustmentForPersonDay(adjustments, 'PETER', d)
    );
    assert.equal(effectiveDays.length, 21);

    effectiveDays.forEach((d, idx) => {
      // On idx === 0 (2026-11-06), give 2026-11-03 -> pm = -3; on the other 20 days give d -> pm = 0
      ent.DLS[`${d}|bm`] = {
        d: idx === 0 ? '2026-11-03' : d,
        n: '',
        byAdmin: true,
      };
    });

    const state: OutletStoreState = { ent, visit: {}, start: '2026-11-02' };
    const recap = calcRecap(
      state,
      novDays,
      [task],
      'DLS',
      'PETER',
      'bm',
      '2026-11-30',
      '2026-11-30',
      '2026-11-02',
      adjustments
    );

    assert.equal(recap.totalDays, 25);
    assert.equal(recap.adjustedDays, 4);
    assert.equal(recap.effectiveDays, 21);
    assert.equal(recap.pend, 1);
    // Expected sum: (-3) + 20 * 0 = -3, divided strictly by 21 effective working days (not 25!)
    assert.ok(
      Math.abs(recap.avg - -3 / 21) < 1e-9,
      `Expected avg ${(-3 / 21).toFixed(4)} over 21 days, got ${recap.avg}`
    );
  });

  it('handles overlapping adjustments without double-subtracting and respects scope precedence', () => {
    const novDays = buildMonthWorkingDays('2026-11');
    const adjustments: WorkingDayAdjustment[] = [
      {
        id: 'adj_all',
        type: 'libur_nasional',
        scope: 'all',
        dateFrom: '2026-11-10',
        dateTo: '2026-11-10',
      },
      {
        id: 'adj_role',
        type: 'cuti_bersama',
        scope: 'role',
        dateFrom: '2026-11-10',
        dateTo: '2026-11-11',
      },
      {
        id: 'adj_person',
        type: 'cuti_izin',
        scope: 'person',
        pic: 'PETER',
        dateFrom: '2026-11-11',
        dateTo: '2026-11-12',
      },
    ];

    // 2026-11-10, 11, 12 = 3 unique working days for PETER (no double count on 10 & 11)
    const statsPeter = countAdjustedWorkingDays(novDays, adjustments, 'PETER');
    assert.equal(statsPeter.adjusted, 3);
    assert.equal(statsPeter.effective, 22);
    // Precedence on Nov 11: person > role
    assert.equal(getAdjustmentForPersonDay(adjustments, 'PETER', '2026-11-11')?.type, 'cuti_izin');
    // Precedence on Nov 10: role > all
    assert.equal(getAdjustmentForPersonDay(adjustments, 'PETER', '2026-11-10')?.type, 'cuti_bersama');

    // Another PIC gets Nov 10 (role/all) and Nov 11 (role) = 2 unique days
    const statsOther = countAdjustedWorkingDays(novDays, adjustments, 'CHARLES');
    assert.equal(statsOther.adjusted, 2);
    assert.equal(statsOther.effective, 23);
  });

  it('excludes Sundays in countWorkingDaysInRange and adjusts visit leaderboard elapsedDays', () => {
    // 2026-11-07 (Sat) to 2026-11-09 (Mon) includes Sunday 2026-11-08 -> 2 working days
    assert.equal(countWorkingDaysInRange('2026-11-07', '2026-11-09'), 2);

    const novDays = buildMonthWorkingDays('2026-11');
    const adjustments: WorkingDayAdjustment[] = [
      {
        id: 'adj_p',
        type: 'off_day',
        scope: 'person',
        pic: 'PETER',
        dateFrom: '2026-11-02',
        dateTo: '2026-11-05',
      },
    ];
    const emptyState: OutletStoreState = { ent: {}, visit: {}, start: '2026-11-02' };
    const board = calcVisitLeaderboard(
      emptyState,
      novDays,
      ['PETER', 'HABEL'],
      '2026-11-30',
      '2026-11-02',
      '2026-11-30',
      adjustments
    );
    const peterRow = board.rows.find((r) => r.person === 'PETER')!;
    const habelRow = board.rows.find((r) => r.person === 'HABEL')!;
    assert.equal(peterRow.elapsedDays, 21);
    assert.equal(peterRow.adjustedDays, 4);
    assert.equal(habelRow.elapsedDays, 25);
  });

  it('reflects effective working days and adjustment count in bulanan_kpi report', () => {
    const novDays = buildMonthWorkingDays('2026-11');
    const baseCfg: RoleConfig = {
      ...DEFAULT_ROLE_CONFIGS.stock_accounting,
      tasks: [DEFAULT_ROLE_CONFIGS.stock_accounting.tasks.find((t) => t.key === 'bm')!],
      outlets: [{ code: 'DLS', person: 'PETER' }],
      dayAdjustments: [
        {
          id: 'adj_1',
          type: 'cuti_izin',
          scope: 'person',
          pic: 'PETER',
          dateFrom: '2026-11-02',
          dateTo: '2026-11-03',
        },
        {
          id: 'adj_2',
          type: 'off_day',
          scope: 'person',
          pic: 'PETER',
          dateFrom: '2026-11-04',
          dateTo: '2026-11-05',
        },
      ],
    };
    const roleConfigs = {
      stock_accounting: baseCfg,
      gl: DEFAULT_ROLE_CONFIGS.gl,
      accounting: DEFAULT_ROLE_CONFIGS.accounting,
    };
    const emptyWs: OutletStoreState = { ent: {}, visit: {}, start: '2026-11-02' };
    const report = buildExportReport({
      reportId: 'bulanan_kpi',
      roleFilter: 'stock_accounting',
      roleConfigs,
      allWorkspaces: {
        stock_accounting: emptyWs,
        gl: emptyWs,
        accounting: emptyWs,
      },
      inputLogs: [],
      availableDays: novDays,
      today: '2026-11-30',
      targetDay: '2026-11-30',
      monthOption: { key: '2026-11', label: 'November 2026', days: novDays },
      picFilter: 'ALL',
      outletFilter: 'ALL',
      statusFilter: 'ALL',
      searchQuery: '',
    });

    assert.equal(report.rows.length, 1);
    const effIdx = report.columns.indexOf('Hari Kerja Efektif');
    const adjIdx = report.columns.indexOf('Hari Adjustment');
    assert.equal(report.rows[0].cells[effIdx], 21);
    assert.equal(report.rows[0].cells[adjIdx], 4);
  });

  it('sanitizes and normalizes raw adjustments in parseDayAdjustments', () => {
    const parsed = parseDayAdjustments([
      {
        id: 'a1',
        type: 'cuti_izin',
        scope: 'person',
        pic: ' peter ',
        dateFrom: '2026-11-05',
        dateTo: '2026-11-02',
        note: '  Cuti  ',
      },
      // Duplicate id should be dropped
      {
        id: 'a1',
        type: 'off_day',
        scope: 'all',
        dateFrom: '2026-11-06',
        dateTo: '2026-11-06',
      },
      // Missing pic for person scope should be dropped
      {
        id: 'a2',
        type: 'off_day',
        scope: 'person',
        dateFrom: '2026-11-06',
        dateTo: '2026-11-06',
      },
      // Invalid type should be dropped
      {
        id: 'a3',
        type: 'invalid_type',
        scope: 'all',
        dateFrom: '2026-11-06',
        dateTo: '2026-11-06',
      },
    ]);

    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].pic, 'PETER');
    assert.equal(parsed[0].dateFrom, '2026-11-02');
    assert.equal(parsed[0].dateTo, '2026-11-05');
    assert.equal(parsed[0].note, 'Cuti');
  });
});
