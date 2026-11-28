import { Calendar, Plus, Repeat, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { TaskScheduleMode } from '../../types/outlet';
import {
  TASK_WEEKDAY_OPTIONS,
  fmtDateFull,
  isSunday,
  nextDateForWeekday,
  todayIso,
} from '../../utils/outletLogic';

export interface TaskScheduleDraft {
  scheduleMode: TaskScheduleMode;
  scheduleWeekdays: number[];
  scheduleMonthDays: number[];
  scheduleDates: string[];
  scheduleRepeatEnd: string;
}

export const DEFAULT_TASK_SCHEDULE_DRAFT: TaskScheduleDraft = {
  scheduleMode: 'always',
  scheduleWeekdays: [1],
  scheduleMonthDays: [1],
  scheduleDates: [],
  scheduleRepeatEnd: '',
};

interface TaskScheduleFieldsProps {
  value: TaskScheduleDraft;
  onChange: (next: TaskScheduleDraft) => void;
  disabled?: boolean;
  idPrefix?: string;
}

const MODE_OPTIONS: Array<{
  id: TaskScheduleMode;
  label: string;
  hint: string;
}> = [
  {
    id: 'always',
    label: 'Setiap Hari Kerja',
    hint: 'Muncul rutin setiap hari kerja (Senin–Sabtu).',
  },
  {
    id: 'weekdays',
    label: 'Hari Tertentu (Berulang)',
    hint: 'Muncul berulang setiap minggu pada hari kerja yang dipilih.',
  },
  {
    id: 'monthly_dates',
    label: 'Tanggal Tertentu (Berulang)',
    hint: 'Muncul berulang setiap bulan pada tanggal yang dipilih (tgl 31 otomatis menyesuaikan akhir bulan).',
  },
  {
    id: 'once',
    label: 'Sekali Muncul Lalu Hilang',
    hint: 'Hanya muncul pada hari/tanggal terpilih saja, lalu otomatis hilang pada hari lain.',
  },
];

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function TaskScheduleFields({
  value,
  onChange,
  disabled = false,
  idPrefix = 'task-sched',
}: TaskScheduleFieldsProps) {
  const today = todayIso();
  const [dateInput, setDateInput] = useState<string>(() => {
    const first = value.scheduleDates[0];
    return first || today;
  });
  const [dateWarning, setDateWarning] = useState<string | null>(null);

  const handleModeChange = (nextMode: TaskScheduleMode) => {
    setDateWarning(null);
    if (nextMode === 'weekdays') {
      onChange({
        ...value,
        scheduleMode: 'weekdays',
        scheduleWeekdays: value.scheduleWeekdays.length > 0 ? value.scheduleWeekdays : [1],
      });
      return;
    }
    if (nextMode === 'monthly_dates') {
      onChange({
        ...value,
        scheduleMode: 'monthly_dates',
        scheduleMonthDays: value.scheduleMonthDays.length > 0 ? value.scheduleMonthDays : [1],
      });
      return;
    }
    if (nextMode === 'once') {
      const fallbackDate =
        value.scheduleDates.length > 0
          ? value.scheduleDates
          : isSunday(today)
            ? [nextDateForWeekday(1, today)]
            : [today];
      setDateInput(fallbackDate[0]);
      onChange({
        ...value,
        scheduleMode: 'once',
        scheduleDates: fallbackDate,
      });
      return;
    }
    onChange({
      ...value,
      scheduleMode: 'always',
    });
  };

  const toggleWeekday = (dow: number) => {
    const exists = value.scheduleWeekdays.includes(dow);
    const next = exists
      ? value.scheduleWeekdays.filter((d) => d !== dow)
      : [...value.scheduleWeekdays, dow].sort((a, b) => a - b);
    onChange({
      ...value,
      scheduleWeekdays: next,
    });
  };

  const toggleMonthDay = (dom: number) => {
    const exists = value.scheduleMonthDays.includes(dom);
    const next = exists
      ? value.scheduleMonthDays.filter((d) => d !== dom)
      : [...value.scheduleMonthDays, dom].sort((a, b) => a - b);
    onChange({
      ...value,
      scheduleMonthDays: next,
    });
  };

  const addSpecificDate = (iso: string) => {
    const clean = iso.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return;
    if (isSunday(clean)) {
      setDateWarning('Tanggal yang dipilih jatuh pada hari Minggu (libur input). Pilih Senin–Sabtu.');
      return;
    }
    setDateWarning(null);
    if (value.scheduleDates.includes(clean)) return;
    const next = [...value.scheduleDates, clean].sort().slice(0, 31);
    onChange({
      ...value,
      scheduleDates: next,
    });
  };

  const removeSpecificDate = (iso: string) => {
    setDateWarning(null);
    onChange({
      ...value,
      scheduleDates: value.scheduleDates.filter((d) => d !== iso),
    });
  };

  const activeMeta = MODE_OPTIONS.find((m) => m.id === value.scheduleMode) || MODE_OPTIONS[0];

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3.5 dark:border-slate-700/80 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
          {value.scheduleMode === 'once' ? (
            <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          ) : value.scheduleMode === 'always' ? (
            <Calendar className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          ) : (
            <Repeat className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          )}
          <span>Jadwal Kemunculan Tugas</span>
        </span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">{activeMeta.hint}</span>
      </div>

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {MODE_OPTIONS.map((opt) => {
          const selected = value.scheduleMode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              onClick={() => handleModeChange(opt.id)}
              className={`min-h-[36px] rounded-lg border px-3 py-1.5 text-left text-xs font-medium transition-colors disabled:opacity-50 ${
                selected
                  ? 'border-blue-700 bg-blue-700 text-white dark:border-blue-600 dark:bg-blue-600'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {value.scheduleMode === 'weekdays' && (
        <div className="space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              Pilih Hari Muncul (Senin–Sabtu)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TASK_WEEKDAY_OPTIONS.map((dayOpt) => {
                const active = value.scheduleWeekdays.includes(dayOpt.value);
                return (
                  <button
                    key={dayOpt.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleWeekday(dayOpt.value)}
                    className={`min-h-[34px] min-w-[56px] rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
                      active
                        ? 'border-blue-700 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                    }`}
                  >
                    {dayOpt.label}
                  </button>
                );
              })}
            </div>
            {value.scheduleWeekdays.length === 0 && (
              <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                Pilih minimal 1 hari kerja.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={`${idPrefix}-repeat-end-wk`}
              className="text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              Berulang sampai tanggal (opsional):
            </label>
            <input
              id={`${idPrefix}-repeat-end-wk`}
              type="date"
              disabled={disabled}
              value={value.scheduleRepeatEnd}
              onChange={(e) => onChange({ ...value, scheduleRepeatEnd: e.target.value })}
              className="min-h-[34px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            {value.scheduleRepeatEnd && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...value, scheduleRepeatEnd: '' })}
                className="text-xs font-medium text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Tanpa batas
              </button>
            )}
          </div>
        </div>
      )}

      {value.scheduleMode === 'monthly_dates' && (
        <div className="space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Pilih Tanggal Berulang Tiap Bulan (1–31)
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ ...value, scheduleMonthDays: [1] })}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Awal Bulan (1)
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ ...value, scheduleMonthDays: [1, 15] })}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Tgl 1 & 15
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ ...value, scheduleMonthDays: [31] })}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Akhir Bulan (31)
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 sm:grid-cols-11">
              {MONTH_DAYS.map((dom) => {
                const active = value.scheduleMonthDays.includes(dom);
                return (
                  <button
                    key={dom}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleMonthDay(dom)}
                    className={`h-8 rounded-md border font-mono text-xs font-semibold tabular-nums transition-colors disabled:opacity-50 ${
                      active
                        ? 'border-blue-700 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                    }`}
                  >
                    {dom}
                  </button>
                );
              })}
            </div>
            {value.scheduleMonthDays.length === 0 && (
              <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                Pilih minimal 1 tanggal (1–31).
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={`${idPrefix}-repeat-end-mo`}
              className="text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              Berulang sampai tanggal (opsional):
            </label>
            <input
              id={`${idPrefix}-repeat-end-mo`}
              type="date"
              disabled={disabled}
              value={value.scheduleRepeatEnd}
              onChange={(e) => onChange({ ...value, scheduleRepeatEnd: e.target.value })}
              className="min-h-[34px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            {value.scheduleRepeatEnd && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...value, scheduleRepeatEnd: '' })}
                className="text-xs font-medium text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Tanpa batas
              </button>
            )}
          </div>
        </div>
      )}

      {value.scheduleMode === 'once' && (
        <div className="space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label
                htmlFor={`${idPrefix}-once-date`}
                className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                Pilih Tanggal Kemunculan (Sekali Saja)
              </label>
              <input
                id={`${idPrefix}-once-date`}
                type="date"
                disabled={disabled}
                value={dateInput}
                onChange={(e) => {
                  setDateInput(e.target.value);
                  setDateWarning(null);
                }}
                className="min-h-[36px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <button
              type="button"
              disabled={disabled || !dateInput}
              onClick={() => addSpecificDate(dateInput)}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tambah Tanggal</span>
            </button>

            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[11px] text-slate-500 dark:text-slate-400">
                Atau pilih hari terdekat:
              </span>
              {TASK_WEEKDAY_OPTIONS.map((dayOpt) => {
                const targetIso = nextDateForWeekday(dayOpt.value, today);
                return (
                  <button
                    key={dayOpt.value}
                    type="button"
                    disabled={disabled}
                    title={`Tambah ${fmtDateFull(targetIso)}`}
                    onClick={() => {
                      setDateInput(targetIso);
                      addSpecificDate(targetIso);
                    }}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    {dayOpt.short}
                  </button>
                );
              })}
            </div>
          </div>

          {dateWarning && (
            <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
              {dateWarning}
            </p>
          )}

          {value.scheduleDates.length === 0 ? (
            <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
              Tambahkan minimal 1 tanggal kemunculan.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {value.scheduleDates.map((iso) => (
                <span
                  key={iso}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  <span>{fmtDateFull(iso)}</span>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`Hapus tanggal ${iso}`}
                    onClick={() => removeSpecificDate(iso)}
                    className="rounded p-0.5 hover:bg-amber-200/60 dark:hover:bg-amber-900/60"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
