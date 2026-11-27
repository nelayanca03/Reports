import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Maximize2,
  Pencil,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { CalendarBannerMedia } from '../../types/outlet';
import { ConfirmModal } from '../ConfirmModal';

interface KalenderBannerImageProps {
  isAdmin: boolean;
  banners: CalendarBannerMedia[];
  onAddBanner: (input: {
    imageDataUrl: string;
    caption?: string;
    fileName?: string;
    sortOrder?: number;
  }) => Promise<string>;
  onUpdateBanner: (
    mediaId: string,
    input: {
      imageDataUrl: string;
      caption?: string;
      fileName?: string;
      sortOrder?: number;
    }
  ) => Promise<void>;
  onDeleteBanner: (mediaId: string) => Promise<void>;
}

interface StagedUploadItem {
  tempId: string;
  imageDataUrl: string;
  fileName: string;
  caption: string;
}

const MAX_DATA_URL_LENGTH = 680_000;
const MAX_DIMENSION = 1600;
const MAX_CALENDAR_IMAGES = 15;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal membaca file gambar.'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('File bukan gambar yang valid atau rusak.'));
    img.src = src;
  });
}

async function compressImageToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`"${file.name}" bukan file gambar (gunakan PNG, JPG, WEBP, atau GIF).`);
  }
  if (file.type === 'image/svg+xml') {
    throw new Error(`Format SVG pada "${file.name}" tidak didukung. Gunakan PNG, JPG, atau WEBP.`);
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  if (
    rawDataUrl.length <= MAX_DATA_URL_LENGTH &&
    /^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(rawDataUrl)
  ) {
    return rawDataUrl;
  }

  const img = await loadImageElement(rawDataUrl);
  const scaleSteps = [1, 0.85, 0.7, 0.55, 0.4];
  const qualitySteps = [0.88, 0.78, 0.68, 0.56];

  for (const scaleFactor of scaleSteps) {
    const baseRatio = Math.min(1, MAX_DIMENSION / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round(img.width * baseRatio * scaleFactor));
    const height = Math.max(1, Math.round(img.height * baseRatio * scaleFactor));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Browser tidak mendukung pemrosesan gambar.');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    for (const quality of qualitySteps) {
      const webpUrl = canvas.toDataURL('image/webp', quality);
      if (
        webpUrl.startsWith('data:image/webp;base64,') &&
        webpUrl.length <= MAX_DATA_URL_LENGTH
      ) {
        return webpUrl;
      }
      const jpegUrl = canvas.toDataURL('image/jpeg', quality);
      if (jpegUrl.length <= MAX_DATA_URL_LENGTH) {
        return jpegUrl;
      }
    }
  }

  throw new Error(
    `Ukuran gambar "${file.name}" terlalu besar. Gunakan gambar dengan resolusi lebih kecil.`
  );
}

export function KalenderBannerImage({
  isAdmin,
  banners,
  onAddBanner,
  onUpdateBanner,
  onDeleteBanner,
}: KalenderBannerImageProps) {
  const addFileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);

  const [stagedUploads, setStagedUploads] = useState<StagedUploadItem[]>([]);
  const [editingBanner, setEditingBanner] = useState<CalendarBannerMedia | null>(null);
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editFileName, setEditFileName] = useState('');
  const [editCaption, setEditCaption] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingBanner, setDeletingBanner] = useState<CalendarBannerMedia | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const activeLightboxBanner =
    lightboxIndex !== null && lightboxIndex >= 0 && lightboxIndex < banners.length
      ? banners[lightboxIndex]
      : null;

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setLightboxIndex(null);
      } else if (ev.key === 'ArrowRight' && banners.length > 1) {
        setLightboxIndex((prev) => (prev === null ? null : (prev + 1) % banners.length));
      } else if (ev.key === 'ArrowLeft' && banners.length > 1) {
        setLightboxIndex((prev) =>
          prev === null ? null : (prev - 1 + banners.length) % banners.length
        );
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxIndex, banners.length]);

  // Regular users see nothing if Admin has not uploaded any image
  if (!isAdmin && banners.length === 0) {
    return null;
  }

  const remainingSlots = Math.max(0, MAX_CALENDAR_IMAGES - banners.length - stagedUploads.length);

  const handleAddFilesChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (fileList.length === 0) return;

    setError(null);
    if (banners.length + stagedUploads.length >= MAX_CALENDAR_IMAGES) {
      setError(`Maksimal ${MAX_CALENDAR_IMAGES} gambar dapat ditampilkan di bawah kalender.`);
      return;
    }

    const allowedFiles = fileList.slice(0, remainingSlots);
    const truncated = fileList.length > allowedFiles.length;

    setBusy(true);
    try {
      const nextItems: StagedUploadItem[] = [];
      const errors: string[] = [];
      for (const file of allowedFiles) {
        try {
          const compressed = await compressImageToDataUrl(file);
          nextItems.push({
            tempId: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            imageDataUrl: compressed,
            fileName: file.name.slice(0, 120),
            caption: '',
          });
        } catch (err) {
          errors.push(err instanceof Error ? err.message : `Gagal memproses ${file.name}.`);
        }
      }

      if (nextItems.length > 0) {
        setEditingBanner(null);
        setStagedUploads((prev) => [...prev, ...nextItems]);
      }

      if (errors.length > 0) {
        setError(errors.join(' '));
      } else if (truncated) {
        setError(
          `Sebagian gambar dilewati karena batas maksimal adalah ${MAX_CALENDAR_IMAGES} gambar.`
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSaveStagedUploads = async () => {
    if (!isAdmin || stagedUploads.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const maxExistingOrder = banners.reduce(
        (max, b) => Math.max(max, typeof b.sortOrder === 'number' ? b.sortOrder : 0),
        0
      );
      let nextOrder = maxExistingOrder + 1;
      for (const item of stagedUploads) {
        await onAddBanner({
          imageDataUrl: item.imageDataUrl,
          caption: item.caption.trim(),
          fileName: item.fileName || 'kalender-gambar.jpg',
          sortOrder: nextOrder,
        });
        nextOrder += 1;
      }
      setStagedUploads([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan gambar.');
    } finally {
      setBusy(false);
    }
  };

  const openEditBanner = (banner: CalendarBannerMedia) => {
    if (!isAdmin) return;
    setStagedUploads([]);
    setEditingBanner(banner);
    setEditImageUrl(banner.imageDataUrl);
    setEditFileName(banner.fileName);
    setEditCaption(banner.caption);
    setError(null);
  };

  const handleReplaceFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const compressed = await compressImageToDataUrl(file);
      setEditImageUrl(compressed);
      setEditFileName(file.name.slice(0, 120));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memproses gambar.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEditedBanner = async () => {
    if (!isAdmin || !editingBanner || !editImageUrl) return;
    setBusy(true);
    setError(null);
    try {
      await onUpdateBanner(editingBanner.id, {
        imageDataUrl: editImageUrl,
        caption: editCaption.trim(),
        fileName: editFileName || editingBanner.fileName || 'kalender-gambar.jpg',
        sortOrder: editingBanner.sortOrder,
      });
      setEditingBanner(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui gambar.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!isAdmin || !deletingBanner) return;
    setBusy(true);
    setError(null);
    try {
      const targetId = deletingBanner.id;
      await onDeleteBanner(targetId);
      setDeletingBanner(null);
      if (editingBanner?.id === targetId) {
        setEditingBanner(null);
      }
      setLightboxIndex(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus gambar.');
      setDeletingBanner(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <input
        ref={addFileInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => void handleAddFilesChange(e)}
        className="hidden"
      />
      <input
        ref={replaceFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => void handleReplaceFileChange(e)}
        className="hidden"
      />

      {/* Section header (Admin always sees Add button; regular users see clean header if multiple images) */}
      {(isAdmin || banners.length > 1) && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 px-4 py-3 sm:px-5 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ImagePlus className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" />
            <h3 className="text-xs font-semibold text-slate-800 sm:text-sm dark:text-slate-100">
              Gambar Informasi Kalender
            </h3>
            {banners.length > 0 && (
              <span className="font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                ({banners.length})
              </span>
            )}
          </div>

          {isAdmin && (
            <button
              type="button"
              disabled={busy || banners.length + stagedUploads.length >= MAX_CALENDAR_IMAGES}
              onClick={() => addFileInputRef.current?.click()}
              className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Tambah Gambar</span>
            </button>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 sm:mx-5 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {/* Empty state (Admin only) */}
      {isAdmin && banners.length === 0 && stagedUploads.length === 0 && !editingBanner && (
        <div className="px-4 py-4 text-xs text-slate-500 sm:px-5 dark:text-slate-400">
          Belum ada gambar informasi di bawah kalender. Admin dapat menambahkan satu atau lebih gambar yang hanya dapat dilihat oleh semua user.
        </div>
      )}

      {/* Staged New Uploads Panel (Admin only) */}
      {isAdmin && stagedUploads.length > 0 && (
        <div className="space-y-3 border-b border-slate-100 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-800/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Siap Ditambahkan ({stagedUploads.length} gambar)
            </h4>
            {remainingSlots > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => addFileInputRef.current?.click()}
                className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Tambah Lagi</span>
              </button>
            )}
          </div>

          <div
            className={`grid grid-cols-1 gap-3 ${
              stagedUploads.length > 1 ? 'md:grid-cols-2' : ''
            }`}
          >
            {stagedUploads.map((item, idx) => (
              <div
                key={item.tempId}
                className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Gambar baru #{idx + 1} · {item.fileName}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setStagedUploads((prev) => prev.filter((x) => x.tempId !== item.tempId))
                    }
                    aria-label={`Batalkan ${item.fileName}`}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-red-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="overflow-hidden rounded-md border border-slate-100 bg-slate-50 p-1.5 dark:border-slate-800 dark:bg-slate-950/40">
                  <img
                    src={item.imageDataUrl}
                    alt={item.caption || item.fileName}
                    className="mx-auto max-h-[260px] w-auto max-w-full rounded object-contain"
                  />
                </div>

                <input
                  type="text"
                  maxLength={200}
                  value={item.caption}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setStagedUploads((prev) =>
                      prev.map((x) => (x.tempId === item.tempId ? { ...x, caption: nextVal } : x))
                    );
                  }}
                  placeholder="Keterangan / judul gambar (opsional)"
                  className="min-h-[36px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setStagedUploads([]);
                setError(null);
              }}
              className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSaveStagedUploads()}
              className="min-h-[36px] rounded-lg bg-blue-700 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {busy
                ? 'Menyimpan...'
                : stagedUploads.length > 1
                  ? `Simpan ${stagedUploads.length} Gambar`
                  : 'Simpan Gambar'}
            </button>
          </div>
        </div>
      )}

      {/* Edit Existing Image Panel (Admin only) */}
      {isAdmin && editingBanner && (
        <div className="space-y-3 border-b border-slate-100 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-800/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Ubah Gambar Kalender
            </h4>
            <button
              type="button"
              onClick={() => replaceFileInputRef.current?.click()}
              disabled={busy}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Ganti File Gambar</span>
            </button>
          </div>

          {editImageUrl && (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-950/40">
              <img
                src={editImageUrl}
                alt={editCaption || 'Pratinjau gambar kalender'}
                className="mx-auto max-h-[340px] w-auto max-w-full rounded object-contain"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="calendar-banner-edit-caption"
              className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Keterangan / Judul Gambar (Opsional)
            </label>
            <input
              id="calendar-banner-edit-caption"
              type="text"
              maxLength={200}
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              placeholder="Contoh: Jadwal Libur & Pengumuman Bulan Ini"
              className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditingBanner(null);
                setError(null);
              }}
              className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={busy || !editImageUrl}
              onClick={() => void handleSaveEditedBanner()}
              className="min-h-[36px] rounded-lg bg-blue-700 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {busy ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </div>
      )}

      {/* Published Gallery Grid (Admin + Read-Only Users) */}
      {banners.length > 0 && (
        <div className="p-3 sm:p-4">
          <div
            className={`grid grid-cols-1 gap-4 ${
              banners.length > 1 ? 'md:grid-cols-2' : ''
            }`}
          >
            {banners.map((banner, index) => (
              <div
                key={banner.id}
                className="flex flex-col overflow-hidden rounded-lg border border-slate-200/90 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-950/30"
              >
                {(banner.caption || isAdmin) && (
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-white px-3.5 py-2 dark:border-slate-800 dark:bg-slate-900/90">
                    <div className="min-w-0 truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {banner.caption || `Gambar #${index + 1}`}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setLightboxIndex(index)}
                        aria-label="Perbesar gambar"
                        title="Perbesar"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditBanner(banner)}
                            aria-label={`Ubah gambar ${index + 1}`}
                            title="Edit"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-800 dark:hover:bg-blue-950/50 dark:hover:text-blue-400"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingBanner(banner)}
                            aria-label={`Hapus gambar ${index + 1}`}
                            title="Hapus"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setLightboxIndex(index)}
                  aria-label="Klik untuk memperbesar gambar"
                  className="group relative flex flex-1 items-center justify-center p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  <img
                    src={banner.imageDataUrl}
                    alt={banner.caption || `Gambar informasi kalender ${index + 1}`}
                    className={`mx-auto w-auto max-w-full rounded object-contain transition-opacity group-hover:opacity-95 ${
                      banners.length === 1 ? 'max-h-[640px]' : 'max-h-[420px]'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fullscreen Lightbox Viewer (Read-only for everyone) */}
      {activeLightboxBanner && lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={activeLightboxBanner.caption || 'Pratinjau gambar kalender'}
          onClick={() => setLightboxIndex(null)}
        >
          <div
            className="relative flex max-h-[92vh] max-w-[94vw] flex-col items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              aria-label="Tutup pratinjau gambar"
              className="absolute -top-3 -right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-lg hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>

            {banners.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setLightboxIndex((lightboxIndex - 1 + banners.length) % banners.length)
                  }
                  aria-label="Gambar sebelumnya"
                  className="absolute top-1/2 left-2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-slate-800 shadow-lg transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-100"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxIndex((lightboxIndex + 1) % banners.length)}
                  aria-label="Gambar berikutnya"
                  className="absolute top-1/2 right-2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-slate-800 shadow-lg transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-100"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}

            <img
              src={activeLightboxBanner.imageDataUrl}
              alt={activeLightboxBanner.caption || 'Gambar informasi kalender'}
              className="max-h-[82vh] max-w-[90vw] rounded-lg bg-white object-contain shadow-2xl"
            />

            <div className="flex items-center gap-2 rounded-lg bg-slate-900/85 px-4 py-1.5 text-center text-xs font-medium text-white">
              {banners.length > 1 && (
                <span className="font-mono text-slate-300 tabular-nums">
                  {lightboxIndex + 1} / {banners.length}
                </span>
              )}
              {activeLightboxBanner.caption && (
                <>
                  {banners.length > 1 && <span aria-hidden="true">·</span>}
                  <span>{activeLightboxBanner.caption}</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <ConfirmModal
          open={Boolean(deletingBanner)}
          title="Hapus gambar kalender?"
          description="Gambar ini akan dihapus dan tidak lagi tampil di bawah kalender untuk semua user."
          confirmLabel="Ya, Hapus Gambar"
          destructive
          onCancel={() => setDeletingBanner(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      )}
    </section>
  );
}
