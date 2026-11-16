import {
  AccountRole,
  CalculatedTask,
  EntryItem,
  OperationalRoleId,
  OutletAssignment,
  OutletRecap,
  OutletStoreState,
  ResolvedEntry,
  RoleConfig,
  TaskDefinition,
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
export const LEGACY_STORAGE_KEY = 'disc-v1';

export const STOCK_ACCOUNTING_TASKS: TaskDefinition[] = [
  {
    key: 'memo',
    label: 'Memo Penyelesaian Discrepancy',
    shortLabel: 'Memo',
    defaultDate: '2026-09-01',
    formulaType: 'memo_month',
    formulaNote: 'Selisih bulan terhadap hari ini + 1',
  },
  {
    key: 'ham',
    label: 'HAM SPC',
    shortLabel: 'HAM SPC',
    defaultDate: '2026-10-30',
    formulaType: 'daily_plus_1',
    formulaNote: 'Selisih hari terhadap tanggal kerja + 1',
  },
  {
    key: 'bm',
    label: 'Barang Masuk',
    shortLabel: 'Brg Masuk',
    defaultDate: '2026-10-29',
    formulaType: 'ref_task',
    refTaskKey: 'ham',
    formulaNote: 'Selisih hari terhadap tgl update HAM SPC',
  },
  {
    key: 'jual',
    label: 'Penjualan',
    shortLabel: 'Penjualan',
    defaultDate: '2026-10-31',
    formulaType: 'daily_plus_1',
    formulaNote: 'Selisih hari terhadap tanggal kerja + 1',
  },
  {
    key: 'konv',
    label: 'Konversi',
    shortLabel: 'Konversi',
    defaultDate: '2026-10-31',
    formulaType: 'daily_plus_1',
    formulaNote: 'Selisih hari terhadap tanggal kerja + 1',
  },
  {
    key: 'bt',
    label: 'BT',
    shortLabel: 'BT',
    defaultDate: '2026-10-31',
    formulaType: 'daily_plus_1',
    formulaNote: 'Selisih hari terhadap tanggal kerja + 1',
  },
];

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

export function isSunday(isoStr: string): boolean {
  if (!isoStr) return false;
  const d = parseUtcDate(isoStr);
  return !Number.isNaN(d.getTime()) && d.getUTCDay() === 0;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDate(isoStr: string): string {
  if (!isoStr) return '—';
  const d = parseUtcDate(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
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

export function nearestWorkingDay(days: string[], targetIso: string): string {
  if (!days.length) return targetIso;
  const eligible = days.filter((d) => d <= targetIso);
  return eligible.length ? eligible[eligible.length - 1] : days[0];
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
  const idx = days.indexOf(day);
  for (let k = idx; k >= 0; k--) {
    const candidateDay = days[k];
    const e: EntryItem | undefined = outletMap[`${candidateDay}|${taskKey}`];
    if (e && e.d) {
      const isOwn = k === idx;
      return {
        d: e.d,
        n: isOwn ? e.n || '' : '',
        own: isOwn,
        source: isOwn ? 'own' : 'inherited',
        sourceDay: candidateDay,
      };
    }
  }
  const taskDef = tasks.find((t) => t.key === taskKey);
  return {
    d: taskDef?.defaultDate || DEFAULT_START,
    n: '',
    own: false,
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

  let rumus: string;
  let pm: number;

  if (formulaType === 'memo_month') {
    rumus = today;
    const a = parseUtcDate(resolved.d);
    const b = parseUtcDate(today);
    pm = (a.getUTCFullYear() - b.getUTCFullYear()) * 12 + a.getUTCMonth() - b.getUTCMonth() + 1;
  } else if (formulaType === 'ref_task' && taskDef?.refTaskKey) {
    rumus = getEntry(state, days, tasks, outlet, day, taskDef.refTaskKey).d;
    pm = diffDays(resolved.d, rumus);
  } else {
    rumus = day;
    pm = diffDays(resolved.d, rumus) + 1;
  }

  return {
    ...resolved,
    task: taskKey,
    label: taskDef?.label || taskKey,
    rumus,
    pm,
    pend: pm < 0,
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
  const ds = days.filter((d) => d <= upto && !isSunday(d));
  if (!ds.length) {
    const fallback = calcTask(state, days, tasks, outlet, days[0] || upto, taskKey, today);
    return {
      outlet,
      person,
      avg: 0,
      pend: 0,
      latestDate: fallback.d,
      latestPm: fallback.pm,
      latestPend: fallback.pend,
      latestNote: fallback.n,
    };
  }

  let sum = 0;
  let pendCount = 0;
  let latest = calcTask(state, days, tasks, outlet, ds[0], taskKey, today);

  for (const d of ds) {
    const c = calcTask(state, days, tasks, outlet, d, taskKey, today);
    sum += c.pm;
    if (c.pend) pendCount++;
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
  };
}

export function calcVisitLeaderboard(
  state: OutletStoreState,
  days: string[],
  personList: string[],
  today: string = todayIso()
): { elapsedDays: number; rows: VisitPersonStats[] } {
  const workingDays = days.filter((d) => !isSunday(d));
  const elapsedDays = workingDays.filter((d) => d <= today).length;
  const rows = personList
    .map((person) => {
      const visitedCount = workingDays.filter((d) => Boolean(state.visit[`${person}|${d}`]?.ok)).length;
      return {
        person,
        visitedCount,
        elapsedDays,
        rate: elapsedDays ? visitedCount / elapsedDays : 0,
      };
    })
    .sort((a, b) => b.visitedCount - a.visitedCount || b.rate - a.rate);

  return { elapsedDays, rows };
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
  today: string = todayIso()
): string {
  const header = [
    'Role',
    'Tanggal Kerja',
    'PIC',
    'Outlet',
    'Item',
    'Tgl Update',
    'Sumber',
    'Rumus',
    '+/-',
    'Status',
    'Keterangan',
  ];
  const rows: string[] = [header.map(escapeCsv).join(',')];

  for (const { code: outlet, person } of config.outlets) {
    for (const t of config.tasks) {
      const c = calcTask(state, days, config.tasks, outlet, day, t.key, today);
      const sourceLabel =
        c.source === 'own'
          ? 'Diisi hari ini'
          : c.source === 'inherited'
            ? `Ikut ${c.sourceDay}`
            : 'Default';
      rows.push(
        [
          config.label,
          day,
          person,
          outlet,
          t.label,
          c.d,
          sourceLabel,
          c.rumus,
          c.pm,
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
  const recaps = config.outlets
    .map(({ code: outlet, person }) =>
      calcRecap(state, days, config.tasks, outlet, person, taskKey, upto, today)
    )
    .sort((a, b) => a.avg - b.avg);

  const rows: string[] = [header.map(escapeCsv).join(',')];
  recaps.forEach((r, idx) => {
    rows.push(
      [
        idx + 1,
        config.label,
        taskDef?.label || taskKey,
        upto,
        r.outlet,
        r.person,
        r.latestDate,
        r.latestPm,
        r.avg.toFixed(1),
        r.pend,
        r.latestPend ? 'PENDING' : 'UPDATE',
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
  const header = ['Role', 'PIC', 'Tanggal Kerja', 'Dikunjungi', 'Dari Jam', 'Ke Jam', 'Keterangan'];
  const rows: string[] = [header.map(escapeCsv).join(',')];
  const personList = getPersonList(config.outlets);

  for (const person of personList) {
    for (const day of days) {
      const v = state.visit[`${person}|${day}`];
      rows.push(
        [
          config.label,
          person,
          day,
          v?.ok ? 'Ya' : 'Tidak',
          v?.f || '',
          v?.t || '',
          v?.n || '',
        ]
          .map(escapeCsv)
          .join(',')
      );
    }
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
