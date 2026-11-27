import {
  InputLogEntry,
  OperationalRoleId,
  OutletStoreState,
  RoleConfig,
} from '../types/outlet';
import {
  DAY_ADJUSTMENT_TYPE_LABELS,
  OPERATIONAL_ROLES,
  ROLE_LABELS,
  buildMonthsWorkingDays,
  calcRecap,
  calcTask,
  calcVisitLeaderboard,
  escapeCsvCell,
  fmtDate,
  fmtDateLong,
  fmtDateTimeWithSeconds,
  fmtMonth,
  fmtWeek,
  getAdjustmentForPersonDay,
  getPeopleMap,
  getPersonList,
  getSelectableMonths,
  getTaskInputType,
  getVisitEntries,
  isSunday,
  parseUtcDate,
  toIsoUtc,
} from './outletLogic';

export type ExportPeriod = 'harian' | 'mingguan' | 'bulanan';

export type ExportReportId =
  | 'harian_pending'
  | 'harian_pic_summary'
  | 'harian_detail'
  | 'harian_audit_log'
  | 'mingguan_matrix'
  | 'mingguan_visit'
  | 'mingguan_leaderboard'
  | 'bulanan_kpi'
  | 'bulanan_all_tasks'
  | 'bulanan_visit_category';

export interface ExportReportOption {
  id: ExportReportId;
  period: ExportPeriod;
  label: string;
  description: string;
  supportsStatusFilter: boolean;
}

export const EXPORT_REPORT_OPTIONS: ExportReportOption[] = [
  {
    id: 'harian_pending',
    period: 'harian',
    label: 'Pending Harian (Action List)',
    description: 'Khusus outlet & tugas yang masih PENDING pada tanggal terpilih untuk follow-up cepat.',
    supportsStatusFilter: false,
  },
  {
    id: 'harian_pic_summary',
    period: 'harian',
    label: 'Ringkasan Kepatuhan PIC Harian',
    description: 'Rekap jumlah outlet lengkap, tugas update/pending, dan kunjungan tiap PIC per hari.',
    supportsStatusFilter: false,
  },
  {
    id: 'harian_detail',
    period: 'harian',
    label: 'Detail Update Harian Lengkap',
    description: 'Seluruh baris tugas harian per outlet lengkap dengan tanggal update, sumber, rumus, dan keterangan.',
    supportsStatusFilter: true,
  },
  {
    id: 'harian_audit_log',
    period: 'harian',
    label: 'Log Aktivitas Penginputan Harian',
    description: 'Riwayat penginputan harian & kunjungan seluruh akun user pada tanggal kerja terpilih.',
    supportsStatusFilter: false,
  },
  {
    id: 'mingguan_matrix',
    period: 'mingguan',
    label: 'Matriks Status Mingguan (Outlet × Hari)',
    description: 'Tabel status Senin–Sabtu per outlet dan tugas untuk melihat pola keterlambatan mingguan.',
    supportsStatusFilter: true,
  },
  {
    id: 'mingguan_visit',
    period: 'mingguan',
    label: 'Rekap Kunjungan Mingguan (Jam & Durasi)',
    description: 'Detail kunjungan selama 1 minggu lengkap dengan outlet, jam mulai–selesai, durasi, dan kategori.',
    supportsStatusFilter: false,
  },
  {
    id: 'mingguan_leaderboard',
    period: 'mingguan',
    label: 'Leaderboard Kedisiplinan Mingguan',
    description: 'Peringkat kepatuhan tugas, rata-rata selisih (+/-), dan jumlah kunjungan PIC dalam 1 minggu.',
    supportsStatusFilter: false,
  },
  {
    id: 'bulanan_kpi',
    period: 'bulanan',
    label: 'Scorecard KPI Bulanan PIC (Tugas + Kunjungan)',
    description: 'Ringkasan KPI bulanan gabungan per PIC: % kepatuhan tugas, rata-rata (+/-), porsi kunjungan & rinciannya.',
    supportsStatusFilter: false,
  },
  {
    id: 'bulanan_all_tasks',
    period: 'bulanan',
    label: 'Rekap Semua Tugas Bulanan (All Tasks)',
    description: 'Seluruh tugas dalam 1 file per outlet dengan rata-rata (+/-) dan total hari pending tiap tugas.',
    supportsStatusFilter: true,
  },
  {
    id: 'bulanan_visit_category',
    period: 'bulanan',
    label: 'Frekuensi Kunjungan (Outlet × Kategori)',
    description: 'Jumlah kunjungan per outlet dipecah per kategori (Stock Opname, Asset, Discrepancy, Inventory, Meeting, Custom).',
    supportsStatusFilter: false,
  },
];

export interface WeekRangeOption {
  key: string;
  label: string;
  days: string[];
  startDay: string;
  endDay: string;
}

export interface MonthRangeOption {
  key: string;
  label: string;
  days: string[];
}

export interface PreviewRow {
  key: string;
  status?: 'UPDATE' | 'PENDING';
  cells: Array<string | number>;
}

export interface ExportReportResult {
  columns: string[];
  rows: PreviewRow[];
  filename: string;
  subtitle: string;
}

const VISIT_CATEGORY_LIST = [
  'Stock Opname',
  'Pengecekkan Asset',
  'Pengecekkan Discrepancy',
  'Pengecekkan Inventory',
  'Meeting',
] as const;

export function classifyVisitCategory(rawNote: string): string {
  const clean = rawNote.trim();
  for (const cat of VISIT_CATEGORY_LIST) {
    if (clean === cat || clean.startsWith(`${cat} — `)) {
      return cat;
    }
  }
  return 'Custom / Lainnya';
}

function calcDurationText(fromTime: string, toTime: string): string {
  if (!fromTime || !toTime) return '-';
  const [fh, fm] = fromTime.split(':').map(Number);
  const [th, tm] = toTime.split(':').map(Number);
  if ([fh, fm, th, tm].some((n) => Number.isNaN(n))) return '-';
  const diff = th * 60 + tm - (fh * 60 + fm);
  if (diff <= 0) return '-';
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours > 0 && mins > 0) return `${hours}j ${mins}m`;
  if (hours > 0) return `${hours} jam`;
  return `${mins} mnt`;
}

function getMondayKey(isoStr: string): string {
  const d = parseUtcDate(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  const dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + diffToMon);
  return toIsoUtc(d);
}

export function buildWeekOptions(days: string[]): WeekRangeOption[] {
  const map = new Map<string, string[]>();
  for (const d of days) {
    if (isSunday(d)) continue;
    const monKey = getMondayKey(d);
    const arr = map.get(monKey) || [];
    arr.push(d);
    map.set(monKey, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, weekDays], idx) => {
      const startDay = weekDays[0];
      const endDay = weekDays[weekDays.length - 1];
      return {
        key,
        days: weekDays,
        startDay,
        endDay,
        label: `Minggu ${idx + 1} (${fmtDate(startDay)} – ${fmtDateLong(endDay)})`,
      };
    });
}

export function buildMonthOptions(days: string[]): MonthRangeOption[] {
  const map = new Map<string, string[]>();
  for (const d of days) {
    if (isSunday(d)) continue;
    const monthKey = d.slice(0, 7);
    const arr = map.get(monthKey) || [];
    arr.push(d);
    map.set(monthKey, arr);
  }
  const monthItems: MonthRangeOption[] = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, mDays]) => ({
      key,
      label: fmtMonth(`${key}-01`),
      days: mDays,
    }));

  if (days.length > 0) {
    monthItems.push({
      key: 'ALL',
      label: `Semua Periode (${fmtDate(days[0])} – ${fmtDateLong(days[days.length - 1])})`,
      days: days.filter((d) => !isSunday(d)),
    });
  }
  return monthItems;
}

export interface BuildExportReportParams {
  reportId: ExportReportId;
  roleFilter: 'ALL' | OperationalRoleId;
  roleConfigs: Record<OperationalRoleId, RoleConfig>;
  allWorkspaces: Record<OperationalRoleId, OutletStoreState>;
  inputLogs: InputLogEntry[];
  availableDays?: string[];
  today: string;
  targetDay: string;
  dateMode?: 'single' | 'range';
  rangeFrom?: string;
  rangeTo?: string;
  weekOption?: WeekRangeOption;
  monthOption?: MonthRangeOption;
  picFilter: string;
  outletFilter: string;
  statusFilter: 'ALL' | 'UPDATE' | 'PENDING';
  searchQuery: string;
}

function getRoleTargetIds(roleFilter: 'ALL' | OperationalRoleId): OperationalRoleId[] {
  return roleFilter === 'ALL'
    ? OPERATIONAL_ROLES.map((r) => r.id)
    : [roleFilter];
}

function applyRowFilters(
  rows: PreviewRow[],
  statusFilter: 'ALL' | 'UPDATE' | 'PENDING',
  supportsStatusFilter: boolean,
  searchQuery: string
): PreviewRow[] {
  const q = searchQuery.trim().toLowerCase();
  return rows.filter((row) => {
    if (supportsStatusFilter && statusFilter !== 'ALL' && row.status && row.status !== statusFilter) {
      return false;
    }
    if (q) {
      const joined = row.cells.map((c) => String(c ?? '')).join(' ').toLowerCase();
      if (!joined.includes(q)) return false;
    }
    return true;
  });
}

export function buildExportReport(params: BuildExportReportParams): ExportReportResult {
  const {
    reportId,
    roleFilter,
    roleConfigs,
    allWorkspaces,
    inputLogs,
    availableDays,
    today,
    targetDay,
    dateMode = 'single',
    rangeFrom,
    rangeTo,
    weekOption,
    monthOption,
    picFilter,
    outletFilter,
    statusFilter,
    searchQuery,
  } = params;

  const calendarDays =
    availableDays && availableDays.length > 0
      ? availableDays
      : buildMonthsWorkingDays(getSelectableMonths(today));
  const meta = EXPORT_REPORT_OPTIONS.find((o) => o.id === reportId) || EXPORT_REPORT_OPTIONS[0];
  const targetRoleIds = getRoleTargetIds(roleFilter);
  const roleSlug = roleFilter === 'ALL' ? 'semua-role' : roleFilter;

  const hasCustomRange = dateMode === 'range' && Boolean(rangeFrom || rangeTo);
  const rawFrom = (rangeFrom || rangeTo || targetDay).trim();
  const rawTo = (rangeTo || rangeFrom || targetDay).trim();
  const effRangeFrom = rawFrom <= rawTo ? rawFrom : rawTo;
  const effRangeTo = rawFrom <= rawTo ? rawTo : rawFrom;

  const harianDays = hasCustomRange
    ? calendarDays.filter((d) => !isSunday(d) && d >= effRangeFrom && d <= effRangeTo)
    : targetDay
      ? [targetDay]
      : [];
  const harianLabel = hasCustomRange
    ? `${fmtDate(effRangeFrom)} – ${fmtDateLong(effRangeTo)}`
    : fmtDateLong(targetDay);
  const harianFileSlug = hasCustomRange ? `${effRangeFrom}_sd_${effRangeTo}` : targetDay;

  let columns: string[] = [];
  let rawRows: PreviewRow[] = [];
  let filename = `${reportId}-${roleSlug}-${today}.xlsx`;
  let subtitle = '';

  if (reportId === 'harian_pending' || reportId === 'harian_detail') {
    const onlyPending = reportId === 'harian_pending';
    columns = onlyPending
      ? ['Role', 'Tanggal Kerja', 'PIC', 'Outlet', 'Tugas Belum Update', 'Tgl Update Terakhir', 'Selisih (+/-)', 'Keterangan']
      : ['Role', 'Tanggal Kerja', 'PIC', 'Outlet', 'Tugas', 'Tgl Update', 'Sumber', 'Rumus', '+/-', 'Status', 'Keterangan'];
    subtitle = `Tanggal Kerja: ${harianLabel}`;
    filename = `${onlyPending ? 'pending-harian' : 'detail-harian'}-${roleSlug}-${harianFileSlug}.xlsx`;

    for (const dayItem of harianDays) {
      for (const rId of targetRoleIds) {
        const cfg = roleConfigs[rId];
        const ws = allWorkspaces[rId];
        const rDays = calendarDays;
        if (!rDays.includes(dayItem)) continue;

        for (const { code: outlet, person } of cfg.outlets) {
          if (picFilter !== 'ALL' && person !== picFilter) continue;
          if (outletFilter !== 'ALL' && outlet !== outletFilter) continue;
          const dayAdj = getAdjustmentForPersonDay(cfg.dayAdjustments, person, dayItem);
          if (onlyPending && dayAdj) continue;

          for (const t of cfg.tasks) {
            const c = calcTask(ws, rDays, cfg.tasks, outlet, dayItem, t.key, today);
            if (onlyPending && !c.pend) continue;

            const inputType = getTaskInputType(t);
            const displayD = c.d
              ? inputType === 'month'
                ? fmtMonth(c.d)
                : inputType === 'week'
                  ? fmtWeek(c.d)
                  : fmtDateLong(c.d)
              : 'Belum diinput';
            const signedPm = !c.d ? '—' : c.pm > 0 ? `+${c.pm}` : `${c.pm}`;

            if (onlyPending) {
              rawRows.push({
                key: `${dayItem}|${rId}|${outlet}|${t.key}`,
                status: 'PENDING',
                cells: [
                  cfg.label,
                  fmtDateLong(dayItem),
                  person,
                  outlet,
                  t.label,
                  displayD,
                  signedPm,
                  c.n || '-',
                ],
              });
            } else {
              const tsFormatted = c.ts ? fmtDateTimeWithSeconds(c.ts) : '';
              const sourceLabel =
                c.source === 'own'
                  ? tsFormatted
                    ? `Diinput (${tsFormatted})`
                    : 'Diinput'
                  : c.source === 'inherited' && c.sourceDay
                    ? `Ikut ${fmtDate(c.sourceDay)}${tsFormatted ? ` (${tsFormatted})` : ''}`
                    : 'Belum diinput';
              const rumusLabel =
                inputType === 'month'
                  ? fmtMonth(c.rumus)
                  : inputType === 'week'
                    ? c.rumus
                      ? fmtWeek(c.rumus)
                      : '—'
                    : c.rumus
                      ? fmtDateLong(c.rumus)
                      : '—';
              rawRows.push({
                key: `${dayItem}|${rId}|${outlet}|${t.key}`,
                status: c.pend ? 'PENDING' : 'UPDATE',
                cells: [
                  cfg.label,
                  fmtDateLong(dayItem),
                  person,
                  outlet,
                  t.label,
                  displayD,
                  sourceLabel,
                  rumusLabel,
                  signedPm,
                  c.pend ? 'PENDING' : 'UPDATE',
                  c.n || '-',
                ],
              });
            }
          }
        }
      }
    }
  } else if (reportId === 'harian_pic_summary') {
    columns = [
      'Role',
      'Tanggal Kerja',
      'PIC',
      'Jumlah Outlet',
      'Outlet Lengkap',
      'Tugas Update',
      'Tugas Pending',
      'Kepatuhan (%)',
      'Kunjungan Hari Ini',
      'Outlet Dikunjungi',
    ];
    subtitle = `Ringkasan PIC · ${harianLabel}`;
    filename = `ringkasan-pic-harian-${roleSlug}-${harianFileSlug}.xlsx`;

    for (const dayItem of harianDays) {
      for (const rId of targetRoleIds) {
        const cfg = roleConfigs[rId];
        const ws = allWorkspaces[rId];
        const rDays = calendarDays;
        if (!rDays.includes(dayItem)) continue;
        const peopleMap = getPeopleMap(cfg.outlets);
        const personList = getPersonList(cfg.outlets);

        for (const person of personList) {
          if (picFilter !== 'ALL' && person !== picFilter) continue;
          const outlets = (peopleMap[person] || []).filter(
            (o) => outletFilter === 'ALL' || o === outletFilter
          );
          if (outlets.length === 0) continue;
          const dayAdj = getAdjustmentForPersonDay(cfg.dayAdjustments, person, dayItem);
          if (dayAdj) {
            const v = ws.visit[`${person}|${dayItem}`];
            const visitEntries = v?.ok ? getVisitEntries(v) : [];
            const visitedOutlets = Array.from(
              new Set(visitEntries.map((e) => e.outlet).filter(Boolean))
            ).join(', ');
            rawRows.push({
              key: `${dayItem}|${rId}|${person}`,
              status: 'UPDATE',
              cells: [
                cfg.label,
                fmtDateLong(dayItem),
                person,
                outlets.length,
                0,
                0,
                0,
                DAY_ADJUSTMENT_TYPE_LABELS[dayAdj.type],
                v?.ok ? `${Math.max(1, visitEntries.length)}x` : '0x',
                visitedOutlets || '-',
              ],
            });
            continue;
          }

          let completeOutlets = 0;
          let updatedTasks = 0;
          let pendingTasks = 0;
          for (const outlet of outlets) {
            let outletPend = 0;
            for (const t of cfg.tasks) {
              const c = calcTask(ws, rDays, cfg.tasks, outlet, dayItem, t.key, today);
              if (c.pend) {
                pendingTasks++;
                outletPend++;
              } else {
                updatedTasks++;
              }
            }
            if (cfg.tasks.length > 0 && outletPend === 0) completeOutlets++;
          }
          const totalTasks = updatedTasks + pendingTasks;
          const pct = totalTasks > 0 ? Math.round((updatedTasks / totalTasks) * 100) : 0;

          const v = ws.visit[`${person}|${dayItem}`];
          const visitEntries = v?.ok ? getVisitEntries(v) : [];
          const visitedOutlets = Array.from(
            new Set(visitEntries.map((e) => e.outlet).filter(Boolean))
          ).join(', ');

          rawRows.push({
            key: `${dayItem}|${rId}|${person}`,
            status: pendingTasks > 0 ? 'PENDING' : 'UPDATE',
            cells: [
              cfg.label,
              fmtDateLong(dayItem),
              person,
              outlets.length,
              completeOutlets,
              updatedTasks,
              pendingTasks,
              `${pct}%`,
              v?.ok ? `${Math.max(1, visitEntries.length)}x` : '0x',
              visitedOutlets || '-',
            ],
          });
        }
      }
    }
  } else if (reportId === 'harian_audit_log') {
    columns = [
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
    subtitle = `Log Aktivitas Tanggal Kerja ${harianLabel}`;
    filename = `audit-log-harian-${roleSlug}-${harianFileSlug}.xlsx`;

    for (const log of inputLogs) {
      if (hasCustomRange) {
        if (log.day < effRangeFrom || log.day > effRangeTo) continue;
      } else if (log.day !== targetDay) {
        continue;
      }
      if (roleFilter !== 'ALL' && log.roleId !== roleFilter) continue;
      if (picFilter !== 'ALL' && log.pic !== picFilter) continue;
      if (outletFilter !== 'ALL') {
        const logOutlets = log.outlet.split(',').map((s) => s.trim());
        if (!logOutlets.includes(outletFilter)) continue;
      }
      rawRows.push({
        key: log.id,
        cells: [
          fmtDateTimeWithSeconds(log.clientTs) || log.clientTs,
          log.userName,
          log.userEmail,
          ROLE_LABELS[log.userRole] || log.userRole,
          log.actionType === 'kunjungan' ? 'Kunjungan' : 'Input Harian',
          log.roleLabel,
          fmtDateLong(log.day),
          log.pic || '-',
          log.outlet || '-',
          log.itemCount,
          log.details,
        ],
      });
    }
  } else if (reportId === 'mingguan_matrix') {
    const wDays = weekOption?.days || [];
    columns = [
      'Role',
      'PIC',
      'Outlet',
      'Tugas',
      ...wDays.map((d) => fmtDate(d)),
      'Total Update',
      'Total Pending',
    ];
    subtitle = weekOption ? weekOption.label : 'Minggu tidak tersedia';
    filename = `matriks-mingguan-${roleSlug}-${weekOption?.startDay || today}.xlsx`;

    for (const rId of targetRoleIds) {
      const cfg = roleConfigs[rId];
      const ws = allWorkspaces[rId];
      const rDays = calendarDays;

      for (const { code: outlet, person } of cfg.outlets) {
        if (picFilter !== 'ALL' && person !== picFilter) continue;
        if (outletFilter !== 'ALL' && outlet !== outletFilter) continue;

        for (const t of cfg.tasks) {
          let upd = 0;
          let pend = 0;
          const dayCells = wDays.map((d) => {
            if (!rDays.includes(d)) return '—';
            const c = calcTask(ws, rDays, cfg.tasks, outlet, d, t.key, today);
            if (c.pend) {
              pend++;
              return c.d ? `PENDING (${c.pm})` : 'PENDING';
            }
            upd++;
            return `UPDATE (+${c.pm})`;
          });

          rawRows.push({
            key: `${rId}|${outlet}|${t.key}`,
            status: pend > 0 ? 'PENDING' : 'UPDATE',
            cells: [cfg.label, person, outlet, t.label, ...dayCells, upd, pend],
          });
        }
      }
    }
  } else if (reportId === 'mingguan_visit') {
    const wDays = weekOption?.days || [];
    columns = [
      'Role',
      'Tanggal Kerja',
      'PIC',
      'Outlet',
      'Dari Jam',
      'Ke Jam',
      'Durasi',
      'Keterangan Kunjungan',
    ];
    subtitle = weekOption ? weekOption.label : 'Minggu tidak tersedia';
    filename = `kunjungan-mingguan-${roleSlug}-${weekOption?.startDay || today}.xlsx`;

    for (const rId of targetRoleIds) {
      const cfg = roleConfigs[rId];
      const ws = allWorkspaces[rId];
      const personList = getPersonList(cfg.outlets);

      for (const d of wDays) {
        for (const person of personList) {
          if (picFilter !== 'ALL' && person !== picFilter) continue;
          const v = ws.visit[`${person}|${d}`];
          if (!v?.ok) continue;
          const entries = getVisitEntries(v);
          entries.forEach((entry, idx) => {
            if (outletFilter !== 'ALL' && entry.outlet !== outletFilter) return;
            rawRows.push({
              key: `${rId}|${d}|${person}|${entry.id || idx}`,
              cells: [
                cfg.label,
                fmtDateLong(d),
                person,
                entry.outlet || '-',
                entry.f || '-',
                entry.t || '-',
                calcDurationText(entry.f, entry.t),
                entry.n || '-',
              ],
            });
          });
        }
      }
    }
  } else if (reportId === 'mingguan_leaderboard') {
    const wDays = weekOption?.days || [];
    columns = [
      'Ranking',
      'Role',
      'PIC',
      'Jumlah Outlet',
      'Total Slot Tugas',
      'Total Update',
      'Total Pending',
      'Kepatuhan (%)',
      'Rata-rata (+/-)',
      'Total Kunjungan',
    ];
    subtitle = weekOption ? weekOption.label : 'Minggu tidak tersedia';
    filename = `leaderboard-mingguan-${roleSlug}-${weekOption?.startDay || today}.xlsx`;

    const sortableRows: Array<{
      key: string;
      compliance: number;
      avgDelay: number;
      cells: Array<string | number>;
    }> = [];

    for (const rId of targetRoleIds) {
      const cfg = roleConfigs[rId];
      const ws = allWorkspaces[rId];
      const rDays = calendarDays;
      const activeWeekDays = wDays.filter((d) => rDays.includes(d));
      const peopleMap = getPeopleMap(cfg.outlets);
      const personList = getPersonList(cfg.outlets);

      for (const person of personList) {
        if (picFilter !== 'ALL' && person !== picFilter) continue;
        const outlets = (peopleMap[person] || []).filter(
          (o) => outletFilter === 'ALL' || o === outletFilter
        );
        if (outlets.length === 0) continue;

        let totalSlots = 0;
        let upd = 0;
        let pend = 0;
        let pmSum = 0;

        for (const d of activeWeekDays) {
          if (getAdjustmentForPersonDay(cfg.dayAdjustments, person, d)) continue;
          for (const outlet of outlets) {
            for (const t of cfg.tasks) {
              const c = calcTask(ws, rDays, cfg.tasks, outlet, d, t.key, today);
              totalSlots++;
              pmSum += c.pm;
              if (c.pend) pend++;
              else upd++;
            }
          }
        }

        let weekVisits = 0;
        for (const d of wDays) {
          const v = ws.visit[`${person}|${d}`];
          if (v?.ok) {
            weekVisits += Math.max(1, getVisitEntries(v).length);
          }
        }

        const compliance = totalSlots > 0 ? Math.round((upd / totalSlots) * 100) : 0;
        const avgDelay = totalSlots > 0 ? pmSum / totalSlots : 0;

        sortableRows.push({
          key: `${rId}|${person}`,
          compliance,
          avgDelay,
          cells: [
            0,
            cfg.label,
            person,
            outlets.length,
            totalSlots,
            upd,
            pend,
            `${compliance}%`,
            avgDelay.toFixed(2),
            `${weekVisits}x`,
          ],
        });
      }
    }

    sortableRows.sort((a, b) => b.compliance - a.compliance || b.avgDelay - a.avgDelay);
    rawRows = sortableRows.map((item, idx) => {
      const cells = [...item.cells];
      cells[0] = idx + 1;
      return { key: item.key, cells };
    });
  } else if (reportId === 'bulanan_kpi') {
    const mDays = hasCustomRange
      ? calendarDays.filter((d) => !isSunday(d) && d >= effRangeFrom && d <= effRangeTo)
      : monthOption?.days || [];
    const periodLabel = hasCustomRange ? harianLabel : monthOption?.label || '-';
    columns = [
      'Role',
      'Periode',
      'PIC',
      'Jumlah Outlet',
      'Hari Kerja Efektif',
      'Hari Adjustment',
      'Total Update',
      'Total Pending',
      'Kepatuhan Tugas (%)',
      'Rata-rata (+/-)',
      'Hari Kunjungan',
      'Total Kunjungan',
      'Porsi Kunjungan (%)',
      'Rincian Kategori Kunjungan',
    ];
    subtitle = `Periode: ${periodLabel}`;
    filename = `kpi-bulanan-pic-${roleSlug}-${hasCustomRange ? harianFileSlug : monthOption?.key || today}.xlsx`;

    for (const rId of targetRoleIds) {
      const cfg = roleConfigs[rId];
      const ws = allWorkspaces[rId];
      const rDays = calendarDays;
      const evalDays = mDays.filter((d) => rDays.includes(d) && d <= today);
      const peopleMap = getPeopleMap(cfg.outlets);
      const personList = getPersonList(cfg.outlets);
      const visitBoard = calcVisitLeaderboard(
        ws,
        mDays.length ? mDays : rDays,
        personList,
        today,
        hasCustomRange ? effRangeFrom : undefined,
        hasCustomRange ? effRangeTo : undefined,
        cfg.dayAdjustments
      );

      for (const person of personList) {
        if (picFilter !== 'ALL' && person !== picFilter) continue;
        const outlets = (peopleMap[person] || []).filter(
          (o) => outletFilter === 'ALL' || o === outletFilter
        );
        if (outlets.length === 0) continue;

        let totalSlots = 0;
        let upd = 0;
        let pend = 0;
        let pmSum = 0;
        let personEffectiveDays = 0;
        let personAdjustedDays = 0;
        for (const d of evalDays) {
          if (getAdjustmentForPersonDay(cfg.dayAdjustments, person, d)) {
            personAdjustedDays++;
            continue;
          }
          personEffectiveDays++;
          for (const outlet of outlets) {
            for (const t of cfg.tasks) {
              const c = calcTask(ws, rDays, cfg.tasks, outlet, d, t.key, today);
              totalSlots++;
              pmSum += c.pm;
              if (c.pend) pend++;
              else upd++;
            }
          }
        }

        const compliance = totalSlots > 0 ? Math.round((upd / totalSlots) * 100) : 0;
        const avgDelay = totalSlots > 0 ? pmSum / totalSlots : 0;
        const visitStat = visitBoard.rows.find((r) => r.person === person);

        const catCount: Record<string, number> = {};
        for (const d of mDays) {
          const v = ws.visit[`${person}|${d}`];
          if (!v?.ok) continue;
          for (const entry of getVisitEntries(v)) {
            if (outletFilter !== 'ALL' && entry.outlet !== outletFilter) continue;
            const cat = classifyVisitCategory(entry.n);
            catCount[cat] = (catCount[cat] || 0) + 1;
          }
        }
        const catSummary =
          Object.entries(catCount)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, cnt]) => `${cat}: ${cnt}x`)
            .join(', ') || '-';

        rawRows.push({
          key: `${rId}|${person}`,
          cells: [
            cfg.label,
            periodLabel,
            person,
            outlets.length,
            personEffectiveDays,
            personAdjustedDays,
            upd,
            pend,
            `${compliance}%`,
            avgDelay.toFixed(2),
            visitStat?.visitedCount || 0,
            `${visitStat?.totalVisits || 0}x`,
            `${Math.round((visitStat?.rate || 0) * 100)}%`,
            catSummary,
          ],
        });
      }
    }
  } else if (reportId === 'bulanan_all_tasks') {
    const mDays = hasCustomRange
      ? calendarDays.filter((d) => !isSunday(d) && d >= effRangeFrom && d <= effRangeTo)
      : monthOption?.days || [];
    const periodLabel = hasCustomRange ? harianLabel : monthOption?.label || '-';
    const uptoDay =
      (hasCustomRange ? (effRangeTo > today ? today : effRangeTo) : undefined) ||
      mDays.filter((d) => d <= today).slice(-1)[0] ||
      mDays[mDays.length - 1] ||
      today;

    const taskList: Array<{ key: string; shortLabel: string }> = [];
    for (const rId of targetRoleIds) {
      for (const t of roleConfigs[rId].tasks) {
        if (!taskList.some((x) => x.key === t.key)) {
          taskList.push({ key: t.key, shortLabel: t.shortLabel || t.label });
        }
      }
    }

    columns = [
      'Role',
      'Periode',
      'PIC',
      'Outlet',
      ...taskList.map((t) => `${t.shortLabel} (Avg | Pend)`),
      'Total Hari Pending',
      'Rata-rata Keseluruhan',
    ];
    subtitle = hasCustomRange
      ? `Rekap Semua Tugas · ${periodLabel}`
      : `Rekap Semua Tugas s.d. ${fmtDateLong(uptoDay)}`;
    filename = `rekap-semua-tugas-${roleSlug}-${hasCustomRange ? harianFileSlug : monthOption?.key || today}.xlsx`;

    for (const rId of targetRoleIds) {
      const cfg = roleConfigs[rId];
      const ws = allWorkspaces[rId];
      const rDays = calendarDays;
      const scopedDays = rDays.filter((d) => mDays.includes(d));
      const daysToCalc = scopedDays.length > 0 ? scopedDays : rDays;
      const calcUpto =
        daysToCalc.filter((d) => d <= today).slice(-1)[0] || daysToCalc[daysToCalc.length - 1] || uptoDay;

      for (const { code: outlet, person } of cfg.outlets) {
        if (picFilter !== 'ALL' && person !== picFilter) continue;
        if (outletFilter !== 'ALL' && outlet !== outletFilter) continue;

        let totalPend = 0;
        let avgSum = 0;
        let taskCount = 0;

        const taskCells = taskList.map((tCol) => {
          const matchingTask = cfg.tasks.find((t) => t.key === tCol.key);
          if (!matchingTask) return '—';
          const recap = calcRecap(
            ws,
            rDays,
            cfg.tasks,
            outlet,
            person,
            matchingTask.key,
            calcUpto,
            today,
            hasCustomRange ? effRangeFrom : daysToCalc[0],
            cfg.dayAdjustments
          );
          totalPend += recap.pend;
          avgSum += recap.avg;
          taskCount++;
          return `${recap.avg.toFixed(1)} | ${recap.pend} hr`;
        });

        const overallAvg = taskCount > 0 ? (avgSum / taskCount).toFixed(2) : '0.00';
        rawRows.push({
          key: `${rId}|${outlet}`,
          status: totalPend > 0 ? 'PENDING' : 'UPDATE',
          cells: [cfg.label, periodLabel, person, outlet, ...taskCells, totalPend, overallAvg],
        });
      }
    }
  } else if (reportId === 'bulanan_visit_category') {
    const mDays = hasCustomRange
      ? calendarDays.filter((d) => !isSunday(d) && d >= effRangeFrom && d <= effRangeTo)
      : monthOption?.days || [];
    const periodLabel = hasCustomRange ? harianLabel : monthOption?.label || '-';
    const buckets = [...VISIT_CATEGORY_LIST, 'Custom / Lainnya'];
    columns = ['Role', 'Periode', 'PIC', 'Outlet', ...buckets, 'Total Kunjungan'];
    subtitle = `Periode: ${periodLabel}`;
    filename = `kunjungan-per-kategori-${roleSlug}-${hasCustomRange ? harianFileSlug : monthOption?.key || today}.xlsx`;

    for (const rId of targetRoleIds) {
      const cfg = roleConfigs[rId];
      const ws = allWorkspaces[rId];
      const rDays = calendarDays;
      const evalDays = hasCustomRange ? mDays : mDays.length > 0 ? mDays : rDays;

      const knownOutletsByPerson = new Map<string, Set<string>>();
      for (const { code: outlet, person } of cfg.outlets) {
        if (picFilter !== 'ALL' && person !== picFilter) continue;
        if (outletFilter !== 'ALL' && outlet !== outletFilter) continue;

        if (!knownOutletsByPerson.has(person)) {
          knownOutletsByPerson.set(person, new Set());
        }
        knownOutletsByPerson.get(person)!.add(outlet);

        const counts: Record<string, number> = {};
        for (const b of buckets) counts[b] = 0;
        let totalVisits = 0;

        for (const d of evalDays) {
          const v = ws.visit[`${person}|${d}`];
          if (!v?.ok) continue;
          for (const entry of getVisitEntries(v)) {
            if (entry.outlet === outlet) {
              const cat = classifyVisitCategory(entry.n);
              counts[cat] = (counts[cat] || 0) + 1;
              totalVisits++;
            }
          }
        }

        rawRows.push({
          key: `${rId}|${outlet}`,
          cells: [cfg.label, periodLabel, person, outlet, ...buckets.map((b) => counts[b]), totalVisits],
        });
      }

      // Catch visits with empty outlet ('') or outlet not listed in cfg.outlets so zero visits are silently dropped
      const personList = getPersonList(cfg.outlets);
      for (const person of personList) {
        if (picFilter !== 'ALL' && person !== picFilter) continue;
        const knownSet = knownOutletsByPerson.get(person) || new Set<string>();
        const extraCountsByLabel = new Map<string, Record<string, number>>();
        for (const d of evalDays) {
          const v = ws.visit[`${person}|${d}`];
          if (!v?.ok) continue;
          for (const entry of getVisitEntries(v)) {
            const rawOutlet = (entry.outlet || '').trim();
            if (rawOutlet && knownSet.has(rawOutlet)) continue;
            if (outletFilter !== 'ALL') {
              if (!rawOutlet || rawOutlet !== outletFilter) continue;
            }
            const label = rawOutlet || '(tanpa outlet)';
            let bucketCounts = extraCountsByLabel.get(label);
            if (!bucketCounts) {
              bucketCounts = {};
              for (const b of buckets) bucketCounts[b] = 0;
              extraCountsByLabel.set(label, bucketCounts);
            }
            const cat = classifyVisitCategory(entry.n);
            bucketCounts[cat] = (bucketCounts[cat] || 0) + 1;
          }
        }
        for (const [label, bucketCounts] of extraCountsByLabel.entries()) {
          const totalVisits = buckets.reduce((sum, b) => sum + (bucketCounts[b] || 0), 0);
          if (totalVisits > 0) {
            rawRows.push({
              key: `${rId}|${person}|${label}`,
              cells: [
                cfg.label,
                periodLabel,
                person,
                label,
                ...buckets.map((b) => bucketCounts[b] || 0),
                totalVisits,
              ],
            });
          }
        }
      }
    }
  }

  const filteredRows = applyRowFilters(
    rawRows,
    statusFilter,
    meta.supportsStatusFilter,
    searchQuery
  );

  return {
    columns,
    rows: filteredRows,
    filename,
    subtitle,
  };
}

export function reportTableToCsv(
  columns: string[],
  rows: PreviewRow[],
  options?: { delimiter?: ',' | ';'; bom?: boolean }
): string {
  const delimiter = options?.delimiter || ',';
  const bom = options?.bom ?? true;
  const escape = (v: string | number) =>
    escapeCsvCell(v, {
      delimiter,
      decimalSeparator: delimiter === ';' ? ',' : '.',
    });
  const lines = [
    columns.map(escape).join(delimiter),
    ...rows.map((r) => r.cells.map(escape).join(delimiter)),
  ];
  const csv = lines.join('\n');
  return bom ? `\uFEFF${csv}` : csv;
}
