import { X } from 'lucide-react';
import { FormEvent } from 'react';
import { SavedRecord } from '../../types/outlet';

interface SavedRecordFormModalProps {
  open: boolean;
  editingRecord: SavedRecord | null;
  busy: boolean;
  formError: string | null;
  previewAutoCode: string;
  formDate: string;
  formOutlet: string;
  formOutletOptions: string[];
  formPic: string;
  picOptions: string[];
  formSummary: string;
  formNotes: string;
  onClose: () => void;
  onSubmit: (e: FormEvent) => Promise<void>;
  onChangeDate: (value: string) => void;
  onChangeOutlet: (value: string) => void;
  onChangePic: (value: string) => void;
  onChangeSummary: (value: string) => void;
  onChangeNotes: (value: string) => void;
}

export function SavedRecordFormModal({
  open,
  editingRecord,
  busy,
  formError,
  previewAutoCode,
  formDate,
  formOutlet,
  formOutletOptions,
  formPic,
  picOptions,
  formSummary,
  formNotes,
  onClose,
  onSubmit,
  onChangeDate,
  onChangeOutlet,
  onChangePic,
  onChangeSummary,
  onChangeNotes,
}: SavedRecordFormModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-form-title"
      onClick={() => !busy && onClose()}
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
            onClick={onClose}
            aria-label="Tutup form"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
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
                onChange={(e) => onChangeDate(e.target.value)}
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
                onChange={(e) => onChangeOutlet(e.target.value)}
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
              onChange={(e) => onChangePic(e.target.value)}
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
              onChange={(e) => onChangeSummary(e.target.value)}
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
              onChange={(e) => onChangeNotes(e.target.value)}
              placeholder="Tambahkan keterangan lengkap atau hasil pengecekan..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
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
  );
}
