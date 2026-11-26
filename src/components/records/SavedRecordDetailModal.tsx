import { Edit3, ImageDown, Trash2, X } from 'lucide-react';
import { SavedRecord } from '../../types/outlet';
import { fmtDateSlash, fmtDateWeekdayLong, formatPicTitle } from '../../utils/outletLogic';

interface SavedRecordDetailModalProps {
  record: SavedRecord | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: (record: SavedRecord) => void;
  onRequestDelete: () => void;
  onOpenExportPhotoForRecord?: (record: SavedRecord) => void;
}

export function SavedRecordDetailModal({
  record,
  canManage,
  onClose,
  onEdit,
  onRequestDelete,
  onOpenExportPhotoForRecord,
}: SavedRecordDetailModalProps) {
  if (!record) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-detail-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div>
            <div className="font-mono text-base font-bold text-blue-800 tabular-nums dark:text-blue-400">
              {record.refCode}
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
            onClick={onClose}
            aria-label="Tutup detail"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Date</dt>
              <dd className="mt-1 font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                {fmtDateSlash(record.date)}
              </dd>
              <dd className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {fmtDateWeekdayLong(record.date)}
              </dd>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Outlet</dt>
              <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                {record.outlet}
              </dd>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">PIC</dt>
              <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                {formatPicTitle(record.pic)}
              </dd>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Reference Code
              </dt>
              <dd className="mt-1 font-mono font-bold text-blue-800 tabular-nums dark:text-blue-400">
                {record.refCode}
              </dd>
            </div>
          </dl>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Catatan</div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-900 dark:text-slate-100">
              {record.notes || 'Tidak ada catatan tambahan.'}
            </p>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Dicatat oleh {record.createdByName} ({record.createdByEmail})
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 px-6 py-4 dark:border-slate-800">
          {onOpenExportPhotoForRecord && record.summary.startsWith('[Input Harian]') && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenExportPhotoForRecord(record);
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
                onClick={onRequestDelete}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Hapus</span>
              </button>
              <button
                type="button"
                onClick={() => onEdit(record)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Edit</span>
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
  );
}
