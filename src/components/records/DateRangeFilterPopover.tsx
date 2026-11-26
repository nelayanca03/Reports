import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtDateSlash, parseUtcDate, shiftIsoDays } from '../../utils/outletLogic';

const FILTER_WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

function shiftFilterMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatFilterMonthLabel(ym: string): string {
  const d = parseUtcDate(`${ym}-01`);
  return d.toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function buildFilterCalendarDays(ym: string): string[] {
  const firstOfMonth = `${ym}-01`;
  const firstDate = parseUtcDate(firstOfMonth);
  const dow = firstDate.getUTCDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const gridStart = shiftIsoDays(firstOfMonth, diffToMon);
  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(shiftIsoDays(gridStart, i));
  }
  if (cells.slice(35).every((c) => c.slice(0, 7) !== ym)) {
    return cells.slice(0, 35);
  }
  return cells;
}

interface DateRangeFilterPopoverProps {
  today: string;
  dateExact: string;
  dateFrom: string;
  dateTo: string;
  onSelectSingleDate: (isoDate: string) => void;
  onSelectDateRange: (start: string, end: string) => void;
  onClearDateFilter: () => void;
}

export function DateRangeFilterPopover({
  today,
  dateExact,
  dateFrom,
  dateTo,
  onSelectSingleDate,
  onSelectDateRange,
  onClearDateFilter,
}: DateRangeFilterPopoverProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(today.slice(0, 7));
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const calendarPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!calendarOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (
        calendarPopoverRef.current &&
        !calendarPopoverRef.current.contains(e.target as Node)
      ) {
        setCalendarOpen(false);
        setRangeAnchor(null);
        setHoverDate(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCalendarOpen(false);
        setRangeAnchor(null);
        setHoverDate(null);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [calendarOpen]);

  const calendarGridDays = useMemo(
    () => buildFilterCalendarDays(calendarMonth),
    [calendarMonth]
  );

  const hasDateFilter = Boolean(dateExact || dateFrom || dateTo);
  const dateFilterDisplay = dateExact
    ? fmtDateSlash(dateExact)
    : dateFrom && dateTo
      ? `${fmtDateSlash(dateFrom)} – ${fmtDateSlash(dateTo)}`
      : 'Semua Tanggal';

  const handleToggleDatePopover = () => {
    if (calendarOpen) {
      setCalendarOpen(false);
      setRangeAnchor(null);
      setHoverDate(null);
    } else {
      const targetMonth = (dateExact || dateFrom || today).slice(0, 7) || today.slice(0, 7);
      setCalendarMonth(targetMonth);
      setRangeAnchor(null);
      setHoverDate(null);
      setCalendarOpen(true);
    }
  };

  const handleCalendarDayClick = (isoDate: string) => {
    if (!rangeAnchor) {
      setRangeAnchor(isoDate);
      return;
    }
    if (isoDate === rangeAnchor) {
      onSelectSingleDate(isoDate);
    } else {
      const start = rangeAnchor < isoDate ? rangeAnchor : isoDate;
      const end = rangeAnchor < isoDate ? isoDate : rangeAnchor;
      onSelectDateRange(start, end);
    }
    setRangeAnchor(null);
    setHoverDate(null);
    setCalendarOpen(false);
  };

  const handleReset = () => {
    setRangeAnchor(null);
    setHoverDate(null);
    onClearDateFilter();
  };

  return (
    <div className="relative" ref={calendarPopoverRef}>
      <label
        htmlFor="rec-date-trigger"
        className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400"
      >
        Date
      </label>
      <div className="relative flex items-center">
        <button
          id="rec-date-trigger"
          type="button"
          aria-expanded={calendarOpen}
          aria-haspopup="dialog"
          onClick={handleToggleDatePopover}
          className={`flex min-h-[38px] w-full items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-left text-xs transition-colors focus:border-blue-600 focus:outline-none dark:bg-slate-900 ${
            hasDateFilter
              ? 'border-blue-500/70 pr-7 font-mono font-semibold text-blue-800 tabular-nums dark:border-blue-500/60 dark:text-blue-300'
              : 'border-slate-200 font-medium text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600'
          }`}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{dateFilterDisplay}</span>
        </button>
        {hasDateFilter && (
          <button
            type="button"
            onClick={handleReset}
            aria-label="Hapus filter tanggal"
            className="absolute right-2 flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {calendarOpen && (
        <div
          role="dialog"
          aria-label="Pilih tanggal atau range tanggal"
          className="absolute top-full left-0 z-40 mt-1.5 w-[296px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setCalendarMonth((m) => shiftFilterMonth(m, -1))}
              aria-label="Bulan sebelumnya"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              {formatFilterMonthLabel(calendarMonth)}
            </span>
            <button
              type="button"
              onClick={() => setCalendarMonth((m) => shiftFilterMonth(m, 1))}
              aria-label="Bulan berikutnya"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-slate-400 dark:text-slate-500">
            {FILTER_WEEKDAYS.map((wd) => (
              <div key={wd} className="py-1">
                {wd}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5" onMouseLeave={() => setHoverDate(null)}>
            {calendarGridDays.map((dayIso) => {
              const inMonth = dayIso.slice(0, 7) === calendarMonth;
              const isToday = dayIso === today;

              const activeStart = rangeAnchor
                ? hoverDate && hoverDate < rangeAnchor
                  ? hoverDate
                  : rangeAnchor
                : dateFrom;
              const activeEnd = rangeAnchor
                ? hoverDate && hoverDate > rangeAnchor
                  ? hoverDate
                  : rangeAnchor
                : dateTo;

              const isEndpoint = rangeAnchor
                ? dayIso === rangeAnchor || (Boolean(hoverDate) && dayIso === hoverDate)
                : dayIso === dateExact || dayIso === dateFrom || dayIso === dateTo;
              const isInRange =
                Boolean(activeStart && activeEnd) && dayIso > activeStart && dayIso < activeEnd;

              return (
                <button
                  key={dayIso}
                  type="button"
                  onMouseEnter={() => rangeAnchor && setHoverDate(dayIso)}
                  onClick={() => handleCalendarDayClick(dayIso)}
                  className={`flex h-8 items-center justify-center rounded-md font-mono text-[11px] tabular-nums transition-colors ${
                    isEndpoint
                      ? 'bg-blue-700 font-bold text-white dark:bg-blue-600'
                      : isInRange
                        ? 'bg-blue-100 font-semibold text-blue-900 dark:bg-blue-950/70 dark:text-blue-200'
                        : inMonth
                          ? 'text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                          : 'text-slate-300 hover:bg-slate-100 dark:text-slate-600 dark:hover:bg-slate-800/60'
                  } ${isToday && !isEndpoint ? 'ring-1 ring-blue-500/70' : ''}`}
                >
                  {Number(dayIso.slice(8, 10))}
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[10px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span className="leading-tight">
              {rangeAnchor
                ? `Awal: ${fmtDateSlash(rangeAnchor)} · Klik lagi tgl ini (1 tgl) atau tgl akhir`
                : 'Double klik = 1 tgl · Klik awal lalu akhir = range'}
            </span>
            {(hasDateFilter || rangeAnchor) && (
              <button
                type="button"
                onClick={() => {
                  handleReset();
                  setCalendarOpen(false);
                }}
                className="shrink-0 font-semibold text-blue-700 hover:underline dark:text-blue-400"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
