import {
  CheckSquare,
  Download,
  Eye,
  FileSpreadsheet,
  RefreshCw,
  RotateCcw,
  Square,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  AccountProfile,
  CalendarEvent,
  InputLogEntry,
  OperationalRoleId,
  OutletStoreState,
  RoleConfig,
  SavedRecord,
} from '../types/outlet';
import {
  DATASET_TABLE_DEFINITIONS,
  DatasetTableId,
  buildDataset,
} from '../utils/exportDataset';
import { XlsxSheetInput, downloadXlsxWorkbook } from '../utils/exportXlsx';
import {
  OPERATIONAL_ROLES,
  buildMonthsWorkingDays,
  currentMonthKey,
  fmtMonth,
  getPeopleMap,
  getPersonList,
  todayIso,
} from '../utils/outletLogic';
import { DateRangeFilterPopover } from './records/DateRangeFilterPopover';

interface AdminDatasetPanelProps {
  activeRoleId: OperationalRoleId;
  activeMonth: string;
  roleConfigs: Record<OperationalRoleId, RoleConfig>;
  allWorkspaces: Record<OperationalRoleId, OutletStoreState>;
  inputLogs: InputLogEntry[];
  savedRecords: SavedRecord[];
  calendarEvents: CalendarEvent[];
  managedAccounts: AccountProfile[];
  selectableMonths: string[];
  days: string[];
  serverLogsLoaded: boolean;
  serverLogsLoading: boolean;
  serverLogsProgress: number;
  serverLogsTruncated: boolean;
  onLoadAllLogs: () => Promise<void>;
}

const PREVIEW_LIMIT = 12;

export function AdminDatasetPanel({
  activeRoleId,
  activeMonth,
  roleConfigs,
  allWorkspaces,
  inputLogs,
  savedRecords,
  calendarEvents,
  managedAccounts,
  selectableMonths,
  days,
  serverLogsLoaded,
  serverLogsLoading,
  serverLogsProgress,
  serverLogsTruncated,
  onLoadAllLogs,
}: AdminDatasetPanelProps) {
  const today = todayIso();
  const curMonth = currentMonthKey(today);

  const scopedDays = useMemo(
    () => buildMonthsWorkingDays(selectableMonths),
    [selectableMonths]
  );

  const defaultFrom = days[0] || scopedDays[0] || today;
  const defaultTo =
    activeMonth === curMonth
      ? today
      : activeMonth < curMonth
        ? days[days.length - 1] || today
        : days[0] || today;

  const [roleFilter, setRoleFilter] = useState<'ALL' | OperationalRoleId>('ALL');
  const [picFilter, setPicFilter] = useState<string>('ALL');
  const [outletFilter, setOutletFilter] = useState<string>('ALL');
  const [periodPreset, setPeriodPreset] = useState<string>(activeMonth);
  const [dateFrom, setDateFrom] = useState<string>(defaultFrom);
  const [dateTo, setDateTo] = useState<string>(defaultTo);
  const [selectedTables, setSelectedTables] = useState<DatasetTableId[]>(() =>
    DATASET_TABLE_DEFINITIONS.map((t) => t.id)
  );
  const [previewTableId, setPreviewTableId] = useState<DatasetTableId>('fact_task_harian');
  const [notice, setNotice] = useState<string | null>(null);
  const [prevActiveMonth, setPrevActiveMonth] = useState<string>(activeMonth);

  if (prevActiveMonth !== activeMonth) {
    setPrevActiveMonth(activeMonth);
    setPeriodPreset(activeMonth);
    setDateFrom(defaultFrom);
    setDateTo(defaultTo);
  }

  const { picOptions, outletOptions, effectivePicFilter } = useMemo(() => {
    const rIds =
      roleFilter === 'ALL' ? OPERATIONAL_ROLES.map((r) => r.id) : [roleFilter];
    const pics = new Set<string>();
    const outlets = new Set<string>();
    for (const rId of rIds) {
      const cfg = roleConfigs[rId];
      for (const p of getPersonList(cfg.outlets)) pics.add(p);
    }
    const validPic = picFilter !== 'ALL' && pics.has(picFilter) ? picFilter : 'ALL';
    for (const rId of rIds) {
      const cfg = roleConfigs[rId];
      const pMap = getPeopleMap(cfg.outlets);
      if (validPic !== 'ALL') {
        for (const o of pMap[validPic] || []) outlets.add(o);
      } else {
        for (const item of cfg.outlets) outlets.add(item.code);
      }
    }
    return {
      picOptions: Array.from(pics).sort(),
      outletOptions: Array.from(outlets).sort(),
      effectivePicFilter: validPic,
    };
  }, [roleConfigs, roleFilter, picFilter]);

  const effectiveOutletFilter =
    outletFilter !== 'ALL' && !outletOptions.includes(outletFilter) ? 'ALL' : outletFilter;

  const dataset = useMemo(
    () =>
      buildDataset({
        roleFilter,
        roleConfigs,
        allWorkspaces,
        inputLogs,
        savedRecords,
        calendarEvents,
        managedAccounts,
        availableDays: scopedDays,
        today,
        dateFrom,
        dateTo,
        picFilter: effectivePicFilter,
        outletFilter: effectiveOutletFilter,
      }),
    [
      roleFilter,
      roleConfigs,
      allWorkspaces,
      inputLogs,
      savedRecords,
      calendarEvents,
      managedAccounts,
      scopedDays,
      today,
      dateFrom,
      dateTo,
      effectivePicFilter,
      effectiveOutletFilter,
    ]
  );

  // Derived visual analytics from fact_pic_harian & fact_task_harian
  const analytics = useMemo(() => {
    const picRows = dataset.tables.fact_pic_harian.rows;
    const taskRows = dataset.tables.fact_task_harian.rows;
    const visitRows = dataset.tables.fact_kunjungan.rows;

    let totalSlots = 0;
    let totalPending = 0;
    let totalUpdate = 0;
    for (const r of picRows) {
      totalSlots += Number(r.total_slot || 0);
      totalPending += Number(r.slot_pending || 0);
      totalUpdate += Number(r.slot_update || 0);
    }
    const compliancePct = totalSlots > 0 ? Math.round((totalUpdate / totalSlots) * 100) : 0;

    // Weekly trend (last 6 weeks in range)
    const weekMap = new Map<string, { update: number; total: number }>();
    for (const r of picRows) {
      const wk = String(r.minggu_mulai || '');
      if (!wk) continue;
      const cur = weekMap.get(wk) || { update: 0, total: 0 };
      cur.update += Number(r.slot_update || 0);
      cur.total += Number(r.total_slot || 0);
      weekMap.set(wk, cur);
    }
    const weeklyTrend = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([weekStart, stat]) => ({
        weekStart,
        pct: stat.total > 0 ? Math.round((stat.update / stat.total) * 100) : 0,
      }));

    // Top backfill PICs from fact_task_harian
    const bfMap = new Map<string, { pic: string; backfillCount: number; ownCount: number }>();
    for (const r of taskRows) {
      if (r.sumber !== 'own') continue;
      const pic = String(r.pic || '');
      if (!pic) continue;
      const cur = bfMap.get(pic) || { pic, backfillCount: 0, ownCount: 0 };
      cur.ownCount += 1;
      if (Number(r.backfill_hari || 0) > 0) cur.backfillCount += 1;
      bfMap.set(pic, cur);
    }
    const topBackfillPics = Array.from(bfMap.values())
      .filter((x) => x.backfillCount > 0)
      .sort((a, b) => b.backfillCount - a.backfillCount)
      .slice(0, 4);

    return {
      totalSlots,
      totalPending,
      compliancePct,
      totalVisits: visitRows.length,
      weeklyTrend,
      topBackfillPics,
    };
  }, [dataset]);

  const activeTable = dataset.tables[previewTableId] || dataset.tables.fact_task_harian;
  const previewRows = activeTable.rows.slice(0, PREVIEW_LIMIT);

  const selectedSet = useMemo(() => new Set(selectedTables), [selectedTables]);

  const toggleTable = (id: DatasetTableId) => {
    setSelectedTables((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handlePeriodPresetChange = (val: string) => {
    setPeriodPreset(val);
    if (val === 'ALL') {
      setDateFrom(scopedDays[0] || today);
      setDateTo(today);
      return;
    }
    const mDays = scopedDays.filter((d) => d.slice(0, 7) === val);
    if (mDays.length > 0) {
      setDateFrom(mDays[0]);
      const cappedEnd =
        val === curMonth ? today : val < curMonth ? mDays[mDays.length - 1] : mDays[0];
      setDateTo(cappedEnd);
    }
  };

  const handleResetFilters = () => {
    setRoleFilter('ALL');
    setPicFilter('ALL');
    setOutletFilter('ALL');
    setPeriodPreset(activeMonth);
    setDateFrom(defaultFrom);
    setDateTo(defaultTo);
  };

  const fileSlug = `${roleFilter === 'ALL' ? 'semua-role' : roleFilter}-${dataset.periodStart || dateFrom}_sd_${dataset.periodEnd || dateTo}`;

  const handleDownloadWorkbookXlsx = () => {
    if (selectedTables.length === 0) return;
    const orderedSelected = DATASET_TABLE_DEFINITIONS.map((d) => d.id).filter((id) =>
      selectedSet.has(id)
    );
    const readmeSheet: XlsxSheetInput = {
      name: 'README',
      columns: ['Sheet / Tabel', 'Jumlah Baris', 'Jumlah Kolom', 'Deskripsi', 'Daftar Kolom'],
      rows: [
        [
          'INFO PERIODE',
          dataset.workingDaysCount,
          0,
          `Periode ${dataset.periodStart || '-'} s.d. ${dataset.periodEnd || '-'} (Dibuat ${dataset.generatedAtIso})`,
          'Tanggal ISO YYYY-MM-DD, angka numerik murni, flag 0/1, jam WIB (UTC+7)',
        ],
        ...orderedSelected.map((id) => {
          const t = dataset.tables[id];
          return [t.id, t.rows.length, t.columns.length, t.description, t.columns.join(', ')];
        }),
      ],
    };
    const dataSheets: XlsxSheetInput[] = orderedSelected.map((id) => {
      const t = dataset.tables[id];
      return {
        name: t.id,
        columns: t.columns,
        rows: t.rows.map((row) => t.columns.map((col) => row[col] ?? '')),
      };
    });
    downloadXlsxWorkbook(`dataset-outlet-${fileSlug}.xlsx`, [readmeSheet, ...dataSheets]);
    setNotice(
      `Workbook XLSX berisi ${orderedSelected.length} sheet dataset + README berhasil diunduh.`
    );
  };

  const handleDownloadSingleXlsx = () => {
    downloadXlsxWorkbook(`${activeTable.id}-${fileSlug}.xlsx`, [
      {
        name: activeTable.id,
        columns: activeTable.columns,
        rows: activeTable.rows.map((row) => activeTable.columns.map((col) => row[col] ?? '')),
      },
    ]);
    setNotice(
      `Tabel ${activeTable.id} (${activeTable.rows.length} baris) berhasil diunduh ke XLSX.`
    );
  };

  return (
    <div className="space-y-5">
      {notice && (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs font-medium underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Header & Server Log Synchronization */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Dataset Mentah & Ekspor Multi-Tabel (Star Schema)
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Ekspor tabel fakta dan dimensi siap olah untuk Excel, Power BI, Looker Studio, atau Python. Seluruh angka bertipe numerik murni, tanggal berformat ISO <span className="font-mono">YYYY-MM-DD</span>, flag memakai <span className="font-mono">0/1</span>, dan perhitungan selisih memakai rumus resmi Rekap/Ranking.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={serverLogsLoading}
              onClick={() => void onLoadAllLogs()}
              className={`inline-flex min-h-[38px] items-center gap-2 whitespace-nowrap rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                serverLogsLoaded
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/50'
                  : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
              } disabled:cursor-wait disabled:opacity-60`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${serverLogsLoading ? 'animate-spin' : ''}`} />
              <span>
                {serverLogsLoading
                  ? `Memuat log... (${serverLogsProgress})`
                  : serverLogsLoaded
                    ? `Log Server Dimuat (${inputLogs.length}${serverLogsTruncated ? '+' : ''})`
                    : 'Muat seluruh log dari server'}
              </span>
            </button>
          </div>
        </div>

        {/* Summary KPIs + Mini Weekly Trend */}
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 lg:grid-cols-6 dark:border-slate-800">
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Hari Kerja Dievaluasi
            </div>
            <div className="mt-0.5 font-mono text-xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {dataset.workingDaysCount}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Total Slot Tugas
            </div>
            <div className="mt-0.5 font-mono text-xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {analytics.totalSlots}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Kepatuhan Rata-rata
            </div>
            <div className="mt-0.5 font-mono text-xl font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
              {analytics.compliancePct}%
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Total Slot Pending
            </div>
            <div
              className={`mt-0.5 font-mono text-xl font-bold tabular-nums ${
                analytics.totalPending > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {analytics.totalPending}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Entri Kunjungan
            </div>
            <div className="mt-0.5 font-mono text-xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {analytics.totalVisits}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Sumber Log Input
            </div>
            <div className="mt-1 font-mono text-xs font-semibold text-slate-700 tabular-nums dark:text-slate-200">
              {inputLogs.length} dok {serverLogsLoaded ? '(Lengkap)' : '(Realtime ≤300)'}
            </div>
          </div>
        </div>

        {(analytics.weeklyTrend.length > 0 || analytics.topBackfillPics.length > 0) && (
          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 md:grid-cols-2 dark:border-slate-800">
            {analytics.weeklyTrend.length > 0 && (
              <div>
                <div className="mb-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Tren Kepatuhan Mingguan
                </div>
                <div className="flex flex-wrap gap-3">
                  {analytics.weeklyTrend.map((w) => (
                    <div key={w.weekStart} className="min-w-[74px]">
                      <div className="font-mono text-[10px] text-slate-500 tabular-nums dark:text-slate-400">
                        {w.weekStart.slice(5)}
                      </div>
                      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={`h-full rounded-full ${
                            w.pct >= 85
                              ? 'bg-emerald-600 dark:bg-emerald-500'
                              : w.pct >= 65
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                          }`}
                          style={{ width: `${w.pct}%` }}
                        />
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] font-semibold text-slate-800 tabular-nums dark:text-slate-200">
                        {w.pct}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {analytics.topBackfillPics.length > 0 && (
              <div>
                <div className="mb-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  PIC dengan Input Rapel (Backfill) Terbanyak
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                  {analytics.topBackfillPics.map((p) => (
                    <span
                      key={p.pic}
                      className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200"
                    >
                      <span className="font-semibold">{p.pic}</span>
                      <span className="font-mono text-[11px] text-amber-700 tabular-nums dark:text-amber-400">
                        {p.backfillCount}x / {p.ownCount}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Filters & CSV Preset */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Filter Data & Format Ekspor
          </span>
          <div className="flex flex-wrap items-center gap-3">
            {roleFilter !== activeRoleId && (
              <button
                type="button"
                onClick={() => setRoleFilter(activeRoleId)}
                className="text-xs font-medium text-slate-600 hover:underline dark:text-slate-300"
              >
                Fokus {roleConfigs[activeRoleId]?.label}
              </button>
            )}
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset Filter</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label
              htmlFor="ds-role"
              className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              Workspace Role
            </label>
            <select
              id="ds-role"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as 'ALL' | OperationalRoleId)}
              className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="ALL">Semua Role (Gabungan)</option>
              {OPERATIONAL_ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {roleConfigs[r.id]?.label || r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="ds-pic"
              className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              Nama PIC
            </label>
            <select
              id="ds-pic"
              value={effectivePicFilter}
              onChange={(e) => setPicFilter(e.target.value)}
              className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="ALL">Semua PIC ({picOptions.length})</option>
              {picOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="ds-outlet"
              className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              Outlet
            </label>
            <select
              id="ds-outlet"
              value={effectiveOutletFilter}
              onChange={(e) => setOutletFilter(e.target.value)}
              className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="ALL">Semua Outlet ({outletOptions.length})</option>
              {outletOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="ds-month-preset"
              className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              Pilih Periode Cepat
            </label>
            <select
              id="ds-month-preset"
              value={periodPreset}
              onChange={(e) => handlePeriodPresetChange(e.target.value)}
              className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {selectableMonths.map((m) => (
                <option key={m} value={m}>
                  {fmtMonth(`${m}-01`)}
                </option>
              ))}
              <option value="ALL">Semua Bulan Tersedia</option>
            </select>
          </div>

          <DateRangeFilterPopover
            id="ds-date-range"
            label="Range Tanggal"
            align="right"
            today={today}
            maxDate={today}
            allowClear={false}
            dateExact={dateFrom && dateFrom === dateTo ? dateFrom : ''}
            dateFrom={dateFrom !== dateTo ? dateFrom : ''}
            dateTo={dateFrom !== dateTo ? dateTo : ''}
            onSelectSingleDate={(iso) => {
              setDateFrom(iso);
              setDateTo(iso);
            }}
            onSelectDateRange={(start, end) => {
              setDateFrom(start);
              setDateTo(end);
            }}
          />
        </div>

        {/* Export Action Buttons */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Format ekspor: <span className="font-semibold text-slate-700 dark:text-slate-200">Microsoft Excel (.xlsx)</span> · angka numerik asli & header terbeku
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedTables.length === 0}
              onClick={handleDownloadWorkbookXlsx}
              className="inline-flex min-h-[38px] items-center gap-2 whitespace-nowrap rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
            >
              <FileSpreadsheet className="h-4 w-4 shrink-0" />
              <span>Unduh Workbook XLSX ({selectedTables.length} sheet)</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadSingleXlsx}
              className="inline-flex min-h-[38px] items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <Download className="h-4 w-4 shrink-0" />
              <span>Unduh XLSX Tabel Ini</span>
            </button>
          </div>
        </div>
      </section>

      {/* Table Checklist + 12-row Preview */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Daftar Tabel Dataset ({selectedTables.length}/{DATASET_TABLE_DEFINITIONS.length} dipilih untuk Workbook XLSX)
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Centang tabel yang ingin disertakan sebagai sheet dalam file XLSX, atau klik nama tabel untuk pratinjau 12 baris pertama.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedTables(DATASET_TABLE_DEFINITIONS.map((t) => t.id))}
              className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
            >
              Pilih Semua
            </button>
            <button
              type="button"
              onClick={() => setSelectedTables([])}
              className="text-xs font-medium text-slate-500 hover:underline dark:text-slate-400"
            >
              Kosongkan
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {dataset.orderedTables.map((table) => {
            const isChecked = selectedSet.has(table.id);
            const isPreviewing = previewTableId === table.id;
            return (
              <div
                key={table.id}
                className={`flex items-start gap-2.5 rounded-lg border p-3 transition-colors ${
                  isPreviewing
                    ? 'border-blue-700 bg-blue-50/60 dark:border-blue-500 dark:bg-blue-950/30'
                    : 'border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/35'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleTable(table.id)}
                  aria-label={`Sertakan ${table.id}`}
                  className="mt-0.5 shrink-0 text-blue-700 dark:text-blue-400"
                >
                  {isChecked ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : (
                    <Square className="h-4 w-4 text-slate-400" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTableId(table.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {table.label}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                      {table.rows.length}×{table.columns.length}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {table.description}
                  </p>
                </button>
              </div>
            );
          })}
        </div>

        {/* 12-row Preview */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-blue-700 dark:text-blue-400" />
            <div>
              <h4 className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                Pratinjau: {activeTable.label}.xlsx
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Menampilkan {previewRows.length} dari {activeTable.rows.length} baris · {activeTable.columns.length} kolom
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadSingleXlsx}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Unduh {activeTable.label}.xlsx</span>
          </button>
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          {previewRows.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              Belum ada baris data untuk tabel <span className="font-mono">{activeTable.label}</span> pada filter & periode yang dipilih.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 font-mono text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                    {activeTable.columns.map((col) => (
                      <th key={col} className="px-3 py-2.5 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {previewRows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                    >
                      {activeTable.columns.map((col) => {
                        const val = row[col];
                        const isNum = typeof val === 'number';
                        return (
                          <td
                            key={col}
                            className={`px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-300 ${
                              isNum ? 'font-mono tabular-nums' : ''
                            }`}
                          >
                            {val === '' || val === undefined ? '—' : String(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
