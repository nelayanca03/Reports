import {
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  UserCheck,
} from 'lucide-react';
import { FormEvent, MouseEvent, useEffect, useMemo, useState } from 'react';
import { formatFriendlyFirestoreError } from '../firebase';
import {
  AccountProfile,
  CalendarAssignScope,
  CalendarAssignStatus,
  CalendarBannerMedia,
  CalendarEvent,
  CalendarRecurrenceFreq,
  OperationalRoleId,
  PersonalReminder,
  RoleConfig,
} from '../types/outlet';
import {
  ParsedAssignImportRow,
  exportAssignsToXlsx,
} from '../utils/assignImportExport';
import {
  CALENDAR_TIME_SLOTS,
  ROLE_LABELS,
  canUserViewCalendarEvent,
  expandPersonalRemindersForRange,
  fmtDateSlash,
  fmtDateWeekdayLong,
  getAccountPicUpper,
  getMasterOutletOptions,
  normalizeCalendarInterval,
  normalizeCalendarRecurrenceFreq,
  normalizeCalendarWeekdays,
  parseUtcDate,
  resolveAllAssignablePics,
  shiftIsoDays,
  toIsoUtc,
  todayIso,
} from '../utils/outletLogic';
import { KalenderAssignUploadModal } from './kalender/KalenderAssignUploadModal';
import { KalenderBannerImage } from './kalender/KalenderBannerImage';
import { KalenderDayPopup } from './kalender/KalenderDayPopup';
import { KalenderDetailModal } from './kalender/KalenderDetailModal';
import { KalenderFormModal } from './kalender/KalenderFormModal';
import { KalenderGridViews } from './kalender/KalenderGridViews';
import {
  CalendarEventFormPayload,
  CalendarFormMode,
  CalendarGridItem,
  CalendarViewMode,
  PersonalReminderFormPayload,
  buildMonthGridDays,
  formatMonthTitle,
  formatWeekTitle,
  getMondayOfWeek,
} from './kalender/calendarUtils';

export type { CalendarEventFormPayload, PersonalReminderFormPayload };

interface KalenderViewProps {
  account: AccountProfile;
  events: CalendarEvent[];
  personalReminders: PersonalReminder[];
  roleConfigs: Record<OperationalRoleId, RoleConfig>;
  managedAccounts: AccountProfile[];
  bannerImages: CalendarBannerMedia[];
  focusAssign?: { eventId: string; date: string; seq: number } | null;
  onCreateEvent: (input: CalendarEventFormPayload) => Promise<string>;
  onUpdateEvent: (eventId: string, input: CalendarEventFormPayload) => Promise<void>;
  onDeleteEvent: (eventId: string) => Promise<void>;
  onBulkCreateAssigns: (rows: ParsedAssignImportRow[]) => Promise<number>;
  onUpdateAssignResponse: (
    eventId: string,
    input: {
      assignStatus: CalendarAssignStatus;
      returnTime?: string;
      cancelReason?: string;
      notificationDismissed?: boolean;
      targetPic?: string;
      forceGlobal?: boolean;
    }
  ) => Promise<void>;
  onCreatePersonalReminder: (input: PersonalReminderFormPayload) => Promise<string>;
  onUpdatePersonalReminder: (
    reminderId: string,
    input: PersonalReminderFormPayload
  ) => Promise<void>;
  onDeletePersonalReminder: (reminderId: string) => Promise<void>;
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
  personalReminders,
  roleConfigs,
  managedAccounts,
  bannerImages,
  focusAssign,
  onCreateEvent,
  onUpdateEvent,
  onDeleteEvent,
  onBulkCreateAssigns,
  onUpdateAssignResponse,
  onCreatePersonalReminder,
  onUpdatePersonalReminder,
  onDeletePersonalReminder,
  onAddBannerImage,
  onUpdateBannerImage,
  onDeleteBannerImage,
}: KalenderViewProps) {
  const today = todayIso();
  const isAdmin = account.role === 'admin';
  const viewerPicUpper = getAccountPicUpper(account);

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [cursorDate, setCursorDate] = useState<string>(today);
  const [adminPicFilter, setAdminPicFilter] = useState<string>('ALL');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);

  const [selectedItem, setSelectedItem] = useState<CalendarGridItem | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

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

  const assignablePics = useMemo(
    () => resolveAllAssignablePics(roleConfigs, managedAccounts),
    [roleConfigs, managedAccounts]
  );

  const allMasterOutlets = useMemo(
    () => getMasterOutletOptions(roleConfigs).map((o) => o.code),
    [roleConfigs]
  );

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<CalendarFormMode>(isAdmin ? 'assign' : 'personal');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState(today);
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formNotes, setFormNotes] = useState('');
  const [formAssignScope, setFormAssignScope] = useState<CalendarAssignScope>('pic');
  const [formAssignedDivision, setFormAssignedDivision] =
    useState<OperationalRoleId>('stock_accounting');
  const [formAssignedPicKey, setFormAssignedPicKey] = useState('');
  const [formAssignedOutlet, setFormAssignedOutlet] = useState('');
  const [formRepeatFreq, setFormRepeatFreq] = useState<CalendarRecurrenceFreq>('none');
  const [formRepeatInterval, setFormRepeatInterval] = useState(1);
  const [formRepeatWeekdays, setFormRepeatWeekdays] = useState<number[]>([]);
  const [formRepeatEndMode, setFormRepeatEndMode] = useState<'never' | 'until'>('never');
  const [formRepeatUntil, setFormRepeatUntil] = useState('');
  const [formExcludedDates, setFormExcludedDates] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [prevFocusSeq, setPrevFocusSeq] = useState<number>(0);

  // Jump to focused assign when opened from top notification banner
  if (focusAssign && focusAssign.seq !== prevFocusSeq) {
    setPrevFocusSeq(focusAssign.seq);
    if (/^\d{4}-\d{2}-\d{2}$/.test(focusAssign.date)) {
      setCursorDate(focusAssign.date);
    }
    const target = events.find((e) => e.id === focusAssign.eventId);
    if (target) {
      setSelectedItem({
        kind: 'assign',
        key: `assign_${target.id}_${target.date}`,
        occurrenceDate: target.date,
        startTime: target.startTime,
        title: target.title,
        isRecurring: false,
        event: target,
      });
    }
  }

  const visibleAssignEvents = useMemo(() => {
    return events.filter((evt) => {
      if (evt.eventType !== 'assign') return false;
      if (!canUserViewCalendarEvent(evt, account)) return false;
      if (isAdmin && adminPicFilter !== 'ALL') {
        if (adminPicFilter.startsWith('DIV|')) {
          const divRole = adminPicFilter.slice(4);
          return evt.assignScope === 'division' && (evt.assignedDivision || evt.assignedRole) === divRole;
        }
        if (evt.assignScope === 'division') {
          const [filterRole] = adminPicFilter.split('|');
          return (evt.assignedDivision || evt.assignedRole) === filterRole;
        }
        const key = `${evt.assignedRole || 'stock_accounting'}|${(
          evt.assignedPicUpper ||
          (evt.assignedPic || '').trim().toUpperCase()
        ).trim()}`;
        return key === adminPicFilter;
      }
      return true;
    });
  }, [events, account, isAdmin, adminPicFilter]);

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

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarGridItem[]>();
    const pushItem = (item: CalendarGridItem) => {
      const list = map.get(item.occurrenceDate) || [];
      list.push(item);
      map.set(item.occurrenceDate, list);
    };

    for (const evt of visibleAssignEvents) {
      if (evt.date >= visibleRange.start && evt.date <= visibleRange.end) {
        pushItem({
          kind: 'assign',
          key: `assign_${evt.id}_${evt.date}`,
          occurrenceDate: evt.date,
          startTime: evt.startTime,
          title: evt.title,
          isRecurring: false,
          event: evt,
        });
      }
    }

    const expandedReminders = expandPersonalRemindersForRange(
      personalReminders,
      visibleRange.start,
      visibleRange.end
    );
    for (const occ of expandedReminders) {
      pushItem({
        kind: 'personal',
        key: `personal_${occ.reminder.id}_${occ.occurrenceDate}`,
        occurrenceDate: occ.occurrenceDate,
        startTime: occ.reminder.startTime,
        title: occ.reminder.title,
        isRecurring: occ.isRecurring,
        reminder: occ.reminder,
      });
    }

    for (const [d, list] of map.entries()) {
      list.sort(
        (a, b) =>
          a.startTime.localeCompare(b.startTime) ||
          (a.kind === b.kind ? 0 : a.kind === 'assign' ? -1 : 1) ||
          a.title.localeCompare(b.title)
      );
      map.set(d, list);
    }

    return map;
  }, [visibleAssignEvents, personalReminders, visibleRange]);

  // Keep selectedItem live-synced with Firestore snapshot updates
  const liveSelectedItem = useMemo<CalendarGridItem | null>(() => {
    if (!selectedItem) return null;
    if (selectedItem.kind === 'assign') {
      const latest = events.find((e) => e.id === selectedItem.event.id);
      if (!latest) return null;
      return {
        ...selectedItem,
        occurrenceDate: latest.date,
        startTime: latest.startTime,
        title: latest.title,
        event: latest,
      };
    }
    const latestRem = personalReminders.find((r) => r.id === selectedItem.reminder.id);
    if (!latestRem) return null;
    return {
      ...selectedItem,
      startTime: latestRem.startTime,
      title: latestRem.title,
      reminder: latestRem,
    };
  }, [selectedItem, events, personalReminders]);

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

  const openCreateModal = (
    prefillDate?: string,
    prefillTime?: string,
    forcedMode?: CalendarFormMode
  ) => {
    const modeToOpen: CalendarFormMode = forcedMode || (isAdmin ? 'assign' : 'personal');
    if (modeToOpen === 'assign' && !isAdmin) return;

    const targetDate = prefillDate || cursorDate || today;
    setDayPopup(null);
    setFormMode(modeToOpen);
    setEditingId(null);
    setFormTitle('');
    setFormDate(targetDate);
    setFormStartTime(
      prefillTime && CALENDAR_TIME_SLOTS.includes(prefillTime) ? prefillTime : '09:00'
    );
    setFormNotes('');

    if (modeToOpen === 'assign') {
      if (adminPicFilter.startsWith('DIV|')) {
        const divRole = adminPicFilter.slice(4) as OperationalRoleId;
        setFormAssignScope('division');
        setFormAssignedDivision(divRole);
        setFormAssignedPicKey(
          assignablePics[0] ? `${assignablePics[0].roleId}|${assignablePics[0].picUpper}` : ''
        );
        setFormAssignedOutlet('');
      } else {
        setFormAssignScope('pic');
        setFormAssignedDivision('stock_accounting');
        const preselected =
          adminPicFilter !== 'ALL'
            ? assignablePics.find((p) => `${p.roleId}|${p.picUpper}` === adminPicFilter)
            : assignablePics[0];
        setFormAssignedPicKey(
          preselected ? `${preselected.roleId}|${preselected.picUpper}` : ''
        );
        setFormAssignedOutlet(preselected?.outlets[0] || '');
      }
    } else {
      setFormRepeatFreq('none');
      setFormRepeatInterval(1);
      setFormRepeatWeekdays([parseUtcDate(targetDate).getUTCDay()]);
      setFormRepeatEndMode('never');
      setFormRepeatUntil('');
      setFormExcludedDates([]);
    }
    setFormError(null);
    setFormOpen(true);
  };

  const openEditAssignModal = (evt: CalendarEvent) => {
    if (!isAdmin) return;
    setSelectedItem(null);
    setFormMode('assign');
    setEditingId(evt.id);
    setFormTitle(evt.title);
    setFormDate(evt.date);
    setFormStartTime(CALENDAR_TIME_SLOTS.includes(evt.startTime) ? evt.startTime : '09:00');
    setFormNotes(evt.notes || '');
    const isDiv = evt.assignScope === 'division';
    const roleId: OperationalRoleId = evt.assignedDivision || evt.assignedRole || 'stock_accounting';
    setFormAssignScope(isDiv ? 'division' : 'pic');
    setFormAssignedDivision(roleId);
    const picUpper = (
      evt.assignedPicUpper ||
      (evt.assignedPic || '').trim().toUpperCase()
    ).trim();
    const key = picUpper ? `${roleId}|${picUpper}` : '';
    setFormAssignedPicKey(key);
    setFormAssignedOutlet(evt.assignedOutlet || '');
    setFormError(null);
    setFormOpen(true);
  };

  const openEditPersonalModal = (rem: PersonalReminder) => {
    setSelectedItem(null);
    setFormMode('personal');
    setEditingId(rem.id);
    setFormTitle(rem.title);
    setFormDate(rem.date);
    setFormStartTime(CALENDAR_TIME_SLOTS.includes(rem.startTime) ? rem.startTime : '09:00');
    setFormNotes(rem.notes || '');
    const freq = normalizeCalendarRecurrenceFreq(rem.repeatFreq);
    setFormRepeatFreq(freq);
    setFormRepeatInterval(normalizeCalendarInterval(rem.repeatInterval));
    const existingDays = normalizeCalendarWeekdays(rem.repeatWeekdays);
    setFormRepeatWeekdays(
      existingDays.length > 0 ? existingDays : [parseUtcDate(rem.date).getUTCDay()]
    );
    if (rem.repeatUntil && /^\d{4}-\d{2}-\d{2}$/.test(rem.repeatUntil)) {
      setFormRepeatEndMode('until');
      setFormRepeatUntil(rem.repeatUntil);
    } else {
      setFormRepeatEndMode('never');
      setFormRepeatUntil('');
    }
    setFormExcludedDates(rem.excludedDates || []);
    setFormError(null);
    setFormOpen(true);
  };

  const openDayOverflowPopup = (dayIso: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const cellEl = e.currentTarget.closest('[data-day-cell]') || e.currentTarget;
    const rect = cellEl.getBoundingClientRect();
    const popupWidth = Math.min(300, window.innerWidth - 24);
    const count = (itemsByDate.get(dayIso) || []).length;
    const estHeight = Math.min(420, 130 + count * 34);
    const rawLeft = rect.left + rect.width / 2 - popupWidth / 2;
    const left = Math.max(12, Math.min(rawLeft, window.innerWidth - popupWidth - 12));
    const rawTop = rect.top - 12;
    const top = Math.max(12, Math.min(rawTop, window.innerHeight - estHeight - 12));
    setDayPopup({ date: dayIso, top, left });
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

  const handleChangeAssignedPicKey = (nextKey: string) => {
    setFormAssignedPicKey(nextKey);
    const opt = assignablePics.find((p) => `${p.roleId}|${p.picUpper}` === nextKey);
    if (opt) {
      setFormAssignedOutlet(opt.outlets[0] || '');
    } else {
      setFormAssignedOutlet('');
    }
  };

  const handleSubmitForm = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formTitle.trim()) {
      setFormError(
        formMode === 'assign' ? 'Judul penugasan wajib diisi.' : 'Judul reminder wajib diisi.'
      );
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formDate)) {
      setFormError('Tanggal wajib diisi.');
      return;
    }
    if (!CALENDAR_TIME_SLOTS.includes(formStartTime)) {
      setFormError('Jam harus antara 08:00 sampai 19:00 (interval 30 menit).');
      return;
    }

    setBusy(true);
    try {
      if (formMode === 'assign') {
        const existingEvt = editingId ? events.find((ev) => ev.id === editingId) : undefined;
        if (formAssignScope === 'division') {
          const targetChanged =
            existingEvt &&
            (existingEvt.assignScope !== 'division' ||
              existingEvt.assignedDivision !== formAssignedDivision);
          const payload: CalendarEventFormPayload = {
            title: formTitle.trim(),
            date: formDate,
            startTime: formStartTime,
            assignScope: 'division',
            assignedDivision: formAssignedDivision,
            assignedPic: '',
            assignedRole: formAssignedDivision,
            assignedEmail: '',
            assignedOutlet: formAssignedOutlet.trim(),
            notes: formNotes.trim(),
            ...(existingEvt
              ? {
                  assignStatus: existingEvt.assignStatus,
                  returnTime: existingEvt.returnTime,
                  cancelReason: existingEvt.cancelReason,
                  notificationDismissed: targetChanged ? false : existingEvt.notificationDismissed,
                  resetDismissedBy: Boolean(targetChanged),
                }
              : {}),
          };

          const divLabel = ROLE_LABELS[formAssignedDivision] || formAssignedDivision;
          if (editingId) {
            await onUpdateEvent(editingId, payload);
            setFeedback({
              type: 'ok',
              message: `Assign Divisi "${formTitle.trim()}" (${divLabel}) berhasil diperbarui.`,
            });
          } else {
            await onCreateEvent(payload);
            setFeedback({
              type: 'ok',
              message: `Assign Divisi "${formTitle.trim()}" untuk ${divLabel} berhasil dibuat (langsung tampil saat login, notifikasi aktif, & +1 kunjungan).`,
            });
          }
        } else {
          const selectedPic = assignablePics.find(
            (p) => `${p.roleId}|${p.picUpper}` === formAssignedPicKey
          );
          if (!selectedPic) {
            setFormError('Pilih PIC tujuan penugasan terlebih dahulu.');
            setBusy(false);
            return;
          }
          const targetChanged =
            existingEvt &&
            (existingEvt.assignScope === 'division' ||
              existingEvt.assignedPicUpper !== selectedPic.picUpper);
          const payload: CalendarEventFormPayload = {
            title: formTitle.trim(),
            date: formDate,
            startTime: formStartTime,
            assignScope: 'pic',
            assignedDivision: '',
            assignedPic: selectedPic.pic,
            assignedRole: selectedPic.roleId,
            assignedEmail: selectedPic.email,
            assignedOutlet: formAssignedOutlet.trim(),
            notes: formNotes.trim(),
            ...(existingEvt
              ? {
                  assignStatus: existingEvt.assignStatus,
                  returnTime: existingEvt.returnTime,
                  cancelReason: existingEvt.cancelReason,
                  notificationDismissed: targetChanged ? false : existingEvt.notificationDismissed,
                  resetDismissedBy: Boolean(targetChanged),
                }
              : {}),
          };

          if (editingId) {
            await onUpdateEvent(editingId, payload);
            setFeedback({
              type: 'ok',
              message: `Assign "${formTitle.trim()}" untuk ${selectedPic.pic} berhasil diperbarui.`,
            });
          } else {
            await onCreateEvent(payload);
            setFeedback({
              type: 'ok',
              message: `Assign "${formTitle.trim()}" untuk ${selectedPic.pic} berhasil dibuat (langsung tampil saat login, notifikasi aktif, & +1 kunjungan).`,
            });
          }
        }
      } else {
        const repeatUntilVal =
          formRepeatFreq !== 'none' && formRepeatEndMode === 'until' ? formRepeatUntil.trim() : '';
        if (
          formRepeatFreq !== 'none' &&
          formRepeatEndMode === 'until' &&
          !/^\d{4}-\d{2}-\d{2}$/.test(repeatUntilVal)
        ) {
          setFormError('Pilih tanggal berakhir pengulangan.');
          setBusy(false);
          return;
        }
        if (repeatUntilVal && repeatUntilVal < formDate) {
          setFormError('Tanggal akhir pengulangan harus sama atau setelah tanggal reminder.');
          setBusy(false);
          return;
        }

        const payload: PersonalReminderFormPayload = {
          title: formTitle.trim(),
          date: formDate,
          startTime: formStartTime,
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

        if (editingId) {
          await onUpdatePersonalReminder(editingId, payload);
          setFeedback({
            type: 'ok',
            message: `Reminder personal "${formTitle.trim()}" berhasil diperbarui.`,
          });
        } else {
          await onCreatePersonalReminder(payload);
          setFeedback({
            type: 'ok',
            message: `Reminder personal "${formTitle.trim()}" berhasil ditambahkan.`,
          });
        }
      }

      setCursorDate(formDate);
      setFormOpen(false);
    } catch (err) {
      setFormError(formatFriendlyFirestoreError(err, 'Gagal menyimpan jadwal.'));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSingleOccurrence = async () => {
    if (!liveSelectedItem || liveSelectedItem.kind !== 'personal') return;
    const { reminder, occurrenceDate } = liveSelectedItem;
    setDeleteBusy(true);
    try {
      const nextExcluded = Array.from(
        new Set([...(reminder.excludedDates || []), occurrenceDate])
      ).sort();
      await onUpdatePersonalReminder(reminder.id, {
        title: reminder.title,
        date: reminder.date,
        startTime: reminder.startTime,
        notes: reminder.notes,
        repeatFreq: reminder.repeatFreq,
        repeatInterval: reminder.repeatInterval,
        repeatUntil: reminder.repeatUntil,
        repeatWeekdays: reminder.repeatWeekdays,
        excludedDates: nextExcluded,
      });
      setConfirmDeleteOpen(false);
      setSelectedItem(null);
      setFeedback({
        type: 'ok',
        message: `Reminder "${reminder.title}" pada ${fmtDateSlash(occurrenceDate)} dihapus.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        message: formatFriendlyFirestoreError(err, 'Gagal menghapus tanggal reminder.'),
      });
      setConfirmDeleteOpen(false);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleDeleteSeries = async () => {
    if (!liveSelectedItem) return;
    setDeleteBusy(true);
    try {
      if (liveSelectedItem.kind === 'assign') {
        await onDeleteEvent(liveSelectedItem.event.id);
        setFeedback({
          type: 'ok',
          message: `Assign "${liveSelectedItem.title}" berhasil dihapus.`,
        });
      } else {
        await onDeletePersonalReminder(liveSelectedItem.reminder.id);
        setFeedback({
          type: 'ok',
          message: `Reminder personal "${liveSelectedItem.title}" berhasil dihapus.`,
        });
      }
      setConfirmDeleteOpen(false);
      setSelectedItem(null);
    } catch (err) {
      setFeedback({
        type: 'err',
        message: formatFriendlyFirestoreError(err, 'Gagal menghapus jadwal.'),
      });
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleUpdateAssignStatus = async (
    eventId: string,
    input: {
      assignStatus: CalendarAssignStatus;
      returnTime?: string;
      cancelReason?: string;
      notificationDismissed?: boolean;
      targetPic?: string;
      forceGlobal?: boolean;
    }
  ) => {
    await onUpdateAssignResponse(eventId, input);
    if (input.assignStatus === 'completed') {
      setFeedback({
        type: 'ok',
        message: `Jam pulang (${input.returnTime} WIB) berhasil disimpan dan tercatat di Kunjungan.`,
      });
    } else if (input.assignStatus === 'cancelled') {
      setFeedback({
        type: 'ok',
        message: 'Assign ditandai Tidak Jadi Pergi. Kunjungan dari assign ini menjadi 0.',
      });
    } else {
      setFeedback({
        type: 'ok',
        message: 'Assign diaktifkan kembali dan kunjungan otomatis dikembalikan.',
      });
    }
  };

  const handleBulkImportAssigns = async (rows: ParsedAssignImportRow[]): Promise<number> => {
    const created = await onBulkCreateAssigns(rows);
    setFeedback({
      type: 'ok',
      message: `${created} assign PIC berhasil diimport ke kalender, notifikasi, dan Kunjungan.`,
    });
    return created;
  };

  const handleExportAssigns = () => {
    const exportedCount = visibleAssignEvents.length;
    exportAssignsToXlsx(visibleAssignEvents);
    setFeedback({
      type: 'ok',
      message:
        exportedCount > 0
          ? `Berhasil mengekspor ${exportedCount} assign PIC ke file XLSX.`
          : 'File XLSX kosong berhasil diekspor (belum ada data assign).',
    });
  };

  const periodHeading =
    viewMode === 'month'
      ? formatMonthTitle(cursorDate)
      : viewMode === 'week'
        ? formatWeekTitle(weekMonday)
        : fmtDateWeekdayLong(cursorDate);

  const canRespondToSelectedAssign =
    liveSelectedItem?.kind === 'assign'
      ? isAdmin || canUserViewCalendarEvent(liveSelectedItem.event, account)
      : false;

  return (
    <div className="flex min-h-[calc(100vh-5.5rem)] flex-1 flex-col gap-3">
      {feedback && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 overflow-hidden rounded-xl border px-4 py-3 text-sm ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300'
          }`}
        >
          <span className="min-w-0 break-words">{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="shrink-0 text-xs font-medium underline"
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

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <select
                aria-label="Filter PIC atau Divisi kalender"
                value={adminPicFilter}
                onChange={(e) => setAdminPicFilter(e.target.value)}
                className="min-h-[38px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="ALL">Semua PIC & Divisi ({assignablePics.length})</option>
                <optgroup label="Assign Divisi">
                  {(['stock_accounting', 'gl', 'accounting'] as OperationalRoleId[]).map((rId) => (
                    <option key={`DIV|${rId}`} value={`DIV|${rId}`}>
                      Divisi: {ROLE_LABELS[rId]}
                    </option>
                  ))}
                </optgroup>
                {(['stock_accounting', 'gl', 'accounting'] as OperationalRoleId[]).map((rId) => {
                  const group = assignablePics.filter((p) => p.roleId === rId);
                  if (group.length === 0) return null;
                  return (
                    <optgroup key={rId} label={`PIC · ${ROLE_LABELS[rId]}`}>
                      {group.map((opt) => (
                        <option
                          key={`${opt.roleId}|${opt.picUpper}`}
                          value={`${opt.roleId}|${opt.picUpper}`}
                        >
                          {opt.pic}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            )}

            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
              {(['month', 'week', 'day'] as CalendarViewMode[]).map((mode) => {
                const active = viewMode === mode;
                const label = mode === 'month' ? 'Bulan' : mode === 'week' ? 'Minggu' : 'Hari';
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`min-h-[30px] rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
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

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(true)}
                  className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Upload className="h-3.5 w-3.5 shrink-0" />
                  <span>Upload Assign</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportAssigns}
                  className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Download className="h-3.5 w-3.5 shrink-0" />
                  <span>Ekspor Assign</span>
                </button>
                <button
                  type="button"
                  onClick={() => openCreateModal(cursorDate, undefined, 'assign')}
                  className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  <UserCheck className="h-3.5 w-3.5 shrink-0" />
                  <span>Buat Assign</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />
              <span>Assign Ditugaskan (+1 Kunjungan)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />
              <span>Selesai (Jam Pulang Diisi)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
              <span>Tidak Jadi Pergi (0 Kunjungan)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-violet-600" />
              <span>Reminder Personal</span>
            </span>
          </div>
          <span className="font-mono tabular-nums">
            {visibleAssignEvents.length} assign · {personalReminders.length} reminder personal
          </span>
        </div>
      </section>

      <KalenderGridViews
        viewMode={viewMode}
        today={today}
        cursorDate={cursorDate}
        isAdmin={isAdmin}
        viewerPicUpper={viewerPicUpper}
        monthGridDays={monthGridDays}
        weekDays={weekDays}
        itemsByDate={itemsByDate}
        onSelectItem={setSelectedItem}
        onOpenCreateModal={(d, t) => openCreateModal(d, t)}
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
          isAdmin={isAdmin}
          viewerPicUpper={viewerPicUpper}
          popupItems={itemsByDate.get(dayPopup.date) || []}
          onClose={() => setDayPopup(null)}
          onJumpToDayView={(date) => {
            setDayPopup(null);
            setCursorDate(date);
            setViewMode('day');
          }}
          onSelectItem={(item) => {
            setDayPopup(null);
            setSelectedItem(item);
          }}
          onOpenCreateModal={(date) => openCreateModal(date)}
        />
      )}

      <KalenderDetailModal
        selectedItem={liveSelectedItem}
        isAdmin={isAdmin}
        viewerPicUpper={viewerPicUpper}
        canRespondToAssign={canRespondToSelectedAssign}
        confirmDeleteOpen={confirmDeleteOpen}
        deleteBusy={deleteBusy}
        onClose={() => setSelectedItem(null)}
        onEditAssign={openEditAssignModal}
        onEditPersonal={openEditPersonalModal}
        onUpdateAssignResponse={handleUpdateAssignStatus}
        onOpenConfirmDelete={() => setConfirmDeleteOpen(true)}
        onCancelConfirmDelete={() => setConfirmDeleteOpen(false)}
        onDeleteSingleOccurrence={handleDeleteSingleOccurrence}
        onDeleteSeries={handleDeleteSeries}
      />

      <KalenderFormModal
        open={formOpen}
        isAdmin={isAdmin}
        mode={formMode}
        editingId={editingId}
        busy={busy}
        formError={formError}
        formTitle={formTitle}
        formDate={formDate}
        formStartTime={formStartTime}
        formNotes={formNotes}
        assignablePics={assignablePics}
        allMasterOutlets={allMasterOutlets}
        formAssignScope={formAssignScope}
        formAssignedDivision={formAssignedDivision}
        formAssignedPicKey={formAssignedPicKey}
        formAssignedOutlet={formAssignedOutlet}
        formRepeatFreq={formRepeatFreq}
        formRepeatInterval={formRepeatInterval}
        formRepeatWeekdays={formRepeatWeekdays}
        formRepeatEndMode={formRepeatEndMode}
        formRepeatUntil={formRepeatUntil}
        formExcludedDates={formExcludedDates}
        onClose={() => setFormOpen(false)}
        onChangeMode={(nextMode) => {
          setFormMode(nextMode);
          setFormError(null);
          if (nextMode === 'personal') {
            setFormRepeatFreq('none');
            setFormRepeatInterval(1);
            if (/^\d{4}-\d{2}-\d{2}$/.test(formDate)) {
              setFormRepeatWeekdays([parseUtcDate(formDate).getUTCDay()]);
            }
            setFormRepeatEndMode('never');
            setFormRepeatUntil('');
            setFormExcludedDates([]);
          }
        }}
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
        onChangeAssignScope={(nextScope) => {
          setFormAssignScope(nextScope);
          setFormError(null);
          if (nextScope === 'pic' && !formAssignedPicKey && assignablePics[0]) {
            setFormAssignedPicKey(`${assignablePics[0].roleId}|${assignablePics[0].picUpper}`);
            setFormAssignedOutlet(assignablePics[0].outlets[0] || '');
          }
        }}
        onChangeAssignedDivision={setFormAssignedDivision}
        onChangeAssignedPicKey={handleChangeAssignedPicKey}
        onChangeAssignedOutlet={setFormAssignedOutlet}
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
      />

      {isAdmin && (
        <KalenderAssignUploadModal
          open={uploadModalOpen}
          assignablePics={assignablePics}
          onClose={() => setUploadModalOpen(false)}
          onBulkImport={handleBulkImportAssigns}
        />
      )}
    </div>
  );
}
