import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  ImageDown,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
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
  formatPicTitle,
  formatReferenceCode,
  formatYymmFromIsoDate,
  getMasterOutletOptions,
  resolveAuthorizedRecordPrefix,
  todayIso,
} from '../utils/outletLogic';
import { ConfirmModal } from './ConfirmModal';
import { DateRangeFilterPopover } from './records/DateRangeFilterPopover';
import { SavedRecordDetailModal } from './records/SavedRecordDetailModal';
import { SavedRecordFormModal } from './records/SavedRecordFormModal';

interface SavedRecordsSectionProps {
  account: AccountProfile;
  activeRoleId: OperationalRoleId;
  roleConfigs: Record<OperationalRoleId, RoleConfig>;
  records: SavedRecord[];
  onOpenAddDaily?: () => void;
  onOpenEditDaily?: (record: SavedRecord) => void;
  canEditRecordInDaily?: (record: SavedRecord) => boolean;
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

export function SavedRecordsSection({
  account,
  activeRoleId,
  roleConfigs,
  records,
  onOpenAddDaily,
  onOpenEditDaily,
  canEditRecordInDaily,
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

  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);

  const [viewingRecord, setViewingRecord] = useState<SavedRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<SavedRecord | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SavedRecord | null>(null);
  const [formDate, setFormDate] = useState(today);
  const [formOutlet, setFormOutlet] = useState('');
  const [formPic, setFormPic] = useState('');
  const [formSummary, setFormSummary] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / RECORDS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIdx = filteredRecords.length === 0 ? 0 : (safePage - 1) * RECORDS_PAGE_SIZE;
  const endIdx = Math.min(startIdx + RECORDS_PAGE_SIZE, filteredRecords.length);
  const pageRows = filteredRecords.slice(startIdx, endIdx);

  const hasDateFilter = Boolean(dateExact || dateFrom || dateTo);
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
    setPage(1);
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
    if (onOpenEditDaily && (!canEditRecordInDaily || canEditRecordInDaily(rec))) {
      onOpenEditDaily(rec);
      return;
    }
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
          <button type="button" onClick={() => setFeedback(null)} className="underline">
            Tutup
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Update Daily</h2>

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

            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                id="rec-quick-search"
                type="text"
                aria-label="Cari Cepat"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Cari cepat: Kode, PIC, Outlet..."
                className="min-h-[34px] w-full rounded-lg border border-slate-200 bg-white pr-7 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setPage(1);
                  }}
                  aria-label="Hapus pencarian cepat"
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DateRangeFilterPopover
            today={today}
            dateExact={dateExact}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onSelectSingleDate={(isoDate) => {
              setDateExact(isoDate);
              setDateFrom('');
              setDateTo('');
              setPage(1);
            }}
            onSelectDateRange={(start, end) => {
              setDateExact('');
              setDateFrom(start);
              setDateTo(end);
              setPage(1);
            }}
            onClearDateFilter={() => {
              setDateExact('');
              setDateFrom('');
              setDateTo('');
              setPage(1);
            }}
          />

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
              onChange={(e) => {
                setPicFilter(e.target.value);
                setPage(1);
              }}
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
              onChange={(e) => {
                setRefCodeFilter(e.target.value);
                setPage(1);
              }}
              placeholder="Contoh: SA2611..."
              className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

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
              onChange={(e) => {
                setOutletFilter(e.target.value);
                setPage(1);
              }}
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
                      <div className="inline-flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setViewingRecord(rec)}
                          aria-label={`Lihat detail ${rec.refCode}`}
                          title="Lihat detail"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {canManage && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(rec)}
                              aria-label={`Edit data ${rec.refCode}`}
                              title="Edit"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-800 dark:hover:bg-blue-950/50 dark:hover:text-blue-400"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingRecord(rec)}
                              aria-label={`Hapus data ${rec.refCode}`}
                              title="Hapus"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
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
              Menampilkan {startIdx + 1}–{endIdx} dari {filteredRecords.length} data (Hal {safePage}/
              {totalPages})
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

      <SavedRecordDetailModal
        record={viewingRecord}
        canManage={canManage}
        onClose={() => setViewingRecord(null)}
        onEdit={openEditModal}
        onRequestDelete={() => {
          if (viewingRecord) setDeletingRecord(viewingRecord);
        }}
        onOpenExportPhotoForRecord={onOpenExportPhotoForRecord}
      />

      {canManage && (
        <SavedRecordFormModal
          open={formOpen}
          editingRecord={editingRecord}
          busy={busy}
          formError={formError}
          previewAutoCode={previewAutoCode}
          formDate={formDate}
          formOutlet={formOutlet}
          formOutletOptions={formOutletOptions}
          formPic={formPic}
          picOptions={picOptions}
          formSummary={formSummary}
          formNotes={formNotes}
          onClose={() => setFormOpen(false)}
          onSubmit={handleSubmitForm}
          onChangeDate={setFormDate}
          onChangeOutlet={handleChangeFormOutlet}
          onChangePic={setFormPic}
          onChangeSummary={setFormSummary}
          onChangeNotes={setFormNotes}
        />
      )}

      <ConfirmModal
        open={Boolean(deletingRecord)}
        title={`Hapus data ${deletingRecord?.refCode || ''}?`}
        description="Data yang dihapus tidak dapat dikembalikan dan nomor kode referensi tidak akan digunakan ulang oleh sistem."
        confirmLabel="Ya, Hapus Data"
        destructive
        onCancel={() => setDeletingRecord(null)}
        onConfirm={async () => {
          if (!deletingRecord) return;
          const deletedId = deletingRecord.id;
          const deletedCode = deletingRecord.refCode;
          await onDeleteRecord(deletedId);
          setDeletingRecord(null);
          if (viewingRecord?.id === deletedId) {
            setViewingRecord(null);
          }
          setFeedback({
            type: 'ok',
            message: `Data ${deletedCode} berhasil dihapus.`,
          });
        }}
      />
    </section>
  );
}
