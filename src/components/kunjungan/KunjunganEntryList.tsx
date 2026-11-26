import { Trash2 } from 'lucide-react';
import { VisitEntry } from '../../types/outlet';
import {
  CUSTOM_REASON_VALUE,
  HALF_HOUR_SLOTS,
  VISIT_REASON_OPTIONS,
  composeVisitNote,
  parseVisitNote,
} from './kunjunganUtils';

interface KunjunganEntryListProps {
  draftEntries: VisitEntry[];
  customModeByRow: Record<string, boolean>;
  canEditSelectedCell: boolean;
  activePerson: string;
  activePersonOutlets: string[];
  otherOutlets: string[];
  onSetCustomMode: (rowId: string, active: boolean) => void;
  onUpdateRow: (id: string, patch: Partial<VisitEntry>) => void;
  onRemoveRow: (id: string) => void;
}

export function KunjunganEntryList({
  draftEntries,
  customModeByRow,
  canEditSelectedCell,
  activePerson,
  activePersonOutlets,
  otherOutlets,
  onSetCustomMode,
  onUpdateRow,
  onRemoveRow,
}: KunjunganEntryListProps) {
  if (draftEntries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-400">
        {canEditSelectedCell
          ? 'Belum ada kunjungan dicatat. Klik "Tambah Kunjungan" untuk mengisi kunjungan outlet, atau tekan Save jika ingin menghapus catatan kunjungan hari ini.'
          : 'Tidak ada catatan kunjungan pada tanggal ini.'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {draftEntries.map((entry, idx) => {
        const missingOutlet = !entry.outlet.trim();
        const missingFrom = !entry.f.trim();
        const missingTo = !entry.t.trim();
        const parsedNote = parseVisitNote(entry.n, customModeByRow[entry.id]);
        const fromOptions =
          entry.f && !HALF_HOUR_SLOTS.includes(entry.f)
            ? [entry.f, ...HALF_HOUR_SLOTS]
            : HALF_HOUR_SLOTS;
        const toOptions =
          entry.t && !HALF_HOUR_SLOTS.includes(entry.t)
            ? [entry.t, ...HALF_HOUR_SLOTS]
            : HALF_HOUR_SLOTS;

        return (
          <div
            key={entry.id}
            className="grid grid-cols-1 items-end gap-3 rounded-lg border border-slate-200/80 bg-slate-50/70 p-3.5 sm:grid-cols-2 lg:grid-cols-12 dark:border-slate-800 dark:bg-slate-800/35"
          >
            <div className="lg:col-span-2">
              <label
                htmlFor={`visit-outlet-${entry.id}`}
                className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Kunjungan #{idx + 1} · Outlet
              </label>
              <select
                id={`visit-outlet-${entry.id}`}
                disabled={!canEditSelectedCell}
                value={entry.outlet}
                onChange={(e) => onUpdateRow(entry.id, { outlet: e.target.value })}
                className={`min-h-[40px] w-full rounded-lg border bg-white px-3 py-2 text-xs font-medium text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-200/80 disabled:text-slate-400 focus:border-blue-600 focus:outline-none dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500 ${
                  canEditSelectedCell && missingOutlet
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <option value="">Pilih outlet...</option>
                {activePersonOutlets.length > 0 && (
                  <optgroup label={`Outlet ${activePerson}`}>
                    {activePersonOutlets.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </optgroup>
                )}
                {otherOutlets.length > 0 && (
                  <optgroup label="Outlet Lainnya">
                    {otherOutlets.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div className="lg:col-span-2">
              <label
                htmlFor={`visit-from-${entry.id}`}
                className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Dari jam
              </label>
              <select
                id={`visit-from-${entry.id}`}
                disabled={!canEditSelectedCell}
                value={entry.f}
                onChange={(e) => onUpdateRow(entry.id, { f: e.target.value })}
                className={`min-h-[40px] w-full rounded-lg border bg-white px-2.5 py-2 font-mono text-xs text-slate-900 tabular-nums disabled:cursor-not-allowed disabled:bg-slate-200/80 disabled:text-slate-400 focus:border-blue-600 focus:outline-none dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500 ${
                  canEditSelectedCell && missingFrom
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <option value="">Pilih jam...</option>
                {fromOptions.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-2">
              <label
                htmlFor={`visit-to-${entry.id}`}
                className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Ke jam
              </label>
              <select
                id={`visit-to-${entry.id}`}
                disabled={!canEditSelectedCell}
                value={entry.t}
                onChange={(e) => onUpdateRow(entry.id, { t: e.target.value })}
                className={`min-h-[40px] w-full rounded-lg border bg-white px-2.5 py-2 font-mono text-xs text-slate-900 tabular-nums disabled:cursor-not-allowed disabled:bg-slate-200/80 disabled:text-slate-400 focus:border-blue-600 focus:outline-none dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500 ${
                  canEditSelectedCell && missingTo
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <option value="">Pilih jam...</option>
                {toOptions.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-3">
              <label
                htmlFor={`visit-reason-${entry.id}`}
                className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Keterangan Kunjungan
              </label>
              <select
                id={`visit-reason-${entry.id}`}
                disabled={!canEditSelectedCell}
                value={parsedNote.category}
                onChange={(e) => {
                  const nextCategory = e.target.value;
                  if (nextCategory === CUSTOM_REASON_VALUE) {
                    onSetCustomMode(entry.id, true);
                    onUpdateRow(entry.id, { n: parsedNote.customText });
                  } else {
                    onSetCustomMode(entry.id, false);
                    onUpdateRow(entry.id, {
                      n: composeVisitNote(nextCategory, parsedNote.customText),
                    });
                  }
                }}
                className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-200/80 disabled:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500"
              >
                <option value="">Pilih keterangan...</option>
                {VISIT_REASON_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
                <option value={CUSTOM_REASON_VALUE}>Custom (Isi Sendiri)</option>
              </select>
            </div>

            <div className={canEditSelectedCell ? 'lg:col-span-2' : 'lg:col-span-3'}>
              <label
                htmlFor={`visit-note-${entry.id}`}
                className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Keterangan Custom
              </label>
              <input
                id={`visit-note-${entry.id}`}
                type="text"
                maxLength={100}
                disabled={!canEditSelectedCell}
                value={parsedNote.customText}
                placeholder={
                  canEditSelectedCell
                    ? parsedNote.category && parsedNote.category !== CUSTOM_REASON_VALUE
                      ? 'Catatan tambahan (opsional)'
                      : 'Isi keterangan sendiri...'
                    : 'Terkunci'
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (!parsedNote.category) {
                    onSetCustomMode(entry.id, true);
                    onUpdateRow(entry.id, { n: val });
                  } else if (parsedNote.category === CUSTOM_REASON_VALUE) {
                    onUpdateRow(entry.id, { n: val });
                  } else {
                    onUpdateRow(entry.id, {
                      n: composeVisitNote(parsedNote.category, val),
                    });
                  }
                }}
                className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-200/80 disabled:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500"
              />
            </div>

            {canEditSelectedCell && (
              <div className="flex justify-end lg:col-span-1">
                <button
                  type="button"
                  onClick={() => onRemoveRow(entry.id)}
                  title="Hapus baris kunjungan ini"
                  aria-label={`Hapus kunjungan #${idx + 1}`}
                  className="inline-flex h-[40px] w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-red-600 transition-colors hover:border-red-200 hover:bg-red-50 dark:border-slate-700 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/50 lg:w-10 lg:px-0"
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  <span className="lg:hidden">Hapus</span>
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
