import { CalendarAssignScope, CalendarEvent, OperationalRoleId } from '../types/outlet';
import { downloadXlsxWorkbook } from './exportXlsx';
import {
  AssignablePicOption,
  CALENDAR_TIME_SLOTS,
  ROLE_LABELS,
  todayIso,
} from './outletLogic';

export interface ParsedAssignImportRow {
  rowNumber: number;
  date: string;
  startTime: string;
  assignScope: CalendarAssignScope;
  assignedDivision: OperationalRoleId | '';
  assignedPic: string;
  assignedPicUpper: string;
  assignedRole: OperationalRoleId;
  assignedEmail: string;
  assignedOutlet: string;
  title: string;
  notes: string;
}

export interface AssignImportParseResult {
  validRows: ParsedAssignImportRow[];
  errors: Array<{ rowNumber: number; message: string }>;
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB safety cap
const MAX_IMPORT_ROWS = 300;

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#([0-9]+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function colLettersToIndex(letters: string): number {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    const code = letters.charCodeAt(i) - 64;
    if (code >= 1 && code <= 26) {
      idx = idx * 26 + code;
    }
  }
  return Math.max(0, idx - 1);
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Browser tidak mendukung ekstraksi XLSX. Gunakan format CSV sebagai alternatif.');
  }
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  const safeCopy = new Uint8Array(compressed.byteLength);
  safeCopy.set(compressed);
  await writer.write(safeCopy);
  await writer.close();

  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
      if (total > 20 * 1024 * 1024) {
        throw new Error('Isi file XLSX terlalu besar untuk diproses.');
      }
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

async function extractZipEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('utf-8');
  const entries = new Map<string, Uint8Array>();

  // Locate End of Central Directory (EOCD) signature 0x06054b50 from the tail
  let eocdOffset = -1;
  const minOffset = Math.max(0, bytes.byteLength - 65557);
  for (let i = bytes.byteLength - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('File XLSX tidak valid (struktur ZIP tidak ditemukan).');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);

  for (let i = 0; i < totalEntries && cdOffset + 46 <= bytes.byteLength; i++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) break;
    const method = view.getUint16(cdOffset + 10, true);
    const compressedSize = view.getUint32(cdOffset + 20, true);
    const fileNameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);
    const name = decoder.decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + fileNameLen));
    cdOffset += 46 + fileNameLen + extraLen + commentLen;

    // Only decompress XML files needed for spreadsheet parsing
    const lowerName = name.toLowerCase();
    if (
      !lowerName.endsWith('.xml') &&
      !lowerName.endsWith('.rels')
    ) {
      continue;
    }

    if (localHeaderOffset + 30 > bytes.byteLength) continue;
    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) continue;
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.byteLength) continue;

    const rawSlice = bytes.subarray(dataStart, dataEnd);
    if (method === 0) {
      entries.set(name, rawSlice);
    } else if (method === 8) {
      entries.set(name, await inflateRawBytes(rawSlice));
    }
  }

  return entries;
}

function parseSharedStringsXml(xml: string): string[] {
  const strings: string[] = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let siMatch: RegExpExecArray | null;
  while ((siMatch = siRegex.exec(xml)) !== null) {
    const inner = siMatch[1];
    const tParts: string[] = [];
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tRegex.exec(inner)) !== null) {
      tParts.push(decodeXmlEntities(tMatch[1]));
    }
    strings.push(tParts.join(''));
  }
  return strings;
}

function parseWorksheetRowsXml(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const rowContent = rowMatch[1];
    const cells: string[] = [];
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;
    let fallbackCol = 0;

    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2];
      const refMatch = /\br="([A-Za-z]+)[0-9]+"/.exec(attrs);
      const colIdx = refMatch ? colLettersToIndex(refMatch[1].toUpperCase()) : fallbackCol;
      fallbackCol = colIdx + 1;

      const typeMatch = /\bt="([^"]+)"/.exec(attrs);
      const cellType = typeMatch ? typeMatch[1] : '';

      let value: string;
      if (cellType === 'inlineStr') {
        const tParts: string[] = [];
        const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let tMatch: RegExpExecArray | null;
        while ((tMatch = tRegex.exec(inner)) !== null) {
          tParts.push(decodeXmlEntities(tMatch[1]));
        }
        value = tParts.join('');
      } else {
        const vMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
        const rawV = vMatch ? decodeXmlEntities(vMatch[1]) : '';
        if (cellType === 's') {
          const sIdx = parseInt(rawV, 10);
          value = Number.isInteger(sIdx) && sIdx >= 0 && sIdx < sharedStrings.length
            ? sharedStrings[sIdx]
            : '';
        } else if (cellType === 'b') {
          value = rawV === '1' ? 'TRUE' : 'FALSE';
        } else {
          value = rawV;
        }
      }

      while (cells.length < colIdx) {
        cells.push('');
      }
      cells[colIdx] = value;
    }

    if (cells.some((c) => c.trim().length > 0)) {
      rows.push(cells);
    }
  }

  return rows;
}

export async function parseXlsxRows(buffer: ArrayBuffer | Uint8Array): Promise<string[][]> {
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error('Ukuran file maksimal 5 MB.');
  }
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const entries = await extractZipEntries(bytes);
  const decoder = new TextDecoder('utf-8');

  const sharedBytes = entries.get('xl/sharedStrings.xml');
  const sharedStrings = sharedBytes ? parseSharedStringsXml(decoder.decode(sharedBytes)) : [];

  let sheetBytes = entries.get('xl/worksheets/sheet1.xml');
  if (!sheetBytes) {
    for (const [name, data] of entries.entries()) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(name)) {
        sheetBytes = data;
        break;
      }
    }
  }
  if (!sheetBytes) {
    throw new Error('Worksheet tidak ditemukan di dalam file XLSX.');
  }

  return parseWorksheetRowsXml(decoder.decode(sheetBytes), sharedStrings);
}

export function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] || '';
  const delimiter =
    (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((c) => c.trim().length > 0)) rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      if (row.some((c) => c.trim().length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim().length > 0)) rows.push(row);
  return rows;
}

function normalizeImportedDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s);
  if (dmyMatch) {
    const d = Number(dmyMatch[1]);
    const m = Number(dmyMatch[2]);
    const y = Number(dmyMatch[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // Excel serial date number (e.g., 46353)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial >= 40000 && serial <= 80000) {
      const utcMs = Date.UTC(1899, 11, 30) + serial * 86400000;
      const dt = new Date(utcMs);
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dt.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  return null;
}

function normalizeImportedStartTime(raw: string): string | null {
  const s = raw.trim().replace(/\s*WIB$/i, '');
  if (!s) return '09:00';

  // Excel time fraction (e.g., 0.375 = 09:00)
  if (/^0?\.\d+$/.test(s)) {
    const frac = Number(s);
    if (frac >= 0 && frac < 1) {
      const totalMins = Math.round((frac * 24 * 60) / 30) * 30;
      const hh = String(Math.floor(totalMins / 60)).padStart(2, '0');
      const mm = String(totalMins % 60).padStart(2, '0');
      const slot = `${hh}:${mm}`;
      return CALENDAR_TIME_SLOTS.includes(slot) ? slot : null;
    }
  }

  // HH:MM or H:MM or HH.MM
  const hmMatch = /^(\d{1,2})[:.](\d{2})(?::\d{2})?$/.exec(s);
  if (hmMatch) {
    const h = Number(hmMatch[1]);
    const m = Number(hmMatch[2]);
    if (h >= 8 && h <= 19 && m >= 0 && m <= 59) {
      const snappedMin = m < 15 ? 0 : m < 45 ? 30 : 60;
      const adjH = snappedMin === 60 ? h + 1 : h;
      const adjM = snappedMin === 60 ? 0 : snappedMin;
      const slot = `${String(adjH).padStart(2, '0')}:${String(adjM).padStart(2, '0')}`;
      return CALENDAR_TIME_SLOTS.includes(slot) ? slot : null;
    }
  }

  return null;
}

function normalizeRoleInput(raw: string): OperationalRoleId | null {
  const clean = raw.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (!clean) return null;
  if (clean === 'stock accounting' || clean === 'sa' || clean === 'stock') {
    return 'stock_accounting';
  }
  if (clean === 'gl' || clean === 'general ledger') {
    return 'gl';
  }
  if (clean === 'accounting' || clean === 'acc') {
    return 'accounting';
  }
  return null;
}

export function parseAssignImportRows(
  rows: string[][],
  assignablePics: AssignablePicOption[]
): AssignImportParseResult {
  const validRows: ParsedAssignImportRow[] = [];
  const errors: Array<{ rowNumber: number; message: string }> = [];

  if (rows.length < 2) {
    return {
      validRows: [],
      errors: [{ rowNumber: 1, message: 'File harus memiliki baris header dan minimal 1 baris data.' }],
    };
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const findColExact = (aliases: string[]): number =>
    headers.findIndex((h) => aliases.some((a) => h.includes(a)));
  const findCol = (aliases: string[], fallbackIdx: number): number => {
    const found = findColExact(aliases);
    return found >= 0 ? found : fallbackIdx;
  };

  const colScope = findColExact(['tipe', 'scope', 'jenis', 'target']);
  const colDate = findCol(['tanggal', 'date', 'tgl'], 0);
  const colTime = findCol(['jam', 'waktu', 'time', 'mulai', 'berangkat'], 1);
  const colPic = findCol(['pic', 'nama', 'personil', 'user'], 2);
  const colRole = findCol(['divisi', 'role', 'departemen'], 3);
  const colOutlet = findCol(['outlet', 'cabang', 'toko'], 4);
  const colTitle = findCol(['judul', 'tugas', 'title', 'agenda', 'kegiatan'], 5);
  const colNotes = findCol(['catatan', 'keterangan', 'notes', 'note'], 6);

  const picLookup = new Map<string, AssignablePicOption>();
  for (const p of assignablePics) {
    if (!picLookup.has(p.picUpper)) {
      picLookup.set(p.picUpper, p);
    }
  }

  const dataRows = rows.slice(1, MAX_IMPORT_ROWS + 1);
  if (rows.length - 1 > MAX_IMPORT_ROWS) {
    errors.push({
      rowNumber: MAX_IMPORT_ROWS + 2,
      message: `Maksimal ${MAX_IMPORT_ROWS} baris per upload. Baris selebihnya tidak diimpor.`,
    });
  }

  dataRows.forEach((cols, idx) => {
    const rowNumber = idx + 2;
    const rawScope = colScope >= 0 ? (cols[colScope] || '').trim().toLowerCase() : '';
    const rawDate = (cols[colDate] || '').trim();
    const rawTime = (cols[colTime] || '').trim();
    const rawPic = (cols[colPic] || '').trim();
    const rawRole = (cols[colRole] || '').trim();
    const rawOutlet = (cols[colOutlet] || '').trim();
    const rawTitle = (cols[colTitle] || '').trim();
    const rawNotes = (cols[colNotes] || '').trim();

    if (!rawDate && !rawPic && !rawRole && !rawTitle) return;

    const date = normalizeImportedDate(rawDate);
    if (!date) {
      errors.push({
        rowNumber,
        message: `Format tanggal tidak valid ("${rawDate || '-'}"). Gunakan YYYY-MM-DD atau DD/MM/YYYY.`,
      });
      return;
    }

    const startTime = normalizeImportedStartTime(rawTime);
    if (!startTime) {
      errors.push({
        rowNumber,
        message: `Jam berangkat tidak valid ("${rawTime}"). Gunakan jam antara 08:00 – 19:00.`,
      });
      return;
    }

    const picLower = rawPic.toLowerCase();
    const isWildcardPic =
      !rawPic ||
      picLower === '-' ||
      picLower === 'semua' ||
      picLower === 'all' ||
      picLower === 'divisi' ||
      picLower === 'semua pic' ||
      picLower === 'semua pic divisi';
    const explicitDivisionScope =
      rawScope === 'divisi' || rawScope === 'division' || rawScope === 'team' || rawScope === 'tim';

    const parsedRoleFromCol = normalizeRoleInput(rawRole);
    const parsedRoleFromPic = !picLookup.has(rawPic.toUpperCase())
      ? normalizeRoleInput(rawPic)
      : null;

    const isDivisionRow =
      explicitDivisionScope ||
      (isWildcardPic && Boolean(parsedRoleFromCol)) ||
      (!parsedRoleFromCol && Boolean(parsedRoleFromPic));

    const title = (rawTitle || (rawOutlet ? `Kunjungan ${rawOutlet}` : 'Assign Kunjungan')).slice(
      0,
      120
    );

    if (isDivisionRow) {
      const targetDivision = parsedRoleFromCol || parsedRoleFromPic;
      if (!targetDivision) {
        errors.push({
          rowNumber,
          message: `Divisi tujuan tidak valid ("${rawRole || rawPic || '-'}"). Gunakan Stock Accounting, GL, atau Accounting.`,
        });
        return;
      }

      validRows.push({
        rowNumber,
        date,
        startTime,
        assignScope: 'division',
        assignedDivision: targetDivision,
        assignedPic: '',
        assignedPicUpper: '',
        assignedRole: targetDivision,
        assignedEmail: '',
        assignedOutlet: rawOutlet.slice(0, 40),
        title,
        notes: rawNotes.slice(0, 500),
      });
      return;
    }

    if (!rawPic) {
      errors.push({
        rowNumber,
        message: 'Nama PIC wajib diisi (atau kosongkan PIC & isi kolom Divisi untuk Assign Divisi).',
      });
      return;
    }

    const picUpper = rawPic.toUpperCase();
    const matchedPic = picLookup.get(picUpper);
    const parsedRole = parsedRoleFromCol || matchedPic?.roleId || 'stock_accounting';

    validRows.push({
      rowNumber,
      date,
      startTime,
      assignScope: 'pic',
      assignedDivision: '',
      assignedPic: (matchedPic?.pic || rawPic).slice(0, 60),
      assignedPicUpper: (matchedPic?.picUpper || picUpper).slice(0, 60),
      assignedRole: parsedRole,
      assignedEmail: (matchedPic?.email || '').slice(0, 120),
      assignedOutlet: rawOutlet.slice(0, 40),
      title,
      notes: rawNotes.slice(0, 500),
    });
  });

  return { validRows, errors };
}

export function formatAssignStatusLabel(status?: CalendarEvent['assignStatus']): string {
  if (status === 'completed') return 'Selesai';
  if (status === 'cancelled') return 'Tidak Jadi Pergi (0)';
  return 'Ditugaskan';
}

function summarizeDivisionResponses(evt: CalendarEvent): { statusText: string; returnText: string } {
  if (evt.assignStatus === 'cancelled') {
    return { statusText: 'Dibatalkan Admin (0)', returnText: '-' };
  }
  const entries = Object.entries(evt.picResponses || {});
  if (entries.length === 0) {
    return { statusText: formatAssignStatusLabel(evt.assignStatus), returnText: '-' };
  }
  const done = entries.filter(([, r]) => r.status === 'completed');
  const cancelled = entries.filter(([, r]) => r.status === 'cancelled');
  const statusParts: string[] = [];
  if (done.length > 0) statusParts.push(`${done.length} selesai`);
  if (cancelled.length > 0) statusParts.push(`${cancelled.length} batal`);
  const returnParts = done.map(([pic, r]) => `${pic}: ${r.returnTime}`);
  return {
    statusText: statusParts.length > 0 ? statusParts.join(', ') : 'Ditugaskan',
    returnText: returnParts.length > 0 ? returnParts.join('; ') : '-',
  };
}

export function exportAssignsToXlsx(events: CalendarEvent[], filename?: string): void {
  const assignEvents = events
    .filter((evt) => evt.eventType === 'assign')
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  const columns = [
    'Tanggal',
    'Jam Berangkat',
    'Tipe Target',
    'PIC',
    'Divisi',
    'Outlet',
    'Judul / Tugas',
    'Catatan',
    'Status',
    'Jam Pulang',
    'Alasan Batal',
    'Dibuat Oleh',
  ];

  const rows = assignEvents.map((evt) => {
    const isDivision = evt.assignScope === 'division';
    const roleKey = evt.assignedDivision || evt.assignedRole;
    const divSummary = isDivision ? summarizeDivisionResponses(evt) : null;
    return [
      evt.date,
      evt.startTime,
      isDivision ? 'Divisi' : 'PIC',
      isDivision ? 'Semua PIC Divisi' : evt.assignedPic || '-',
      roleKey ? ROLE_LABELS[roleKey] || roleKey : '-',
      evt.assignedOutlet || '-',
      evt.title,
      evt.notes || '',
      divSummary ? divSummary.statusText : formatAssignStatusLabel(evt.assignStatus),
      divSummary ? divSummary.returnText : evt.returnTime || '-',
      evt.cancelReason || '',
      evt.createdByName || evt.createdByEmail || '-',
    ];
  });

  downloadXlsxWorkbook(filename || `assign-kalender-${todayIso()}.xlsx`, [
    {
      name: 'Daftar Assign',
      columns,
      rows,
    },
  ]);
}

export function downloadAssignTemplateXlsx(assignablePics: AssignablePicOption[]): void {
  const samplePic = assignablePics[0];
  const today = todayIso();
  downloadXlsxWorkbook('template-upload-assign-kalender.xlsx', [
    {
      name: 'Template Assign',
      columns: ['Tanggal', 'Jam Berangkat', 'PIC', 'Divisi', 'Outlet', 'Judul', 'Catatan'],
      rows: [
        [
          today,
          '09:00',
          samplePic?.pic || 'Peter',
          samplePic ? ROLE_LABELS[samplePic.roleId] : 'Stock Accounting',
          samplePic?.outlets[0] || 'DLS',
          'Stock Opname Outlet',
          'Assign khusus 1 PIC',
        ],
        [
          today,
          '10:00',
          'SEMUA',
          'Stock Accounting',
          '',
          'Briefing Tim Stock Accounting',
          'Isi PIC dengan SEMUA atau kosongkan untuk Assign Divisi',
        ],
      ],
    },
  ]);
}
