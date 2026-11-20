import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Plus,
  Repeat,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { FormEvent, MouseEvent, useEffect, useMemo, useState } from 'react';
import {
  AccountProfile,
  CalendarEvent,
  CalendarRecurrenceFreq,
  OperationalRoleId,
} from '../types/outlet';
import {
  CALENDAR_TIME_SLOTS,
  ExpandedCalendarOccurrence,
  canUserViewCalendarEvent,
  expandCalendarEventsForRange,
  fmtDateSlash,
  fmtDateWeekdayLong,
  formatCalendarRecurrenceLabel,
  formatCalendarVisibleLabel,
  normalizeCalendarInterval,
  normalizeCalendarRecurrenceFreq,
  normalizeCalendarVisibleTo,
  normalizeCalendarWeekdays,
  parseUtcDate,
  shiftIsoDays,
  toIsoUtc,
  todayIso,
} from '../utils/outletLogic';
import { ConfirmModal } from './ConfirmModal';

type CalendarViewMode = 'month' | 'week' | 'day';

export interface CalendarEventFormPayload {
  title: string;
  date: string;
  startTime: string;
  visibleTo: OperationalRoleId[];
  notes: string;
  repeatFreq?: CalendarRecurrenceFreq;
  repeatInterval?: number;
  repeatUntil?: string;
  repeatWeekdays?: number[];
  excludedDates?: string[];
}

interface KalenderViewProps {
  account: AccountProfile;
  events: CalendarEvent[];
  onCreateEvent: (input: CalendarEventFormPayload) => Promise<string>;
  onUpdateEvent: (eventId: string, input: CalendarEventFormPayload) => Promise<void>;
  onDeleteEvent: (eventId: string) => Promise<void>;
}

const WEEKDAY_SHORT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const WEEKDAY_DOW_MAP: Array<{ label: string; dow: number }> = [
  { label: 'Sen', dow: 1 },
  { label: 'Sel', dow: 2 },
  { label: 'Rab', dow: 3 },
  { label: 'Kam', dow: 4 },
  { label: 'Jum', dow: 5 },
  { label: 'Sab', dow: 6 },
  { label: 'Min', dow: 0 },
];
const WEEKDAY_UPPER = ['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'];
const ALL_DEPARTMENTS: OperationalRoleId[] = ['stock_accounting', 'gl', 'accounting'];

function getMondayOfWeek(isoDate: string): string {
  const d = parseUtcDate(isoDate);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diffToMon = day === 0 ? -6 : 1 - day;
  return shiftIsoDays(isoDate, diffToMon);
}

function buildMonthGridDays(anchorIso: string): string[] {
  const d = parseUtcDate(anchorIso);
  const firstOfMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const gridStart = getMondayOfWeek(firstOfMonth);
  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(shiftIsoDays(gridStart, i));
  }
  // Drop trailing 6th week row if completely outside the month
  const targetMonth = firstOfMonth.slice(0, 7);
  if (days.slice(35).every((dayStr) => dayStr.slice(0, 7) !== targetMonth)) {
    return days.slice(0, 35);
  }
  return days;
}

function formatMonthTitle(isoDate: string): string {
  const d = parseUtcDate(isoDate);
  return d.toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatWeekTitle(mondayIso: string): string {
  const sundayIso = shiftIsoDays(mondayIso, 6);
  const a = parseUtcDate(mondayIso);
  const b = parseUtcDate(sundayIso);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  if (sameMonth) {
    const monStr = b.toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return `${a.getUTCDate()} – ${b.getUTCDate()} ${monStr}`;
  }
  const left = a.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const right = b.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${left} – ${right}`;
}

export function KalenderView({
  account,
  events,
  onCreateEvent,
  onUpdateEvent,
  onDeleteEvent,
}: KalenderViewProps) {
  const today = todayIso();
  const canManage = account.role === 'admin' || account.role === 'accounting';

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [cursorDate, setCursorDate] = useState<string>(today);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);

  // Detail modal
  const [selectedOccurrence, setSelectedOccurrence] =
    useState<ExpandedCalendarOccurrence | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Day overflow popup (> 4 events in a single day)
  const [dayPopup, setDayPopup] = useState<{
    date: string;
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    if (!dayPopup) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setDayPopup(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dayPopup]);

  // Create / Edit form modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState(today);
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formVisibleTo, setFormVisibleTo] = useState<OperationalRoleId[]>(ALL_DEPARTMENTS);
  const [formNotes, setFormNotes] = useState('');
  const [formRepeatFreq, setFormRepeatFreq] = useState<CalendarRecurrenceFreq>('none');
  const [formRepeatInterval, setFormRepeatInterval] = useState(1);
  const [formRepeatWeekdays, setFormRepeatWeekdays] = useState<number[]>([]);
  const [formRepeatEndMode, setFormRepeatEndMode] = useState<'never' | 'until'>('never');
  const [formRepeatUntil, setFormRepeatUntil] = useState('');
  const [formExcludedDates, setFormExcludedDates] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const visibleEvents = useMemo(
    () => events.filter((evt) => canUserViewCalendarEvent(evt, account.role)),
    [events, account.role]
  );

  const monthGridDays = useMemo(() => buildMonthGridDays(cursorDate), [cursorDate]);
  const weekMonday = useMemo(() => getMondayOfWeek(cursorDate), [cursorDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => shiftIsoDays(weekMonday, i)),
    [weekMonday]
  );

  const visibleRange = useMemo(() => {
    if (viewMode === 'month') {
      return {
        start: monthGridDays[0] || cursorDate,
        end: monthGridDays[monthGridDays.length - 1] || cursorDate,
      };
    }
    if (viewMode === 'week') {
      return {
        start: weekDays[0] || cursorDate,
        end: weekDays[weekDays.length - 1] || cursorDate,
      };
    }
    return { start: cursorDate, end: cursorDate };
  }, [viewMode, monthGridDays, weekDays, cursorDate]);

  const expandedOccurrences = useMemo(
    () => expandCalendarEventsForRange(visibleEvents, visibleRange.start, visibleRange.end),
    [visibleEvents, visibleRange]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, ExpandedCalendarOccurrence[]>();
    for (const occ of expandedOccurrences) {
      const list = map.get(occ.occurrenceDate) || [];
      list.push(occ);
      map.set(occ.occurrenceDate, list);
    }
    return map;
  }, [expandedOccurrences]);

  const handleStep = (direction: -1 | 1) => {
    if (viewMode === 'month') {
      const d = parseUtcDate(cursorDate);
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + direction);
      setCursorDate(toIsoUtc(d));
    } else if (viewMode === 'week') {
      setCursorDate(shiftIsoDays(cursorDate, direction * 7));
    } else {
      setCursorDate(shiftIsoDays(cursorDate, direction));
    }
  };

  const openCreateModal = (prefillDate?: string, prefillTime?: string) => {
    if (!canManage) return;
    const targetDate = prefillDate || cursorDate || today;
    setDayPopup(null);
    setEditingEventId(null);
    setFormTitle('');
    setFormDate(targetDate);
    setFormStartTime(
      prefillTime && CALENDAR_TIME_SLOTS.includes(prefillTime) ? prefillTime : '09:00'
    );
    setFormVisibleTo(['stock_accounting', 'gl', 'accounting']);
    setFormNotes('');
    setFormRepeatFreq('none');
    setFormRepeatInterval(1);
    setFormRepeatWeekdays([parseUtcDate(targetDate).getUTCDay()]);
    setFormRepeatEndMode('never');
    setFormRepeatUntil('');
    setFormExcludedDates([]);
    setFormError(null);
    setFormOpen(true);
  };

  const openDayOverflowPopup = (dayIso: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const cellEl = e.currentTarget.closest('[data-day-cell]') || e.currentTarget;
    const rect = cellEl.getBoundingClientRect();
    const popupWidth = Math.min(280, window.innerWidth - 24);
    const count = (eventsByDate.get(dayIso) || []).length;
    const estHeight = Math.min(420, 130 + count * 34);
    const rawLeft = rect.left + rect.width / 2 - popupWidth / 2;
    const left = Math.max(12, Math.min(rawLeft, window.innerWidth - popupWidth - 12));
    const rawTop = rect.top - 12;
    const top = Math.max(12, Math.min(rawTop, window.innerHeight - estHeight - 12));
    setDayPopup({ date: dayIso, top, left });
  };

  const openEditModal = (evt: CalendarEvent) => {
    if (!canManage) return;
    setSelectedOccurrence(null);
    setEditingEventId(evt.id);
    setFormTitle(evt.title);
    setFormDate(evt.date);
    setFormStartTime(
      CALENDAR_TIME_SLOTS.includes(evt.startTime) ? evt.startTime : '09:00'
    );
    setFormVisibleTo(
      evt.visibleTo.length > 0 ? evt.visibleTo : ['stock_accounting', 'gl', 'accounting']
    );
    setFormNotes(evt.notes || '');
    const freq = normalizeCalendarRecurrenceFreq(evt.repeatFreq);
    setFormRepeatFreq(freq);
    setFormRepeatInterval(normalizeCalendarInterval(evt.repeatInterval));
    const existingDays = normalizeCalendarWeekdays(evt.repeatWeekdays);
    setFormRepeatWeekdays(
      existingDays.length > 0 ? existingDays : [parseUtcDate(evt.date).getUTCDay()]
    );
    if (evt.repeatUntil && /^\d{4}-\d{2}-\d{2}$/.test(evt.repeatUntil)) {
      setFormRepeatEndMode('until');
      setFormRepeatUntil(evt.repeatUntil);
    } else {
      setFormRepeatEndMode('never');
      setFormRepeatUntil('');
    }
    setFormExcludedDates(evt.excludedDates || []);
    setFormError(null);
    setFormOpen(true);
  };

  const toggleDept = (roleId: OperationalRoleId) => {
    setFormVisibleTo((prev) =>
      prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]
    );
  };

  const toggleRepeatWeekday = (dow: number) => {
    setFormRepeatWeekdays((prev) => {
      if (prev.includes(dow)) {
        if (prev.length === 1) return prev; // keep at least 1 weekday
        return prev.filter((d) => d !== dow);
      }
      return normalizeCalendarWeekdays([...prev, dow]);
    });
  };

  const allDeptsSelected = ALL_DEPARTMENTS.every((r) => formVisibleTo.includes(r));

  const toggleAllDepts = () => {
    setFormVisibleTo(allDeptsSelected ? [] : [...ALL_DEPARTMENTS]);
  };

  const handleSubmitForm = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const normalizedRoles = normalizeCalendarVisibleTo(formVisibleTo);
    if (!formTitle.trim()) {
      setFormError('Judul event wajib diisi.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formDate)) {
      setFormError('Tanggal event wajib diisi.');
      return;
    }
    if (!CALENDAR_TIME_SLOTS.includes(formStartTime)) {
      setFormError('Jam mulai harus antara 08:00 sampai 19:00 (interval 30 menit).');
      return;
    }
    if (normalizedRoles.length === 0) {
      setFormError('Pilih minimal satu departemen pada "Tampilkan Event Ke".');
      return;
    }
    const repeatUntilVal =
      formRepeatFreq !== 'none' && formRepeatEndMode === 'until'
        ? formRepeatUntil.trim()
        : '';
    if (
      formRepeatFreq !== 'none' &&
      formRepeatEndMode === 'until' &&
      !/^\d{4}-\d{2}-\d{2}$/.test(repeatUntilVal)
    ) {
      setFormError('Pilih tanggal berakhir pengulangan.');
      return;
    }
    if (repeatUntilVal && repeatUntilVal < formDate) {
      setFormError('Tanggal akhir pengulangan harus sama atau setelah tanggal event.');
      return;
    }

    const payload: CalendarEventFormPayload = {
      title: formTitle.trim(),
      date: formDate,
      startTime: formStartTime,
      visibleTo: normalizedRoles,
      notes: formNotes.trim(),
      repeatFreq: formRepeatFreq,
      repeatInterval: normalizeCalendarInterval(formRepeatInterval),
      repeatUntil: repeatUntilVal,
      repeatWeekdays:
        formRepeatFreq === 'weekly'
          ? formRepeatWeekdays.length > 0
            ? formRepeatWeekdays
            : [parseUtcDate(formDate).getUTCDay()]
          : [],
      excludedDates: formRepeatFreq === 'none' ? [] : formExcludedDates,
    };

    setBusy(true);
    try {
      if (editingEventId) {
        await onUpdateEvent(editingEventId, payload);
        setFeedback({ type: 'ok', message: `Event "${formTitle.trim()}" berhasil diperbarui.` });
      } else {
        await onCreateEvent(payload);
        setFeedback({
          type: 'ok',
          message:
            formRepeatFreq === 'none'
              ? `Event "${formTitle.trim()}" berhasil ditambahkan.`
              : `Event berulang "${formTitle.trim()}" berhasil ditambahkan.`,
        });
      }
      setCursorDate(formDate);
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan event.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSingleOccurrence = async () => {
    if (!selectedOccurrence) return;
    const { event: evt, occurrenceDate } = selectedOccurrence;
    setDeleteBusy(true);
    try {
      const nextExcluded = Array.from(
        new Set([...(evt.excludedDates || []), occurrenceDate])
      ).sort();
      await onUpdateEvent(evt.id, {
        title: evt.title,
        date: evt.date,
        startTime: evt.startTime,
        visibleTo: evt.visibleTo,
        notes: evt.notes,
        repeatFreq: evt.repeatFreq,
        repeatInterval: evt.repeatInterval,
        repeatUntil: evt.repeatUntil,
        repeatWeekdays: evt.repeatWeekdays,
        excludedDates: nextExcluded,
      });
      setConfirmDeleteOpen(false);
      setSelectedOccurrence(null);
      setFeedback({
        type: 'ok',
        message: `Jadwal "${evt.title}" pada ${fmtDateSlash(occurrenceDate)} berhasil dihapus.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        message: err instanceof Error ? err.message : 'Gagal menghapus jadwal tanggal ini.',
      });
      setConfirmDeleteOpen(false);
    } finally {
      setDeleteBusy(false);
    }
  };

  const periodHeading =
    viewMode === 'month'
      ? formatMonthTitle(cursorDate)
      : viewMode === 'week'
        ? formatWeekTitle(weekMonday)
        : fmtDateWeekdayLong(cursorDate);

  const activeMonthPrefix = cursorDate.slice(0, 7);

  const monthWeekRowClass =
    monthGridDays.length > 35 ? 'grid-rows-6' : 'grid-rows-5';

  return (
    <div className="flex min-h-[calc(100vh-5.5rem)] flex-1 flex-col gap-3">
      {feedback && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-medium underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Calendar Controls Toolbar */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setCursorDate(today)}
              className="min-h-[38px] rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Hari Ini
            </button>

            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => handleStep(-1)}
                aria-label="Periode sebelumnya"
                className="flex h-[36px] w-9 items-center justify-center rounded-l-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleStep(1)}
                aria-label="Periode berikutnya"
                className="flex h-[36px] w-9 items-center justify-center rounded-r-lg border-l border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <h2 className="text-base font-bold capitalize tracking-tight text-slate-900 sm:text-lg dark:text-slate-100">
              {periodHeading}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* View Switcher: Bulan / Minggu / Hari */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
              {(['month', 'week', 'day'] as CalendarViewMode[]).map((mode) => {
                const active = viewMode === mode;
                const label = mode === 'month' ? 'Bulan' : mode === 'week' ? 'Minggu' : 'Hari';
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`min-h-[32px] rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-blue-700 text-white dark:bg-blue-600'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {canManage && (
              <button
                type="button"
                onClick={() => openCreateModal(cursorDate)}
                className="inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span>Buat Event</span>
              </button>
            )}
          </div>
        </div>

        {/* Subtle Role Guidance */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span>
            {canManage
              ? 'Klik tanggal atau slot waktu untuk membuat event baru. Klik event untuk melihat detail, catatan peserta, atau mengubah jadwal.'
              : 'Menampilkan jadwal sesuai departemen Anda. Klik event untuk melihat detail dan catatan peserta.'}
          </span>
          <span className="font-mono tabular-nums">
            {visibleEvents.length} jadwal terlihat
          </span>
        </div>
      </section>

      {/* MONTHLY VIEW */}
      {viewMode === 'month' && (
        <section className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="grid shrink-0 grid-cols-7 border-b border-slate-200 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-800/60">
            {WEEKDAY_SHORT.map((dayName, idx) => (
              <div
                key={dayName}
                className={`px-2 py-2.5 text-center text-xs font-semibold ${
                  idx === 6
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-600 dark:text-slate-300'
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
                    if (canManage) openCreateModal(dayIso);
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
                          setSelectedOccurrence(occ);
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
                        onClick={(e) => openDayOverflowPopup(dayIso, e)}
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
      )}

      {/* WEEKLY VIEW (08:00 - 19:00) */}
      {viewMode === 'week' && (
        <section className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex-1 overflow-auto">
            <div className="min-w-[780px]">
              {/* Day Headers */}
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
                      onClick={() => {
                        setCursorDate(dayIso);
                        setViewMode('day');
                      }}
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

              {/* Time Rows (30-min intervals 08:00 - 19:00) */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {CALENDAR_TIME_SLOTS.map((slot) => {
                  const isHourMark = slot.endsWith(':00');
                  return (
                    <div
                      key={slot}
                      className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))]"
                    >
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
                              if (canManage) openCreateModal(dayIso, slot);
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
                                    setSelectedOccurrence(occ);
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
      )}

      {/* DAILY VIEW (08:00 - 19:00) */}
      {viewMode === 'day' && (
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
                    if (canManage) openCreateModal(cursorDate, slot);
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
                          setSelectedOccurrence(occ);
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
      )}

      {/* DAY EVENTS OVERFLOW POP-UP (> 4 events) */}
      {dayPopup && (() => {
        const popupEvents = eventsByDate.get(dayPopup.date) || [];
        const parsedDay = parseUtcDate(dayPopup.date);
        const weekdayLabel = WEEKDAY_UPPER[parsedDay.getUTCDay()] || '';
        const dayNumber = parsedDay.getUTCDate();
        const isPopupToday = dayPopup.date === today;

        return (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setDayPopup(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Daftar event ${fmtDateWeekdayLong(dayPopup.date)}`}
              style={{ top: `${dayPopup.top}px`, left: `${dayPopup.left}px` }}
              onClick={(e) => e.stopPropagation()}
              className="fixed z-50 w-[min(280px,calc(100vw-24px))] rounded-2xl border border-slate-200 bg-white p-3.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="relative flex flex-col items-center pb-2.5">
                <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
                  {weekdayLabel}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const target = dayPopup.date;
                    setDayPopup(null);
                    setCursorDate(target);
                    setViewMode('day');
                  }}
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
                  onClick={() => setDayPopup(null)}
                  aria-label="Tutup daftar event hari ini"
                  className="absolute top-0 right-0 flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="max-h-[260px] space-y-1 overflow-y-auto pr-0.5">
                {popupEvents.map((occ) => (
                  <button
                    key={`${occ.event.id}_${occ.occurrenceDate}`}
                    type="button"
                    onClick={() => {
                      setDayPopup(null);
                      setSelectedOccurrence(occ);
                    }}
                    className="flex w-full items-center gap-2 rounded-md border border-transparent bg-slate-50/70 px-2 py-1.5 text-left text-xs text-slate-900 transition-colors hover:border-blue-200 hover:bg-blue-50/90 dark:bg-slate-800/50 dark:text-slate-100 dark:hover:border-blue-800/70 dark:hover:bg-blue-950/50"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600 dark:bg-blue-400" />
                    <span className="shrink-0 font-mono text-[11px] font-semibold text-blue-800 tabular-nums dark:text-blue-400">
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

              {canManage && (
                <div className="mt-2.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => openCreateModal(dayPopup.date)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Buat Event di Tanggal Ini</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* EVENT DETAIL POP-UP MODAL */}
      {selectedOccurrence && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-detail-title"
          onClick={() => setSelectedOccurrence(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <h3
                  id="event-detail-title"
                  className="text-lg font-bold text-slate-900 dark:text-slate-100"
                >
                  {selectedOccurrence.event.title}
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Detail Jadwal Kalender
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOccurrence(null)}
                aria-label="Tutup detail event"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-sm">
              <div className="flex items-center gap-3 text-slate-700 dark:text-slate-200">
                <CalendarIcon className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" />
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Tanggal: </span>
                  <span className="font-semibold">
                    {fmtDateWeekdayLong(selectedOccurrence.occurrenceDate)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-slate-700 dark:text-slate-200">
                <Clock className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" />
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Jam Mulai: </span>
                  <span className="font-mono font-semibold tabular-nums">
                    {selectedOccurrence.event.startTime} WIB
                  </span>
                </div>
              </div>

              {selectedOccurrence.isRecurring && (
                <div className="flex items-start gap-3 text-slate-700 dark:text-slate-200">
                  <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" />
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Pengulangan:{' '}
                    </span>
                    <span className="font-semibold">
                      {formatCalendarRecurrenceLabel(selectedOccurrence.event)}
                    </span>
                    {selectedOccurrence.occurrenceDate !== selectedOccurrence.event.date && (
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        Mulai seri: {fmtDateSlash(selectedOccurrence.event.date)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {canManage && (
                <div className="flex items-center gap-3 text-slate-700 dark:text-slate-200">
                  <Users className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" />
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Tampil Untuk: </span>
                    <span className="font-semibold">
                      {formatCalendarVisibleLabel(selectedOccurrence.event.visibleTo)}
                    </span>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Catatan / Peserta
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-100">
                  {selectedOccurrence.event.notes
                    ? selectedOccurrence.event.notes
                    : 'Tidak ada catatan peserta.'}
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <UserCheck className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Dibuat oleh {selectedOccurrence.event.createdByName} (
                  {selectedOccurrence.event.createdByEmail})
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
              {canManage && (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(true)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Hapus</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(selectedOccurrence.event)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Edit Event</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setSelectedOccurrence(null)}
                className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT EVENT MODAL (Accounting & Admin only) */}
      {formOpen && canManage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-form-title"
          onClick={() => !busy && setFormOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <h3
                  id="event-form-title"
                  className="text-base font-bold text-slate-900 dark:text-slate-100"
                >
                  {editingEventId ? 'Edit Event Kalender' : 'Buat Event Kalender Baru'}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Isi detail jadwal dan pilih departemen yang diizinkan melihat event ini.
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => setFormOpen(false)}
                aria-label="Tutup form event"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="mt-4 space-y-4">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300">
                  {formError}
                </div>
              )}

              <div>
                <label
                  htmlFor="evt-title"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Judul Event
                </label>
                <input
                  id="evt-title"
                  type="text"
                  required
                  maxLength={120}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Contoh: Cek Asset, Stock Opname, Monthly Closing"
                  className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="evt-date"
                    className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Tanggal
                  </label>
                  <input
                    id="evt-date"
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => {
                      const nextDate = e.target.value;
                      setFormDate(nextDate);
                      if (/^\d{4}-\d{2}-\d{2}$/.test(nextDate) && formRepeatWeekdays.length <= 1) {
                        setFormRepeatWeekdays([parseUtcDate(nextDate).getUTCDay()]);
                      }
                    }}
                    className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="evt-start-time"
                    className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Jam Mulai (08:00 – 19:00)
                  </label>
                  <select
                    id="evt-start-time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {CALENDAR_TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot} WIB
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Recurrence Configuration */}
              <div>
                <label
                  htmlFor="evt-repeat-freq"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Pengulangan Event
                </label>
                <select
                  id="evt-repeat-freq"
                  value={formRepeatFreq}
                  onChange={(e) => {
                    const nextFreq = e.target.value as CalendarRecurrenceFreq;
                    setFormRepeatFreq(nextFreq);
                    if (
                      nextFreq === 'weekly' &&
                      formRepeatWeekdays.length === 0 &&
                      /^\d{4}-\d{2}-\d{2}$/.test(formDate)
                    ) {
                      setFormRepeatWeekdays([parseUtcDate(formDate).getUTCDay()]);
                    }
                  }}
                  className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="none">Tidak Berulang</option>
                  <option value="daily">Setiap Hari</option>
                  <option value="weekly">Setiap Minggu</option>
                  <option value="monthly">Setiap Bulan</option>
                  <option value="yearly">Setiap Tahun</option>
                </select>

                {formRepeatFreq !== 'none' && (
                  <div className="mt-2.5 space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="evt-repeat-interval"
                          className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                        >
                          Interval Pengulangan
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-600 dark:text-slate-300">
                            Setiap
                          </span>
                          <input
                            id="evt-repeat-interval"
                            type="number"
                            min={1}
                            max={12}
                            value={formRepeatInterval}
                            onChange={(e) =>
                              setFormRepeatInterval(normalizeCalendarInterval(e.target.value))
                            }
                            className="h-[36px] w-16 rounded-lg border border-slate-200 bg-white px-2 text-center font-mono text-xs font-semibold text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                          <span className="text-xs text-slate-600 dark:text-slate-300">
                            {formRepeatFreq === 'daily'
                              ? 'hari'
                              : formRepeatFreq === 'weekly'
                                ? 'minggu'
                                : formRepeatFreq === 'monthly'
                                  ? 'bulan'
                                  : 'tahun'}
                          </span>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="evt-repeat-end-mode"
                          className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                        >
                          Berakhir Pada
                        </label>
                        <select
                          id="evt-repeat-end-mode"
                          value={formRepeatEndMode}
                          onChange={(e) => {
                            const mode = e.target.value as 'never' | 'until';
                            setFormRepeatEndMode(mode);
                            if (mode === 'until' && !formRepeatUntil) {
                              setFormRepeatUntil(formDate);
                            }
                          }}
                          className="h-[36px] w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        >
                          <option value="never">Selamanya (Tanpa Batas)</option>
                          <option value="until">Sampai Tanggal Tertentu</option>
                        </select>
                      </div>
                    </div>

                    {formRepeatEndMode === 'until' && (
                      <div>
                        <label
                          htmlFor="evt-repeat-until"
                          className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                        >
                          Tanggal Akhir Pengulangan
                        </label>
                        <input
                          id="evt-repeat-until"
                          type="date"
                          required
                          min={formDate}
                          value={formRepeatUntil}
                          onChange={(e) => setFormRepeatUntil(e.target.value)}
                          className="h-[38px] w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                    )}

                    {formRepeatFreq === 'weekly' && (
                      <div>
                        <span className="mb-1.5 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          Ulangi Pada Hari
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {WEEKDAY_DOW_MAP.map(({ label, dow }) => {
                            const active = formRepeatWeekdays.includes(dow);
                            return (
                              <button
                                key={dow}
                                type="button"
                                onClick={() => toggleRepeatWeekday(dow)}
                                className={`min-h-[32px] rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                  active
                                    ? 'border-blue-700 bg-blue-700 text-white dark:border-blue-600 dark:bg-blue-600'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-2 text-[11px] text-slate-600 dark:border-slate-700 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1.5">
                        <Repeat className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" />
                        <span>
                          {formatCalendarRecurrenceLabel({
                            date: formDate,
                            repeatFreq: formRepeatFreq,
                            repeatInterval: formRepeatInterval,
                            repeatWeekdays: formRepeatWeekdays,
                            repeatUntil:
                              formRepeatEndMode === 'until' ? formRepeatUntil : '',
                          })}
                        </span>
                      </span>

                      {editingEventId && formExcludedDates.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setFormExcludedDates([])}
                          className="font-semibold text-blue-700 hover:underline dark:text-blue-400"
                        >
                          Pulihkan {formExcludedDates.length} tgl dilewati
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Tampilkan Event Ke (Visibilitas Departemen)
                  </span>
                  <button
                    type="button"
                    onClick={toggleAllDepts}
                    className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                  >
                    {allDeptsSelected ? 'Batalkan Semua' : 'Pilih Semua Departemen'}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700/70">
                    <input
                      type="checkbox"
                      checked={allDeptsSelected}
                      onChange={toggleAllDepts}
                      className="h-4 w-4 accent-blue-700"
                    />
                    <span>Semua Departemen</span>
                  </label>

                  <label className="flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700/70">
                    <input
                      type="checkbox"
                      checked={formVisibleTo.includes('stock_accounting')}
                      onChange={() => toggleDept('stock_accounting')}
                      className="h-4 w-4 accent-blue-700"
                    />
                    <span>Stock Accounting</span>
                  </label>

                  <label className="flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700/70">
                    <input
                      type="checkbox"
                      checked={formVisibleTo.includes('gl')}
                      onChange={() => toggleDept('gl')}
                      className="h-4 w-4 accent-blue-700"
                    />
                    <span>GL</span>
                  </label>

                  <label className="flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700/70">
                    <input
                      type="checkbox"
                      checked={formVisibleTo.includes('accounting')}
                      onChange={() => toggleDept('accounting')}
                      className="h-4 w-4 accent-blue-700"
                    />
                    <span>Accounting</span>
                  </label>
                </div>

                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Pengguna Accounting yang berwenang selalu dapat melihat semua event untuk koordinasi.
                </p>
              </div>

              <div>
                <label
                  htmlFor="evt-notes"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Catatan / Peserta (Opsional)
                </label>
                <textarea
                  id="evt-notes"
                  rows={3}
                  maxLength={500}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Contoh: Peter, Melvin, Jackson, dan Jessica akan berpartisipasi."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Catatan dan daftar peserta hanya terlihat saat event diklik (tidak tampil di ringkasan kalender).
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setFormOpen(false)}
                  className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="min-h-[40px] rounded-lg bg-blue-700 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  {busy
                    ? 'Menyimpan...'
                    : editingEventId
                      ? 'Simpan Perubahan'
                      : 'Simpan Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDeleteOpen && selectedOccurrence && !selectedOccurrence.isRecurring && (
        <ConfirmModal
          open={true}
          title={`Hapus event "${selectedOccurrence.event.title}"?`}
          description="Event yang dihapus akan hilang dari kalender semua departemen terkait."
          confirmLabel="Ya, Hapus Event"
          destructive
          onCancel={() => setConfirmDeleteOpen(false)}
          onConfirm={async () => {
            const deletedTitle = selectedOccurrence.event.title;
            await onDeleteEvent(selectedOccurrence.event.id);
            setConfirmDeleteOpen(false);
            setSelectedOccurrence(null);
            setFeedback({ type: 'ok', message: `Event "${deletedTitle}" berhasil dihapus.` });
          }}
        />
      )}

      {confirmDeleteOpen && selectedOccurrence && selectedOccurrence.isRecurring && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-recurring-title"
          onClick={() => !deleteBusy && setConfirmDeleteOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="delete-recurring-title"
              className="text-base font-bold text-slate-900 dark:text-slate-100"
            >
              Hapus Event Berulang
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Event <span className="font-semibold">"{selectedOccurrence.event.title}"</span>{' '}
              merupakan jadwal berulang. Pilih apakah ingin menghapus tanggal{' '}
              <span className="font-mono font-semibold">
                {fmtDateSlash(selectedOccurrence.occurrenceDate)}
              </span>{' '}
              saja atau seluruh seri pengulangan.
            </p>

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={handleDeleteSingleOccurrence}
                className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                {deleteBusy
                  ? 'Memproses...'
                  : `Hapus Tanggal Ini Saja (${fmtDateSlash(selectedOccurrence.occurrenceDate)})`}
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={async () => {
                  const deletedTitle = selectedOccurrence.event.title;
                  setDeleteBusy(true);
                  try {
                    await onDeleteEvent(selectedOccurrence.event.id);
                    setConfirmDeleteOpen(false);
                    setSelectedOccurrence(null);
                    setFeedback({
                      type: 'ok',
                      message: `Seluruh seri event "${deletedTitle}" berhasil dihapus.`,
                    });
                  } finally {
                    setDeleteBusy(false);
                  }
                }}
                className="min-h-[40px] w-full rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                Hapus Seluruh Seri Pengulangan
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setConfirmDeleteOpen(false)}
                className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
