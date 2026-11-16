import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lock,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from 'lucide-react';
import { useState } from 'react';
import { OutletStoreState, RoleConfig } from '../types/outlet';
import {
  calcTask,
  canEditOutletDay,
  fmtDate,
  fmtDateLong,
  fmtDateTimeWithSeconds,
  fmtDateWeekdayLong,
  fmtMonth,
  formatPicTitle,
  getPeopleMap,
  getPersonList,
  getTaskInputType,
  isOutletDayFilled,
  isSunday,
  nearestWorkingDay,
  prevMonthFirstDay,
  shiftIsoDays,
  todayIso,
  yesterdayIso,
} from '../utils/outletLogic';

interface DraftEntry {
  d: string;
  n: string;
  cleared?: boolean;
}

interface InputHarianViewProps {
  config: RoleConfig;
  store: OutletStoreState;
  days: string[];
  isAdmin: boolean;
  selectedPerson: string;
  selectedOutlet: string;
  selectedDay: string;
  onChangePerson: (person: string) => void;
  onChangeOutlet: (outlet: string) => void;
  onChangeDay: (day: string) => void;
  onSaveOutletDay: (
    outlet: string,
    day: string,
    changes: Record<string, { d: string; n: string; cleared?: boolean }>
  ) => Promise<void>;
  onOpenAdminConfig: () => void;
}

export function InputHarianView({
  config,
  store,
  days,
  isAdmin,
  selectedPerson,
  selectedOutlet,
  selectedDay,
  onChangePerson,
  onChangeOutlet,
  onChangeDay,
  onSaveOutletDay,
  onOpenAdminConfig,
}: InputHarianViewProps) {
  const [drafts, setDrafts] = useState<Record<string, Record<string, DraftEntry>>>({});
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const today = todayIso();
  const yesterday = yesterdayIso();
  const defaultDay = nearestWorkingDay(days, yesterday);
  const personList = getPersonList(config.outlets);
  const peopleMap = getPeopleMap(config.outlets);

  if (personList.length === 0 || config.tasks.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Belum Ada Tugas atau Outlet untuk {config.label}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
          {personList.length === 0 && config.tasks.length === 0
            ? `Admin belum menambahkan daftar tugas maupun outlet untuk role ${config.label}.`
            : personList.length === 0
              ? `Admin belum menambahkan outlet untuk role ${config.label}.`
              : `Admin belum menambahkan daftar tugas untuk role ${config.label}.`}
        </p>
        {isAdmin && (
          <button
            type="button"
            onClick={onOpenAdminConfig}
            className="mt-5 inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Atur Tugas & Outlet {config.label}</span>
          </button>
        )}
      </section>
    );
  }

  const activePerson = personList.includes(selectedPerson) ? selectedPerson : personList[0];
  const outletsForPerson = peopleMap[activePerson] || [];
  const activeOutlet = outletsForPerson.includes(selectedOutlet)
    ? selectedOutlet
    : outletsForPerson[0];

  const dayIndex = days.indexOf(selectedDay);
  const prevDay = dayIndex > 0 ? days[dayIndex - 1] : null;
  const nextDay = dayIndex >= 0 && dayIndex < days.length - 1 ? days[dayIndex + 1] : null;

  const dayKey = `${activeOutlet}|${selectedDay}`;
  const currentDraftMap = drafts[dayKey] || {};

  const calculatedTasks = config.tasks.map((t) => {
    const calc = calcTask(store, days, config.tasks, activeOutlet, selectedDay, t.key, today);
    const draft = currentDraftMap[t.key];
    const displayD = draft ? draft.d : calc.d;
    const displayN = draft ? draft.n : calc.n;
    const isDirty = Boolean(
      draft &&
        (draft.d !== calc.d ||
          draft.n !== calc.n ||
          (draft.cleared && calc.own))
    );
    return {
      def: t,
      calc,
      draft,
      displayD,
      displayN,
      isDirty,
    };
  });

  const dirtyEntries: Record<string, { d: string; n: string; cleared?: boolean }> = {};
  for (const item of calculatedTasks) {
    if (item.isDirty && item.draft) {
      dirtyEntries[item.def.key] = {
        d: item.draft.d,
        n: item.draft.n.slice(0, 100),
        cleared: item.draft.cleared,
      };
    }
  }
  const hasUnsavedChanges = Object.keys(dirtyEntries).length > 0;

  const pendingCount = calculatedTasks.filter((item) => item.calc.pend).length;
  const updateCount = calculatedTasks.length - pendingCount;

  const selectedDayIsSunday = isSunday(selectedDay);
  const selectedDayIsFuture = selectedDay > today;
  const selectedDayAlreadyFilled = isOutletDayFilled(store, config.tasks, activeOutlet, selectedDay);
  const canEditDay = canEditOutletDay(
    store,
    config.tasks,
    days,
    activeOutlet,
    selectedDay,
    today
  );

  const setTaskDraft = (
    taskKey: string,
    baseD: string,
    baseN: string,
    patch: Partial<DraftEntry>
  ) => {
    setSavedNotice(null);
    setDrafts((prev) => {
      const existingMap = prev[dayKey] || {};
      const current = existingMap[taskKey] || { d: baseD, n: baseN };
      const nextItem: DraftEntry = {
        ...current,
        ...patch,
        n: (patch.n !== undefined ? patch.n : current.n).slice(0, 100),
      };
      return {
        ...prev,
        [dayKey]: {
          ...existingMap,
          [taskKey]: nextItem,
        },
      };
    });
  };

  const clearTaskDraft = (taskKey: string, hasOwnSaved: boolean) => {
    setSavedNotice(null);
    setDrafts((prev) => {
      const existingMap = prev[dayKey] || {};
      if (hasOwnSaved) {
        return {
          ...prev,
          [dayKey]: {
            ...existingMap,
            [taskKey]: { d: '', n: '', cleared: true },
          },
        };
      }
      const nextMap = { ...existingMap };
      delete nextMap[taskKey];
      return {
        ...prev,
        [dayKey]: nextMap,
      };
    });
  };

  const handleSaveDay = async () => {
    if (!canEditDay || !hasUnsavedChanges || saving) return;
    setSaving(true);
    try {
      await onSaveOutletDay(activeOutlet, selectedDay, dirtyEntries);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[dayKey];
        return next;
      });
      setSavedNotice(`Data ${activeOutlet} (${fmtDateLong(selectedDay)}) tersimpan.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {!canEditDay && (
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
            canEditOutletDay(store, config.tasks, days, activeOutlet, defaultDay, today) && (
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

      {/* Controls (Tanggal Kerja kiri, Nama PIC kanan) & Outlet Bookmarks + Save */}
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
                  setSavedNotice(null);
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
                    today
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
                setSavedNotice(null);
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

        {/* Outlet Bookmarks (left) + Save Button (right) */}
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
                    setSavedNotice(null);
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
            {savedNotice && !hasUnsavedChanges && (
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {savedNotice}
              </span>
            )}
            {hasUnsavedChanges && canEditDay && (
              <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
                Belum disimpan
              </span>
            )}
            <button
              type="button"
              disabled={!canEditDay || !hasUnsavedChanges || saving}
              onClick={handleSaveDay}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
            >
              <Save className="h-4 w-4 shrink-0" />
              <span>{saving ? 'Menyimpan...' : 'Save'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Dynamic Tasks Table */}
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
            <span className="text-emerald-700 dark:text-emerald-400">
              {updateCount} update
            </span>
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
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
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
              {calculatedTasks.map(({ def, calc, displayD, displayN, isDirty }) => {
                const inputType = getTaskInputType(def);
                const isMonthly = inputType === 'month';
                const quickTargetDate = isMonthly
                  ? prevMonthFirstDay(today)
                  : def.formulaType === 'memo_month'
                    ? prevMonthFirstDay(today)
                    : shiftIsoDays(selectedDay, -1);
                const currentComparable = isMonthly
                  ? displayD
                    ? `${displayD.slice(0, 7)}-01`
                    : ''
                  : displayD;
                const formattedTs = fmtDateTimeWithSeconds(calc.ts);
                return (
                  <tr
                    key={def.key}
                    className={
                      canEditDay
                        ? 'transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                        : 'bg-slate-100/70 text-slate-500 dark:bg-slate-800/35 dark:text-slate-400'
                    }
                  >
                    <td className="px-5 py-3.5 align-middle">
                      <div
                        className={`font-medium ${
                          canEditDay
                            ? 'text-slate-900 dark:text-slate-100'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {def.label}
                      </div>
                      {isAdmin && (
                        <div className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                          {isMonthly ? 'Input per bulan' : 'Input per tanggal'} · {def.formulaNote}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                      <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
                        {isMonthly ? (
                          <input
                            type="month"
                            disabled={!canEditDay}
                            aria-label={`Bulan update ${def.label}`}
                            value={displayD ? displayD.slice(0, 7) : ''}
                            onChange={(e) =>
                              setTaskDraft(def.key, calc.d, calc.n, {
                                d: e.target.value ? `${e.target.value}-01` : '',
                                cleared: false,
                              })
                            }
                            className="min-h-[38px] min-w-[140px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200/80 disabled:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:border-slate-700/70 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500"
                          />
                        ) : (
                          <input
                            type="date"
                            disabled={!canEditDay}
                            aria-label={`Tanggal update ${def.label}`}
                            value={displayD}
                            onChange={(e) =>
                              setTaskDraft(def.key, calc.d, calc.n, {
                                d: e.target.value,
                                cleared: false,
                              })
                            }
                            className="min-h-[38px] min-w-[138px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200/80 disabled:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:border-slate-700/70 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500"
                          />
                        )}
                        {canEditDay && currentComparable !== quickTargetDate && (
                          <button
                            type="button"
                            onClick={() =>
                              setTaskDraft(def.key, calc.d, calc.n, {
                                d: quickTargetDate,
                                cleared: false,
                              })
                            }
                            title={`Atur ke ${isMonthly ? fmtMonth(quickTargetDate) : fmtDate(quickTargetDate)}`}
                            className="min-h-[38px] shrink-0 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            Set {isMonthly ? fmtMonth(quickTargetDate) : fmtDate(quickTargetDate)}
                          </button>
                        )}
                        {canEditDay && (calc.own || isDirty) && (
                          <button
                            type="button"
                            onClick={() => clearTaskDraft(def.key, calc.own)}
                            title={calc.own ? 'Kosongkan entri' : 'Batalkan perubahan draft'}
                            aria-label={`Reset entri ${def.label}`}
                            className="flex h-[38px] w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 align-middle text-xs text-slate-500 dark:text-slate-400">
                      {isDirty ? (
                        <span className="font-medium text-blue-700 dark:text-blue-400">
                          Draft (klik Save)
                        </span>
                      ) : calc.source === 'own' && calc.d ? (
                        formattedTs ? (
                          <div>
                            <div className="font-medium text-slate-700 dark:text-slate-300">
                              Diinput
                            </div>
                            <div className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                              {formattedTs}
                            </div>
                          </div>
                        ) : (
                          'Diinput'
                        )
                      ) : calc.source === 'inherited' && calc.sourceDay ? (
                        <div>
                          <div>Ikut {fmtDate(calc.sourceDay)}</div>
                          {formattedTs && (
                            <div className="mt-0.5 font-mono text-[11px] text-slate-400 tabular-nums dark:text-slate-500">
                              {formattedTs}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">Belum diinput</span>
                      )}
                    </td>

                    {isAdmin && (
                      <td className="px-4 py-3.5 align-middle font-mono text-xs text-slate-600 tabular-nums dark:text-slate-400">
                        {isMonthly
                          ? fmtMonth(calc.rumus)
                          : calc.rumus
                            ? fmtDate(calc.rumus)
                            : '—'}
                      </td>
                    )}

                    {isAdmin && (
                      <td
                        className={`px-4 py-3.5 text-right align-middle font-mono text-sm font-semibold tabular-nums ${
                          !canEditDay || !calc.d
                            ? 'text-slate-400 dark:text-slate-500'
                            : calc.pm < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {!calc.d ? '—' : calc.pm > 0 ? `+${calc.pm}` : calc.pm}
                      </td>
                    )}

                    <td className="px-4 py-3.5 align-middle">
                      {calc.pend ? (
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                            canEditDay
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-red-500/80 dark:text-red-400/70'
                          }`}
                        >
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          <span>PENDING</span>
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                            canEditDay
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-emerald-700/75 dark:text-emerald-400/70'
                          }`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span>UPDATE</span>
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-3.5 align-middle">
                      <input
                        type="text"
                        maxLength={100}
                        disabled={!canEditDay}
                        aria-label={`Keterangan ${def.label}`}
                        value={displayN}
                        placeholder={canEditDay ? 'Keterangan (maks. 100 huruf)' : 'Terkunci'}
                        onChange={(e) =>
                          setTaskDraft(def.key, calc.d, calc.n, {
                            n: e.target.value.slice(0, 100),
                            cleared: false,
                          })
                        }
                        className="min-h-[38px] w-full min-w-[160px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200/80 disabled:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:border-slate-700/70 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {isAdmin
            ? 'Tekan tombol Save di sebelah kanan baris outlet untuk menyimpan perubahan. Tanggal sebelumnya yang belum pernah diisi tetap terbuka hingga disimpan; nilai +/- negatif menandakan status PENDING.'
            : 'Tekan tombol Save di sebelah kanan baris outlet untuk menyimpan perubahan. Tanggal sebelumnya yang belum pernah diisi tetap terbuka hingga disimpan.'}
        </div>
      </section>
    </div>
  );
}
