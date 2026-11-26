import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  AccountProfile,
  CalendarEvent,
  InputLogEntry,
  OperationalRoleId,
  OutletStoreState,
  RoleConfig,
  SavedRecord,
} from '../src/types/outlet';
import {
  CSV_PRESET_OPTIONS,
  buildDataset,
  buildDatasetReadme,
  buildZip,
  datasetTableToCsv,
} from '../src/utils/exportDataset';
import { buildExportReport, buildMonthOptions } from '../src/utils/exportReports';
import {
  DEFAULT_ROLE_CONFIGS,
  calcRecap,
  calcTask,
  escapeCsvCell,
  fmtDateTimeWithSeconds,
  toWibIsoDate,
} from '../src/utils/outletLogic';

function makeFixture() {
  const today = '2026-11-05';
  const availableDays = [
    '2026-11-02',
    '2026-11-03',
    '2026-11-04',
    '2026-11-05',
    '2026-11-06',
  ];

  const roleConfigs: Record<OperationalRoleId, RoleConfig> = {
    stock_accounting: {
      ...DEFAULT_ROLE_CONFIGS.stock_accounting,
      tasks: DEFAULT_ROLE_CONFIGS.stock_accounting.tasks.slice(0, 2), // memo & ham
      outlets: [
        { person: 'PETER', code: 'NKPM' },
        { person: 'CHARLES', code: 'SKCP' },
      ],
    },
    gl: { ...DEFAULT_ROLE_CONFIGS.gl, tasks: [], outlets: [] },
    accounting: { ...DEFAULT_ROLE_CONFIGS.accounting, tasks: [], outlets: [] },
  };

  const saWorkspace: OutletStoreState = {
    start: '2026-11-01',
    ent: {
      NKPM: {
        '2026-11-02|memo': {
          d: '2026-10',
          n: 'Ok',
          ts: '2026-11-02T03:00:00.000Z', // 10:00 WIB same day
        },
        '2026-11-02|ham': {
          // Submitted 2026-11-05 02:00Z = 09:00 WIB -> 3 working days later -> backfill_hari = 2
          d: '2026-11-02',
          n: 'Susulan',
          ts: '2026-11-05T02:00:00.000Z',
        },
        '2026-11-04|ham': {
          d: '2026-11-04',
          n: '',
          ts: '2026-11-04T04:15:30.000Z', // 11:15:30 WIB
        },
      },
      // SKCP has no entries -> belum_input = 1 and pending streak grows across days
    },
    visit: {
      'PETER|2026-11-03': {
        ok: true,
        outlet: 'NKPM',
        f: '08:30',
        t: '13:00',
        n: 'Stock Opname — Cek rak',
        entries: [
          {
            id: 'v1',
            outlet: 'NKPM',
            f: '08:30',
            t: '13:00',
            n: 'Stock Opname — Cek rak',
          },
          {
            id: 'v2',
            outlet: '',
            f: '14:00',
            t: '15:30',
            n: 'Meeting',
          },
        ],
      },
    },
  };

  const emptyWs: OutletStoreState = { start: '2026-11-01', ent: {}, visit: {} };
  const allWorkspaces: Record<OperationalRoleId, OutletStoreState> = {
    stock_accounting: saWorkspace,
    gl: emptyWs,
    accounting: emptyWs,
  };

  const inputLogs: InputLogEntry[] = [
    {
      id: 'log_1',
      uid: 'u1',
      userEmail: 'peter@company.com',
      userName: 'Peter',
      userRole: 'stock_accounting',
      roleId: 'stock_accounting',
      roleLabel: 'Stock Accounting',
      actionType: 'input_harian',
      pic: 'PETER',
      outlet: 'NKPM',
      day: '2026-11-02',
      details: 'HAM SPC: 02 Nov 2026',
      itemCount: 1,
      clientTs: '2026-11-02T03:00:00.000Z',
      taskKey: 'ham',
      prevDate: '',
      newDate: '2026-11-02',
      prevNote: '',
      newNote: 'Awal',
      action: 'set',
    },
    {
      id: 'log_2',
      uid: 'u1',
      userEmail: 'peter@company.com',
      userName: 'Peter',
      userRole: 'stock_accounting',
      roleId: 'stock_accounting',
      roleLabel: 'Stock Accounting',
      actionType: 'input_harian',
      pic: 'PETER',
      outlet: 'NKPM',
      day: '2026-11-02',
      details: 'HAM SPC: 02 Nov 2026 (Susulan)',
      itemCount: 1,
      clientTs: '2026-11-05T02:00:00.000Z',
      taskKey: 'ham',
      prevDate: '2026-11-02',
      newDate: '2026-11-02',
      prevNote: 'Awal',
      newNote: 'Susulan',
      action: 'edit',
    },
  ];

  const savedRecords: SavedRecord[] = [
    {
      id: 'SA26110001',
      refCode: 'SA26110001',
      prefix: 'SA',
      yymm: '2611',
      department: 'stock_accounting',
      date: '2026-11-03',
      pic: 'PETER',
      outlet: 'NKPM',
      summary: '[Input Harian] HAM SPC',
      notes: 'Selesai',
      createdBy: 'u1',
      updatedBy: 'u1',
      createdByEmail: 'peter@company.com',
      createdByName: 'Peter',
      createdAtIso: '2026-11-03T05:00:00.000Z',
      updatedAtIso: '2026-11-03T05:00:00.000Z',
    },
  ];

  const calendarEvents: CalendarEvent[] = [
    {
      id: 'evt_1',
      title: 'Briefing Closing',
      date: '2026-11-02',
      startTime: '09:00',
      visibleTo: ['stock_accounting', 'gl'],
      notes: 'Semua PIC',
      repeatFreq: 'daily',
      repeatInterval: 2,
      repeatUntil: '2026-11-06',
      createdBy: 'u_admin',
      updatedBy: 'u_admin',
      createdByEmail: 'admin@company.com',
      createdByName: 'Admin',
    },
  ];

  const managedAccounts: AccountProfile[] = [
    {
      id: 'peter_at_company_dot_com',
      email: 'peter@company.com',
      name: 'Peter',
      role: 'stock_accounting',
      picName: 'PETER',
      active: true,
    },
  ];

  return {
    today,
    availableDays,
    roleConfigs,
    allWorkspaces,
    inputLogs,
    savedRecords,
    calendarEvents,
    managedAccounts,
  };
}

describe('exportDataset star schema, parity invariants, CSV presets, and ZIP builder', () => {
  it('produces strict ISO dates, numeric numbers, 0/1 flags, and exact parity with calcTask & calcRecap', () => {
    const f = makeFixture();
    const ds = buildDataset({
      roleFilter: 'ALL',
      roleConfigs: f.roleConfigs,
      allWorkspaces: f.allWorkspaces,
      inputLogs: f.inputLogs,
      savedRecords: f.savedRecords,
      calendarEvents: f.calendarEvents,
      managedAccounts: f.managedAccounts,
      availableDays: f.availableDays,
      today: f.today,
    });

    assert.equal(ds.workingDaysCount, 4); // 2026-11-02..2026-11-05 (<= today)
    assert.equal(ds.orderedTables.length, 9);

    const taskRows = ds.tables.fact_task_harian.rows;
    const picRows = ds.tables.fact_pic_harian.rows;
    assert.equal(taskRows.length, 4 * 2 * 2); // 4 days x 2 outlets x 2 tasks = 16
    assert.equal(picRows.length, 4 * 2); // 4 days x 2 PICs = 8

    // Invariant 1: Sum of pending in fact_task_harian === sum of slot_pending in fact_pic_harian
    const sumTaskPending = taskRows.reduce((s, r) => s + Number(r.pending), 0);
    const sumPicPending = picRows.reduce((s, r) => s + Number(r.slot_pending), 0);
    assert.equal(sumTaskPending, sumPicPending);

    // Invariant 2: Every row's selisih matches calcTask & calcRecap, and flags/types are strictly normalized
    const saCfg = f.roleConfigs.stock_accounting;
    const saWs = f.allWorkspaces.stock_accounting;
    const calcDays = f.availableDays.filter((d) => d <= f.today);
    for (const row of taskRows) {
      assert.match(String(row.tanggal), /^\d{4}-\d{2}-\d{2}$/);
      assert.match(String(row.bulan), /^\d{4}-\d{2}$/);
      assert.match(String(row.minggu_mulai), /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(typeof row.selisih, 'number');
      assert.ok(row.pending === 0 || row.pending === 1);
      assert.ok(row.belum_input === 0 || row.belum_input === 1);
      assert.ok(row.by_admin === 0 || row.by_admin === 1);

      const expectedTask = calcTask(
        saWs,
        calcDays,
        saCfg.tasks,
        String(row.outlet),
        String(row.tanggal),
        String(row.task_key),
        f.today
      );
      const expectedRecap = calcRecap(
        saWs,
        calcDays,
        saCfg.tasks,
        String(row.outlet),
        String(row.pic),
        String(row.task_key),
        String(row.tanggal),
        f.today,
        String(row.tanggal)
      );
      assert.equal(row.selisih, expectedTask.pm);
      assert.equal(row.selisih, expectedRecap.avg);
      assert.equal(row.pending, expectedTask.pend ? 1 : 0);
    }

    // Verify backfill_hari, jeda_input_hari_kerja, and WIB clock on NKPM 2026-11-02 ham
    const nkpmHamNov2 = taskRows.find(
      (r) => r.outlet === 'NKPM' && r.tanggal === '2026-11-02' && r.task_key === 'ham'
    );
    assert.ok(nkpmHamNov2);
    assert.equal(nkpmHamNov2.backfill_hari, 2);
    assert.equal(nkpmHamNov2.jeda_input_hari_kerja, 3);
    assert.equal(nkpmHamNov2.input_jam_wib, '09:00:00');
    assert.equal(nkpmHamNov2.sumber, 'own');

    // Verify streak_pending grows across consecutive pending days for SKCP
    const skcpHamNov5 = taskRows.find(
      (r) => r.outlet === 'SKCP' && r.tanggal === '2026-11-05' && r.task_key === 'ham'
    );
    assert.ok(skcpHamNov5);
    assert.equal(skcpHamNov5.streak_pending, 4);
    assert.equal(skcpHamNov5.belum_input, 1);

    // Verify visit durations & categories
    const kunjunganRows = ds.tables.fact_kunjungan.rows;
    assert.equal(kunjunganRows.length, 2);
    assert.equal(kunjunganRows[0].durasi_menit, 270); // 08:30 -> 13:00
    assert.equal(kunjunganRows[0].kategori, 'Stock Opname');
    assert.equal(kunjunganRows[1].durasi_menit, 90); // 14:00 -> 15:30
    assert.equal(kunjunganRows[1].outlet, '');

    // Verify Priority 4 revision tracking columns in fact_input_log
    const logRows = ds.tables.fact_input_log.rows;
    assert.equal(logRows.length, 2);
    assert.equal(logRows[0].task_key, 'ham');
    assert.equal(logRows[0].aksi, 'set');
    assert.equal(logRows[0].revisi_ke, 1);
    assert.equal(logRows[1].aksi, 'edit');
    assert.equal(logRows[1].revisi_ke, 2);
    assert.equal(logRows[1].nilai_lama, '2026-11-02');
    assert.equal(logRows[1].catatan_baru, 'Susulan');

    // Verify Priority 2 tables: fact_saved_record, dim_kalender, dim_akun
    assert.equal(ds.tables.fact_saved_record.rows.length, 1);
    assert.equal(ds.tables.fact_saved_record.rows[0].ref_code, 'SA26110001');
    assert.equal(ds.tables.dim_kalender.rows.length, 2); // daily interval=2 in 2026-11-02..2026-11-05 -> Nov 2, Nov 4
    assert.equal(ds.tables.dim_kalender.rows[0].is_recurring, 1);
    assert.equal(ds.tables.dim_akun.rows.length, 1);
    assert.deepEqual(Object.keys(ds.tables.dim_akun.rows[0]), [
      'email',
      'nama',
      'role',
      'pic_name',
      'active',
    ]);
    assert.equal(ds.tables.dim_akun.rows[0].active, 1);
  });

  it('formats Excel Indonesia CSV with UTF-8 BOM, semicolon delimiter, and comma decimal without mangling negatives', () => {
    const f = makeFixture();
    // Make NKPM have an odd sum of selisih on 2026-11-02 (-1 + -2 => avg -1.5)
    f.allWorkspaces.stock_accounting.ent.NKPM['2026-11-02|memo'] = {
      d: '2026-09',
      n: 'Telat 1 bln',
      ts: '2026-11-02T03:00:00.000Z',
    };
    const ds = buildDataset({
      roleFilter: 'ALL',
      roleConfigs: f.roleConfigs,
      allWorkspaces: f.allWorkspaces,
      inputLogs: f.inputLogs,
      availableDays: f.availableDays,
      today: f.today,
    });

    assert.equal(escapeCsvCell(-1.25, CSV_PRESET_OPTIONS.excel_id), '-1,25');
    const csv = datasetTableToCsv(
      ds.tables.fact_pic_harian,
      CSV_PRESET_OPTIONS.excel_id
    );
    assert.ok(csv.startsWith('\uFEFF'), 'Excel ID CSV must start with UTF-8 BOM');
    const lines = csv.slice(1).split('\r\n');
    assert.ok(lines[0].includes(';'));
    assert.ok(lines[0].startsWith('role_id;role_label;pic;tanggal'));
    assert.ok(
      lines.slice(1).some((line) => /;-1,5;/.test(line)),
      `Negative decimals should use comma separator cleanly in: ${lines.slice(1).join(' | ')}`
    );
  });

  it('builds a valid STORE-mode ZIP archive verified by unzip -t', () => {
    const f = makeFixture();
    const ds = buildDataset({
      roleFilter: 'ALL',
      roleConfigs: f.roleConfigs,
      allWorkspaces: f.allWorkspaces,
      inputLogs: f.inputLogs,
      savedRecords: f.savedRecords,
      calendarEvents: f.calendarEvents,
      managedAccounts: f.managedAccounts,
      availableDays: f.availableDays,
      today: f.today,
    });

    const ids = ds.orderedTables.map((t) => t.id);
    const zipEntries = [
      ...ids.map((id) => ({
        name: `${id}.csv`,
        content: datasetTableToCsv(ds.tables[id], CSV_PRESET_OPTIONS.excel_id),
      })),
      {
        name: 'README.txt',
        content: buildDatasetReadme(ds, ids, CSV_PRESET_OPTIONS.excel_id),
      },
    ];

    const zipBytes = buildZip(zipEntries);
    // Check ZIP magic bytes
    assert.equal(zipBytes[0], 0x50);
    assert.equal(zipBytes[1], 0x4b);
    assert.equal(zipBytes[2], 0x03);
    assert.equal(zipBytes[3], 0x04);

    const tmpFile = path.join(os.tmpdir(), `outlet-dataset-test-${Date.now()}.zip`);
    fs.writeFileSync(tmpFile, zipBytes);
    try {
      const out = execFileSync('unzip', ['-t', tmpFile], { encoding: 'utf8' });
      assert.match(out, /No errors detected in compressed data/);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

describe('Priority 3 data accuracy fixes', () => {
  it('captures empty-outlet visits as (tanpa outlet) in bulanan_visit_category', () => {
    const f = makeFixture();
    const monthOpt = buildMonthOptions(f.availableDays)[0];
    const report = buildExportReport({
      reportId: 'bulanan_visit_category',
      roleFilter: 'stock_accounting',
      roleConfigs: f.roleConfigs,
      allWorkspaces: f.allWorkspaces,
      inputLogs: f.inputLogs,
      availableDays: f.availableDays,
      today: f.today,
      targetDay: f.today,
      dateMode: 'single',
      rangeFrom: f.availableDays[0],
      rangeTo: f.today,
      monthOption: monthOpt,
      picFilter: 'ALL',
      outletFilter: 'ALL',
      statusFilter: 'ALL',
      searchQuery: '',
    });

    const noOutletRow = report.rows.find(
      (r) => r.cells[2] === 'PETER' && r.cells[3] === '(tanpa outlet)'
    );
    assert.ok(noOutletRow, 'Empty-outlet visit should appear under (tanpa outlet)');
    assert.equal(noOutletRow.cells[report.columns.length - 1], 1);
  });

  it('formats fmtDateTimeWithSeconds strictly in WIB (UTC+7) matching toWibIsoDate', () => {
    // 2026-11-02T18:30:45Z is 2026-11-03 01:30:45 WIB (+7)
    const ts = '2026-11-02T18:30:45.000Z';
    assert.equal(toWibIsoDate(ts), '2026-11-03');
    const formatted = fmtDateTimeWithSeconds(ts);
    assert.ok(formatted.includes('03'), `Expected day 03 WIB in "${formatted}"`);
    assert.ok(formatted.endsWith('01:30:45'), `Expected 01:30:45 WIB in "${formatted}"`);
  });
});
