import { AlertCircle, ArrowUpRight, CheckCircle2, Search } from 'lucide-react';
import { useState } from 'react';
import { OutletStoreState, RoleConfig } from '../types/outlet';
import {
  calcRecap,
  calcTask,
  fmtDate,
  fmtMonth,
  getPersonList,
  getTaskInputType,
  nearestWorkingDay,
  todayIso,
} from '../utils/outletLogic';

interface RekapRankingViewProps {
  config: RoleConfig;
  store: OutletStoreState;
  days: string[];
  selectedTask: string;
  recapDate: string;
  onChangeTask: (taskKey: string) => void;
  onChangeRecapDate: (date: string) => void;
  onJumpToOutlet: (person: string, outlet: string, day: string) => void;
}

export function RekapRankingView({
  config,
  store,
  days,
  selectedTask,
  recapDate,
  onChangeTask,
  onChangeRecapDate,
  onJumpToOutlet,
}: RekapRankingViewProps) {
  const [subMode, setSubMode] = useState<'ranking' | 'matrix'>('ranking');
  const [picFilter, setPicFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const today = todayIso();
  const personList = getPersonList(config.outlets);

  if (config.outlets.length === 0 || config.tasks.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Rekap Belum Tersedia untuk {config.label}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
          Tambahkan daftar tugas dan outlet pada role {config.label} terlebih dahulu untuk melihat ranking dan matriks.
        </p>
      </section>
    );
  }

  const activeTaskDef =
    config.tasks.find((t) => t.key === selectedTask) || config.tasks[0];
  const activeTaskKey = activeTaskDef.key;
  const isActiveTaskMonthly = getTaskInputType(activeTaskDef) === 'month';

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredOutlets = config.outlets.filter(({ code, person }) => {
    if (picFilter !== 'ALL' && person !== picFilter) return false;
    if (
      normalizedQuery &&
      !code.toLowerCase().includes(normalizedQuery) &&
      !person.toLowerCase().includes(normalizedQuery)
    ) {
      return false;
    }
    return true;
  });

  const effectiveRecapDate = recapDate > today ? today : recapDate;

  const rankingRows = filteredOutlets
    .map(({ code, person }) =>
      calcRecap(store, days, config.tasks, code, person, activeTaskKey, effectiveRecapDate, today)
    )
    .sort((a, b) => Number(a.hasAnyInput) - Number(b.hasAnyInput) || a.avg - b.avg);

  const avgAll = rankingRows.length
    ? rankingRows.reduce((acc, r) => acc + r.avg, 0) / rankingRows.length
    : 0;
  const neverInputOutlets = rankingRows.filter((r) => !r.hasAnyInput).length;
  const latestPendingOutlets = rankingRows.filter((r) => r.latestPend).length;
  const latestUpdateOutlets = rankingRows.length - latestPendingOutlets;

  const activeDayForMatrix = nearestWorkingDay(days, effectiveRecapDate);

  return (
    <div className="space-y-5">
      {/* Filter & Mode Switcher */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setSubMode('ranking')}
              className={`min-h-[36px] whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
                subMode === 'ranking'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Ranking per Item
            </button>
            <button
              type="button"
              onClick={() => setSubMode('matrix')}
              className={`min-h-[36px] whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
                subMode === 'matrix'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Matriks {config.outlets.length} Outlet
            </button>
          </div>

          <div className="relative w-full sm:w-60">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari outlet atau PIC..."
              aria-label="Cari outlet atau PIC"
              className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {subMode === 'ranking' && (
            <div>
              <label
                htmlFor="rekap-item"
                className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Item Pemantauan
              </label>
              <select
                id="rekap-item"
                value={activeTaskKey}
                onChange={(e) => onChangeTask(e.target.value)}
                className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {config.tasks.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label
              htmlFor="rekap-date"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Per Tanggal
            </label>
            <input
              id="rekap-date"
              type="date"
              max={today}
              value={recapDate}
              onChange={(e) => {
                const val = e.target.value || today;
                onChangeRecapDate(val > today ? today : val);
              }}
              className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label
              htmlFor="rekap-pic"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Filter PIC
            </label>
            <select
              id="rekap-pic"
              value={picFilter}
              onChange={(e) => setPicFilter(e.target.value)}
              className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="ALL">Semua PIC ({config.outlets.length} Outlet)</option>
              {personList.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {subMode === 'ranking' ? (
        <>
          <section className="grid grid-cols-2 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white sm:grid-cols-4 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            <div className="p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Outlet Ditampilkan</div>
              <div className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                {rankingRows.length}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Rata-rata +/-</div>
              <div
                className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
                  avgAll < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {avgAll > 0 ? `+${avgAll.toFixed(1)}` : avgAll.toFixed(1)}
              </div>
            </div>
            <div className="border-t border-slate-200 p-4 sm:border-t-0 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">Status Update</div>
              <div className="mt-1 font-mono text-xl font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                {latestUpdateOutlets}
              </div>
            </div>
            <div className="border-t border-slate-200 p-4 sm:border-t-0 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">Status Pending</div>
              <div
                className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
                  latestPendingOutlets > 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {latestPendingOutlets}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Ranking dari Paling Telat ke Paling Baik
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {config.label} · Per tanggal {fmtDate(effectiveRecapDate)}
                {recapDate > today ? ` (dibatasi hari ini)` : ''}
                {neverInputOutlets > 0 ? ` · ${neverInputOutlets} belum pernah input` : ''}
              </span>
            </div>

            {rankingRows.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                Tidak ada outlet yang cocok dengan pencarian Anda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                      <th className="w-12 px-5 py-3">#</th>
                      <th className="px-4 py-3">Outlet</th>
                      <th className="px-4 py-3">Nama PIC</th>
                      <th className="px-4 py-3">Tgl Update</th>
                      <th className="px-4 py-3">Status Terakhir</th>
                      <th className="px-4 py-3 text-right">Rata-rata Telat</th>
                      <th className="px-4 py-3 text-right">Pending (hari)</th>
                      <th className="px-5 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rankingRows.map((row, idx) => (
                      <tr
                        key={row.outlet}
                        className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                      >
                        <td className="px-5 py-3 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                          {row.outlet}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {row.person}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600 tabular-nums dark:text-slate-300">
                          {!row.hasAnyInput ? (
                            <span className="font-sans text-slate-400 dark:text-slate-500">
                              Belum pernah input
                            </span>
                          ) : isActiveTaskMonthly ? (
                            fmtMonth(row.latestDate)
                          ) : (
                            fmtDate(row.latestDate)
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {!row.hasAnyInput ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                              <span>BELUM INPUT</span>
                            </span>
                          ) : row.latestPend ? (
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
                        <td
                          className={`px-4 py-3 text-right font-mono font-semibold tabular-nums ${
                            !row.hasAnyInput || row.avg < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {row.avg > 0 ? `+${row.avg.toFixed(1)}` : row.avg.toFixed(1)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums dark:text-slate-300">
                          <div>{row.pend}</div>
                          {row.backfillCount > 0 && (
                            <div className="font-sans text-[10px] font-medium text-red-500 dark:text-red-400">
                              {row.backfillCount}x isi mundur
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              onJumpToOutlet(row.person, row.outlet, activeDayForMatrix)
                            }
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
                          >
                            <span>Edit</span>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Rata-rata telat = rata-rata nilai +/- hari kerja (Senin–Sabtu) sampai tanggal terpilih. Hari Minggu tidak masuk perhitungan maupun input harian.
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Matriks Seluruh Outlet · {fmtDate(activeDayForMatrix)}
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Klik outlet untuk membuka Input Harian
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                  <th className="px-5 py-3">Outlet</th>
                  <th className="px-3 py-3">PIC</th>
                  {config.tasks.map((t) => (
                    <th key={t.key} className="px-3 py-3 text-right">
                      {t.shortLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredOutlets.map(({ code, person }) => (
                  <tr
                    key={code}
                    className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                  >
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => onJumpToOutlet(person, code, activeDayForMatrix)}
                        className="font-semibold text-blue-700 hover:underline dark:text-blue-400"
                      >
                        {code}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{person}</td>
                    {config.tasks.map((t) => {
                      const c = calcTask(
                        store,
                        days,
                        config.tasks,
                        code,
                        activeDayForMatrix,
                        t.key,
                        today
                      );
                      const isMonthly = getTaskInputType(t) === 'month';
                      return (
                        <td key={t.key} className="px-3 py-3 text-right font-mono tabular-nums">
                          <div
                            className={`font-semibold ${
                              c.pend
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {!c.d ? '—' : c.pm > 0 ? `+${c.pm}` : c.pm}
                          </div>
                          <div className="text-[11px] text-slate-400 dark:text-slate-500">
                            {isMonthly ? fmtMonth(c.d) : fmtDate(c.d)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
