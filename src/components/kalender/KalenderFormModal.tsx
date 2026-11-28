import { Bell, CheckSquare, Repeat, Square, UserCheck, Users, X } from 'lucide-react';
import { FormEvent } from 'react';
import {
  CalendarAssignScope,
  CalendarRecurrenceFreq,
  OperationalRoleId,
} from '../../types/outlet';
import {
  AssignablePicOption,
  CALENDAR_TIME_SLOTS,
  ROLE_LABELS,
  formatCalendarRecurrenceLabel,
  normalizeCalendarInterval,
  parseUtcDate,
} from '../../utils/outletLogic';
import {
  ALL_DEPARTMENTS,
  ASSIGN_TITLE_PRESETS,
  AssignTitleDropdownValue,
  CalendarFormMode,
  WEEKDAY_DOW_MAP,
} from './calendarUtils';

interface KalenderFormModalProps {
  open: boolean;
  isAdmin: boolean;
  mode: CalendarFormMode;
  editingId: string | null;
  busy: boolean;
  formError: string | null;
  formTitle: string;
  formTitlePreset: AssignTitleDropdownValue;
  formDate: string;
  formStartTime: string;
  formNotes: string;
  // Assign mode fields
  assignablePics: AssignablePicOption[];
  allMasterOutlets: string[];
  formAssignScope: CalendarAssignScope;
  formAssignedDivisions: OperationalRoleId[];
  formAssignedPicKeys: string[];
  formAssignedOutlet: string;
  // Recurrence fields (Personal reminder & Assign Divisi)
  formRepeatFreq: CalendarRecurrenceFreq;
  formRepeatInterval: number;
  formRepeatWeekdays: number[];
  formRepeatEndMode: 'never' | 'until';
  formRepeatUntil: string;
  formExcludedDates: string[];
  onClose: () => void;
  onChangeMode: (nextMode: CalendarFormMode) => void;
  onSubmit: (e: FormEvent) => Promise<void>;
  onChangeTitle: (value: string) => void;
  onChangeTitlePreset: (preset: AssignTitleDropdownValue) => void;
  onChangeDate: (value: string) => void;
  onChangeStartTime: (value: string) => void;
  onChangeNotes: (value: string) => void;
  onChangeAssignScope: (scope: CalendarAssignScope) => void;
  onToggleAssignedDivision: (roleId: OperationalRoleId) => void;
  onToggleAllAssignedDivisions: () => void;
  onToggleAssignedPicKey: (picKey: string) => void;
  onSelectAllAssignedPics: () => void;
  onClearAssignedPics: () => void;
  onChangeAssignedOutlet: (outlet: string) => void;
  onChangeRepeatFreq: (freq: CalendarRecurrenceFreq) => void;
  onChangeRepeatInterval: (interval: number) => void;
  onChangeRepeatEndMode: (mode: 'never' | 'until') => void;
  onChangeRepeatUntil: (value: string) => void;
  onToggleRepeatWeekday: (dow: number) => void;
  onRestoreExcludedDates: () => void;
}

export function KalenderFormModal({
  open,
  isAdmin,
  mode,
  editingId,
  busy,
  formError,
  formTitle,
  formTitlePreset,
  formDate,
  formStartTime,
  formNotes,
  assignablePics,
  allMasterOutlets,
  formAssignScope,
  formAssignedDivisions,
  formAssignedPicKeys,
  formAssignedOutlet,
  formRepeatFreq,
  formRepeatInterval,
  formRepeatWeekdays,
  formRepeatEndMode,
  formRepeatUntil,
  formExcludedDates,
  onClose,
  onChangeMode,
  onSubmit,
  onChangeTitle,
  onChangeTitlePreset,
  onChangeDate,
  onChangeStartTime,
  onChangeNotes,
  onChangeAssignScope,
  onToggleAssignedDivision,
  onToggleAllAssignedDivisions,
  onToggleAssignedPicKey,
  onSelectAllAssignedPics,
  onClearAssignedPics,
  onChangeAssignedOutlet,
  onChangeRepeatFreq,
  onChangeRepeatInterval,
  onChangeRepeatEndMode,
  onChangeRepeatUntil,
  onToggleRepeatWeekday,
  onRestoreExcludedDates,
}: KalenderFormModalProps) {
  if (!open) return null;

  const isAssignMode = mode === 'assign';
  const isDivisionScope = formAssignScope === 'division';
  const showRecurrenceSection = !isAssignMode || isDivisionScope;

  const selectedPicOptions = assignablePics.filter((p) =>
    formAssignedPicKeys.includes(`${p.roleId}|${p.picUpper}`)
  );
  const picOutlets = isDivisionScope
    ? []
    : Array.from(new Set(selectedPicOptions.flatMap((p) => p.outlets)));
  const otherOutlets = allMasterOutlets.filter((o) => !picOutlets.includes(o));

  const rolesOrder: OperationalRoleId[] = ALL_DEPARTMENTS;
  const isAllDivisionsSelected = rolesOrder.every((r) => formAssignedDivisions.includes(r));

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
          <div className="flex items-start gap-2.5">
            <span
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                isAssignMode
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-400'
                  : 'bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-400'
              }`}
            >
              {isAssignMode ? (
                isDivisionScope ? (
                  <Users className="h-4 w-4" />
                ) : (
                  <UserCheck className="h-4 w-4" />
                )
              ) : (
                <Bell className="h-4 w-4" />
              )}
            </span>
            <div>
              <h3
                id="event-form-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                {isAssignMode
                  ? editingId
                    ? 'Edit Assign'
                    : isDivisionScope
                      ? 'Buat Assign Divisi'
                      : 'Buat Assign PIC'
                  : editingId
                    ? 'Edit Reminder Personal'
                    : 'Buat Reminder Personal'}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {isAssignMode
                  ? isDivisionScope
                    ? 'Assign tampil di kalender semua akun divisi yang dipilih saat login, memicu notifikasi pop-up, dan otomatis menambah kunjungan.'
                    : 'Assign langsung tampil di akun PIC yang dipilih saat login, memicu notifikasi pop-up, dan otomatis menambah kunjungan.'
                  : 'Reminder personal bersifat privat dan hanya tampil di kalender Anda sendiri.'}
              </p>
            </div>
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

        {isAdmin && !editingId && (
          <div className="mt-4 inline-flex w-full rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => onChangeMode('assign')}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                isAssignMode
                  ? 'bg-blue-700 text-white dark:bg-blue-600'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
              }`}
            >
              Assign PIC / Divisi
            </button>
            <button
              type="button"
              onClick={() => onChangeMode('personal')}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                !isAssignMode
                  ? 'bg-violet-700 text-white dark:bg-violet-600'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
              }`}
            >
              Reminder Personal
            </button>
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          {formError && (
            <div className="overflow-hidden break-words rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium leading-relaxed text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300">
              {formError}
            </div>
          )}

          {/* 1. Target Penugasan (Assign Mode) */}
          {isAssignMode && (
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Target Penugasan
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChangeAssignScope('pic')}
                  className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    !isDivisionScope
                      ? 'border-blue-700 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-200'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  <span>PIC Khusus</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeAssignScope('division')}
                  className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isDivisionScope
                      ? 'border-blue-700 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-200'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Assign Divisi</span>
                </button>
              </div>
            </div>
          )}

          {/* 2. Tanggal & Jam Berangkat */}
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
                {isAssignMode ? 'Jam Berangkat (08:00 – 19:00)' : 'Jam Reminder (08:00 – 19:00)'}
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

          {/* 3. Judul Tugas / Penugasan */}
          <div>
            <label
              htmlFor="evt-title"
              className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              {isAssignMode ? 'Judul Tugas / Penugasan' : 'Judul Reminder'}
            </label>
            {isAssignMode ? (
              <div className="space-y-2">
                <select
                  id="evt-title"
                  value={formTitlePreset}
                  onChange={(e) =>
                    onChangeTitlePreset(e.target.value as AssignTitleDropdownValue)
                  }
                  className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {ASSIGN_TITLE_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                  <option value="custom">Lainnya : Isi sendiri</option>
                </select>

                {formTitlePreset === 'custom' && (
                  <input
                    id="evt-title-custom"
                    type="text"
                    required
                    maxLength={120}
                    value={formTitle}
                    onChange={(e) => onChangeTitle(e.target.value)}
                    placeholder="Isi judul tugas / penugasan sendiri..."
                    className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                )}
              </div>
            ) : (
              <input
                id="evt-title"
                type="text"
                required
                maxLength={120}
                value={formTitle}
                onChange={(e) => onChangeTitle(e.target.value)}
                placeholder="Contoh: Kirim laporan mingguan, Cek selisih stok"
                className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            )}
          </div>

          {/* 4. PIC / Divisi & Outlet Tujuan */}
          {isAssignMode && (
            <div className="space-y-3">
              {!isDivisionScope ? (
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      PIC Tujuan ({formAssignedPicKeys.length} dipilih)
                    </span>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={onSelectAllAssignedPics}
                        className="font-semibold text-blue-700 hover:underline dark:text-blue-400"
                      >
                        Pilih Semua
                      </button>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <button
                        type="button"
                        onClick={onClearAssignedPics}
                        className="font-semibold text-slate-500 hover:underline dark:text-slate-400"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div className="max-h-44 space-y-2.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-700 dark:bg-slate-800/50">
                    {assignablePics.length === 0 ? (
                      <p className="py-2 text-center text-xs text-slate-500 dark:text-slate-400">
                        Belum ada daftar PIC.
                      </p>
                    ) : (
                      rolesOrder.map((roleId) => {
                        const group = assignablePics.filter((p) => p.roleId === roleId);
                        if (group.length === 0) return null;
                        return (
                          <div key={roleId}>
                            <div className="mb-1 text-[10px] font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400">
                              {ROLE_LABELS[roleId]}
                            </div>
                            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                              {group.map((opt) => {
                                const key = `${opt.roleId}|${opt.picUpper}`;
                                const checked = formAssignedPicKeys.includes(key);
                                return (
                                  <button
                                    key={key}
                                    type="button"
                                    onClick={() => onToggleAssignedPicKey(key)}
                                    className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                                      checked
                                        ? 'border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-200'
                                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                                    }`}
                                  >
                                    {checked ? (
                                      <CheckSquare className="h-3.5 w-3.5 shrink-0 text-blue-700 dark:text-blue-400" />
                                    ) : (
                                      <Square className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                                    )}
                                    <span className="truncate">
                                      {opt.pic}
                                      {opt.outlets.length > 0
                                        ? ` (${opt.outlets.length} outlet)`
                                        : ''}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Divisi Tujuan ({formAssignedDivisions.length} dipilih)
                    </span>
                    <button
                      type="button"
                      onClick={onToggleAllAssignedDivisions}
                      className="text-[11px] font-semibold text-blue-700 hover:underline dark:text-blue-400"
                    >
                      {isAllDivisionsSelected ? 'Pilih Satu Saja' : 'Pilih Semua Divisi'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={onToggleAllAssignedDivisions}
                      className={`flex min-h-[38px] items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-xs font-semibold transition-colors ${
                        isAllDivisionsSelected
                          ? 'border-blue-700 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-200'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      {isAllDivisionsSelected ? (
                        <CheckSquare className="h-3.5 w-3.5 shrink-0 text-blue-700 dark:text-blue-400" />
                      ) : (
                        <Square className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                      )}
                      <span>Semua Divisi (All Divisi)</span>
                    </button>
                    {rolesOrder.map((roleId) => {
                      const checked = formAssignedDivisions.includes(roleId);
                      return (
                        <button
                          key={roleId}
                          type="button"
                          onClick={() => onToggleAssignedDivision(roleId)}
                          className={`flex min-h-[38px] items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-xs font-semibold transition-colors ${
                            checked
                              ? 'border-blue-700 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-200'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                          }`}
                        >
                          {checked ? (
                            <CheckSquare className="h-3.5 w-3.5 shrink-0 text-blue-700 dark:text-blue-400" />
                          ) : (
                            <Square className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                          )}
                          <span>{ROLE_LABELS[roleId]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="assign-outlet-select"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Outlet Tujuan (Opsional)
                </label>
                <select
                  id="assign-outlet-select"
                  value={formAssignedOutlet}
                  onChange={(e) => onChangeAssignedOutlet(e.target.value)}
                  className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">Tanpa outlet khusus</option>
                  {picOutlets.length > 0 && (
                    <optgroup
                      label={
                        selectedPicOptions.length === 1
                          ? `Outlet ${selectedPicOptions[0].pic}`
                          : 'Outlet PIC Terpilih'
                      }
                    >
                      {picOutlets.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {otherOutlets.length > 0 && (
                    <optgroup label={picOutlets.length > 0 ? 'Outlet Lainnya' : 'Daftar Outlet'}>
                      {otherOutlets.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {formAssignedOutlet &&
                    !picOutlets.includes(formAssignedOutlet) &&
                    !otherOutlets.includes(formAssignedOutlet) && (
                      <option value={formAssignedOutlet}>{formAssignedOutlet}</option>
                    )}
                </select>
              </div>
            </div>
          )}

          {/* 5. Pengulangan Reminder (Personal Reminder & Assign Divisi) */}
          {showRecurrenceSection && (
            <div>
              <label
                htmlFor="evt-repeat-freq"
                className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Pengulangan Reminder
              </label>
              <select
                id="evt-repeat-freq"
                value={formRepeatFreq}
                onChange={(e) => onChangeRepeatFreq(e.target.value as CalendarRecurrenceFreq)}
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
                                  ? isAssignMode
                                    ? 'border-blue-700 bg-blue-700 text-white dark:border-blue-600 dark:bg-blue-600'
                                    : 'border-violet-700 bg-violet-700 text-white dark:border-violet-600 dark:bg-violet-600'
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
                      <Repeat
                        className={`h-3.5 w-3.5 ${
                          isAssignMode
                            ? 'text-blue-700 dark:text-blue-400'
                            : 'text-violet-700 dark:text-violet-400'
                        }`}
                      />
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

                    {editingId && formExcludedDates.length > 0 && (
                      <button
                        type="button"
                        onClick={onRestoreExcludedDates}
                        className={`font-semibold hover:underline ${
                          isAssignMode
                            ? 'text-blue-700 dark:text-blue-400'
                            : 'text-violet-700 dark:text-violet-400'
                        }`}
                      >
                        Pulihkan {formExcludedDates.length} tgl dilewati
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 6. Catatan (Opsional) */}
          <div>
            <label
              htmlFor="evt-notes"
              className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Catatan (Opsional)
            </label>
            <textarea
              id="evt-notes"
              rows={3}
              maxLength={500}
              value={formNotes}
              onChange={(e) => onChangeNotes(e.target.value)}
              placeholder={
                isAssignMode
                  ? 'Contoh: Bawa dokumen SO dan koordinasi dengan kepala outlet.'
                  : 'Catatan pribadi untuk reminder ini...'
              }
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
              disabled={busy}
              className={`min-h-[40px] rounded-lg px-5 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50 ${
                isAssignMode
                  ? 'bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500'
                  : 'bg-violet-700 hover:bg-violet-800 dark:bg-violet-600 dark:hover:bg-violet-500'
              }`}
            >
              {busy
                ? 'Menyimpan...'
                : editingId
                  ? 'Simpan Perubahan'
                  : isAssignMode
                    ? isDivisionScope
                      ? 'Simpan Assign Divisi'
                      : 'Simpan Assign PIC'
                    : 'Simpan Reminder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
