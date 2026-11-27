import { ChevronLeft, ChevronRight, ImageDown, Lock, Save, X } from 'lucide-react';
import {
  AccountProfile,
  CalculatedTask,
  OutletStoreState,
  RoleConfig,
  TaskDefinition,
} from '../../types/outlet';
import {
  calcTask,
  canEditOutletDay,
  fmtDateLong,
  fmtDateWeekdayLong,
  formatPicTitle,
} from '../../utils/outletLogic';
import { InputHarianTaskRow } from './InputHarianTaskRow';

export interface CalculatedTaskRowItem {
  def: TaskDefinition;
  calc: CalculatedTask;
  displayD: string;
  displayN: string;
  isDirty: boolean;
}

interface InputHarianDailyModalProps {
  open: boolean;
  editingRecordRefCode?: string | null;
  saving: boolean;
  saveError: string | null;
  account: AccountProfile;
  config: RoleConfig;
  store: OutletStoreState;
  days: string[];
  today: string;
  defaultDay: string;
  selectedDay: string;
  prevDay: string | null;
  nextDay: string | null;
  personList: string[];
  peopleMap: Record<string, string[]>;
  activePerson: string;
  outletsForPerson: string[];
  activeOutlet: string;
  ownPic: string | null;
  isAdmin: boolean;
  isPicOwner: boolean;
  canEditDay: boolean;
  selectedDayIsSunday: boolean;
  selectedDayIsFuture: boolean;
  selectedDayAlreadyFilled: boolean;
  hasUnsavedChanges: boolean;
  updateCount: number;
  pendingCount: number;
  calculatedTasks: CalculatedTaskRowItem[];
  onClose: () => void;
  onChangeDay: (day: string) => void;
  onChangePerson: (person: string) => void;
  onChangeOutlet: (outlet: string) => void;
  onOpenExportPhoto: () => void;
  onSaveDay: () => Promise<void>;
  onSetTaskDraft: (
    taskKey: string,
    baseD: string,
    baseN: string,
    patch: { d?: string; n?: string; cleared?: boolean }
  ) => void;
  onClearTaskDraft: (taskKey: string, hasOwnSaved: boolean) => void;
  onClearNotices: () => void;
}

export function InputHarianDailyModal({
  open,
  editingRecordRefCode = null,
  saving,
  saveError,
  account,
  config,
  store,
  days,
  today,
  defaultDay,
  selectedDay,
  prevDay,
  nextDay,
  personList,
  peopleMap,
  activePerson,
  outletsForPerson,
  activeOutlet,
  ownPic,
  isAdmin,
  isPicOwner,
  canEditDay,
  selectedDayIsSunday,
  selectedDayIsFuture,
  selectedDayAlreadyFilled,
  hasUnsavedChanges,
  updateCount,
  pendingCount,
  calculatedTasks,
  onClose,
  onChangeDay,
  onChangePerson,
  onChangeOutlet,
  onOpenExportPhoto,
  onSaveDay,
  onSetTaskDraft,
  onClearTaskDraft,
  onClearNotices,
}: InputHarianDailyModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="daily-input-modal-title"
      onClick={() => !saving && onClose()}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-xl dark:border-slate-800 dark:bg-slate-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h2
              id="daily-input-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              {editingRecordRefCode ? 'Edit Update Daily' : 'Tambah Update Daily'} · {config.label}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {editingRecordRefCode ? (
                <>
                  <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">
                    {editingRecordRefCode}
                  </span>
                  {' · '}
                </>
              ) : null}
              {activeOutlet} · {formatPicTitle(activePerson)} · {fmtDateWeekdayLong(selectedDay)}
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Tutup form Update Daily"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4 sm:p-5">
          {!isPicOwner && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-200"
            >
              <div className="flex items-start gap-2.5">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                <div>
                  <span className="font-semibold">Akses Terkunci — Tugas {activePerson}</span>
                  <span className="mx-1.5 opacity-50" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-xs sm:text-sm">
                    {ownPic && personList.includes(ownPic)
                      ? `Akun Anda (${account.name} · ${ownPic}) hanya dapat menginput tugas untuk outlet ${ownPic}.`
                      : `Akun Anda belum dipasangkan ke nama PIC pada ${config.label}, sehingga penginputan dikunci. Hubungi Admin untuk mengatur Tugas PIC akun Anda.`}
                  </span>
                </div>
              </div>
              {ownPic && personList.includes(ownPic) && (
                <button
                  type="button"
                  onClick={() => {
                    onClearNotices();
                    onChangePerson(ownPic);
                  }}
                  className="min-h-[36px] shrink-0 whitespace-nowrap rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
                >
                  Buka Tugas {ownPic}
                </button>
              )}
            </div>
          )}

          {isPicOwner && !canEditDay && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300"
            >
              <div className="flex items-start gap-2.5">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {selectedDayIsSunday
                      ? `Hari Minggu — Libur Input (${fmtDateLong(selectedDay)})`
                      : selectedDayIsFuture
                        ? `Akses Ditutup (${fmtDateLong(selectedDay)})`
                        : `Sudah Terisi (${fmtDateLong(selectedDay)})`}
                  </span>
                  <span className="mx-1.5 text-slate-400 dark:text-slate-600" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-xs sm:text-sm">
                    {selectedDayIsSunday
                      ? 'Tidak ada input harian pada hari Minggu dan hari Minggu tidak masuk ke kalkulasi keterlambatan maupun rata-rata.'
                      : selectedDayIsFuture
                        ? 'Tanggal H+1 dari hari ini dan seterusnya tetap dikunci.'
                        : selectedDayAlreadyFilled
                          ? `Data ${activeOutlet} untuk tanggal ini sudah terisi sebelumnya sehingga dikunci.`
                          : 'Tanggal ini hanya baca.'}
                  </span>
                </div>
              </div>
              {defaultDay !== selectedDay &&
                canEditOutletDay(
                  store,
                  config.tasks,
                  days,
                  activeOutlet,
                  defaultDay,
                  today,
                  isAdmin
                ) && (
                  <button
                    type="button"
                    onClick={() => onChangeDay(defaultDay)}
                    className="min-h-[36px] shrink-0 whitespace-nowrap rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    Buka {fmtDateLong(defaultDay)}
                  </button>
                )}
            </div>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="select-day"
                  className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
                >
                  Tanggal Kerja
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!prevDay}
                    onClick={() => prevDay && onChangeDay(prevDay)}
                    aria-label="Hari kerja sebelumnya"
                    className="flex h-[42px] w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <select
                    id="select-day"
                    value={selectedDay}
                    onChange={(e) => {
                      onClearNotices();
                      onChangeDay(e.target.value);
                    }}
                    className={`min-h-[42px] min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-sm tabular-nums focus:border-blue-600 focus:outline-none ${
                      canEditDay
                        ? 'border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                        : 'border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-500'
                    }`}
                  >
                    {days.map((d) => {
                      const isAccessible = canEditOutletDay(
                        store,
                        config.tasks,
                        days,
                        activeOutlet,
                        d,
                        today,
                        isAdmin
                      );
                      return (
                        <option
                          key={d}
                          value={d}
                          className={
                            isAccessible
                              ? 'bg-white font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                              : 'bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-500'
                          }
                        >
                          {fmtDateLong(d)}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    type="button"
                    disabled={!nextDay}
                    onClick={() => nextDay && onChangeDay(nextDay)}
                    aria-label="Hari kerja berikutnya"
                    className="flex h-[42px] w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="select-person"
                  className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
                >
                  Nama PIC
                </label>
                <select
                  id="select-person"
                  value={activePerson}
                  onChange={(e) => {
                    onClearNotices();
                    onChangePerson(e.target.value);
                  }}
                  className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {personList.map((p) => (
                    <option key={p} value={p}>
                      {p} ({(peopleMap[p] || []).length} outlet)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-1.5">
                {outletsForPerson.map((o) => {
                  const oPend = config.tasks.filter(
                    (t) => calcTask(store, days, config.tasks, o, selectedDay, t.key, today).pend
                  ).length;
                  const isActive = o === activeOutlet;
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => {
                        onClearNotices();
                        onChangeOutlet(o);
                      }}
                      className={`flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
                        isActive
                          ? 'border-blue-700 bg-blue-700 text-white dark:border-blue-600 dark:bg-blue-600'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="font-semibold">{o}</span>
                      <span
                        aria-hidden="true"
                        className={isActive ? 'text-blue-200' : 'text-slate-300 dark:text-slate-600'}
                      >
                        ·
                      </span>
                      <span
                        className={`font-mono tabular-nums ${
                          isActive
                            ? 'text-blue-100'
                            : oPend > 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {oPend > 0 ? `${oPend} pending` : 'Lengkap'}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex shrink-0 items-center gap-2.5">
                {hasUnsavedChanges && canEditDay && (
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
                    Belum disimpan
                  </span>
                )}
                <button
                  type="button"
                  onClick={onOpenExportPhoto}
                  className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <ImageDown className="h-4 w-4 shrink-0" />
                  <span>Ekspor Foto</span>
                </button>
                <button
                  type="button"
                  disabled={!canEditDay || !hasUnsavedChanges || saving}
                  onClick={onSaveDay}
                  className="inline-flex min-h-[40px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                >
                  <Save className="h-4 w-4 shrink-0" />
                  <span>{saving ? 'Menyimpan...' : editingRecordRefCode ? 'Simpan Perubahan' : 'Save'}</span>
                </button>
              </div>
            </div>

            {saveError && (
              <div
                role="alert"
                className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
              >
                {saveError}
              </div>
            )}
          </section>

          <section
            className={`rounded-xl border border-slate-200 dark:border-slate-800 ${
              canEditDay ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/90 dark:bg-slate-900/70'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {activeOutlet}
                </h2>
                <p className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                  {formatPicTitle(activePerson)} ({config.label})
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {fmtDateWeekdayLong(selectedDay)}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-medium tabular-nums">
                <span className="text-emerald-700 dark:text-emerald-400">{updateCount} update</span>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                  ·
                </span>
                <span
                  className={
                    pendingCount > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }
                >
                  {pendingCount} pending
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table
                className={`w-full border-collapse text-left text-sm ${
                  isAdmin ? 'min-w-[960px]' : 'min-w-[860px]'
                }`}
              >
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                    <th className="px-5 py-3">Item</th>
                    <th className="px-4 py-3 whitespace-nowrap">Pengisian Update</th>
                    <th className="px-4 py-3">Sumber</th>
                    {isAdmin && <th className="px-4 py-3">Rumus</th>}
                    {isAdmin && <th className="px-4 py-3 text-right">+/-</th>}
                    <th className="px-4 py-3">Status</th>
                    <th className="px-5 py-3">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {calculatedTasks.map(({ def, calc, displayD, displayN, isDirty }) => (
                    <InputHarianTaskRow
                      key={def.key}
                      def={def}
                      calc={calc}
                      displayD={displayD}
                      displayN={displayN}
                      isDirty={isDirty}
                      canEditDay={canEditDay}
                      isAdmin={isAdmin}
                      days={days}
                      selectedDay={selectedDay}
                      today={today}
                      onSetDraft={onSetTaskDraft}
                      onClearDraft={onClearTaskDraft}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Tekan tombol Save di sebelah kanan baris outlet untuk menyimpan perubahan dan menghasilkan kode referensi otomatis. Tanggal sebelumnya yang belum pernah diisi tetap terbuka hingga disimpan
              {isAdmin ? '; nilai +/- negatif menandakan status PENDING.' : '.'}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
