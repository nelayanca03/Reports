import { BellRing, Calendar as CalendarIcon, Clock, MapPin, Users, X } from 'lucide-react';
import { useState } from 'react';
import { CalendarEvent } from '../types/outlet';
import {
  ROLE_LABELS,
  fmtDateTimeWithSeconds,
  fmtDateWeekdayLong,
} from '../utils/outletLogic';

interface AssignNotificationBannerProps {
  notifications: CalendarEvent[];
  onDismiss: (eventId: string) => Promise<void>;
  onOpenEvent: (event: CalendarEvent) => void;
}

export function AssignNotificationBanner({
  notifications,
  onDismiss,
  onOpenEvent,
}: AssignNotificationBannerProps) {
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [closingAll, setClosingAll] = useState(false);

  if (notifications.length === 0) return null;

  const handleDismissOne = async (eventId: string) => {
    if (busyIds[eventId]) return;
    setBusyIds((prev) => ({ ...prev, [eventId]: true }));
    try {
      await onDismiss(eventId);
    } finally {
      setBusyIds((prev) => {
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
    }
  };

  const handleDismissAll = async () => {
    if (closingAll) return;
    setClosingAll(true);
    try {
      for (const evt of notifications) {
        await onDismiss(evt.id);
      }
    } finally {
      setClosingAll(false);
    }
  };

  return (
    <aside
      role="alert"
      aria-live="assertive"
      aria-label="Notifikasi penugasan baru"
      className="fixed top-3 left-1/2 z-50 w-[min(580px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-2xl border-2 border-blue-600 bg-white shadow-2xl dark:border-blue-500 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between gap-3 bg-blue-700 px-4 py-2.5 text-white dark:bg-blue-600">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/15">
            <BellRing className="h-4 w-4 animate-pulse" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-bold tracking-wide uppercase">
              Penugasan Baru ({notifications.length})
            </div>
            <div className="truncate text-[11px] text-blue-100">
              Diurutkan dari terbaru · Notifikasi tetap muncul sampai Anda tutup
            </div>
          </div>
        </div>

        {notifications.length > 1 && (
          <button
            type="button"
            disabled={closingAll}
            onClick={handleDismissAll}
            className="shrink-0 rounded-lg border border-white/30 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            {closingAll ? 'Menutup...' : 'Tutup Semua'}
          </button>
        )}
      </div>

      <div className="max-h-[42vh] divide-y divide-slate-200 overflow-y-auto dark:divide-slate-800">
        {notifications.map((evt) => {
          const isBusy = Boolean(busyIds[evt.id]) || closingAll;
          return (
            <div
              key={evt.id}
              className="flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {evt.title}
                  </span>
                  {evt.assignScope === 'division' && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
                      <Users className="h-3 w-3" />
                      Divisi{' '}
                      {evt.assignedDivision
                        ? ROLE_LABELS[evt.assignedDivision] || evt.assignedDivision
                        : ''}
                    </span>
                  )}
                  {evt.assignedOutlet && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                      <MapPin className="h-3 w-3" />
                      {evt.assignedOutlet}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1 font-medium">
                    <CalendarIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    {fmtDateWeekdayLong(evt.date)}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono font-semibold tabular-nums">
                    <Clock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    {evt.startTime} WIB
                  </span>
                </div>

                {evt.notes && (
                  <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
                    {evt.notes}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span>Dari: {evt.createdByName || 'Admin'}</span>
                  {evt.createdAtIso && (
                    <span className="font-mono tabular-nums">
                      · {fmtDateTimeWithSeconds(evt.createdAtIso)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleDismissOne(evt.id)}
                  title="Tutup notifikasi ini"
                  aria-label={`Tutup notifikasi ${evt.title}`}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-red-800 dark:hover:bg-red-950/50 dark:hover:text-red-300"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Tutup</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenEvent(evt)}
                  className="rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60"
                >
                  Buka Kalender
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
