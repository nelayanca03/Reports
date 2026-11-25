import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  ImageDown,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccountProfile,
  OperationalRoleId,
  RoleConfig,
  SavedRecord,
} from '../types/outlet';
import {
  SavedRecordSortKey,
  filterAndSortSavedRecords,
  fmtDateSlash,
  fmtDateWeekdayLong,
  formatPicTitle,
  formatReferenceCode,
  formatYymmFromIsoDate,
  getMasterOutletOptions,
  parseUtcDate,
  resolveAuthorizedRecordPrefix,
  shiftIsoDays,
  todayIso,
} from '../utils/outletLogic';
import { ConfirmModal } from './ConfirmModal';

interface SavedRecordsSectionProps {
  account: AccountProfile;
  activeRoleId: OperationalRoleId;
  roleConfigs: Record<OperationalRoleId, RoleConfig>;
  records: SavedRecord[];
  onOpenAddDaily?: () => void;
  onOpenExportPhoto?: () => void;
  onOpenExportPhotoForRecord?: (record: SavedRecord) => void;
  onCreateRecord: (input: {
    date: string;
    pic: string;
    outlet: string;
    summary?: string;
    notes?: string;
  }) => Promise<string>;
  onUpdateRecord: (
    recordId: string,
    input: {
      date: string;
      pic: string;
      outlet: string;
      summary?: string;
      notes?: string;
    }
  ) => Promise<void>;
  onDeleteRecord: (recordId: string) => Promise<void>;
}

const RECORDS_PAGE_SIZE = 10;
const FILTER_WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

function shiftFilterMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatFilterMonthLabel(ym: string): string {
  const d = parseUtcDate(`${ym}-01`);
  return d.toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function buildFilterCalendarDays(ym: string): string[] {
  const firstOfMonth = `${ym}-01`;
  const firstDate = parseUtcDate(firstOfMonth);
  const dow = firstDate.getUTCDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const gridStart = shiftIsoDays(firstOfMonth, diffToMon);
  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(shiftIsoDays(gridStart, i));
  }
  if (cells.slice(35).every((c) => c.slice(0, 7) !== ym)) {
    return cells.slice(0, 35);
  }
  return cells;
}

export function SavedRecordsSection({
  account,
  activeRoleId,
  roleConfigs,
  records,
  onOpenAddDaily,
  onOpenExportPhoto,
  onOpenExportPhotoForRecord,
  onCreateRecord,
  onUpdateRecord,
  onDeleteRecord,
}: SavedRecordsSectionProps) {
  const canManage = account.role === 'admin' || account.role === 'accounting';
  const today = todayIso();

  const masterOutlets = useMemo(() => getMasterOutletOptions(roleConfigs), [roleConfigs]);

  const { prefix: authorizedPrefix } = useMemo(
    () => resolveAuthorizedRecordPrefix(account, activeRoleId),
    [account, activeRoleId]
  );

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [refCodeFilter, setRefCodeFilter] = useState('');
  const [dateExact, setDateExact] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [picFilter, setPicFilter] = useState('ALL');
  const [outletFilter, setOutletFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState<SavedRecordSortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  // Interactive Date Calendar Popover State
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(today.slice(0, 7));
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const calendarPopoverRef = useRef<HTMLDivElement | null>(null);

  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);

  // Modals
  const [viewingRecord, setViewingRecord] = useState<SavedRecord | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SavedRecord | null>(null);
  const [formDate, setFormDate] = useState(today);
  const [formOutlet, setFormOutlet] = useState('');
  const [formPic, setFormPic] = useState('');
  const [formSummary, setFormSummary] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!calendarOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (
        calendarPopoverRef.current &&
        !calendarPopoverRef.current.contains(e.target as Node)
      ) {
        setCalendarOpen(false);
        setRangeAnchor(null);
        setHoverDate(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCalendarOpen(false);
        setRangeAnchor(null);
        setHoverDate(null);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [calendarOpen]);

  const calendarGridDays = useMemo(
    () => buildFilterCalendarDays(calendarMonth),
    [calendarMonth]
  );

  const handleToggleDatePopover = () => {
    if (calendarOpen) {
      setCalendarOpen(false);
      setRangeAnchor(null);
      setHoverDate(null);
    } else {
      const targetMonth =
        (dateExact || dateFrom || today).slice(0, 7) || today.slice(0, 7);
      setCalendarMonth(targetMonth);
      setRangeAnchor(null);
      setHoverDate(null);
      setCalendarOpen(true);
    }
  };

  const handleCalendarDayClick = (isoDate: string) => {
    if (!rangeAnchor) {
      setRangeAnchor(isoDate);
      return;
    }
    if (isoDate === rangeAnchor) {
      // Double-click or second click on same day -> 1 tanggal
      setDateExact(isoDate);
      setDateFrom('');
      setDateTo('');
    } else {
      // First click start + second click end -> Range tanggal
      const start = rangeAnchor < isoDate ? rangeAnchor : isoDate;
      const end = rangeAnchor < isoDate ? isoDate : rangeAnchor;
      setDateExact('');
      setDateFrom(start);
      setDateTo(end);
    }
    setRangeAnchor(null);
    setHoverDate(null);
    setCalendarOpen(false);
  };

  const handleClearDateFilter = () => {
    setDateExact('');
    setDateFrom('');
    setDateTo('');
    setRangeAnchor(null);
    setHoverDate(null);
  };

  const dateFilterDisplay = dateExact
    ? fmtDateSlash(dateExact)
    : dateFrom && dateTo
      ? `${fmtDateSlash(dateFrom)} – ${fmtDateSlash(dateTo)}`
      : 'Semua Tanggal';

  const hasDateFilter = Boolean(dateExact || dateFrom || dateTo);

  const picOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of masterOutlets) {
      if (o.person) set.add(o.person);
    }
    for (const r of records) {
      if (r.pic) set.add(r.pic);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [masterOutlets, records]);

  const outletFilterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of masterOutlets) {
      if (o.code) set.add(o.code);
    }
    for (const r of records) {
      if (r.outlet) set.add(r.outlet);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [masterOutlets, records]);

  const filteredRecords = useMemo(
    () =>
      filterAndSortSavedRecords(records, {
        search: searchQuery,
        refCode: refCodeFilter,
        dateExact,
        dateFrom,
        dateTo,
        pic: picFilter,
        outlet: outletFilter,
        sortKey,
        sortDir,
      }),
    [
      records,
      searchQuery,
      refCodeFilter,
      dateExact,
      dateFrom,
      dateTo,
      picFilter,
      outletFilter,
      sortKey,
      sortDir,
    ]
  );

  useEffect(() => {
    setPage(1);
  }, [
    searchQuery,
    refCodeFilter,
    dateExact,
    dateFrom,
    dateTo,
    picFilter,
    outletFilter,
    sortKey,
    sortDir,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / RECORDS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIdx = filteredRecords.length === 0 ? 0 : (safePage - 1) * RECORDS_PAGE_SIZE;
  const endIdx = Math.min(startIdx + RECORDS_PAGE_SIZE, filteredRecords.length);
  const pageRows = filteredRecords.slice(startIdx, endIdx);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    Boolean(refCodeFilter.trim()) ||
    hasDateFilter ||
    picFilter !== 'ALL' ||
    outletFilter !== 'ALL';

  const handleClearFilters = () => {
    setSearchQuery('');
    setRefCodeFilter('');
    setDateExact('');
    setDateFrom('');
    setDateTo('');
    setRangeAnchor(null);
    setHoverDate(null);
    setPicFilter('ALL');
    setOutletFilter('ALL');
    setSortKey('date');
    setSortDir('desc');
    setPage(1);
  };

  const handleSort = (key: SavedRecordSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'date' ? 'desc' : 'asc');
    }
  };

  const renderSortIcon = (key: SavedRecordSortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />;
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" />
    );
  };

  const openCreateModal = () => {
    if (!canManage) return;
    const defaultOutlet = masterOutlets[0]?.code || '';
    const defaultPic = masterOutlets[0]?.person || account.picName || account.name || '';
    setEditingRecord(null);
    setFormDate(today);
    setFormOutlet(defaultOutlet);
    setFormPic(defaultPic);
    setFormSummary('');
    setFormNotes('');
    setFormError(null);
    setFormOpen(true);
  };

  const openEditModal = (rec: SavedRecord) => {
    if (!canManage) return;
    setViewingRecord(null);
    setEditingRecord(rec);
    setFormDate(rec.date);
    setFormOutlet(rec.outlet);
    setFormPic(rec.pic);
    setFormSummary(rec.summary || '');
    setFormNotes(rec.notes || '');
    setFormError(null);
    setFormOpen(true);
  };

  const handleChangeFormOutlet = (nextOutlet: string) => {
    setFormOutlet(nextOutlet);
    const matched = masterOutlets.find((o) => o.code === nextOutlet);
    if (matched?.person) {
      setFormPic(matched.person);
    }
  };

  const formOutletOptions = useMemo(() => {
    const codes = masterOutlets.map((o) => o.code);
    if (editingRecord?.outlet && !codes.includes(editingRecord.outlet)) {
      return [editingRecord.outlet, ...codes];
    }
    return codes;
  }, [masterOutlets, editingRecord]);

  const previewAutoCode = useMemo(() => {
    if (editingRecord) return editingRecord.refCode;
    try {
      const yymm = formatYymmFromIsoDate(formDate);
      return `${formatReferenceCode(authorizedPrefix, yymm, 1).slice(0, 6)}XXXX (Otomatis)`;
    } catch {
      return `${authorizedPrefix}YYMMXXXX (Otomatis)`;
    }
  }, [editingRecord, formDate, authorizedPrefix]);

  const handleSubmitForm = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formDate)) {
      setFormError('Tanggal wajib diisi dengan format yang valid.');
      return;
    }
    if (!formOutlet.trim()) {
      setFormError('Outlet wajib dipilih dari daftar.');
      return;
    }
    if (!formPic.trim()) {
      setFormError('Nama PIC wajib dipilih atau diisi.');
      return;
    }

    setBusy(true);
    try {
      if (editingRecord) {
        await onUpdateRecord(editingRecord.id, {
          date: formDate,
          pic: formPic.trim(),
          outlet: formOutlet.trim(),
          summary: formSummary.trim(),
          notes: formNotes.trim(),
        });
        setFeedback({
          type: 'ok',
          message: `Data ${editingRecord.refCode} berhasil diperbarui (kode referensi tetap permanen).`,
        });
      } else {
        const createdCode = await onCreateRecord({
          date: formDate,
          pic: formPic.trim(),
          outlet: formOutlet.trim(),
          summary: formSummary.trim(),
          notes: formNotes.trim(),
        });
        setFeedback({
          type: 'ok',
          message: `Data baru berhasil disimpan dengan kode referensi ${createdCode}.`,
        });
      }
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan data.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      {feedback && (
        <div
          role="status"
          className={`mb-4 flex items-center justify-between rounded-lg border px-4 py-2.5 text-xs font-medium ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Header & + Tambah Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Update Daily
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenExportPhoto && (
            <button
              type="button"
              onClick={onOpenExportPhoto}
              className="inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <ImageDown className="h-4 w-4 shrink-0" />
              <span>Ekspor Foto</span>
            </button>
          )}

          {(onOpenAddDaily || canManage) && (
            <button
              type="button"
              onClick={() => {
                if (onOpenAddDaily) {
                  onOpenAddDaily();
                } else {
                  openCreateModal();
                }
              }}
              className="inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>Tambah</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Multi-Filters Bar */}
      <div className="mt-4 rounded-lg border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/35">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Pencarian & Filter Data ({filteredRecords.length} dari {records.length} data)
          </span>

          <div className="flex flex-wrap items-center gap-2.5">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Clear Filter</span>
              </button>
            )}

            {/* Quick Search (Top-Right) */}
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                id="rec-quick-search"
                type="text"
                aria-label="Cari Cepat"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari cepat: Kode, PIC, Outlet..."
                className="min-h-[34px] w-full rounded-lg border border-slate-200 bg-white pr-7 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Hapus pencarian cepat"
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Ordered Left-to-Right to Match Table Columns: Date | PIC | Reference Code | Outlet */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* 1. Date (Interactive Calendar Popover: Double-click = 1 date, Click start + Click end = Range) */}
          <div className="relative" ref={calendarPopoverRef}>
            <label
              htmlFor="rec-date-trigger"
              className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              Date
            </label>
            <div className="relative flex items-center">
              <button
                id="rec-date-trigger"
                type="button"
                aria-expanded={calendarOpen}
                aria-haspopup="dialog"
                onClick={handleToggleDatePopover}
                className={`flex min-h-[38px] w-full items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-left text-xs transition-colors focus:border-blue-600 focus:outline-none dark:bg-slate-900 ${
                  hasDateFilter
                    ? 'border-blue-500/70 pr-7 font-mono font-semibold text-blue-800 tabular-nums dark:border-blue-500/60 dark:text-blue-300'
                    : 'border-slate-200 font-medium text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600'
                }`}
              >
                <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{dateFilterDisplay}</span>
              </button>
              {hasDateFilter && (
                <button
                  type="button"
                  onClick={handleClearDateFilter}
                  aria-label="Hapus filter tanggal"
                  className="absolute right-2 flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {calendarOpen && (
              <div
                role="dialog"
                aria-label="Pilih tanggal atau range tanggal"
                className="absolute top-full left-0 z-40 mt-1.5 w-[296px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setCalendarMonth((m) => shiftFilterMonth(m, -1))}
                    aria-label="Bulan sebelumnya"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {formatFilterMonthLabel(calendarMonth)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCalendarMonth((m) => shiftFilterMonth(m, 1))}
                    aria-label="Bulan berikutnya"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                  {FILTER_WEEKDAYS.map((wd) => (
                    <div key={wd} className="py-1">
                      {wd}
                    </div>
                  ))}
                </div>

                <div
                  className="grid grid-cols-7 gap-0.5"
                  onMouseLeave={() => setHoverDate(null)}
                >
                  {calendarGridDays.map((dayIso) => {
                    const inMonth = dayIso.slice(0, 7) === calendarMonth;
                    const isToday = dayIso === today;

                    const activeStart = rangeAnchor
                      ? hoverDate && hoverDate < rangeAnchor
                        ? hoverDate
                        : rangeAnchor
                      : dateFrom;
                    const activeEnd = rangeAnchor
                      ? hoverDate && hoverDate > rangeAnchor
                        ? hoverDate
                        : rangeAnchor
                      : dateTo;

                    const isEndpoint = rangeAnchor
                      ? dayIso === rangeAnchor || (Boolean(hoverDate) && dayIso === hoverDate)
                      : dayIso === dateExact || dayIso === dateFrom || dayIso === dateTo;
                    const isInRange =
                      Boolean(activeStart && activeEnd) &&
                      dayIso > activeStart &&
                      dayIso < activeEnd;

                    return (
                      <button
                        key={dayIso}
                        type="button"
                        onMouseEnter={() => rangeAnchor && setHoverDate(dayIso)}
                        onClick={() => handleCalendarDayClick(dayIso)}
                        className={`flex h-8 items-center justify-center rounded-md font-mono text-[11px] tabular-nums transition-colors ${
                          isEndpoint
                            ? 'bg-blue-700 font-bold text-white dark:bg-blue-600'
                            : isInRange
                              ? 'bg-blue-100 font-semibold text-blue-900 dark:bg-blue-950/70 dark:text-blue-200'
                              : inMonth
                                ? 'text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                                : 'text-slate-300 hover:bg-slate-100 dark:text-slate-600 dark:hover:bg-slate-800/60'
                        } ${isToday && !isEndpoint ? 'ring-1 ring-blue-500/70' : ''}`}
                      >
                        {Number(dayIso.slice(8, 10))}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[10px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <span className="leading-tight">
                    {rangeAnchor
                      ? `Awal: ${fmtDateSlash(rangeAnchor)} · Klik lagi tgl ini (1 tgl) atau tgl akhir`
                      : 'Double klik = 1 tgl · Klik awal lalu akhir = range'}
                  </span>
                  {(hasDateFilter || rangeAnchor) && (
                    <button
                      type="button"
                      onClick={() => {
                        handleClearDateFilter();
                        setCalendarOpen(false);
                      }}
                      className="shrink-0 font-semibold text-blue-700 hover:underline dark:text-blue-400"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. PIC */}
          <div>
            <label
              htmlFor="rec-pic-filter"
              className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              PIC
            </label>
            <select
              id="rec-pic-filter"
              value={picFilter}
              onChange={(e) => setPicFilter(e.target.value)}
              className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="ALL">Semua PIC ({picOptions.length})</option>
              {picOptions.map((p) => (
                <option key={p} value={p}>
                  {formatPicTitle(p)}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Reference Code */}
          <div>
            <label
              htmlFor="rec-ref-filter"
              className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              Reference Code
            </label>
            <input
              id="rec-ref-filter"
              type="text"
              value={refCodeFilter}
              onChange={(e) => setRefCodeFilter(e.target.value)}
              placeholder="Contoh: SA2611..."
              className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          {/* 4. Outlet */}
          <div>
            <label
              htmlFor="rec-outlet-filter"
              className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              Outlet
            </label>
            <select
              id="rec-outlet-filter"
              value={outletFilter}
              onChange={(e) => setOutletFilter(e.target.value)}
              className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="ALL">Semua Outlet ({outletFilterOptions.length})</option>
              {outletFilterOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Exact 5-Column Compact Table: Date | PIC | Reference Code | Outlet | Action */}
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        {filteredRecords.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            {records.length === 0
              ? 'Belum ada data tersimpan.'
              : 'Tidak ada data yang cocok dengan kriteria pencarian dan filter saat ini.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort('date')}
                      className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      <span>Date</span>
                      {renderSortIcon('date')}
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort('pic')}
                      className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      <span>PIC</span>
                      {renderSortIcon('pic')}
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort('refCode')}
                      className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      <span>Reference Code</span>
                      {renderSortIcon('refCode')}
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort('outlet')}
                      className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      <span>Outlet</span>
                      {renderSortIcon('outlet')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pageRows.map((rec) => (
                  <tr
                    key={rec.id}
                    className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                  >
                    <td className="px-4 py-3 font-mono text-slate-800 tabular-nums whitespace-nowrap dark:text-slate-200">
                      {fmtDateSlash(rec.date)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap dark:text-slate-100">
                      {formatPicTitle(rec.pic)}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-blue-800 tabular-nums whitespace-nowrap dark:text-blue-400">
                      {rec.refCode}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap dark:text-slate-200">
                      {rec.outlet}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setViewingRecord(rec)}
                        className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/20">
            <span className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              Menampilkan {startIdx + 1}–{endIdx} dari {filteredRecords.length} data (Hal {safePage}/{totalPages})
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

      {/* VIEW DETAIL MODAL (Compact width, internally scrollable, Ringkasan removed) */}
      {viewingRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="record-detail-title"
          onClick={() => setViewingRecord(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
              <div>
                <div className="font-mono text-base font-bold text-blue-800 tabular-nums dark:text-blue-400">
                  {viewingRecord.refCode}
                </div>
                <h3
                  id="record-detail-title"
                  className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100"
                >
                  Detail Data Tersimpan
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingRecord(null)}
                aria-label="Tutup detail"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Date
                  </dt>
                  <dd className="mt-1 font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                    {fmtDateSlash(viewingRecord.date)}
                  </dd>
                  <dd className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {fmtDateWeekdayLong(viewingRecord.date)}
                  </dd>
                </div>

                <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Outlet
                  </dt>
                  <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                    {viewingRecord.outlet}
                  </dd>
                </div>

                <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    PIC
                  </dt>
                  <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                    {formatPicTitle(viewingRecord.pic)}
                  </dd>
                </div>

                <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Reference Code
                  </dt>
                  <dd className="mt-1 font-mono font-bold text-blue-800 tabular-nums dark:text-blue-400">
                    {viewingRecord.refCode}
                  </dd>
                </div>
              </dl>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Catatan
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-900 dark:text-slate-100">
                  {viewingRecord.notes || 'Tidak ada catatan tambahan.'}
                </p>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Dicatat oleh {viewingRecord.createdByName} ({viewingRecord.createdByEmail})
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 px-6 py-4 dark:border-slate-800">
              {onOpenExportPhotoForRecord &&
                viewingRecord.summary.startsWith('[Input Harian]') && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = viewingRecord;
                      setViewingRecord(null);
                      onOpenExportPhotoForRecord(target);
                    }}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-800 transition-colors hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/60"
                  >
                    <ImageDown className="h-3.5 w-3.5" />
                    <span>Ekspor Foto</span>
                  </button>
                )}
              {canManage && (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(true)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Hapus</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(viewingRecord)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setViewingRecord(null)}
                className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT RECORD MODAL (Accounting & Admin only) */}
      {formOpen && canManage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="record-form-title"
          onClick={() => !busy && setFormOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <h3
                  id="record-form-title"
                  className="text-base font-bold text-slate-900 dark:text-slate-100"
                >
                  {editingRecord ? 'Edit Data Tersimpan' : 'Tambah Data Tersimpan'}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {editingRecord
                    ? 'Kode referensi bersifat permanen dan tidak berubah saat diedit.'
                    : 'Kode referensi dibuat otomatis secara berurutan oleh sistem saat disimpan.'}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => setFormOpen(false)}
                aria-label="Tutup form"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="mt-4 space-y-4">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300">
                  {formError}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Reference Code ({editingRecord ? 'Permanen' : 'Otomatis'})
                </label>
                <div className="flex min-h-[42px] items-center rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 font-mono text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200">
                  {previewAutoCode}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="rec-form-date"
                    className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Date
                  </label>
                  <input
                    id="rec-form-date"
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="rec-form-outlet"
                    className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Outlet
                  </label>
                  <select
                    id="rec-form-outlet"
                    required
                    value={formOutlet}
                    onChange={(e) => handleChangeFormOutlet(e.target.value)}
                    className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {formOutletOptions.length === 0 ? (
                      <option value="">Belum ada master outlet</option>
                    ) : (
                      formOutletOptions.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="rec-form-pic"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  PIC
                </label>
                <input
                  id="rec-form-pic"
                  type="text"
                  required
                  list="saved-record-pic-list"
                  maxLength={60}
                  value={formPic}
                  onChange={(e) => setFormPic(e.target.value)}
                  placeholder="Contoh: PETER"
                  className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <datalist id="saved-record-pic-list">
                  {picOptions.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>

              <div>
                <label
                  htmlFor="rec-form-summary"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Ringkasan (Opsional)
                </label>
                <input
                  id="rec-form-summary"
                  type="text"
                  maxLength={200}
                  value={formSummary}
                  onChange={(e) => setFormSummary(e.target.value)}
                  placeholder="Contoh: Pemeriksaan stok & rekonsiliasi outlet"
                  className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="rec-form-notes"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Catatan Detail (Opsional)
                </label>
                <textarea
                  id="rec-form-notes"
                  rows={3}
                  maxLength={1000}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Tambahkan keterangan lengkap atau hasil pengecekan..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setFormOpen(false)}
                  className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={busy || formOutletOptions.length === 0}
                  className="min-h-[40px] rounded-lg bg-blue-700 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  {busy
                    ? 'Menyimpan...'
                    : editingRecord
                      ? 'Simpan Perubahan'
                      : 'Simpan Data'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmDeleteOpen && Boolean(viewingRecord)}
        title={`Hapus data ${viewingRecord?.refCode || ''}?`}
        description="Data yang dihapus tidak dapat dikembalikan dan nomor kode referensi tidak akan digunakan ulang oleh sistem."
        confirmLabel="Ya, Hapus Data"
        destructive
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={async () => {
          if (!viewingRecord) return;
          const deletedCode = viewingRecord.refCode;
          await onDeleteRecord(viewingRecord.id);
          setConfirmDeleteOpen(false);
          setViewingRecord(null);
          setFeedback({
            type: 'ok',
            message: `Data ${deletedCode} berhasil dihapus.`,
          });
        }}
      />
    </section>
  );
}
