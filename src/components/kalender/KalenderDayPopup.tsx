import { Bell, CheckCircle2, Plus, Repeat, X, XCircle } from 'lucide-react';
import {
  ROLE_LABELS,
  fmtDateWeekdayLong,
  getEffectiveAssignResponse,
  parseUtcDate,
} from '../../utils/outletLogic';
import { CalendarGridItem, WEEKDAY_UPPER } from './calendarUtils';

interface KalenderDayPopupProps {
  dayPopup: { date: string; top: number; left: number };
  today: string;
  isAdmin: boolean;
  viewerPicUpper: string;
  popupItems: CalendarGridItem[];
  onClose: () => void;
  onJumpToDayView: (date: string) => void;
  onSelectItem: (item: CalendarGridItem) => void;
  onOpenCreateModal: (date: string) => void;
}

export function KalenderDayPopup({
  dayPopup,
  today,
  isAdmin,
  viewerPicUpper,
  popupItems,
  onClose,
  onJumpToDayView,
  onSelectItem,
  onOpenCreateModal,
}: KalenderDayPopupProps) {
  const parsedDay = parseUtcDate(dayPopup.date);
  const weekdayLabel = WEEKDAY_UPPER[parsedDay.getUTCDay()] || '';
  const dayNumber = parsedDay.getUTCDate();
  const isPopupToday = dayPopup.date === today;

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Daftar jadwal ${fmtDateWeekdayLong(dayPopup.date)}`}
        style={{ top: `${dayPopup.top}px`, left: `${dayPopup.left}px` }}
        onClick={(e) => e.stopPropagation()}
        className="fixed z-50 w-[min(300px,calc(100vw-24px))] rounded-2xl border border-slate-200 bg-white p-3.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="relative flex flex-col items-center pb-2.5">
          <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
            {weekdayLabel}
          </span>
          <button
            type="button"
            onClick={() => onJumpToDayView(dayPopup.date)}
            title="Buka tampilan Harian"
            className={`mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full font-mono text-xl font-semibold tabular-nums transition-colors ${
              isPopupToday
                ? 'bg-blue-700 text-white dark:bg-blue-600'
                : 'text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {dayNumber}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup daftar jadwal hari ini"
            className="absolute top-0 right-0 flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[260px] space-y-1 overflow-y-auto pr-0.5">
          {popupItems.map((item) => {
            const isPersonal = item.kind === 'personal';
            const status = !isPersonal
              ? getEffectiveAssignResponse(item.event, isAdmin ? undefined : viewerPicUpper).status
              : undefined;
            const dotColor = isPersonal
              ? 'bg-violet-600 dark:bg-violet-400'
              : status === 'completed'
                ? 'bg-emerald-600 dark:bg-emerald-400'
                : status === 'cancelled'
                  ? 'bg-rose-500 dark:bg-rose-400'
                  : 'bg-blue-600 dark:bg-blue-400';

            const labelPrefix = !isPersonal
              ? item.event.assignScope === 'division'
                ? `[Divisi ${
                    item.event.assignedDivision
                      ? ROLE_LABELS[item.event.assignedDivision] || item.event.assignedDivision
                      : ''
                  }] `
                : isAdmin && item.event.assignedPic
                  ? `[${item.event.assignedPic}] `
                  : ''
              : '';

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelectItem(item)}
                className="flex w-full items-center gap-2 rounded-md border border-transparent bg-slate-50/70 px-2 py-1.5 text-left text-xs text-slate-900 transition-colors hover:border-blue-200 hover:bg-blue-50/90 dark:bg-slate-800/50 dark:text-slate-100 dark:hover:border-blue-800/70 dark:hover:bg-blue-950/50"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                <span className="shrink-0 font-mono text-[11px] font-semibold text-blue-800 tabular-nums dark:text-blue-400">
                  {item.startTime}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate font-medium ${
                    status === 'cancelled' ? 'text-slate-400 line-through' : ''
                  }`}
                >
                  {labelPrefix}
                  {item.title}
                </span>
                {isPersonal ? (
                  item.isRecurring ? (
                    <Repeat className="h-3 w-3 shrink-0 text-violet-600 dark:text-violet-400" />
                  ) : (
                    <Bell className="h-3 w-3 shrink-0 text-violet-600 dark:text-violet-400" />
                  )
                ) : status === 'completed' ? (
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : status === 'cancelled' ? (
                  <XCircle className="h-3 w-3 shrink-0 text-rose-500 dark:text-rose-400" />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-2.5 border-t border-slate-100 pt-2 dark:border-slate-800">
          <button
            type="button"
            onClick={() => onOpenCreateModal(dayPopup.date)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isAdmin ? 'Buat Assign di Tanggal Ini' : 'Buat Reminder di Tanggal Ini'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
