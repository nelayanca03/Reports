import { buildZip, downloadBinaryFile } from './exportDataset';

export const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type XlsxCellValue = string | number | boolean | null | undefined;

export interface XlsxSheetInput {
  name: string;
  columns: string[];
  rows: Array<Array<XlsxCellValue>>;
  freezeHeader?: boolean;
}

// Strip XML 1.0 illegal control characters (keeps \t=0x09, \n=0x0A, \r=0x0D)
// eslint-disable-next-line no-control-regex
const XML_ILLEGAL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function escapeXml(raw: string): string {
  return raw
    .replace(XML_ILLEGAL_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function colIndexToLetter(index: number): string {
  let n = index + 1;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result || 'A';
}

export function sanitizeSheetName(raw: string, usedNames: Set<string>): string {
  let base = (raw || '')
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^'+|'+$/g, '');
  if (!base) base = 'Sheet';
  if (base.length > 31) base = base.slice(0, 31).trim();

  let candidate = base;
  let counter = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = ` (${counter})`;
    const maxBaseLen = Math.max(1, 31 - suffix.length);
    candidate = `${base.slice(0, maxBaseLen).trim()}${suffix}`;
    counter++;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

export function ensureXlsxFilename(filename: string): string {
  const trimmed = (filename || 'export').trim();
  if (/\.xlsx$/i.test(trimmed)) return trimmed;
  if (/\.csv$/i.test(trimmed)) return trimmed.replace(/\.csv$/i, '.xlsx');
  return `${trimmed}.xlsx`;
}

function buildWorksheetXml(sheet: XlsxSheetInput, isFirstSheet: boolean): string {
  const colCount = Math.max(
    sheet.columns.length,
    ...sheet.rows.slice(0, 100).map((r) => r.length),
    1
  );
  const totalRows = Math.max(1, (sheet.columns.length > 0 ? 1 : 0) + sheet.rows.length);
  const lastColLetter = colIndexToLetter(colCount - 1);
  const dimensionRef = `A1:${lastColLetter}${totalRows}`;

  // Estimate clean column widths from header + first 300 rows
  const maxLengths = new Array<number>(colCount).fill(8);
  for (let c = 0; c < sheet.columns.length; c++) {
    maxLengths[c] = Math.max(maxLengths[c], String(sheet.columns[c] ?? '').length + 2);
  }
  const sampleLimit = Math.min(sheet.rows.length, 300);
  for (let r = 0; r < sampleLimit; r++) {
    const row = sheet.rows[r];
    for (let c = 0; c < row.length; c++) {
      const val = row[c];
      if (val === null || val === undefined || val === '') continue;
      const len = String(val).length;
      if (len > maxLengths[c]) maxLengths[c] = len;
    }
  }

  const colsXml = maxLengths
    .map((len, idx) => {
      const width = Math.min(52, Math.max(10, len + 3));
      const colNum = idx + 1;
      return `<col min="${colNum}" max="${colNum}" width="${width}" customWidth="1"/>`;
    })
    .join('');

  const freezeHeader = sheet.freezeHeader !== false && sheet.columns.length > 0;
  const tabSelectedAttr = isFirstSheet ? ' tabSelected="1"' : '';
  const sheetViewsXml = freezeHeader
    ? `<sheetViews><sheetView${tabSelectedAttr} workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView${tabSelectedAttr} workbookViewId="0"/></sheetViews>`;

  const rowParts: string[] = [];
  let rowNum = 1;

  if (sheet.columns.length > 0) {
    const headerCells: string[] = [];
    for (let c = 0; c < sheet.columns.length; c++) {
      const cellRef = `${colIndexToLetter(c)}${rowNum}`;
      const text = escapeXml(String(sheet.columns[c] ?? ''));
      headerCells.push(
        `<c r="${cellRef}" s="1" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`
      );
    }
    rowParts.push(`<row r="${rowNum}" ht="22" customHeight="1">${headerCells.join('')}</row>`);
    rowNum++;
  }

  for (let r = 0; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    const cells: string[] = [];
    for (let c = 0; c < row.length; c++) {
      const val = row[c];
      if (val === null || val === undefined || val === '') continue;
      const cellRef = `${colIndexToLetter(c)}${rowNum}`;
      if (typeof val === 'number') {
        if (Number.isFinite(val)) {
          cells.push(`<c r="${cellRef}" s="0"><v>${val}</v></c>`);
        }
      } else if (typeof val === 'boolean') {
        cells.push(`<c r="${cellRef}" s="0" t="b"><v>${val ? 1 : 0}</v></c>`);
      } else {
        const text = escapeXml(String(val));
        cells.push(
          `<c r="${cellRef}" s="0" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`
        );
      }
    }
    rowParts.push(`<row r="${rowNum}">${cells.join('')}</row>`);
    rowNum++;
  }

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="${dimensionRef}"/>` +
    sheetViewsXml +
    `<cols>${colsXml}</cols>` +
    `<sheetData>${rowParts.join('')}</sheetData>` +
    '</worksheet>'
  );
}

function buildStylesXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2">' +
    '<font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'
  );
}

export function buildXlsxWorkbook(rawSheets: XlsxSheetInput[]): Uint8Array {
  const sheetsInput: XlsxSheetInput[] =
    rawSheets.length > 0
      ? rawSheets
      : [{ name: 'Sheet1', columns: ['Info'], rows: [['Tidak ada data']] }];

  const usedNames = new Set<string>();
  const normalizedSheets = sheetsInput.map((s) => ({
    ...s,
    safeName: sanitizeSheetName(s.name, usedNames),
  }));

  const contentTypesOverrides = normalizedSheets
    .map(
      (_, idx) =>
        `<Override PartName="/xl/worksheets/sheet${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('');

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    contentTypesOverrides +
    '</Types>';

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const workbookSheetsXml = normalizedSheets
    .map(
      (s, idx) =>
        `<sheet name="${escapeXml(s.safeName)}" sheetId="${idx + 1}" r:id="rId${idx + 1}"/>`
    )
    .join('');

  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets>${workbookSheetsXml}</sheets>` +
    '</workbook>';

  const workbookRelsParts = normalizedSheets.map(
    (_, idx) =>
      `<Relationship Id="rId${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx + 1}.xml"/>`
  );
  const stylesRelId = `rId${normalizedSheets.length + 1}`;
  workbookRelsParts.push(
    `<Relationship Id="${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
  );

  const workbookRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    workbookRelsParts.join('') +
    '</Relationships>';

  const zipEntries = [
    { name: '[Content_Types].xml', content: contentTypesXml },
    { name: '_rels/.rels', content: rootRelsXml },
    { name: 'xl/workbook.xml', content: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRelsXml },
    { name: 'xl/styles.xml', content: buildStylesXml() },
    ...normalizedSheets.map((s, idx) => ({
      name: `xl/worksheets/sheet${idx + 1}.xml`,
      content: buildWorksheetXml(s, idx === 0),
    })),
  ];

  return buildZip(zipEntries);
}

export function downloadXlsxWorkbook(
  filename: string,
  sheets: XlsxSheetInput[]
): void {
  const bytes = buildXlsxWorkbook(sheets);
  downloadBinaryFile(ensureXlsxFilename(filename), bytes, XLSX_MIME_TYPE);
}
