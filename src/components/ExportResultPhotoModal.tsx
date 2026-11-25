import { Check, Copy, Download, Image as ImageIcon, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  AccountProfile,
  OutletStoreState,
  RoleConfig,
} from '../types/outlet';
import {
  buildPhotoOutletBlocks,
  canvasToPngBlob,
  detectStockDiscrepancyTasks,
  formatPhotoMonthUpper,
  renderResultPhotoCanvas,
} from '../utils/exportResultPhoto';
import {
  fmtDateLong,
  formatPicTitle,
  getPeopleMap,
  getPersonList,
  isOutletDayFilled,
  resolveAccountPic,
  shiftMonthKey,
  todayIso,
} from '../utils/outletLogic';

interface ExportResultPhotoModalProps {
  open: boolean;
  account: AccountProfile;
  config: RoleConfig;
  store: OutletStoreState;
  days: string[];
  initialPerson: string;
  initialOutlet: string;
  initialDay: string;
  onClose: () => void;
}

export function ExportResultPhotoModal({
  open,
  account,
  config,
  store,
  days,
  initialPerson,
  initialOutlet,
  initialDay,
  onClose,
}: ExportResultPhotoModalProps) {
  const isAdminOrAccounting =
    account.role === 'admin' || account.role === 'accounting';
  const personList = useMemo(() => getPersonList(config.outlets), [config.outlets]);
  const peopleMap = useMemo(() => getPeopleMap(config.outlets), [config.outlets]);
  const ownPic = useMemo(
    () => resolveAccountPic(account, config.outlets),
    [account, config.outlets]
  );

  const lockedPic =
    !isAdminOrAccounting && ownPic && personList.includes(ownPic) ? ownPic : '';

  const [photoPerson, setPhotoPerson] = useState(
    lockedPic || initialPerson || personList[0] || ''
  );
  const [photoDay, setPhotoDay] = useState(initialDay || days[days.length - 1] || todayIso());
  const [selectedOutlets, setSelectedOutlets] = useState<string[]>([]);
  const [discPendingOverrides, setDiscPendingOverrides] = useState<
    Record<string, string>
  >({});
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [copyMessage, setCopyMessage] = useState<string>('');

  const outletsForPic = useMemo(
    () => peopleMap[photoPerson] || [],
    [peopleMap, photoPerson]
  );

  // Reset defaults whenever modal opens or PIC/day changes via open trigger
  useEffect(() => {
    if (!open) return;
    const nextPic = lockedPic || initialPerson || personList[0] || '';
    const nextDay = initialDay || days[days.length - 1] || todayIso();
    const picOutlets = peopleMap[nextPic] || [];
    const filled = picOutlets.filter((o) =>
      isOutletDayFilled(store, config.tasks, o, nextDay)
    );
    const initialSelection =
      filled.length > 0
        ? Array.from(new Set([...filled, ...(initialOutlet && picOutlets.includes(initialOutlet) ? [initialOutlet] : [])]))
        : initialOutlet && picOutlets.includes(initialOutlet)
          ? [initialOutlet]
          : picOutlets.slice(0, 1);

    setPhotoPerson(nextPic);
    setPhotoDay(nextDay);
    setSelectedOutlets(initialSelection);
    setDiscPendingOverrides({});
    setCopyStatus('idle');
    setCopyMessage('');
  }, [open, lockedPic, initialPerson, initialOutlet, initialDay, personList, peopleMap, days, store, config.tasks]);

  const handleChangePic = (nextPic: string) => {
    setPhotoPerson(nextPic);
    const picOutlets = peopleMap[nextPic] || [];
    const filled = picOutlets.filter((o) =>
      isOutletDayFilled(store, config.tasks, o, photoDay)
    );
    setSelectedOutlets(filled.length > 0 ? filled : picOutlets.slice(0, 1));
    setDiscPendingOverrides({});
    setCopyStatus('idle');
  };

  const handleChangeDay = (nextDay: string) => {
    setPhotoDay(nextDay);
    const filled = outletsForPic.filter((o) =>
      isOutletDayFilled(store, config.tasks, o, nextDay)
    );
    if (filled.length > 0) {
      setSelectedOutlets(filled);
    }
    setCopyStatus('idle');
  };

  const toggleOutlet = (code: string) => {
    setSelectedOutlets((prev) =>
      prev.includes(code)
        ? prev.filter((item) => item !== code)
        : outletsForPic.filter((o) => o === code || prev.includes(o))
    );
    setCopyStatus('idle');
  };

  const orderedSelectedOutlets = useMemo(
    () => outletsForPic.filter((o) => selectedOutlets.includes(o)),
    [outletsForPic, selectedOutlets]
  );

  const today = todayIso();
  const { memoTask } = useMemo(
    () => detectStockDiscrepancyTasks(config.tasks),
    [config.tasks]
  );

  const blocks = useMemo(() => {
    if (orderedSelectedOutlets.length === 0) return [];
    return buildPhotoOutletBlocks({
      outlets: orderedSelectedOutlets,
      config,
      store,
      days,
      targetDay: photoDay,
      today,
      discPendingOverrides,
    });
  }, [
    orderedSelectedOutlets,
    config,
    store,
    days,
    photoDay,
    today,
    discPendingOverrides,
  ]);

  useEffect(() => {
    if (!open || blocks.length === 0) {
      setPreviewDataUrl('');
      return;
    }
    try {
      const canvas = renderResultPhotoCanvas(blocks);
      setPreviewDataUrl(canvas.toDataURL('image/png'));
    } catch {
      setPreviewDataUrl('');
    }
  }, [open, blocks]);

  if (!open) return null;

  const workingMonth = photoDay.slice(0, 7);
  const workingYear = photoDay.slice(0, 4);
  const prevMonth1 = formatPhotoMonthUpper(shiftMonthKey(workingMonth, -1), workingYear);
  const prevMonth2 = formatPhotoMonthUpper(shiftMonthKey(workingMonth, -2), workingYear);

  const handleDownloadPng = async () => {
    if (blocks.length === 0) return;
    const canvas = renderResultPhotoCanvas(blocks);
    const blob = await canvasToPngBlob(canvas);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slugPic = (photoPerson || 'outlet').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    a.href = url;
    a.download = `hasil-update-${slugPic}-${photoDay}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleCopyPhoto = async () => {
    if (blocks.length === 0) return;
    try {
      if (
        typeof ClipboardItem === 'undefined' ||
        !navigator.clipboard?.write
      ) {
        throw new Error('Browser tidak mendukung salin gambar langsung.');
      }
      const canvas = renderResultPhotoCanvas(blocks);
      const blob = await canvasToPngBlob(canvas);
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      setCopyStatus('copied');
      setCopyMessage('Foto hasil disalin ke clipboard.');
    } catch {
      setCopyStatus('error');
      setCopyMessage('Salin otomatis tidak didukung browser; gunakan tombol Download PNG.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-photo-modal-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
              <ImageIcon className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3
                id="export-photo-modal-title"
                className="text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                Ekspor Foto Hasil Update
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Pilih outlet yang ingin disertakan, tinjau pratinjau hasil, lalu unduh atau salin foto PNG.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup ekspor foto"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* PIC, Date, and Outlet Checkboxes */}
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-800/35">
            <div>
              <label
                htmlFor="export-photo-day"
                className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Tanggal Kerja
              </label>
              <select
                id="export-photo-day"
                value={photoDay}
                onChange={(e) => handleChangeDay(e.target.value)}
                className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {days
                  .filter((d) => d <= today)
                  .slice()
                  .reverse()
                  .map((d) => (
                    <option key={d} value={d}>
                      {fmtDateLong(d)}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="export-photo-pic"
                className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Nama PIC
              </label>
              {lockedPic ? (
                <div className="flex min-h-[38px] items-center rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {formatPicTitle(lockedPic)} ({outletsForPic.length} outlet)
                </div>
              ) : (
                <select
                  id="export-photo-pic"
                  value={photoPerson}
                  onChange={(e) => handleChangePic(e.target.value)}
                  className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {personList.map((p) => (
                    <option key={p} value={p}>
                      {formatPicTitle(p)} ({(peopleMap[p] || []).length} outlet)
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="sm:col-span-2">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Outlet dalam Foto ({orderedSelectedOutlets.length}/{outletsForPic.length})
                </span>
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedOutlets(outletsForPic)}
                    className="font-medium text-blue-700 hover:underline dark:text-blue-400"
                  >
                    Pilih Semua
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const filled = outletsForPic.filter((o) =>
                        isOutletDayFilled(store, config.tasks, o, photoDay)
                      );
                      setSelectedOutlets(
                        filled.length > 0 ? filled : outletsForPic.slice(0, 1)
                      );
                    }}
                    className="font-medium text-slate-600 hover:underline dark:text-slate-300"
                  >
                    Outlet Terisi Saja
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {outletsForPic.map((code) => {
                  const checked = selectedOutlets.includes(code);
                  const hasEntry = isOutletDayFilled(
                    store,
                    config.tasks,
                    code,
                    photoDay
                  );
                  return (
                    <label
                      key={code}
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        checked
                          ? 'border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-200'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOutlet(code)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-semibold">{code}</span>
                      {!hasEntry && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          (kosong)
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            {memoTask && blocks.length > 0 && (
              <div className="border-t border-slate-200/80 pt-3 sm:col-span-2 dark:border-slate-700/70">
                <div className="mb-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Keterangan DISC PENDING (Otomatis dari Memo Discrepancy, dapat disesuaikan bila perlu):
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {blocks.map((b) => {
                    const currentVal = discPendingOverrides[b.outlet] ?? '__AUTO__';
                    return (
                      <div
                        key={b.outlet}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {b.outlet}
                        </span>
                        <select
                          aria-label={`DISC PENDING ${b.outlet}`}
                          value={currentVal}
                          onChange={(e) =>
                            setDiscPendingOverrides((prev) => ({
                              ...prev,
                              [b.outlet]: e.target.value,
                            }))
                          }
                          className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          <option value="__AUTO__">
                            Otomatis ({b.autoDiscPending})
                          </option>
                          <option value="-">- (Tidak ada)</option>
                          <option value={prevMonth1}>{prevMonth1}</option>
                          <option value={prevMonth2}>{prevMonth2}</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Live Image Preview */}
          <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Pratinjau Foto Hasil (PNG)</span>
              {blocks.length > 0 && (
                <span>{blocks.length} outlet ditampilkan</span>
              )}
            </div>

            {blocks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                Pilih minimal 1 outlet di atas untuk menampilkan pratinjau foto hasil.
              </div>
            ) : previewDataUrl ? (
              <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white shadow-xs dark:border-slate-700">
                <img
                  src={previewDataUrl}
                  alt={`Hasil update ${photoPerson} ${fmtDateLong(photoDay)}`}
                  className="mx-auto block h-auto max-w-full"
                />
              </div>
            ) : null}
          </div>

          {copyMessage && (
            <div
              role="status"
              className={`rounded-lg border px-3.5 py-2 text-xs font-medium ${
                copyStatus === 'copied'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300'
              }`}
            >
              {copyMessage}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t border-slate-200 bg-slate-50/70 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            disabled={blocks.length === 0}
            onClick={handleCopyPhoto}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {copyStatus === 'copied' ? (
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            <span>{copyStatus === 'copied' ? 'Tersalin' : 'Salin Foto'}</span>
          </button>

          <button
            type="button"
            disabled={blocks.length === 0}
            onClick={handleDownloadPng}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Download className="h-4 w-4" />
            <span>Download PNG</span>
          </button>

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
