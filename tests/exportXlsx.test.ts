import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  buildXlsxWorkbook,
  colIndexToLetter,
  ensureXlsxFilename,
  sanitizeSheetName,
} from '../src/utils/exportXlsx';
import { buildPhotoOutletBlocks, computeAutoDiscPending } from '../src/utils/exportResultPhoto';
import { DEFAULT_ROLE_CONFIGS, buildMonthWorkingDays } from '../src/utils/outletLogic';
import { OutletStoreState } from '../src/types/outlet';

describe('exportXlsx: OOXML workbook builder & helpers', () => {
  it('converts column indexes to Excel letters and sanitizes sheet names cleanly', () => {
    assert.equal(colIndexToLetter(0), 'A');
    assert.equal(colIndexToLetter(25), 'Z');
    assert.equal(colIndexToLetter(26), 'AA');
    assert.equal(colIndexToLetter(27), 'AB');

    const used = new Set<string>();
    const s1 = sanitizeSheetName('Laporan: Harian / Pending [2026] *Super Panjang Sekali*', used);
    assert.ok(s1.length <= 31);
    assert.ok(!/[\\/?*[\]:]/.test(s1));
    const s2 = sanitizeSheetName(s1, used);
    assert.notEqual(s1.toLowerCase(), s2.toLowerCase());
    assert.ok(s2.length <= 31);

    assert.equal(ensureXlsxFilename('rekap.csv'), 'rekap.xlsx');
    assert.equal(ensureXlsxFilename('rekap'), 'rekap.xlsx');
    assert.equal(ensureXlsxFilename('rekap.xlsx'), 'rekap.xlsx');
  });

  it('produces a valid multi-sheet .xlsx archive verified by unzip -t with native numbers & escaped strings', () => {
    const bytes = buildXlsxWorkbook([
      {
        name: 'Ringkasan',
        columns: ['PIC', 'Skor', 'Rasio', 'Catatan'],
        rows: [
          ['PETER', -2, 85.5, 'Cek <A & B> "ok"'],
          ['MELVIN', 0, 100, '=SUM(1,2)'],
        ],
      },
      {
        name: 'fact_task_harian',
        columns: ['tanggal', 'outlet', 'pending'],
        rows: [['2026-11-25', 'NKPM', 1]],
      },
    ]);

    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);

    const dir = mkdtempSync(join(tmpdir(), 'outlet-xlsx-test-'));
    const xlsxPath = join(dir, 'workbook.xlsx');
    try {
      writeFileSync(xlsxPath, bytes);
      const testOut = execFileSync('unzip', ['-t', xlsxPath], { encoding: 'utf8' });
      assert.ok(testOut.includes('No errors detected'));
      assert.ok(testOut.includes('[Content_Types].xml'));
      assert.ok(testOut.includes('_rels/.rels'));
      assert.ok(testOut.includes('xl/workbook.xml'));
      assert.ok(testOut.includes('xl/_rels/workbook.xml.rels'));
      assert.ok(testOut.includes('xl/styles.xml'));
      assert.ok(testOut.includes('xl/worksheets/sheet1.xml'));
      assert.ok(testOut.includes('xl/worksheets/sheet2.xml'));

      const sheet1Xml = execFileSync('unzip', ['-p', xlsxPath, 'xl/worksheets/sheet1.xml'], {
        encoding: 'utf8',
      });
      // Numeric cells stored as native Excel numbers (<v>-2</v>, <v>85.5</v>)
      assert.ok(sheet1Xml.includes('<c r="B2" s="0"><v>-2</v></c>'));
      assert.ok(sheet1Xml.includes('<c r="C2" s="0"><v>85.5</v></c>'));
      // Strings XML-escaped cleanly as inlineStr (never <f> formula tags)
      assert.ok(sheet1Xml.includes('Cek &lt;A &amp; B&gt; &quot;ok&quot;'));
      assert.ok(sheet1Xml.includes('<t xml:space="preserve">=SUM(1,2)</t>'));
      assert.ok(!sheet1Xml.includes('<f>'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('exportResultPhoto: DISC PENDING strictly derived from Memo Penyelesaian Discrepancy', () => {
  it('computes DISC PENDING directly from memo entry without manual overrides', () => {
    const config = DEFAULT_ROLE_CONFIGS.stock_accounting;
    const days = buildMonthWorkingDays('2026-11');
    const store: OutletStoreState = {
      start: '2026-11-02',
      ent: {
        DLS: {
          '2026-11-25|memo': { d: '2026-10-01', n: '' },
        },
        NKPM: {
          '2026-11-25|memo': { d: '2026-09-01', n: '' },
        },
      },
      visit: {},
    };

    assert.equal(computeAutoDiscPending('2026-10-01', '2026-11-25'), '-');
    assert.equal(computeAutoDiscPending('2026-10', '2026-11-25'), '-');
    assert.equal(computeAutoDiscPending('2026-09-01', '2026-11-25'), 'OKTOBER');
    assert.equal(computeAutoDiscPending('2026-09', '2026-11-25'), 'OKTOBER');
    assert.equal(computeAutoDiscPending('2026-08-01', '2026-11-25'), 'SEPTEMBER, OKTOBER');
    assert.equal(computeAutoDiscPending('', '2026-11-25'), 'OKTOBER');
    assert.equal(computeAutoDiscPending('2025-12-01', '2026-01-15'), '-');
    assert.equal(computeAutoDiscPending('2025-11-01', '2026-01-15'), 'DESEMBER 2025');

    const blocks = buildPhotoOutletBlocks({
      outlets: ['DLS', 'NKPM', 'DELICA'],
      config,
      store,
      days,
      targetDay: '2026-11-25',
      today: '2026-11-25',
    });

    const getDiscPending = (code: string) => {
      const block = blocks.find((b) => b.outlet === code);
      const line = block?.lines.find((l) => l.kind === 'simple' && l.label === 'DISC PENDING');
      return line && line.kind === 'simple' ? line.value : undefined;
    };

    assert.equal(getDiscPending('DLS'), '-');
    assert.equal(getDiscPending('NKPM'), 'OKTOBER');
    assert.equal(getDiscPending('DELICA'), 'OKTOBER');
  });
});
