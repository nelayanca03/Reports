import {
  AccountProfile,
  CalendarEvent,
  InputLogEntry,
  OperationalRoleId,
  OutletStoreState,
  RoleConfig,
  SavedRecord,
} from '../types/outlet';
import { classifyVisitCategory } from './exportReports';
import {
  OPERATIONAL_ROLES,
  buildMonthWorkingDays,
  buildMonthsWorkingDays,
  calcRecap,
  calcTask,
  diffWorkingDays,
  escapeCsvCell,
  expandCalendarEventsForRange,
  getPersonList,
  getSelectableMonths,
  getTaskInputType,
  getTaskTolerance,
  getVisitEntries,
  isSunday,
  parseUtcDate,
  toWibIsoDate,
  toWibTimeString,
  weekStartIso,
} from './outletLogic';

export type DatasetTableId =
  | 'fact_task_harian'
  | 'fact_pic_harian'
  | 'fact_kunjungan'
  | 'fact_input_log'
  | 'dim_outlet'
  | 'dim_task'
  | 'fact_saved_record'
  | 'dim_kalender'
  | 'dim_akun';

export type DatasetCellValue = string | number;

export interface DatasetTable {
  id: DatasetTableId;
  label: string;
  group: 'fact' | 'dim';
  description: string;
  columns: string[];
  rows: Array<Record<string, DatasetCellValue>>;
}

export interface DatasetTableMeta {
  id: DatasetTableId;
  label: string;
  group: 'fact' | 'dim';
  description: string;
}

export const DATASET_TABLE_DEFINITIONS: DatasetTableMeta[] = [
  {
    id: 'fact_task_harian',
    label: 'fact_task_harian',
    group: 'fact',
    description:
      'Observasi harian per hari kerja × outlet × tugas (selisih, pending, streak, jeda input WIB, backfill).',
  },
  {
    id: 'fact_pic_harian',
    label: 'fact_pic_harian',
    group: 'fact',
    description:
      'Ringkasan harian per PIC: total slot, slot pending/update, % kepatuhan, rata-rata selisih, kunjungan.',
  },
  {
    id: 'fact_kunjungan',
    label: 'fact_kunjungan',
    group: 'fact',
    description:
      'Detail entri kunjungan lapangan per PIC & hari (outlet, jam mulai-selesai, durasi menit, kategori).',
  },
  {
    id: 'fact_input_log',
    label: 'fact_input_log',
    group: 'fact',
    description:
      'Audit log riwayat penginputan & revisi terstruktur per item (nilai_lama, nilai_baru, aksi, revisi_ke).',
  },
  {
    id: 'dim_outlet',
    label: 'dim_outlet',
    group: 'dim',
    description: 'Tabel dimensi master outlet dan penugasan PIC per departemen.',
  },
  {
    id: 'dim_task',
    label: 'dim_task',
    group: 'dim',
    description: 'Tabel dimensi definisi tugas, tipe input, rumus, toleransi, dan dependensi.',
  },
  {
    id: 'fact_saved_record',
    label: 'fact_saved_record',
    group: 'fact',
    description: 'Data record tersimpan dengan nomor referensi atomik SA/GL.',
  },
  {
    id: 'dim_kalender',
    label: 'dim_kalender',
    group: 'dim',
    description: 'Agenda & rapat kalender yang sudah diurai per tanggal kemunculan (termasuk event berulang).',
  },
  {
    id: 'dim_akun',
    label: 'dim_akun',
    group: 'dim',
    description: 'Daftar akun pengguna aktif/non-aktif (hanya kolom non-sensitif: email, nama, role, picName, active).',
  },
];

export interface BuildDatasetParams {
  roleFilter: 'ALL' | OperationalRoleId;
  roleConfigs: Record<OperationalRoleId, RoleConfig>;
  allWorkspaces: Record<OperationalRoleId, OutletStoreState>;
  inputLogs: InputLogEntry[];
  savedRecords?: SavedRecord[];
  calendarEvents?: CalendarEvent[];
  managedAccounts?: AccountProfile[];
  availableDays: string[];
  today: string;
  dateFrom?: string;
  dateTo?: string;
  picFilter?: string;
  outletFilter?: string;
}

export interface BuiltDataset {
  generatedAtIso: string;
  periodStart: string;
  periodEnd: string;
  workingDaysCount: number;
  tables: Record<DatasetTableId, DatasetTable>;
  orderedTables: DatasetTable[];
}

export interface CsvExportOptions {
  delimiter: ',' | ';';
  decimalSeparator: '.' | ',';
  bom: boolean;
}

export type CsvPresetId = 'excel_id' | 'standard';

export const CSV_PRESET_OPTIONS: Record<CsvPresetId, CsvExportOptions> = {
  excel_id: { delimiter: ';', decimalSeparator: ',', bom: true },
  standard: { delimiter: ',', decimalSeparator: '.', bom: false },
};

const WEEKDAY_SHORT_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function getWeekdayShort(isoDate: string): string {
  const d = parseUtcDate(isoDate);
  if (Number.isNaN(d.getTime())) return '';
  return WEEKDAY_SHORT_ID[d.getUTCDay()] || '';
}

function calcDurationMinutes(fromTime: string, toTime: string): number {
  if (!fromTime || !toTime) return 0;
  const [fh, fm] = fromTime.split(':').map(Number);
  const [th, tm] = toTime.split(':').map(Number);
  if ([fh, fm, th, tm].some((n) => Number.isNaN(n))) return 0;
  const diff = th * 60 + tm - (fh * 60 + fm);
  return diff > 0 ? diff : 0;
}

function buildMonthWorkingDayIndexMap(days: string[]): Map<string, number> {
  const indexMap = new Map<string, number>();
  const monthsSeen = new Set(days.map((d) => d.slice(0, 7)));
  for (const monthKey of monthsSeen) {
    const mDays = buildMonthWorkingDays(monthKey);
    mDays.forEach((d, idx) => {
      indexMap.set(d, idx + 1);
    });
  }
  return indexMap;
}

export function buildDataset(params: BuildDatasetParams): BuiltDataset {
  const {
    roleFilter,
    roleConfigs,
    allWorkspaces,
    inputLogs,
    savedRecords = [],
    calendarEvents = [],
    managedAccounts = [],
    availableDays,
    today,
    dateFrom,
    dateTo,
    picFilter = 'ALL',
    outletFilter = 'ALL',
  } = params;

  const baseWorkingDays = (
    availableDays.length > 0
      ? availableDays
      : buildMonthsWorkingDays(getSelectableMonths(today))
  )
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isSunday(d) && d <= today)
    .sort();

  const rawFrom = (dateFrom || '').trim();
  const rawTo = (dateTo || '').trim();
  const effFrom = rawFrom && rawTo && rawFrom > rawTo ? rawTo : rawFrom;
  const effTo = rawFrom && rawTo && rawFrom > rawTo ? rawFrom : rawTo;

  const evalDays = baseWorkingDays.filter(
    (d) => (!effFrom || d >= effFrom) && (!effTo || d <= effTo)
  );
  const evalDaysSet = new Set(evalDays);
  const maxEvalDay = evalDays[evalDays.length - 1] || '';
  const allDaysUpToMax = maxEvalDay
    ? baseWorkingDays.filter((d) => d <= maxEvalDay)
    : [];

  const targetRoles: OperationalRoleId[] =
    roleFilter === 'ALL' ? OPERATIONAL_ROLES.map((r) => r.id) : [roleFilter];

  const monthWorkingDayIndexMap = buildMonthWorkingDayIndexMap(baseWorkingDays);

  // ==================== 1. dim_outlet & 2. dim_task ====================
  const dimOutletRows: Array<Record<string, DatasetCellValue>> = [];
  const dimTaskRows: Array<Record<string, DatasetCellValue>> = [];

  for (const rId of targetRoles) {
    const cfg = roleConfigs[rId];
    if (!cfg) continue;

    cfg.outlets.forEach((o, idx) => {
      if (picFilter !== 'ALL' && o.person !== picFilter) return;
      if (outletFilter !== 'ALL' && o.code !== outletFilter) return;
      dimOutletRows.push({
        role_id: rId,
        role_label: cfg.label,
        outlet_code: o.code,
        pic: o.person,
        urutan_outlet: idx + 1,
      });
    });

    cfg.tasks.forEach((t, idx) => {
      dimTaskRows.push({
        role_id: rId,
        role_label: cfg.label,
        task_key: t.key,
        task_label: t.label,
        short_label: t.shortLabel || t.label,
        tipe_input: getTaskInputType(t),
        formula_type: t.formulaType,
        tolerance_offset: getTaskTolerance(t),
        ref_task_key: t.refTaskKey || '',
        formula_note: t.formulaNote || '',
        urutan_tugas: idx + 1,
      });
    });
  }

  // ==================== 3. fact_task_harian & 4. fact_pic_harian ====================
  const factTaskRows: Array<Record<string, DatasetCellValue>> = [];
  const factPicRows: Array<Record<string, DatasetCellValue>> = [];

  for (const rId of targetRoles) {
    const cfg = roleConfigs[rId];
    const ws = allWorkspaces[rId];
    if (!cfg || !ws) continue;

    const scopedOutlets = cfg.outlets.filter(
      (o) =>
        (picFilter === 'ALL' || o.person === picFilter) &&
        (outletFilter === 'ALL' || o.code === outletFilter)
    );

    // Precompute streak_pending across chronological working days up to maxEvalDay
    // using the exact existing calcTask helper.
    for (const { code: outlet, person } of scopedOutlets) {
      for (const task of cfg.tasks) {
        let streak = 0;
        const inputType = getTaskInputType(task);
        for (const d of allDaysUpToMax) {
          const c = calcTask(ws, baseWorkingDays, cfg.tasks, outlet, d, task.key, today);
          streak = c.pend ? streak + 1 : 0;
          if (!evalDaysSet.has(d)) continue;

          const tsDateWib = c.ts ? toWibIsoDate(c.ts) : '';
          const jedaInputHariKerja: DatasetCellValue =
            c.d && c.ts && c.source === 'own' && c.sourceDay && tsDateWib
              ? diffWorkingDays(tsDateWib, c.sourceDay)
              : '';

          factTaskRows.push({
            role_id: rId,
            role_label: cfg.label,
            pic: person,
            outlet,
            task_key: task.key,
            task_label: task.label,
            tipe_input: inputType,
            formula_type: task.formulaType,
            tanggal: d,
            bulan: d.slice(0, 7),
            minggu_mulai: weekStartIso(d),
            hari: getWeekdayShort(d),
            hari_kerja_ke: monthWorkingDayIndexMap.get(d) || 0,
            tgl_update: c.d || '',
            rumus_tgl: c.rumus || '',
            selisih: c.pm,
            pending: c.pend ? 1 : 0,
            belum_input: c.d ? 0 : 1,
            streak_pending: streak,
            input_jam_wib: c.ts ? toWibTimeString(c.ts) : '',
            jeda_input_hari_kerja: jedaInputHariKerja,
            backfill_hari: c.backfillDays || 0,
            sumber: c.source,
            sumber_hari: c.sourceDay || '',
            by_admin: c.byAdmin ? 1 : 0,
            keterangan: c.n || '',
          });
        }
      }
    }

    // Build fact_pic_harian via calcRecap on each working day so pending & selisih
    // remain mathematically identical to Rekap/Ranking and fact_task_harian.
    const personList = getPersonList(scopedOutlets);
    for (const d of evalDays) {
      for (const person of personList) {
        const picOutlets = scopedOutlets
          .filter((o) => o.person === person)
          .map((o) => o.code);
        if (picOutlets.length === 0) continue;

        let slotUpdate = 0;
        let slotPending = 0;
        let slotBelumInput = 0;
        let backfillSlot = 0;
        let sumSelisih = 0;

        for (const outlet of picOutlets) {
          for (const task of cfg.tasks) {
            const recap = calcRecap(
              ws,
              baseWorkingDays,
              cfg.tasks,
              outlet,
              person,
              task.key,
              d,
              today,
              d
            );
            const c = calcTask(ws, baseWorkingDays, cfg.tasks, outlet, d, task.key, today);
            sumSelisih += recap.avg;
            if (recap.pend > 0) {
              slotPending += 1;
            } else {
              slotUpdate += 1;
            }
            if (!c.d) {
              slotBelumInput += 1;
            }
            if (recap.backfillCount > 0) {
              backfillSlot += 1;
            }
          }
        }

        const totalSlot = picOutlets.length * cfg.tasks.length;
        const compliancePct =
          totalSlot > 0 ? Number(((slotUpdate / totalSlot) * 100).toFixed(2)) : 0;
        const avgSelisih =
          totalSlot > 0 ? Number((sumSelisih / totalSlot).toFixed(4)) : 0;

        const v = ws.visit[`${person}|${d}`];
        const vEntries = v?.ok
          ? getVisitEntries(v).filter(
              (entry) => outletFilter === 'ALL' || (entry.outlet || '') === outletFilter
            )
          : [];
        const visitOk =
          v?.ok && (outletFilter === 'ALL' || vEntries.length > 0) ? 1 : 0;
        const jumlahKunjungan = visitOk
          ? outletFilter === 'ALL'
            ? Math.max(1, getVisitEntries(v).length)
            : vEntries.length
          : 0;

        factPicRows.push({
          role_id: rId,
          role_label: cfg.label,
          pic: person,
          tanggal: d,
          bulan: d.slice(0, 7),
          minggu_mulai: weekStartIso(d),
          hari: getWeekdayShort(d),
          hari_kerja_ke: monthWorkingDayIndexMap.get(d) || 0,
          jumlah_outlet: picOutlets.length,
          jumlah_tugas: cfg.tasks.length,
          total_slot: totalSlot,
          slot_update: slotUpdate,
          slot_pending: slotPending,
          slot_belum_input: slotBelumInput,
          compliance_pct: compliancePct,
          avg_selisih: avgSelisih,
          backfill_slot: backfillSlot,
          visit_ok: visitOk,
          jumlah_kunjungan: jumlahKunjungan,
        });
      }
    }
  }

  // Sort fact_task_harian cleanly by tanggal -> role -> pic -> outlet
  factTaskRows.sort(
    (a, b) =>
      String(a.tanggal).localeCompare(String(b.tanggal)) ||
      String(a.role_id).localeCompare(String(b.role_id)) ||
      String(a.pic).localeCompare(String(b.pic)) ||
      String(a.outlet).localeCompare(String(b.outlet)) ||
      String(a.task_key).localeCompare(String(b.task_key))
  );

  // ==================== 5. fact_kunjungan ====================
  const factKunjunganRows: Array<Record<string, DatasetCellValue>> = [];
  for (const rId of targetRoles) {
    const cfg = roleConfigs[rId];
    const ws = allWorkspaces[rId];
    if (!cfg || !ws) continue;
    const personList = getPersonList(cfg.outlets);
    for (const d of evalDays) {
      for (const person of personList) {
        if (picFilter !== 'ALL' && person !== picFilter) continue;
        const v = ws.visit[`${person}|${d}`];
        if (!v?.ok) continue;
        const entries = getVisitEntries(v);
        const rowsToEmit =
          entries.length > 0
            ? entries
            : [{ id: 'v_1', outlet: v.outlet || '', f: v.f || '', t: v.t || '', n: v.n || '' }];
        const totalToday = Math.max(1, rowsToEmit.length);

        rowsToEmit.forEach((entry, idx) => {
          if (outletFilter !== 'ALL' && (entry.outlet || '') !== outletFilter) return;
          factKunjunganRows.push({
            role_id: rId,
            role_label: cfg.label,
            pic: person,
            tanggal: d,
            bulan: d.slice(0, 7),
            minggu_mulai: weekStartIso(d),
            hari: getWeekdayShort(d),
            urutan_kunjungan: idx + 1,
            outlet: entry.outlet || '',
            jam_mulai: entry.f || '',
            jam_selesai: entry.t || '',
            durasi_menit: calcDurationMinutes(entry.f, entry.t),
            kategori: classifyVisitCategory(entry.n || ''),
            keterangan: entry.n || '',
            total_kunjungan_hari_ini: totalToday,
          });
        });
      }
    }
  }

  // ==================== 6. fact_input_log ====================
  const filteredLogs = inputLogs
    .filter((log) => {
      if (roleFilter !== 'ALL' && log.roleId !== roleFilter) return false;
      if (picFilter !== 'ALL' && log.pic !== picFilter) return false;
      if (outletFilter !== 'ALL') {
        const outlets = log.outlet
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (!outlets.includes(outletFilter)) return false;
      }
      if (effFrom && log.day < effFrom) return false;
      if (effTo && log.day > effTo) return false;
      return true;
    })
    .sort(
      (a, b) =>
        a.clientTs.localeCompare(b.clientTs) || a.id.localeCompare(b.id)
    );

  const revisionCountMap = new Map<string, number>();
  const factInputLogRows: Array<Record<string, DatasetCellValue>> = filteredLogs.map((log) => {
    const revKey = `${log.roleId}|${log.outlet}|${log.day}|${log.taskKey || log.actionType}`;
    const revisiKe = (revisionCountMap.get(revKey) || 0) + 1;
    revisionCountMap.set(revKey, revisiKe);
    return {
      log_id: log.id,
      client_ts: log.clientTs,
      tanggal_input_wib: toWibIsoDate(log.clientTs),
      jam_input_wib: toWibTimeString(log.clientTs),
      role_id: log.roleId,
      role_label: log.roleLabel,
      action_type: log.actionType,
      user_email: log.userEmail,
      user_name: log.userName,
      user_role: log.userRole,
      pic: log.pic,
      outlet: log.outlet,
      tanggal_kerja: log.day,
      bulan_kerja: log.day ? log.day.slice(0, 7) : '',
      task_key: log.taskKey || '',
      nilai_lama: log.prevDate || '',
      nilai_baru: log.newDate || '',
      catatan_lama: log.prevNote || '',
      catatan_baru: log.newNote || '',
      aksi: log.action || '',
      revisi_ke: revisiKe,
      item_count: Number(log.itemCount || 1),
      details: log.details,
    };
  });

  // ==================== 7. fact_saved_record ====================
  const factSavedRecordRows: Array<Record<string, DatasetCellValue>> = savedRecords
    .filter((rec) => {
      if (roleFilter !== 'ALL' && rec.department !== roleFilter) return false;
      if (picFilter !== 'ALL' && rec.pic !== picFilter) return false;
      if (outletFilter !== 'ALL' && rec.outlet !== outletFilter) return false;
      if (effFrom && rec.date < effFrom) return false;
      if (effTo && rec.date > effTo) return false;
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.refCode.localeCompare(b.refCode))
    .map((rec) => ({
      record_id: rec.id,
      ref_code: rec.refCode,
      prefix: rec.prefix,
      yymm: rec.yymm,
      department: rec.department,
      tanggal: rec.date,
      bulan: rec.date ? rec.date.slice(0, 7) : '',
      pic: rec.pic,
      outlet: rec.outlet,
      summary: rec.summary,
      notes: rec.notes,
      created_by_email: rec.createdByEmail,
      created_by_name: rec.createdByName,
      created_at_iso: rec.createdAtIso || '',
      updated_at_iso: rec.updatedAtIso || '',
    }));

  // ==================== 8. dim_kalender ====================
  const calStart = effFrom || evalDays[0] || baseWorkingDays[0] || today;
  const calEnd = effTo || evalDays[evalDays.length - 1] || baseWorkingDays[baseWorkingDays.length - 1] || today;
  const scopedEvents = calendarEvents.filter(
    (evt) => roleFilter === 'ALL' || evt.visibleTo.includes(roleFilter)
  );
  const expandedCal =
    calStart && calEnd && calStart <= calEnd
      ? expandCalendarEventsForRange(scopedEvents, calStart, calEnd)
      : [];

  const dimKalenderRows: Array<Record<string, DatasetCellValue>> = expandedCal.map((occ) => ({
    event_id: occ.event.id,
    occurrence_date: occ.occurrenceDate,
    bulan: occ.occurrenceDate.slice(0, 7),
    hari: getWeekdayShort(occ.occurrenceDate),
    start_time: occ.event.startTime,
    title: occ.event.title,
    visible_to: occ.event.visibleTo.join('|'),
    visible_to_count: occ.event.visibleTo.length,
    is_recurring: occ.isRecurring ? 1 : 0,
    repeat_freq: occ.event.repeatFreq || 'none',
    notes: occ.event.notes || '',
    created_by_email: occ.event.createdByEmail,
    created_by_name: occ.event.createdByName,
  }));

  // ==================== 9. dim_akun (non-sensitive fields only) ====================
  const dimAkunRows: Array<Record<string, DatasetCellValue>> = managedAccounts
    .filter((acc) => {
      if (roleFilter !== 'ALL' && acc.role !== roleFilter && acc.role !== 'admin') return false;
      if (picFilter !== 'ALL' && acc.picName !== picFilter) return false;
      return true;
    })
    .map((acc) => ({
      email: acc.email,
      nama: acc.name,
      role: acc.role,
      pic_name: acc.picName || '',
      active: acc.active ? 1 : 0,
    }));

  const tables: Record<DatasetTableId, DatasetTable> = {
    fact_task_harian: {
      id: 'fact_task_harian',
      label: 'fact_task_harian',
      group: 'fact',
      description: DATASET_TABLE_DEFINITIONS[0].description,
      columns: [
        'role_id',
        'role_label',
        'pic',
        'outlet',
        'task_key',
        'task_label',
        'tipe_input',
        'formula_type',
        'tanggal',
        'bulan',
        'minggu_mulai',
        'hari',
        'hari_kerja_ke',
        'tgl_update',
        'rumus_tgl',
        'selisih',
        'pending',
        'belum_input',
        'streak_pending',
        'input_jam_wib',
        'jeda_input_hari_kerja',
        'backfill_hari',
        'sumber',
        'sumber_hari',
        'by_admin',
        'keterangan',
      ],
      rows: factTaskRows,
    },
    fact_pic_harian: {
      id: 'fact_pic_harian',
      label: 'fact_pic_harian',
      group: 'fact',
      description: DATASET_TABLE_DEFINITIONS[1].description,
      columns: [
        'role_id',
        'role_label',
        'pic',
        'tanggal',
        'bulan',
        'minggu_mulai',
        'hari',
        'hari_kerja_ke',
        'jumlah_outlet',
        'jumlah_tugas',
        'total_slot',
        'slot_update',
        'slot_pending',
        'slot_belum_input',
        'compliance_pct',
        'avg_selisih',
        'backfill_slot',
        'visit_ok',
        'jumlah_kunjungan',
      ],
      rows: factPicRows,
    },
    fact_kunjungan: {
      id: 'fact_kunjungan',
      label: 'fact_kunjungan',
      group: 'fact',
      description: DATASET_TABLE_DEFINITIONS[2].description,
      columns: [
        'role_id',
        'role_label',
        'pic',
        'tanggal',
        'bulan',
        'minggu_mulai',
        'hari',
        'urutan_kunjungan',
        'outlet',
        'jam_mulai',
        'jam_selesai',
        'durasi_menit',
        'kategori',
        'keterangan',
        'total_kunjungan_hari_ini',
      ],
      rows: factKunjunganRows,
    },
    fact_input_log: {
      id: 'fact_input_log',
      label: 'fact_input_log',
      group: 'fact',
      description: DATASET_TABLE_DEFINITIONS[3].description,
      columns: [
        'log_id',
        'client_ts',
        'tanggal_input_wib',
        'jam_input_wib',
        'role_id',
        'role_label',
        'action_type',
        'user_email',
        'user_name',
        'user_role',
        'pic',
        'outlet',
        'tanggal_kerja',
        'bulan_kerja',
        'task_key',
        'nilai_lama',
        'nilai_baru',
        'catatan_lama',
        'catatan_baru',
        'aksi',
        'revisi_ke',
        'item_count',
        'details',
      ],
      rows: factInputLogRows,
    },
    dim_outlet: {
      id: 'dim_outlet',
      label: 'dim_outlet',
      group: 'dim',
      description: DATASET_TABLE_DEFINITIONS[4].description,
      columns: ['role_id', 'role_label', 'outlet_code', 'pic', 'urutan_outlet'],
      rows: dimOutletRows,
    },
    dim_task: {
      id: 'dim_task',
      label: 'dim_task',
      group: 'dim',
      description: DATASET_TABLE_DEFINITIONS[5].description,
      columns: [
        'role_id',
        'role_label',
        'task_key',
        'task_label',
        'short_label',
        'tipe_input',
        'formula_type',
        'tolerance_offset',
        'ref_task_key',
        'formula_note',
        'urutan_tugas',
      ],
      rows: dimTaskRows,
    },
    fact_saved_record: {
      id: 'fact_saved_record',
      label: 'fact_saved_record',
      group: 'fact',
      description: DATASET_TABLE_DEFINITIONS[6].description,
      columns: [
        'record_id',
        'ref_code',
        'prefix',
        'yymm',
        'department',
        'tanggal',
        'bulan',
        'pic',
        'outlet',
        'summary',
        'notes',
        'created_by_email',
        'created_by_name',
        'created_at_iso',
        'updated_at_iso',
      ],
      rows: factSavedRecordRows,
    },
    dim_kalender: {
      id: 'dim_kalender',
      label: 'dim_kalender',
      group: 'dim',
      description: DATASET_TABLE_DEFINITIONS[7].description,
      columns: [
        'event_id',
        'occurrence_date',
        'bulan',
        'hari',
        'start_time',
        'title',
        'visible_to',
        'visible_to_count',
        'is_recurring',
        'repeat_freq',
        'notes',
        'created_by_email',
        'created_by_name',
      ],
      rows: dimKalenderRows,
    },
    dim_akun: {
      id: 'dim_akun',
      label: 'dim_akun',
      group: 'dim',
      description: DATASET_TABLE_DEFINITIONS[8].description,
      columns: ['email', 'nama', 'role', 'pic_name', 'active'],
      rows: dimAkunRows,
    },
  };

  const orderedTables = DATASET_TABLE_DEFINITIONS.map((def) => tables[def.id]);

  return {
    generatedAtIso: new Date().toISOString(),
    periodStart: evalDays[0] || effFrom || '',
    periodEnd: maxEvalDay || effTo || '',
    workingDaysCount: evalDays.length,
    tables,
    orderedTables,
  };
}

export function datasetTableToCsv(
  table: DatasetTable,
  options: CsvExportOptions = CSV_PRESET_OPTIONS.excel_id
): string {
  const { delimiter, decimalSeparator, bom } = options;
  const headerLine = table.columns
    .map((c) => escapeCsvCell(c, { delimiter, decimalSeparator }))
    .join(delimiter);
  const bodyLines = table.rows.map((row) =>
    table.columns
      .map((col) => escapeCsvCell(row[col] ?? '', { delimiter, decimalSeparator }))
      .join(delimiter)
  );
  const csv = [headerLine, ...bodyLines].join('\r\n');
  return bom ? `\uFEFF${csv}` : csv;
}

export function buildDatasetReadme(
  dataset: BuiltDataset,
  includedIds: DatasetTableId[],
  options: CsvExportOptions
): string {
  const lines: string[] = [
    'UPDATE HARIAN OUTLET — PAKET DATASET MENTAH (STAR SCHEMA)',
    '==========================================================',
    `Dibuat pada    : ${dataset.generatedAtIso}`,
    `Periode data   : ${dataset.periodStart || '-'} s.d. ${dataset.periodEnd || '-'} (${dataset.workingDaysCount} hari kerja)`,
    `Format CSV     : delimiter "${options.delimiter}", pemisah desimal "${options.decimalSeparator}", UTF-8 BOM ${options.bom ? 'aktif' : 'nonaktif'}`,
    '',
    'ATURAN DATA:',
    '- Semua tanggal menggunakan format ISO YYYY-MM-DD (kecuali entri tugas bulanan YYYY-MM).',
    '- Semua nilai numerik murni angka (tanpa simbol "+", "%", atau "x").',
    '- Kolom flag biner menggunakan 1 (ya) / 0 (tidak).',
    '- Jam input menggunakan zona waktu WIB tetap (UTC+7).',
    '',
    'DAFTAR TABEL YANG DISERTAKAN:',
  ];

  for (const id of includedIds) {
    const t = dataset.tables[id];
    if (!t) continue;
    lines.push(`- ${t.id}.csv (${t.rows.length} baris, ${t.columns.length} kolom)`);
    lines.push(`  Deskripsi : ${t.description}`);
    lines.push(`  Kolom     : ${t.columns.join(', ')}`);
  }

  return `${lines.join('\r\n')}\r\n`;
}

// ==================== PURE-TS STORE-MODE ZIP BUILDER ====================

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const utf8Encoder = new TextEncoder();

function encodeDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const wib = new Date(date.getTime() + 7 * 3600 * 1000);
  const year = Math.max(1980, wib.getUTCFullYear());
  const month = wib.getUTCMonth() + 1;
  const day = wib.getUTCDate();
  const hours = wib.getUTCHours();
  const mins = wib.getUTCMinutes();
  const secs = Math.floor(wib.getUTCSeconds() / 2);
  const dosTime = (hours << 11) | (mins << 5) | secs;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

export interface ZipEntryInput {
  name: string;
  content: string | Uint8Array;
  mtime?: Date;
}

export function buildZip(entries: ZipEntryInput[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const nameBytes = utf8Encoder.encode(entry.name);
    const dataBytes =
      typeof entry.content === 'string'
        ? utf8Encoder.encode(entry.content)
        : entry.content;
    const checksum = crc32(dataBytes);
    const size = dataBytes.length;
    const { dosTime, dosDate } = encodeDosDateTime(entry.mtime || new Date());

    // Local file header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // compression method 0 (STORE)
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra field length
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    // Central directory header (46 bytes + filename)
    const cdHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 filename flag
    cv.setUint16(10, 0, true); // compression method 0 (STORE)
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, checksum, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra length
    cv.setUint16(32, 0, true); // comment length
    cv.setUint16(34, 0, true); // disk start
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, localOffset, true);
    cdHeader.set(nameBytes, 46);

    centralParts.push(cdHeader);
    localOffset += localHeader.length + dataBytes.length;
  }

  const centralDirSize = centralParts.reduce((sum, p) => sum + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, localOffset, true);
  ev.setUint16(20, 0, true);

  const totalSize = localOffset + centralDirSize + eocd.length;
  const out = new Uint8Array(totalSize);
  let cursor = 0;
  for (const part of localParts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  out.set(eocd, cursor);

  return out;
}

export function downloadBinaryFile(
  filename: string,
  bytes: Uint8Array,
  mimeType: string = 'application/zip'
) {
  const safeCopy = new Uint8Array(bytes.byteLength);
  safeCopy.set(bytes);
  const blob = new Blob([safeCopy.buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
