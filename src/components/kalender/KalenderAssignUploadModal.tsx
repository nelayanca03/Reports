import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { ChangeEvent, useRef, useState } from 'react';
import { formatFriendlyFirestoreError } from '../../firebase';
import {
  AssignImportParseResult,
  ParsedAssignImportRow,
  downloadAssignTemplateXlsx,
  parseAssignImportRows,
  parseCsvRows,
  parseXlsxRows,
} from '../../utils/assignImportExport';
import { AssignablePicOption, ROLE_LABELS, fmtDateSlash } from '../../utils/outletLogic';

interface KalenderAssignUploadModalProps {
  open: boolean;
  assignablePics: AssignablePicOption[];
  onClose: () => void;
  onBulkImport: (rows: ParsedAssignImportRow[]) => Promise<number>;
}

export function KalenderAssignUploadModal({
  open,
  assignablePics,
  onClose,
  onBulkImport,
}: KalenderAssignUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState('');
  const [parseResult, setParseResult] = useState<AssignImportParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);

  if (!open) return null;

  const resetState = () => {
    setFileName('');
    setParseResult(null);
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (importing) return;
    resetState();
    onClose();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError(null);
    setParseResult(null);
    setReading(true);

    try {
      const lowerName = file.name.toLowerCase();
      let rawRows: string[][];
      if (lowerName.endsWith('.xlsx')) {
        const buffer = await file.arrayBuffer();
        rawRows = await parseXlsxRows(new Uint8Array(buffer));
      } else if (lowerName.endsWith('.csv') || file.type.includes('csv') || file.type === 'text/plain') {
        const text = await file.text();
        rawRows = parseCsvRows(text);
      } else {
        throw new Error('Format file tidak didukung. Unggah file .xlsx atau .csv.');
      }

      const result = parseAssignImportRows(rawRows, assignablePics);
      setParseResult(result);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Gagal membaca file upload.');
    } finally {
      setReading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!parseResult || parseResult.validRows.length === 0 || importing) return;
    setImporting(true);
    setParseError(null);
    try {
      await onBulkImport(parseResult.validRows);
      resetState();
      onClose();
    } catch (err) {
      setParseError(formatFriendlyFirestoreError(err, 'Gagal menyimpan data assign.'));
    } finally {
      setImporting(false);
    }
  };

  const validCount = parseResult?.validRows.length || 0;
  const errorCount = parseResult?.errors.length || 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-assign-title"
      onClick={handleClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div>
            <h3
              id="upload-assign-title"
              className="text-base font-bold text-slate-900 dark:text-slate-100"
            >
              Upload Assign PIC / Divisi (XLSX / CSV)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Unggah jadwal penugasan massal untuk PIC khusus maupun per Divisi. Setiap assign langsung tampil saat login, memicu notifikasi pop-up, dan tercatat di Kunjungan.
            </p>
          </div>
          <button
            type="button"
            disabled={importing}
            onClick={handleClose}
            aria-label="Tutup modal upload assign"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 dark:border-blue-900/60 dark:bg-blue-950/30">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                Gunakan Template Excel Resmi
              </div>
              <p className="mt-0.5 text-[11px] text-blue-800/80 dark:text-blue-300/80">
                Kolom: <span className="font-mono font-semibold">Tanggal</span> (YYYY-MM-DD / DD/MM/YYYY),{' '}
                <span className="font-mono font-semibold">Jam</span> (08:00–19:00),{' '}
                <span className="font-mono font-semibold">PIC</span> (isi nama PIC, atau kosongkan / tulis <span className="font-mono font-semibold">SEMUA</span> untuk Assign Divisi),{' '}
                <span className="font-mono font-semibold">Divisi</span>,{' '}
                <span className="font-mono font-semibold">Outlet</span>,{' '}
                <span className="font-mono font-semibold">Judul Tugas</span>,{' '}
                <span className="font-mono font-semibold">Catatan</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => downloadAssignTemplateXlsx(assignablePics)}
              className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Unduh Template XLSX</span>
            </button>
          </div>

          <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-5 text-center dark:border-slate-700 dark:bg-slate-800/40">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv"
              onChange={handleFileChange}
              className="hidden"
              id="assign-upload-file-input"
            />
            <FileSpreadsheet className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
            <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-200">
              {fileName ? `File dipilih: ${fileName}` : 'Pilih file Excel (.xlsx) atau CSV (.csv) berisi daftar assign'}
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                type="button"
                disabled={reading || importing}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>{reading ? 'Membaca file...' : fileName ? 'Ganti File' : 'Pilih File'}</span>
              </button>
              {fileName && (
                <button
                  type="button"
                  disabled={importing}
                  onClick={resetState}
                  className="min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {parseError && (
            <div className="flex items-start gap-2 overflow-hidden rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words leading-relaxed">{parseError}</span>
            </div>
          )}

          {parseResult && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {validCount} baris valid siap diimport
                </span>
                {errorCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {errorCount} baris perlu diperbaiki
                  </span>
                )}
              </div>

              {errorCount > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  <div className="mb-1 font-semibold">Baris dilewati karena tidak valid:</div>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {parseResult.errors.map((err, idx) => (
                      <li key={`${err.rowNumber}_${idx}`}>
                        Baris {err.rowNumber}: {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {validCount > 0 && (
                <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="max-h-56 overflow-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="sticky top-0 bg-slate-100 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <tr>
                          <th className="px-3 py-2">Tanggal</th>
                          <th className="px-3 py-2">Jam</th>
                          <th className="px-3 py-2">Target</th>
                          <th className="px-3 py-2">Divisi</th>
                          <th className="px-3 py-2">Outlet</th>
                          <th className="px-3 py-2">Judul Tugas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {parseResult.validRows.map((row) => (
                          <tr
                            key={`${row.rowNumber}_${row.assignScope}_${row.assignedPicUpper || row.assignedDivision}_${row.date}`}
                          >
                            <td className="whitespace-nowrap px-3 py-1.5 font-mono tabular-nums">
                              {fmtDateSlash(row.date)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 font-mono tabular-nums">
                              {row.startTime}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 font-semibold text-slate-900 dark:text-slate-100">
                              {row.assignScope === 'division' ? (
                                <span className="text-blue-700 dark:text-blue-400">
                                  Semua PIC Divisi
                                </span>
                              ) : (
                                row.assignedPic
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-slate-600 dark:text-slate-300">
                              {ROLE_LABELS[row.assignedRole] || row.assignedRole}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 font-mono">
                              {row.assignedOutlet || '—'}
                            </td>
                            <td className="max-w-[220px] truncate px-3 py-1.5 text-slate-800 dark:text-slate-200">
                              {row.title}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 px-6 py-4 dark:border-slate-800">
          <button
            type="button"
            disabled={importing}
            onClick={handleClose}
            className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={importing || validCount === 0}
            onClick={handleConfirmImport}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-700 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>{importing ? 'Mengimport...' : `Import ${validCount} Assign`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
