import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ROLE_CONFIGS,
  buildMonthWorkingDays,
} from '../src/utils/outletLogic';
import {
  ML_MODULE_DEFINITIONS,
  computeMlInsightsSuite,
  mlTableToCsv,
} from '../src/utils/mlInsights';
import {
  InputLogEntry,
  OperationalRoleId,
  OutletStoreState,
  RoleConfig,
} from '../src/types/outlet';

function buildEmptyWorkspaces(): Record<OperationalRoleId, OutletStoreState> {
  return {
    stock_accounting: { ent: {}, visit: {}, start: '2026-11-02' },
    gl: { ent: {}, visit: {}, start: '2026-11-02' },
    accounting: { ent: {}, visit: {}, start: '2026-11-02' },
  };
}

describe('mlInsights: 10-module analytics & dynamic multi-role support', () => {
  it('generates all 10 ML modules cleanly without NaN even when GL and Accounting have 0 tasks', () => {
    const days = buildMonthWorkingDays('2026-11').filter((d) => d <= '2026-11-20');
    const workspaces = buildEmptyWorkspaces();
    workspaces.stock_accounting.ent = {
      NKPM: {
        '2026-11-10|ham': { d: '2026-11-09', n: '', ts: '2026-11-10T03:00:00.000Z' },
        '2026-11-10|bm': { d: '2026-11-09', n: '', ts: '2026-11-10T03:00:00.000Z' },
      },
      DELICA: {
        // Chronic pending & upstream lag
        '2026-11-05|ham': { d: '2026-11-02', n: '', ts: '2026-11-10T04:00:00.000Z' },
        '2026-11-05|bm': { d: '2026-11-02', n: '', ts: '2026-11-10T04:00:00.000Z' },
      },
    };
    workspaces.stock_accounting.visit = {
      'PETER|2026-11-10': {
        ok: true,
        f: '09:00',
        t: '11:00',
        n: 'Pengecekkan Inventory — cek fisik',
        entries: [
          {
            id: 'v1',
            outlet: 'NKPM',
            f: '09:00',
            t: '11:00',
            n: 'Pengecekkan Inventory — cek fisik',
          },
        ],
      },
    };

    const logs: InputLogEntry[] = [
      {
        id: 'log1',
        actionType: 'input_harian',
        roleId: 'stock_accounting',
        roleLabel: 'Stock Accounting',
        day: '2026-11-10',
        pic: 'PETER',
        outlet: 'NKPM',
        itemCount: 2,
        details: 'HAM SPC, Barang Masuk',
        uid: 'u1',
        userName: 'Peter',
        userEmail: 'peter@example.com',
        userRole: 'stock_accounting',
        clientTs: '2026-11-10T03:00:00.000Z',
      },
    ];

    const suite = computeMlInsightsSuite({
      roleFilter: 'ALL',
      roleConfigs: DEFAULT_ROLE_CONFIGS,
      allWorkspaces: workspaces,
      inputLogs: logs,
      availableDays: days,
      today: '2026-11-20',
      picFilter: 'ALL',
      outletFilter: 'ALL',
      kpiTargetPct: 90,
    });

    assert.equal(Object.keys(suite.modules).length, ML_MODULE_DEFINITIONS.length);
    assert.equal(suite.roleCoverage.find((r) => r.roleId === 'gl')?.taskCount, 0);
    assert.equal(suite.roleCoverage.find((r) => r.roleId === 'accounting')?.taskCount, 0);

    for (const def of ML_MODULE_DEFINITIONS) {
      const mod = suite.modules[def.id];
      assert.ok(mod, `Missing module ${def.id}`);
      assert.ok(mod.columns.length > 0);
      for (const row of mod.rows) {
        for (const cell of row.cells) {
          assert.equal(String(cell).includes('NaN'), false, `NaN found in ${def.id}`);
          assert.equal(String(cell).includes('Infinity'), false, `Infinity found in ${def.id}`);
        }
      }
    }

    // Explicit dependency HAM SPC -> Barang Masuk detected
    assert.ok(
      suite.modules.dependency_bottleneck.rows.some(
        (r) => String(r.cells[3]) === 'HAM SPC' && String(r.cells[4]) === 'Barang Masuk'
      )
    );
    // K-Means clusters classify all 16 outlets into valid cluster names
    assert.equal(suite.modules.outlet_clustering.rows.length, 16);
    const validClusters = new Set([
      'Sehat & Konsisten',
      'Fluktuatif / Rawan Telat',
      'Kritis / Kronis Pending',
    ]);
    assert.ok(
      suite.modules.outlet_clustering.rows.every((r) => validClusters.has(String(r.cells[0])))
    );
  });

  it('automatically detects and analyzes newly added dynamic tasks in GL and Accounting', () => {
    const customConfigs: Record<OperationalRoleId, RoleConfig> = {
      ...DEFAULT_ROLE_CONFIGS,
      gl: {
        roleId: 'gl',
        label: 'GL',
        start: '2026-11-02',
        ndays: 25,
        tasks: [
          {
            key: 'jurnal_kas',
            label: 'Jurnal Kas & Bank',
            shortLabel: 'Jurnal Kas',
            defaultDate: '',
            inputType: 'date',
            formulaType: 'daily_plus_1',
            toleranceOffset: 1,
            formulaNote: 'Selisih hari terhadap tanggal kerja + 1',
          },
          {
            key: 'rekonsiliasi_wk',
            label: 'Rekonsiliasi Mingguan',
            shortLabel: 'Rekon Wk',
            defaultDate: '',
            inputType: 'week',
            formulaType: 'weekly_plus_1',
            toleranceOffset: 1,
            formulaNote: 'Selisih minggu terhadap tanggal kerja + 1',
          },
        ],
        outlets: [
          { person: 'RINA', code: 'HO_GL' },
          { person: 'RINA', code: 'CAB_A' },
        ],
      },
      accounting: {
        roleId: 'accounting',
        label: 'Accounting',
        start: '2026-11-02',
        ndays: 25,
        tasks: [
          {
            key: 'pajak_bulanan',
            label: 'Closing Pajak Bulanan',
            shortLabel: 'Pajak Bln',
            defaultDate: '',
            inputType: 'month',
            formulaType: 'memo_month',
            toleranceOffset: 1,
            formulaNote: 'Selisih bulan terhadap tanggal kerja + 1',
          },
        ],
        outlets: [{ person: 'BUDI', code: 'PT_UTAMA' }],
      },
    };

    const workspaces = buildEmptyWorkspaces();
    workspaces.gl.ent = {
      HO_GL: {
        '2026-11-16|jurnal_kas': { d: '2026-11-16', n: '', ts: '2026-11-16T03:00:00.000Z' },
        '2026-11-16|rekonsiliasi_wk': { d: '2026-11-16', n: '', ts: '2026-11-16T03:00:00.000Z' },
      },
    };
    workspaces.accounting.ent = {
      PT_UTAMA: {
        '2026-11-16|pajak_bulanan': { d: '2026-10', n: '=CMD()', ts: '2026-11-16T03:00:00.000Z' },
      },
    };

    const days = buildMonthWorkingDays('2026-11').filter((d) => d <= '2026-11-18');
    const suite = computeMlInsightsSuite({
      roleFilter: 'ALL',
      roleConfigs: customConfigs,
      allWorkspaces: workspaces,
      inputLogs: [],
      availableDays: days,
      today: '2026-11-18',
      picFilter: 'ALL',
      outletFilter: 'ALL',
      kpiTargetPct: 95,
    });

    assert.equal(suite.roleCoverage.find((r) => r.roleId === 'gl')?.taskCount, 2);
    assert.equal(suite.roleCoverage.find((r) => r.roleId === 'accounting')?.taskCount, 1);

    const riskOutlets = new Set(suite.modules.risk_forecast.rows.map((r) => String(r.cells[4])));
    assert.ok(riskOutlets.has('HO_GL'));
    assert.ok(riskOutlets.has('CAB_A'));
    assert.ok(riskOutlets.has('PT_UTAMA'));

    // KPI target column & takeaways reflect requested 95% target across dynamic PICs
    assert.ok(suite.modules.pic_kpi_forecast.columns[9].includes('95%'));
    assert.ok(suite.modules.pic_kpi_forecast.rows.some((r) => String(r.cells[3]) === 'RINA'));
    assert.ok(suite.modules.pic_kpi_forecast.rows.some((r) => String(r.cells[3]) === 'BUDI'));

    // mlTableToCsv starts with UTF-8 BOM and neutralizes any formula prefix in cells
    const csv = mlTableToCsv(['Col'], [{ key: '1', cells: ['=SUM(1,2)'] }]);
    assert.ok(csv.startsWith('\uFEFF'));
    assert.ok(csv.includes("'=SUM(1,2)"));
  });
});
