import { Repeat, X } from 'lucide-react';
import { FormEvent } from 'react';
import { CalendarRecurrenceFreq, OperationalRoleId } from '../../types/outlet';
import {
  CALENDAR_TIME_SLOTS,
  formatCalendarRecurrenceLabel,
  normalizeCalendarInterval,
  parseUtcDate,
} from '../../utils/outletLogic';
import { WEEKDAY_DOW_MAP } from './calendarUtils';

interface KalenderFormModalProps {
  open: boolean;
  editingEventId: string | null;
  busy: boolean;
  formError: string | null;
  formTitle: string;
  formDate: string;
  formStartTime: string;
  formVisibleTo: OperationalRoleId[];
  formNotes: string;
  formRepeatFreq: CalendarRecurrenceFreq;
  formRepeatInterval: number;
  formRepeatWeekdays: number[];
  formRepeatEndMode: 'never' | 'until';
  formRepeatUntil: string;
  formExcludedDates: string[];
  allDeptsSelected: boolean;
  onClose: () => void;
  onSubmit: (e: FormEvent) => Promise<void>;
  onChangeTitle: (value: string) => void;
  onChangeDate: (value: string) => void;
  onChangeStartTime: (value: string) => void;
  onChangeNotes: (value: string) => void;
  onChangeRepeatFreq: (freq: CalendarRecurrenceFreq) => void;
  onChangeRepeatInterval: (interval: number) => void;
  onChangeRepeatEndMode: (mode: 'never' | 'until') => void;
  onChangeRepeatUntil: (value: string) => void;
  onToggleRepeatWeekday: (dow: number) => void;
  onRestoreExcludedDates: () => void;
  onToggleAllDepts: () => void;
  onToggleDept: (roleId: OperationalRoleId) => void;
}

export function KalenderFormModal({
  open,
  editingEventId,
  busy,
  formError,
  formTitle,
  formDate,
  formStartTime,
  formVisibleTo,
  formNotes,
  formRepeatFreq,
  formRepeatInterval,
  formRepeatWeekdays,
  formRepeatEndMode,
  formRepeatUntil,
  formExcludedDates,
  allDeptsSelected,
  onClose,
  onSubmit,
  onChangeTitle,
  onChangeDate,
  onChangeStartTime,
  onChangeNotes,
  onChangeRepeatFreq,
  onChangeRepeatInterval,
  onChangeRepeatEndMode,
  onChangeRepeatUntil,
  onToggleRepeatWeekday,
  onRestoreExcludedDates,
  onToggleAllDepts,
  onToggleDept,
}: KalenderFormModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-form-title"
      onClick={() => !busy && onClose()}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <h3
              id="event-form-title"
              className="text-base font-bold text-slate-900 dark:text-slate-100"
            >
              {editingEventId ? 'Edit Event Kalender' : 'Buat Event Kalender Baru'}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Isi detail jadwal dan pilih departemen yang diizinkan melihat event ini.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Tutup form event"
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
            <label
              htmlFor="evt-title"
              className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Judul Event
            </label>
            <input
              id="evt-title"
              type="text"
              required
              maxLength={120}
              value={formTitle}
              onChange={(e) => onChangeTitle(e.target.value)}
              placeholder="Contoh: Cek Asset, Stock Opname, Monthly Closing"
              className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="evt-date"
                className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Tanggal
              </label>
              <input
                id="evt-date"
                type="date"
                required
                value={formDate}
                onChange={(e) => onChangeDate(e.target.value)}
                className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="evt-start-time"
                className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Jam Mulai (08:00 – 19:00)
              </label>
              <select
                id="evt-start-time"
                value={formStartTime}
                onChange={(e) => onChangeStartTime(e.target.value)}
                className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {CALENDAR_TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot} WIB
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="evt-repeat-freq"
              className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Pengulangan Event
            </label>
            <select
              id="evt-repeat-freq"
              value={formRepeatFreq}
              onChange={(e) => {
                const nextFreq = e.target.value as CalendarRecurrenceFreq;
                onChangeRepeatFreq(nextFreq);
              }}
              className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="none">Tidak Berulang</option>
              <option value="daily">Setiap Hari</option>
              <option value="weekly">Setiap Minggu</option>
              <option value="monthly">Setiap Bulan</option>
              <option value="yearly">Setiap Tahun</option>
            </select>

            {formRepeatFreq !== 'none' && (
              <div className="mt-2.5 space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="evt-repeat-interval"
                      className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                    >
                      Interval Pengulangan
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 dark:text-slate-300">Setiap</span>
                      <input
                        id="evt-repeat-interval"
                        type="number"
                        min={1}
                        max={12}
                        value={formRepeatInterval}
                        onChange={(e) =>
                          onChangeRepeatInterval(normalizeCalendarInterval(e.target.value))
                        }
                        className="h-[36px] w-16 rounded-lg border border-slate-200 bg-white px-2 text-center font-mono text-xs font-semibold text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        {formRepeatFreq === 'daily'
                          ? 'hari'
                          : formRepeatFreq === 'weekly'
                            ? 'minggu'
                            : formRepeatFreq === 'monthly'
                              ? 'bulan'
                              : 'tahun'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="evt-repeat-end-mode"
                      className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                    >
                      Berakhir Pada
                    </label>
                    <select
                      id="evt-repeat-end-mode"
                      value={formRepeatEndMode}
                      onChange={(e) =>
                        onChangeRepeatEndMode(e.target.value as 'never' | 'until')
                      }
                      className="h-[36px] w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="never">Selamanya (Tanpa Batas)</option>
                      <option value="until">Sampai Tanggal Tertentu</option>
                    </select>
                  </div>
                </div>

                {formRepeatEndMode === 'until' && (
                  <div>
                    <label
                      htmlFor="evt-repeat-until"
                      className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                    >
                      Tanggal Akhir Pengulangan
                    </label>
                    <input
                      id="evt-repeat-until"
                      type="date"
                      required
                      min={formDate}
                      value={formRepeatUntil}
                      onChange={(e) => onChangeRepeatUntil(e.target.value)}
                      className="h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                )}

                {formRepeatFreq === 'weekly' && (
                  <div>
                    <span className="mb-1.5 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      Ulangi Pada Hari
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAY_DOW_MAP.map(({ label, dow }) => {
                        const active = formRepeatWeekdays.includes(dow);
                        return (
                          <button
                            key={dow}
                            type="button"
                            onClick={() => onToggleRepeatWeekday(dow)}
                            className={`min-h-[32px] rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                              active
                                ? 'border-blue-700 bg-blue-700 text-white dark:border-blue-600 dark:bg-blue-600'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-2 text-[11px] text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <Repeat className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" />
                    <span>
                      {formatCalendarRecurrenceLabel({
                        date: formDate,
                        repeatFreq: formRepeatFreq,
                        repeatInterval: formRepeatInterval,
                        repeatWeekdays:
                          formRepeatWeekdays.length > 0
                            ? formRepeatWeekdays
                            : /^\d{4}-\d{2}-\d{2}$/.test(formDate)
                              ? [parseUtcDate(formDate).getUTCDay()]
                              : [],
                        repeatUntil: formRepeatEndMode === 'until' ? formRepeatUntil : '',
                      })}
                    </span>
                  </span>

                  {editingEventId && formExcludedDates.length > 0 && (
                    <button
                      type="button"
                      onClick={onRestoreExcludedDates}
                      className="font-semibold text-blue-700 hover:underline dark:text-blue-400"
                    >
                      Pulihkan {formExcludedDates.length} tgl dilewati
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tampilkan Event Ke (Visibilitas Departemen)
              </span>
              <button
                type="button"
                onClick={onToggleAllDepts}
                className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
              >
                {allDeptsSelected ? 'Batalkan Semua' : 'Pilih Semua Departemen'}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700/70">
                <input
                  type="checkbox"
                  checked={allDeptsSelected}
                  onChange={onToggleAllDepts}
                  className="h-4 w-4 accent-blue-700"
                />
                <span>Semua Departemen</span>
              </label>

              <label className="flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700/70">
                <input
                  type="checkbox"
                  checked={formVisibleTo.includes('stock_accounting')}
                  onChange={() => onToggleDept('stock_accounting')}
                  className="h-4 w-4 accent-blue-700"
                />
                <span>Stock Accounting</span>
              </label>

              <label className="flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700/70">
                <input
                  type="checkbox"
                  checked={formVisibleTo.includes('gl')}
                  onChange={() => onToggleDept('gl')}
                  className="h-4 w-4 accent-blue-700"
                />
                <span>GL</span>
              </label>

              <label className="flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700/70">
                <input
                  type="checkbox"
                  checked={formVisibleTo.includes('accounting')}
                  onChange={() => onToggleDept('accounting')}
                  className="h-4 w-4 accent-blue-700"
                />
                <span>Accounting</span>
              </label>
            </div>

            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              Pengguna Accounting yang berwenang selalu dapat melihat semua event untuk koordinasi.
            </p>
          </div>

          <div>
            <label
              htmlFor="evt-notes"
              className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Catatan / Peserta (Opsional)
            </label>
            <textarea
              id="evt-notes"
              rows={3}
              maxLength={500}
              value={formNotes}
              onChange={(e) => onChangeNotes(e.target.value)}
              placeholder="Contoh: Peter, Melvin, Jackson, dan Jessica akan berpartisipasi."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Catatan dan daftar peserta hanya terlihat saat event diklik (tidak tampil di ringkasan kalender).
            </p>
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
              disabled={busy}
              className="min-h-[40px] rounded-lg bg-blue-700 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {busy
                ? 'Menyimpan...'
                : editingEventId
                  ? 'Simpan Perubahan'
                  : 'Simpan Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
