import {
  AccountProfile,
  AccountRole,
  CalculatedTask,
  CalendarEvent,
  CalendarRecurrenceFreq,
  DayAdjustmentScope,
  DayAdjustmentType,
  EntryItem,
  FormulaType,
  InputLogEntry,
  OperationalRoleId,
  OutletAssignment,
  OutletRecap,
  OutletStoreState,
  RecordDepartment,
  RecordPrefix,
  ResolvedEntry,
  RoleConfig,
  SavedRecord,
  TaskDefinition,
  TaskInputType,
  TaskScheduleMode,
  VisitEntry,
  VisitItem,
  VisitPersonStats,
  WorkingDayAdjustment,
} from '../types/outlet';
import { APP_CONFIG } from '../config/appConfig';

export const ROLE_LABELS: Record<AccountRole, string> = {
  admin: 'Admin',
  stock_accounting: 'Stock Accounting',
  gl: 'GL',
  accounting: 'Accounting',
};

export const OPERATIONAL_ROLES: Array<{ id: OperationalRoleId; label: string }> = [
  { id: 'stock_accounting', label: 'Stock Accounting' },
  { id: 'gl', label: 'GL' },
  { id: 'accounting', label: 'Accounting' },
];

export const DEFAULT_START = APP_CONFIG.defaultStartDate;
export const DEFAULT_NDAYS = APP_CONFIG.defaultWorkingDays;
export const MIN_WORKSPACE_MONTH = APP_CONFIG.minWorkspaceMonth;
export const LEGACY_STORAGE_KEY = 'disc-v1';

export const STOCK_ACCOUNTING_TASKS: TaskDefinition[] = [
  {
    key: 'memo',
    label: 'Memo Penyelesaian Discrepancy',
    shortLabel: 'Memo',
    defaultDate: '',
    inputType: 'month',
    formulaType: 'memo_month',
    toleranceOffset: 1,
    formulaNote: 'Selisih bulan terhadap tanggal kerja + 1',
  },
  {
    key: 'ham',
    label: 'HAM SPC',
    shortLabel: 'HAM SPC',
    defaultDate: '',
    inputType: 'date',
    formulaType: 'daily_plus_1',
    toleranceOffset: 1,
    formulaNote: 'Selisih hari terhadap tanggal kerja + 1',
  },
  {
    key: 'bm',
    label: 'Barang Masuk',
    shortLabel: 'Brg Masuk',
    defaultDate: '',
    inputType: 'date',
    formulaType: 'ref_task',
    refTaskKey: 'ham',
    toleranceOffset: 0,
    formulaNote: 'Selisih hari terhadap tgl update HAM SPC (+0)',
  },
  {
    key: 'jual',
    label: 'Penjualan',
    shortLabel: 'Penjualan',
    defaultDate: '',
    inputType: 'date',
    formulaType: 'daily_plus_1',
    toleranceOffset: 1,
    formulaNote: 'Selisih hari terhadap tanggal kerja + 1',
  },
  {
    key: 'konv',
    label: 'Konversi',
    shortLabel: 'Konversi',
    defaultDate: '',
    inputType: 'date',
    formulaType: 'daily_plus_1',
    toleranceOffset: 1,
    formulaNote: 'Selisih hari terhadap tanggal kerja + 1',
  },
  {
    key: 'bt',
    label: 'BT',
    shortLabel: 'BT',
    defaultDate: '',
    inputType: 'date',
    formulaType: 'daily_plus_1',
    toleranceOffset: 1,
    formulaNote: 'Selisih hari terhadap tanggal kerja + 1',
  },
];

export function getTaskInputType(
  taskDef?: Pick<TaskDefinition, 'inputType' | 'formulaType'>
): TaskInputType {
  if (
    taskDef?.inputType === 'month' ||
    taskDef?.inputType === 'week' ||
    taskDef?.inputType === 'date'
  ) {
    return taskDef.inputType;
  }
  if (taskDef?.formulaType === 'memo_month') return 'month';
  if (taskDef?.formulaType === 'weekly_plus_1') return 'week';
  return 'date';
}

export function getTaskTolerance(taskDef?: Pick<TaskDefinition, 'formulaType' | 'toleranceOffset'>): number {
  if (
    taskDef &&
    typeof taskDef.toleranceOffset === 'number' &&
    !Number.isNaN(taskDef.toleranceOffset)
  ) {
    return taskDef.toleranceOffset;
  }
  return taskDef?.formulaType === 'ref_task' ? 0 : 1;
}

export function buildFormulaNote(
  formulaType: FormulaType,
  toleranceOffset: number,
  refLabel?: string
): string {
  const signed = toleranceOffset >= 0 ? `+ ${toleranceOffset}` : `- ${Math.abs(toleranceOffset)}`;
  if (formulaType === 'memo_month') {
    return `Selisih bulan terhadap tanggal kerja ${signed}`;
  }
  if (formulaType === 'weekly_plus_1') {
    return `Selisih minggu terhadap tanggal kerja ${signed}`;
  }
  if (formulaType === 'ref_task' && refLabel) {
    return toleranceOffset === 0
      ? `Selisih hari terhadap tgl update ${refLabel}`
      : `Selisih hari terhadap tgl update ${refLabel} (${toleranceOffset >= 0 ? `+${toleranceOffset}` : toleranceOffset})`;
  }
  return `Selisih hari terhadap tanggal kerja ${signed}`;
}

export const TASK_WEEKDAY_OPTIONS: Array<{ value: number; short: string; label: string }> = [
  { value: 1, short: 'Sen', label: 'Senin' },
  { value: 2, short: 'Sel', label: 'Selasa' },
  { value: 3, short: 'Rab', label: 'Rabu' },
  { value: 4, short: 'Kam', label: 'Kamis' },
  { value: 5, short: 'Jum', label: 'Jumat' },
  { value: 6, short: 'Sab', label: 'Sabtu' },
];

const TASK_WEEKDAY_SHORT_MAP: Record<number, string> = {
  0: 'Min',
  1: 'Sen',
  2: 'Sel',
  3: 'Rab',
  4: 'Kam',
  5: 'Jum',
  6: 'Sab',
};

export function sanitizeTaskDefinition(raw: unknown): TaskDefinition | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const key = typeof t.key === 'string' ? t.key.trim().slice(0, 40) : '';
  const label = typeof t.label === 'string' ? t.label.trim().slice(0, 100) : '';
  if (!key || !label) return null;
  const shortLabel =
    typeof t.shortLabel === 'string' && t.shortLabel.trim()
      ? t.shortLabel.trim().slice(0, 24)
      : label.slice(0, 24);
  const defaultDate = typeof t.defaultDate === 'string' ? t.defaultDate.trim().slice(0, 10) : '';
  const formulaType: FormulaType =
    t.formulaType === 'weekly_plus_1' ||
    t.formulaType === 'memo_month' ||
    t.formulaType === 'ref_task'
      ? t.formulaType
      : 'daily_plus_1';
  const inputType: TaskInputType | undefined =
    t.inputType === 'date' || t.inputType === 'week' || t.inputType === 'month'
      ? t.inputType
      : undefined;
  const refTaskKey =
    formulaType === 'ref_task' && typeof t.refTaskKey === 'string' && t.refTaskKey.trim()
      ? t.refTaskKey.trim().slice(0, 40)
      : undefined;
  const toleranceOffset =
    typeof t.toleranceOffset === 'number' && Number.isFinite(t.toleranceOffset)
      ? Math.max(-15, Math.min(31, Math.round(t.toleranceOffset)))
      : undefined;
  const formulaNote =
    typeof t.formulaNote === 'string'
      ? t.formulaNote.slice(0, 160)
      : buildFormulaNote(formulaType, toleranceOffset ?? (formulaType === 'ref_task' ? 0 : 1));

  const rawMode = t.scheduleMode;
  const scheduleMode: TaskScheduleMode =
    rawMode === 'weekdays' || rawMode === 'monthly_dates' || rawMode === 'once'
      ? rawMode
      : 'always';

  const scheduleWeekdays =
    scheduleMode === 'weekdays' && Array.isArray(t.scheduleWeekdays)
      ? Array.from(
          new Set(
            t.scheduleWeekdays
              .map((n) => Number(n))
              .filter((n) => Number.isInteger(n) && n >= 1 && n <= 6)
          )
        ).sort((a, b) => a - b)
      : [];

  const scheduleMonthDays =
    scheduleMode === 'monthly_dates' && Array.isArray(t.scheduleMonthDays)
      ? Array.from(
          new Set(
            t.scheduleMonthDays
              .map((n) => Number(n))
              .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31)
          )
        ).sort((a, b) => a - b)
      : [];

  const scheduleDates =
    scheduleMode === 'once' && Array.isArray(t.scheduleDates)
      ? Array.from(
          new Set(
            t.scheduleDates
              .filter(
                (d): d is string =>
                  typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())
              )
              .map((d) => d.trim())
          )
        )
          .sort()
          .slice(0, 31)
      : [];

  const scheduleRepeatEnd =
    (scheduleMode === 'weekdays' || scheduleMode === 'monthly_dates') &&
    typeof t.scheduleRepeatEnd === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(t.scheduleRepeatEnd.trim())
      ? t.scheduleRepeatEnd.trim()
      : '';

  const effectiveMode: TaskScheduleMode =
    scheduleMode === 'weekdays' && scheduleWeekdays.length === 0
      ? 'always'
      : scheduleMode === 'monthly_dates' && scheduleMonthDays.length === 0
        ? 'always'
        : scheduleMode === 'once' && scheduleDates.length === 0
          ? 'always'
          : scheduleMode;

  return {
    key,
    label,
    shortLabel,
    defaultDate,
    ...(inputType ? { inputType } : {}),
    formulaType,
    ...(refTaskKey ? { refTaskKey } : {}),
    ...(toleranceOffset !== undefined ? { toleranceOffset } : {}),
    formulaNote,
    ...(effectiveMode !== 'always' ? { scheduleMode: effectiveMode } : {}),
    ...(effectiveMode === 'weekdays' ? { scheduleWeekdays } : {}),
    ...(effectiveMode === 'monthly_dates' ? { scheduleMonthDays } : {}),
    ...(effectiveMode === 'once' ? { scheduleDates } : {}),
    ...(scheduleRepeatEnd && (effectiveMode === 'weekdays' || effectiveMode === 'monthly_dates')
      ? { scheduleRepeatEnd }
      : {}),
  };
}

export function sanitizeTaskDefinitions(raw: unknown): TaskDefinition[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const list: TaskDefinition[] = [];
  for (const item of raw) {
    const clean = sanitizeTaskDefinition(item);
    if (!clean || seen.has(clean.key)) continue;
    seen.add(clean.key);
    list.push(clean);
    if (list.length >= 30) break;
  }
  return list;
}

export function isCustomScheduledTask(task?: TaskDefinition | null): boolean {
  if (!task) return false;
  return (
    task.scheduleMode === 'weekdays' ||
    task.scheduleMode === 'monthly_dates' ||
    task.scheduleMode === 'once'
  );
}

export function isTaskScheduledOnDay(
  task: TaskDefinition | undefined | null,
  dayIso: string
): boolean {
  if (!task) return false;
  const mode = task.scheduleMode || 'always';
  if (mode === 'always') return true;
  if (!dayIso || !/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) return false;

  if (mode === 'once') {
    const dates = task.scheduleDates || [];
    if (dates.length === 0) return true;
    return dates.includes(dayIso);
  }

  if (task.scheduleRepeatEnd && /^\d{4}-\d{2}-\d{2}$/.test(task.scheduleRepeatEnd)) {
    if (dayIso > task.scheduleRepeatEnd) return false;
  }

  const parsed = parseUtcDate(dayIso);
  if (Number.isNaN(parsed.getTime())) return false;

  if (mode === 'weekdays') {
    const weekdays = task.scheduleWeekdays || [];
    if (weekdays.length === 0) return true;
    return weekdays.includes(parsed.getUTCDay());
  }

  if (mode === 'monthly_dates') {
    const monthDays = task.scheduleMonthDays || [];
    if (monthDays.length === 0) return true;
    const year = parsed.getUTCFullYear();
    const monthIdx = parsed.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
    const dom = parsed.getUTCDate();
    return monthDays.some((target) => Math.min(target, daysInMonth) === dom);
  }

  return true;
}

export function getLatestScheduledDayOnOrBefore(
  task: TaskDefinition | undefined | null,
  dayIso: string,
  minDateIso?: string
): string | null {
  if (!task || !isCustomScheduledTask(task)) return null;
  if (!dayIso || !/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) return null;

  const floorIso =
    minDateIso && /^\d{4}-\d{2}-\d{2}$/.test(minDateIso)
      ? minDateIso
      : `${MIN_WORKSPACE_MONTH}-01`;

  if (task.scheduleMode === 'once') {
    const dates = (task.scheduleDates || [])
      .filter((d) => d >= floorIso && d <= dayIso && !isSunday(d))
      .sort();
    return dates.length > 0 ? dates[dates.length - 1] : null;
  }

  let cursor = dayIso;
  let guard = 0;
  while (cursor >= floorIso && guard < 45) {
    if (!isSunday(cursor) && isTaskScheduledOnDay(task, cursor)) {
      return cursor;
    }
    cursor = shiftIsoDays(cursor, -1);
    guard++;
  }
  return null;
}

export function isTaskActiveOnDay(
  task: TaskDefinition | undefined | null,
  dayIso: string,
  state?: OutletStoreState,
  outlet?: string
): boolean {
  if (!task) return false;
  if (!isCustomScheduledTask(task)) return true;
  if (!dayIso || !/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) return false;

  if (isTaskScheduledOnDay(task, dayIso)) return true;

  if (!state || !outlet) return false;
  if (isSunday(dayIso)) return false;

  const outletMap = state.ent?.[outlet] || {};
  const ownEntry = outletMap[`${dayIso}|${task.key}`];
  if (ownEntry && (ownEntry.d || ownEntry.n)) {
    return true;
  }

  const latestScheduledDay = getLatestScheduledDayOnOrBefore(task, dayIso, state.start);
  if (!latestScheduledDay || latestScheduledDay >= dayIso) {
    return false;
  }

  let cursor = latestScheduledDay;
  let guard = 0;
  while (cursor < dayIso && guard < 45) {
    const entry = outletMap[`${cursor}|${task.key}`];
    if (entry && entry.d) {
      return false;
    }
    cursor = shiftIsoDays(cursor, 1);
    guard++;
  }

  return true;
}

export function getActiveTasksForDay(
  tasks: TaskDefinition[],
  dayIso: string,
  state?: OutletStoreState,
  outlet?: string
): TaskDefinition[] {
  return tasks.filter((t) => isTaskActiveOnDay(t, dayIso, state, outlet));
}

export function isScheduledTaskExpired(
  task: TaskDefinition,
  today: string = todayIso()
): boolean {
  const mode = task.scheduleMode || 'always';
  if (mode === 'once') {
    const dates = task.scheduleDates || [];
    if (dates.length === 0) return false;
    const latest = dates[dates.length - 1];
    return Boolean(latest && latest < today);
  }
  if (
    (mode === 'weekdays' || mode === 'monthly_dates') &&
    task.scheduleRepeatEnd &&
    /^\d{4}-\d{2}-\d{2}$/.test(task.scheduleRepeatEnd)
  ) {
    return task.scheduleRepeatEnd < today;
  }
  return false;
}

export function formatTaskScheduleLabel(task: TaskDefinition): string {
  const mode = task.scheduleMode || 'always';
  if (mode === 'always') return 'Setiap Hari Kerja';
  if (mode === 'weekdays') {
    const daysText = (task.scheduleWeekdays || [])
      .map((d) => TASK_WEEKDAY_SHORT_MAP[d] || String(d))
      .join(', ');
    const base = daysText ? `Berulang · Tiap ${daysText}` : 'Setiap Hari Kerja';
    return task.scheduleRepeatEnd ? `${base} (s.d. ${fmtDateLong(task.scheduleRepeatEnd)})` : base;
  }
  if (mode === 'monthly_dates') {
    const doms = task.scheduleMonthDays || [];
    const domText =
      doms.length > 5
        ? `${doms.slice(0, 4).join(', ')} +${doms.length - 4}`
        : doms.join(', ');
    const base = domText ? `Berulang · Tiap Tgl ${domText}` : 'Setiap Hari Kerja';
    return task.scheduleRepeatEnd ? `${base} (s.d. ${fmtDateLong(task.scheduleRepeatEnd)})` : base;
  }
  const dates = task.scheduleDates || [];
  if (dates.length === 0) return 'Setiap Hari Kerja';
  if (dates.length === 1) {
    return `Sekali Muncul · ${fmtDateFull(dates[0])}`;
  }
  const preview = dates
    .slice(0, 2)
    .map((d) => fmtDateLong(d))
    .join(', ');
  return dates.length > 2
    ? `Sekali Muncul · ${preview} (+${dates.length - 2})`
    : `Sekali Muncul · ${preview}`;
}

export function nextDateForWeekday(weekday: number, fromIso: string = todayIso()): string {
  const base = parseUtcDate(fromIso);
  if (Number.isNaN(base.getTime())) return fromIso;
  const currentDow = base.getUTCDay();
  const delta = (weekday - currentDow + 7) % 7;
  base.setUTCDate(base.getUTCDate() + delta);
  return toIsoUtc(base);
}

export const STOCK_ACCOUNTING_OUTLETS: OutletAssignment[] = [
  { person: 'PETER', code: 'NKPM' },
  { person: 'PETER', code: 'DELICA' },
  { person: 'PETER', code: 'DLS' },
  { person: 'PETER', code: 'NUANSA' },
  { person: 'MELVIN', code: 'NKMHT' },
  { person: 'MELVIN', code: 'NSCMB' },
  { person: 'MELVIN', code: 'J2MRLN' },
  { person: 'MELVIN', code: 'J2MF' },
  { person: 'EDBERT', code: 'NIS' },
  { person: 'EDBERT', code: 'MJ' },
  { person: 'EDBERT', code: 'JKRCW' },
  { person: 'EDBERT', code: 'BSM' },
  { person: 'EDBERT', code: 'NBC' },
  { person: 'CHARLES', code: 'SKCP' },
  { person: 'CHARLES', code: 'NSCP' },
  { person: 'CHARLES', code: 'NCBC' },
];

export const DEFAULT_ROLE_CONFIGS: Record<OperationalRoleId, RoleConfig> = {
  stock_accounting: {
    roleId: 'stock_accounting',
    label: 'Stock Accounting',
    start: DEFAULT_START,
    ndays: DEFAULT_NDAYS,
    tasks: STOCK_ACCOUNTING_TASKS,
    outlets: STOCK_ACCOUNTING_OUTLETS,
  },
  gl: {
    roleId: 'gl',
    label: 'GL',
    start: DEFAULT_START,
    ndays: DEFAULT_NDAYS,
    tasks: [],
    outlets: [],
  },
  accounting: {
    roleId: 'accounting',
    label: 'Accounting',
    start: DEFAULT_START,
    ndays: DEFAULT_NDAYS,
    tasks: [],
    outlets: [],
  },
};

export function getPeopleMap(outlets: OutletAssignment[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const item of outlets) {
    if (!map[item.person]) {
      map[item.person] = [];
    }
    if (!map[item.person].includes(item.code)) {
      map[item.person].push(item.code);
    }
  }
  return map;
}

export function getPersonList(outlets: OutletAssignment[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const item of outlets) {
    if (!seen.has(item.person)) {
      seen.add(item.person);
      list.push(item.person);
    }
  }
  return list;
}

export function parseUtcDate(isoStr: string): Date {
  return new Date(`${isoStr}T00:00:00Z`);
}

export function toIsoUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseUtcDate(a).getTime() - parseUtcDate(b).getTime()) / 864e5);
}

export function workingDayIndex(isoStr: string): number {
  const dayNum = Math.floor(parseUtcDate(isoStr).getTime() / 864e5);
  return dayNum - Math.floor((dayNum + 4) / 7);
}

export function diffWorkingDays(a: string, b: string): number {
  return workingDayIndex(a) - workingDayIndex(b);
}

export function isSunday(isoStr: string): boolean {
  if (!isoStr) return false;
  const d = parseUtcDate(isoStr);
  return !Number.isNaN(d.getTime()) && d.getUTCDay() === 0;
}

export function shiftIsoDays(isoStr: string, offsetDays: number): string {
  const d = parseUtcDate(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return toIsoUtc(d);
}

export function prevWorkingDay(isoStr: string): string {
  const prev = shiftIsoDays(isoStr, -1);
  return isSunday(prev) ? shiftIsoDays(prev, -1) : prev;
}

export function shiftWorkingDays(isoStr: string, offsetWorkingDays: number): string {
  if (!isoStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return isoStr;
  let cursor = isSunday(isoStr) ? prevWorkingDay(isoStr) : isoStr;
  const steps = Math.trunc(offsetWorkingDays);
  if (steps === 0) return cursor;
  if (steps < 0) {
    const count = Math.min(120, Math.abs(steps));
    for (let i = 0; i < count; i++) {
      cursor = prevWorkingDay(cursor);
    }
    return cursor;
  }
  const count = Math.min(120, steps);
  for (let i = 0; i < count; i++) {
    const next = shiftIsoDays(cursor, 1);
    cursor = isSunday(next) ? shiftIsoDays(next, 1) : next;
  }
  return cursor;
}

export function getTaskQuickSetTargetDate(
  taskDef: TaskDefinition,
  selectedDay: string,
  today: string = todayIso(),
  refDate?: string
): string {
  const inputType = getTaskInputType(taskDef);
  const tol = getTaskTolerance(taskDef);
  const anchorDay =
    selectedDay && /^\d{4}-\d{2}-\d{2}$/.test(selectedDay) ? selectedDay : today;

  if (inputType === 'month' || taskDef.formulaType === 'memo_month') {
    const targetMonth = shiftMonthKey(anchorDay.slice(0, 7), -tol);
    const maxMonth = today.slice(0, 7);
    const clampedMonth = targetMonth > maxMonth ? maxMonth : targetMonth;
    return `${clampedMonth}-01`;
  }

  if (inputType === 'week' || taskDef.formulaType === 'weekly_plus_1') {
    const targetMonday = shiftIsoDays(weekStartIso(anchorDay), -tol * 7);
    const maxMonday = weekStartIso(today);
    return targetMonday > maxMonday ? maxMonday : targetMonday;
  }

  const baseDate =
    taskDef.formulaType === 'ref_task' && refDate && /^\d{4}-\d{2}-\d{2}$/.test(refDate)
      ? refDate
      : anchorDay;
  const targetDate = shiftWorkingDays(baseDate, -tol);
  return targetDate > today ? today : targetDate;
}

export function toWibIsoDate(isoTimestamp?: string): string {
  if (!isoTimestamp) return '';
  const ms = Date.parse(isoTimestamp);
  if (Number.isNaN(ms)) return '';
  return new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function toWibTimeString(isoTimestamp?: string): string {
  if (!isoTimestamp) return '';
  const ms = Date.parse(isoTimestamp);
  if (Number.isNaN(ms)) return '';
  const wib = new Date(ms + 7 * 3600 * 1000);
  const hh = String(wib.getUTCHours()).padStart(2, '0');
  const mm = String(wib.getUTCMinutes()).padStart(2, '0');
  const ss = String(wib.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function todayIso(nowMs: number = Date.now()): string {
  return new Date(nowMs + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function yesterdayIso(): string {
  return shiftIsoDays(todayIso(), -1);
}

export function prevMonthFirstDay(isoStr: string): string {
  const d = parseUtcDate(isoStr.length === 7 ? `${isoStr}-01` : isoStr);
  if (Number.isNaN(d.getTime())) return `${isoStr.slice(0, 7)}-01`;
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return toIsoUtc(d);
}

export function weekStartIso(isoStr: string): string {
  const raw = (isoStr || '').trim();
  const isoWeekMatch = /^(\d{4})-W(\d{2})$/.exec(raw);
  if (isoWeekMatch) {
    const year = Number(isoWeekMatch[1]);
    const weekNum = Number(isoWeekMatch[2]);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Dow = jan4.getUTCDay() || 7;
    const week1Mon = new Date(jan4.getTime() + (1 - jan4Dow) * 864e5);
    const targetMon = new Date(week1Mon.getTime() + (weekNum - 1) * 7 * 864e5);
    return toIsoUtc(targetMon);
  }
  const normalized = raw.length === 7 ? `${raw}-01` : raw;
  const d = parseUtcDate(normalized);
  if (Number.isNaN(d.getTime())) return raw;
  const dow = d.getUTCDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  return shiftIsoDays(normalized, diffToMon);
}

export function prevWeekMonday(isoStr: string): string {
  return shiftIsoDays(weekStartIso(isoStr), -7);
}

export function currentMonthKey(today: string = todayIso()): string {
  return /^\d{4}-\d{2}/.test(today) ? today.slice(0, 7) : MIN_WORKSPACE_MONTH;
}

export function shiftMonthKey(monthKey: string, offsetMonths: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return MIN_WORKSPACE_MONTH;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1 + offsetMonths;
  const d = new Date(Date.UTC(year, monthIdx, 1));
  return d.toISOString().slice(0, 7);
}

export function getPastMonths(today: string = todayIso()): string[] {
  const cur = currentMonthKey(today);
  if (cur <= MIN_WORKSPACE_MONTH) return [];
  const result: string[] = [];
  let cursor = MIN_WORKSPACE_MONTH;
  let safety = 0;
  while (cursor < cur && safety < 60) {
    result.push(cursor);
    cursor = shiftMonthKey(cursor, 1);
    safety++;
  }
  return result;
}

export function getSelectableMonths(
  today: string = todayIso(),
  extraMonths: string[] = [],
  openUntilMonth?: string,
  options?: {
    isAdmin?: boolean;
    unlockedPastMonths?: string[];
  }
): string[] {
  const cur = currentMonthKey(today);
  const isAdmin = options?.isAdmin ?? true;
  const unlockedPast = new Set(
    (options?.unlockedPastMonths || []).filter(
      (m) => /^\d{4}-\d{2}$/.test(m) && m < cur
    )
  );

  const startMonth = cur < MIN_WORKSPACE_MONTH ? cur : MIN_WORKSPACE_MONTH;
  const autoMax = shiftMonthKey(cur > MIN_WORKSPACE_MONTH ? cur : MIN_WORKSPACE_MONTH, 1);
  const capMax = shiftMonthKey(startMonth, 48);
  const customMax =
    openUntilMonth && /^\d{4}-\d{2}$/.test(openUntilMonth)
      ? openUntilMonth > capMax
        ? capMax
        : openUntilMonth
      : '';
  const maxMonth = customMax && customMax > autoMax ? customMax : autoMax;

  const set = new Set<string>();
  let cursor = startMonth;
  let safety = 0;
  while (cursor <= maxMonth && safety < 60) {
    if (cursor >= cur || isAdmin || unlockedPast.has(cursor)) {
      set.add(cursor);
    }
    cursor = shiftMonthKey(cursor, 1);
    safety++;
  }

  for (const m of extraMonths) {
    if (/^\d{4}-\d{2}$/.test(m) && (m >= cur || isAdmin || unlockedPast.has(m))) {
      set.add(m);
    }
  }

  // Current calendar month must always remain open
  if (/^\d{4}-\d{2}$/.test(cur)) {
    set.add(cur);
  }

  return Array.from(set).sort();
}

export function formatPicTitle(person: string): string {
  return person
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function fmtDate(isoStr: string): string {
  if (!isoStr) return '—';
  const normalized = isoStr.length === 7 ? `${isoStr}-01` : isoStr;
  const d = parseUtcDate(normalized);
  if (Number.isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function fmtMonth(isoStr: string): string {
  if (!isoStr) return '—';
  const normalized = isoStr.length === 7 ? `${isoStr}-01` : isoStr;
  const d = parseUtcDate(normalized);
  if (Number.isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('id-ID', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function fmtDateLong(isoStr: string): string {
  if (!isoStr) return '—';
  const normalized = isoStr.length === 7 ? `${isoStr}-01` : isoStr;
  const d = parseUtcDate(normalized);
  if (Number.isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function fmtWeek(isoStr: string): string {
  if (!isoStr) return '—';
  const monIso = weekStartIso(isoStr);
  const monDate = parseUtcDate(monIso);
  if (Number.isNaN(monDate.getTime())) return isoStr;
  const satIso = shiftIsoDays(monIso, 5);
  const satDate = parseUtcDate(satIso);
  const monDay = String(monDate.getUTCDate()).padStart(2, '0');
  if (monIso.slice(0, 7) === satIso.slice(0, 7)) {
    const satPart = satDate.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return `${monDay}–${satPart}`;
  }
  if (monIso.slice(0, 4) === satIso.slice(0, 4)) {
    const monPart = monDate.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    });
    const satPart = satDate.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return `${monPart}–${satPart}`;
  }
  return `${fmtDateLong(monIso)}–${fmtDateLong(satIso)}`;
}

export function fmtWeekShort(isoStr: string): string {
  if (!isoStr) return '—';
  const monIso = weekStartIso(isoStr);
  const monDate = parseUtcDate(monIso);
  if (Number.isNaN(monDate.getTime())) return isoStr;
  const satIso = shiftIsoDays(monIso, 5);
  const satDate = parseUtcDate(satIso);
  const monDay = String(monDate.getUTCDate()).padStart(2, '0');
  if (monIso.slice(0, 7) === satIso.slice(0, 7)) {
    const satPart = satDate.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    });
    return `${monDay}–${satPart}`;
  }
  const satDay = String(satDate.getUTCDate()).padStart(2, '0');
  return `${monDay}/${monIso.slice(5, 7)}–${satDay}/${satIso.slice(5, 7)}`;
}

export function formatTaskDateByType(
  inputType: TaskInputType,
  isoStr: string,
  variant: 'short' | 'long' = 'short'
): string {
  if (!isoStr) return '—';
  if (inputType === 'month') return fmtMonth(isoStr);
  if (inputType === 'week') {
    return variant === 'short' ? fmtWeekShort(isoStr) : fmtWeek(isoStr);
  }
  return variant === 'long' ? fmtDateLong(isoStr) : fmtDate(isoStr);
}

export function buildSelectableWeeks(
  startIso: string,
  maxIso: string,
  extraDates: string[] = []
): Array<{ value: string; label: string }> {
  const maxMon = weekStartIso(maxIso || todayIso());
  const baseStart = startIso && startIso < maxMon ? startIso : maxMon;
  const earliestMon = shiftIsoDays(weekStartIso(baseStart), -12 * 7);
  const weekSet = new Set<string>();

  let cursor = earliestMon;
  let safety = 0;
  while (cursor <= maxMon && safety < 260) {
    weekSet.add(cursor);
    cursor = shiftIsoDays(cursor, 7);
    safety++;
  }
  weekSet.add(maxMon);

  for (const extra of extraDates) {
    if (!extra) continue;
    const normalized = weekStartIso(extra);
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      weekSet.add(normalized);
    }
  }

  return Array.from(weekSet)
    .sort((a, b) => b.localeCompare(a))
    .map((mon) => ({
      value: mon,
      label: fmtWeek(mon),
    }));
}

export function fmtDateFull(isoStr: string): string {
  if (!isoStr) return '—';
  const d = parseUtcDate(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('id-ID', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function fmtDateWeekdayLong(isoStr: string): string {
  if (!isoStr) return '—';
  const d = parseUtcDate(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function fmtDateTimeWithSeconds(isoTimestamp?: string): string {
  if (!isoTimestamp) return '';
  const ms = Date.parse(isoTimestamp);
  if (Number.isNaN(ms)) return '';
  const wib = new Date(ms + 7 * 3600 * 1000);
  const datePart = wib.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const hh = String(wib.getUTCHours()).padStart(2, '0');
  const mm = String(wib.getUTCMinutes()).padStart(2, '0');
  const ss = String(wib.getUTCSeconds()).padStart(2, '0');
  return `${datePart}, ${hh}:${mm}:${ss}`;
}

export function buildWorkingDays(start: string = DEFAULT_START, count: number = DEFAULT_NDAYS): string[] {
  const result: string[] = [];
  let cursor = parseUtcDate(start || DEFAULT_START);
  if (Number.isNaN(cursor.getTime())) {
    cursor = parseUtcDate(DEFAULT_START);
  }
  let safety = 0;
  const targetCount = Math.max(1, Math.min(60, count || DEFAULT_NDAYS));
  while (result.length < targetCount && safety < 240) {
    if (cursor.getUTCDay() !== 0) {
      result.push(toIsoUtc(cursor));
    }
    cursor = new Date(cursor.getTime() + 864e5);
    safety++;
  }
  return result;
}

export function buildMonthWorkingDays(monthKey: string): string[] {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return [];
  const year = Number(match[1]);
  const monthNum = Number(match[2]);
  if (monthNum < 1 || monthNum > 12) return [];
  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const result: string[] = [];
  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
    const d = new Date(Date.UTC(year, monthNum - 1, dayNum));
    if (d.getUTCDay() !== 0) {
      result.push(toIsoUtc(d));
    }
  }
  return result;
}

export function buildMonthsWorkingDays(monthKeys: string[]): string[] {
  const set = new Set<string>();
  for (const m of monthKeys) {
    for (const d of buildMonthWorkingDays(m)) {
      set.add(d);
    }
  }
  return Array.from(set).sort();
}

export function mergeWorkspaceStates(
  ...states: Array<Partial<OutletStoreState> | undefined>
): OutletStoreState {
  const ent: OutletStoreState['ent'] = {};
  const visit: OutletStoreState['visit'] = {};
  let start = DEFAULT_START;

  for (const st of states) {
    if (!st) continue;
    if (st.start) start = st.start;
    if (st.ent) {
      for (const [outlet, outletMap] of Object.entries(st.ent)) {
        if (!ent[outlet]) ent[outlet] = {};
        Object.assign(ent[outlet], outletMap);
      }
    }
    if (st.visit) {
      Object.assign(visit, st.visit);
    }
  }

  return { ent, visit, start };
}

export function nearestWorkingDay(days: string[], targetIso: string): string {
  if (!days.length) return targetIso;
  const eligible = days.filter((d) => d <= targetIso);
  return eligible.length ? eligible[eligible.length - 1] : days[0];
}

export function isOutletDayFilled(
  state: OutletStoreState,
  tasks: TaskDefinition[],
  outlet: string,
  day: string
): boolean {
  if (!outlet || !day) return false;
  const outletMap = state.ent[outlet];
  if (!outletMap) return false;
  const activeTasks = getActiveTasksForDay(tasks, day, state, outlet);
  return activeTasks.some((t) => {
    const entry = outletMap[`${day}|${t.key}`];
    return Boolean(entry && (entry.d || entry.n));
  });
}

export function canEditOutletDay(
  state: OutletStoreState,
  tasks: TaskDefinition[],
  days: string[],
  outlet: string,
  day: string,
  today: string = todayIso(),
  isAdmin: boolean = false
): boolean {
  if (!day || !days.includes(day)) return false;
  if (isSunday(day)) return false;
  if (day > today) return false;
  if (isAdmin) return true;
  if (day === today) return true;
  return !isOutletDayFilled(state, tasks, outlet, day);
}

export function getEntry(
  state: OutletStoreState,
  days: string[],
  tasks: TaskDefinition[],
  outlet: string,
  day: string,
  taskKey: string
): ResolvedEntry {
  const outletMap = state.ent[outlet] || {};
  const ownEntry: EntryItem | undefined = outletMap[`${day}|${taskKey}`];
  const taskDef = tasks.find((t) => t.key === taskKey);
  const cycleFloorDay =
    taskDef && isCustomScheduledTask(taskDef)
      ? getLatestScheduledDayOnOrBefore(taskDef, day, state.start) || day
      : '';

  const idx = days.indexOf(day);
  for (let k = idx; k >= 0; k--) {
    const candidateDay = days[k];
    if (cycleFloorDay && candidateDay < cycleFloorDay) break;
    const e: EntryItem | undefined = outletMap[`${candidateDay}|${taskKey}`];
    if (e && e.d) {
      const isOwn = k === idx;
      return {
        d: e.d,
        n: isOwn ? e.n || '' : ownEntry?.n || '',
        ts: e.ts,
        byAdmin: e.byAdmin,
        own: isOwn,
        source: isOwn ? 'own' : 'inherited',
        sourceDay: candidateDay,
      };
    }
  }

  // Cross-month carry-over: if no entry exists in the active month's days up to `day`,
  // inherit the chronologically latest saved entry before `day` (e.g., from previous month).
  if (day) {
    const suffix = `|${taskKey}`;
    let bestDay = '';
    let bestEntry: EntryItem | undefined;
    for (const [k, e] of Object.entries(outletMap)) {
      if (!k.endsWith(suffix) || !e?.d) continue;
      const entryDay = k.slice(0, k.length - suffix.length);
      if (cycleFloorDay && entryDay < cycleFloorDay) continue;
      if (/^\d{4}-\d{2}-\d{2}$/.test(entryDay) && entryDay < day && entryDay > bestDay) {
        bestDay = entryDay;
        bestEntry = e;
      }
    }
    if (bestEntry && bestDay) {
      return {
        d: bestEntry.d,
        n: ownEntry?.n || '',
        ts: bestEntry.ts,
        byAdmin: bestEntry.byAdmin,
        own: false,
        source: 'inherited',
        sourceDay: bestDay,
      };
    }
  }

  return {
    d: '',
    n: ownEntry?.n || '',
    ts: ownEntry?.ts,
    byAdmin: ownEntry?.byAdmin,
    own: Boolean(ownEntry && (ownEntry.d || ownEntry.n)),
    source: 'default',
  };
}

export function calcTask(
  state: OutletStoreState,
  days: string[],
  tasks: TaskDefinition[],
  outlet: string,
  day: string,
  taskKey: string,
  today: string = todayIso()
): CalculatedTask {
  const resolved = getEntry(state, days, tasks, outlet, day, taskKey);
  const taskDef = tasks.find((t) => t.key === taskKey);
  const formulaType = taskDef?.formulaType || 'daily_plus_1';
  const tol = getTaskTolerance(taskDef);

  const periodStart = days[0] && days[0] <= day ? days[0] : `${day.slice(0, 7)}-01`;
  const daysSincePeriodStart = isCustomScheduledTask(taskDef)
    ? Math.max(
        1,
        days.filter(
          (d) => d <= day && !isSunday(d) && isTaskActiveOnDay(taskDef, d, state, outlet)
        ).length
      )
    : Math.max(1, diffWorkingDays(day, periodStart) + 1);

  let rumus: string;
  let pm: number;
  let backfillDays = 0;

  if (formulaType === 'memo_month') {
    const anchorDay = day || today;
    rumus = anchorDay;
    if (!resolved.d) {
      pm = -daysSincePeriodStart;
    } else {
      const normalizedD = resolved.d.length === 7 ? `${resolved.d}-01` : resolved.d;
      const todayMonth = today.slice(0, 7);
      const effectiveD =
        normalizedD.slice(0, 7) > todayMonth ? `${todayMonth}-01` : normalizedD;
      const a = parseUtcDate(effectiveD);
      const b = parseUtcDate(anchorDay.length === 7 ? `${anchorDay}-01` : anchorDay);
      pm = (a.getUTCFullYear() - b.getUTCFullYear()) * 12 + a.getUTCMonth() - b.getUTCMonth() + tol;
    }
  } else if (formulaType === 'weekly_plus_1') {
    const anchorMonday = weekStartIso(day || today);
    rumus = anchorMonday;
    if (!resolved.d) {
      pm = -daysSincePeriodStart;
    } else {
      const rawWeekMonday = weekStartIso(resolved.d);
      const todayWeekMonday = weekStartIso(today);
      const effectiveWeekMonday =
        rawWeekMonday > todayWeekMonday ? todayWeekMonday : rawWeekMonday;
      const weeksDiff = Math.round(diffDays(effectiveWeekMonday, anchorMonday) / 7);
      pm = weeksDiff + tol;
    }
  } else if (formulaType === 'ref_task' && taskDef?.refTaskKey) {
    const refResolved = getEntry(state, days, tasks, outlet, day, taskDef.refTaskKey);
    const rawRef = refResolved.d || '';
    const clampedRef = rawRef && rawRef.slice(0, 10) > today ? today : rawRef;
    rumus = clampedRef;
    if (!resolved.d) {
      pm = -daysSincePeriodStart;
    } else {
      const normalizedD = resolved.d.length === 7 ? `${resolved.d}-01` : resolved.d;
      const effectiveD = normalizedD > today ? today : normalizedD;
      if (!clampedRef) {
        pm = diffWorkingDays(effectiveD, day) + tol;
      } else {
        const normalizedRef = clampedRef.length === 7 ? `${clampedRef}-01` : clampedRef;
        pm = diffWorkingDays(effectiveD, normalizedRef) + tol;
      }
    }
  } else {
    rumus = day;
    if (!resolved.d) {
      pm = -daysSincePeriodStart;
    } else {
      const normalizedD = resolved.d.length === 7 ? `${resolved.d}-01` : resolved.d;
      const effectiveD = normalizedD > today ? today : normalizedD;
      pm = diffWorkingDays(effectiveD, rumus) + tol;
    }
  }

  if (
    resolved.d &&
    resolved.source === 'own' &&
    resolved.sourceDay &&
    resolved.ts &&
    !resolved.byAdmin
  ) {
    const tsWibDate = toWibIsoDate(resolved.ts);
    if (tsWibDate && tsWibDate > resolved.sourceDay) {
      const lateWorkingDays = diffWorkingDays(tsWibDate, resolved.sourceDay) - 1;
      if (lateWorkingDays > 0) {
        backfillDays = lateWorkingDays;
        pm = Math.min(pm, -backfillDays);
      }
    }
  }

  return {
    ...resolved,
    task: taskKey,
    label: taskDef?.label || taskKey,
    rumus,
    pm,
    pend: !resolved.d || pm < 0,
    ...(backfillDays > 0 ? { backfillDays } : {}),
  };
}

export const DAY_ADJUSTMENT_TYPE_LABELS: Record<DayAdjustmentType, string> = {
  off_day: 'Off Day',
  cuti_izin: 'Cuti / Izin',
  cuti_bersama: 'Cuti Bersama',
  libur_nasional: 'Libur Nasional',
};

export const DAY_ADJUSTMENT_SHORT_LABELS: Record<DayAdjustmentType, string> = {
  off_day: 'OFF',
  cuti_izin: 'CUTI',
  cuti_bersama: 'CB',
  libur_nasional: 'LIBUR',
};

export const DAY_ADJUSTMENT_SCOPE_LABELS: Record<DayAdjustmentScope, string> = {
  person: 'Per Personil (PIC)',
  role: 'Per Divisi',
  all: 'Semua Orang (Semua Divisi)',
};

const VALID_DAY_ADJ_TYPES = new Set<DayAdjustmentType>([
  'off_day',
  'cuti_izin',
  'cuti_bersama',
  'libur_nasional',
]);
const VALID_DAY_ADJ_SCOPES = new Set<DayAdjustmentScope>(['person', 'role', 'all']);

export function parseDayAdjustments(raw: unknown): WorkingDayAdjustment[] {
  if (!Array.isArray(raw)) return [];
  const seenIds = new Set<string>();
  const result: WorkingDayAdjustment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim().slice(0, 64) : '';
    const type = rec.type as DayAdjustmentType;
    const scope = rec.scope as DayAdjustmentScope;
    const rawFrom = typeof rec.dateFrom === 'string' ? rec.dateFrom.trim() : '';
    const rawTo = typeof rec.dateTo === 'string' ? rec.dateTo.trim() : '';
    if (
      !id ||
      seenIds.has(id) ||
      !VALID_DAY_ADJ_TYPES.has(type) ||
      !VALID_DAY_ADJ_SCOPES.has(scope) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(rawTo)
    ) {
      continue;
    }
    const dateFrom = rawFrom <= rawTo ? rawFrom : rawTo;
    const dateTo = rawFrom <= rawTo ? rawTo : rawFrom;
    const pic =
      scope === 'person' && typeof rec.pic === 'string'
        ? rec.pic.trim().toUpperCase().slice(0, 60)
        : '';
    if (scope === 'person' && !pic) continue;
    const note = typeof rec.note === 'string' ? rec.note.trim().slice(0, 100) : '';
    seenIds.add(id);
    result.push({
      id,
      type,
      scope,
      ...(scope === 'person' ? { pic } : {}),
      dateFrom,
      dateTo,
      ...(note ? { note } : {}),
    });
    if (result.length >= 200) break;
  }
  return result.sort(
    (a, b) => b.dateFrom.localeCompare(a.dateFrom) || a.id.localeCompare(b.id)
  );
}

export function countWorkingDaysInRange(dateFrom: string, dateTo: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return 0;
  }
  const startIso = dateFrom <= dateTo ? dateFrom : dateTo;
  const endIso = dateFrom <= dateTo ? dateTo : dateFrom;
  const cur = parseUtcDate(startIso);
  const end = parseUtcDate(endIso);
  let count = 0;
  let guard = 0;
  while (cur.getTime() <= end.getTime() && guard < 400) {
    if (cur.getUTCDay() !== 0) {
      count++;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard++;
  }
  return count;
}

export function getAdjustmentForPersonDay(
  adjustments: WorkingDayAdjustment[] | undefined,
  person: string,
  day: string
): WorkingDayAdjustment | null {
  if (!adjustments || adjustments.length === 0 || !day) return null;
  const picUpper = (person || '').trim().toUpperCase();
  let best: WorkingDayAdjustment | null = null;
  let bestPriority = 0;

  for (const adj of adjustments) {
    if (!adj || !adj.dateFrom || !adj.dateTo) continue;
    const from = adj.dateFrom <= adj.dateTo ? adj.dateFrom : adj.dateTo;
    const to = adj.dateFrom <= adj.dateTo ? adj.dateTo : adj.dateFrom;
    if (day < from || day > to) continue;

    if (adj.scope === 'person') {
      if (picUpper && (adj.pic || '').trim().toUpperCase() === picUpper && bestPriority < 3) {
        best = adj;
        bestPriority = 3;
      }
    } else if (adj.scope === 'role') {
      if (bestPriority < 2) {
        best = adj;
        bestPriority = 2;
      }
    } else if (adj.scope === 'all') {
      if (bestPriority < 1) {
        best = adj;
        bestPriority = 1;
      }
    }
  }
  return best;
}

export function getEffectiveWorkingDaysForPerson(
  days: string[],
  adjustments: WorkingDayAdjustment[] | undefined,
  person: string
): string[] {
  const workDays = days.filter((d) => !isSunday(d));
  if (!adjustments || adjustments.length === 0) return workDays;
  return workDays.filter((d) => !getAdjustmentForPersonDay(adjustments, person, d));
}

export function countAdjustedWorkingDays(
  days: string[],
  adjustments: WorkingDayAdjustment[] | undefined,
  person: string
): {
  total: number;
  effective: number;
  adjusted: number;
  byType: Record<DayAdjustmentType, number>;
} {
  const byType: Record<DayAdjustmentType, number> = {
    off_day: 0,
    cuti_izin: 0,
    cuti_bersama: 0,
    libur_nasional: 0,
  };
  const workDays = days.filter((d) => !isSunday(d));
  let adjusted = 0;
  for (const d of workDays) {
    const match = getAdjustmentForPersonDay(adjustments, person, d);
    if (match) {
      adjusted++;
      byType[match.type] = (byType[match.type] || 0) + 1;
    }
  }
  return {
    total: workDays.length,
    effective: Math.max(0, workDays.length - adjusted),
    adjusted,
    byType,
  };
}

export function calcRecap(
  state: OutletStoreState,
  days: string[],
  tasks: TaskDefinition[],
  outlet: string,
  person: string,
  taskKey: string,
  upto: string,
  today: string = todayIso(),
  fromDate?: string,
  dayAdjustments?: WorkingDayAdjustment[]
): OutletRecap {
  const taskDef = tasks.find((t) => t.key === taskKey);
  const effectiveUpto = upto && upto > today ? today : upto;
  const effectiveFrom =
    fromDate && effectiveUpto && fromDate > effectiveUpto ? effectiveUpto : fromDate || '';
  const allScopedDays = days.filter(
    (d) =>
      (!effectiveFrom || d >= effectiveFrom) &&
      d <= effectiveUpto &&
      !isSunday(d) &&
      (!taskDef || isTaskActiveOnDay(taskDef, d, state, outlet))
  );
  const ds =
    dayAdjustments && dayAdjustments.length > 0
      ? allScopedDays.filter((d) => !getAdjustmentForPersonDay(dayAdjustments, person, d))
      : allScopedDays;
  const adjustedDays = allScopedDays.length - ds.length;

  if (!ds.length) {
    const noScheduledDays = allScopedDays.length === 0;
    const fallbackDay = allScopedDays[allScopedDays.length - 1] || days[0] || effectiveUpto;
    const fallback = noScheduledDays
      ? null
      : calcTask(state, days, tasks, outlet, fallbackDay, taskKey, today);
    const allDaysAdjusted = allScopedDays.length > 0 && adjustedDays === allScopedDays.length;
    return {
      outlet,
      person,
      avg: 0,
      pend: 0,
      latestDate: fallback?.d || '',
      latestPm: fallback?.d ? fallback.pm : 0,
      latestPend: noScheduledDays || allDaysAdjusted ? false : fallback?.d ? fallback.pend : false,
      latestNote: fallback?.n || '',
      hasAnyInput: Boolean(fallback?.d),
      backfillCount: noScheduledDays || allDaysAdjusted ? 0 : fallback?.backfillDays ? 1 : 0,
      effectiveDays: 0,
      totalDays: allScopedDays.length,
      adjustedDays,
    };
  }

  let sum = 0;
  let pendCount = 0;
  let hasAnyInput = false;
  let backfillCount = 0;
  let latest = calcTask(state, days, tasks, outlet, ds[0], taskKey, today);

  for (const d of ds) {
    const c = calcTask(state, days, tasks, outlet, d, taskKey, today);
    sum += c.pm;
    if (c.pend) pendCount++;
    if (c.d) hasAnyInput = true;
    if ((c.backfillDays || 0) > 0) backfillCount++;
    latest = c;
  }

  return {
    outlet,
    person,
    avg: sum / ds.length,
    pend: pendCount,
    latestDate: latest.d,
    latestPm: latest.pm,
    latestPend: latest.pend,
    latestNote: latest.n,
    hasAnyInput,
    backfillCount,
    effectiveDays: ds.length,
    totalDays: allScopedDays.length,
    adjustedDays,
  };
}

export function getVisitEntries(visitItem?: VisitItem): VisitEntry[] {
  if (!visitItem) return [];
  if (Array.isArray(visitItem.entries) && visitItem.entries.length > 0) {
    return visitItem.entries.map((entry, idx) => ({
      id: entry.id || `v_${idx + 1}`,
      outlet: entry.outlet || '',
      f: entry.f || '',
      t: entry.t || '',
      n: entry.n || '',
      ...(entry.assignEventId ? { assignEventId: entry.assignEventId } : {}),
      ...(entry.assignStatus ? { assignStatus: entry.assignStatus } : {}),
    }));
  }
  if (visitItem.ok || visitItem.outlet || visitItem.f || visitItem.t || visitItem.n) {
    return [
      {
        id: 'v_1',
        outlet: visitItem.outlet || '',
        f: visitItem.f || '',
        t: visitItem.t || '',
        n: visitItem.n || '',
      },
    ];
  }
  return [];
}

export function calcVisitLeaderboard(
  state: OutletStoreState,
  days: string[],
  personList: string[],
  today: string = todayIso(),
  fromDate?: string,
  uptoDate?: string,
  dayAdjustments?: WorkingDayAdjustment[]
): { elapsedDays: number; grandTotalVisits: number; rows: VisitPersonStats[] } {
  const effectiveUpto = uptoDate ? (uptoDate > today ? today : uptoDate) : '';
  const effectiveFrom =
    fromDate && effectiveUpto && fromDate > effectiveUpto ? effectiveUpto : fromDate || '';
  const workingDays = days.filter(
    (d) =>
      !isSunday(d) &&
      (!effectiveFrom || d >= effectiveFrom) &&
      (!effectiveUpto || d <= effectiveUpto)
  );
  const elapsedCap = effectiveUpto && effectiveUpto < today ? effectiveUpto : today;
  const elapsedWorkingDays = workingDays.filter((d) => d <= elapsedCap);
  const elapsedDays = elapsedWorkingDays.length;
  const rawRows = personList.map((person) => {
    let visitedCount = 0;
    let totalVisits = 0;
    for (const d of workingDays) {
      const v = state.visit[`${person}|${d}`];
      if (v?.ok) {
        visitedCount++;
        const entries = getVisitEntries(v);
        totalVisits += Math.max(1, entries.length);
      }
    }
    const personElapsedDays =
      dayAdjustments && dayAdjustments.length > 0
        ? elapsedWorkingDays.filter((d) => !getAdjustmentForPersonDay(dayAdjustments, person, d))
            .length
        : elapsedDays;
    const personAdjustedDays = elapsedDays - personElapsedDays;
    return {
      person,
      visitedCount,
      totalVisits,
      elapsedDays: personElapsedDays,
      ...(personAdjustedDays > 0 ? { adjustedDays: personAdjustedDays } : {}),
    };
  });

  const grandTotalVisits = rawRows.reduce((sum, row) => sum + row.totalVisits, 0);

  const rows: VisitPersonStats[] = rawRows
    .map((row) => ({
      ...row,
      rate: grandTotalVisits > 0 ? row.totalVisits / grandTotalVisits : 0,
    }))
    .sort(
      (a, b) =>
        b.totalVisits - a.totalVisits ||
        b.visitedCount - a.visitedCount ||
        a.person.localeCompare(b.person)
    );

  return { elapsedDays, grandTotalVisits, rows };
}

export function escapeCsvCell(
  val: string | number,
  options?: { delimiter?: ',' | ';'; decimalSeparator?: '.' | ',' }
): string {
  const delimiter = options?.delimiter || ',';
  const decimalSeparator = options?.decimalSeparator || '.';
  let raw: string;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) {
      raw = '';
    } else if (decimalSeparator === ',' && !Number.isInteger(val)) {
      raw = String(val).replace('.', ',');
    } else {
      raw = String(val);
    }
  } else {
    raw = String(val ?? '');
  }
  const trimmedStart = raw.replace(/^[ \t\r\n]+/, '');
  const isPlainNumber =
    typeof val === 'number' || /^[+-]?\d+([.,]\d+)?$/.test(raw.trim());
  const hasFormulaPrefix =
    /^[=+\-@\t\r]/.test(raw) || /^[=+\-@]/.test(trimmedStart);
  const str = hasFormulaPrefix && !isPlainNumber ? `'${raw}` : raw;
  const needsQuote =
    str.includes(delimiter) || /["\n\r]/.test(str);
  if (needsQuote) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function escapeCsv(val: string | number): string {
  return escapeCsvCell(val, { delimiter: ',', decimalSeparator: '.' });
}

export interface TabularExportData {
  columns: string[];
  rows: Array<Array<string | number>>;
}

export function buildDailyFleetTable(
  state: OutletStoreState,
  days: string[],
  config: RoleConfig,
  day: string,
  today: string = todayIso(),
  includeFormula: boolean = true
): TabularExportData {
  const columns = [
    'Role',
    'Tanggal Kerja',
    'PIC',
    'Outlet',
    'Item',
    'Tgl Update',
    'Sumber',
    ...(includeFormula ? ['Rumus', '+/-'] : []),
    'Status',
    'Keterangan',
  ];
  const rows: Array<Array<string | number>> = [];

  for (const { code: outlet, person } of config.outlets) {
    const activeTasks = getActiveTasksForDay(config.tasks, day, state, outlet);
    for (const t of activeTasks) {
      const c = calcTask(state, days, config.tasks, outlet, day, t.key, today);
      const tsFormatted = c.ts ? fmtDateTimeWithSeconds(c.ts) : '';
      const sourceLabel =
        c.source === 'own'
          ? tsFormatted
            ? `Diinput ${tsFormatted}`
            : 'Diisi hari ini'
          : c.source === 'inherited'
            ? tsFormatted
              ? `Ikut ${c.sourceDay} (${tsFormatted})`
              : `Ikut ${c.sourceDay}`
            : 'Belum diinput';
      const inputType = getTaskInputType(t);
      const displayDate = c.d
        ? inputType === 'month'
          ? c.d.slice(0, 7)
          : inputType === 'week'
            ? fmtWeek(c.d)
            : c.d
        : '';
      const rumusVal =
        inputType === 'month' && c.rumus
          ? c.rumus.slice(0, 7)
          : inputType === 'week' && c.rumus
            ? fmtWeek(c.rumus)
            : c.rumus;
      rows.push([
        config.label,
        day,
        person,
        outlet,
        t.label,
        displayDate,
        sourceLabel,
        ...(includeFormula ? [rumusVal, c.pm] : []),
        c.pend ? 'PENDING' : 'UPDATE',
        c.n,
      ]);
    }
  }
  return { columns, rows };
}

export function generateDailyFleetCsv(
  state: OutletStoreState,
  days: string[],
  config: RoleConfig,
  day: string,
  today: string = todayIso(),
  includeFormula: boolean = true
): string {
  const { columns, rows } = buildDailyFleetTable(state, days, config, day, today, includeFormula);
  return [
    columns.map(escapeCsv).join(','),
    ...rows.map((r) => r.map(escapeCsv).join(',')),
  ].join('\n');
}

export function buildRecapTable(
  state: OutletStoreState,
  days: string[],
  config: RoleConfig,
  taskKey: string,
  upto: string,
  today: string = todayIso(),
  fromDate?: string
): TabularExportData {
  const taskDef = config.tasks.find((t) => t.key === taskKey);
  const columns = [
    'Ranking',
    'Role',
    'Item',
    fromDate ? 'Periode Tanggal' : 'Per Tanggal',
    'Outlet',
    'PIC',
    'Tgl Update Terakhir',
    '+/- Terakhir',
    'Rata-rata Telat',
    'Hari Pending',
    'Status Terakhir',
  ];
  const effectiveUpto = upto && upto > today ? today : upto;
  const effectiveFrom =
    fromDate && effectiveUpto && fromDate > effectiveUpto ? effectiveUpto : fromDate || '';
  const periodLabel = effectiveFrom ? `${effectiveFrom} s/d ${effectiveUpto}` : effectiveUpto;
  const recaps = config.outlets
    .map(({ code: outlet, person }) =>
      calcRecap(
        state,
        days,
        config.tasks,
        outlet,
        person,
        taskKey,
        effectiveUpto,
        today,
        effectiveFrom,
        config.dayAdjustments
      )
    )
    .sort((a, b) => Number(a.hasAnyInput) - Number(b.hasAnyInput) || a.avg - b.avg);

  const inputType = getTaskInputType(taskDef);
  const rows: Array<Array<string | number>> = [];
  recaps.forEach((r, idx) => {
    const displayLatest = r.latestDate
      ? inputType === 'month'
        ? r.latestDate.slice(0, 7)
        : inputType === 'week'
          ? fmtWeek(r.latestDate)
          : r.latestDate
      : 'Belum pernah input';
    rows.push([
      idx + 1,
      config.label,
      taskDef?.label || taskKey,
      periodLabel,
      r.outlet,
      r.person,
      displayLatest,
      r.hasAnyInput ? r.latestPm : '—',
      Number(r.avg.toFixed(1)),
      r.pend,
      !r.hasAnyInput ? 'BELUM INPUT' : r.latestPend ? 'PENDING' : 'UPDATE',
    ]);
  });
  return { columns, rows };
}

export function generateRecapCsv(
  state: OutletStoreState,
  days: string[],
  config: RoleConfig,
  taskKey: string,
  upto: string,
  today: string = todayIso(),
  fromDate?: string
): string {
  const { columns, rows } = buildRecapTable(state, days, config, taskKey, upto, today, fromDate);
  return [
    columns.map(escapeCsv).join(','),
    ...rows.map((r) =>
      r
        .map((cell, i) => (i === 8 && typeof cell === 'number' ? cell.toFixed(1) : cell))
        .map(escapeCsv)
        .join(',')
    ),
  ].join('\n');
}

export function buildVisitTable(
  state: OutletStoreState,
  days: string[],
  config: RoleConfig
): TabularExportData {
  const columns = [
    'Role',
    'PIC',
    'Tanggal Kerja',
    'Dikunjungi',
    'Jumlah Kunjungan',
    'Outlet',
    'Dari Jam',
    'Ke Jam',
    'Keterangan',
  ];
  const rows: Array<Array<string | number>> = [];
  const personList = getPersonList(config.outlets);

  for (const person of personList) {
    for (const day of days) {
      const v = state.visit[`${person}|${day}`];
      const entries = v?.ok ? getVisitEntries(v) : [];
      if (v?.ok && entries.length > 0) {
        entries.forEach((entry, idx) => {
          rows.push([
            config.label,
            person,
            day,
            'Ya',
            idx === 0 ? entries.length : '',
            entry.outlet || '-',
            entry.f || '',
            entry.t || '',
            entry.n || '',
          ]);
        });
      } else {
        rows.push([
          config.label,
          person,
          day,
          v?.ok ? 'Ya' : 'Tidak',
          v?.ok ? 1 : 0,
          v?.outlet || '',
          v?.f || '',
          v?.t || '',
          v?.n || '',
        ]);
      }
    }
  }
  return { columns, rows };
}

export function generateVisitCsv(
  state: OutletStoreState,
  days: string[],
  config: RoleConfig
): string {
  const { columns, rows } = buildVisitTable(state, days, config);
  return [
    columns.map(escapeCsv).join(','),
    ...rows.map((r) => r.map(escapeCsv).join(',')),
  ].join('\n');
}

export function buildInputLogsTable(logs: InputLogEntry[]): TabularExportData {
  const columns = [
    'Waktu Input',
    'Nama User',
    'Email User',
    'Role Akun',
    'Aktivitas',
    'Workspace',
    'Tanggal Kerja',
    'PIC',
    'Outlet',
    'Jumlah Item',
    'Detail Penginputan',
  ];
  const rows: Array<Array<string | number>> = logs.map((log) => [
    fmtDateTimeWithSeconds(log.clientTs) || log.clientTs,
    log.userName,
    log.userEmail,
    ROLE_LABELS[log.userRole] || log.userRole,
    log.actionType === 'kunjungan' ? 'Kunjungan' : 'Input Harian',
    log.roleLabel,
    log.day,
    log.pic,
    log.outlet,
    log.itemCount,
    log.details,
  ]);
  return { columns, rows };
}

export function generateInputLogsCsv(logs: InputLogEntry[]): string {
  const { columns, rows } = buildInputLogsTable(logs);
  return [
    columns.map(escapeCsv).join(','),
    ...rows.map((r) => r.map(escapeCsv).join(',')),
  ].join('\n');
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const isCsv =
    mimeType.toLowerCase().includes('csv') || filename.toLowerCase().endsWith('.csv');
  const payload = isCsv && !content.startsWith('\uFEFF') ? `\uFEFF${content}` : content;
  const blob = new Blob([payload], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const FIRESTORE_SPARK_LIMIT_BYTES = 1024 * 1024 * 1024; // 1 GiB Spark free tier

const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

function utf8ByteLength(str: string): number {
  if (textEncoder) return textEncoder.encode(str).length;
  return unescape(encodeURIComponent(str)).length;
}

function estimateFirestoreValueBytes(value: unknown): number {
  if (value === null || value === undefined) return 1;
  if (typeof value === 'boolean') return 1;
  if (typeof value === 'number') return 8;
  if (typeof value === 'string') return utf8ByteLength(value) + 1;
  if (value instanceof Date) return 8;
  if (Array.isArray(value)) {
    let total = 0;
    for (const item of value) {
      total += estimateFirestoreValueBytes(item);
    }
    return total;
  }
  if (typeof value === 'object') {
    let total = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      total += utf8ByteLength(k) + 1 + estimateFirestoreValueBytes(v);
    }
    return total;
  }
  return 8;
}

export function estimateFirestoreDocBytes(docPath: string, data: unknown): number {
  const segments = docPath.split('/').filter(Boolean);
  let nameBytes = 16;
  for (const seg of segments) {
    nameBytes += utf8ByteLength(seg) + 1;
  }
  return 32 + nameBytes + estimateFirestoreValueBytes(data);
}

export function formatStorageBytes(bytes: number): string {
  const safe = Math.max(0, bytes);
  if (safe < 1024) return `${Math.round(safe)} B`;
  const kb = safe / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace('.', ',')} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1).replace('.', ',')} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2).replace('.', ',')} GB`;
}

export const CALENDAR_TIME_SLOTS: string[] = [
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '12:30',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
  '18:00',
  '18:30',
  '19:00',
];

export function isValidCalendarStartTime(time: string): boolean {
  return CALENDAR_TIME_SLOTS.includes(time);
}

export function normalizeCalendarVisibleTo(roles: OperationalRoleId[]): OperationalRoleId[] {
  const allowed: OperationalRoleId[] = ['stock_accounting', 'gl', 'accounting'];
  const unique = Array.from(new Set(roles)).filter((r): r is OperationalRoleId =>
    allowed.includes(r)
  );
  return unique;
}

export function isValidCalendarReturnTime(time: string): boolean {
  if (!time) return true;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

export function currentWibDateTime(nowMs: number = Date.now()): {
  dateIso: string;
  timeHm: string;
} {
  const wib = new Date(nowMs + 7 * 3600 * 1000);
  const yyyy = wib.getUTCFullYear();
  const mm = String(wib.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(wib.getUTCDate()).padStart(2, '0');
  const hh = String(wib.getUTCHours()).padStart(2, '0');
  const min = String(wib.getUTCMinutes()).padStart(2, '0');
  return {
    dateIso: `${yyyy}-${mm}-${dd}`,
    timeHm: `${hh}:${min}`,
  };
}

export function validateAssignReturnTimeTiming(params: {
  assignDate: string;
  startTime?: string;
  returnTime: string;
  isAdmin?: boolean;
  nowWib?: { dateIso: string; timeHm: string };
}): string | null {
  const { assignDate, startTime, returnTime, isAdmin = false } = params;
  const cleanReturn = (returnTime || '').trim();
  if (!CALENDAR_TIME_SLOTS.includes(cleanReturn)) {
    return 'Pilih jam pulang antara 08:00 – 19:00 WIB (kelipatan 30 menit).';
  }
  const cleanStart = (startTime || '').trim();
  if (cleanStart && /^\d{2}:\d{2}$/.test(cleanStart) && cleanReturn < cleanStart) {
    return `Jam pulang (${cleanReturn} WIB) tidak boleh lebih awal dari jam berangkat (${cleanStart} WIB).`;
  }
  if (!isAdmin) {
    const now = params.nowWib || currentWibDateTime();
    if (/^\d{4}-\d{2}-\d{2}$/.test(assignDate)) {
      if (assignDate > now.dateIso) {
        return `Tidak dapat menginput jam pulang untuk tanggal masa depan (${fmtDateSlash(assignDate)}). Waktu saat ini masih ${fmtDateSlash(now.dateIso)} pukul ${now.timeHm} WIB.`;
      }
      if (assignDate === now.dateIso && cleanReturn > now.timeHm) {
        return `Tidak dapat menginput jam pulang di masa depan (${cleanReturn} WIB) karena waktu saat ini masih pukul ${now.timeHm} WIB.`;
      }
    }
  }
  return null;
}

export function getAccountPicUpper(
  account: Pick<AccountProfile, 'picName' | 'name'> | null | undefined
): string {
  if (!account) return '';
  return ((account.picName || '').trim() || (account.name || '').trim()).toUpperCase();
}

export function canAccountManageCalendarAssigns(
  accountOrRole: AccountRole | Pick<AccountProfile, 'role'> | null | undefined
): boolean {
  const role = typeof accountOrRole === 'string' ? accountOrRole : accountOrRole?.role;
  return role === 'admin' || role === 'accounting';
}

export function getAssignableRolesForAccount(
  accountOrRole: AccountRole | Pick<AccountProfile, 'role'> | null | undefined
): OperationalRoleId[] {
  const role = typeof accountOrRole === 'string' ? accountOrRole : accountOrRole?.role;
  if (role === 'admin') return ['stock_accounting', 'gl', 'accounting'];
  if (role === 'accounting') return ['stock_accounting', 'gl'];
  return [];
}

export function canAccountManageAssignEvent(
  accountOrRole: AccountRole | Pick<AccountProfile, 'role'> | null | undefined,
  event: Pick<
    CalendarEvent,
    'eventType' | 'assignScope' | 'assignedDivision' | 'assignedRole'
  >
): boolean {
  const role = typeof accountOrRole === 'string' ? accountOrRole : accountOrRole?.role;
  if (role === 'admin') return true;
  if (role !== 'accounting') return false;
  if (event.eventType && event.eventType !== 'assign') return false;
  const targetRole =
    event.assignScope === 'division'
      ? event.assignedDivision || event.assignedRole
      : event.assignedRole;
  return targetRole === 'stock_accounting' || targetRole === 'gl';
}

export function canUserViewCalendarEvent(
  event: Pick<
    CalendarEvent,
    | 'visibleTo'
    | 'eventType'
    | 'assignScope'
    | 'assignedDivision'
    | 'assignedRole'
    | 'assignedPic'
    | 'assignedPicUpper'
    | 'assignedEmail'
  >,
  accountOrRole:
    | AccountRole
    | Pick<AccountProfile, 'role' | 'picName' | 'name' | 'email'>
): boolean {
  if (typeof accountOrRole === 'string') {
    if (accountOrRole === 'admin') return true;
    if (accountOrRole === 'accounting' && canAccountManageAssignEvent(accountOrRole, event)) {
      return true;
    }
    if (event.eventType === 'assign') {
      return event.assignScope === 'division' && event.assignedDivision === accountOrRole;
    }
    return event.visibleTo.includes(accountOrRole);
  }
  if (accountOrRole.role === 'admin') return true;
  if (
    accountOrRole.role === 'accounting' &&
    canAccountManageAssignEvent(accountOrRole, event)
  ) {
    return true;
  }
  if (event.eventType !== 'assign') return false;
  if (event.assignScope === 'division') {
    return Boolean(event.assignedDivision && event.assignedDivision === accountOrRole.role);
  }
  const myPicUpper = getAccountPicUpper(accountOrRole);
  const eventPicUpper = (
    event.assignedPicUpper ||
    (event.assignedPic || '').trim().toUpperCase()
  ).trim();
  if (myPicUpper && eventPicUpper && eventPicUpper === myPicUpper) {
    return true;
  }
  const myEmail = (accountOrRole.email || '').trim().toLowerCase();
  const eventEmail = (event.assignedEmail || '').trim().toLowerCase();
  if (myEmail && eventEmail && eventEmail === myEmail) {
    return true;
  }
  return false;
}

export function getEffectiveAssignResponse(
  event: Pick<
    CalendarEvent,
    'assignScope' | 'assignStatus' | 'returnTime' | 'cancelReason' | 'picResponses'
  >,
  picUpper?: string
): {
  status: import('../types/outlet').CalendarAssignStatus;
  returnTime: string;
  cancelReason: string;
} {
  const globalStatus = event.assignStatus || 'assigned';
  if (globalStatus === 'cancelled') {
    return {
      status: 'cancelled',
      returnTime: '',
      cancelReason: event.cancelReason || '',
    };
  }
  if (event.assignScope === 'division' && picUpper) {
    const resp = event.picResponses?.[picUpper.trim().toUpperCase()];
    if (resp) {
      return {
        status: resp.status || 'assigned',
        returnTime: resp.status === 'cancelled' ? '' : resp.returnTime || '',
        cancelReason: resp.status === 'cancelled' ? resp.cancelReason || '' : '',
      };
    }
    return { status: 'assigned', returnTime: '', cancelReason: '' };
  }
  return {
    status: globalStatus,
    returnTime: event.returnTime || '',
    cancelReason: event.cancelReason || '',
  };
}

export function formatCalendarVisibleLabel(visibleTo: OperationalRoleId[]): string {
  const normalized = normalizeCalendarVisibleTo(visibleTo);
  if (normalized.length === 3) return 'Semua Departemen';
  return normalized.map((r) => ROLE_LABELS[r] || r).join(', ');
}

export const CALENDAR_RECURRENCE_FREQS: CalendarRecurrenceFreq[] = [
  'none',
  'daily',
  'weekly',
  'monthly',
  'yearly',
];

export function normalizeCalendarRecurrenceFreq(freq: unknown): CalendarRecurrenceFreq {
  if (
    freq === 'daily' ||
    freq === 'weekly' ||
    freq === 'monthly' ||
    freq === 'yearly'
  ) {
    return freq;
  }
  return 'none';
}

export function normalizeCalendarInterval(interval: unknown): number {
  const n = Number(interval);
  if (!Number.isFinite(n)) return 1;
  return Math.min(12, Math.max(1, Math.floor(n)));
}

export function normalizeCalendarWeekdays(days: unknown): number[] {
  if (!Array.isArray(days)) return [];
  const valid = days
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  // Display order Mon(1)..Sat(6), Sun(0)
  const unique = Array.from(new Set(valid));
  unique.sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
  return unique;
}

export function normalizeExcludedDates(dates: unknown): string[] {
  if (!Array.isArray(dates)) return [];
  const unique = Array.from(
    new Set(
      dates.filter(
        (d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
      )
    )
  ).sort();
  return unique.slice(0, 200);
}

function daysInUtcMonth(year: number, month1Based: number): number {
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}

function mondayIsoOfWeek(isoDate: string): string {
  const dt = parseUtcDate(isoDate);
  const dow = dt.getUTCDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  return shiftIsoDays(isoDate, diffToMon);
}

export interface ExpandedCalendarOccurrence {
  event: CalendarEvent;
  occurrenceDate: string;
  isRecurring: boolean;
}

export function expandCalendarEventsForRange(
  events: CalendarEvent[],
  rangeStart: string,
  rangeEnd: string
): ExpandedCalendarOccurrence[] {
  const out: ExpandedCalendarOccurrence[] = [];
  if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return out;

  for (const evt of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(evt.date)) continue;
    const freq = normalizeCalendarRecurrenceFreq(evt.repeatFreq);
    const interval = normalizeCalendarInterval(evt.repeatInterval);
    const repeatUntil =
      evt.repeatUntil && /^\d{4}-\d{2}-\d{2}$/.test(evt.repeatUntil)
        ? evt.repeatUntil
        : '';
    const excluded = new Set(evt.excludedDates || []);

    if (freq === 'none') {
      if (
        evt.date >= rangeStart &&
        evt.date <= rangeEnd &&
        !excluded.has(evt.date)
      ) {
        out.push({ event: evt, occurrenceDate: evt.date, isRecurring: false });
      }
      continue;
    }

    const effectiveStart = evt.date > rangeStart ? evt.date : rangeStart;
    const effectiveEnd =
      repeatUntil && repeatUntil < rangeEnd ? repeatUntil : rangeEnd;
    if (effectiveStart > effectiveEnd) continue;

    if (freq === 'daily') {
      const startDiff = diffDays(effectiveStart, evt.date);
      const rem = startDiff % interval;
      let cursor =
        rem === 0 ? effectiveStart : shiftIsoDays(effectiveStart, interval - rem);
      while (cursor <= effectiveEnd) {
        if (!excluded.has(cursor)) {
          out.push({ event: evt, occurrenceDate: cursor, isRecurring: true });
        }
        cursor = shiftIsoDays(cursor, interval);
      }
      continue;
    }

    if (freq === 'weekly') {
      const startDow = parseUtcDate(evt.date).getUTCDay();
      const configuredWeekdays = normalizeCalendarWeekdays(evt.repeatWeekdays);
      const weekdaySet = new Set(
        configuredWeekdays.length > 0 ? configuredWeekdays : [startDow]
      );
      const anchorMonday = mondayIsoOfWeek(evt.date);

      let cursor = effectiveStart;
      while (cursor <= effectiveEnd) {
        const dow = parseUtcDate(cursor).getUTCDay();
        if (weekdaySet.has(dow)) {
          const curMonday = mondayIsoOfWeek(cursor);
          const weeksApart = Math.round(diffDays(curMonday, anchorMonday) / 7);
          if (weeksApart >= 0 && weeksApart % interval === 0 && !excluded.has(cursor)) {
            out.push({ event: evt, occurrenceDate: cursor, isRecurring: true });
          }
        }
        cursor = shiftIsoDays(cursor, 1);
      }
      continue;
    }

    const startYear = Number(evt.date.slice(0, 4));
    const startMonth = Number(evt.date.slice(5, 7));
    const anchorDay = Number(evt.date.slice(8, 10));
    const endYear = Number(effectiveEnd.slice(0, 4));
    const endMonth = Number(effectiveEnd.slice(5, 7));

    if (freq === 'monthly') {
      let y = Number(effectiveStart.slice(0, 4));
      let m = Number(effectiveStart.slice(5, 7));
      while (y < endYear || (y === endYear && m <= endMonth)) {
        const monthsDiff = (y - startYear) * 12 + (m - startMonth);
        if (monthsDiff >= 0 && monthsDiff % interval === 0) {
          const clampedDay = Math.min(anchorDay, daysInUtcMonth(y, m));
          const candidate = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
          if (
            candidate >= effectiveStart &&
            candidate <= effectiveEnd &&
            !excluded.has(candidate)
          ) {
            out.push({ event: evt, occurrenceDate: candidate, isRecurring: true });
          }
        }
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
      continue;
    }

    if (freq === 'yearly') {
      const effStartYear = Number(effectiveStart.slice(0, 4));
      for (let y = effStartYear; y <= endYear; y++) {
        const yearsDiff = y - startYear;
        if (yearsDiff >= 0 && yearsDiff % interval === 0) {
          const clampedDay = Math.min(anchorDay, daysInUtcMonth(y, startMonth));
          const candidate = `${String(y).padStart(4, '0')}-${String(startMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
          if (
            candidate >= effectiveStart &&
            candidate <= effectiveEnd &&
            !excluded.has(candidate)
          ) {
            out.push({ event: evt, occurrenceDate: candidate, isRecurring: true });
          }
        }
      }
    }
  }

  out.sort(
    (a, b) =>
      a.occurrenceDate.localeCompare(b.occurrenceDate) ||
      a.event.startTime.localeCompare(b.event.startTime) ||
      a.event.title.localeCompare(b.event.title)
  );
  return out;
}

const WEEKDAY_NAMES_ID: Record<number, string> = {
  0: 'Min',
  1: 'Sen',
  2: 'Sel',
  3: 'Rab',
  4: 'Kam',
  5: 'Jum',
  6: 'Sab',
};

export function formatCalendarRecurrenceLabel(
  event: Pick<
    CalendarEvent,
    'date' | 'repeatFreq' | 'repeatInterval' | 'repeatWeekdays' | 'repeatUntil'
  >
): string {
  const freq = normalizeCalendarRecurrenceFreq(event.repeatFreq);
  if (freq === 'none') return 'Tidak berulang';

  const interval = normalizeCalendarInterval(event.repeatInterval);
  let base: string;
  if (freq === 'daily') {
    base = interval === 1 ? 'Setiap hari' : `Setiap ${interval} hari`;
  } else if (freq === 'weekly') {
    const startDow = /^\d{4}-\d{2}-\d{2}$/.test(event.date)
      ? parseUtcDate(event.date).getUTCDay()
      : 1;
    const days = normalizeCalendarWeekdays(event.repeatWeekdays);
    const usedDays = days.length > 0 ? days : [startDow];
    const dayStr = usedDays.map((d) => WEEKDAY_NAMES_ID[d] || '').join(', ');
    base =
      interval === 1
        ? `Setiap minggu (${dayStr})`
        : `Setiap ${interval} minggu (${dayStr})`;
  } else if (freq === 'monthly') {
    const dayNum = Number(event.date.slice(8, 10)) || 1;
    base =
      interval === 1
        ? `Setiap bulan (tgl ${dayNum})`
        : `Setiap ${interval} bulan (tgl ${dayNum})`;
  } else {
    base = interval === 1 ? 'Setiap tahun' : `Setiap ${interval} tahun`;
  }

  if (event.repeatUntil && /^\d{4}-\d{2}-\d{2}$/.test(event.repeatUntil)) {
    return `${base} · sampai ${fmtDateSlash(event.repeatUntil)}`;
  }
  return base;
}

export function resolveAuthorizedRecordPrefix(
  account: Pick<AccountProfile, 'role' | 'refPrefix'> | null,
  activeRoleId: OperationalRoleId
): { prefix: RecordPrefix; department: RecordDepartment } {
  if (account?.role === 'gl') {
    return { prefix: 'GL', department: 'gl' };
  }
  if (account?.role === 'stock_accounting') {
    return { prefix: 'SA', department: 'stock_accounting' };
  }
  if (account?.role === 'accounting') {
    const prefix: RecordPrefix = account.refPrefix === 'GL' ? 'GL' : 'SA';
    return { prefix, department: prefix === 'GL' ? 'gl' : 'stock_accounting' };
  }
  const prefix: RecordPrefix = activeRoleId === 'gl' ? 'GL' : 'SA';
  return { prefix, department: prefix === 'GL' ? 'gl' : 'stock_accounting' };
}

export function formatYymmFromIsoDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(isoDate.trim());
  if (!match) {
    throw new Error('Format tanggal record tidak valid (harus YYYY-MM-DD).');
  }
  return `${match[1].slice(2, 4)}${match[2]}`;
}

export function formatReferenceCode(prefix: RecordPrefix, yymm: string, seq: number): string {
  const safeSeq = Math.max(1, Math.floor(seq));
  return `${prefix}${yymm}${String(safeSeq).padStart(4, '0')}`;
}

export function fmtDateSlash(isoStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((isoStr || '').trim());
  if (!match) return isoStr || '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export interface MasterOutletOption {
  code: string;
  person: string;
  roles: OperationalRoleId[];
}

export function getMasterOutletOptions(
  roleConfigs: Record<OperationalRoleId, RoleConfig>
): MasterOutletOption[] {
  const byCode = new Map<string, MasterOutletOption>();
  const roleOrder: OperationalRoleId[] = ['stock_accounting', 'gl', 'accounting'];
  for (const rId of roleOrder) {
    const list = roleConfigs[rId]?.outlets || [];
    for (const item of list) {
      const code = (item.code || '').trim();
      const person = (item.person || '').trim();
      if (!code) continue;
      const existing = byCode.get(code);
      if (!existing) {
        byCode.set(code, { code, person, roles: [rId] });
      } else {
        if (!existing.person && person) existing.person = person;
        if (!existing.roles.includes(rId)) existing.roles.push(rId);
      }
    }
  }
  return Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code));
}

export type SavedRecordSortKey = 'date' | 'pic' | 'refCode' | 'outlet';

export interface SavedRecordFilterState {
  search?: string;
  dateExact?: string;
  dateFrom?: string;
  dateTo?: string;
  pic?: string;
  refCode?: string;
  outlet?: string;
  sortKey?: SavedRecordSortKey;
  sortDir?: 'asc' | 'desc';
}

export function filterAndSortSavedRecords(
  records: SavedRecord[],
  filters: SavedRecordFilterState
): SavedRecord[] {
  const q = (filters.search || '').trim().toLowerCase();
  const refQ = (filters.refCode || '').trim().toLowerCase();
  const dateExact = (filters.dateExact || '').trim();
  const dateFrom = (filters.dateFrom || '').trim();
  const dateTo = (filters.dateTo || '').trim();
  const pic = filters.pic && filters.pic !== 'ALL' ? filters.pic : '';
  const outlet = filters.outlet && filters.outlet !== 'ALL' ? filters.outlet : '';
  const sortKey: SavedRecordSortKey = filters.sortKey || 'date';
  const sortDir: 'asc' | 'desc' = filters.sortDir || 'desc';

  const filtered = records.filter((rec) => {
    if (dateExact && rec.date !== dateExact) return false;
    if (dateFrom && rec.date < dateFrom) return false;
    if (dateTo && rec.date > dateTo) return false;
    if (pic && rec.pic.toUpperCase() !== pic.toUpperCase()) return false;
    if (outlet && rec.outlet.toUpperCase() !== outlet.toUpperCase()) return false;
    if (refQ && !rec.refCode.toLowerCase().includes(refQ)) return false;
    if (q) {
      const haystack = `${rec.refCode} ${rec.pic} ${rec.outlet} ${rec.date} ${rec.summary} ${rec.notes}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const dir = sortDir === 'asc' ? 1 : -1;
  return [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'date') {
      cmp = a.date.localeCompare(b.date);
    } else if (sortKey === 'pic') {
      cmp = a.pic.localeCompare(b.pic);
    } else if (sortKey === 'refCode') {
      cmp = a.refCode.localeCompare(b.refCode);
    } else if (sortKey === 'outlet') {
      cmp = a.outlet.localeCompare(b.outlet);
    }
    if (cmp !== 0) return cmp * dir;
    return b.refCode.localeCompare(a.refCode);
  });
}

export function resolveAccountPic(
  account: Pick<AccountProfile, 'role' | 'picName' | 'name'> | null,
  outlets: OutletAssignment[]
): string | null {
  if (!account) return '';
  if (account.role === 'admin') return null;
  const personList = getPersonList(outlets);
  const rawPic = (account.picName || '').trim().toUpperCase();
  if (rawPic) {
    const matched = personList.find((p) => p.toUpperCase() === rawPic);
    return matched || rawPic;
  }
  const rawName = (account.name || '').trim().toUpperCase();
  if (rawName) {
    const matched = personList.find((p) => p.toUpperCase() === rawName);
    if (matched) return matched;
  }
  return '';
}

export function canAccountEditPic(
  account: Pick<AccountProfile, 'role' | 'picName' | 'name'> | null,
  outlets: OutletAssignment[],
  targetPic: string
): boolean {
  if (!account) return false;
  if (account.role === 'admin') return true;
  const ownPic = resolveAccountPic(account, outlets);
  if (!ownPic || !targetPic) return false;
  return ownPic.trim().toUpperCase() === targetPic.trim().toUpperCase();
}

export function buildOutletsByPicMap(
  outlets: OutletAssignment[]
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const item of outlets) {
    const code = (item.code || '').trim();
    const pic = (item.person || '').trim().toUpperCase();
    if (!code || !pic) continue;
    if (!map[pic]) {
      map[pic] = [code];
    } else if (!map[pic].includes(code)) {
      map[pic].push(code);
    }
  }
  return map;
}

export interface AssignablePicOption {
  pic: string;
  picUpper: string;
  roleId: OperationalRoleId;
  email: string;
  outlets: string[];
}

export function resolveAllAssignablePics(
  roleConfigs: Record<OperationalRoleId, RoleConfig>,
  managedAccounts: AccountProfile[] = [],
  allowedRoles?: OperationalRoleId[]
): AssignablePicOption[] {
  const defaultRoleOrder: OperationalRoleId[] = ['stock_accounting', 'gl', 'accounting'];
  const roleOrder: OperationalRoleId[] =
    allowedRoles && allowedRoles.length > 0
      ? defaultRoleOrder.filter((r) => allowedRoles.includes(r))
      : defaultRoleOrder;
  const allowedSet = new Set<OperationalRoleId>(roleOrder);
  const byKey = new Map<string, AssignablePicOption>();

  const accountByRolePic = new Map<string, AccountProfile>();
  const accountByPic = new Map<string, AccountProfile>();
  for (const acc of managedAccounts) {
    if (!acc.active || acc.role === 'admin') continue;
    const picUpper = getAccountPicUpper(acc);
    if (!picUpper) continue;
    accountByRolePic.set(`${acc.role}|${picUpper}`, acc);
    if (!accountByPic.has(picUpper)) {
      accountByPic.set(picUpper, acc);
    }
  }

  for (const roleId of roleOrder) {
    const outlets = roleConfigs[roleId]?.outlets || [];
    for (const item of outlets) {
      const pic = (item.person || '').trim();
      const code = (item.code || '').trim();
      if (!pic) continue;
      const picUpper = pic.toUpperCase();
      const key = `${roleId}|${picUpper}`;
      const matchedAcc =
        accountByRolePic.get(key) || accountByPic.get(picUpper);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          pic,
          picUpper,
          roleId,
          email: (matchedAcc?.email || '').trim().toLowerCase(),
          outlets: code ? [code] : [],
        });
      } else {
        if (code && !existing.outlets.includes(code)) {
          existing.outlets.push(code);
        }
        if (!existing.email && matchedAcc?.email) {
          existing.email = matchedAcc.email.trim().toLowerCase();
        }
      }
    }
  }

  for (const acc of managedAccounts) {
    if (!acc.active || acc.role === 'admin') continue;
    const roleId = acc.role as OperationalRoleId;
    if (!allowedSet.has(roleId)) continue;
    const pic = (acc.picName || '').trim() || (acc.name || '').trim();
    if (!pic) continue;
    const picUpper = pic.toUpperCase();
    const key = `${roleId}|${picUpper}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        pic,
        picUpper,
        roleId,
        email: (acc.email || '').trim().toLowerCase(),
        outlets: [],
      });
    }
  }

  return Array.from(byKey.values())
    .map((item) => ({
      ...item,
      outlets: [...item.outlets].sort((a, b) => a.localeCompare(b)),
    }))
    .sort(
      (a, b) =>
        roleOrder.indexOf(a.roleId) - roleOrder.indexOf(b.roleId) ||
        a.pic.localeCompare(b.pic)
    );
}

export function mergeAssignsIntoVisitMap(
  baseVisit: Record<string, VisitItem>,
  calendarEvents: CalendarEvent[],
  roleId: OperationalRoleId,
  outlets: OutletAssignment[]
): Record<string, VisitItem> {
  const canonicalPicByUpper = new Map<string, string>();
  for (const item of outlets) {
    const p = (item.person || '').trim();
    if (p && !canonicalPicByUpper.has(p.toUpperCase())) {
      canonicalPicByUpper.set(p.toUpperCase(), p);
    }
  }

  const nextVisit: Record<string, VisitItem> = {};
  for (const [key, item] of Object.entries(baseVisit || {})) {
    const manualEntries = getVisitEntries(item).filter((e) => !e.assignEventId);
    if (manualEntries.length > 0) {
      const first = manualEntries[0];
      nextVisit[key] = {
        ok: true,
        outlet: first.outlet,
        f: first.f,
        t: first.t,
        n: first.n,
        entries: manualEntries,
      };
    }
  }

  const assignEntriesByKey = new Map<string, VisitEntry[]>();
  const divisionPicList = getPersonList(outlets);

  const pushAssignEntry = (
    pic: string,
    evt: CalendarEvent,
    status: import('../types/outlet').CalendarAssignStatus,
    returnTime: string
  ) => {
    if (!pic || status === 'cancelled') return;
    const key = `${pic}|${evt.date}`;
    const noteText = evt.notes ? `${evt.title} — ${evt.notes}` : evt.title;
    const entry: VisitEntry = {
      id: `assign_${evt.id}_${pic.toUpperCase()}`,
      outlet: (evt.assignedOutlet || '').trim() || 'Assign',
      f: evt.startTime || '08:00',
      t: returnTime || '',
      n: noteText.slice(0, 100),
      assignEventId: evt.id,
      assignStatus: status,
    };
    const list = assignEntriesByKey.get(key) || [];
    list.push(entry);
    assignEntriesByKey.set(key, list);
  };

  for (const evt of calendarEvents) {
    if (evt.eventType !== 'assign') continue;
    if (evt.assignStatus === 'cancelled') continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(evt.date)) continue;

    if (evt.assignScope === 'division') {
      const targetDiv = evt.assignedDivision || evt.assignedRole;
      if (targetDiv !== roleId) continue;
      for (const pic of divisionPicList) {
        const eff = getEffectiveAssignResponse(evt, pic.toUpperCase());
        pushAssignEntry(pic, evt, eff.status, eff.returnTime);
      }
      continue;
    }

    if (evt.assignedRole !== roleId) continue;
    const picUpper = (
      evt.assignedPicUpper ||
      (evt.assignedPic || '').trim().toUpperCase()
    ).trim();
    if (!picUpper) continue;

    const pic = canonicalPicByUpper.get(picUpper) || (evt.assignedPic || '').trim();
    pushAssignEntry(pic, evt, evt.assignStatus || 'assigned', evt.returnTime || '');
  }

  for (const [key, assignEntries] of assignEntriesByKey.entries()) {
    assignEntries.sort(
      (a, b) => a.f.localeCompare(b.f) || a.id.localeCompare(b.id)
    );
    const existingManual = nextVisit[key]?.entries || [];
    const combined = [...assignEntries, ...existingManual];
    const first = combined[0];
    nextVisit[key] = {
      ok: true,
      outlet: first.outlet,
      f: first.f,
      t: first.t,
      n: first.n,
      entries: combined,
    };
  }

  return nextVisit;
}

export function getPendingAssignNotifications(
  calendarEvents: CalendarEvent[],
  account: Pick<AccountProfile, 'role' | 'picName' | 'name' | 'email'> | null,
  currentUid?: string
): CalendarEvent[] {
  if (!account) return [];
  const myPicUpper = getAccountPicUpper(account);
  const myEmail = (account.email || '').trim().toLowerCase();

  return calendarEvents
    .filter((evt) => {
      if (evt.eventType !== 'assign') return false;
      if (evt.assignStatus === 'cancelled' || evt.assignStatus === 'completed') return false;
      const dismissedBy = evt.dismissedBy || [];
      if (currentUid && dismissedBy.includes(currentUid)) return false;

      if (evt.assignScope === 'division') {
        if (account.role === 'admin') return false;
        if (!evt.assignedDivision || evt.assignedDivision !== account.role) return false;
        const eff = getEffectiveAssignResponse(evt, myPicUpper);
        if (eff.status === 'cancelled' || eff.status === 'completed') return false;
        return true;
      }

      if (evt.notificationDismissed) return false;
      const evtPicUpper = (
        evt.assignedPicUpper ||
        (evt.assignedPic || '').trim().toUpperCase()
      ).trim();
      const evtEmail = (evt.assignedEmail || '').trim().toLowerCase();
      const matchesPic = Boolean(myPicUpper && evtPicUpper && evtPicUpper === myPicUpper);
      const matchesEmail = Boolean(myEmail && evtEmail && evtEmail === myEmail);
      return matchesPic || matchesEmail;
    })
    .sort((a, b) => {
      const aTime = a.createdAtIso || `${a.date}T${a.startTime || '00:00'}:00.000Z`;
      const bTime = b.createdAtIso || `${b.date}T${b.startTime || '00:00'}:00.000Z`;
      return bTime.localeCompare(aTime) || b.id.localeCompare(a.id);
    });
}

export interface ExpandedPersonalReminderOccurrence {
  reminder: import('../types/outlet').PersonalReminder;
  occurrenceDate: string;
  isRecurring: boolean;
}

export function expandPersonalRemindersForRange(
  reminders: import('../types/outlet').PersonalReminder[],
  rangeStart: string,
  rangeEnd: string
): ExpandedPersonalReminderOccurrence[] {
  const pseudoEvents = reminders.map((r) => ({
    ...r,
    visibleTo: [] as OperationalRoleId[],
  })) as unknown as CalendarEvent[];
  const byId = new Map(reminders.map((r) => [r.id, r]));
  return expandCalendarEventsForRange(pseudoEvents, rangeStart, rangeEnd)
    .map((occ) => {
      const reminder = byId.get(occ.event.id);
      if (!reminder) return null;
      return {
        reminder,
        occurrenceDate: occ.occurrenceDate,
        isRecurring: occ.isRecurring,
      };
    })
    .filter((x): x is ExpandedPersonalReminderOccurrence => x !== null);
}
