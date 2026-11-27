import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import {
  DayAdjustmentScope,
  DayAdjustmentType,
  RoleConfig,
  WorkingDayAdjustment,
} from '../../types/outlet';
import {
  DAY_ADJUSTMENT_TYPE_LABELS,
  buildMonthWorkingDays,
  countAdjustedWorkingDays,
  countWorkingDaysInRange,
  fmtDate,
  fmtMonth,
  todayIso,
} from '../../utils/outletLogic';
import { DateRangeFilterPopover } from '../records/DateRangeFilterPopover';

interface AdminDayAdjustmentsSectionProps {
  config: RoleConfig;
  activeMonth: string;
  suggestedPicNames: string[];
  busy: boolean;
  onAddRoleAdjustment: (adjustment: WorkingDayAdjustment) => Promise<void>;
  onDeleteRoleAdjustment: (adjustmentId: string) => Promise<void>;
  onAddAllRolesAdjustment: (adjustment: WorkingDayAdjustment) => Promise<void>;
  onDeleteAllRolesAdjustment: (adjustmentId: string) => Promise<void>;
}

const ADJUSTMENT_TYPES: DayAdjustmentType[] = [
  'off_day',
  'cuti_izin',
  'cuti_bersama',
  'libur_nasional',
];

function makeAdjustmentId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `adj_${Date.now().toString(36)}_${rand}`;
}

export function AdminDayAdjustmentsSection({
  config,
  activeMonth,
  suggestedPicNames,
  busy,
  onAddRoleAdjustment,
  onDeleteRoleAdjustment,
  onAddAllRolesAdjustment,
  onDeleteAllRolesAdjustment,
}: AdminDayAdjustmentsSectionProps) {
  const today = todayIso();
  const adjustments = useMemo(() => config.dayAdjustments || [], [config.dayAdjustments]);

  const [adjType, setAdjType] = useState<DayAdjustmentType>('cuti_izin');
  const [adjScope, setAdjScope] = useState<DayAdjustmentScope>('person');
  const [adjPic, setAdjPic] = useState<string>(() => suggestedPicNames[0] || '');
  const [dateExact, setDateExact] = useState<string>(today);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [previewMonth, setPreviewMonth] = useState<string>(activeMonth);

  const effectivePic =
    adjScope === 'person'
      ? suggestedPicNames.includes(adjPic)
        ? adjPic
        : adjPic || suggestedPicNames[0] || ''
      : '';

  const resolvedFrom = dateExact || dateFrom || today;
  const resolvedTo = dateExact || dateTo || dateFrom || today;
  const normFrom = resolvedFrom <= resolvedTo ? resolvedFrom : resolvedTo;
  const normTo = resolvedFrom <= resolvedTo ? resolvedTo : resolvedFrom;
  const selectedWorkDaysCount = countWorkingDaysInRange(normFrom, normTo);

  const previewMonthDays = useMemo(
    () => buildMonthWorkingDays(previewMonth),
    [previewMonth]
  );

  const picSummaryRows = useMemo(() => {
    return suggestedPicNames.map((pic) => ({
      pic,
      stats: countAdjustedWorkingDays(previewMonthDays, adjustments, pic),
    }));
  }, [suggestedPicNames, previewMonthDays, adjustments]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedWorkDaysCount <= 0) return;
    if (adjScope === 'person' && !effectivePic.trim()) return;

    const nextAdj: WorkingDayAdjustment = {
      id: makeAdjustmentId(),
      type: adjType,
      scope: adjScope,
      ...(adjScope === 'person' ? { pic: effectivePic.trim().toUpperCase() } : {}),
      dateFrom: normFrom,
      dateTo: normTo,
      ...(note.trim() ? { note: note.trim().slice(0, 100) } : {}),
    };

    if (adjScope === 'all') {
      await onAddAllRolesAdjustment(nextAdj);
    } else {
      await onAddRoleAdjustment(nextAdj);
    }
    setNote('');
  };

  const handleDelete = async (adj: WorkingDayAdjustment) => {
    if (adj.scope === 'all') {
      await onDeleteAllRolesAdjustment(adj.id);
    } else {
      await onDeleteRoleAdjustment(adj.id);
    }
  };

  const formatScopeLabel = (adj: WorkingDayAdjustment) => {
    if (adj.scope === 'all') return 'Semua Orang (Semua Divisi)';
    if (adj.scope === 'role') return `Divisi ${config.label}`;
    return `Personil: ${adj.pic || '-'}`;
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
            <CalendarOff className="h-4 w-4 text-blue-700 dark:text-blue-400" />
            <span>Adjustment Hari Kerja · {config.label} ({adjustments.length})</span>
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Atur Off Day, Cuti / Izin, Cuti Bersama, atau Libur Nasional per personil, per divisi, atau semua orang. Hari kerja yang di-adjust otomatis mengurangi pembagi rata-rata KPI (contoh: 25 − 4 = 21 hari kerja).
          </p>
        </div>
      </div>

      {/* Add Adjustment Form */}
      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 items-end gap-3 border-b border-slate-200 bg-slate-50/60 p-5 sm:grid-cols-12 dark:border-slate-800 dark:bg-slate-800/30"
      >
        <div className="sm:col-span-3">
          <label
            htmlFor="adj-type"
            className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
          >
            Jenis Adjustment
          </label>
          <select
            id="adj-type"
            value={adjType}
            onChange={(e) => setAdjType(e.target.value as DayAdjustmentType)}
            className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {ADJUSTMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {DAY_ADJUSTMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-3">
          <label
            htmlFor="adj-scope"
            className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
          >
            Berlaku Untuk
          </label>
          <select
            id="adj-scope"
            value={adjScope}
            onChange={(e) => setAdjScope(e.target.value as DayAdjustmentScope)}
            className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="person">Per Personil (PIC)</option>
            <option value="role">Per Divisi ({config.label})</option>
            <option value="all">Semua Orang (Semua Divisi)</option>
          </select>
        </div>

        {adjScope === 'person' ? (
          <div className="sm:col-span-3">
            <label
              htmlFor="adj-pic"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Pilih Personil (PIC)
            </label>
            {suggestedPicNames.length > 0 ? (
              <select
                id="adj-pic"
                value={effectivePic}
                onChange={(e) => setAdjPic(e.target.value)}
                className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {suggestedPicNames.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="adj-pic"
                type="text"
                required
                value={adjPic}
                onChange={(e) => setAdjPic(e.target.value)}
                placeholder="Nama PIC (contoh: PETER)"
                className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            )}
          </div>
        ) : (
          <div className="sm:col-span-3">
            <div className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Target Penerapan
            </div>
            <div className="flex min-h-[40px] items-center rounded-lg border border-slate-200 bg-slate-100/70 px-3 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {adjScope === 'all' ? 'Seluruh Divisi & Personil' : `Semua PIC di ${config.label}`}
            </div>
          </div>
        )}

        <div className="sm:col-span-3">
          <DateRangeFilterPopover
            id="adj-date-range"
            label={`Tanggal (${selectedWorkDaysCount} hr kerja)`}
            today={today}
            allowClear={false}
            dateExact={dateExact}
            dateFrom={dateFrom}
            dateTo={dateTo}
            labelClassName="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            triggerClassName="min-h-[40px] bg-white dark:bg-slate-900 px-3 text-sm"
            onSelectSingleDate={(iso) => {
              setDateExact(iso);
              setDateFrom('');
              setDateTo('');
            }}
            onSelectDateRange={(start, end) => {
              setDateExact('');
              setDateFrom(start);
              setDateTo(end);
            }}
          />
        </div>

        <div className="sm:col-span-9">
          <label
            htmlFor="adj-note"
            className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
          >
            Keterangan (Opsional)
          </label>
          <input
            id="adj-note"
            type="text"
            maxLength={100}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Contoh: Cuti tahunan, Off pengganti lembur, Libur Hari Raya..."
            className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={
              busy ||
              selectedWorkDaysCount <= 0 ||
              (adjScope === 'person' && !effectivePic.trim())
            }
            className="flex min-h-[40px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            <span>Tambah Adjustment</span>
          </button>
        </div>
      </form>

      {/* Effective Working Days Preview per PIC */}
      {picSummaryRows.length > 0 && (
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Ringkasan Pembagi KPI · {fmtMonth(`${previewMonth}-01`)} ({previewMonthDays.length}{' '}
                hari kerja standar)
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Hari kerja Senin–Sabtu dikurangi adjustment unik per personil (hari Minggu otomatis tidak dihitung).
              </div>
            </div>
            <input
              type="month"
              value={previewMonth}
              onChange={(e) => {
                if (/^\d{4}-\d{2}$/.test(e.target.value)) {
                  setPreviewMonth(e.target.value);
                }
              }}
              aria-label="Bulan pratinjau pembagi KPI"
              className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-700 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                  <th className="px-3 py-2">Personil (PIC)</th>
                  <th className="px-3 py-2 text-right">Off Day</th>
                  <th className="px-3 py-2 text-right">Cuti / Izin</th>
                  <th className="px-3 py-2 text-right">Cuti Bersama</th>
                  <th className="px-3 py-2 text-right">Libur Nasional</th>
                  <th className="px-3 py-2 text-right">Total Adj</th>
                  <th className="px-3 py-2 text-right">Hari Efektif KPI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {picSummaryRows.map(({ pic, stats }) => (
                  <tr key={pic} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20">
                    <td className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">
                      {pic}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600 tabular-nums dark:text-slate-300">
                      {stats.byType.off_day || '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600 tabular-nums dark:text-slate-300">
                      {stats.byType.cuti_izin || '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600 tabular-nums dark:text-slate-300">
                      {stats.byType.cuti_bersama || '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600 tabular-nums dark:text-slate-300">
                      {stats.byType.libur_nasional || '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-medium text-slate-700 tabular-nums dark:text-slate-300">
                      {stats.adjusted > 0 ? `-${stats.adjusted} hr` : '0'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                      <span
                        className={
                          stats.adjusted > 0
                            ? 'text-blue-700 dark:text-blue-400'
                            : 'text-slate-800 dark:text-slate-200'
                        }
                      >
                        {stats.effective} / {stats.total} hr
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Saved Adjustments List */}
      {adjustments.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
          Belum ada adjustment hari kerja untuk {config.label}. Semua hari kerja (Senin–Sabtu) masuk ke perhitungan rata-rata KPI.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                <th className="px-5 py-2.5">Jenis</th>
                <th className="px-4 py-2.5">Berlaku Untuk</th>
                <th className="px-4 py-2.5">Tanggal</th>
                <th className="px-4 py-2.5 text-right">Hari Kerja</th>
                <th className="px-4 py-2.5">Keterangan</th>
                <th className="px-5 py-2.5 text-right">Hapus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {adjustments.map((adj) => {
                const workDays = countWorkingDaysInRange(adj.dateFrom, adj.dateTo);
                return (
                  <tr
                    key={adj.id}
                    className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                  >
                    <td className="px-5 py-2.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {DAY_ADJUSTMENT_TYPE_LABELS[adj.type]}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300">
                      {formatScopeLabel(adj)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap dark:text-slate-300">
                      {adj.dateFrom === adj.dateTo
                        ? fmtDate(adj.dateFrom)
                        : `${fmtDate(adj.dateFrom)} – ${fmtDate(adj.dateTo)}`}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-blue-700 tabular-nums dark:text-blue-400">
                      {workDays} hr
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                      {adj.note || '—'}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleDelete(adj)}
                        aria-label={`Hapus adjustment ${DAY_ADJUSTMENT_TYPE_LABELS[adj.type]}`}
                        title={
                          adj.scope === 'all'
                            ? 'Hapus dari semua divisi'
                            : 'Hapus adjustment'
                        }
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
