import { Check, Minus } from 'lucide-react';
import { OutletStoreState, RoleConfig, VisitPersonStats } from '../../types/outlet';
import { fmtDate, fmtDateFull, fmtDateLong, getVisitEntries } from '../../utils/outletLogic';

interface KunjunganLeaderboardAndMatrixProps {
  config: RoleConfig;
  store: OutletStoreState;
  days: string[];
  today: string;
  personList: string[];
  activePerson: string;
  activeDay: string;
  boardDateMode: 'all' | 'single' | 'range';
  boardDateExact: string;
  boardDateFrom: string;
  boardDateTo: string;
  elapsedDays: number;
  grandTotalVisits: number;
  rows: VisitPersonStats[];
  filteredMatrixDays: string[];
  onChangeBoardDateMode: (mode: 'all' | 'single' | 'range') => void;
  onChangeBoardDateExact: (val: string) => void;
  onChangeBoardDateFrom: (val: string) => void;
  onChangeBoardDateTo: (val: string) => void;
  onSelectCell: (person: string, day: string) => void;
}

export function KunjunganLeaderboardAndMatrix({
  config,
  store,
  days,
  today,
  personList,
  activePerson,
  activeDay,
  boardDateMode,
  boardDateExact,
  boardDateFrom,
  boardDateTo,
  elapsedDays,
  grandTotalVisits,
  rows,
  filteredMatrixDays,
  onChangeBoardDateMode,
  onChangeBoardDateExact,
  onChangeBoardDateFrom,
  onChangeBoardDateTo,
  onSelectCell,
}: KunjunganLeaderboardAndMatrixProps) {
  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Dashboard Kunjungan ke Outlet · {config.label}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums dark:text-slate-400">
              Total kunjungan: {grandTotalVisits}x · Hari berjalan: {elapsedDays} dari{' '}
              {filteredMatrixDays.length} hari kerja
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'single', label: 'Per Tanggal' },
                  { id: 'range', label: 'Range Tanggal' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeBoardDateMode(opt.id)}
                  className={`min-h-[30px] rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    boardDateMode === opt.id
                      ? 'bg-blue-700 text-white dark:bg-blue-600'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {boardDateMode === 'single' && (
              <input
                type="date"
                max={today}
                aria-label="Filter kunjungan per tanggal"
                value={boardDateExact}
                onChange={(e) => {
                  const val = e.target.value || today;
                  onChangeBoardDateExact(val > today ? today : val);
                }}
                className="min-h-[34px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            )}

            {boardDateMode === 'range' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  max={today}
                  aria-label="Filter kunjungan dari tanggal"
                  value={boardDateFrom}
                  onChange={(e) => {
                    const val = e.target.value || days[0] || today;
                    onChangeBoardDateFrom(val > today ? today : val);
                  }}
                  className="min-h-[34px] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <span className="text-xs text-slate-400">–</span>
                <input
                  type="date"
                  max={today}
                  aria-label="Filter kunjungan sampai tanggal"
                  value={boardDateTo}
                  onChange={(e) => {
                    const val = e.target.value || today;
                    onChangeBoardDateTo(val > today ? today : val);
                  }}
                  className="min-h-[34px] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                <th className="w-12 px-5 py-3">#</th>
                <th className="px-4 py-3">Nama PIC</th>
                <th className="px-4 py-3 text-right">Hari Kunjungan</th>
                <th className="px-4 py-3 text-right">Total Kunjungan</th>
                <th className="px-4 py-3 text-right">Hari Berjalan</th>
                <th className="px-5 py-3">
                  <div>Porsi Kunjungan</div>
                  <div className="text-[10px] font-normal text-slate-400 dark:text-slate-500">
                    dari total {grandTotalVisits}x
                  </div>
                </th>
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
                    <td className="px-4 py-3.5 text-right font-mono font-medium text-slate-700 tabular-nums dark:text-slate-300">
                      {r.totalVisits}x
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

      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Total Kunjungan per Hari
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Klik sel tanggal pada matriks untuk melihat atau mengubah detail di formulir atas
            </p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {filteredMatrixDays.length > 0
              ? `${fmtDate(filteredMatrixDays[0])} – ${fmtDate(filteredMatrixDays[filteredMatrixDays.length - 1])}`
              : 'Tidak ada hari kerja di filter terpilih'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                <th className="sticky left-0 z-10 bg-slate-50 px-5 py-3 font-medium dark:bg-slate-800/90">
                  Nama PIC
                </th>
                {filteredMatrixDays.map((d) => {
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
                  {filteredMatrixDays.map((d) => {
                    const v = store.visit[`${person}|${d}`];
                    const isSelected = activePerson === person && activeDay === d;
                    const isToday = d === today;
                    const visited = Boolean(v?.ok);
                    const entries = visited ? getVisitEntries(v) : [];
                    const count = visited ? Math.max(1, entries.length) : 0;
                    const detailsText = entries
                      .map(
                        (e) =>
                          `${e.outlet || 'Outlet'}${e.f || e.t ? ` (${e.f || '?'}–${e.t || '?'})` : ''}${e.n ? `: ${e.n}` : ''}`
                      )
                      .join(' | ');
                    const tooltip = visited
                      ? `${person} · ${fmtDateLong(d)}${isToday ? ' (Hari H)' : ''} · ${count}x: ${detailsText}`
                      : `${person} · ${fmtDateLong(d)}${isToday ? ' (Hari H — belum dicatat)' : ''}`;

                    return (
                      <td
                        key={d}
                        className={`px-1 py-1.5 text-center ${
                          isToday ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                        }`}
                      >
                        <button
                          type="button"
                          title={tooltip}
                          aria-label={tooltip}
                          onClick={() => onSelectCell(person, d)}
                          className={`mx-auto flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                            isSelected
                              ? 'ring-2 ring-blue-600 ring-offset-1 dark:ring-offset-slate-900'
                              : ''
                          } ${
                            visited
                              ? isToday
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-400 dark:hover:bg-emerald-950'
                                : 'bg-emerald-50/60 text-emerald-700/75 hover:bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400/75 dark:hover:bg-emerald-950/50'
                              : isToday
                                ? 'border border-blue-200 bg-white text-slate-400 hover:bg-blue-50 hover:text-blue-700 dark:border-blue-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
                                : 'bg-slate-100/70 text-slate-300 hover:bg-slate-200/70 hover:text-slate-500 dark:bg-slate-800/40 dark:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-400'
                          }`}
                        >
                          {visited ? (
                            count > 1 ? (
                              <span className="font-mono text-[11px] font-bold tabular-nums">
                                {count}x
                              </span>
                            ) : (
                              <Check className="h-4 w-4" />
                            )
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
    </>
  );
}
