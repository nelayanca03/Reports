import { Calendar as CalendarIcon, Repeat } from 'lucide-react';
import { MouseEvent } from 'react';
import {
  CALENDAR_TIME_SLOTS,
  ExpandedCalendarOccurrence,
  fmtDateWeekdayLong,
  parseUtcDate,
} from '../../utils/outletLogic';
import { CalendarViewMode, WEEKDAY_SHORT } from './calendarUtils';

interface KalenderGridViewsProps {
  viewMode: CalendarViewMode;
  today: string;
  cursorDate: string;
  canManage: boolean;
  monthGridDays: string[];
  weekDays: string[];
  eventsByDate: Map<string, ExpandedCalendarOccurrence[]>;
  onSelectOccurrence: (occ: ExpandedCalendarOccurrence) => void;
  onOpenCreateModal: (prefillDate?: string, prefillTime?: string) => void;
  onOpenDayOverflowPopup: (dayIso: string, e: MouseEvent<HTMLButtonElement>) => void;
  onSelectDayView: (dayIso: string) => void;
}

export function KalenderGridViews({
  viewMode,
  today,
  cursorDate,
  canManage,
  monthGridDays,
  weekDays,
  eventsByDate,
  onSelectOccurrence,
  onOpenCreateModal,
  onOpenDayOverflowPopup,
  onSelectDayView,
}: KalenderGridViewsProps) {
  const activeMonthPrefix = cursorDate.slice(0, 7);
  const monthWeekRowClass = monthGridDays.length > 35 ? 'grid-rows-6' : 'grid-rows-5';

  if (viewMode === 'month') {
    return (
      <section className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="grid shrink-0 grid-cols-7 border-b border-slate-200 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-800/60">
          {WEEKDAY_SHORT.map((dayName, idx) => (
            <div
              key={dayName}
              className={`px-2 py-2.5 text-center text-xs font-semibold ${
                idx === 6 ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {dayName}
            </div>
          ))}
        </div>

        <div
          className={`grid flex-1 grid-cols-7 ${monthWeekRowClass} divide-x divide-y divide-slate-200 dark:divide-slate-800`}
        >
          {monthGridDays.map((dayIso) => {
            const isCurrentMonth = dayIso.slice(0, 7) === activeMonthPrefix;
            const isToday = dayIso === today;
            const dayNum = Number(dayIso.slice(8, 10));
            const dayEvents = eventsByDate.get(dayIso) || [];
            const maxShow = 4;
            const shownEvents = dayEvents.slice(0, maxShow);
            const extraCount = Math.max(0, dayEvents.length - maxShow);

            return (
              <div
                key={dayIso}
                data-day-cell={dayIso}
                onClick={() => {
                  if (canManage) onOpenCreateModal(dayIso);
                }}
                className={`flex min-h-[144px] flex-col p-1.5 transition-colors sm:p-2 ${
                  isCurrentMonth
                    ? 'bg-white dark:bg-slate-900'
                    : 'bg-slate-50/70 dark:bg-slate-950/60'
                } ${canManage ? 'cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/30' : ''}`}
              >
                <div className="flex shrink-0 items-center justify-between">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs font-semibold tabular-nums ${
                      isToday
                        ? 'bg-blue-700 text-white dark:bg-blue-600'
                        : isCurrentMonth
                          ? 'text-slate-800 dark:text-slate-200'
                          : 'text-slate-400 dark:text-slate-600'
                    }`}
                  >
                    {dayNum}
                  </span>
                </div>

                <div className="mt-1 space-y-0.5">
                  {shownEvents.map((occ) => (
                    <button
                      key={`${occ.event.id}_${occ.occurrenceDate}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectOccurrence(occ);
                      }}
                      className="flex w-full items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50/90 px-1.5 py-[3px] text-left text-[11px] leading-tight text-slate-900 transition-colors hover:border-blue-400 hover:bg-blue-100/80 dark:border-blue-800/70 dark:bg-blue-950/50 dark:text-slate-100 dark:hover:bg-blue-900/60"
                    >
                      <span className="shrink-0 font-mono text-[10px] font-semibold text-blue-800 tabular-nums dark:text-blue-400">
                        {occ.event.startTime}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {occ.event.title}
                      </span>
                      {occ.isRecurring && (
                        <Repeat
                          aria-label="Event berulang"
                          className="h-3 w-3 shrink-0 text-blue-700/75 dark:text-blue-300/80"
                        />
                      )}
                    </button>
                  ))}

                  {extraCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => onOpenDayOverflowPopup(dayIso, e)}
                      className="w-full rounded-md px-1.5 py-0.5 text-left text-[11px] font-semibold text-blue-700 transition-colors hover:bg-slate-100 hover:underline dark:text-blue-400 dark:hover:bg-slate-800"
                    >
                      +{extraCount} lainnya
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  if (viewMode === 'week') {
    return (
      <section className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex-1 overflow-auto">
          <div className="min-w-[780px]">
            <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] border-b border-slate-200 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-800/60">
              <div className="px-2 py-3 text-center text-[11px] font-medium text-slate-500 dark:text-slate-400">
                WIB
              </div>
              {weekDays.map((dayIso, idx) => {
                const d = parseUtcDate(dayIso);
                const isToday = dayIso === today;
                return (
                  <button
                    key={dayIso}
                    type="button"
                    onClick={() => onSelectDayView(dayIso)}
                    className="flex flex-col items-center justify-center border-l border-slate-200 px-2 py-2 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
                  >
                    <span
                      className={`text-[11px] font-semibold ${
                        idx === 6
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {WEEKDAY_SHORT[idx]}
                    </span>
                    <span
                      className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs font-bold tabular-nums ${
                        isToday
                          ? 'bg-blue-700 text-white dark:bg-blue-600'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {d.getUTCDate()}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {CALENDAR_TIME_SLOTS.map((slot) => {
                const isHourMark = slot.endsWith(':00');
                return (
                  <div key={slot} className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))]">
                    <div
                      className={`px-2 py-2 text-right font-mono text-[11px] tabular-nums ${
                        isHourMark
                          ? 'font-semibold text-slate-600 dark:text-slate-300'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {slot}
                    </div>

                    {weekDays.map((dayIso) => {
                      const slotEvents = (eventsByDate.get(dayIso) || []).filter(
                        (occ) => occ.event.startTime === slot
                      );
                      const isToday = dayIso === today;
                      return (
                        <div
                          key={`${dayIso}-${slot}`}
                          onClick={() => {
                            if (canManage) onOpenCreateModal(dayIso, slot);
                          }}
                          className={`min-h-[38px] border-l border-slate-200 p-1 transition-colors dark:border-slate-800 ${
                            isToday ? 'bg-blue-50/25 dark:bg-blue-950/15' : ''
                          } ${canManage ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40' : ''}`}
                        >
                          <div className="space-y-1">
                            {slotEvents.map((occ) => (
                              <button
                                key={`${occ.event.id}_${occ.occurrenceDate}`}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectOccurrence(occ);
                                }}
                                className="flex w-full items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-1 text-left text-[11px] text-slate-900 transition-colors hover:border-blue-400 hover:bg-blue-100 dark:border-blue-800/70 dark:bg-blue-950/60 dark:text-slate-100 dark:hover:bg-blue-900/60"
                              >
                                <span className="shrink-0 font-mono text-[10px] font-semibold text-blue-800 tabular-nums dark:text-blue-400">
                                  {occ.event.startTime}
                                </span>
                                <span className="min-w-0 flex-1 truncate font-medium">
                                  {occ.event.title}
                                </span>
                                {occ.isRecurring && (
                                  <Repeat
                                    aria-label="Event berulang"
                                    className="h-3 w-3 shrink-0 text-blue-700/75 dark:text-blue-300/80"
                                  />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/60">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-blue-700 dark:text-blue-400" />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {fmtDateWeekdayLong(cursorDate)}
          </span>
          {cursorDate === today && (
            <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400">
              · Hari Ini
            </span>
          )}
        </div>
        <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
          {(eventsByDate.get(cursorDate) || []).length} event
        </span>
      </div>

      <div className="flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
        {CALENDAR_TIME_SLOTS.map((slot) => {
          const slotEvents = (eventsByDate.get(cursorDate) || []).filter(
            (occ) => occ.event.startTime === slot
          );
          const isHourMark = slot.endsWith(':00');

          return (
            <div
              key={slot}
              onClick={() => {
                if (canManage) onOpenCreateModal(cursorDate, slot);
              }}
              className={`flex min-h-[46px] items-stretch transition-colors ${
                canManage ? 'cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/30' : ''
              }`}
            >
              <div
                className={`flex w-20 shrink-0 items-center justify-end border-r border-slate-200 px-3 font-mono text-xs tabular-nums dark:border-slate-800 ${
                  isHourMark
                    ? 'font-semibold text-slate-700 dark:text-slate-200'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {slot}
              </div>
              <div className="flex flex-1 flex-wrap items-center gap-2 px-3 py-1.5">
                {slotEvents.map((occ) => (
                  <button
                    key={`${occ.event.id}_${occ.occurrenceDate}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectOccurrence(occ);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-left text-xs text-slate-900 transition-colors hover:border-blue-400 hover:bg-blue-100 dark:border-blue-800/70 dark:bg-blue-950/60 dark:text-slate-100 dark:hover:bg-blue-900/60"
                  >
                    <span className="font-mono font-semibold text-blue-800 tabular-nums dark:text-blue-400">
                      {occ.event.startTime}
                    </span>
                    <span className="font-semibold">{occ.event.title}</span>
                    {occ.isRecurring && (
                      <Repeat
                        aria-label="Event berulang"
                        className="h-3.5 w-3.5 shrink-0 text-blue-700/80 dark:text-blue-300"
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
