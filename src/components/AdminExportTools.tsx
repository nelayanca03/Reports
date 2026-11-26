import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Database,
  Download,
  Eye,
  FileJson,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { ChangeEvent, useCallback, useMemo, useRef, useState } from 'react';
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
  EXPORT_REPORT_OPTIONS,
  ExportPeriod,
  ExportReportId,
  buildExportReport,
  buildMonthOptions,
  buildWeekOptions,
} from '../utils/exportReports';
import { downloadXlsxWorkbook } from '../utils/exportXlsx';
import { fetchAllInputLogs } from '../utils/fetchAllInputLogs';
import { ML_MODULE_DEFINITIONS, MlModuleId } from '../utils/mlInsights';
import {
  DEFAULT_START,
  OPERATIONAL_ROLES,
  buildMonthsWorkingDays,
  currentMonthKey,
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
import { AdminDatasetPanel } from './AdminDatasetPanel';
import { ConfirmModal } from './ConfirmModal';
import { MlInsightsPanel } from './MlInsightsPanel';

interface AdminExportToolsProps {
  config: RoleConfig;
  roleConfigs: Record<OperationalRoleId, RoleConfig>;
  store: OutletStoreState;
  allWorkspaces: Record<OperationalRoleId, OutletStoreState>;
  inputLogs: InputLogEntry[];
  savedRecords?: SavedRecord[];
  calendarEvents?: CalendarEvent[];
  managedAccounts?: AccountProfile[];
  days: string[];
  activeMonth: string;
  selectableMonths: string[];
  selectedDay: string;
  alwaysExpanded?: boolean;
  onImportStore: (incoming: OutletStoreState) => Promise<void>;
  onResetAllData: () => Promise<void>;
  onOpenAdminTasks?: () => void;
}

type DirectoryEntry =
  | {
      id: string;
      kind: 'report';
      category: string;
      label: string;
      description: string;
      period: ExportPeriod;
      reportId: ExportReportId;
    }
  | {
      id: string;
      kind: 'ml';
      category: string;
      label: string;
      description: string;
      mlModuleId: MlModuleId;
    }
  | {
      id: string;
      kind: 'dataset' | 'backup' | 'reset';
      category: string;
      label: string;
      description: string;
    };

interface DirectoryCategory {
  id: string;
  title: string;
  items: DirectoryEntry[];
}

const PREVIEW_PAGE_SIZE = 15;

function buildReportDirectoryRows(activeMonthLabel: string, roleLabel: string): DirectoryCategory[][] {
  const toReportItem = (category: string, id: ExportReportId): DirectoryEntry => {
    const opt = EXPORT_REPORT_OPTIONS.find((o) => o.id === id) || EXPORT_REPORT_OPTIONS[0];
    return {
      id: `report:${opt.id}`,
      kind: 'report',
      category,
      label: opt.label,
      description: opt.description,
      period: opt.period,
      reportId: opt.id,
    };
  };

  const toMlItem = (category: string, mlModuleId: MlModuleId, customLabel?: string): DirectoryEntry => {
    const def = ML_MODULE_DEFINITIONS.find((m) => m.id === mlModuleId) || ML_MODULE_DEFINITIONS[0];
    return {
      id: `ml:${def.id}`,
      kind: 'ml',
      category,
      label: customLabel || def.title,
      description: def.subtitle,
      mlModuleId: def.id,
    };
  };

  const operationalRow: DirectoryCategory[] = [
    {
      id: 'harian',
      title: 'Laporan Harian',
      items: [
        toReportItem('Laporan Harian', 'harian_pending'),
        toReportItem('Laporan Harian', 'harian_pic_summary'),
        toReportItem('Laporan Harian', 'harian_detail'),
        toReportItem('Laporan Harian', 'harian_audit_log'),
      ],
    },
    {
      id: 'mingguan',
      title: 'Laporan Mingguan',
      items: [
        toReportItem('Laporan Mingguan', 'mingguan_matrix'),
        toReportItem('Laporan Mingguan', 'mingguan_visit'),
        toReportItem('Laporan Mingguan', 'mingguan_leaderboard'),
      ],
    },
    {
      id: 'bulanan',
      title: 'Laporan Bulanan',
      items: [
        toReportItem('Laporan Bulanan', 'bulanan_kpi'),
        toReportItem('Laporan Bulanan', 'bulanan_all_tasks'),
        toReportItem('Laporan Bulanan', 'bulanan_visit_category'),
      ],
    },
    {
      id: 'dataset_cadangan',
      title: 'Dataset & Cadangan',
      items: [
        {
          id: 'tool:dataset',
          kind: 'dataset',
          category: 'Dataset & Cadangan',
          label: 'Dataset Mentah Multi-Sheet (XLSX)',
          description:
            'Ekspor 9 tabel fakta & dimensi (Star Schema) siap olah untuk Excel, Power BI, Looker Studio, atau Python.',
        },
        {
          id: 'tool:backup',
          kind: 'backup',
          category: 'Dataset & Cadangan',
          label: 'Cadangan & Pulihkan Data (JSON)',
          description: `Unduh atau impor kembali cadangan penuh data entri harian dan kunjungan untuk ${roleLabel}.`,
        },
        {
          id: 'tool:reset',
          kind: 'reset',
          category: 'Dataset & Cadangan',
          label: `Reset Data Bulan ${activeMonthLabel}`,
          description: `Hapus seluruh entri harian dan kunjungan pada bulan ${activeMonthLabel} untuk ${roleLabel}.`,
        },
      ],
    },
  ];

  const analyticsRow: DirectoryCategory[] = [
    {
      id: 'ml_action',
      title: 'Tren & Action Plan',
      items: [
        toMlItem('Tren & Action Plan', 'action_plan', 'Auto-Action List & Briefing Prioritas'),
        toMlItem('Tren & Action Plan', 'period_trend', 'Tren Performa Lintas Periode'),
      ],
    },
    {
      id: 'ml_risk',
      title: 'Prediksi Risiko',
      items: [
        toMlItem('Prediksi Risiko', 'risk_forecast', 'Prediksi Risiko PENDING'),
        toMlItem('Prediksi Risiko', 'eom_readiness', 'Kesiapan Closing Akhir Bulan (EOM)'),
        toMlItem('Prediksi Risiko', 'dependency_bottleneck', 'Deteksi Efek Domino Antar Tugas'),
      ],
    },
    {
      id: 'ml_performance',
      title: 'Performa PIC & Outlet',
      items: [
        toMlItem('Performa PIC & Outlet', 'backfill_anomaly', 'Deteksi Anomali & Pola Backfill'),
        toMlItem('Performa PIC & Outlet', 'outlet_clustering', 'Klasterisasi Kesehatan Outlet (K-Means)'),
        toMlItem('Performa PIC & Outlet', 'pic_kpi_forecast', 'Proyeksi Ranking & Target KPI PIC'),
      ],
    },
    {
      id: 'ml_visit',
      title: 'Optimasi Kunjungan',
      items: [
        toMlItem('Optimasi Kunjungan', 'visit_planner', 'Rekomendasi Prioritas Kunjungan Outlet'),
        toMlItem('Optimasi Kunjungan', 'visit_effectiveness', 'Efektivitas & Kategori Audit Kunjungan'),
      ],
    },
  ];

  return [operationalRow, analyticsRow];
}

export function AdminExportTools({
  config,
  roleConfigs,
  store,
  allWorkspaces,
  inputLogs,
  savedRecords = [],
  calendarEvents = [],
  managedAccounts = [],
  days,
  activeMonth,
  selectableMonths,
  selectedDay,
  alwaysExpanded = false,
  onImportStore,
  onResetAllData,
  onOpenAdminTasks,
}: AdminExportToolsProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [expanded, setExpanded] = useState(alwaysExpanded);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [directorySearch, setDirectorySearch] = useState<string>('');
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);
  const [serverLogs, setServerLogs] = useState<InputLogEntry[] | null>(null);
  const [serverLogsLoading, setServerLogsLoading] = useState(false);
  const [serverLogsProgress, setServerLogsProgress] = useState(0);
  const [serverLogsTruncated, setServerLogsTruncated] = useState(false);

  const effectiveInputLogs = serverLogs ?? inputLogs;

  const handleLoadAllLogs = useCallback(async () => {
    setServerLogsLoading(true);
    setServerLogsProgress(0);
    try {
      const res = await fetchAllInputLogs((count) => setServerLogsProgress(count));
      setServerLogs(res.logs);
      setServerLogsTruncated(res.truncated);
      setFeedback({
        type: 'ok',
        message: `${res.logs.length} log input berhasil dimuat dari server${res.truncated ? ' (batas maksimal 20.000 tercapai)' : ''}.`,
      });
    } catch {
      setFeedback({
        type: 'err',
        message: 'Gagal memuat seluruh log input dari server.',
      });
    } finally {
      setServerLogsLoading(false);
    }
  }, []);

  const today = todayIso();
  const defaultDay = nearestWorkingDay(days, yesterdayIso());
  const activeMonthLabel = fmtMonth(`${activeMonth}-01`);

  const directoryRows = useMemo(
    () => buildReportDirectoryRows(activeMonthLabel, config.label),
    [activeMonthLabel, config.label]
  );

  const allEntries = useMemo(
    () => directoryRows.flatMap((row) => row.flatMap((cat) => cat.items)),
    [directoryRows]
  );

  const selectedEntry = useMemo(
    () => (selectedEntryId ? allEntries.find((e) => e.id === selectedEntryId) ?? null : null),
    [allEntries, selectedEntryId]
  );

  const filteredDirectoryRows = useMemo(() => {
    const q = directorySearch.trim().toLowerCase();
    if (!q) return directoryRows;
    return directoryRows
      .map((row) =>
        row
          .map((cat) => {
            const catMatches = cat.title.toLowerCase().includes(q);
            const matchedItems = catMatches
              ? cat.items
              : cat.items.filter(
                  (item) =>
                    item.label.toLowerCase().includes(q) ||
                    item.description.toLowerCase().includes(q)
                );
            return { ...cat, items: matchedItems };
          })
          .filter((cat) => cat.items.length > 0)
      )
      .filter((row) => row.length > 0);
  }, [directoryRows, directorySearch]);

  const [period, setPeriod] = useState<ExportPeriod>('harian');
  const [reportId, setReportId] = useState<ExportReportId>('harian_pending');
  const [roleFilter, setRoleFilter] = useState<'ALL' | OperationalRoleId>(config.roleId);
  const [dateMode, setDateMode] = useState<'single' | 'range'>('single');
  const [targetDay, setTargetDay] = useState<string>(selectedDay || defaultDay);
  const [rangeFrom, setRangeFrom] = useState<string>(days[0] || today);
  const [rangeTo, setRangeTo] = useState<string>(today);
  const [selectedWeekKey, setSelectedWeekKey] = useState<string>('');
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('');
  const [picFilter, setPicFilter] = useState<string>('ALL');
  const [outletFilter, setOutletFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UPDATE' | 'PENDING'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [previewPage, setPreviewPage] = useState<number>(1);
  const [prevConfigRoleId, setPrevConfigRoleId] = useState<OperationalRoleId>(config.roleId);
  const [prevActiveMonth, setPrevActiveMonth] = useState<string>(activeMonth);

  const scopedDays = useMemo(
    () => buildMonthsWorkingDays(selectableMonths),
    [selectableMonths]
  );

  const weekOptions = useMemo(() => buildWeekOptions(scopedDays), [scopedDays]);
  const monthOptions = useMemo(() => buildMonthOptions(scopedDays), [scopedDays]);

  if (prevConfigRoleId !== config.roleId) {
    setPrevConfigRoleId(config.roleId);
    setRoleFilter(config.roleId);
    setPreviewPage(1);
  }

  if (prevActiveMonth !== activeMonth) {
    setPrevActiveMonth(activeMonth);
    const curMonth = currentMonthKey(today);
    const nextDay =
      activeMonth === curMonth
        ? nearestWorkingDay(days, yesterdayIso())
        : activeMonth < curMonth
          ? days[days.length - 1] || today
          : days[0] || today;
    setTargetDay(nextDay);
    setRangeFrom(days[0] || today);
    setRangeTo(
      activeMonth === curMonth
        ? today
        : activeMonth < curMonth
          ? days[days.length - 1] || today
          : days[0] || today
    );
    if (monthOptions.some((m) => m.key === activeMonth)) {
      setSelectedMonthKey(activeMonth);
    }
    const matchingWeek =
      weekOptions.find((w) => w.days.includes(today) && activeMonth === curMonth) ||
      weekOptions.find((w) => w.days.some((d) => d.slice(0, 7) === activeMonth));
    if (matchingWeek) {
      setSelectedWeekKey(matchingWeek.key);
    }
    setPreviewPage(1);
  }

  const effectiveTargetDay =
    scopedDays.length > 0 && !scopedDays.includes(targetDay)
      ? nearestWorkingDay(scopedDays, yesterdayIso())
      : targetDay;

  const activeWeekOption = useMemo(() => {
    const found = weekOptions.find((w) => w.key === selectedWeekKey);
    if (found) return found;
    return (
      weekOptions.find((w) => w.days.includes(today) || w.days.includes(defaultDay)) ||
      weekOptions[weekOptions.length - 1]
    );
  }, [weekOptions, selectedWeekKey, today, defaultDay]);

  const activeMonthOption = useMemo(() => {
    const found = monthOptions.find((m) => m.key === selectedMonthKey);
    if (found) return found;
    return (
      monthOptions.find((m) => m.key === activeMonth) ||
      monthOptions.find((m) => m.key === today.slice(0, 7)) ||
      monthOptions[0]
    );
  }, [monthOptions, selectedMonthKey, activeMonth, today]);

  const effectiveWeekKey = activeWeekOption?.key || '';
  const effectiveMonthKey = activeMonthOption?.key || '';

  const handleOpenEntry = (entry: DirectoryEntry) => {
    setFeedback(null);
    if (entry.kind === 'report') {
      setPeriod(entry.period);
      setReportId(entry.reportId);
      const meta = EXPORT_REPORT_OPTIONS.find((o) => o.id === entry.reportId);
      if (!meta?.supportsStatusFilter) setStatusFilter('ALL');
      setPreviewPage(1);
    }
    setSelectedEntryId(entry.id);
  };

  const handleBackToDirectory = () => {
    setFeedback(null);
    setSelectedEntryId(null);
  };

  const { picOptions, outletOptions, effectivePicFilter } = useMemo(() => {
    const rIds =
      roleFilter === 'ALL' ? OPERATIONAL_ROLES.map((r) => r.id) : [roleFilter];
    const pics = new Set<string>();
    const outlets = new Set<string>();
    for (const rId of rIds) {
      const cfg = roleConfigs[rId];
      for (const p of getPersonList(cfg.outlets)) {
        pics.add(p);
      }
    }
    const validPic = picFilter !== 'ALL' && pics.has(picFilter) ? picFilter : 'ALL';
    for (const rId of rIds) {
      const cfg = roleConfigs[rId];
      const pMap = getPeopleMap(cfg.outlets);
      if (validPic !== 'ALL') {
        for (const o of pMap[validPic] || []) {
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
      effectivePicFilter: validPic,
    };
  }, [roleConfigs, roleFilter, picFilter]);

  const effectiveOutletFilter =
    outletFilter !== 'ALL' && !outletOptions.includes(outletFilter) ? 'ALL' : outletFilter;

  const activeReportMeta =
    EXPORT_REPORT_OPTIONS.find((o) => o.id === reportId) || EXPORT_REPORT_OPTIONS[0];

  const effectiveDateMode = period === 'mingguan' ? 'single' : dateMode;

  const report = useMemo(() => {
    if (selectedEntry?.kind !== 'report') {
      return { columns: [], rows: [], filename: '', subtitle: '' };
    }
    return buildExportReport({
      reportId,
      roleFilter,
      roleConfigs,
      allWorkspaces,
      inputLogs: effectiveInputLogs,
      availableDays: scopedDays,
      today,
      targetDay: effectiveTargetDay,
      dateMode: effectiveDateMode,
      rangeFrom,
      rangeTo,
      weekOption: activeWeekOption,
      monthOption: activeMonthOption,
      picFilter: effectivePicFilter,
      outletFilter: effectiveOutletFilter,
      statusFilter,
      searchQuery,
    });
  }, [
    selectedEntry?.kind,
    reportId,
    roleFilter,
    roleConfigs,
    allWorkspaces,
    effectiveInputLogs,
    scopedDays,
    today,
    effectiveTargetDay,
    effectiveDateMode,
    rangeFrom,
    rangeTo,
    activeWeekOption,
    activeMonthOption,
    effectivePicFilter,
    effectiveOutletFilter,
    statusFilter,
    searchQuery,
  ]);

  const totalPreviewPages = Math.max(1, Math.ceil(report.rows.length / PREVIEW_PAGE_SIZE));
  const safePreviewPage = Math.min(previewPage, totalPreviewPages);
  const previewStart = report.rows.length === 0 ? 0 : (safePreviewPage - 1) * PREVIEW_PAGE_SIZE;
  const previewEnd = Math.min(previewStart + PREVIEW_PAGE_SIZE, report.rows.length);
  const previewRows = report.rows.slice(previewStart, previewEnd);

  const hasSubFilters =
    effectivePicFilter !== 'ALL' ||
    effectiveOutletFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    Boolean(searchQuery.trim());

  const handleResetFilters = () => {
    setPicFilter('ALL');
    setOutletFilter('ALL');
    setStatusFilter('ALL');
    setSearchQuery('');
    setPreviewPage(1);
  };

  const handleDownloadPreviewXlsx = () => {
    if (report.rows.length === 0) return;
    downloadXlsxWorkbook(report.filename, [
      {
        name: activeReportMeta.label,
        columns: report.columns,
        rows: report.rows.map((r) => r.cells),
      },
    ]);
    setFeedback({
      type: 'ok',
      message: `${activeReportMeta.label} (${report.rows.length} baris) berhasil diunduh ke XLSX.`,
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

  const filterGridColsClass = useMemo(() => {
    const count =
      (effectiveDateMode === 'range' ? 2 : 1) +
      3 + // role, pic, outlet
      (activeReportMeta.supportsStatusFilter ? 1 : 0) +
      1; // search
    if (count >= 7) return 'lg:grid-cols-7';
    if (count === 6) return 'lg:grid-cols-6';
    return 'lg:grid-cols-5';
  }, [effectiveDateMode, activeReportMeta.supportsStatusFilter]);

  const content = (
    <div className="space-y-5">
      {/* DIRECTORY INDEX VIEW */}
      {!selectedEntry && (
        <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {/* Top Header + Search Bar (inspired by clean ERP Reports Directory) */}
          <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Laporan & Ekspor
              </h1>
              <p className="mt-0.5 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                {totalEntriesCount} entri harian · {totalVisitsCount} kunjungan tercatat · Pilih laporan atau alat ekspor di bawah ini
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={directorySearch}
                onChange={(e) => setDirectorySearch(e.target.value)}
                placeholder="Cari laporan..."
                aria-label="Cari laporan"
                className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white pr-9 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              {directorySearch && (
                <button
                  type="button"
                  onClick={() => setDirectorySearch('')}
                  aria-label="Hapus pencarian"
                  className="absolute top-1/2 right-2.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Categorized Multi-Column Directory */}
          <div className="px-6 py-6">
            {filteredDirectoryRows.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Tidak ada laporan yang cocok dengan &ldquo;{directorySearch}&rdquo;.
                </p>
                <button
                  type="button"
                  onClick={() => setDirectorySearch('')}
                  className="mt-3 text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
                >
                  Tampilkan semua laporan
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                {filteredDirectoryRows.map((row, rowIdx) => (
                  <div
                    key={rowIdx}
                    className={
                      rowIdx > 0
                        ? 'border-t border-slate-100 pt-7 dark:border-slate-800'
                        : ''
                    }
                  >
                    <div className="grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
                      {row.map((category) => (
                        <div key={category.id}>
                          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                            {category.title}
                          </h2>
                          <ul className="mt-3 list-disc space-y-2.5 pl-5 marker:text-slate-400 dark:marker:text-slate-500">
                            {category.items.map((item) => (
                              <li key={item.id}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEntry(item)}
                                  title={item.description}
                                  className="text-left text-sm leading-snug text-blue-700 transition-colors hover:text-blue-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                                >
                                  {item.label}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* FOCUSED REPORT / TOOL DETAIL VIEW */}
      {selectedEntry && (
        <>
          {/* Back & Breadcrumb Header */}
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleBackToDirectory}
                  className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
                  <span>Daftar Laporan</span>
                </button>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                  /
                </span>
                <span className="font-medium text-slate-500 dark:text-slate-400">
                  {selectedEntry.category}
                </span>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                  /
                </span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {selectedEntry.label}
                </span>
              </div>

              <div className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
                {totalEntriesCount} entri · {totalVisitsCount} kunjungan tercatat
              </div>
            </div>

            <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
              <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {selectedEntry.label}
              </h1>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {selectedEntry.description}
              </p>
            </div>
          </div>

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

          {/* 1. OPERATIONAL REPORT VIEW */}
          {selectedEntry.kind === 'report' && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              {/* Filter Controls */}
              <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/35">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Filter Laporan
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    {period !== 'mingguan' && (
                      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
                        <button
                          type="button"
                          onClick={() => {
                            setDateMode('single');
                            setPreviewPage(1);
                          }}
                          className={`min-h-[28px] whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                            dateMode === 'single'
                              ? 'bg-blue-700 text-white dark:bg-blue-600'
                              : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
                          }`}
                        >
                          {period === 'bulanan' ? 'Per Bulan' : 'Per Tanggal'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDateMode('range');
                            setPreviewPage(1);
                          }}
                          className={`min-h-[28px] whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                            dateMode === 'range'
                              ? 'bg-blue-700 text-white dark:bg-blue-600'
                              : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
                          }`}
                        >
                          Range Tanggal
                        </button>
                      </div>
                    )}
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
                </div>

                <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${filterGridColsClass}`}>
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
                      onChange={(e) => {
                        setRoleFilter(e.target.value as 'ALL' | OperationalRoleId);
                        setPreviewPage(1);
                      }}
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

                  {effectiveDateMode === 'range' ? (
                    <>
                      <div>
                        <label
                          htmlFor="export-range-from"
                          className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
                        >
                          Dari Tanggal
                        </label>
                        <input
                          id="export-range-from"
                          type="date"
                          max={today}
                          value={rangeFrom}
                          onChange={(e) => {
                            const val = e.target.value || days[0] || today;
                            setRangeFrom(val > today ? today : val);
                            setPreviewPage(1);
                          }}
                          className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="export-range-to"
                          className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
                        >
                          Sampai Tanggal
                        </label>
                        <input
                          id="export-range-to"
                          type="date"
                          max={today}
                          value={rangeTo}
                          onChange={(e) => {
                            const val = e.target.value || today;
                            setRangeTo(val > today ? today : val);
                            setPreviewPage(1);
                          }}
                          className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </>
                  ) : (
                    <div>
                      <label
                        htmlFor="export-time-filter"
                        className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
                      >
                        {period === 'harian'
                          ? 'Per Tanggal'
                          : period === 'mingguan'
                            ? 'Pilih Minggu'
                            : 'Pilih Bulan'}
                      </label>
                      {period === 'harian' && (
                        <input
                          id="export-time-filter"
                          type="date"
                          max={today}
                          value={effectiveTargetDay}
                          onChange={(e) => {
                            const val = e.target.value || defaultDay;
                            setTargetDay(val > today ? today : val);
                            setPreviewPage(1);
                          }}
                          className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      )}
                      {period === 'mingguan' && (
                        <select
                          id="export-time-filter"
                          value={effectiveWeekKey}
                          onChange={(e) => {
                            setSelectedWeekKey(e.target.value);
                            setPreviewPage(1);
                          }}
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
                          value={effectiveMonthKey}
                          onChange={(e) => {
                            setSelectedMonthKey(e.target.value);
                            setPreviewPage(1);
                          }}
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
                  )}

                  <div>
                    <label
                      htmlFor="export-pic-filter"
                      className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
                    >
                      Nama PIC
                    </label>
                    <select
                      id="export-pic-filter"
                      value={effectivePicFilter}
                      onChange={(e) => {
                        setPicFilter(e.target.value);
                        setPreviewPage(1);
                      }}
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
                      htmlFor="export-outlet-filter"
                      className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
                    >
                      Outlet
                    </label>
                    <select
                      id="export-outlet-filter"
                      value={effectiveOutletFilter}
                      onChange={(e) => {
                        setOutletFilter(e.target.value);
                        setPreviewPage(1);
                      }}
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

                  {activeReportMeta.supportsStatusFilter && (
                    <div>
                      <label
                        htmlFor="export-status-filter"
                        className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
                      >
                        Filter Status
                      </label>
                      <select
                        id="export-status-filter"
                        value={statusFilter}
                        onChange={(e) => {
                          setStatusFilter(e.target.value as 'ALL' | 'UPDATE' | 'PENDING');
                          setPreviewPage(1);
                        }}
                        className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="ALL">Semua Status</option>
                        <option value="UPDATE">Hanya UPDATE</option>
                        <option value="PENDING">Hanya PENDING</option>
                      </select>
                    </div>
                  )}

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
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setPreviewPage(1);
                        }}
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
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Pratinjau Data
                    </h2>
                    <p className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                      {report.subtitle} · {report.rows.length} baris · {report.columns.length} kolom
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {reportId === 'harian_audit_log' && serverLogs === null && (
                    <button
                      type="button"
                      disabled={serverLogsLoading}
                      onClick={() => void handleLoadAllLogs()}
                      className="inline-flex min-h-[38px] items-center whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      {serverLogsLoading
                        ? `Memuat log (${serverLogsProgress})...`
                        : 'Muat Seluruh Log Server'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={report.rows.length === 0}
                    onClick={handleDownloadPreviewXlsx}
                    className="inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                  >
                    <Download className="h-4 w-4 shrink-0" />
                    <span>Unduh XLSX ({report.rows.length} baris)</span>
                  </button>
                </div>
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
                                  className={`px-3.5 py-2.5 whitespace-nowrap tabular-nums ${
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
          )}

          {/* 2. FOCUSED ML MODULE VIEW */}
          {selectedEntry.kind === 'ml' && (
            <MlInsightsPanel
              key={selectedEntry.mlModuleId}
              focusedModuleId={selectedEntry.mlModuleId}
              activeRoleId={config.roleId}
              activeMonth={activeMonth}
              roleConfigs={roleConfigs}
              allWorkspaces={allWorkspaces}
              inputLogs={effectiveInputLogs}
              selectableMonths={selectableMonths}
              days={days}
              serverLogsLoaded={serverLogs !== null}
              serverLogsLoading={serverLogsLoading}
              serverLogsProgress={serverLogsProgress}
              onLoadAllLogs={handleLoadAllLogs}
              onOpenAdminTasks={onOpenAdminTasks}
            />
          )}

          {/* 3. RAW DATASET VIEW */}
          {selectedEntry.kind === 'dataset' && (
            <AdminDatasetPanel
              activeRoleId={config.roleId}
              activeMonth={activeMonth}
              roleConfigs={roleConfigs}
              allWorkspaces={allWorkspaces}
              inputLogs={effectiveInputLogs}
              savedRecords={savedRecords}
              calendarEvents={calendarEvents}
              managedAccounts={managedAccounts}
              selectableMonths={selectableMonths}
              days={days}
              serverLogsLoaded={serverLogs !== null}
              serverLogsLoading={serverLogsLoading}
              serverLogsProgress={serverLogsProgress}
              serverLogsTruncated={serverLogsTruncated}
              onLoadAllLogs={handleLoadAllLogs}
            />
          )}

          {/* 4. BACKUP JSON VIEW */}
          {selectedEntry.kind === 'backup' && (
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
                  className="flex min-h-[42px] items-center gap-2 whitespace-nowrap rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  <FileJson className="h-4 w-4 shrink-0" />
                  <span>Ekspor Cadangan JSON</span>
                </button>

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
              </div>
            </section>
          )}

          {/* 5. RESET DATA BULAN VIEW */}
          {selectedEntry.kind === 'reset' && (
            <>
              <section className="rounded-xl border border-red-200 bg-white p-5 dark:border-red-900/60 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold text-red-700 dark:text-red-400">
                      Reset Data Bulan {activeMonthLabel} · {config.label}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Menghapus seluruh entri harian dan catatan kunjungan pada bulan {activeMonthLabel} untuk role {config.label}. Bulan lainnya tetap aman.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmResetOpen(true)}
                    className="flex min-h-[42px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                    <span>Hapus Data {activeMonthLabel}</span>
                  </button>
                </div>
              </section>

              <ConfirmModal
                open={confirmResetOpen}
                title={`Hapus data ${config.label} bulan ${activeMonthLabel}?`}
                description={`Seluruh catatan update harian outlet dan log kunjungan untuk ${config.label} pada bulan ${activeMonthLabel} akan dihapus permanen. Data bulan lain tidak terpengaruh.`}
                confirmLabel="Ya, Hapus Data Bulan Ini"
                destructive
                onCancel={() => setConfirmResetOpen(false)}
                onConfirm={async () => {
                  await onResetAllData();
                  setConfirmResetOpen(false);
                  setFeedback({
                    type: 'ok',
                    message: `Data ${config.label} bulan ${activeMonthLabel} berhasil dihapus.`,
                  });
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );

  if (alwaysExpanded) {
    return content;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
      >
        <div className="flex items-center gap-2.5">
          <Database className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" />
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Ekspor Laporan, Cadangan JSON & Reset Bulan (Khusus Admin)
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {totalEntriesCount} entri harian · {totalVisitsCount} kunjungan tercatat · Periode {fmtDate(days[0])} – {fmtDateLong(days[days.length - 1])}
            </div>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400">
          <span>{expanded ? 'Tutup' : 'Buka Alat Ekspor'}</span>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 p-5 dark:border-slate-800">{content}</div>
      )}
    </div>
  );
}
