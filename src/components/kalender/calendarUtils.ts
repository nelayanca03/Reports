import { CalendarRecurrenceFreq, OperationalRoleId } from '../../types/outlet';
import { parseUtcDate, shiftIsoDays } from '../../utils/outletLogic';

export type CalendarViewMode = 'month' | 'week' | 'day';

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
