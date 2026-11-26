import {
  OutletStoreState,
  RoleConfig,
  TaskDefinition,
} from '../types/outlet';
import {
  calcTask,
  fmtWeek,
  getTaskInputType,
  parseUtcDate,
  shiftMonthKey,
  todayIso,
} from './outletLogic';

const MONTHS_UPPER_ID = [
  'JANUARI',
  'FEBRUARI',
  'MARET',
  'APRIL',
  'MEI',
  'JUNI',
  'JULI',
  'AGUSTUS',
  'SEPTEMBER',
  'OKTOBER',
  'NOVEMBER',
  'DESEMBER',
] as const;

const MONTHS_SHORT_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const;

export function formatPhotoMonthUpper(
  isoOrMonth: string,
  refYear?: string
): string {
  const clean = (isoOrMonth || '').trim();
  const match = /^(\d{4})-(\d{2})/.exec(clean);
  if (!match) return '-';
  const year = match[1];
  const monthIdx = Number(match[2]) - 1;
  const monthName = MONTHS_UPPER_ID[monthIdx];
  if (!monthName) return '-';
  if (refYear && year !== refYear) {
    return `${monthName} ${year}`;
  }
  return monthName;
}

export function formatPhotoDate(isoStr: string): string {
  const clean = (isoStr || '').trim();
  if (!clean) return '-';
  const normalized = clean.length === 7 ? `${clean}-01` : clean;
  const d = parseUtcDate(normalized);
  if (Number.isNaN(d.getTime())) return clean;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mmm = MONTHS_SHORT_ID[d.getUTCMonth()] || '';
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${dd}-${mmm}-${yy}`;
}

function formatPhotoTaskValue(
  task: TaskDefinition,
  rawDate: string,
  workingYear: string
): string {
  const clean = (rawDate || '').trim();
  if (!clean) return '-';
  const inputType = getTaskInputType(task);
  if (inputType === 'month') {
    return formatPhotoMonthUpper(clean, workingYear);
  }
  if (inputType === 'week') {
    return fmtWeek(clean);
  }
  return formatPhotoDate(clean);
}

function normalizeText(s: string): string {
  return s.trim().toLowerCase();
}

export function detectStockDiscrepancyTasks(tasks: TaskDefinition[]): {
  memoTask?: TaskDefinition;
  bmTask?: TaskDefinition;
  jualTask?: TaskDefinition;
  otherTasks: TaskDefinition[];
} {
  const memoTask = tasks.find(
    (t) =>
      t.key === 'memo' ||
      normalizeText(t.label).includes('discrepancy') ||
      normalizeText(t.label).includes('memo')
  );
  const bmTask = tasks.find(
    (t) =>
      t.key === 'bm' ||
      normalizeText(t.label).includes('barang masuk') ||
      normalizeText(t.shortLabel) === 'brg masuk'
  );
  const jualTask = tasks.find(
    (t) =>
      t.key === 'jual' ||
      normalizeText(t.label).includes('penjualan')
  );

  const usedKeys = new Set(
    [memoTask?.key, bmTask?.key, jualTask?.key].filter((k): k is string => Boolean(k))
  );

  const remaining = tasks.filter((t) => !usedKeys.has(t.key));
  const preferredOrder = ['konv', 'bt', 'ham'];
  const ordered = [...remaining].sort((a, b) => {
    const idxA = preferredOrder.indexOf(a.key);
    const idxB = preferredOrder.indexOf(b.key);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return 0;
  });

  return {
    memoTask,
    bmTask,
    jualTask,
    otherTasks: ordered,
  };
}

export function computeAutoDiscPending(
  memoDate: string,
  workingDay: string
): string {
  const cleanWorkingDay = (workingDay || '').trim();
  const workingMonth = cleanWorkingDay.slice(0, 7);
  const workingYear = cleanWorkingDay.slice(0, 4);
  const prevMonth = shiftMonthKey(workingMonth, -1);

  const cleanMemo = (memoDate || '').trim();
  if (!cleanMemo) {
    return formatPhotoMonthUpper(prevMonth, workingYear);
  }

  const memoMonth = cleanMemo.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(memoMonth)) {
    return '-';
  }

  if (memoMonth >= prevMonth) {
    return '-';
  }

  // Collect unresolved months from month after memoMonth up to prevMonth (max 4 months listed)
  const pendingMonths: string[] = [];
  let cursor = shiftMonthKey(memoMonth, 1);
  let guard = 0;
  while (cursor <= prevMonth && guard < 12) {
    pendingMonths.push(formatPhotoMonthUpper(cursor, workingYear));
    cursor = shiftMonthKey(cursor, 1);
    guard++;
  }

  if (pendingMonths.length === 0) return '-';
  if (pendingMonths.length > 3) {
    return `${pendingMonths[0]} - ${pendingMonths[pendingMonths.length - 1]}`;
  }
  return pendingMonths.join(', ');
}

export type PhotoOutletLine =
  | {
      kind: 'simple';
      label: string;
      value: string;
    }
  | {
      kind: 'disc_berjalan';
      label: string;
      monthLabel: string;
      subItems: Array<{ label: string; value: string }>;
    };

export interface PhotoOutletBlock {
  outlet: string;
  autoDiscPending: string;
  lines: PhotoOutletLine[];
}

export function buildPhotoOutletBlocks(params: {
  outlets: string[];
  config: RoleConfig;
  store: OutletStoreState;
  days: string[];
  targetDay: string;
  today?: string;
}): PhotoOutletBlock[] {
  const {
    outlets,
    config,
    store,
    days,
    targetDay,
    today = todayIso(),
  } = params;

  const workingMonth = targetDay.slice(0, 7);
  const workingYear = targetDay.slice(0, 4);
  const { memoTask, bmTask, jualTask, otherTasks } = detectStockDiscrepancyTasks(
    config.tasks
  );
  const hasDiscLayout = Boolean(memoTask || (bmTask && jualTask));

  return outlets.map((outlet) => {
    const lines: PhotoOutletLine[] = [];
    let autoDiscPending = '-';

    if (hasDiscLayout) {
      if (memoTask) {
        const memoCalc = calcTask(
          store,
          days,
          config.tasks,
          outlet,
          targetDay,
          memoTask.key,
          today
        );
        autoDiscPending = computeAutoDiscPending(memoCalc.d, targetDay);

        lines.push({
          kind: 'simple',
          label: 'DISC PENDING',
          value: autoDiscPending || '-',
        });
      }

      if (bmTask || jualTask) {
        const subItems: Array<{ label: string; value: string }> = [];
        if (bmTask) {
          const bmCalc = calcTask(
            store,
            days,
            config.tasks,
            outlet,
            targetDay,
            bmTask.key,
            today
          );
          subItems.push({
            label: bmTask.label.toUpperCase(),
            value: formatPhotoTaskValue(bmTask, bmCalc.d, workingYear),
          });
        }
        if (jualTask) {
          const jualCalc = calcTask(
            store,
            days,
            config.tasks,
            outlet,
            targetDay,
            jualTask.key,
            today
          );
          subItems.push({
            label: jualTask.label.toUpperCase(),
            value: formatPhotoTaskValue(jualTask, jualCalc.d, workingYear),
          });
        }

        lines.push({
          kind: 'disc_berjalan',
          label: 'DISC BERJALAN',
          monthLabel: formatPhotoMonthUpper(workingMonth, workingYear),
          subItems,
        });
      }

      for (const t of otherTasks) {
        const c = calcTask(store, days, config.tasks, outlet, targetDay, t.key, today);
        lines.push({
          kind: 'simple',
          label: t.label.toUpperCase(),
          value: formatPhotoTaskValue(t, c.d, workingYear),
        });
      }
    } else {
      for (const t of config.tasks) {
        const c = calcTask(store, days, config.tasks, outlet, targetDay, t.key, today);
        lines.push({
          kind: 'simple',
          label: t.label.toUpperCase(),
          value: formatPhotoTaskValue(t, c.d, workingYear),
        });
      }
    }

    return {
      outlet: outlet.toUpperCase(),
      autoDiscPending,
      lines,
    };
  });
}

export function renderResultPhotoCanvas(
  blocks: PhotoOutletBlock[]
): HTMLCanvasElement {
  const scale = 2;
  const paddingX = 34;
  const paddingTop = 28;
  const paddingBottom = 28;
  const headerFont = '700 17px "Calibri", "Segoe UI", Arial, sans-serif';
  const bodyFont = '400 15px "Calibri", "Segoe UI", Arial, sans-serif';
  const lineHeight = 23;
  const ruleThickness = 3.5;
  const blockGap = 32;
  const colonGapBefore = 16;
  const colonGapAfter = 14;

  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d');
  if (!mCtx) {
    throw new Error('Canvas tidak didukung oleh browser ini.');
  }

  mCtx.font = bodyFont;
  let maxLabelWidth = 120;
  for (const block of blocks) {
    for (const line of block.lines) {
      const w = mCtx.measureText(line.label).width;
      if (w > maxLabelWidth) maxLabelWidth = w;
    }
  }

  const labelEndX = paddingX + maxLabelWidth + colonGapBefore;
  const colonWidth = mCtx.measureText(':').width;
  const valueStartX = labelEndX + colonWidth + colonGapAfter;

  let maxRightEdge = 780;
  for (const block of blocks) {
    mCtx.font = headerFont;
    const titleW = mCtx.measureText(block.outlet).width + paddingX * 2;
    if (titleW > maxRightEdge) maxRightEdge = titleW;

    mCtx.font = bodyFont;
    for (const line of block.lines) {
      if (line.kind === 'simple') {
        const endX = valueStartX + mCtx.measureText(line.value).width + paddingX;
        if (endX > maxRightEdge) maxRightEdge = endX;
      } else {
        const subText = formatDiscBerjalanSuffix(line);
        const endX =
          valueStartX +
          mCtx.measureText(line.monthLabel).width +
          10 +
          mCtx.measureText(subText).width +
          paddingX;
        if (endX > maxRightEdge) maxRightEdge = endX;
      }
    }
  }

  const logicalWidth = Math.ceil(Math.max(820, maxRightEdge));
  const titleOffsetY = 17;
  const ruleOffsetY = 23;
  const firstRowGapAfterRule = 21;
  const descenderBuffer = 8;

  let calcY = paddingTop;
  for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
    const block = blocks[bIdx];
    const rowCount = block.lines.length;
    const ruleY = calcY + ruleOffsetY;
    const firstRowY = ruleY + ruleThickness + firstRowGapAfterRule;
    const lastRowY =
      rowCount > 0
        ? firstRowY + (rowCount - 1) * lineHeight
        : ruleY + ruleThickness;
    if (bIdx < blocks.length - 1) {
      calcY = lastRowY + blockGap;
    } else {
      calcY = lastRowY + descenderBuffer;
    }
  }
  const logicalHeight = Math.ceil(Math.max(140, calcY + paddingBottom));

  const canvas = document.createElement('canvas');
  canvas.width = logicalWidth * scale;
  canvas.height = logicalHeight * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Gagal membuat konteks gambar canvas.');
  }

  ctx.scale(scale, scale);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);

  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'alphabetic';

  let y = paddingTop;
  for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
    const block = blocks[bIdx];

    // Centered bold outlet header
    ctx.font = headerFont;
    ctx.textAlign = 'center';
    ctx.fillText(block.outlet, logicalWidth / 2, y + titleOffsetY);

    // Solid black divider bar right underneath
    const ruleY = y + ruleOffsetY;
    ctx.fillRect(paddingX, ruleY, logicalWidth - paddingX * 2, ruleThickness);

    let rowY = ruleY + ruleThickness + firstRowGapAfterRule;
    ctx.font = bodyFont;
    ctx.textAlign = 'left';

    for (const line of block.lines) {
      ctx.fillText(line.label, paddingX, rowY);
      ctx.fillText(':', labelEndX, rowY);

      if (line.kind === 'simple') {
        ctx.fillText(line.value, valueStartX, rowY);
      } else {
        ctx.fillText(line.monthLabel, valueStartX, rowY);
        if (line.subItems.length > 0) {
          const monthW = ctx.measureText(line.monthLabel).width;
          const suffix = formatDiscBerjalanSuffix(line);
          ctx.fillText(suffix, valueStartX + monthW + 10, rowY);
        }
      }

      rowY += lineHeight;
    }

    const lastRowY =
      block.lines.length > 0
        ? rowY - lineHeight
        : ruleY + ruleThickness;
    y = lastRowY + blockGap;
  }

  return canvas;
}

function formatDiscBerjalanSuffix(
  line: Extract<PhotoOutletLine, { kind: 'disc_berjalan' }>
): string {
  if (line.subItems.length === 0) return '';
  const parts = line.subItems.map((item) => `${item.label}  : ${item.value}`);
  return `: (${parts.join('       ')}  )`;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Gagal menghasilkan file foto PNG.'));
    }, 'image/png');
  });
}
