import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AccountProfile, OutletAssignment, OutletStoreState, SavedRecord, TaskDefinition } from '../src/types/outlet';
import {
  buildOutletsByPicMap,
  canAccountEditPic,
  canEditOutletDay,
  filterAndSortSavedRecords,
  formatReferenceCode,
  formatYymmFromIsoDate,
  getVisitEntries,
  mergeWorkspaceStates,
  resolveAccountPic,
  resolveAuthorizedRecordPrefix,
} from '../src/utils/outletLogic';

const OUTLETS: OutletAssignment[] = [
  { person: 'PETER', code: 'NKPM' },
  { person: 'PETER', code: 'DELICA' },
  { person: 'MELVIN', code: 'J2MRLN' },
];

const TASKS: TaskDefinition[] = [
  {
    key: 'ham',
    label: 'HAM SPC',
    shortLabel: 'HAM SPC',
    defaultDate: '',
    inputType: 'date',
    formulaType: 'daily_plus_1',
    toleranceOffset: 1,
    formulaNote: '',
  },
];

describe('workspace helpers: PIC, visits, records, and locking', () => {
  it('builds deduplicated uppercase outletsByPic map and resolves PIC accurately', () => {
    const map = buildOutletsByPicMap([
      { person: 'peter', code: 'NKPM' },
      { person: 'PETER ', code: 'NKPM' },
      { person: 'PETER', code: 'DELICA' },
      { person: 'melvin', code: 'J2MRLN' },
    ]);
    assert.deepEqual(map, {
      PETER: ['NKPM', 'DELICA'],
      MELVIN: ['J2MRLN'],
    });

    const accByPic: Pick<AccountProfile, 'role' | 'picName' | 'name'> = {
      role: 'stock_accounting',
      picName: 'peter',
      name: 'Other Name',
    };
    assert.equal(resolveAccountPic(accByPic, OUTLETS), 'PETER');
    assert.equal(canAccountEditPic(accByPic, OUTLETS, 'PETER'), true);
    assert.equal(canAccountEditPic(accByPic, OUTLETS, 'MELVIN'), false);

    const accByNameFallback: Pick<AccountProfile, 'role' | 'picName' | 'name'> = {
      role: 'stock_accounting',
      picName: '',
      name: 'Melvin',
    };
    assert.equal(resolveAccountPic(accByNameFallback, OUTLETS), 'MELVIN');
  });

  it('normalizes legacy single visit and multi-entry visit arrays', () => {
    const legacy = getVisitEntries({ ok: true, outlet: 'NKPM', f: '08:30', t: '10:00', n: 'SO' });
    assert.equal(legacy.length, 1);
    assert.equal(legacy[0]?.outlet, 'NKPM');

    const multi = getVisitEntries({
      ok: true,
      f: '',
      t: '',
      n: '',
      entries: [
        { id: 'v1', outlet: 'NKPM', f: '08:30', t: '10:00', n: 'SO' },
        { id: 'v2', outlet: 'J2MRLN', f: '11:00', t: '12:30', n: 'Asset' },
      ],
    });
    assert.equal(multi.length, 2);
    assert.equal(multi[1]?.outlet, 'J2MRLN');
  });

  it('resolves SA/GL prefixes and formats reference codes deterministically', () => {
    assert.deepEqual(resolveAuthorizedRecordPrefix({ role: 'stock_accounting' }, 'gl'), {
      prefix: 'SA',
      department: 'stock_accounting',
    });
    assert.deepEqual(resolveAuthorizedRecordPrefix({ role: 'gl' }, 'stock_accounting'), {
      prefix: 'GL',
      department: 'gl',
    });
    assert.deepEqual(
      resolveAuthorizedRecordPrefix({ role: 'accounting', refPrefix: 'GL' }, 'stock_accounting'),
      { prefix: 'GL', department: 'gl' }
    );
    assert.equal(formatYymmFromIsoDate('2026-11-25'), '2611');
    assert.equal(formatReferenceCode('SA', '2611', 7), 'SA26110007');
  });

  it('filters and sorts savedRecords by PIC, outlet, date range, and refCode', () => {
    const records: SavedRecord[] = [
      {
        id: 'SA26110001',
        refCode: 'SA26110001',
        prefix: 'SA',
        yymm: '2611',
        department: 'stock_accounting',
        date: '2026-11-19',
        pic: 'PETER',
        outlet: 'NKPM',
        summary: 'HAM SPC: 18 Nov',
        notes: '',
        createdBy: 'u1',
        updatedBy: 'u1',
        createdByEmail: 'p@test.com',
        createdByName: 'Peter',
      },
      {
        id: 'SA26110002',
        refCode: 'SA26110002',
        prefix: 'SA',
        yymm: '2611',
        department: 'stock_accounting',
        date: '2026-11-25',
        pic: 'MELVIN',
        outlet: 'J2MRLN',
        summary: 'HAM SPC: 24 Nov',
        notes: 'Cek ulang',
        createdBy: 'u2',
        updatedBy: 'u2',
        createdByEmail: 'm@test.com',
        createdByName: 'Melvin',
      },
    ];

    const filtered = filterAndSortSavedRecords(records, {
      pic: 'PETER',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-20',
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.refCode, 'SA26110001');
  });

  it('merges monthly workspace slices and enforces day locking for non-admins', () => {
    const merged = mergeWorkspaceStates(
      { ent: { NKPM: { '2026-11-19|ham': { d: '2026-11-18', n: '', ts: 't1' } } }, visit: {} },
      { ent: { NKPM: { '2026-11-25|ham': { d: '2026-11-24', n: '', ts: 't2' } } }, visit: {} }
    );
    const store: OutletStoreState = { ...merged, start: '2026-11-01' };
    const days = ['2026-11-19', '2026-11-24', '2026-11-25'];

    // Non-admin cannot edit past day once a newer day already has an entry, nor future days
    assert.equal(canEditOutletDay(store, TASKS, days, 'NKPM', '2026-11-19', '2026-11-25', false), false);
    assert.equal(canEditOutletDay(store, TASKS, days, 'NKPM', '2026-11-25', '2026-11-25', false), true);
    assert.equal(canEditOutletDay(store, TASKS, days, 'NKPM', '2026-11-19', '2026-11-25', true), true);
  });
});
