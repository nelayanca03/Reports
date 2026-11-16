import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lock,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { OutletStoreState, RoleConfig, VisitItem } from '../types/outlet';
import {
  calcTask,
  fmtDate,
  fmtDateFull,
  getPeopleMap,
  getPersonList,
  isSunday,
  nearestWorkingDay,
  todayIso,
} from '../utils/outletLogic';

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
  onUpdateEntry: (outlet: string, day: string, taskKey: string, field: 'd' | 'n', value: string) => void;
  onClearEntry: (outlet: string, day: string, taskKey: string) => void;
  onUpdateVisit: (person: string, day: string, patch: Partial<VisitItem>) => void;
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
  onUpdateEntry,
  onClearEntry,
  onUpdateVisit,
  onOpenAdminConfig,
}: InputHarianViewProps) {
  const today = todayIso();
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

  const calculatedTasks = config.tasks.map((t) => ({
    def: t,
    calc: calcTask(store, days, config.tasks, activeOutlet, selectedDay, t.key, today),
  }));

  const pendingCount = calculatedTasks.filter((item) => item.calc.pend).length;
  const updateCount = calculatedTasks.length - pendingCount;

  const visitKey = `${activePerson}|${selectedDay}`;
  const visit: VisitItem = store.visit[visitKey] || { ok: false, f: '', t: '', n: '' };

  const todayIsSunday = isSunday(today);
  const isTodayWorkingDay = days.includes(today) && !todayIsSunday;
  const isHariH = selectedDay === today && isTodayWorkingDay;
  const canEditDay = (isAdmin || isHariH) && !isSunday(selectedDay);

  return (
    <div className="space-y-5">
      {todayIsSunday && isAdmin && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-100/80 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
          <span className="text-xs sm:text-sm">
            <strong className="font-semibold text-slate-900 dark:text-slate-100">
              Hari Minggu ({fmtDateFull(today)})
            </strong>{' '}
            · Tidak ada input harian pada hari Minggu dan hari Minggu tidak masuk ke kalkulasi keterlambatan, rata-rata, maupun dashboard.
          </span>
        </div>
      )}
      {!canEditDay && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <div className="flex items-start gap-2.5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
            <div>
              <span className="font-semibold">
                {todayIsSunday
                  ? `Hari Minggu — Libur Input (${fmtDate(today)})`
                  : `Mode Hanya Baca (${fmtDate(selectedDay)})`}
              </span>
              <span className="mx-1.5 text-amber-400 dark:text-amber-700" aria-hidden="true">
                ·
              </span>
              <span className="text-xs sm:text-sm">
                {todayIsSunday
                  ? 'Tidak ada input harian pada hari Minggu dan hari Minggu tidak masuk ke kalkulasi keterlambatan, rata-rata, maupun dashboard.'
                  : isTodayWorkingDay
                    ? `Pengguna hanya dapat mengisi input pada Hari H (${fmtDateFull(today)}). Tanggal H-1 atau tanggal lainnya tidak dapat diubah.`
                    : `Hari ini (${fmtDateFull(today)}) bukan hari kerja dalam periode aktif. Input harian hanya dibuka pada hari kerja Hari H.`}
              </span>
            </div>
          </div>
          {isTodayWorkingDay && (
            <button
              type="button"
              onClick={() => onChangeDay(today)}
              className="min-h-[36px] shrink-0 whitespace-nowrap rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-slate-800"
            >
              Buka Hari H ({fmtDate(today)})
            </button>
          )}
        </div>
      )}
      {/* Controls & Outlet Quick Switcher */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
              onChange={(e) => onChangePerson(e.target.value)}
              className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {personList.map((p) => (
                <option key={p} value={p}>
                  {p} ({(peopleMap[p] || []).length} outlet)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="select-outlet"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Outlet
            </label>
            <select
              id="select-outlet"
              value={activeOutlet}
              onChange={(e) => onChangeOutlet(e.target.value)}
              className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {outletsForPerson.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

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
                onChange={(e) => onChangeDay(e.target.value)}
                className="min-h-[42px] min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {days.map((d) => (
                  <option key={d} value={d}>
                    {fmtDate(d)} ({d}){d === today ? ' — Hari H' : ''}
                  </option>
                ))}
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
              <button
                type="button"
                onClick={() => onChangeDay(nearestWorkingDay(days, today))}
                className="min-h-[42px] shrink-0 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {isTodayWorkingDay ? 'Hari H' : 'Hari Ini'}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Outlet Tabs */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-4 dark:border-slate-800">
          {outletsForPerson.map((o) => {
            const oPend = config.tasks.filter(
              (t) => calcTask(store, days, config.tasks, o, selectedDay, t.key, today).pend
            ).length;
            const isActive = o === activeOutlet;
            return (
              <button
                key={o}
                type="button"
                onClick={() => onChangeOutlet(o)}
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
      </section>

      {/* Main Dynamic Tasks Table */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {activeOutlet}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {config.label} · {activePerson} · {fmtDateFull(selectedDay)}
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
                <th className="px-4 py-3">Tgl Update</th>
                <th className="px-4 py-3">Sumber</th>
                <th className="px-4 py-3">Rumus</th>
                <th className="px-4 py-3 text-right">+/-</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {calculatedTasks.map(({ def, calc }) => {
                const quickTargetDate = def.formulaType === 'memo_month' ? today : selectedDay;
                return (
                  <tr
                    key={def.key}
                    className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                  >
                    <td className="px-5 py-3.5 align-middle">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {def.label}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {def.formulaNote}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 align-middle">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="date"
                          disabled={!canEditDay}
                          aria-label={`Tanggal update ${def.label}`}
                          value={calc.d}
                          onChange={(e) =>
                            onUpdateEntry(activeOutlet, selectedDay, def.key, 'd', e.target.value)
                          }
                          className="min-h-[38px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums disabled:cursor-not-allowed disabled:opacity-60 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                        {canEditDay && calc.d !== quickTargetDate && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateEntry(
                                activeOutlet,
                                selectedDay,
                                def.key,
                                'd',
                                quickTargetDate
                              )
                            }
                            title={`Atur ke ${fmtDate(quickTargetDate)}`}
                            className="min-h-[38px] whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            Set {fmtDate(quickTargetDate)}
                          </button>
                        )}
                        {canEditDay && calc.own && (
                          <button
                            type="button"
                            onClick={() => onClearEntry(activeOutlet, selectedDay, def.key)}
                            title="Kembalikan ke tanggal hari sebelumnya"
                            aria-label={`Reset entri ${def.label}`}
                            className="flex h-[38px] w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 align-middle text-xs text-slate-500 dark:text-slate-400">
                      {calc.source === 'own'
                        ? 'Diisi hari ini'
                        : calc.source === 'inherited' && calc.sourceDay
                          ? `Ikut ${fmtDate(calc.sourceDay)}`
                          : 'Default awal'}
                    </td>

                    <td className="px-4 py-3.5 align-middle font-mono text-xs text-slate-700 tabular-nums dark:text-slate-300">
                      {fmtDate(calc.rumus)}
                    </td>

                    <td
                      className={`px-4 py-3.5 text-right align-middle font-mono text-sm font-semibold tabular-nums ${
                        calc.pm < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {calc.pm > 0 ? `+${calc.pm}` : calc.pm}
                    </td>

                    <td className="px-4 py-3.5 align-middle">
                      {calc.pend ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          <span>PENDING</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span>UPDATE</span>
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-3.5 align-middle">
                      <input
                        type="text"
                        disabled={!canEditDay}
                        aria-label={`Keterangan ${def.label}`}
                        value={calc.n}
                        placeholder={canEditDay ? 'Keterangan' : '—'}
                        onChange={(e) =>
                          onUpdateEntry(activeOutlet, selectedDay, def.key, 'n', e.target.value)
                        }
                        className="min-h-[38px] w-full min-w-[160px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Jika hari kerja ini belum diisi, tanggal update otomatis mengikuti entri hari kerja sebelumnya. Nilai +/- negatif menandakan status PENDING.
        </div>
      </section>

      {/* Kunjungan ke Outlet */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Kunjungan ke Outlet · {activePerson}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Catatan kehadiran lapangan pada {fmtDateFull(selectedDay)}
            </p>
          </div>
          <span
            className={`text-xs font-semibold ${
              visit.ok
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {visit.ok ? 'Tercatat Dikunjungi' : 'Belum Dicatat'}
          </span>
        </div>

        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <label
              className={`flex min-h-[42px] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-800 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 ${
                canEditDay
                  ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/70'
                  : 'cursor-not-allowed opacity-60'
              }`}
            >
              <input
                type="checkbox"
                disabled={!canEditDay}
                checked={visit.ok}
                onChange={(e) => onUpdateVisit(activePerson, selectedDay, { ok: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span>Sudah dikunjungi</span>
            </label>
          </div>

          <div className="lg:col-span-2">
            <label
              htmlFor="visit-from"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Dari jam
            </label>
            <input
              id="visit-from"
              type="time"
              disabled={!canEditDay}
              value={visit.f}
              onChange={(e) => onUpdateVisit(activePerson, selectedDay, { f: e.target.value })}
              className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums disabled:cursor-not-allowed disabled:opacity-60 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="lg:col-span-2">
            <label
              htmlFor="visit-to"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Ke jam
            </label>
            <input
              id="visit-to"
              type="time"
              disabled={!canEditDay}
              value={visit.t}
              onChange={(e) => onUpdateVisit(activePerson, selectedDay, { t: e.target.value })}
              className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums disabled:cursor-not-allowed disabled:opacity-60 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-5">
            <label
              htmlFor="visit-note"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Keterangan kunjungan
            </label>
            <input
              id="visit-note"
              type="text"
              disabled={!canEditDay}
              value={visit.n}
              placeholder={canEditDay ? 'Catatan hasil kunjungan outlet...' : '—'}
              onChange={(e) => onUpdateVisit(activePerson, selectedDay, { n: e.target.value })}
              className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
