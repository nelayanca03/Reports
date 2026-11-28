import {
  CalendarAssignScope,
  CalendarAssignStatus,
  CalendarEvent,
  CalendarRecurrenceFreq,
  OperationalRoleId,
  PersonalReminder,
} from '../../types/outlet';
import { parseUtcDate, shiftIsoDays } from '../../utils/outletLogic';

export type CalendarViewMode = 'month' | 'week' | 'day';
export type CalendarFormMode = 'assign' | 'personal';

export interface CalendarEventFormPayload {
  title: string;
  date: string;
  startTime: string;
  assignScope?: CalendarAssignScope;
  assignedDivision?: OperationalRoleId | '';
  assignedPic: string;
  assignedRole: OperationalRoleId;
  assignedEmail?: string;
  assignedOutlet?: string;
  notes: string;
  assignStatus?: CalendarAssignStatus;
  returnTime?: string;
  cancelReason?: string;
  notificationDismissed?: boolean;
  resetDismissedBy?: boolean;
  visibleTo?: OperationalRoleId[];
  repeatFreq?: CalendarRecurrenceFreq;
  repeatInterval?: number;
  repeatUntil?: string;
  repeatWeekdays?: number[];
  excludedDates?: string[];
}

export const ASSIGN_TITLE_PRESETS = ['Stock Opname', 'Cek Asset', 'Meeting'] as const;
export type AssignTitlePreset = (typeof ASSIGN_TITLE_PRESETS)[number];
export type AssignTitleDropdownValue = AssignTitlePreset | 'custom';

export function formatTimeAmPm(timeHm: string): string {
  const trimmed = (timeHm || '').trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return trimmed;
  const hour24 = Number(match[1]);
  const minutes = match[2];
  if (!Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) return trimmed;
  const period = hour24 >= 12 ? 'pm' : 'am';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minutes === '00' ? `${hour12} ${period}` : `${hour12}:${minutes} ${period}`;
}

export function formatGridItemTitle(item: CalendarGridItem): string {
  if (item.kind === 'personal') return item.title;
  const outlet = (item.event.assignedOutlet || '').trim();
  return outlet ? `${outlet}-${item.title}` : item.title;
}

export function formatGridItemChipLabel(item: CalendarGridItem): string {
  return `${formatTimeAmPm(item.startTime)} ${formatGridItemTitle(item)}`;
}

export interface PersonalReminderFormPayload {
  title: string;
  date: string;
  startTime: string;
  notes: string;
  repeatFreq?: CalendarRecurrenceFreq;
  repeatInterval?: number;
  repeatUntil?: string;
  repeatWeekdays?: number[];
  excludedDates?: string[];
}

export type CalendarGridItem =
  | {
      kind: 'assign';
      key: string;
      occurrenceDate: string;
      startTime: string;
      title: string;
      isRecurring: boolean;
      event: CalendarEvent;
    }
  | {
      kind: 'personal';
      key: string;
      occurrenceDate: string;
      startTime: string;
      title: string;
      isRecurring: boolean;
      reminder: PersonalReminder;
    };

export const WEEKDAY_SHORT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

export const WEEKDAY_DOW_MAP: Array<{ label: string; dow: number }> = [
  { label: 'Sen', dow: 1 },
  { label: 'Sel', dow: 2 },
  { label: 'Rab', dow: 3 },
  { label: 'Kam', dow: 4 },
  { label: 'Jum', dow: 5 },
  { label: 'Sab', dow: 6 },
  { label: 'Min', dow: 0 },
];

export const WEEKDAY_UPPER = ['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'];

export const ALL_DEPARTMENTS: OperationalRoleId[] = ['stock_accounting', 'gl', 'accounting'];

export function getMondayOfWeek(isoDate: string): string {
  const d = parseUtcDate(isoDate);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diffToMon = day === 0 ? -6 : 1 - day;
  return shiftIsoDays(isoDate, diffToMon);
}

export function buildMonthGridDays(anchorIso: string): string[] {
  const d = parseUtcDate(anchorIso);
  const firstOfMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const gridStart = getMondayOfWeek(firstOfMonth);
  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(shiftIsoDays(gridStart, i));
  }
  const targetMonth = firstOfMonth.slice(0, 7);
  if (days.slice(35).every((dayStr) => dayStr.slice(0, 7) !== targetMonth)) {
    return days.slice(0, 35);
  }
  return days;
}

export function formatMonthTitle(isoDate: string): string {
  const d = parseUtcDate(isoDate);
  return d.toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatWeekTitle(mondayIso: string): string {
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
