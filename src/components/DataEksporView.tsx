import { Download, FileJson, Trash2, Upload } from 'lucide-react';
import { ChangeEvent, useRef, useState } from 'react';
import { OutletStoreState, RoleConfig } from '../types/outlet';
import {
  DEFAULT_START,
  downloadTextFile,
  fmtDate,
  generateDailyFleetCsv,
  generateRecapCsv,
  generateVisitCsv,
  todayIso,
} from '../utils/outletLogic';
import { ConfirmModal } from './ConfirmModal';

interface DataEksporViewProps {
  config: RoleConfig;
  store: OutletStoreState;
  days: string[];
  isAdmin: boolean;
  selectedDay: string;
  selectedTask: string;
  recapDate: string;
  onImportStore: (incoming: OutletStoreState) => Promise<void>;
  onResetAllData: () => Promise<void>;
}

export function DataEksporView({
  config,
  store,
  days,
  isAdmin,
  selectedDay,
  selectedTask,
  recapDate,
  onImportStore,
  onResetAllData,
}: DataEksporViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);

  const today = todayIso();

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
            {fmtDate(days[0])} – {fmtDate(days[days.length - 1])}
          </div>
        </div>
      </section>

      {/* CSV Exports */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Ekspor Laporan Spreadsheet (CSV) · {config.label}
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Unduh laporan dalam format CSV yang kompatibel dengan Microsoft Excel dan Google Sheets.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => {
              downloadTextFile(
                `update-${config.roleId}-${selectedDay}.csv`,
                generateDailyFleetCsv(store, days, config, selectedDay, today, isAdmin),
                'text/csv;charset=utf-8'
              );
              setFeedback({
                type: 'ok',
                message: `CSV harian tanggal ${fmtDate(selectedDay)} berhasil diunduh.`,
              });
            }}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>CSV Harian ({fmtDate(selectedDay)})</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                const taskLabel = config.tasks.find((t) => t.key === selectedTask)?.shortLabel || selectedTask;
                downloadTextFile(
                  `ranking-${config.roleId}-${selectedTask}-${recapDate}.csv`,
                  generateRecapCsv(store, days, config, selectedTask, recapDate, today),
                  'text/csv;charset=utf-8'
                );
                setFeedback({
                  type: 'ok',
                  message: `CSV ranking ${taskLabel} per ${fmtDate(recapDate)} berhasil diunduh.`,
                });
              }}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-4 w-4 shrink-0" />
              <span>CSV Ranking Outlet</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              downloadTextFile(
                `kunjungan-${config.roleId}-${today}.csv`,
                generateVisitCsv(store, days, config),
                'text/csv;charset=utf-8'
              );
              setFeedback({
                type: 'ok',
                message: 'CSV rekap kunjungan berhasil diunduh.',
              });
            }}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>CSV Log Kunjungan</span>
          </button>
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
                Reset Data Workspace {config.label}
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Menghapus seluruh entri harian dan catatan kunjungan untuk role {config.label}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConfirmResetOpen(true)}
              className="flex min-h-[42px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              <span>Hapus Data {config.label}</span>
            </button>
          </div>
        </section>
      )}

      <ConfirmModal
        open={confirmResetOpen}
        title={`Hapus semua data ${config.label}?`}
        description="Seluruh catatan update harian outlet dan log kunjungan pada workspace role ini akan dihapus permanen."
        confirmLabel="Ya, Hapus Data"
        destructive
        onCancel={() => setConfirmResetOpen(false)}
        onConfirm={async () => {
          await onResetAllData();
          setConfirmResetOpen(false);
          setFeedback({ type: 'ok', message: `Semua data ${config.label} berhasil dihapus.` });
        }}
      />
    </div>
  );
}
