import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileJson,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccountProfile,
  InputLogEntry,
  OperationalRoleId,
  OutletStoreState,
  RoleConfig,
  SavedRecord,
} from '../types/outlet';
import {
  EXPORT_REPORT_OPTIONS,
  ExportPeriod,
  ExportReportId,
  buildExportReport,
  buildMonthOptions,
  buildWeekOptions,
  reportTableToCsv,
} from '../utils/exportReports';
import {
  DEFAULT_START,
  OPERATIONAL_ROLES,
  buildMonthsWorkingDays,
  downloadTextFile,
  fmtDate,
  fmtDateLong,
  fmtMonth,
  getPeopleMap,
  getPersonList,
  nearestWorkingDay,
  todayIso,
  yesterdayIso,
} from '../utils/outletLogic';
import { ConfirmModal } from './ConfirmModal';
import { SavedRecordsSection } from './SavedRecordsSection';

interface DataEksporViewProps {
  account: AccountProfile;
  activeRoleId: OperationalRoleId;
  config: RoleConfig;
  roleConfigs: Record<OperationalRoleId, RoleConfig>;
  store: OutletStoreState;
  allWorkspaces: Record<OperationalRoleId, OutletStoreState>;
  inputLogs: InputLogEntry[];
  savedRecords: SavedRecord[];
  days: string[];
  activeMonth: string;
  selectableMonths: string[];
  isAdmin: boolean;
  selectedDay: string;
  onCreateSavedRecord: (input: {
    date: string;
    pic: string;
    outlet: string;
    summary?: string;
    notes?: string;
  }) => Promise<string>;
  onUpdateSavedRecord: (
    recordId: string,
    input: {
      date: string;
      pic: string;
      outlet: string;
      summary?: string;
      notes?: string;
    }
  ) => Promise<void>;
  onDeleteSavedRecord: (recordId: string) => Promise<void>;
  onImportStore: (incoming: OutletStoreState) => Promise<void>;
  onResetAllData: () => Promise<void>;
}

const PREVIEW_PAGE_SIZE = 15;

export function DataEksporView({
  account,
  activeRoleId,
  config,
  roleConfigs,
  store,
  allWorkspaces,
  inputLogs,
  savedRecords,
  days,
  activeMonth,
  selectableMonths,
  isAdmin,
  selectedDay,
  onCreateSavedRecord,
  onUpdateSavedRecord,
  onDeleteSavedRecord,
  onImportStore,
  onResetAllData,
}: DataEksporViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);

  const today = todayIso();
  const defaultDay = nearestWorkingDay(days, yesterdayIso());

  const [period, setPeriod] = useState<ExportPeriod>('harian');
  const [reportId, setReportId] = useState<ExportReportId>('harian_pending');
  const [roleFilter, setRoleFilter] = useState<'ALL' | OperationalRoleId>(config.roleId);
  const [targetDay, setTargetDay] = useState<string>(selectedDay || defaultDay);
  const [selectedWeekKey, setSelectedWeekKey] = useState<string>('');
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('');
  const [picFilter, setPicFilter] = useState<string>('ALL');
  const [outletFilter, setOutletFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UPDATE' | 'PENDING'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [previewPage, setPreviewPage] = useState<number>(1);

  // Sync active role default when user changes workspace role outside
  useEffect(() => {
    setRoleFilter(config.roleId);
  }, [config.roleId]);

  // Unified working days across all selectable calendar months
  const scopedDays = useMemo(
    () => buildMonthsWorkingDays(selectableMonths),
    [selectableMonths]
  );

  const weekOptions = useMemo(() => buildWeekOptions(scopedDays), [scopedDays]);
  const monthOptions = useMemo(() => buildMonthOptions(scopedDays), [scopedDays]);

  useEffect(() => {
    if (scopedDays.length > 0 && !scopedDays.includes(targetDay)) {
      setTargetDay(nearestWorkingDay(scopedDays, yesterdayIso()));
    }
  }, [scopedDays, targetDay]);

  useEffect(() => {
    if (weekOptions.length > 0 && !weekOptions.some((w) => w.key === selectedWeekKey)) {
      const matchingWeek =
        weekOptions.find((w) => w.days.includes(today) || w.days.includes(defaultDay)) ||
        weekOptions[weekOptions.length - 1];
      setSelectedWeekKey(matchingWeek.key);
    }
  }, [weekOptions, selectedWeekKey, today, defaultDay]);

  useEffect(() => {
    if (monthOptions.length > 0 && !monthOptions.some((m) => m.key === selectedMonthKey)) {
      const matchingMonth =
        monthOptions.find((m) => m.key === activeMonth) ||
        monthOptions.find((m) => m.key === today.slice(0, 7)) ||
        monthOptions[0];
      setSelectedMonthKey(matchingMonth.key);
    }
  }, [monthOptions, selectedMonthKey, activeMonth, today]);

  const activeWeekOption = useMemo(
    () => weekOptions.find((w) => w.key === selectedWeekKey) || weekOptions[0],
    [weekOptions, selectedWeekKey]
  );

  const activeMonthOption = useMemo(
    () => monthOptions.find((m) => m.key === selectedMonthKey) || monthOptions[0],
    [monthOptions, selectedMonthKey]
  );

  const periodReportOptions = useMemo(
    () => EXPORT_REPORT_OPTIONS.filter((opt) => opt.period === period),
    [period]
  );

  const handleSelectPeriod = (nextPeriod: ExportPeriod) => {
    setPeriod(nextPeriod);
    const firstForPeriod = EXPORT_REPORT_OPTIONS.find((o) => o.period === nextPeriod);
    if (firstForPeriod) {
      setReportId(firstForPeriod.id);
    }
    setStatusFilter('ALL');
    setPreviewPage(1);
  };

  // Dynamic PIC & Outlet filter options based on selected role(s)
  const { picOptions, outletOptions } = useMemo(() => {
    const rIds =
      roleFilter === 'ALL' ? OPERATIONAL_ROLES.map((r) => r.id) : [roleFilter];
    const pics = new Set<string>();
    const outlets = new Set<string>();
    for (const rId of rIds) {
      const cfg = roleConfigs[rId];
      for (const p of getPersonList(cfg.outlets)) {
        pics.add(p);
      }
      const pMap = getPeopleMap(cfg.outlets);
      if (picFilter !== 'ALL') {
        for (const o of pMap[picFilter] || []) {
          outlets.add(o);
        }
      } else {
        for (const item of cfg.outlets) {
          outlets.add(item.code);
        }
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

  // Reset preview pagination whenever any filter changes
  useEffect(() => {
    setPreviewPage(1);
  }, [
    period,
    reportId,
    roleFilter,
    targetDay,
    selectedWeekKey,
    selectedMonthKey,
    picFilter,
    outletFilter,
    statusFilter,
    searchQuery,
  ]);

  const activeReportMeta =
    EXPORT_REPORT_OPTIONS.find((o) => o.id === reportId) || periodReportOptions[0];

  const report = useMemo(
    () =>
      buildExportReport({
        reportId,
        roleFilter,
        roleConfigs,
        allWorkspaces,
        inputLogs,
        availableDays: scopedDays,
        today,
        targetDay,
        weekOption: activeWeekOption,
        monthOption: activeMonthOption,
        picFilter,
        outletFilter,
        statusFilter,
        searchQuery,
      }),
    [
      reportId,
      roleFilter,
      roleConfigs,
      allWorkspaces,
      inputLogs,
      scopedDays,
      today,
      targetDay,
      activeWeekOption,
      activeMonthOption,
      picFilter,
      outletFilter,
      statusFilter,
      searchQuery,
    ]
  );

  const totalPreviewPages = Math.max(1, Math.ceil(report.rows.length / PREVIEW_PAGE_SIZE));
  const safePreviewPage = Math.min(previewPage, totalPreviewPages);
  const previewStart = report.rows.length === 0 ? 0 : (safePreviewPage - 1) * PREVIEW_PAGE_SIZE;
  const previewEnd = Math.min(previewStart + PREVIEW_PAGE_SIZE, report.rows.length);
  const previewRows = report.rows.slice(previewStart, previewEnd);

  const hasSubFilters =
    picFilter !== 'ALL' ||
    outletFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    Boolean(searchQuery.trim());

  const handleResetFilters = () => {
    setPicFilter('ALL');
    setOutletFilter('ALL');
    setStatusFilter('ALL');
    setSearchQuery('');
    setPreviewPage(1);
  };

  const handleDownloadPreviewCsv = () => {
    if (report.rows.length === 0) return;
    downloadTextFile(
      report.filename,
      reportTableToCsv(report.columns, report.rows),
      'text/csv;charset=utf-8'
    );
    setFeedback({
      type: 'ok',
      message: `${activeReportMeta.label} (${report.rows.length} baris) berhasil diunduh.`,
    });
  };

  const totalEntriesCount = Object.values(store.ent).reduce(
    (sum, outletMap) => sum + Object.keys(outletMap).length,
    0
  );
  const totalVisitsCount = Object.values(store.visit).filter((v) => v.ok).length;

  const handleExportJson = () => {
    downloadTextFile(
      `backup-${config.roleId}-${today}.json`,
      JSON.stringify(store, null, 2),
      'application/json;charset=utf-8'
    );
    setFeedback({ type: 'ok', message: `Cadangan JSON ${config.label} berhasil diunduh.` });
  };

  const handleFileImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        if (!parsed || typeof parsed !== 'object' || !parsed.ent || !parsed.visit) {
          setFeedback({
            type: 'err',
            message: 'Format file JSON tidak valid. Pastikan file berasal dari ekspor Update Harian Outlet.',
          });
          return;
        }
        await onImportStore({
          ent: parsed.ent,
          visit: parsed.visit,
          start: typeof parsed.start === 'string' && parsed.start ? parsed.start : DEFAULT_START,
        });
        setFeedback({ type: 'ok', message: `Data cadangan berhasil dipulihkan ke ${config.label}.` });
      } catch {
        setFeedback({ type: 'err', message: 'Gagal membaca atau menyimpan file JSON.' });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-5">
      <SavedRecordsSection
        account={account}
        activeRoleId={activeRoleId}
        roleConfigs={roleConfigs}
        records={savedRecords}
        onCreateRecord={onCreateSavedRecord}
        onUpdateRecord={onUpdateSavedRecord}
        onDeleteRecord={onDeleteSavedRecord}
      />

      {isAdmin && (
        <>
      {feedback && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-medium underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Storage Summary */}
      <section className="grid grid-cols-1 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        <div className="p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Entri Harian ({config.label})
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {totalEntriesCount}
          </div>
        </div>
        <div className="p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Kunjungan Tercatat</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {totalVisitsCount}
          </div>
        </div>
        <div className="p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Rentang Periode Aktif</div>
          <div className="mt-1 font-mono text-base font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {fmtDate(days[0])} – {fmtDateLong(days[days.length - 1])}
          </div>
        </div>
      </section>

      {/* Report Builder, Filter & Preview */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Pusat Laporan & Ekspor Data (Harian, Mingguan, Bulanan)
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Pilih periode dan jenis laporan, saring data sesuai kebutuhan, lalu lihat hasilnya di tabel preview sebelum mengunduh CSV.
            </p>
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
            {(['harian', 'mingguan', 'bulanan'] as ExportPeriod[]).map((p) => {
              const active = period === p;
              const label =
                p === 'harian' ? 'Harian' : p === 'mingguan' ? 'Mingguan' : 'Bulanan';
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleSelectPeriod(p)}
                  className={`min-h-[34px] rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-blue-700 text-white dark:bg-blue-600'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Report Type Cards */}
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {periodReportOptions.map((opt) => {
            const active = opt.id === reportId;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setReportId(opt.id);
                  if (!opt.supportsStatusFilter) setStatusFilter('ALL');
                }}
                className={`rounded-lg border p-3.5 text-left transition-colors ${
                  active
                    ? 'border-blue-700 bg-blue-50/70 dark:border-blue-500 dark:bg-blue-950/35'
                    : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800'
                }`}
              >
                <div
                  className={`text-xs font-semibold ${
                    active
                      ? 'text-blue-800 dark:text-blue-300'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {opt.label}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  {opt.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Filter Controls */}
        <div className="mt-4 rounded-lg border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/35">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Filter Preview & Ekspor
            </span>
            {hasSubFilters && (
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {/* Workspace Role (including ALL cross-role!) */}
            <div>
              <label
                htmlFor="export-role-filter"
                className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
              >
                Workspace Role
              </label>
              <select
                id="export-role-filter"
                value={roleFilter}
                onChange={(e) =>
                  setRoleFilter(e.target.value as 'ALL' | OperationalRoleId)
                }
                className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="ALL">Semua Role (Gabungan)</option>
                {OPERATIONAL_ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Period Time Picker */}
            <div>
              <label
                htmlFor="export-time-filter"
                className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
              >
                {period === 'harian'
                  ? 'Tanggal Kerja'
                  : period === 'mingguan'
                    ? 'Pilih Minggu'
                    : 'Pilih Bulan / Periode'}
              </label>
              {period === 'harian' && (
                <select
                  id="export-time-filter"
                  value={targetDay}
                  onChange={(e) => setTargetDay(e.target.value)}
                  className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {scopedDays.map((d) => (
                    <option key={d} value={d}>
                      {fmtDateLong(d)}
                    </option>
                  ))}
                </select>
              )}
              {period === 'mingguan' && (
                <select
                  id="export-time-filter"
                  value={selectedWeekKey}
                  onChange={(e) => setSelectedWeekKey(e.target.value)}
                  className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {weekOptions.map((w) => (
                    <option key={w.key} value={w.key}>
                      {w.label}
                    </option>
                  ))}
                </select>
              )}
              {period === 'bulanan' && (
                <select
                  id="export-time-filter"
                  value={selectedMonthKey}
                  onChange={(e) => setSelectedMonthKey(e.target.value)}
                  className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {monthOptions.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* PIC */}
            <div>
              <label
                htmlFor="export-pic-filter"
                className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
              >
                Nama PIC
              </label>
              <select
                id="export-pic-filter"
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

            {/* Outlet */}
            <div>
              <label
                htmlFor="export-outlet-filter"
                className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
              >
                Outlet
              </label>
              <select
                id="export-outlet-filter"
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

            {/* Status Filter */}
            <div>
              <label
                htmlFor="export-status-filter"
                className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
              >
                Filter Status
              </label>
              <select
                id="export-status-filter"
                disabled={!activeReportMeta.supportsStatusFilter}
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as 'ALL' | 'UPDATE' | 'PENDING')
                }
                className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500"
              >
                <option value="ALL">Semua Status</option>
                <option value="UPDATE">Hanya UPDATE</option>
                <option value="PENDING">Hanya PENDING</option>
              </select>
            </div>

            {/* Search */}
            <div>
              <label
                htmlFor="export-search-filter"
                className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
              >
                Cari Kata Kunci
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  id="export-search-filter"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari di preview..."
                  className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white pr-2.5 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Live Preview Header & Download */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-blue-700 dark:text-blue-400" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Preview: {activeReportMeta.label}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {report.subtitle} · {report.rows.length} baris · {report.columns.length} kolom
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={report.rows.length === 0}
            onClick={handleDownloadPreviewCsv}
            className="inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>Unduh CSV ({report.rows.length} baris)</span>
          </button>
        </div>

        {/* Preview Table */}
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          {report.rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              Tidak ada data yang sesuai dengan filter saat ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                    {report.columns.map((col, cIdx) => (
                      <th key={`${col}-${cIdx}`} className="px-3.5 py-2.5 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {previewRows.map((row) => (
                    <tr
                      key={row.key}
                      className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                    >
                      {row.cells.map((cell, cIdx) => {
                        const text = String(cell ?? '');
                        const isPendingCell =
                          text === 'PENDING' || text.startsWith('PENDING (');
                        const isUpdateCell =
                          text === 'UPDATE' || text.startsWith('UPDATE (');
                        return (
                          <td
                            key={cIdx}
                            className={`px-3.5 py-2.5 whitespace-nowrap ${
                              isPendingCell
                                ? 'font-semibold text-red-600 dark:text-red-400'
                                : isUpdateCell
                                  ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-700 dark:text-slate-300'
                            }`}
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

          {totalPreviewPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/20">
              <span className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                Preview baris {previewStart + 1}–{previewEnd} dari {report.rows.length} (Hal {safePreviewPage}/{totalPreviewPages})
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePreviewPage <= 1}
                  onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Sebelumnya</span>
                </button>
                <button
                  type="button"
                  disabled={safePreviewPage >= totalPreviewPages}
                  onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <span>Berikutnya</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Backup JSON */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Cadangan Data JSON · {config.label}
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Ekspor atau impor seluruh data entri harian dan kunjungan untuk role {config.label}.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportJson}
            className="flex min-h-[42px] items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <FileJson className="h-4 w-4 shrink-0" />
            <span>Ekspor Cadangan JSON</span>
          </button>

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-[42px] items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Upload className="h-4 w-4 shrink-0" />
                <span>Impor Cadangan JSON</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleFileImport}
                className="hidden"
              />
            </>
          )}
        </div>
      </section>

      {/* Danger Zone (Admin only) */}
      {isAdmin && (
        <section className="rounded-xl border border-red-200 bg-white p-5 dark:border-red-900/60 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-red-700 dark:text-red-400">
                Reset Data Bulan {fmtMonth(`${activeMonth}-01`)} · {config.label}
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Menghapus seluruh entri harian dan catatan kunjungan pada bulan {fmtMonth(`${activeMonth}-01`)} untuk role {config.label}. Bulan lainnya tetap aman.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConfirmResetOpen(true)}
              className="flex min-h-[42px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              <span>Hapus Data {fmtMonth(`${activeMonth}-01`)}</span>
            </button>
          </div>
        </section>
      )}

      <ConfirmModal
        open={confirmResetOpen}
        title={`Hapus data ${config.label} bulan ${fmtMonth(`${activeMonth}-01`)}?`}
        description={`Seluruh catatan update harian outlet dan log kunjungan untuk ${config.label} pada bulan ${fmtMonth(`${activeMonth}-01`)} akan dihapus permanen. Data bulan lain tidak terpengaruh.`}
        confirmLabel="Ya, Hapus Data Bulan Ini"
        destructive
        onCancel={() => setConfirmResetOpen(false)}
        onConfirm={async () => {
          await onResetAllData();
          setConfirmResetOpen(false);
          setFeedback({
            type: 'ok',
            message: `Data ${config.label} bulan ${fmtMonth(`${activeMonth}-01`)} berhasil dihapus.`,
          });
        }}
      />
        </>
      )}
    </div>
  );
}
