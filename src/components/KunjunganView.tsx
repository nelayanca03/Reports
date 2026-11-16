import { ArrowUpRight, Check, Lock, Minus } from 'lucide-react';
import { useState } from 'react';
import { OutletStoreState, RoleConfig, VisitItem } from '../types/outlet';
import {
  calcVisitLeaderboard,
  fmtDate,
  fmtDateFull,
  getPeopleMap,
  getPersonList,
  isSunday,
  todayIso,
} from '../utils/outletLogic';

interface KunjunganViewProps {
  config: RoleConfig;
  store: OutletStoreState;
  days: string[];
  isAdmin: boolean;
  onUpdateVisit: (person: string, day: string, patch: Partial<VisitItem>) => void;
  onJumpToInput: (person: string, outlet: string, day: string) => void;
}

export function KunjunganView({
  config,
  store,
  days,
  isAdmin,
  onUpdateVisit,
  onJumpToInput,
}: KunjunganViewProps) {
  const today = todayIso();
  const personList = getPersonList(config.outlets);
  const peopleMap = getPeopleMap(config.outlets);

  const [selectedCell, setSelectedCell] = useState<{
    person: string;
    day: string;
  } | null>(null);

  if (personList.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Belum Ada PIC & Outlet untuk {config.label}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
          Data kunjungan akan muncul setelah Admin menambahkan PIC dan outlet pada role {config.label}.
        </p>
      </section>
    );
  }

  const { elapsedDays, rows } = calcVisitLeaderboard(store, days, personList, today);

  const activeVisit: VisitItem | null = selectedCell
    ? store.visit[`${selectedCell.person}|${selectedCell.day}`] || {
        ok: false,
        f: '',
        t: '',
        n: '',
      }
    : null;

  const todayIsSunday = isSunday(today);
  const canEditSelectedCell =
    Boolean(selectedCell) &&
    !isSunday(selectedCell!.day) &&
    (isAdmin || (selectedCell?.day === today && days.includes(today) && !todayIsSunday));

  return (
    <div className="space-y-5">
      {/* Leaderboard */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Dashboard Kunjungan ke Outlet · {config.label}
          </h2>
          <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
            Hari berjalan: {elapsedDays} dari {days.length} hari kerja (Minggu tidak dihitung)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                <th className="w-12 px-5 py-3">#</th>
                <th className="px-4 py-3">Nama PIC</th>
                <th className="px-4 py-3 text-right">Hari Dikunjungi</th>
                <th className="px-4 py-3 text-right">Hari Berjalan</th>
                <th className="px-5 py-3">Rate Kunjungan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r, idx) => {
                const pct = Math.round(r.rate * 100);
                return (
                  <tr
                    key={r.person}
                    className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                  >
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-slate-100">
                      {r.person}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-medium text-slate-900 tabular-nums dark:text-slate-100">
                      {r.visitedCount}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-600 tabular-nums dark:text-slate-300">
                      {r.elapsedDays}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-blue-700 transition-transform dark:bg-blue-500"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums dark:text-slate-300">
                          {pct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Matrix */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Grid Kunjungan per Hari
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Klik sel tanggal pada matriks untuk melihat atau mengubah detail kunjungan
            </p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {fmtDate(days[0])} – {fmtDate(days[days.length - 1])}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                <th className="sticky left-0 z-10 bg-slate-50 px-5 py-3 font-medium dark:bg-slate-800/90">
                  Nama PIC
                </th>
                {days.map((d) => {
                  const isToday = d === today;
                  return (
                    <th
                      key={d}
                      title={fmtDateFull(d)}
                      className={`px-1.5 py-3 text-center font-mono font-medium tabular-nums ${
                        isToday ? 'text-blue-700 dark:text-blue-400' : ''
                      }`}
                    >
                      {fmtDate(d).slice(0, 2)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {personList.map((person) => (
                <tr key={person}>
                  <td className="sticky left-0 z-10 bg-white px-5 py-2.5 font-semibold text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                    {person}
                  </td>
                  {days.map((d) => {
                    const v = store.visit[`${person}|${d}`];
                    const isSelected =
                      selectedCell?.person === person && selectedCell?.day === d;
                    const visited = Boolean(v?.ok);
                    const tooltip = visited
                      ? `${person} · ${fmtDate(d)}${v?.f || v?.t ? ` (${v?.f || '?'}–${v?.t || '?'})` : ''}${v?.n ? `: ${v.n}` : ''}`
                      : `${person} · ${fmtDate(d)} (belum dicatat)`;

                    return (
                      <td key={d} className="px-1 py-1.5 text-center">
                        <button
                          type="button"
                          title={tooltip}
                          aria-label={tooltip}
                          onClick={() => setSelectedCell({ person, day: d })}
                          className={`mx-auto flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                            isSelected
                              ? 'ring-2 ring-blue-600 ring-offset-1 dark:ring-offset-slate-900'
                              : ''
                          } ${
                            visited
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-400 dark:hover:bg-emerald-950'
                              : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500 dark:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-400'
                          }`}
                        >
                          {visited ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Minus className="h-3 w-3" />
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedCell && activeVisit && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Detail Kunjungan · {selectedCell.person} · {fmtDateFull(selectedCell.day)}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Outlet binaan: {(peopleMap[selectedCell.person] || []).join(', ')}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onJumpToInput(
                  selectedCell.person,
                  (peopleMap[selectedCell.person] || [])[0] || '',
                  selectedCell.day
                )
              }
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <span>Buka di Input Harian</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {!canEditSelectedCell && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              <Lock className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
              <span>
                {todayIsSunday
                  ? 'Hanya Baca · Hari Minggu tidak memiliki input harian maupun kunjungan.'
                  : `Hanya Baca · Kunjungan hanya dapat diisi atau diubah pada Hari H (${fmtDate(today)}).`}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-12">
            <div className="lg:col-span-3">
              <label
                className={`flex min-h-[42px] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-800 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 ${
                  canEditSelectedCell
                    ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/70'
                    : 'cursor-not-allowed opacity-60'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!canEditSelectedCell}
                  checked={activeVisit.ok}
                  onChange={(e) =>
                    onUpdateVisit(selectedCell.person, selectedCell.day, {
                      ok: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <span>Sudah dikunjungi</span>
              </label>
            </div>

            <div className="lg:col-span-2">
              <label
                htmlFor="cell-visit-from"
                className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Dari jam
              </label>
              <input
                id="cell-visit-from"
                type="time"
                disabled={!canEditSelectedCell}
                value={activeVisit.f}
                onChange={(e) =>
                  onUpdateVisit(selectedCell.person, selectedCell.day, {
                    f: e.target.value,
                  })
                }
                className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums disabled:cursor-not-allowed disabled:opacity-60 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="lg:col-span-2">
              <label
                htmlFor="cell-visit-to"
                className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Ke jam
              </label>
              <input
                id="cell-visit-to"
                type="time"
                disabled={!canEditSelectedCell}
                value={activeVisit.t}
                onChange={(e) =>
                  onUpdateVisit(selectedCell.person, selectedCell.day, {
                    t: e.target.value,
                  })
                }
                className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums disabled:cursor-not-allowed disabled:opacity-60 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-5">
              <label
                htmlFor="cell-visit-note"
                className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Keterangan
              </label>
              <input
                id="cell-visit-note"
                type="text"
                disabled={!canEditSelectedCell}
                value={activeVisit.n}
                placeholder={canEditSelectedCell ? 'Catatan kunjungan...' : '—'}
                onChange={(e) =>
                  onUpdateVisit(selectedCell.person, selectedCell.day, {
                    n: e.target.value,
                  })
                }
                className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
