import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { FormEvent, MouseEvent, useEffect, useMemo, useState } from 'react';
import {
  AccountProfile,
  CalendarBannerMedia,
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
  normalizeCalendarInterval,
  normalizeCalendarRecurrenceFreq,
  normalizeCalendarVisibleTo,
  normalizeCalendarWeekdays,
  parseUtcDate,
  shiftIsoDays,
  toIsoUtc,
  todayIso,
} from '../utils/outletLogic';
import { KalenderBannerImage } from './kalender/KalenderBannerImage';
import { KalenderDayPopup } from './kalender/KalenderDayPopup';
import { KalenderDetailModal } from './kalender/KalenderDetailModal';
import { KalenderFormModal } from './kalender/KalenderFormModal';
import { KalenderGridViews } from './kalender/KalenderGridViews';
import {
  ALL_DEPARTMENTS,
  CalendarEventFormPayload,
  CalendarViewMode,
  buildMonthGridDays,
  formatMonthTitle,
  formatWeekTitle,
  getMondayOfWeek,
} from './kalender/calendarUtils';

export type { CalendarEventFormPayload };

interface KalenderViewProps {
  account: AccountProfile;
  events: CalendarEvent[];
  bannerImages: CalendarBannerMedia[];
  onCreateEvent: (input: CalendarEventFormPayload) => Promise<string>;
  onUpdateEvent: (eventId: string, input: CalendarEventFormPayload) => Promise<void>;
  onDeleteEvent: (eventId: string) => Promise<void>;
  onAddBannerImage: (input: {
    imageDataUrl: string;
    caption?: string;
    fileName?: string;
    sortOrder?: number;
  }) => Promise<string>;
  onUpdateBannerImage: (
    mediaId: string,
    input: {
      imageDataUrl: string;
      caption?: string;
      fileName?: string;
      sortOrder?: number;
    }
  ) => Promise<void>;
  onDeleteBannerImage: (mediaId: string) => Promise<void>;
}

export function KalenderView({
  account,
  events,
  bannerImages,
  onCreateEvent,
  onUpdateEvent,
  onDeleteEvent,
  onAddBannerImage,
  onUpdateBannerImage,
  onDeleteBannerImage,
}: KalenderViewProps) {
  const today = todayIso();
  const isAdmin = account.role === 'admin';
  const canManage = account.role === 'admin' || account.role === 'accounting';

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [cursorDate, setCursorDate] = useState<string>(today);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);

  const [selectedOccurrence, setSelectedOccurrence] =
    useState<ExpandedCalendarOccurrence | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

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
    setFormStartTime(CALENDAR_TIME_SLOTS.includes(evt.startTime) ? evt.startTime : '09:00');
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
        if (prev.length === 1) return prev;
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
      formRepeatFreq !== 'none' && formRepeatEndMode === 'until' ? formRepeatUntil.trim() : '';
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

  const handleDeleteSeries = async (evt: CalendarEvent) => {
    const wasRecurring = normalizeCalendarRecurrenceFreq(evt.repeatFreq) !== 'none';
    setDeleteBusy(true);
    try {
      await onDeleteEvent(evt.id);
      setConfirmDeleteOpen(false);
      setSelectedOccurrence(null);
      setFeedback({
        type: 'ok',
        message: wasRecurring
          ? `Seluruh seri event "${evt.title}" berhasil dihapus.`
          : `Event "${evt.title}" berhasil dihapus.`,
      });
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

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span>
            {canManage
              ? 'Klik tanggal atau slot waktu untuk membuat event baru. Klik event untuk melihat detail, catatan peserta, atau mengubah jadwal.'
              : 'Menampilkan jadwal sesuai departemen Anda. Klik event untuk melihat detail dan catatan peserta.'}
          </span>
          <span className="font-mono tabular-nums">{visibleEvents.length} jadwal terlihat</span>
        </div>
      </section>

      <KalenderGridViews
        viewMode={viewMode}
        today={today}
        cursorDate={cursorDate}
        canManage={canManage}
        monthGridDays={monthGridDays}
        weekDays={weekDays}
        eventsByDate={eventsByDate}
        onSelectOccurrence={setSelectedOccurrence}
        onOpenCreateModal={openCreateModal}
        onOpenDayOverflowPopup={openDayOverflowPopup}
        onSelectDayView={(dayIso) => {
          setCursorDate(dayIso);
          setViewMode('day');
        }}
      />

      <KalenderBannerImage
        isAdmin={isAdmin}
        banners={bannerImages}
        onAddBanner={onAddBannerImage}
        onUpdateBanner={onUpdateBannerImage}
        onDeleteBanner={onDeleteBannerImage}
      />

      {dayPopup && (
        <KalenderDayPopup
          dayPopup={dayPopup}
          today={today}
          canManage={canManage}
          popupEvents={eventsByDate.get(dayPopup.date) || []}
          onClose={() => setDayPopup(null)}
          onJumpToDayView={(date) => {
            setDayPopup(null);
            setCursorDate(date);
            setViewMode('day');
          }}
          onSelectOccurrence={(occ) => {
            setDayPopup(null);
            setSelectedOccurrence(occ);
          }}
          onOpenCreateModal={(date) => openCreateModal(date)}
        />
      )}

      <KalenderDetailModal
        selectedOccurrence={selectedOccurrence}
        canManage={canManage}
        confirmDeleteOpen={confirmDeleteOpen}
        deleteBusy={deleteBusy}
        onClose={() => setSelectedOccurrence(null)}
        onEdit={openEditModal}
        onOpenConfirmDelete={() => setConfirmDeleteOpen(true)}
        onCancelConfirmDelete={() => setConfirmDeleteOpen(false)}
        onDeleteSingleOccurrence={handleDeleteSingleOccurrence}
        onDeleteSeries={handleDeleteSeries}
      />

      {canManage && (
        <KalenderFormModal
          open={formOpen}
          editingEventId={editingEventId}
          busy={busy}
          formError={formError}
          formTitle={formTitle}
          formDate={formDate}
          formStartTime={formStartTime}
          formVisibleTo={formVisibleTo}
          formNotes={formNotes}
          formRepeatFreq={formRepeatFreq}
          formRepeatInterval={formRepeatInterval}
          formRepeatWeekdays={formRepeatWeekdays}
          formRepeatEndMode={formRepeatEndMode}
          formRepeatUntil={formRepeatUntil}
          formExcludedDates={formExcludedDates}
          allDeptsSelected={allDeptsSelected}
          onClose={() => setFormOpen(false)}
          onSubmit={handleSubmitForm}
          onChangeTitle={setFormTitle}
          onChangeDate={(nextDate) => {
            setFormDate(nextDate);
            if (/^\d{4}-\d{2}-\d{2}$/.test(nextDate) && formRepeatWeekdays.length <= 1) {
              setFormRepeatWeekdays([parseUtcDate(nextDate).getUTCDay()]);
            }
          }}
          onChangeStartTime={setFormStartTime}
          onChangeNotes={setFormNotes}
          onChangeRepeatFreq={(nextFreq) => {
            setFormRepeatFreq(nextFreq);
            if (
              nextFreq === 'weekly' &&
              formRepeatWeekdays.length === 0 &&
              /^\d{4}-\d{2}-\d{2}$/.test(formDate)
            ) {
              setFormRepeatWeekdays([parseUtcDate(formDate).getUTCDay()]);
            }
          }}
          onChangeRepeatInterval={setFormRepeatInterval}
          onChangeRepeatEndMode={(mode) => {
            setFormRepeatEndMode(mode);
            if (mode === 'until' && !formRepeatUntil) {
              setFormRepeatUntil(formDate);
            }
          }}
          onChangeRepeatUntil={setFormRepeatUntil}
          onToggleRepeatWeekday={toggleRepeatWeekday}
          onRestoreExcludedDates={() => setFormExcludedDates([])}
          onToggleAllDepts={toggleAllDepts}
          onToggleDept={toggleDept}
        />
      )}
    </div>
  );
}
