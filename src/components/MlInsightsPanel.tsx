import {
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  InputLogEntry,
  OperationalRoleId,
  OutletStoreState,
  RoleConfig,
} from '../types/outlet';
import {
  ML_MODULE_DEFINITIONS,
  MlModuleGroup,
  MlModuleId,
  computeMlInsightsSuite,
  mlTableToCsv,
} from '../utils/mlInsights';
import {
  OPERATIONAL_ROLES,
  buildMonthsWorkingDays,
  currentMonthKey,
  downloadTextFile,
  getPeopleMap,
  getPersonList,
  todayIso,
} from '../utils/outletLogic';

interface MlInsightsPanelProps {
  activeRoleId: OperationalRoleId;
  activeMonth: string;
  roleConfigs: Record<OperationalRoleId, RoleConfig>;
  allWorkspaces: Record<OperationalRoleId, OutletStoreState>;
  inputLogs: InputLogEntry[];
  selectableMonths: string[];
  days: string[];
  onOpenAdminTasks?: () => void;
}

const GROUP_ORDER: Array<{ id: MlModuleGroup; label: string }> = [
  { id: 'action', label: 'D. Tren & Action Plan' },
  { id: 'risk', label: 'A. Prediksi Risiko' },
  { id: 'performance', label: 'B. Performa PIC & Outlet' },
  { id: 'visit', label: 'C. Optimasi Kunjungan' },
];

const PAGE_SIZE = 15;

export function MlInsightsPanel({
  activeRoleId,
  activeMonth,
  roleConfigs,
  allWorkspaces,
  inputLogs,
  selectableMonths,
  days,
  onOpenAdminTasks,
}: MlInsightsPanelProps) {
  const today = todayIso();
  const curMonth = currentMonthKey(today);
  const scopedDays = useMemo(
    () => buildMonthsWorkingDays(selectableMonths),
    [selectableMonths]
  );

  const monthDefaultFrom = days[0] || today;
  const monthDefaultTo =
    activeMonth === curMonth
      ? today
      : activeMonth < curMonth
        ? days[days.length - 1] || today
        : days[0] || today;

  const [roleFilter, setRoleFilter] = useState<'ALL' | OperationalRoleId>('ALL');
  const [dateFrom, setDateFrom] = useState<string>(() => monthDefaultFrom);
  const [dateTo, setDateTo] = useState<string>(() => monthDefaultTo);
  const [picFilter, setPicFilter] = useState<string>('ALL');
  const [outletFilter, setOutletFilter] = useState<string>('ALL');
  const [kpiTargetPct, setKpiTargetPct] = useState<number>(90);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeModuleId, setActiveModuleId] = useState<MlModuleId>('action_plan');
  const [page, setPage] = useState<number>(1);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  useEffect(() => {
    setDateFrom(monthDefaultFrom);
    setDateTo(monthDefaultTo);
  }, [activeMonth, monthDefaultFrom, monthDefaultTo]);

  const { picOptions, outletOptions } = useMemo(() => {
    const rIds =
      roleFilter === 'ALL' ? OPERATIONAL_ROLES.map((r) => r.id) : [roleFilter];
    const pics = new Set<string>();
    const outlets = new Set<string>();
    for (const rId of rIds) {
      const cfg = roleConfigs[rId];
      for (const p of getPersonList(cfg.outlets)) pics.add(p);
      const pMap = getPeopleMap(cfg.outlets);
      if (picFilter !== 'ALL') {
        for (const o of pMap[picFilter] || []) outlets.add(o);
      } else {
        for (const item of cfg.outlets) outlets.add(item.code);
      }
    }
    return {
      picOptions: Array.from(pics).sort(),
      outletOptions: Array.from(outlets).sort(),
    };
  }, [roleConfigs, roleFilter, picFilter]);

  useEffect(() => {
    if (picFilter !== 'ALL' && !picOptions.includes(picFilter)) {
      setPicFilter('ALL');
    }
  }, [picOptions, picFilter]);

  useEffect(() => {
    if (outletFilter !== 'ALL' && !outletOptions.includes(outletFilter)) {
      setOutletFilter('ALL');
    }
  }, [outletOptions, outletFilter]);

  const suite = useMemo(
    () =>
      computeMlInsightsSuite({
        roleFilter,
        roleConfigs,
        allWorkspaces,
        inputLogs,
        availableDays: scopedDays,
        today,
        dateFrom,
        dateTo,
        picFilter,
        outletFilter,
        kpiTargetPct,
      }),
    [
      roleFilter,
      roleConfigs,
      allWorkspaces,
      inputLogs,
      scopedDays,
      today,
      dateFrom,
      dateTo,
      picFilter,
      outletFilter,
      kpiTargetPct,
    ]
  );

  const activeModuleMeta =
    ML_MODULE_DEFINITIONS.find((m) => m.id === activeModuleId) || ML_MODULE_DEFINITIONS[0];
  const activeResult = suite.modules[activeModuleId];

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeResult.rows;
    return activeResult.rows.filter((row) =>
      row.cells.some((c) => String(c ?? '').toLowerCase().includes(q))
    );
  }, [activeResult.rows, searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [
    activeModuleId,
    roleFilter,
    dateFrom,
    dateTo,
    picFilter,
    outletFilter,
    kpiTargetPct,
    searchQuery,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIdx = filteredRows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE;
  const endIdx = Math.min(startIdx + PAGE_SIZE, filteredRows.length);
  const visibleRows = filteredRows.slice(startIdx, endIdx);

  const hasFilters =
    roleFilter !== 'ALL' ||
    picFilter !== 'ALL' ||
    outletFilter !== 'ALL' ||
    kpiTargetPct !== 90 ||
    dateFrom !== monthDefaultFrom ||
    dateTo !== monthDefaultTo ||
    Boolean(searchQuery.trim());

  const handleResetFilters = () => {
    setRoleFilter('ALL');
    setDateFrom(monthDefaultFrom);
    setDateTo(monthDefaultTo);
    setPicFilter('ALL');
    setOutletFilter('ALL');
    setKpiTargetPct(90);
    setSearchQuery('');
    setPage(1);
  };

  const handleDownloadActiveCsv = () => {
    if (filteredRows.length === 0) return;
    downloadTextFile(
      activeResult.filename,
      mlTableToCsv(activeResult.columns, filteredRows),
      'text/csv;charset=utf-8'
    );
    setExportNotice(
      `Hasil ML "${activeModuleMeta.shortTitle}" (${filteredRows.length} baris) berhasil diunduh.`
    );
  };

  const handleDownloadActionPlanCsv = () => {
    const ap = suite.modules.action_plan;
    if (ap.rows.length === 0) return;
    downloadTextFile(
      ap.filename,
      mlTableToCsv(ap.columns, ap.rows),
      'text/csv;charset=utf-8'
    );
    setExportNotice(
      `Action Plan Prioritas ML (${ap.rows.length} outlet) berhasil diunduh ke CSV.`
    );
  };

  const rolesWithoutConfig = suite.roleCoverage.filter(
    (r) => r.taskCount === 0 || r.outletCount === 0
  );

  return (
    <div className="space-y-6">
      {exportNotice && (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
        >
          <span>{exportNotice}</span>
          <button
            type="button"
            onClick={() => setExportNotice(null)}
            className="text-xs font-medium underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Header & Dynamic Multi-Role Readiness */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <BrainCircuit className="h-5 w-5 shrink-0" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Analitik Machine Learning & Prediksi Langkah Selanjutnya
              </h2>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Menghitung skor statistik & pola historis (EWMA, regresi tren, korelasi, dan klaster K-Means) langsung dari konfigurasi tugas serta outlet di semua departemen sebagai alat bantu keputusan operasional (bukan penilaian kinerja final). Tugas baru di Stock Accounting, GL, atau Accounting otomatis ikut dianalisis.
            </p>
          </div>

          <button
            type="button"
            disabled={suite.modules.action_plan.rows.length === 0}
            onClick={handleDownloadActionPlanCsv}
            className="inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>Unduh Action Plan ML (CSV)</span>
          </button>
        </div>

        {/* Dynamic Role Coverage Metadata Strip (Unboxed clean typography) */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3.5 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-slate-500 dark:text-slate-400">
              Cakupan Jobdesk Aktif:
            </span>
            {suite.roleCoverage.map((rc, idx) => (
              <span key={rc.roleId} className="inline-flex items-center gap-1.5">
                {idx > 0 && (
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                    ·
                  </span>
                )}
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {rc.label}
                </span>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                  ({rc.taskCount} tugas / {rc.outletCount} outlet)
                </span>
              </span>
            ))}
          </div>

          {rolesWithoutConfig.length > 0 && onOpenAdminTasks && (
            <button
              type="button"
              onClick={onOpenAdminTasks}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>
                Tambah tugas {rolesWithoutConfig.map((r) => r.label).join(' / ')} di Tugas & Outlet
              </span>
            </button>
          )}
        </div>

        {/* 4 Clean Executive Metrics */}
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5 lg:grid-cols-4 dark:border-slate-800">
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Slot Risiko Tinggi Besok
            </div>
            <div
              className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                suite.overview.highRiskSlots > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {suite.overview.highRiskSlots}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              dari {suite.overview.evaluatedOutlets} outlet · {suite.overview.evaluatedTasks} jenis tugas
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Berisiko Terlambat Closing
            </div>
            <div
              className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                suite.overview.eomAtRiskOutlets > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {suite.overview.eomAtRiskOutlets}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              outlet butuh percepatan sebelum akhir bulan
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Kedisiplinan Input Real-Time
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
              {suite.overview.realtimeInputPct !== null
                ? `${suite.overview.realtimeInputPct}%`
                : '—'}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              diinput pada hari-H vs rapel/susulan
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Aksi Prioritas Kritis (P1)
            </div>
            <div
              className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                suite.overview.p1ActionCount > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {suite.overview.p1ActionCount}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              outlet butuh tindak lanjut segera
            </div>
          </div>
        </div>
      </section>

      {/* ML Scope Filters */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Parameter & Ruang Lingkup Data Analisis
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Jendela data aktif: {suite.evaluationPeriodLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {scopedDays.length > 0 && dateFrom !== scopedDays[0] && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom(scopedDays[0]);
                  setDateTo(today);
                }}
                className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                Gabung Semua Riwayat
              </button>
            )}
            {roleFilter !== activeRoleId && (
              <button
                type="button"
                onClick={() => setRoleFilter(activeRoleId)}
                className="text-xs font-medium text-slate-600 hover:underline dark:text-slate-300"
              >
                Fokus {roleConfigs[activeRoleId].label}
              </button>
            )}
            {hasFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset Filter</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
          <div>
            <label
              htmlFor="ml-role-filter"
              className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              Departemen / Role
            </label>
            <select
              id="ml-role-filter"
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
              htmlFor="ml-date-from"
              className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              Basis Data Dari
            </label>
            <input
              id="ml-date-from"
              type="date"
              max={today}
              value={dateFrom}
              onChange={(e) => {
                const v = e.target.value || days[0] || today;
                setDateFrom(v > today ? today : v);
              }}
              className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label
              htmlFor="ml-date-to"
              className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              Sampai Tanggal
            </label>
            <input
              id="ml-date-to"
              type="date"
              max={today}
              value={dateTo}
              onChange={(e) => {
                const v = e.target.value || today;
                setDateTo(v > today ? today : v);
              }}
              className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label
              htmlFor="ml-pic-filter"
              className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              Nama PIC
            </label>
            <select
              id="ml-pic-filter"
              value={picFilter}
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
              htmlFor="ml-outlet-filter"
              className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              Outlet
            </label>
            <select
              id="ml-outlet-filter"
              value={outletFilter}
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
              htmlFor="ml-kpi-target"
              className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              Target KPI (%)
            </label>
            <select
              id="ml-kpi-target"
              value={kpiTargetPct}
              onChange={(e) => setKpiTargetPct(Number(e.target.value))}
              className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-medium text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {[80, 85, 90, 95, 100].map((v) => (
                <option key={v} value={v}>
                  ≥ {v}%
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="ml-search"
              className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              Cari Hasil ML
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                id="ml-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Outlet, PIC, tugas..."
                className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white pr-2.5 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 10 ML Modules Selector + Result Output */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        {/* Module Selector Grouped Cleanly */}
        <div className="space-y-4 border-b border-slate-100 pb-5 dark:border-slate-800">
          {GROUP_ORDER.map((group) => {
            const items = ML_MODULE_DEFINITIONS.filter((m) => m.group === group.id);
            return (
              <div key={group.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <div className="w-44 shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {group.label}
                </div>
                <div className="flex flex-wrap gap-2">
                  {items.map((mod) => {
                    const active = mod.id === activeModuleId;
                    const count = suite.modules[mod.id].rows.length;
                    return (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={() => setActiveModuleId(mod.id)}
                        className={`inline-flex min-h-[38px] items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          active
                            ? 'border-blue-700 bg-blue-700 text-white dark:border-blue-500 dark:bg-blue-600'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="font-mono text-[11px] opacity-75">{mod.code}.</span>
                        <span>{mod.shortTitle}</span>
                        <span
                          className={`font-mono text-[11px] tabular-nums ${
                            active ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          ({count})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Active Module Header + Takeaways + CSV Export */}
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="text-xs font-medium text-blue-700 dark:text-blue-400">
              {activeModuleMeta.groupLabel} · {activeModuleMeta.methodNote}
            </div>
            <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
              {activeModuleMeta.code}. {activeModuleMeta.title}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {activeResult.subtitle}
            </p>
          </div>

          <button
            type="button"
            disabled={filteredRows.length === 0}
            onClick={handleDownloadActiveCsv}
            className="inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>Unduh CSV Modul Ini ({filteredRows.length} baris)</span>
          </button>
        </div>

        {/* Key Takeaways (Clean Typographic List) */}
        <ul className="mt-4 space-y-1.5 border-y border-slate-100 py-3.5 text-xs text-slate-700 dark:border-slate-800 dark:text-slate-300">
          {activeResult.takeaways.map((line, i) => (
            <li key={i} className="flex items-start gap-2 leading-relaxed">
              <span className="mt-0.5 font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                0{i + 1}.
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        {/* Results Table */}
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          {filteredRows.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              Belum ada hasil analisis untuk modul dan filter ini. Jika Anda memilih departemen GL atau Accounting, pastikan tugas & outlet sudah ditambahkan di menu Tugas & Outlet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                    {activeResult.columns.map((col, idx) => (
                      <th key={`${col}-${idx}`} className="px-3.5 py-2.5 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleRows.map((row) => (
                    <tr
                      key={row.key}
                      className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                    >
                      {row.cells.map((cell, cIdx) => {
                        const text = String(cell ?? '');
                        const isLeadCell = cIdx === 0;
                        const leadToneClass =
                          isLeadCell && row.tone === 'danger'
                            ? 'font-semibold text-red-600 dark:text-red-400'
                            : isLeadCell && row.tone === 'warn'
                              ? 'font-semibold text-amber-700 dark:text-amber-400'
                              : isLeadCell && row.tone === 'ok'
                                ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                                : 'text-slate-700 dark:text-slate-300';
                        const isNumericLike = /^[+-]?\d+(\.\d+)?(%|\/100)?$/.test(text);
                        return (
                          <td
                            key={cIdx}
                            className={`px-3.5 py-2.5 ${
                              cIdx >= activeResult.columns.length - 2 ? 'max-w-[320px]' : 'whitespace-nowrap'
                            } ${isNumericLike ? 'font-mono tabular-nums' : ''} ${leadToneClass}`}
                          >
                            {text}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/20">
              <span className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                Menampilkan baris {startIdx + 1}–{endIdx} dari {filteredRows.length} (Hal {safePage}/{totalPages})
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Sebelumnya</span>
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <span>Berikutnya</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
