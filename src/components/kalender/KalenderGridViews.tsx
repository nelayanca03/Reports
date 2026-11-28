import { Bell, Calendar as CalendarIcon, CheckCircle2, Repeat, XCircle } from 'lucide-react';
import { MouseEvent } from 'react';
import {
  CALENDAR_TIME_SLOTS,
  ROLE_LABELS,
  fmtDateWeekdayLong,
  getEffectiveAssignResponse,
  parseUtcDate,
} from '../../utils/outletLogic';
import { CalendarGridItem, CalendarViewMode, WEEKDAY_SHORT } from './calendarUtils';

interface KalenderGridViewsProps {
  viewMode: CalendarViewMode;
  today: string;
  cursorDate: string;
  isAdmin: boolean;
  viewerPicUpper: string;
  monthGridDays: string[];
  weekDays: string[];
  itemsByDate: Map<string, CalendarGridItem[]>;
  onSelectItem: (item: CalendarGridItem) => void;
  onOpenCreateModal: (prefillDate?: string, prefillTime?: string) => void;
  onOpenDayOverflowPopup: (dayIso: string, e: MouseEvent<HTMLButtonElement>) => void;
  onSelectDayView: (dayIso: string) => void;
}

function getItemStyles(
  item: CalendarGridItem,
  isAdmin: boolean,
  viewerPicUpper: string
): {
  buttonClass: string;
  timeClass: string;
  titleClass: string;
} {
  if (item.kind === 'personal') {
    return {
      buttonClass:
        'border-violet-200 bg-violet-50/90 text-slate-900 hover:border-violet-400 hover:bg-violet-100/80 dark:border-violet-800/70 dark:bg-violet-950/50 dark:text-slate-100 dark:hover:bg-violet-900/60',
      timeClass: 'text-violet-800 dark:text-violet-300',
      titleClass: '',
    };
  }
  const resp = getEffectiveAssignResponse(item.event, isAdmin ? undefined : viewerPicUpper);
  if (resp.status === 'completed') {
    return {
      buttonClass:
        'border-emerald-200 bg-emerald-50/90 text-slate-900 hover:border-emerald-400 hover:bg-emerald-100/80 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-slate-100 dark:hover:bg-emerald-900/60',
      timeClass: 'text-emerald-800 dark:text-emerald-300',
      titleClass: '',
    };
  }
  if (resp.status === 'cancelled') {
    return {
      buttonClass:
        'border-rose-200/80 bg-rose-50/70 text-slate-500 hover:border-rose-300 hover:bg-rose-100/70 dark:border-rose-900/60 dark:bg-rose-950/35 dark:text-slate-400 dark:hover:bg-rose-950/60',
      timeClass: 'text-rose-700/80 dark:text-rose-400/80',
      titleClass: 'line-through',
    };
  }
  return {
    buttonClass:
      'border-blue-200 bg-blue-50/90 text-slate-900 hover:border-blue-400 hover:bg-blue-100/80 dark:border-blue-800/70 dark:bg-blue-950/50 dark:text-slate-100 dark:hover:bg-blue-900/60',
    timeClass: 'text-blue-800 dark:text-blue-400',
    titleClass: '',
  };
}

function formatGridItemTitle(item: CalendarGridItem, isAdmin: boolean): string {
  if (item.kind === 'personal') return item.title;
  const parts: string[] = [];
  if (item.event.assignScope === 'division') {
    const divKey = item.event.assignedDivision || item.event.assignedRole;
    const divShort =
      divKey === 'stock_accounting'
        ? 'SA'
        : divKey === 'gl'
          ? 'GL'
          : divKey
            ? ROLE_LABELS[divKey]
            : 'Divisi';
    parts.push(`[Divisi ${divShort}]`);
  } else if (isAdmin && item.event.assignedPic) {
    parts.push(`[${item.event.assignedPic}]`);
  }
  if (item.event.assignedOutlet) {
    parts.push(`${item.event.assignedOutlet} ·`);
  }
  parts.push(item.title);
  return parts.join(' ');
}

function formatGridItemTime(
  item: CalendarGridItem,
  isAdmin: boolean,
  viewerPicUpper: string
): string {
  if (item.kind === 'assign') {
    const resp = getEffectiveAssignResponse(item.event, isAdmin ? undefined : viewerPicUpper);
    if (resp.status === 'completed' && resp.returnTime) {
      return `${item.startTime}–${resp.returnTime}`;
    }
  }
  return item.startTime;
}

export function KalenderGridViews({
  viewMode,
  today,
  cursorDate,
  isAdmin,
  viewerPicUpper,
  monthGridDays,
  weekDays,
  itemsByDate,
  onSelectItem,
  onOpenCreateModal,
  onOpenDayOverflowPopup,
  onSelectDayView,
}: KalenderGridViewsProps) {
  const activeMonthPrefix = cursorDate.slice(0, 7);
  const monthWeekRowClass = monthGridDays.length > 35 ? 'grid-rows-6' : 'grid-rows-5';

  const renderTrailingIcon = (item: CalendarGridItem) => {
    if (item.kind === 'personal') {
      return item.isRecurring ? (
        <Repeat
          aria-label="Reminder berulang"
          className="h-3 w-3 shrink-0 text-violet-700/75 dark:text-violet-300/80"
        />
      ) : (
        <Bell
          aria-label="Reminder personal"
          className="h-3 w-3 shrink-0 text-violet-700/75 dark:text-violet-300/80"
        />
      );
    }
    const resp = getEffectiveAssignResponse(item.event, isAdmin ? undefined : viewerPicUpper);
    if (resp.status === 'completed') {
      return (
        <CheckCircle2
          aria-label="Selesai"
          className="h-3 w-3 shrink-0 text-emerald-700 dark:text-emerald-400"
        />
      );
    }
    if (resp.status === 'cancelled') {
      return (
        <XCircle
          aria-label="Tidak jadi pergi"
          className="h-3 w-3 shrink-0 text-rose-600 dark:text-rose-400"
        />
      );
    }
    return null;
  };

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
            const dayItems = itemsByDate.get(dayIso) || [];
            const maxShow = 4;
            const shownItems = dayItems.slice(0, maxShow);
            const extraCount = Math.max(0, dayItems.length - maxShow);

            return (
              <div
                key={dayIso}
                data-day-cell={dayIso}
                onClick={() => onOpenCreateModal(dayIso)}
                className={`flex min-h-[144px] cursor-pointer flex-col p-1.5 transition-colors hover:bg-slate-50/80 sm:p-2 dark:hover:bg-slate-800/30 ${
                  isCurrentMonth
                    ? 'bg-white dark:bg-slate-900'
                    : 'bg-slate-50/70 dark:bg-slate-950/60'
                }`}
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
                  {shownItems.map((item) => {
                    const styles = getItemStyles(item, isAdmin, viewerPicUpper);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectItem(item);
                        }}
                        className={`flex w-full items-center gap-1.5 rounded-md border px-1.5 py-[3px] text-left text-[11px] leading-tight transition-colors ${styles.buttonClass}`}
                      >
                        <span
                          className={`shrink-0 font-mono text-[10px] font-semibold tabular-nums ${styles.timeClass}`}
                        >
                          {formatGridItemTime(item, isAdmin, viewerPicUpper)}
                        </span>
                        <span className={`min-w-0 flex-1 truncate font-medium ${styles.titleClass}`}>
                          {formatGridItemTitle(item, isAdmin)}
                        </span>
                        {renderTrailingIcon(item)}
                      </button>
                    );
                  })}

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
                      const slotItems = (itemsByDate.get(dayIso) || []).filter(
                        (item) => item.startTime === slot
                      );
                      const isToday = dayIso === today;
                      return (
                        <div
                          key={`${dayIso}-${slot}`}
                          onClick={() => onOpenCreateModal(dayIso, slot)}
                          className={`min-h-[38px] cursor-pointer border-l border-slate-200 p-1 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40 ${
                            isToday ? 'bg-blue-50/25 dark:bg-blue-950/15' : ''
                          }`}
                        >
                          <div className="space-y-1">
                            {slotItems.map((item) => {
                              const styles = getItemStyles(item, isAdmin, viewerPicUpper);
                              return (
                                <button
                                  key={item.key}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectItem(item);
                                  }}
                                  className={`flex w-full items-center gap-1 rounded-md border px-1.5 py-1 text-left text-[11px] transition-colors ${styles.buttonClass}`}
                                >
                                  <span
                                    className={`shrink-0 font-mono text-[10px] font-semibold tabular-nums ${styles.timeClass}`}
                                  >
                                    {formatGridItemTime(item, isAdmin, viewerPicUpper)}
                                  </span>
                                  <span
                                    className={`min-w-0 flex-1 truncate font-medium ${styles.titleClass}`}
                                  >
                                    {formatGridItemTitle(item, isAdmin)}
                                  </span>
                                  {renderTrailingIcon(item)}
                                </button>
                              );
                            })}
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
          {(itemsByDate.get(cursorDate) || []).length} jadwal
        </span>
      </div>

      <div className="flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
        {CALENDAR_TIME_SLOTS.map((slot) => {
          const slotItems = (itemsByDate.get(cursorDate) || []).filter(
            (item) => item.startTime === slot
          );
          const isHourMark = slot.endsWith(':00');

          return (
            <div
              key={slot}
              onClick={() => onOpenCreateModal(cursorDate, slot)}
              className="flex min-h-[46px] cursor-pointer items-stretch transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/30"
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
                {slotItems.map((item) => {
                  const styles = getItemStyles(item, isAdmin, viewerPicUpper);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectItem(item);
                      }}
                      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-xs transition-colors ${styles.buttonClass}`}
                    >
                      <span className={`font-mono font-semibold tabular-nums ${styles.timeClass}`}>
                        {formatGridItemTime(item, isAdmin, viewerPicUpper)}
                      </span>
                      <span className={`font-semibold ${styles.titleClass}`}>
                        {formatGridItemTitle(item, isAdmin)}
                      </span>
                      {renderTrailingIcon(item)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
