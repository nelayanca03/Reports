import {
  Bell,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Edit3,
  MapPin,
  Repeat,
  RotateCcw,
  Trash2,
  UserCheck,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { formatFriendlyFirestoreError } from '../../firebase';
import {
  CalendarAssignStatus,
  CalendarEvent,
  PersonalReminder,
} from '../../types/outlet';
import {
  ROLE_LABELS,
  fmtDateSlash,
  fmtDateWeekdayLong,
  formatCalendarRecurrenceLabel,
  getEffectiveAssignResponse,
} from '../../utils/outletLogic';
import { ConfirmModal } from '../ConfirmModal';
import { CalendarGridItem } from './calendarUtils';

interface KalenderDetailModalProps {
  selectedItem: CalendarGridItem | null;
  isAdmin: boolean;
  viewerPicUpper: string;
  canRespondToAssign: boolean;
  confirmDeleteOpen: boolean;
  deleteBusy: boolean;
  onClose: () => void;
  onEditAssign: (event: CalendarEvent) => void;
  onEditPersonal: (reminder: PersonalReminder) => void;
  onUpdateAssignResponse: (
    eventId: string,
    input: {
      assignStatus: CalendarAssignStatus;
      returnTime?: string;
      cancelReason?: string;
      notificationDismissed?: boolean;
      targetPic?: string;
      forceGlobal?: boolean;
    }
  ) => Promise<void>;
  onOpenConfirmDelete: () => void;
  onCancelConfirmDelete: () => void;
  onDeleteSingleOccurrence: () => Promise<void>;
  onDeleteSeries: () => Promise<void>;
}

export function KalenderDetailModal({
  selectedItem,
  isAdmin,
  viewerPicUpper,
  canRespondToAssign,
  confirmDeleteOpen,
  deleteBusy,
  onClose,
  onEditAssign,
  onEditPersonal,
  onUpdateAssignResponse,
  onOpenConfirmDelete,
  onCancelConfirmDelete,
  onDeleteSingleOccurrence,
  onDeleteSeries,
}: KalenderDetailModalProps) {
  const [syncedKey, setSyncedKey] = useState('');
  const [returnTimeInput, setReturnTimeInput] = useState('');
  const [showCancelBox, setShowCancelBox] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState('');
  const [responseBusy, setResponseBusy] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);

  const selectedKey = selectedItem?.key || '';
  const effectiveResp =
    selectedItem?.kind === 'assign'
      ? getEffectiveAssignResponse(selectedItem.event, isAdmin ? undefined : viewerPicUpper)
      : null;
  const initialReturnTime = effectiveResp?.returnTime || '';
  const initialCancelReason = effectiveResp?.cancelReason || '';

  if (syncedKey !== selectedKey) {
    setSyncedKey(selectedKey);
    setReturnTimeInput(initialReturnTime);
    setCancelReasonInput(initialCancelReason);
    setShowCancelBox(false);
    setResponseError(null);
  }

  if (!selectedItem) return null;

  const isAssign = selectedItem.kind === 'assign';
  const assignEvent = isAssign ? selectedItem.event : null;
  const isDivisionAssign = assignEvent?.assignScope === 'division';
  const personalReminder = !isAssign ? selectedItem.reminder : null;
  const assignStatus: CalendarAssignStatus = effectiveResp?.status || 'assigned';
  const effectiveReturnTime = effectiveResp?.returnTime || '';
  const effectiveCancelReason = effectiveResp?.cancelReason || '';
  const canEditOrDelete = isAssign ? isAdmin : true;
  const divisionResponseEntries = isDivisionAssign
    ? Object.entries(assignEvent?.picResponses || {}).sort(([a], [b]) => a.localeCompare(b))
    : [];

  const handleSaveReturnTime = async () => {
    if (!assignEvent) return;
    setResponseError(null);
    const trimmed = returnTimeInput.trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
      setResponseError('Masukkan jam pulang yang valid (format HH:MM, contoh 15:30).');
      return;
    }
    setResponseBusy(true);
    try {
      await onUpdateAssignResponse(assignEvent.id, {
        assignStatus: 'completed',
        returnTime: trimmed,
        cancelReason: '',
        notificationDismissed: true,
        ...(!isAdmin && isDivisionAssign ? { targetPic: viewerPicUpper } : {}),
      });
      onClose();
    } catch (err) {
      setResponseError(formatFriendlyFirestoreError(err, 'Gagal menyimpan jam pulang.'));
    } finally {
      setResponseBusy(false);
    }
  };

  const handleConfirmNotGoing = async () => {
    if (!assignEvent) return;
    setResponseError(null);
    setResponseBusy(true);
    try {
      await onUpdateAssignResponse(assignEvent.id, {
        assignStatus: 'cancelled',
        returnTime: '',
        cancelReason: cancelReasonInput.trim(),
        notificationDismissed: true,
        ...(isDivisionAssign
          ? isAdmin
            ? { forceGlobal: true }
            : { targetPic: viewerPicUpper }
          : {}),
      });
      onClose();
    } catch (err) {
      setResponseError(formatFriendlyFirestoreError(err, 'Gagal membatalkan penugasan.'));
    } finally {
      setResponseBusy(false);
    }
  };

  const handleReactivateAssign = async () => {
    if (!assignEvent || !isAdmin) return;
    setResponseError(null);
    setResponseBusy(true);
    try {
      await onUpdateAssignResponse(assignEvent.id, {
        assignStatus: 'assigned',
        returnTime: '',
        cancelReason: '',
        notificationDismissed: false,
        ...(isDivisionAssign ? { forceGlobal: true } : {}),
      });
      onClose();
    } catch (err) {
      setResponseError(formatFriendlyFirestoreError(err, 'Gagal mengaktifkan kembali assign.'));
    } finally {
      setResponseBusy(false);
    }
  };

  const divisionRoleKey = assignEvent?.assignedDivision || assignEvent?.assignedRole;

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
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                {isAssign ? (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                      {isDivisionAssign ? (
                        <Users className="h-3 w-3" />
                      ) : (
                        <UserCheck className="h-3 w-3" />
                      )}
                      {isDivisionAssign ? 'Assign Divisi' : 'Assign PIC'}
                    </span>
                    {assignStatus === 'completed' ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" />
                        Selesai · Pulang {effectiveReturnTime}
                      </span>
                    ) : assignStatus === 'cancelled' ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                        <XCircle className="h-3 w-3" />
                        Tidak Jadi Pergi (0 Kunjungan)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                        Ditugaskan (+1 Kunjungan)
                      </span>
                    )}
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300">
                    <Bell className="h-3 w-3" />
                    Reminder Personal
                  </span>
                )}
              </div>
              <h3
                id="event-detail-title"
                className={`text-lg font-bold text-slate-900 dark:text-slate-100 ${
                  isAssign && assignStatus === 'cancelled' ? 'line-through opacity-75' : ''
                }`}
              >
                {selectedItem.title}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup detail"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 space-y-3 text-sm">
            {isAssign && assignEvent && (
              <>
                <div className="flex items-center gap-3 text-slate-700 dark:text-slate-200">
                  {isDivisionAssign ? (
                    <Users className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" />
                  ) : (
                    <UserCheck className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" />
                  )}
                  <div>
                    {isDivisionAssign ? (
                      <>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Divisi Tujuan:{' '}
                        </span>
                        <span className="font-semibold">
                          {divisionRoleKey ? ROLE_LABELS[divisionRoleKey] || divisionRoleKey : '—'}
                        </span>
                        <span className="ml-1.5 text-xs text-slate-500 dark:text-slate-400">
                          (Semua akun divisi)
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-slate-500 dark:text-slate-400">PIC Tujuan: </span>
                        <span className="font-semibold">{assignEvent.assignedPic || '—'}</span>
                        {assignEvent.assignedRole && (
                          <span className="ml-1.5 text-xs text-slate-500 dark:text-slate-400">
                            ({ROLE_LABELS[assignEvent.assignedRole] || assignEvent.assignedRole})
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {assignEvent.assignedOutlet && (
                  <div className="flex items-center gap-3 text-slate-700 dark:text-slate-200">
                    <MapPin className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" />
                    <div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">Outlet: </span>
                      <span className="font-mono font-semibold">{assignEvent.assignedOutlet}</span>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex items-center gap-3 text-slate-700 dark:text-slate-200">
              <CalendarIcon className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" />
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400">Tanggal: </span>
                <span className="font-semibold">
                  {fmtDateWeekdayLong(selectedItem.occurrenceDate)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-slate-700 dark:text-slate-200">
              <Clock className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" />
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {isAssign ? 'Jam Berangkat: ' : 'Jam Reminder: '}
                </span>
                <span className="font-mono font-semibold tabular-nums">
                  {selectedItem.startTime} WIB
                </span>
                {isAssign && effectiveReturnTime && assignStatus !== 'cancelled' && (
                  <span className="ml-2 font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    → Pulang {effectiveReturnTime} WIB
                  </span>
                )}
              </div>
            </div>

            {!isAssign && personalReminder && selectedItem.isRecurring && (
              <div className="flex items-start gap-3 text-slate-700 dark:text-slate-200">
                <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-violet-700 dark:text-violet-400" />
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Pengulangan: </span>
                  <span className="font-semibold">
                    {formatCalendarRecurrenceLabel(personalReminder)}
                  </span>
                  {selectedItem.occurrenceDate !== personalReminder.date && (
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      Mulai seri: {fmtDateSlash(personalReminder.date)}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Catatan
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-100">
                {(isAssign ? assignEvent?.notes : personalReminder?.notes) || 'Tidak ada catatan.'}
              </p>
            </div>

            {isAssign && assignEvent && assignStatus === 'cancelled' && effectiveCancelReason && (
              <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                <span className="font-semibold">Alasan tidak jadi pergi: </span>
                {effectiveCancelReason}
              </div>
            )}

            {isAssign && isAdmin && isDivisionAssign && divisionResponseEntries.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Status Laporan Per PIC ({divisionResponseEntries.length})
                </div>
                <div className="space-y-1.5 text-xs">
                  {divisionResponseEntries.map(([picName, resp]) => (
                    <div
                      key={picName}
                      className="flex items-center justify-between gap-2 rounded-md border border-slate-200/80 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                    >
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {picName}
                      </span>
                      {resp.status === 'completed' ? (
                        <span className="font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          Selesai · Pulang {resp.returnTime} WIB
                        </span>
                      ) : resp.status === 'cancelled' ? (
                        <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-400">
                          Tidak Jadi Pergi (0){resp.cancelReason ? ` · ${resp.cancelReason}` : ''}
                        </span>
                      ) : (
                        <span className="text-[11px] text-amber-700 dark:text-amber-400">
                          Ditugaskan
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isAssign && assignEvent && canRespondToAssign && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/60 dark:bg-blue-950/25">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {isDivisionAssign && !isAdmin
                    ? 'Laporan Kepulangan / Kehadiran Anda'
                    : isDivisionAssign && isAdmin
                      ? 'Kontrol Status Assign Divisi'
                      : 'Laporan Kepulangan / Kehadiran Assign'}
                </div>

                {responseError && (
                  <div className="mt-2 overflow-hidden break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium leading-relaxed text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
                    {responseError}
                  </div>
                )}

                {assignStatus !== 'cancelled' ? (
                  <div className="mt-3 space-y-3">
                    {(!isDivisionAssign || !isAdmin) && (
                      <div className="flex flex-wrap items-end gap-2.5">
                        <div className="min-w-[150px] flex-1">
                          <label
                            htmlFor="assign-return-time"
                            className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-300"
                          >
                            Jam Pulang dari Assign (WIB)
                          </label>
                          <input
                            id="assign-return-time"
                            type="time"
                            value={returnTimeInput}
                            onChange={(e) => setReturnTimeInput(e.target.value)}
                            className="min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-semibold text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={responseBusy}
                          onClick={handleSaveReturnTime}
                          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>{responseBusy ? 'Menyimpan...' : 'Simpan Jam Pulang'}</span>
                        </button>
                      </div>
                    )}

                    {!showCancelBox ? (
                      <div
                        className={
                          !isDivisionAssign || !isAdmin
                            ? 'border-t border-blue-200/70 pt-2.5 dark:border-blue-900/50'
                            : ''
                        }
                      >
                        <button
                          type="button"
                          disabled={responseBusy}
                          onClick={() => setShowCancelBox(true)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:underline dark:text-rose-400"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>
                            {isDivisionAssign && isAdmin
                              ? 'Batalkan Assign Divisi Ini (0 Kunjungan)'
                              : 'Tidak Jadi Pergi (Batalkan Kunjungan = 0)'}
                          </span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2 rounded-lg border border-rose-200 bg-white p-3 dark:border-rose-900/60 dark:bg-slate-900">
                        <label
                          htmlFor="assign-cancel-reason"
                          className="block text-[11px] font-semibold text-rose-700 dark:text-rose-300"
                        >
                          Alasan tidak jadi pergi (opsional)
                        </label>
                        <input
                          id="assign-cancel-reason"
                          type="text"
                          maxLength={200}
                          value={cancelReasonInput}
                          onChange={(e) => setCancelReasonInput(e.target.value)}
                          placeholder="Contoh: Jadwal diundur / outlet tutup"
                          className="min-h-[36px] w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-rose-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={responseBusy}
                            onClick={() => setShowCancelBox(false)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            disabled={responseBusy}
                            onClick={handleConfirmNotGoing}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Konfirmasi Tidak Jadi Pergi</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 space-y-2.5">
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Penugasan ini dibatalkan (tidak jadi pergi), sehingga tidak menambah kunjungan (0 kunjungan).
                    </p>
                    {isAdmin && (
                      <button
                        type="button"
                        disabled={responseBusy}
                        onClick={handleReactivateAssign}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-blue-950/60"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Aktifkan Kembali Assign</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <UserCheck className="h-3.5 w-3.5 shrink-0" />
              <span>
                Dibuat oleh{' '}
                {isAssign ? assignEvent?.createdByName : personalReminder?.createdByName} (
                {isAssign ? assignEvent?.createdByEmail : personalReminder?.createdByEmail})
              </span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
            {canEditOrDelete && (
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
                  onClick={() => {
                    if (isAssign && assignEvent) {
                      onEditAssign(assignEvent);
                    } else if (personalReminder) {
                      onEditPersonal(personalReminder);
                    }
                  }}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>{isAssign ? 'Edit Assign' : 'Edit Reminder'}</span>
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

      {confirmDeleteOpen && !selectedItem.isRecurring && (
        <ConfirmModal
          open={true}
          title={
            isAssign
              ? `Hapus assign "${selectedItem.title}"?`
              : `Hapus reminder "${selectedItem.title}"?`
          }
          description={
            isAssign
              ? 'Assign yang dihapus akan hilang dari kalender PIC terkait dan kunjungan otomatisnya ikut dihapus.'
              : 'Reminder personal ini akan dihapus dari kalender Anda.'
          }
          confirmLabel={isAssign ? 'Ya, Hapus Assign' : 'Ya, Hapus Reminder'}
          destructive
          onCancel={onCancelConfirmDelete}
          onConfirm={onDeleteSeries}
        />
      )}

      {confirmDeleteOpen && selectedItem.isRecurring && (
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
              Hapus Reminder Berulang
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Reminder <span className="font-semibold">"{selectedItem.title}"</span> merupakan
              jadwal berulang. Pilih apakah ingin menghapus tanggal{' '}
              <span className="font-mono font-semibold">
                {fmtDateSlash(selectedItem.occurrenceDate)}
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
                  : `Hapus Tanggal Ini Saja (${fmtDateSlash(selectedItem.occurrenceDate)})`}
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={onDeleteSeries}
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
