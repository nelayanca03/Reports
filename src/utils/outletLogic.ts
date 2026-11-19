import {
  AccountProfile,
  AccountRole,
  CalculatedTask,
  CalendarEvent,
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
  VisitEntry,
  VisitItem,
  VisitPersonStats,
} from '../types/outlet';

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

export const DEFAULT_START = '2026-11-02';
export const DEFAULT_NDAYS = 25;
export const MIN_WORKSPACE_MONTH = '2026-11';
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
  if (taskDef?.inputType === 'month' || taskDef?.inputType === 'date') {
    return taskDef.inputType;
  }
  return taskDef?.formulaType === 'memo_month' ? 'month' : 'date';
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
  if (formulaType === 'ref_task' && refLabel) {
    return toleranceOffset === 0
      ? `Selisih hari terhadap tgl update ${refLabel}`
      : `Selisih hari terhadap tgl update ${refLabel} (${toleranceOffset >= 0 ? `+${toleranceOffset}` : toleranceOffset})`;
  }
  return `Selisih hari terhadap tanggal kerja ${signed}`;
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

export function toWibIsoDate(isoTimestamp?: string): string {
  if (!isoTimestamp) return '';
  const ms = Date.parse(isoTimestamp);
  if (Number.isNaN(ms)) return '';
  return new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return '';
  const datePart = d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
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
  return tasks.some((t) => {
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
  _tasks: TaskDefinition[],
  outlet: string,
  day: string,
  taskKey: string
): ResolvedEntry {
  const outletMap = state.ent[outlet] || {};
  const ownEntry: EntryItem | undefined = outletMap[`${day}|${taskKey}`];
  const idx = days.indexOf(day);
  for (let k = idx; k >= 0; k--) {
    const candidateDay = days[k];
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
  const daysSincePeriodStart = Math.max(1, diffWorkingDays(day, periodStart) + 1);

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

export function calcRecap(
  state: OutletStoreState,
  days: string[],
  tasks: TaskDefinition[],
  outlet: string,
  person: string,
  taskKey: string,
  upto: string,
  today: string = todayIso()
): OutletRecap {
  const effectiveUpto = upto && upto > today ? today : upto;
  const ds = days.filter((d) => d <= effectiveUpto && !isSunday(d));
  if (!ds.length) {
    const fallback = calcTask(state, days, tasks, outlet, days[0] || effectiveUpto, taskKey, today);
    return {
      outlet,
      person,
      avg: 0,
      pend: 0,
      latestDate: fallback.d,
      latestPm: fallback.d ? fallback.pm : 0,
      latestPend: fallback.d ? fallback.pend : false,
      latestNote: fallback.n,
      hasAnyInput: Boolean(fallback.d),
      backfillCount: fallback.backfillDays ? 1 : 0,
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
  today: string = todayIso()
): { elapsedDays: number; grandTotalVisits: number; rows: VisitPersonStats[] } {
  const workingDays = days.filter((d) => !isSunday(d));
  const elapsedDays = workingDays.filter((d) => d <= today).length;
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
    return {
      person,
      visitedCount,
      totalVisits,
      elapsedDays,
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

function escapeCsv(val: string | number): string {
  const str = String(val ?? '');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateDailyFleetCsv(
  state: OutletStoreState,
  days: string[],
  config: RoleConfig,
  day: string,
  today: string = todayIso(),
  includeFormula: boolean = true
): string {
  const header = [
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
  const rows: string[] = [header.map(escapeCsv).join(',')];

  for (const { code: outlet, person } of config.outlets) {
    for (const t of config.tasks) {
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
      const isMonthly = getTaskInputType(t) === 'month';
      const displayDate = c.d ? (isMonthly ? c.d.slice(0, 7) : c.d) : '';
      rows.push(
        [
          config.label,
          day,
          person,
          outlet,
          t.label,
          displayDate,
          sourceLabel,
          ...(includeFormula ? [c.rumus, c.pm] : []),
          c.pend ? 'PENDING' : 'UPDATE',
          c.n,
        ]
          .map(escapeCsv)
          .join(',')
      );
    }
  }
  return rows.join('\n');
}

export function generateRecapCsv(
  state: OutletStoreState,
  days: string[],
  config: RoleConfig,
  taskKey: string,
  upto: string,
  today: string = todayIso()
): string {
  const taskDef = config.tasks.find((t) => t.key === taskKey);
  const header = [
    'Ranking',
    'Role',
    'Item',
    'Per Tanggal',
    'Outlet',
    'PIC',
    'Tgl Update Terakhir',
    '+/- Terakhir',
    'Rata-rata Telat',
    'Hari Pending',
    'Status Terakhir',
  ];
  const effectiveUpto = upto && upto > today ? today : upto;
  const recaps = config.outlets
    .map(({ code: outlet, person }) =>
      calcRecap(state, days, config.tasks, outlet, person, taskKey, effectiveUpto, today)
    )
    .sort((a, b) => Number(a.hasAnyInput) - Number(b.hasAnyInput) || a.avg - b.avg);

  const isMonthly = getTaskInputType(taskDef) === 'month';
  const rows: string[] = [header.map(escapeCsv).join(',')];
  recaps.forEach((r, idx) => {
    const displayLatest = r.latestDate
      ? isMonthly
        ? r.latestDate.slice(0, 7)
        : r.latestDate
      : 'Belum pernah input';
    rows.push(
      [
        idx + 1,
        config.label,
        taskDef?.label || taskKey,
        effectiveUpto,
        r.outlet,
        r.person,
        displayLatest,
        r.hasAnyInput ? r.latestPm : '—',
        r.avg.toFixed(1),
        r.pend,
        !r.hasAnyInput ? 'BELUM INPUT' : r.latestPend ? 'PENDING' : 'UPDATE',
      ]
        .map(escapeCsv)
        .join(',')
    );
  });
  return rows.join('\n');
}

export function generateVisitCsv(
  state: OutletStoreState,
  days: string[],
  config: RoleConfig
): string {
  const header = [
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
  const rows: string[] = [header.map(escapeCsv).join(',')];
  const personList = getPersonList(config.outlets);

  for (const person of personList) {
    for (const day of days) {
      const v = state.visit[`${person}|${day}`];
      const entries = v?.ok ? getVisitEntries(v) : [];
      if (v?.ok && entries.length > 0) {
        entries.forEach((entry, idx) => {
          rows.push(
            [
              config.label,
              person,
              day,
              'Ya',
              idx === 0 ? entries.length : '',
              entry.outlet || '-',
              entry.f || '',
              entry.t || '',
              entry.n || '',
            ]
              .map(escapeCsv)
              .join(',')
          );
        });
      } else {
        rows.push(
          [
            config.label,
            person,
            day,
            v?.ok ? 'Ya' : 'Tidak',
            v?.ok ? 1 : 0,
            v?.outlet || '',
            v?.f || '',
            v?.t || '',
            v?.n || '',
          ]
            .map(escapeCsv)
            .join(',')
        );
      }
    }
  }
  return rows.join('\n');
}

export function generateInputLogsCsv(logs: InputLogEntry[]): string {
  const header = [
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
  const rows: string[] = [header.map(escapeCsv).join(',')];
  for (const log of logs) {
    rows.push(
      [
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
      ]
        .map(escapeCsv)
        .join(',')
    );
  }
  return rows.join('\n');
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
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

export function canUserViewCalendarEvent(
  event: Pick<CalendarEvent, 'visibleTo'>,
  accountRole: AccountRole
): boolean {
  if (accountRole === 'admin' || accountRole === 'accounting') return true;
  return event.visibleTo.includes(accountRole);
}

export function formatCalendarVisibleLabel(visibleTo: OperationalRoleId[]): string {
  const normalized = normalizeCalendarVisibleTo(visibleTo);
  if (normalized.length === 3) return 'Semua Departemen';
  return normalized.map((r) => ROLE_LABELS[r] || r).join(', ');
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
