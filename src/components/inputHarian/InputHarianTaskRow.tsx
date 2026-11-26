import { AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import { CalculatedTask, TaskDefinition } from '../../types/outlet';
import {
  DEFAULT_START,
  buildSelectableWeeks,
  fmtDate,
  fmtDateTimeWithSeconds,
  fmtMonth,
  fmtWeek,
  fmtWeekShort,
  getTaskInputType,
  prevMonthFirstDay,
  prevWeekMonday,
  prevWorkingDay,
  weekStartIso,
} from '../../utils/outletLogic';

interface InputHarianTaskRowProps {
  def: TaskDefinition;
  calc: CalculatedTask;
  displayD: string;
  displayN: string;
  isDirty: boolean;
  canEditDay: boolean;
  isAdmin: boolean;
  days: string[];
  selectedDay: string;
  today: string;
  onSetDraft: (
    taskKey: string,
    baseD: string,
    baseN: string,
    patch: { d?: string; n?: string; cleared?: boolean }
  ) => void;
  onClearDraft: (taskKey: string, hasOwnSaved: boolean) => void;
}

export function InputHarianTaskRow({
  def,
  calc,
  displayD,
  displayN,
  isDirty,
  canEditDay,
  isAdmin,
  days,
  selectedDay,
  today,
  onSetDraft,
  onClearDraft,
}: InputHarianTaskRowProps) {
  const inputType = getTaskInputType(def);
  const isMonthly = inputType === 'month';
  const isWeekly = inputType === 'week';
  const quickTargetDate =
    isMonthly || def.formulaType === 'memo_month'
      ? prevMonthFirstDay(selectedDay)
      : isWeekly || def.formulaType === 'weekly_plus_1'
        ? prevWeekMonday(selectedDay)
        : prevWorkingDay(selectedDay);

  const currentComparable = isMonthly
    ? displayD
      ? `${displayD.slice(0, 7)}-01`
      : ''
    : isWeekly
      ? displayD
        ? weekStartIso(displayD)
        : ''
      : displayD;

  const formattedTs = fmtDateTimeWithSeconds(calc.ts);
  const maxMonth = today.slice(0, 7);
  const maxWeekMonday = weekStartIso(today);
  const weekOptions = isWeekly
    ? buildSelectableWeeks(
        days[0] || DEFAULT_START,
        today,
        currentComparable ? [currentComparable] : []
      )
    : [];

  const quickTargetTitle = isMonthly
    ? fmtMonth(quickTargetDate)
    : isWeekly
      ? fmtWeek(quickTargetDate)
      : fmtDate(quickTargetDate);

  const quickTargetButtonLabel = isMonthly
    ? fmtMonth(quickTargetDate)
    : isWeekly
      ? fmtWeekShort(quickTargetDate)
      : fmtDate(quickTargetDate);

  return (
    <tr
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
            {isMonthly
              ? 'Input per bulan'
              : isWeekly
                ? 'Input per minggu'
                : 'Input per tanggal'}{' '}
            · {def.formulaNote}
          </div>
        )}
      </td>

      <td className="px-4 py-3.5 align-middle whitespace-nowrap">
        <div className="inline-flex flex-nowrap items-center gap-2 whitespace-nowrap">
          {isMonthly ? (
            <input
              type="month"
              max={maxMonth}
              disabled={!canEditDay}
              aria-label={`Bulan update ${def.label}`}
              value={displayD ? displayD.slice(0, 7) : ''}
              onChange={(e) => {
                const raw = e.target.value;
                const clamped = raw && raw > maxMonth ? maxMonth : raw;
                onSetDraft(def.key, calc.d, calc.n, {
                  d: clamped ? `${clamped}-01` : '',
                  cleared: false,
                });
              }}
              className="h-[38px] w-[150px] shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200/80 disabled:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:border-slate-700/70 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500"
            />
          ) : isWeekly ? (
            <select
              disabled={!canEditDay}
              aria-label={`Minggu update ${def.label}`}
              value={currentComparable}
              onChange={(e) => {
                const raw = e.target.value;
                const normalized = raw ? weekStartIso(raw) : '';
                const clamped =
                  normalized && normalized > maxWeekMonday ? maxWeekMonday : normalized;
                onSetDraft(def.key, calc.d, calc.n, {
                  d: clamped,
                  cleared: false,
                });
              }}
              className="h-[38px] w-[172px] shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200/80 disabled:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:border-slate-700/70 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500"
            >
              <option value="">Pilih minggu...</option>
              {weekOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="date"
              max={today}
              disabled={!canEditDay}
              aria-label={`Tanggal update ${def.label}`}
              value={displayD}
              onChange={(e) => {
                const raw = e.target.value;
                const clamped = raw && raw > today ? today : raw;
                onSetDraft(def.key, calc.d, calc.n, {
                  d: clamped,
                  cleared: false,
                });
              }}
              className="h-[38px] w-[150px] shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200/80 disabled:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:border-slate-700/70 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500"
            />
          )}

          {canEditDay &&
            (currentComparable !== quickTargetDate ? (
              <button
                type="button"
                onClick={() =>
                  onSetDraft(def.key, calc.d, calc.n, {
                    d: quickTargetDate,
                    cleared: false,
                  })
                }
                title={`Atur ke ${quickTargetTitle}`}
                className="inline-flex h-[38px] min-w-[108px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Set {quickTargetButtonLabel}
              </button>
            ) : (
              <span className="h-[38px] min-w-[108px] shrink-0" aria-hidden="true" />
            ))}

          {canEditDay &&
            (calc.own || isDirty ? (
              <button
                type="button"
                onClick={() => onClearDraft(def.key, calc.own)}
                title={calc.own ? 'Kosongkan entri' : 'Batalkan perubahan draft'}
                aria-label={`Reset entri ${def.label}`}
                className="flex h-[38px] w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="h-[38px] w-8 shrink-0" aria-hidden="true" />
            ))}
        </div>
      </td>

      <td className="px-4 py-3.5 align-middle text-xs text-slate-500 dark:text-slate-400">
        {isDirty ? (
          <span className="font-medium text-blue-700 dark:text-blue-400">Draft (klik Save)</span>
        ) : calc.source === 'own' && calc.d ? (
          formattedTs ? (
            <div>
              <div className="font-medium text-slate-700 dark:text-slate-300">Diinput</div>
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
            : isWeekly
              ? calc.rumus
                ? fmtWeek(calc.rumus)
                : '—'
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
          <div>{!calc.d ? '—' : calc.pm > 0 ? `+${calc.pm}` : calc.pm}</div>
          {calc.backfillDays ? (
            <div className="mt-0.5 font-sans text-[10px] font-medium text-red-500 dark:text-red-400">
              Isi mundur {calc.backfillDays} hr
            </div>
          ) : null}
        </td>
      )}

      <td className="px-4 py-3.5 align-middle">
        {calc.pend ? (
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
              canEditDay ? 'text-red-600 dark:text-red-400' : 'text-red-500/80 dark:text-red-400/70'
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
            onSetDraft(def.key, calc.d, calc.n, {
              n: e.target.value.slice(0, 100),
              cleared: false,
            })
          }
          className="min-h-[38px] w-full min-w-[160px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200/80 disabled:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:border-slate-700/70 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500"
        />
      </td>
    </tr>
  );
}
