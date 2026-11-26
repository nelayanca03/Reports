import {
  Calendar as CalendarIcon,
  Clock,
  Edit3,
  Repeat,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { CalendarEvent } from '../../types/outlet';
import {
  ExpandedCalendarOccurrence,
  fmtDateSlash,
  fmtDateWeekdayLong,
  formatCalendarRecurrenceLabel,
  formatCalendarVisibleLabel,
} from '../../utils/outletLogic';
import { ConfirmModal } from '../ConfirmModal';

interface KalenderDetailModalProps {
  selectedOccurrence: ExpandedCalendarOccurrence | null;
  canManage: boolean;
  confirmDeleteOpen: boolean;
  deleteBusy: boolean;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
  onOpenConfirmDelete: () => void;
  onCancelConfirmDelete: () => void;
  onDeleteSingleOccurrence: () => Promise<void>;
  onDeleteSeries: (event: CalendarEvent) => Promise<void>;
}

export function KalenderDetailModal({
  selectedOccurrence,
  canManage,
  confirmDeleteOpen,
  deleteBusy,
  onClose,
  onEdit,
  onOpenConfirmDelete,
  onCancelConfirmDelete,
  onDeleteSingleOccurrence,
  onDeleteSeries,
}: KalenderDetailModalProps) {
  if (!selectedOccurrence) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-detail-title"
        onClick={onClose}
      >
        <div
          className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div>
              <h3
                id="event-detail-title"
                className="text-lg font-bold text-slate-900 dark:text-slate-100"
              >
                {selectedOccurrence.event.title}
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Detail Jadwal Kalender
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup detail event"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 space-y-3.5 text-sm">
            <div className="flex items-center gap-3 text-slate-700 dark:text-slate-200">
              <CalendarIcon className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" />
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400">Tanggal: </span>
                <span className="font-semibold">
                  {fmtDateWeekdayLong(selectedOccurrence.occurrenceDate)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-slate-700 dark:text-slate-200">
              <Clock className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" />
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400">Jam Mulai: </span>
                <span className="font-mono font-semibold tabular-nums">
                  {selectedOccurrence.event.startTime} WIB
                </span>
              </div>
            </div>

            {selectedOccurrence.isRecurring && (
              <div className="flex items-start gap-3 text-slate-700 dark:text-slate-200">
                <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" />
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Pengulangan: </span>
                  <span className="font-semibold">
                    {formatCalendarRecurrenceLabel(selectedOccurrence.event)}
                  </span>
                  {selectedOccurrence.occurrenceDate !== selectedOccurrence.event.date && (
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      Mulai seri: {fmtDateSlash(selectedOccurrence.event.date)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {canManage && (
              <div className="flex items-center gap-3 text-slate-700 dark:text-slate-200">
                <Users className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" />
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Tampil Untuk: </span>
                  <span className="font-semibold">
                    {formatCalendarVisibleLabel(selectedOccurrence.event.visibleTo)}
                  </span>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Catatan / Peserta
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-100">
                {selectedOccurrence.event.notes
                  ? selectedOccurrence.event.notes
                  : 'Tidak ada catatan peserta.'}
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <UserCheck className="h-3.5 w-3.5 shrink-0" />
              <span>
                Dibuat oleh {selectedOccurrence.event.createdByName} (
                {selectedOccurrence.event.createdByEmail})
              </span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={onOpenConfirmDelete}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Hapus</span>
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(selectedOccurrence.event)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Edit Event</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>

      {confirmDeleteOpen && !selectedOccurrence.isRecurring && (
        <ConfirmModal
          open={true}
          title={`Hapus event "${selectedOccurrence.event.title}"?`}
          description="Event yang dihapus akan hilang dari kalender semua departemen terkait."
          confirmLabel="Ya, Hapus Event"
          destructive
          onCancel={onCancelConfirmDelete}
          onConfirm={() => onDeleteSeries(selectedOccurrence.event)}
        />
      )}

      {confirmDeleteOpen && selectedOccurrence.isRecurring && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-recurring-title"
          onClick={() => !deleteBusy && onCancelConfirmDelete()}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="delete-recurring-title"
              className="text-base font-bold text-slate-900 dark:text-slate-100"
            >
              Hapus Event Berulang
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Event <span className="font-semibold">"{selectedOccurrence.event.title}"</span>{' '}
              merupakan jadwal berulang. Pilih apakah ingin menghapus tanggal{' '}
              <span className="font-mono font-semibold">
                {fmtDateSlash(selectedOccurrence.occurrenceDate)}
              </span>{' '}
              saja atau seluruh seri pengulangan.
            </p>

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={onDeleteSingleOccurrence}
                className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                {deleteBusy
                  ? 'Memproses...'
                  : `Hapus Tanggal Ini Saja (${fmtDateSlash(selectedOccurrence.occurrenceDate)})`}
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => onDeleteSeries(selectedOccurrence.event)}
                className="min-h-[40px] w-full rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                Hapus Seluruh Seri Pengulangan
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={onCancelConfirmDelete}
                className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
