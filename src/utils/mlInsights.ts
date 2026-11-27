import {
  CalculatedTask,
  InputLogEntry,
  OperationalRoleId,
  OutletStoreState,
  RoleConfig,
  TaskDefinition,
} from '../types/outlet';
import {
  OPERATIONAL_ROLES,
  buildMonthWorkingDays,
  buildMonthsWorkingDays,
  calcTask,
  diffDays,
  escapeCsv,
  fmtDate,
  fmtDateLong,
  getEffectiveWorkingDaysForPerson,
  getPersonList,
  getSelectableMonths,
  getTaskInputType,
  getVisitEntries,
  isSunday,
  parseUtcDate,
  shiftIsoDays,
  toWibIsoDate,
} from './outletLogic';

export type MlModuleGroup = 'risk' | 'performance' | 'visit' | 'action';

export type MlModuleId =
  | 'risk_forecast'
  | 'eom_readiness'
  | 'dependency_bottleneck'
  | 'backfill_anomaly'
  | 'outlet_clustering'
  | 'pic_kpi_forecast'
  | 'visit_planner'
  | 'visit_effectiveness'
  | 'period_trend'
  | 'action_plan';

export interface MlModuleDefinition {
  id: MlModuleId;
  code: string;
  group: MlModuleGroup;
  groupLabel: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  methodNote: string;
}

export const ML_MODULE_DEFINITIONS: MlModuleDefinition[] = [
  {
    id: 'action_plan',
    code: '10',
    group: 'action',
    groupLabel: 'D. Tren & Action Plan',
    title: 'Auto-Action List & Briefing Prioritas',
    shortTitle: 'Action Plan ML',
    subtitle: 'Gabungan seluruh sinyal ML menjadi daftar aksi harian/mingguan siap follow-up & ekspor.',
    methodNote: 'Multi-Signal Prioritization (Risiko Pending + EOM + Backfill + Kunjungan)',
  },
  {
    id: 'risk_forecast',
    code: '01',
    group: 'risk',
    groupLabel: 'A. Prediksi Risiko',
    title: 'Prediksi Risiko PENDING Hari/Minggu Berikutnya',
    shortTitle: 'Risiko PENDING',
    subtitle: 'Memprediksi outlet & tugas yang paling berisiko jatuh PENDING pada hari kerja berikutnya.',
    methodNote: 'EWMA Trend + Regresi Linear + Pola Hari Kerja + Sinyal Dependensi',
  },
  {
    id: 'eom_readiness',
    code: '02',
    group: 'risk',
    groupLabel: 'A. Prediksi Risiko',
    title: 'Prediksi Kesiapan Closing Akhir Bulan (EOM)',
    shortTitle: 'Kesiapan Closing',
    subtitle: 'Proyeksi penyelesaian seluruh tugas bulanan, mingguan, dan harian sebelum tutup buku.',
    methodNote: 'Velocity Projection vs Sisa Hari Kerja Bulan Berjalan',
  },
  {
    id: 'dependency_bottleneck',
    code: '03',
    group: 'risk',
    groupLabel: 'A. Prediksi Risiko',
    title: 'Deteksi Efek Domino Antar Tugas',
    shortTitle: 'Efek Domino Tugas',
    subtitle: 'Mendeteksi tugas hulu yang memicu tugas turunan ikut tertunda (eksplisit maupun korelasi historis).',
    methodNote: 'Dependency Graph + Co-Pending Lag Correlation',
  },
  {
    id: 'backfill_anomaly',
    code: '04',
    group: 'performance',
    groupLabel: 'B. Performa PIC & Outlet',
    title: 'Deteksi Anomali Input & Pola Backfill (Rapel)',
    shortTitle: 'Anomali & Backfill',
    subtitle: 'Menganalisis jeda input riil (WIB) vs tanggal kerja serta mendeteksi penumpukan rapel.',
    methodNote: 'Timestamp Lag Analysis + Burst / Weekday Pattern Detection',
  },
  {
    id: 'outlet_clustering',
    code: '05',
    group: 'performance',
    groupLabel: 'B. Performa PIC & Outlet',
    title: 'Klasterisasi Kesehatan Outlet (K-Means)',
    shortTitle: 'Klaster Outlet',
    subtitle: 'Mengelompokkan outlet ke segmen Sehat, Fluktuatif, atau Kritis beserta akar masalah PIC vs Outlet.',
    methodNote: 'K-Means 3-Centroid Clustering + Within-PIC Variance Attribution',
  },
  {
    id: 'pic_kpi_forecast',
    code: '06',
    group: 'performance',
    groupLabel: 'B. Performa PIC & Outlet',
    title: 'Proyeksi Ranking & Target Minimal KPI PIC',
    shortTitle: 'Proyeksi KPI PIC',
    subtitle: 'Memproyeksikan kepatuhan akhir periode tiap PIC dan jumlah target kerja agar tembus target aman.',
    methodNote: 'Weighted Compliance Forecast + Target Gap Solver',
  },
  {
    id: 'visit_planner',
    code: '07',
    group: 'visit',
    groupLabel: 'C. Optimasi Kunjungan',
    title: 'Rekomendasi Prioritas Kunjungan Outlet',
    shortTitle: 'Prioritas Kunjungan',
    subtitle: 'Urutan outlet paling mendesak untuk dikunjungi berdasarkan risiko tugas & jarak kunjungan terakhir.',
    methodNote: 'Composite Visit Urgency Index (Risk × Visit Recency × Chronic Lag)',
  },
  {
    id: 'visit_effectiveness',
    code: '08',
    group: 'visit',
    groupLabel: 'C. Optimasi Kunjungan',
    title: 'Prediksi Kategori Audit & Efektivitas Kunjungan',
    shortTitle: 'Efektivitas & Audit',
    subtitle: 'Mengukur dampak kunjungan sebelum vs sesudah (Δ +/-) dan menyarankan kategori audit paling tepat.',
    methodNote: 'Before-After Event Study (H-3 vs H+3) + Task-to-Category Matching',
  },
  {
    id: 'period_trend',
    code: '09',
    group: 'action',
    groupLabel: 'D. Tren & Action Plan',
    title: 'Tren Performa Lintas Periode (Improving vs Degrading)',
    shortTitle: 'Tren Lintas Periode',
    subtitle: 'Membandingkan paruh awal vs paruh akhir periode untuk melihat outlet & tugas yang membaik atau menurun.',
    methodNote: 'Period-Half Delta Comparison + Slope Trajectory Classification',
  },
];

export type MlCellTone = 'danger' | 'warn' | 'ok' | 'neutral';

export interface MlTableRow {
  key: string;
  tone?: MlCellTone;
  cells: Array<string | number>;
}

export interface MlModuleResult {
  id: MlModuleId;
  columns: string[];
  rows: MlTableRow[];
  filename: string;
  subtitle: string;
  takeaways: string[];
}

export interface MlRoleCoverage {
  roleId: OperationalRoleId;
  label: string;
  taskCount: number;
  outletCount: number;
  picCount: number;
  entryCount: number;
}

export interface MlOverviewStats {
  highRiskSlots: number;
  eomAtRiskOutlets: number;
  realtimeInputPct: number | null;
  p1ActionCount: number;
  evaluatedOutlets: number;
  evaluatedTasks: number;
}

export interface MlInsightsSuite {
  roleCoverage: MlRoleCoverage[];
  overview: MlOverviewStats;
  modules: Record<MlModuleId, MlModuleResult>;
  evaluationPeriodLabel: string;
}

export interface ComputeMlSuiteParams {
  roleFilter: 'ALL' | OperationalRoleId;
  roleConfigs: Record<OperationalRoleId, RoleConfig>;
  allWorkspaces: Record<OperationalRoleId, OutletStoreState>;
  inputLogs: InputLogEntry[];
  availableDays: string[];
  today: string;
  dateFrom?: string;
  dateTo?: string;
  picFilter: string;
  outletFilter: string;
  kpiTargetPct: number;
}

const WEEKDAY_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function mean(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdDev(nums: number[]): number {
  if (nums.length <= 1) return 0;
  const avg = mean(nums);
  const variance = nums.reduce((sum, x) => sum + (x - avg) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

function ewma(nums: number[], alpha = 0.35): number {
  if (!nums.length) return 0;
  let s = nums[0];
  for (let i = 1; i < nums.length; i++) {
    s = alpha * nums[i] + (1 - alpha) * s;
  }
  return s;
}

function linearSlope(nums: number[]): number {
  const n = nums.length;
  if (n <= 1) return 0;
  const xMean = (n - 1) / 2;
  const yMean = mean(nums);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - xMean;
    num += dx * (nums[i] - yMean);
    den += dx * dx;
  }
  return den === 0 ? 0 : num / den;
}

function pearsonCorr(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n <= 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

function getWibHour(isoTimestamp?: string): number | null {
  if (!isoTimestamp) return null;
  const ms = Date.parse(isoTimestamp);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + 7 * 3600 * 1000).getUTCHours();
}

function formatHourBucket(hour: number | null): string {
  if (hour === null) return '-';
  return `${String(hour).padStart(2, '0')}:00 WIB`;
}

function getNextWorkingDay(isoDate: string): string {
  const next = shiftIsoDays(isoDate, 1);
  return isSunday(next) ? shiftIsoDays(next, 1) : next;
}

function suggestAuditCategory(
  tasks: TaskDefinition[],
  problemTaskKeys: string[],
  bestRoleCategory?: string
): string {
  const labels = problemTaskKeys
    .map((k) => tasks.find((t) => t.key === k))
    .filter((t): t is TaskDefinition => Boolean(t));

  const joined = labels.map((t) => `${t.key} ${t.label}`.toLowerCase()).join(' ');
  const hasMonthTask = labels.some((t) => getTaskInputType(t) === 'month');

  if (joined.includes('memo') || joined.includes('discrep') || hasMonthTask) {
    return 'Pengecekkan Discrepancy';
  }
  if (
    joined.includes('konv') ||
    joined.includes('bt') ||
    joined.includes('stock') ||
    joined.includes('opname')
  ) {
    return 'Stock Opname';
  }
  if (joined.includes('ham') || joined.includes('bm') || joined.includes('barang masuk') || joined.includes('invent')) {
    return 'Pengecekkan Inventory';
  }
  if (joined.includes('asset') || joined.includes('aset') || joined.includes('gl')) {
    return 'Pengecekkan Asset';
  }
  if (joined.includes('jual') || joined.includes('sales')) {
    return 'Pengecekkan Inventory';
  }
  return bestRoleCategory || 'Stock Opname';
}

function classifyVisitCategory(rawNote: string): string {
  const clean = rawNote.trim();
  const categories = [
    'Stock Opname',
    'Pengecekkan Asset',
    'Pengecekkan Discrepancy',
    'Pengecekkan Inventory',
    'Meeting',
  ];
  for (const cat of categories) {
    if (clean === cat || clean.startsWith(`${cat} — `)) return cat;
  }
  return 'Custom / Lainnya';
}

interface SlotObs {
  roleId: OperationalRoleId;
  roleLabel: string;
  pic: string;
  outlet: string;
  task: TaskDefinition;
  days: string[];
  calcs: CalculatedTask[];
  latest: CalculatedTask;
  avgPm: number;
  ewmaPm: number;
  slope: number;
  pendingRate: number;
  backfillRate: number;
  riskProbPct: number;
  riskLevel: 'Tinggi' | 'Sedang' | 'Rendah';
  projectedNextPm: number;
  driverText: string;
  nextAction: string;
}

interface OutletClusterPoint {
  roleId: OperationalRoleId;
  roleLabel: string;
  pic: string;
  outlet: string;
  avgPm: number;
  pendingRate: number;
  volatility: number;
  backfillRate: number;
  hasAnyInput: boolean;
  riskComposite: number;
  clusterLabel: 'Sehat & Konsisten' | 'Fluktuatif / Rawan Telat' | 'Kritis / Kronis Pending';
  rootCause: string;
  problemTasks: string[];
}

function run3ClusterKMeans(points: OutletClusterPoint[]): number[] {
  const n = points.length;
  if (n === 0) return [];
  if (n <= 2) {
    return points.map((p) => (p.riskComposite >= 0.62 ? 2 : p.riskComposite >= 0.32 ? 1 : 0));
  }

  // Standardize 4 numerical features: [-avgPm, pendingRate, volatility, backfillRate]
  const rawFeatures = points.map((p) => [-p.avgPm, p.pendingRate, p.volatility, p.backfillRate]);
  const cols = 4;
  const colMeans = Array.from({ length: cols }, (_, j) => mean(rawFeatures.map((r) => r[j])));
  const colStds = Array.from({ length: cols }, (_, j) => {
    const sd = stdDev(rawFeatures.map((r) => r[j]));
    return sd < 1e-6 ? 1 : sd;
  });
  const norm = rawFeatures.map((r) => r.map((v, j) => (v - colMeans[j]) / colStds[j]));

  // Deterministic quantile initialization ordered by riskComposite (0=Healthy, 1=Fluctuating, 2=Critical)
  const orderedIdx = points
    .map((p, idx) => ({ idx, score: p.riskComposite }))
    .sort((a, b) => a.score - b.score)
    .map((x) => x.idx);

  let centroids = [
    [...norm[orderedIdx[0]]],
    [...norm[orderedIdx[Math.floor((n - 1) / 2)]]],
    [...norm[orderedIdx[n - 1]]],
  ];

  const assignments = new Array<number>(n).fill(0);

  for (let iter = 0; iter < 18; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let bestC = 0;
      let bestDist = Infinity;
      for (let c = 0; c < 3; c++) {
        let d = 0;
        for (let j = 0; j < cols; j++) {
          const diff = norm[i][j] - centroids[c][j];
          d += diff * diff;
        }
        if (d < bestDist) {
          bestDist = d;
          bestC = c;
        }
      }
      if (assignments[i] !== bestC) {
        assignments[i] = bestC;
        changed = true;
      }
    }

    const nextCentroids = [0, 1, 2].map((c) => {
      const members = norm.filter((_, idx) => assignments[idx] === c);
      if (!members.length) return centroids[c];
      return Array.from({ length: cols }, (_, j) => mean(members.map((m) => m[j])));
    });
    centroids = nextCentroids;
    if (!changed) break;
  }

  // Re-order cluster IDs so 0 = healthiest (lowest avg riskComposite), 1 = middle, 2 = highest risk
  const clusterOrder = [0, 1, 2].map((c) => {
    const memberRisks = points.filter((_, idx) => assignments[idx] === c).map((p) => p.riskComposite);
    return { c, avgRisk: memberRisks.length ? mean(memberRisks) : c * 0.5 };
  }).sort((a, b) => a.avgRisk - b.avgRisk);

  const remap = new Map<number, number>();
  clusterOrder.forEach((item, rankIdx) => remap.set(item.c, rankIdx));

  return assignments.map((c) => remap.get(c) ?? 1);
}

export function computeMlInsightsSuite(params: ComputeMlSuiteParams): MlInsightsSuite {
  const {
    roleFilter,
    roleConfigs,
    allWorkspaces,
    inputLogs,
    availableDays,
    today,
    dateFrom,
    dateTo,
    picFilter,
    outletFilter,
    kpiTargetPct,
  } = params;

  const baseDays = (
    availableDays.length > 0 ? availableDays : buildMonthsWorkingDays(getSelectableMonths(today))
  ).filter((d) => !isSunday(d) && d <= today);

  const rawFrom = (dateFrom || '').trim();
  const rawTo = (dateTo || '').trim();
  const effFrom = rawFrom && rawTo && rawFrom > rawTo ? rawTo : rawFrom;
  const effTo = rawFrom && rawTo && rawFrom > rawTo ? rawFrom : rawTo;

  const evalDays = baseDays.filter(
    (d) => (!effFrom || d >= effFrom) && (!effTo || d <= effTo)
  );
  const safeEvalDays = evalDays.length > 0 ? evalDays : baseDays.slice(-14);
  const anchorDay = safeEvalDays[safeEvalDays.length - 1] || today;
  const nextWorkDay = getNextWorkingDay(anchorDay);
  const nextWeekdayDow = parseUtcDate(nextWorkDay).getUTCDay();
  const nextWeekdayLabel = WEEKDAY_ID[nextWeekdayDow] || 'Besok';

  const evaluationPeriodLabel =
    safeEvalDays.length > 0
      ? `${fmtDate(safeEvalDays[0])} – ${fmtDateLong(anchorDay)} (${safeEvalDays.length} hari kerja)`
      : fmtDateLong(today);

  const targetRoles: OperationalRoleId[] =
    roleFilter === 'ALL' ? OPERATIONAL_ROLES.map((r) => r.id) : [roleFilter];
  const roleSlug = roleFilter === 'ALL' ? 'semua-role' : roleFilter;
  const targetKpi = clamp(kpiTargetPct || 90, 50, 100);

  // Role coverage summary across all 3 operational roles (so user sees Stock Accounting, GL, Accounting status)
  const roleCoverage: MlRoleCoverage[] = OPERATIONAL_ROLES.map((r) => {
    const cfg = roleConfigs[r.id];
    const ws = allWorkspaces[r.id];
    const entryCount = Object.values(ws?.ent || {}).reduce(
      (sum, m) => sum + Object.keys(m).length,
      0
    );
    return {
      roleId: r.id,
      label: cfg?.label || r.label,
      taskCount: cfg?.tasks?.length || 0,
      outletCount: cfg?.outlets?.length || 0,
      picCount: getPersonList(cfg?.outlets || []).length,
      entryCount,
    };
  });

  // Collect full slot observations dynamically for selected role(s)
  const slotObservations: SlotObs[] = [];
  const evalMonthKey = anchorDay.slice(0, 7);
  const monthAllWorkDays = buildMonthWorkingDays(evalMonthKey);
  const remainingMonthWorkDays = monthAllWorkDays.filter((d) => d > anchorDay).length;

  // Track best visit category per role for audit recommendations
  const visitStatsByRoleCategory = new Map<
    string,
    { roleId: OperationalRoleId; category: string; deltas: number[]; solvedCount: number; samples: number }
  >();

  // Visit effectiveness raw rows
  const visitEffectRows: Array<{
    roleLabel: string;
    visitDay: string;
    pic: string;
    outlet: string;
    category: string;
    preAvgPm: number;
    postAvgPm: number;
    deltaPm: number;
    prePendPct: number;
    postPendPct: number;
  }> = [];

  for (const rId of targetRoles) {
    const cfg = roleConfigs[rId];
    const ws = allWorkspaces[rId];
    if (!cfg || !ws || cfg.tasks.length === 0 || cfg.outlets.length === 0) continue;

    // 1) Visit before/after evaluation for this role
    const personList = getPersonList(cfg.outlets);
    const allRoleDays = baseDays.length > 0 ? baseDays : safeEvalDays;
    for (const dayItem of safeEvalDays) {
      for (const person of personList) {
        if (picFilter !== 'ALL' && person !== picFilter) continue;
        const v = ws.visit[`${person}|${dayItem}`];
        if (!v?.ok) continue;
        const entries = getVisitEntries(v);
        for (const entry of entries) {
          const vOutlet = entry.outlet || '';
          if (!vOutlet) continue;
          if (outletFilter !== 'ALL' && vOutlet !== outletFilter) continue;

          const dayIdx = allRoleDays.indexOf(dayItem);
          if (dayIdx < 0) continue;
          const preDays = allRoleDays.slice(Math.max(0, dayIdx - 3), dayIdx);
          const postDays = allRoleDays.slice(dayIdx + 1, dayIdx + 4);
          if (preDays.length === 0 || postDays.length === 0) continue;

          const preCalcs: CalculatedTask[] = [];
          const postCalcs: CalculatedTask[] = [];
          for (const dPre of preDays) {
            for (const t of cfg.tasks) {
              preCalcs.push(calcTask(ws, allRoleDays, cfg.tasks, vOutlet, dPre, t.key, today));
            }
          }
          for (const dPost of postDays) {
            for (const t of cfg.tasks) {
              postCalcs.push(calcTask(ws, allRoleDays, cfg.tasks, vOutlet, dPost, t.key, today));
            }
          }
          if (!preCalcs.length || !postCalcs.length) continue;

          const preAvg = mean(preCalcs.map((c) => c.pm));
          const postAvg = mean(postCalcs.map((c) => c.pm));
          const deltaPm = postAvg - preAvg;
          const prePendPct = Math.round((preCalcs.filter((c) => c.pend).length / preCalcs.length) * 100);
          const postPendPct = Math.round((postCalcs.filter((c) => c.pend).length / postCalcs.length) * 100);
          const category = classifyVisitCategory(entry.n);

          visitEffectRows.push({
            roleLabel: cfg.label,
            visitDay: dayItem,
            pic: person,
            outlet: vOutlet,
            category,
            preAvgPm: preAvg,
            postAvgPm: postAvg,
            deltaPm,
            prePendPct,
            postPendPct,
          });

          const mapKey = `${rId}|${category}`;
          const existingCat = visitStatsByRoleCategory.get(mapKey) || {
            roleId: rId,
            category,
            deltas: [],
            solvedCount: 0,
            samples: 0,
          };
          existingCat.deltas.push(deltaPm);
          if (deltaPm > 0 || postPendPct < prePendPct) existingCat.solvedCount++;
          existingCat.samples++;
          visitStatsByRoleCategory.set(mapKey, existingCat);
        }
      }
    }

    // 2) Slot observations per (outlet x task)
    for (const { code: outlet, person } of cfg.outlets) {
      if (picFilter !== 'ALL' && person !== picFilter) continue;
      if (outletFilter !== 'ALL' && outlet !== outletFilter) continue;

      const personEvalDays = getEffectiveWorkingDaysForPerson(
        safeEvalDays,
        cfg.dayAdjustments,
        person
      );
      if (personEvalDays.length === 0) continue;

      for (const task of cfg.tasks) {
        const calcs = personEvalDays.map((d) =>
          calcTask(ws, allRoleDays.length ? allRoleDays : safeEvalDays, cfg.tasks, outlet, d, task.key, today)
        );
        if (!calcs.length) continue;
        const latest = calcs[calcs.length - 1];
        const pms = calcs.map((c) => c.pm);
        const avgPm = mean(pms);
        const ewmaPm = ewma(pms, 0.35);
        const slope = linearSlope(pms);
        const pendingRate = calcs.filter((c) => c.pend).length / calcs.length;

        const ownCalcs = calcs.filter((c) => c.source === 'own');
        const backfillCount = ownCalcs.filter((c) => (c.backfillDays || 0) > 0).length;
        const backfillRate = ownCalcs.length > 0 ? backfillCount / ownCalcs.length : 0;

        // Same-weekday historical pending rate
        const sameDowCalcs = calcs.filter((_, i) => parseUtcDate(personEvalDays[i]).getUTCDay() === nextWeekdayDow);
        const sameDowPendRate = sameDowCalcs.length
          ? sameDowCalcs.filter((c) => c.pend).length / sameDowCalcs.length
          : pendingRate;

        // Consecutive pending streak at the end
        let pendingStreak = 0;
        for (let i = calcs.length - 1; i >= 0; i--) {
          if (calcs[i].pend) pendingStreak++;
          else break;
        }

        // Upstream dependency lag if ref_task
        let refTaskLag = false;
        let refTaskLabel = '';
        if (task.formulaType === 'ref_task' && task.refTaskKey) {
          const refDef = cfg.tasks.find((t) => t.key === task.refTaskKey);
          if (refDef) {
            refTaskLabel = refDef.shortLabel || refDef.label;
            const refCalc = calcTask(
              ws,
              allRoleDays.length ? allRoleDays : safeEvalDays,
              cfg.tasks,
              outlet,
              anchorDay,
              refDef.key,
              today
            );
            if (refCalc.pend || refCalc.pm < 0) refTaskLag = true;
          }
        }

        // Logistic risk probability model
        const deficitWeight = latest.d ? clamp(-ewmaPm, -2, 6) * 0.65 : 2.6;
        const slopeWeight = clamp(-slope, -1.5, 2.5) * 0.9;
        const streakWeight = clamp(pendingStreak, 0, 5) * 0.42;
        const dowWeight = (sameDowPendRate - 0.35) * 1.3;
        const depWeight = refTaskLag ? 0.95 : 0;
        const backfillWeight = backfillRate * 0.8;
        const rawLogit =
          -0.85 +
          deficitWeight +
          slopeWeight +
          streakWeight +
          dowWeight +
          depWeight +
          backfillWeight +
          (latest.pend ? 0.75 : -0.45);

        const riskProbPct = Math.round(clamp(sigmoid(rawLogit) * 100, 5, 98));
        const riskLevel: 'Tinggi' | 'Sedang' | 'Rendah' =
          riskProbPct >= 65 ? 'Tinggi' : riskProbPct >= 40 ? 'Sedang' : 'Rendah';

        // Projected next working day (+/-)
        const projectedNextPm = Number((ewmaPm + slope).toFixed(1));

        // Plain-Indonesian dominant risk driver
        const drivers: string[] = [];
        if (!latest.d) {
          drivers.push('Belum ada input sama sekali');
        } else {
          if (pendingStreak >= 2) drivers.push(`Pending ${pendingStreak} hari beruntun`);
          if (slope <= -0.15) drivers.push(`Tren melambat (${slope.toFixed(2)}/hr)`);
          if (refTaskLag && refTaskLabel) drivers.push(`Terhambat tugas hulu: ${refTaskLabel}`);
          if (sameDowPendRate >= 0.6 && sameDowCalcs.length >= 2) {
            drivers.push(`Rawan pending tiap hari ${nextWeekdayLabel}`);
          }
          if (backfillRate >= 0.35) {
            drivers.push(`Sering input rapel (${Math.round(backfillRate * 100)}%)`);
          }
        }
        if (drivers.length === 0) {
          drivers.push(
            latest.pend
              ? `Skor terakhir (${latest.pm}) masih di bawah toleransi`
              : `Performa stabil (EWMA ${ewmaPm >= 0 ? `+${ewmaPm.toFixed(1)}` : ewmaPm.toFixed(1)})`
          );
        }

        const nextAction =
          !latest.d
            ? `Segera lakukan input perdana ${task.label}`
            : riskLevel === 'Tinggi'
              ? refTaskLag && refTaskLabel
                ? `Kejar ${refTaskLabel} dulu lalu update ${task.shortLabel || task.label}`
                : `Prioritaskan update ${task.shortLabel || task.label} sebelum akhir hari ${nextWeekdayLabel}`
              : riskLevel === 'Sedang'
                ? `Pantau ${task.shortLabel || task.label} agar tidak turun ke zona pending`
                : 'Pertahankan ritme input rutin';

        slotObservations.push({
          roleId: rId,
          roleLabel: cfg.label,
          pic: person,
          outlet,
          task,
          days: safeEvalDays,
          calcs,
          latest,
          avgPm,
          ewmaPm,
          slope,
          pendingRate,
          backfillRate,
          riskProbPct,
          riskLevel,
          projectedNextPm,
          driverText: drivers.slice(0, 2).join(' · '),
          nextAction,
        });
      }
    }
  }

  // ==================== MODULE 1: RISK FORECAST ====================
  const riskSorted = [...slotObservations].sort(
    (a, b) => b.riskProbPct - a.riskProbPct || a.latest.pm - b.latest.pm
  );
  const highRiskCount = riskSorted.filter((s) => s.riskLevel === 'Tinggi').length;
  const riskModule: MlModuleResult = {
    id: 'risk_forecast',
    columns: [
      'Prioritas Risiko',
      'Probabilitas Pending',
      'Workspace Role',
      'PIC',
      'Outlet',
      'Tugas',
      'Tipe Input',
      'Skor (+/-) Terakhir',
      'Proyeksi (+/-) Besok',
      'Faktor Pemicu Utama',
      'Rekomendasi Langkah Selanjutnya',
    ],
    rows: riskSorted.map((s) => {
      const iType = getTaskInputType(s.task);
      const iLabel = iType === 'month' ? 'Bulanan' : iType === 'week' ? 'Mingguan' : 'Harian';
      return {
        key: `risk|${s.roleId}|${s.outlet}|${s.task.key}`,
        tone: s.riskLevel === 'Tinggi' ? 'danger' : s.riskLevel === 'Sedang' ? 'warn' : 'ok',
        cells: [
          s.riskLevel,
          `${s.riskProbPct}%`,
          s.roleLabel,
          s.pic,
          s.outlet,
          s.task.label,
          iLabel,
          s.latest.d ? (s.latest.pm > 0 ? `+${s.latest.pm}` : `${s.latest.pm}`) : 'Belum Input',
          s.projectedNextPm > 0 ? `+${s.projectedNextPm}` : `${s.projectedNextPm}`,
          s.driverText,
          s.nextAction,
        ],
      };
    }),
    filename: `ml-risiko-pending-${roleSlug}-${anchorDay}.xlsx`,
    subtitle: `Target Prediksi: ${fmtDateLong(nextWorkDay)} (${nextWeekdayLabel}) · Basis: ${evaluationPeriodLabel}`,
    takeaways: riskSorted.length
      ? [
          `${highRiskCount} dari ${riskSorted.length} slot tugas berisiko TINGGI jatuh PENDING pada hari kerja berikutnya.`,
          riskSorted[0]
            ? `Risiko tertinggi: ${riskSorted[0].outlet} (${riskSorted[0].pic}) — ${riskSorted[0].task.label} (${riskSorted[0].riskProbPct}%: ${riskSorted[0].driverText}).`
            : 'Tidak ada data.',
          `Target berikutnya (${nextWeekdayLabel}, ${fmtDate(nextWorkDay)}): fokuskan follow-up ke slot risiko ≥ 65% sebelum penutupan hari kerja.`,
        ]
      : ['Belum ada tugas/outlet aktif pada workspace role terpilih untuk diprediksi.'],
  };

  // ==================== MODULE 2: EOM READINESS ====================
  const outletGroupMap = new Map<string, SlotObs[]>();
  for (const s of slotObservations) {
    const k = `${s.roleId}|${s.outlet}`;
    const arr = outletGroupMap.get(k) || [];
    arr.push(s);
    outletGroupMap.set(k, arr);
  }

  const eomRecords: Array<{
    key: string;
    tone: MlCellTone;
    statusOrder: number;
    readinessScore: number;
    cells: Array<string | number>;
  }> = [];

  for (const [k, slots] of outletGroupMap.entries()) {
    const first = slots[0];
    const monthlySlots = slots.filter((s) => getTaskInputType(s.task) === 'month');
    const periodicOrDailySlots = slots.filter((s) => getTaskInputType(s.task) !== 'month');

    const latestPendTasks = slots.filter((s) => s.latest.pend);
    const avgCurrentPm = mean(slots.map((s) => s.latest.d ? s.latest.pm : -3));
    const avgSlope = mean(slots.map((s) => s.slope));
    const projectedEomPm = Number((avgCurrentPm + avgSlope * Math.min(remainingMonthWorkDays, 6)).toFixed(1));

    const monthlySummary =
      monthlySlots.length > 0
        ? monthlySlots
            .map((m) => `${m.task.shortLabel || m.task.label}: ${m.latest.d ? m.latest.d.slice(0, 7) : 'Kosong'} (${m.latest.pend ? 'Pending' : 'Siap'})`)
            .join('; ')
        : `${periodicOrDailySlots.filter((x) => !x.latest.pend).length}/${periodicOrDailySlots.length} tugas update`;

    const maxDeficitDays = Math.max(
      0,
      ...slots.map((s) => (!s.latest.d ? 3 : s.latest.pm < 0 ? Math.abs(s.latest.pm) : 0))
    );
    const pacePerDay =
      remainingMonthWorkDays > 0
        ? (maxDeficitDays / remainingMonthWorkDays).toFixed(1)
        : String(maxDeficitDays);

    const anyMonthlyPend = monthlySlots.some((m) => m.latest.pend);
    let eomStatus: 'Siap Tepat Waktu' | 'Butuh Percepatan' | 'Berisiko Terlambat';
    let tone: MlCellTone;
    let statusOrder: number;
    if (latestPendTasks.length >= Math.ceil(slots.length * 0.5) || projectedEomPm < -1 || anyMonthlyPend) {
      eomStatus = 'Berisiko Terlambat';
      tone = 'danger';
      statusOrder = 0;
    } else if (latestPendTasks.length > 0 || projectedEomPm < 0.2) {
      eomStatus = 'Butuh Percepatan';
      tone = 'warn';
      statusOrder = 1;
    } else {
      eomStatus = 'Siap Tepat Waktu';
      tone = 'ok';
      statusOrder = 2;
    }

    const readinessPct = Math.round(
      clamp(((slots.length - latestPendTasks.length) / Math.max(1, slots.length)) * 75 + (projectedEomPm >= 0 ? 25 : 0), 5, 100)
    );

    eomRecords.push({
      key: `eom|${k}`,
      tone,
      statusOrder,
      readinessScore: readinessPct,
      cells: [
        eomStatus,
        `${readinessPct}%`,
        first.roleLabel,
        first.pic,
        first.outlet,
        monthlySummary,
        `${latestPendTasks.length}/${slots.length}`,
        projectedEomPm > 0 ? `+${projectedEomPm}` : `${projectedEomPm}`,
        remainingMonthWorkDays > 0 ? `${remainingMonthWorkDays} hr kerja` : 'Akhir Bulan',
        maxDeficitDays > 0 ? `Kejar ${pacePerDay} hr kerja/hari` : 'Pertahankan ritme',
      ],
    });
  }

  eomRecords.sort((a, b) => a.statusOrder - b.statusOrder || a.readinessScore - b.readinessScore);
  const eomAtRiskOutlets = eomRecords.filter((r) => r.statusOrder === 0).length;

  const eomModule: MlModuleResult = {
    id: 'eom_readiness',
    columns: [
      'Status Proyeksi Closing',
      'Skor Kesiapan',
      'Workspace Role',
      'PIC',
      'Outlet',
      'Progres Tugas Bulanan / Kunci',
      'Tugas Masih Pending',
      'Proyeksi (+/-) Akhir Bulan',
      'Sisa Hari Kerja',
      'Target Kecepatan Kejar',
    ],
    rows: eomRecords.map(({ key, tone, cells }) => ({ key, tone, cells })),
    filename: `ml-kesiapan-closing-${roleSlug}-${evalMonthKey}.xlsx`,
    subtitle: `Periode Closing: ${evalMonthKey} · Sisa ${remainingMonthWorkDays} hari kerja setelah ${fmtDate(anchorDay)}`,
    takeaways: eomRecords.length
      ? [
          `${eomAtRiskOutlets} dari ${eomRecords.length} outlet berisiko terlambat saat closing bulan ${evalMonthKey}.`,
          `${eomRecords.filter((r) => r.statusOrder === 2).length} outlet diproyeksikan Siap Tepat Waktu tanpa perlu percepatan tambahan.`,
          remainingMonthWorkDays > 0
            ? `Masih tersisa ${remainingMonthWorkDays} hari kerja efektif untuk mengejar ketertinggalan outlet prioritas.`
            : 'Bulan evaluasi sudah berada di batas akhir periode kerja.',
        ]
      : ['Belum ada data outlet untuk proyeksi closing akhir bulan.'],
  };

  // ==================== MODULE 3: DEPENDENCY BOTTLENECK ====================
  const depRows: Array<{
    key: string;
    tone: MlCellTone;
    severity: number;
    cells: Array<string | number>;
  }> = [];

  for (const rId of targetRoles) {
    const cfg = roleConfigs[rId];
    const ws = allWorkspaces[rId];
    if (!cfg || !ws || cfg.tasks.length < 2 || cfg.outlets.length === 0) continue;

    const allRoleDays = baseDays.length > 0 ? baseDays : safeEvalDays;
    const scopedOutlets = cfg.outlets.filter(
      (o) =>
        (picFilter === 'ALL' || o.person === picFilter) &&
        (outletFilter === 'ALL' || o.code === outletFilter)
    );
    if (!scopedOutlets.length) continue;

    // Pairwise empirical & explicit dependency discovery
    for (const upstream of cfg.tasks) {
      for (const downstream of cfg.tasks) {
        if (upstream.key === downstream.key) continue;
        const isExplicit = downstream.formulaType === 'ref_task' && downstream.refTaskKey === upstream.key;

        const upVec: number[] = [];
        const downVec: number[] = [];
        let coPendCount = 0;
        let upPendTotal = 0;
        const impactedOutlets = new Set<string>();

        for (const { code: outlet } of scopedOutlets) {
          for (const d of safeEvalDays) {
            const cUp = calcTask(ws, allRoleDays, cfg.tasks, outlet, d, upstream.key, today);
            const cDown = calcTask(ws, allRoleDays, cfg.tasks, outlet, d, downstream.key, today);
            upVec.push(cUp.pm);
            downVec.push(cDown.pm);
            if (cUp.pend) {
              upPendTotal++;
              if (cDown.pend) {
                coPendCount++;
                impactedOutlets.add(outlet);
              }
            }
          }
        }

        const corr = pearsonCorr(upVec, downVec);
        const coPendRate = upPendTotal > 0 ? Math.round((coPendCount / upPendTotal) * 100) : 0;

        if (isExplicit || (corr >= 0.45 && coPendCount >= 2 && coPendRate >= 50)) {
          const sev = (isExplicit ? 40 : 0) + coPendRate * 0.4 + corr * 30;
          const level = sev >= 65 ? 'Kuat (Bottleneck Utama)' : 'Sedang (Terkorelasi)';
          depRows.push({
            key: `dep|${rId}|${upstream.key}|${downstream.key}`,
            tone: sev >= 65 ? 'danger' : 'warn',
            severity: sev,
            cells: [
              isExplicit ? 'Dependensi Rumus' : 'Korelasi Pola ML',
              level,
              cfg.label,
              upstream.label,
              downstream.label,
              `${coPendRate}% (${coPendCount}/${upPendTotal || 1})`,
              corr.toFixed(2),
              impactedOutlets.size > 0 ? Array.from(impactedOutlets).slice(0, 5).join(', ') : 'Semua lancar',
              `Selesaikan ${upstream.shortLabel || upstream.label} lebih dulu agar ${downstream.shortLabel || downstream.label} tidak ikut tertahan.`,
            ],
          });
        }
      }
    }
  }

  depRows.sort((a, b) => b.severity - a.severity);

  const depModule: MlModuleResult = {
    id: 'dependency_bottleneck',
    columns: [
      'Sumber Relasi',
      'Kekuatan Efek Domino',
      'Workspace Role',
      'Tugas Hulu (Pemicu)',
      'Tugas Hilir (Terdampak)',
      'Rasio Ikut Pending',
      'Korelasi Skor (+/-)',
      'Outlet Terdampak',
      'Aksi Pencegahan',
    ],
    rows: depRows.map(({ key, tone, cells }) => ({ key, tone, cells })),
    filename: `ml-efek-domino-tugas-${roleSlug}-${anchorDay}.xlsx`,
    subtitle: 'Menemukan tugas pemicu keterlambatan berantai (otomatis mendeteksi rumus ref_task & korelasi historis)',
    takeaways: depRows.length
      ? [
          `Terdeteksi ${depRows.length} pasangan tugas yang saling memengaruhi lintas outlet.`,
          `Bottleneck terkuat: keterlambatan "${depRows[0].cells[3]}" memicu "${depRows[0].cells[4]}" ikut pending sebesar ${depRows[0].cells[5]}.`,
          'Menuntaskan tugas hulu terlebih dahulu memberikan efek percepatan ganda ke tugas turunannya.',
        ]
      : ['Belum terdeteksi efek domino keterlambatan antar tugas pada periode & filter yang dipilih.'],
  };

  // ==================== MODULE 4: BACKFILL & ANOMALY ====================
  interface PicAnomalyAcc {
    roleId: OperationalRoleId;
    roleLabel: string;
    pic: string;
    totalOwn: number;
    realtimeOwn: number;
    backfillOwn: number;
    lagDaysSum: number;
    hours: number[];
    dowBackfillCounts: Record<number, number>;
    backfillOutlets: Set<string>;
  }

  const picAnomalyMap = new Map<string, PicAnomalyAcc>();
  for (const s of slotObservations) {
    const k = `${s.roleId}|${s.pic}`;
    const acc = picAnomalyMap.get(k) || {
      roleId: s.roleId,
      roleLabel: s.roleLabel,
      pic: s.pic,
      totalOwn: 0,
      realtimeOwn: 0,
      backfillOwn: 0,
      lagDaysSum: 0,
      hours: [],
      dowBackfillCounts: {},
      backfillOutlets: new Set<string>(),
    };

    s.calcs.forEach((c) => {
      if (c.source !== 'own' || !c.sourceDay) return;
      acc.totalOwn++;
      const h = getWibHour(c.ts);
      if (h !== null) acc.hours.push(h);

      if ((c.backfillDays || 0) > 0) {
        acc.backfillOwn++;
        acc.lagDaysSum += c.backfillDays || 0;
        acc.backfillOutlets.add(s.outlet);
        const tsDate = toWibIsoDate(c.ts);
        if (tsDate) {
          const dow = parseUtcDate(tsDate).getUTCDay();
          acc.dowBackfillCounts[dow] = (acc.dowBackfillCounts[dow] || 0) + 1;
        }
      } else {
        acc.realtimeOwn++;
      }
    });
    picAnomalyMap.set(k, acc);
  }

  // Also check same-day multi-outlet bursts in inputLogs
  const burstCountByPic = new Map<string, number>();
  const logsByPicDay = new Map<string, number>();
  for (const log of inputLogs) {
    if (log.actionType !== 'input_harian') continue;
    if (roleFilter !== 'ALL' && log.roleId !== roleFilter) continue;
    if (picFilter !== 'ALL' && log.pic !== picFilter) continue;
    const submitDay = toWibIsoDate(log.clientTs) || log.day;
    const k = `${log.roleId}|${log.pic}|${submitDay}`;
    logsByPicDay.set(k, (logsByPicDay.get(k) || 0) + 1);
  }
  for (const [k, cnt] of logsByPicDay.entries()) {
    if (cnt >= 4) {
      const [rId, pic] = k.split('|');
      const pk = `${rId}|${pic}`;
      burstCountByPic.set(pk, (burstCountByPic.get(pk) || 0) + 1);
    }
  }

  const backfillRows: Array<{
    key: string;
    tone: MlCellTone;
    backfillPct: number;
    cells: Array<string | number>;
  }> = [];

  let totalOwnAll = 0;
  let totalRealtimeAll = 0;

  for (const [k, acc] of picAnomalyMap.entries()) {
    totalOwnAll += acc.totalOwn;
    totalRealtimeAll += acc.realtimeOwn;
    const realtimePct = acc.totalOwn > 0 ? Math.round((acc.realtimeOwn / acc.totalOwn) * 100) : 100;
    const backfillPct = acc.totalOwn > 0 ? Math.round((acc.backfillOwn / acc.totalOwn) * 100) : 0;
    const avgLag = acc.backfillOwn > 0 ? (acc.lagDaysSum / acc.backfillOwn).toFixed(1) : '0.0';
    const avgHour = acc.hours.length > 0 ? Math.round(mean(acc.hours)) : null;

    const topDowEntry = Object.entries(acc.dowBackfillCounts).sort((a, b) => b[1] - a[1])[0];
    const peakBackfillDay = topDowEntry ? WEEKDAY_ID[Number(topDowEntry[0])] || '-' : 'Tidak ada';
    const burstDays = burstCountByPic.get(k) || 0;

    const anomalyFlags: string[] = [];
    if (backfillPct >= 30) anomalyFlags.push(`Rapel tinggi (${backfillPct}%)`);
    if (Number(avgLag) >= 2) anomalyFlags.push(`Rata-rata susulan ${avgLag} hari kerja`);
    if (burstDays >= 1) anomalyFlags.push(`${burstDays} hari lonjakan input massal`);
    if (avgHour !== null && avgHour >= 17) anomalyFlags.push(`Sering input sore/malam (~${formatHourBucket(avgHour)})`);
    if (anomalyFlags.length === 0) anomalyFlags.push('Normal (Input real-time konsisten)');

    const tone: MlCellTone =
      backfillPct >= 35 || Number(avgLag) >= 2
        ? 'danger'
        : backfillPct >= 15 || burstDays >= 1
          ? 'warn'
          : 'ok';

    backfillRows.push({
      key: `bf|${k}`,
      tone,
      backfillPct,
      cells: [
        tone === 'danger' ? 'Anomali Tinggi' : tone === 'warn' ? 'Perlu Pantauan' : 'Disiplin',
        acc.roleLabel,
        acc.pic,
        acc.totalOwn,
        `${realtimePct}%`,
        `${backfillPct}% (${acc.backfillOwn}x)`,
        `${avgLag} hr kerja`,
        formatHourBucket(avgHour),
        peakBackfillDay,
        acc.backfillOutlets.size > 0 ? Array.from(acc.backfillOutlets).join(', ') : '-',
        anomalyFlags.join(' · '),
      ],
    });
  }

  backfillRows.sort((a, b) => b.backfillPct - a.backfillPct);
  const globalRealtimePct = totalOwnAll > 0 ? Math.round((totalRealtimeAll / totalOwnAll) * 100) : null;

  const backfillModule: MlModuleResult = {
    id: 'backfill_anomaly',
    columns: [
      'Status Pola Input',
      'Workspace Role',
      'PIC',
      'Total Entri Asli',
      'Input Real-Time (%)',
      'Input Rapel / Backfill',
      'Rata-rata Jeda Susulan',
      'Rata-rata Jam Input',
      'Hari Rawan Rapel',
      'Outlet Sering Dirapel',
      'Deteksi Anomali ML',
    ],
    rows: backfillRows.map(({ key, tone, cells }) => ({ key, tone, cells })),
    filename: `ml-anomali-backfill-${roleSlug}-${anchorDay}.xlsx`,
    subtitle: 'Membandingkan tanggal kerja dengan timestamp input aktual WIB untuk mendeteksi kebiasaan menunda/rapel',
    takeaways: backfillRows.length
      ? [
          `Rata-rata kedisiplinan input real-time (hari-H) sebesar ${globalRealtimePct ?? 100}% dari ${totalOwnAll} entri asli.`,
          backfillRows[0].backfillPct > 0
            ? `Pola rapel tertinggi pada PIC ${backfillRows[0].cells[2]} (${backfillRows[0].cells[5]} entri susulan).`
            : 'Seluruh PIC aktif tercatat menginput secara real-time tanpa pola rapel signifikan.',
          'Semakin tinggi input real-time, semakin kecil risiko penumpukan discrepancy di akhir minggu.',
        ]
      : ['Belum ada entri asli (own entry) pada periode terpilih untuk analisis anomali input.'],
  };

  // ==================== MODULE 5: K-MEANS OUTLET CLUSTERING ====================
  const clusterPoints: OutletClusterPoint[] = [];
  for (const [, slots] of outletGroupMap.entries()) {
    const first = slots[0];
    const allPms = slots.flatMap((s) => s.calcs.map((c) => c.pm));
    const avgPm = mean(allPms);
    const volatility = stdDev(allPms);
    const pendingRate = mean(slots.map((s) => s.pendingRate));
    const backfillRate = mean(slots.map((s) => s.backfillRate));
    const hasAnyInput = slots.some((s) => s.calcs.some((c) => Boolean(c.d)));

    const riskComposite = clamp(
      pendingRate * 0.5 + clamp(-avgPm / 4, 0, 0.35) + clamp(volatility / 5, 0, 0.15),
      0,
      1
    );
    const problemTasks = slots
      .filter((s) => s.pendingRate >= 0.35 || s.latest.pend)
      .sort((a, b) => b.pendingRate - a.pendingRate)
      .map((s) => s.task.shortLabel || s.task.label);

    clusterPoints.push({
      roleId: first.roleId,
      roleLabel: first.roleLabel,
      pic: first.pic,
      outlet: first.outlet,
      avgPm,
      pendingRate,
      volatility,
      backfillRate,
      hasAnyInput,
      riskComposite,
      clusterLabel: 'Sehat & Konsisten',
      rootCause: '-',
      problemTasks,
    });
  }

  const clusterIds = run3ClusterKMeans(clusterPoints);
  // Attribution: compare outlet's riskComposite vs its PIC peer outlets
  const picAvgRisk = new Map<string, number>();
  const picOutletsCounts = new Map<string, number>();
  for (const p of clusterPoints) {
    const pk = `${p.roleId}|${p.pic}`;
    picAvgRisk.set(pk, (picAvgRisk.get(pk) || 0) + p.riskComposite);
    picOutletsCounts.set(pk, (picOutletsCounts.get(pk) || 0) + 1);
  }

  const clusteredOutlets = clusterPoints.map((p, idx) => {
    const cId = clusterIds[idx] ?? 1;
    const label: OutletClusterPoint['clusterLabel'] =
      cId === 2
        ? 'Kritis / Kronis Pending'
        : cId === 1
          ? 'Fluktuatif / Rawan Telat'
          : 'Sehat & Konsisten';

    const pk = `${p.roleId}|${p.pic}`;
    const count = picOutletsCounts.get(pk) || 1;
    const peerAvgRisk = (picAvgRisk.get(pk) || p.riskComposite) / count;
    const rootCause =
      cId === 0
        ? 'Operasional Stabil'
        : count > 1 && peerAvgRisk >= 0.45 && p.riskComposite - peerAvgRisk < 0.15
          ? `Pola PIC (${p.pic} merata bermasalah di ${count} outlet)`
          : `Spesifik Outlet (${p.outlet} tertinggal dibanding outlet lain ${p.pic})`;

    return {
      ...p,
      clusterId: cId,
      clusterLabel: label,
      rootCause,
    };
  });

  clusteredOutlets.sort((a, b) => b.clusterId - a.clusterId || b.riskComposite - a.riskComposite);

  const clusterModule: MlModuleResult = {
    id: 'outlet_clustering',
    columns: [
      'Segmen Kesehatan (K-Means)',
      'Workspace Role',
      'PIC',
      'Outlet',
      'Rata-rata (+/-)',
      'Frekuensi Pending',
      'Volatilitas (StdDev)',
      'Rasio Rapel',
      'Akar Masalah (PIC vs Outlet)',
      'Tugas Dominan Bermasalah',
    ],
    rows: clusteredOutlets.map((o) => ({
      key: `cl|${o.roleId}|${o.outlet}`,
      tone: o.clusterId === 2 ? 'danger' : o.clusterId === 1 ? 'warn' : 'ok',
      cells: [
        o.clusterLabel,
        o.roleLabel,
        o.pic,
        o.outlet,
        o.avgPm > 0 ? `+${o.avgPm.toFixed(2)}` : o.avgPm.toFixed(2),
        `${Math.round(o.pendingRate * 100)}%`,
        o.volatility.toFixed(2),
        `${Math.round(o.backfillRate * 100)}%`,
        o.rootCause,
        o.problemTasks.length > 0 ? o.problemTasks.slice(0, 3).join(', ') : 'Semua Stabil',
      ],
    })),
    filename: `ml-klaster-kesehatan-outlet-${roleSlug}-${anchorDay}.xlsx`,
    subtitle: 'Segmentasi K-Means 3-klaster & atribusi penyebab (masalah spesifik outlet vs pola kerja PIC)',
    takeaways: clusteredOutlets.length
      ? [
          `Distribusi klaster: ${clusteredOutlets.filter((o) => o.clusterId === 2).length} Kritis · ${clusteredOutlets.filter((o) => o.clusterId === 1).length} Fluktuatif · ${clusteredOutlets.filter((o) => o.clusterId === 0).length} Sehat.`,
          clusteredOutlets[0].clusterId > 0
            ? `Outlet paling kritis: ${clusteredOutlets[0].outlet} (${clusteredOutlets[0].pic}) — ${clusteredOutlets[0].rootCause}.`
            : 'Seluruh outlet berada dalam kondisi sehat dan konsisten.',
          'Gunakan kolom Akar Masalah untuk membedakan apakah perlu coaching ke PIC atau audit khusus di outlet tertentu.',
        ]
      : ['Belum ada outlet aktif untuk dikelompokkan oleh K-Means.'],
  };

  // ==================== MODULE 6: PIC KPI FORECAST & TARGET SIMULATOR ====================
  const picSlotsMap = new Map<string, SlotObs[]>();
  for (const s of slotObservations) {
    const k = `${s.roleId}|${s.pic}`;
    const arr = picSlotsMap.get(k) || [];
    arr.push(s);
    picSlotsMap.set(k, arr);
  }

  const picKpiList: Array<{
    key: string;
    roleLabel: string;
    pic: string;
    outletCount: number;
    currentCompliance: number;
    projectedCompliance: number;
    avgPm: number;
    pendingSlotsNow: number;
    neededPerDay: number;
    tone: MlCellTone;
    statusText: string;
    targetAdvice: string;
  }> = [];

  for (const [k, slots] of picSlotsMap.entries()) {
    const first = slots[0];
    const uniqueOutlets = new Set(slots.map((s) => s.outlet)).size;
    const totalCalcs = slots.flatMap((s) => s.calcs);
    const totalUpd = totalCalcs.filter((c) => !c.pend).length;
    const currentCompliance = totalCalcs.length > 0 ? Math.round((totalUpd / totalCalcs.length) * 100) : 0;

    // Recent weighted compliance (last 5 days vs earlier)
    const recentUpdRates = slots.map((s) => {
      const tail = s.calcs.slice(-5);
      return tail.length ? tail.filter((c) => !c.pend).length / tail.length : 0;
    });
    const recentCompliance = Math.round(mean(recentUpdRates) * 100);
    const projectedCompliance = Math.round(clamp(currentCompliance * 0.45 + recentCompliance * 0.55, 0, 100));
    const avgPm = mean(totalCalcs.map((c) => c.pm));
    const pendingSlotsNow = slots.filter((s) => s.latest.pend).length;

    // Simulate how many slot-updates needed to reach targetKpi
    const totalProjectedSlots = slots.length * Math.max(1, safeEvalDays.length + remainingMonthWorkDays);
    const targetSuccessNeeded = Math.ceil((targetKpi / 100) * totalProjectedSlots);
    const currentSuccesses = totalUpd;
    const maxFutureSuccesses = slots.length * Math.max(1, remainingMonthWorkDays);
    const gapSuccesses = Math.max(0, targetSuccessNeeded - currentSuccesses);
    const neededPerDay =
      remainingMonthWorkDays > 0
        ? Math.min(slots.length, Math.ceil(gapSuccesses / remainingMonthWorkDays))
        : pendingSlotsNow;

    const meetsTarget = projectedCompliance >= targetKpi;
    const tone: MlCellTone = meetsTarget ? 'ok' : projectedCompliance >= targetKpi - 12 ? 'warn' : 'danger';
    const statusText = meetsTarget
      ? `On-Track (≥ ${targetKpi}%)`
      : gapSuccesses <= maxFutureSuccesses
        ? 'Bisa Dikejar'
        : 'Butuh Intervensi Penuh';

    const targetAdvice = meetsTarget
      ? `Pertahankan ≥ ${Math.max(1, Math.ceil(slots.length * (targetKpi / 100)))} slot update/hari`
      : pendingSlotsNow > 0
        ? `Berikan target minimal ${neededPerDay} slot tugas/hari (bereskan ${Math.min(pendingSlotsNow, neededPerDay)} pending sekarang)`
        : `Jaga kepatuhan 100% selama ${Math.max(1, remainingMonthWorkDays)} hari ke depan`;

    picKpiList.push({
      key: `kpi|${k}`,
      roleLabel: first.roleLabel,
      pic: first.pic,
      outletCount: uniqueOutlets,
      currentCompliance,
      projectedCompliance,
      avgPm,
      pendingSlotsNow,
      neededPerDay,
      tone,
      statusText,
      targetAdvice,
    });
  }

  picKpiList.sort((a, b) => b.projectedCompliance - a.projectedCompliance || b.avgPm - a.avgPm);

  const picKpiModule: MlModuleResult = {
    id: 'pic_kpi_forecast',
    columns: [
      'Proyeksi Rank',
      'Status Target',
      'Workspace Role',
      'PIC',
      'Outlet',
      'Kepatuhan Saat Ini',
      'Proyeksi Akhir Periode',
      'Rata-rata (+/-)',
      'Slot Pending Saat Ini',
      `Simulasi Target Minimal (≥ ${targetKpi}%)`,
    ],
    rows: picKpiList.map((p, idx) => ({
      key: p.key,
      tone: p.tone,
      cells: [
        `#${idx + 1}`,
        p.statusText,
        p.roleLabel,
        p.pic,
        p.outletCount,
        `${p.currentCompliance}%`,
        `${p.projectedCompliance}%`,
        p.avgPm > 0 ? `+${p.avgPm.toFixed(2)}` : p.avgPm.toFixed(2),
        p.pendingSlotsNow,
        p.targetAdvice,
      ],
    })),
    filename: `ml-proyeksi-kpi-pic-${roleSlug}-${anchorDay}.xlsx`,
    subtitle: `Proyeksi ranking & simulasi target minimal kepatuhan ≥ ${targetKpi}%`,
    takeaways: picKpiList.length
      ? [
          `Peringkat #1 proyeksi: ${picKpiList[0].pic} (${picKpiList[0].roleLabel}) dengan proyeksi kepatuhan ${picKpiList[0].projectedCompliance}%.`,
          picKpiList.length > 1
            ? `PIC yang butuh dorongan utama: ${picKpiList[picKpiList.length - 1].pic} (proyeksi ${picKpiList[picKpiList.length - 1].projectedCompliance}% — ${picKpiList[picKpiList.length - 1].targetAdvice}).`
            : `Target KPI aktif disetel ke ≥ ${targetKpi}% (bisa diubah di panel filter untuk simulasi).`,
          `${picKpiList.filter((p) => p.projectedCompliance >= targetKpi).length} dari ${picKpiList.length} PIC diproyeksikan lolos target ${targetKpi}%.`,
        ]
      : ['Belum ada data PIC untuk proyeksi KPI.'],
  };

  // ==================== MODULE 7: SMART VISIT PLANNER ====================
  const visitPlanRows: Array<{
    key: string;
    tone: MlCellTone;
    urgency: number;
    outlet: string;
    pic: string;
    roleId: OperationalRoleId;
    suggestedCategory: string;
    daysSinceVisitText: string;
    reasonText: string;
    cells: Array<string | number>;
  }> = [];

  // Precompute best category per role from before-after visit study
  const bestCatByRole = new Map<OperationalRoleId, string>();
  for (const rId of targetRoles) {
    const roleCats = Array.from(visitStatsByRoleCategory.values())
      .filter((v) => v.roleId === rId && v.samples > 0)
      .sort((a, b) => mean(b.deltas) - mean(a.deltas));
    if (roleCats[0]) bestCatByRole.set(rId, roleCats[0].category);
  }

  for (const [, slots] of outletGroupMap.entries()) {
    const first = slots[0];
    const ws = allWorkspaces[first.roleId];
    const cfg = roleConfigs[first.roleId];

    // Find latest visit date for this outlet across baseDays
    let lastVisitDay = '';
    const allDaysChrono = baseDays.length ? baseDays : safeEvalDays;
    for (let i = allDaysChrono.length - 1; i >= 0; i--) {
      const d = allDaysChrono[i];
      const v = ws.visit[`${first.pic}|${d}`];
      if (!v?.ok) continue;
      const entries = getVisitEntries(v);
      if (entries.some((e) => e.outlet === first.outlet) || v.outlet === first.outlet) {
        lastVisitDay = d;
        break;
      }
    }

    const daysSinceVisit = lastVisitDay ? Math.max(0, diffDays(anchorDay, lastVisitDay)) : 45;
    const avgRiskProb = mean(slots.map((s) => s.riskProbPct));
    const pendingNowCount = slots.filter((s) => s.latest.pend).length;
    const problemKeys = slots.filter((s) => s.latest.pend || s.riskProbPct >= 60).map((s) => s.task.key);

    // Composite Visit Urgency Score (0-100)
    const recencyScore = clamp((daysSinceVisit / 30) * 40, 0, 40);
    const taskSeverityScore = clamp((avgRiskProb / 100) * 45 + (pendingNowCount / Math.max(1, slots.length)) * 15, 0, 60);
    const urgency = Math.round(clamp(recencyScore + taskSeverityScore, 5, 99));

    const priorityLabel = urgency >= 68 ? 'Mendesak' : urgency >= 44 ? 'Disarankan' : 'Terjadwal Aman';
    const tone: MlCellTone = urgency >= 68 ? 'danger' : urgency >= 44 ? 'warn' : 'ok';
    const suggestedCategory = suggestAuditCategory(cfg.tasks, problemKeys, bestCatByRole.get(first.roleId));
    const daysSinceText = lastVisitDay ? `${daysSinceVisit} hr lalu (${fmtDate(lastVisitDay)})` : 'Belum pernah dikunjungi';

    const reasons: string[] = [];
    if (!lastVisitDay) reasons.push('Belum ada riwayat kunjungan');
    else if (daysSinceVisit >= 14) reasons.push(`Jeda kunjungan ${daysSinceVisit} hari`);
    if (pendingNowCount > 0) reasons.push(`${pendingNowCount} tugas masih pending`);
    if (avgRiskProb >= 60) reasons.push(`Risiko ML ${Math.round(avgRiskProb)}%`);
    const reasonText = reasons.length ? reasons.join(' · ') : 'Pemantauan rutin berkala';

    visitPlanRows.push({
      key: `vp|${first.roleId}|${first.outlet}`,
      tone,
      urgency,
      outlet: first.outlet,
      pic: first.pic,
      roleId: first.roleId,
      suggestedCategory,
      daysSinceVisitText: daysSinceText,
      reasonText,
      cells: [
        priorityLabel,
        `${urgency}/100`,
        first.roleLabel,
        first.pic,
        first.outlet,
        daysSinceText,
        `${pendingNowCount}/${slots.length}`,
        suggestedCategory,
        reasonText,
      ],
    });
  }

  visitPlanRows.sort((a, b) => b.urgency - a.urgency);

  const visitPlannerModule: MlModuleResult = {
    id: 'visit_planner',
    columns: [
      'Prioritas Kunjungan',
      'Skor Urgensi',
      'Workspace Role',
      'PIC',
      'Outlet',
      'Kunjungan Terakhir',
      'Tugas Pending',
      'Rekomendasi Fokus Audit',
      'Alasan Rekomendasi ML',
    ],
    rows: visitPlanRows.map(({ key, tone, cells }) => ({ key, tone, cells })),
    filename: `ml-prioritas-kunjungan-${roleSlug}-${anchorDay}.xlsx`,
    subtitle: 'Rekomendasi jadwal kunjungan minggu depan berdasarkan risiko tugas & jarak kunjungan terakhir',
    takeaways: visitPlanRows.length
      ? [
          `${visitPlanRows.filter((v) => v.urgency >= 68).length} outlet berstatus MENDESAK untuk dikunjungi minggu depan.`,
          `Kunjungan prioritas #1: ${visitPlanRows[0].outlet} (${visitPlanRows[0].pic}) — fokus ${visitPlanRows[0].suggestedCategory} (${visitPlanRows[0].reasonText}).`,
          'Prioritaskan kunjungan fisik ke outlet yang memiliki tugas pending berulang dan jeda kunjungan terlama.',
        ]
      : ['Belum ada data outlet untuk perencana kunjungan.'],
  };

  // ==================== MODULE 8: VISIT EFFECTIVENESS & AUDIT CATEGORY ====================
  const effectivenessRows: Array<{
    key: string;
    tone: MlCellTone;
    avgDelta: number;
    cells: Array<string | number>;
  }> = [];

  for (const stat of visitStatsByRoleCategory.values()) {
    const cfg = roleConfigs[stat.roleId];
    const avgDelta = mean(stat.deltas);
    const successRate = Math.round((stat.solvedCount / Math.max(1, stat.samples)) * 100);
    const tone: MlCellTone = avgDelta > 0.1 || successRate >= 60 ? 'ok' : avgDelta >= -0.1 ? 'warn' : 'danger';
    const verdict =
      avgDelta > 0.15
        ? 'Sangat Efektif Mempercepat Update'
        : avgDelta >= 0
          ? 'Cukup Efektif / Menjaga Stabilitas'
          : 'Kurang Berdampak (Perlu Evaluasi Follow-up)';

    effectivenessRows.push({
      key: `ve|${stat.roleId}|${stat.category}`,
      tone,
      avgDelta,
      cells: [
        verdict,
        cfg?.label || stat.roleId,
        stat.category,
        `${stat.samples}x`,
        `${successRate}%`,
        avgDelta > 0 ? `+${avgDelta.toFixed(2)}` : avgDelta.toFixed(2),
        'Perbandingan rata-rata (+/-) 3 hari kerja sebelum vs sesudah kunjungan',
      ],
    });
  }

  // Fallback detail rows if aggregated categories are empty but raw visits exist without H-3/H+3 window
  effectivenessRows.sort((a, b) => b.avgDelta - a.avgDelta);

  const visitEffectivenessModule: MlModuleResult = {
    id: 'visit_effectiveness',
    columns: [
      'Efektivitas Kunjungan',
      'Workspace Role',
      'Kategori Kunjungan',
      'Jumlah Sampel',
      'Rasio Perbaikan',
      'Dampak Rata-rata (Δ +/-)',
      'Metodologi Evaluasi',
    ],
    rows: effectivenessRows.map(({ key, tone, cells }) => ({ key, tone, cells })),
    filename: `ml-efektivitas-kunjungan-${roleSlug}-${anchorDay}.xlsx`,
    subtitle: 'Mengukur apakah kunjungan benar-benar menurunkan pending & memperbaiki skor (+/-) H+3 setelah kunjungan',
    takeaways: effectivenessRows.length
      ? [
          `Kategori audit paling berdampak: "${effectivenessRows[0].cells[2]}" (${effectivenessRows[0].cells[1]}) dengan rata-rata perbaikan ${effectivenessRows[0].cells[5]} poin.`,
          `Dari ${visitEffectRows.length} kunjungan yang memiliki jendela evaluasi H-3 vs H+3, tingkat perbaikan keseluruhan mencapai ${Math.round((visitEffectRows.filter((r) => r.deltaPm > 0).length / Math.max(1, visitEffectRows.length)) * 100)}%.`,
          'Gunakan hasil efektivitas ini untuk memilih jenis audit yang paling berdampak pada tiap outlet.',
        ]
      : ['Belum tersedia cukup riwayat kunjungan dengan data H-3 dan H+3 hari kerja untuk mengukur dampak sebelum-sesudah.'],
  };

  // ==================== MODULE 9: PERIOD TREND (IMPROVING VS DEGRADING) ====================
  const trendRows: Array<{
    key: string;
    tone: MlCellTone;
    deltaAvg: number;
    cells: Array<string | number>;
  }> = [];

  for (const [, slots] of outletGroupMap.entries()) {
    const first = slots[0];
    const nDays = first.days.length;
    const splitIdx = Math.max(1, Math.floor(nDays / 2));

    const earlyPms: number[] = [];
    const latePms: number[] = [];
    let earlyPend = 0;
    let earlyTotal = 0;
    let latePend = 0;
    let lateTotal = 0;

    for (const s of slots) {
      s.calcs.forEach((c, idx) => {
        if (idx < splitIdx) {
          earlyPms.push(c.pm);
          earlyTotal++;
          if (c.pend) earlyPend++;
        } else {
          latePms.push(c.pm);
          lateTotal++;
          if (c.pend) latePend++;
        }
      });
    }

    const earlyAvg = mean(earlyPms);
    const lateAvg = latePms.length ? mean(latePms) : earlyAvg;
    const deltaAvg = lateAvg - earlyAvg;
    const earlyComp = earlyTotal ? Math.round(((earlyTotal - earlyPend) / earlyTotal) * 100) : 0;
    const lateComp = lateTotal ? Math.round(((lateTotal - latePend) / lateTotal) * 100) : earlyComp;
    const deltaComp = lateComp - earlyComp;

    let traj: 'Membaik (Improving)' | 'Stabil' | 'Menurun (Degrading)';
    let tone: MlCellTone;
    if (deltaAvg >= 0.25 || deltaComp >= 8) {
      traj = 'Membaik (Improving)';
      tone = 'ok';
    } else if (deltaAvg <= -0.25 || deltaComp <= -8) {
      traj = 'Menurun (Degrading)';
      tone = 'danger';
    } else {
      traj = 'Stabil';
      tone = 'neutral';
    }

    const steepestTask = [...slots].sort((a, b) => a.slope - b.slope)[0];

    trendRows.push({
      key: `tr|${first.roleId}|${first.outlet}`,
      tone,
      deltaAvg,
      cells: [
        traj,
        first.roleLabel,
        first.pic,
        first.outlet,
        earlyAvg > 0 ? `+${earlyAvg.toFixed(2)}` : earlyAvg.toFixed(2),
        lateAvg > 0 ? `+${lateAvg.toFixed(2)}` : lateAvg.toFixed(2),
        deltaAvg > 0 ? `+${deltaAvg.toFixed(2)}` : deltaAvg.toFixed(2),
        `${earlyComp}% -> ${lateComp}% (${deltaComp >= 0 ? `+${deltaComp}%` : `${deltaComp}%`})`,
        steepestTask && steepestTask.slope < -0.05 ? steepestTask.task.label : 'Semua Stabil',
      ],
    });
  }

  trendRows.sort((a, b) => a.deltaAvg - b.deltaAvg);

  const periodTrendModule: MlModuleResult = {
    id: 'period_trend',
    columns: [
      'Arah Tren',
      'Workspace Role',
      'PIC',
      'Outlet',
      'Rata-rata Paruh Awal',
      'Rata-rata Paruh Akhir',
      'Perubahan (Δ +/-)',
      'Tren Kepatuhan',
      'Tugas Paling Menurun',
    ],
    rows: trendRows.map(({ key, tone, cells }) => ({ key, tone, cells })),
    filename: `ml-tren-performa-${roleSlug}-${anchorDay}.xlsx`,
    subtitle: `Perbandingan paruh awal vs paruh akhir periode (${safeEvalDays.length} hari kerja)`,
    takeaways: trendRows.length
      ? [
          `${trendRows.filter((t) => String(t.cells[0]).startsWith('Membaik')).length} outlet membaik, ${trendRows.filter((t) => t.cells[0] === 'Stabil').length} stabil, dan ${trendRows.filter((t) => String(t.cells[0]).startsWith('Menurun')).length} mengalami penurunan.`,
          trendRows[0].deltaAvg < 0
            ? `Penurunan terdalam: ${trendRows[0].cells[3]} (${trendRows[0].cells[2]}) turun ${trendRows[0].cells[6]} poin (fokus: ${trendRows[0].cells[8]}).`
            : 'Tidak ada outlet dengan penurunan performa signifikan pada periode ini.',
          trendRows[trendRows.length - 1].deltaAvg > 0
            ? `Peningkatan terbaik: ${trendRows[trendRows.length - 1].cells[3]} naik ${trendRows[trendRows.length - 1].cells[6]} poin.`
            : 'Terus jaga konsistensi input harian di seluruh outlet.',
        ]
      : ['Belum tersedia cukup hari kerja untuk membandingkan tren antar paruh periode.'],
  };

  // ==================== MODULE 10: AUTO-ACTION PLAN (SYNTHESIS) ====================
  const actionItems: Array<{
    key: string;
    tone: MlCellTone;
    score: number;
    priorityCode: 'P1 Kritis' | 'P2 Tinggi' | 'P3 Pantau';
    cells: Array<string | number>;
  }> = [];

  const clusterByOutlet = new Map<string, (typeof clusteredOutlets)[number]>();
  for (const c of clusteredOutlets) clusterByOutlet.set(`${c.roleId}|${c.outlet}`, c);
  const visitByOutlet = new Map<string, (typeof visitPlanRows)[number]>();
  for (const v of visitPlanRows) visitByOutlet.set(`${v.roleId}|${v.outlet}`, v);
  const bfByPic = new Map<string, (typeof backfillRows)[number]>();
  for (const b of backfillRows) bfByPic.set(`${b.cells[1]}|${b.cells[2]}`, b);

  for (const [, slots] of outletGroupMap.entries()) {
    const first = slots[0];
    const okKey = `${first.roleId}|${first.outlet}`;
    const cluster = clusterByOutlet.get(okKey);
    const visit = visitByOutlet.get(okKey);
    const bf = bfByPic.get(`${first.roleLabel}|${first.pic}`);

    const topRiskSlot = [...slots].sort((a, b) => b.riskProbPct - a.riskProbPct)[0];
    const pendingSlots = slots.filter((s) => s.latest.pend);
    const urgentVisit = Boolean(visit && visit.urgency >= 68);
    const highBackfill = Boolean(bf && bf.backfillPct >= 30);

    const compositeScore = Math.round(
      (topRiskSlot?.riskProbPct || 0) * 0.45 +
        (visit?.urgency || 0) * 0.3 +
        ((cluster?.clusterId || 0) * 15) +
        (highBackfill ? 10 : 0)
    );

    const priorityCode: 'P1 Kritis' | 'P2 Tinggi' | 'P3 Pantau' =
      compositeScore >= 68 || (cluster?.clusterId === 2 && pendingSlots.length > 0)
        ? 'P1 Kritis'
        : compositeScore >= 44 || pendingSlots.length > 0
          ? 'P2 Tinggi'
          : 'P3 Pantau';
    const tone: MlCellTone =
      priorityCode === 'P1 Kritis' ? 'danger' : priorityCode === 'P2 Tinggi' ? 'warn' : 'ok';

    const signals: string[] = [];
    if (topRiskSlot) signals.push(`Risiko ${topRiskSlot.riskProbPct}% (${topRiskSlot.task.shortLabel || topRiskSlot.task.label})`);
    if (cluster && cluster.clusterId > 0) signals.push(cluster.clusterLabel);
    if (urgentVisit && visit) signals.push(`Kunjungan mendesak (${visit.daysSinceVisitText})`);
    if (highBackfill && bf) signals.push(`Rapel PIC ${bf.backfillPct}%`);

    const focusItems =
      pendingSlots.length > 0
        ? pendingSlots.map((p) => p.task.shortLabel || p.task.label).slice(0, 3).join(', ')
        : topRiskSlot
          ? topRiskSlot.task.label
          : '-';

    const actionSteps: string[] = [];
    if (pendingSlots.length > 0 && topRiskSlot) {
      actionSteps.push(topRiskSlot.nextAction);
    } else {
      actionSteps.push('Pertahankan update tepat waktu');
    }
    if (urgentVisit && visit) {
      actionSteps.push(`Jadwalkan ${visit.suggestedCategory}`);
    }

    const impactEstimate =
      pendingSlots.length > 0
        ? `Menutup ${pendingSlots.length} tugas pending & mencegah penumpukan closing`
        : 'Menjaga skor kepatuhan outlet tetap di zona hijau';

    actionItems.push({
      key: `act|${okKey}`,
      tone,
      score: compositeScore,
      priorityCode,
      cells: [
        priorityCode,
        first.roleLabel,
        first.pic,
        first.outlet,
        focusItems,
        signals.join(' · ') || 'Normal',
        actionSteps.join(' + '),
        impactEstimate,
      ],
    });
  }

  actionItems.sort((a, b) => b.score - a.score);
  const p1ActionCount = actionItems.filter((a) => a.priorityCode === 'P1 Kritis').length;

  const actionPlanModule: MlModuleResult = {
    id: 'action_plan',
    columns: [
      'Prioritas',
      'Workspace Role',
      'PIC',
      'Outlet',
      'Fokus Tugas',
      'Sinyal Gabungan ML',
      'Rekomendasi Aksi Selanjutnya',
      'Proyeksi Dampak',
    ],
    rows: actionItems.map(({ key, tone, cells }) => ({ key, tone, cells })),
    filename: `ml-action-plan-prioritas-${roleSlug}-${anchorDay}.xlsx`,
    subtitle: `Daftar aksi terprioritas untuk ${nextWeekdayLabel}, ${fmtDateLong(nextWorkDay)} lintas tugas & kunjungan`,
    takeaways: actionItems.length
      ? [
          `${p1ActionCount} outlet masuk prioritas P1 Kritis yang perlu tindakan langsung hari kerja berikutnya.`,
          actionItems[0]
            ? `Fokus utama #1: ${actionItems[0].cells[3]} (${actionItems[0].cells[2]}) — ${actionItems[0].cells[6]}.`
            : 'Semua outlet terkendali.',
          'Gunakan tombol Unduh XLSX untuk membagikan daftar tindak lanjut harian ini ke tim PIC.',
        ]
      : ['Belum ada data tugas/outlet pada role terpilih. Tambahkan tugas & outlet di menu Kelola Tugas & Outlet.'],
  };

  return {
    roleCoverage,
    overview: {
      highRiskSlots: highRiskCount,
      eomAtRiskOutlets,
      realtimeInputPct: globalRealtimePct,
      p1ActionCount,
      evaluatedOutlets: outletGroupMap.size,
      evaluatedTasks: new Set(slotObservations.map((s) => `${s.roleId}|${s.task.key}`)).size,
    },
    modules: {
      action_plan: actionPlanModule,
      risk_forecast: riskModule,
      eom_readiness: eomModule,
      dependency_bottleneck: depModule,
      backfill_anomaly: backfillModule,
      outlet_clustering: clusterModule,
      pic_kpi_forecast: picKpiModule,
      visit_planner: visitPlannerModule,
      visit_effectiveness: visitEffectivenessModule,
      period_trend: periodTrendModule,
    },
    evaluationPeriodLabel,
  };
}

export function mlTableToCsv(columns: string[], rows: MlTableRow[]): string {
  const lines = [
    columns.map(escapeCsv).join(','),
    ...rows.map((r) => r.cells.map(escapeCsv).join(',')),
  ];
  return `\uFEFF${lines.join('\n')}`;
}
