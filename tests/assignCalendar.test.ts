import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AccountProfile,
  CalendarEvent,
  OutletStoreState,
} from '../src/types/outlet';
import {
  parseAssignImportRows,
  parseCsvRows,
  parseXlsxRows,
} from '../src/utils/assignImportExport';
import { buildXlsxWorkbook } from '../src/utils/exportXlsx';
import {
  DEFAULT_ROLE_CONFIGS,
  calcVisitLeaderboard,
  canUserViewCalendarEvent,
  getPendingAssignNotifications,
  mergeAssignsIntoVisitMap,
  resolveAllAssignablePics,
} from '../src/utils/outletLogic';

function makeAssign(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt_1',
    title: 'Stock Opname Outlet DLS',
    date: '2026-11-26',
    startTime: '09:00',
    visibleTo: ['stock_accounting'],
    notes: 'Bawa dokumen SO',
    eventType: 'assign',
    assignedPic: 'Peter',
    assignedPicUpper: 'PETER',
    assignedEmail: 'peter@company.com',
    assignedRole: 'stock_accounting',
    assignedOutlet: 'DLS',
    assignStatus: 'assigned',
    returnTime: '',
    cancelReason: '',
    notificationDismissed: false,
    createdBy: 'admin_uid',
    updatedBy: 'admin_uid',
    createdByEmail: 'admin@company.com',
    createdByName: 'Admin',
    createdAtIso: '2026-11-26T01:00:00.000Z',
    ...overrides,
  };
}

describe('PIC-specific calendar assigns & Kunjungan synchronization', () => {
  const peterAcc: AccountProfile = {
    id: 'peter',
    email: 'peter@company.com',
    name: 'Peter',
    role: 'stock_accounting',
    picName: 'Peter',
    active: true,
  };
  const habelAcc: AccountProfile = {
    id: 'habel',
    email: 'habel@company.com',
    name: 'Habel',
    role: 'stock_accounting',
    picName: 'Habel',
    active: true,
  };
  const adminAcc: AccountProfile = {
    id: 'admin',
    email: 'admin@company.com',
    name: 'Admin',
    role: 'admin',
    picName: '',
    active: true,
  };

  it('isolates calendar assigns strictly to the target PIC and Admin', () => {
    const evt = makeAssign();
    assert.equal(canUserViewCalendarEvent(evt, peterAcc), true);
    assert.equal(canUserViewCalendarEvent(evt, habelAcc), false);
    assert.equal(canUserViewCalendarEvent(evt, adminAcc), true);

    // Non-assign general events are hidden from regular users
    const legacyGeneral = makeAssign({
      eventType: 'general',
      assignedPic: '',
      assignedPicUpper: '',
      assignedEmail: '',
    });
    assert.equal(canUserViewCalendarEvent(legacyGeneral, peterAcc), false);
    assert.equal(canUserViewCalendarEvent(legacyGeneral, adminAcc), true);
  });

  it('auto-adds active assign to Kunjungan, updates returnTime on completion, and zeroes out cancelled assign', () => {
    const outlets = [
      { code: 'DLS', person: 'Peter' },
      { code: 'RESTO', person: 'Peter' },
      { code: 'DELICA', person: 'Habel' },
    ];
    const days = ['2026-11-25', '2026-11-26'];
    const baseState: OutletStoreState = {
      start: '2026-11-01',
      ent: {},
      visit: {
        'Peter|2026-11-25': {
          ok: true,
          outlet: 'RESTO',
          f: '10:00',
          t: '12:00',
          n: 'Kunjungan manual',
          entries: [
            { id: 'v_manual_1', outlet: 'RESTO', f: '10:00', t: '12:00', n: 'Kunjungan manual' },
          ],
        },
      },
    };

    // 1. Active assign automatically increments visit count by +1
    const activeAssign = makeAssign({ id: 'evt_a', date: '2026-11-26', assignStatus: 'assigned' });
    const mergedActive = mergeAssignsIntoVisitMap(baseState.visit, [activeAssign], 'stock_accounting', outlets);
    assert.equal(mergedActive['Peter|2026-11-26']?.ok, true);
    assert.equal(mergedActive['Peter|2026-11-26']?.entries?.length, 1);
    assert.equal(mergedActive['Peter|2026-11-26']?.entries?.[0].t, '');

    const lbActive = calcVisitLeaderboard(
      { ...baseState, visit: mergedActive },
      days,
      ['Peter', 'Habel'],
      '2026-11-26'
    );
    const peterActive = lbActive.rows.find((r) => r.person === 'Peter');
    assert.equal(peterActive?.totalVisits, 2);

    // 2. Completed assign fills return time t
    const completedAssign = makeAssign({
      id: 'evt_a',
      date: '2026-11-26',
      assignStatus: 'completed',
      returnTime: '15:30',
    });
    const mergedCompleted = mergeAssignsIntoVisitMap(baseState.visit, [completedAssign], 'stock_accounting', outlets);
    assert.equal(mergedCompleted['Peter|2026-11-26']?.entries?.[0].t, '15:30');

    // 3. Cancelled assign results in 0 visits for that day
    const cancelledAssign = makeAssign({
      id: 'evt_a',
      date: '2026-11-26',
      assignStatus: 'cancelled',
      cancelReason: 'Outlet tutup',
    });
    const mergedCancelled = mergeAssignsIntoVisitMap(baseState.visit, [cancelledAssign], 'stock_accounting', outlets);
    assert.equal(mergedCancelled['Peter|2026-11-26'], undefined);

    const lbCancelled = calcVisitLeaderboard(
      { ...baseState, visit: mergedCancelled },
      days,
      ['Peter', 'Habel'],
      '2026-11-26'
    );
    const peterCancelled = lbCancelled.rows.find((r) => r.person === 'Peter');
    assert.equal(peterCancelled?.totalVisits, 1); // Only the manual 2026-11-25 visit remains
  });

  it('sorts persistent assign notifications from newest to oldest and filters dismissed/cancelled', () => {
    const events: CalendarEvent[] = [
      makeAssign({ id: 'old', createdAtIso: '2026-11-25T08:00:00.000Z', notificationDismissed: false }),
      makeAssign({ id: 'newest', createdAtIso: '2026-11-26T10:30:00.000Z', notificationDismissed: false }),
      makeAssign({ id: 'mid', createdAtIso: '2026-11-26T07:00:00.000Z', notificationDismissed: false }),
      makeAssign({ id: 'dismissed', createdAtIso: '2026-11-26T11:00:00.000Z', notificationDismissed: true }),
      makeAssign({ id: 'cancelled', createdAtIso: '2026-11-26T12:00:00.000Z', assignStatus: 'cancelled' }),
      makeAssign({ id: 'other_pic', assignedPic: 'Habel', assignedPicUpper: 'HABEL', assignedEmail: 'habel@company.com' }),
    ];

    const pending = getPendingAssignNotifications(events, peterAcc);
    assert.deepEqual(
      pending.map((e) => e.id),
      ['newest', 'mid', 'old']
    );
  });

  it('parses uploaded XLSX and CSV assign files accurately', async () => {
    const assignablePics = resolveAllAssignablePics(DEFAULT_ROLE_CONFIGS, [peterAcc, habelAcc]);
    const xlsxBytes = buildXlsxWorkbook([
      {
        name: 'Assign',
        columns: ['Tanggal', 'Jam', 'PIC', 'Divisi', 'Outlet', 'Judul Tugas', 'Catatan'],
        rows: [
          ['2026-11-27', '09:30', 'Peter', 'stock_accounting', 'DLS', 'Audit Stok', 'Cek gudang'],
          ['28/11/2026', '13:00', 'Habel', '', 'DELICA', 'Review Persediaan', ''],
        ],
      },
    ]);

    const xlsxRows = await parseXlsxRows(xlsxBytes);
    const parsedXlsx = parseAssignImportRows(xlsxRows, assignablePics);
    assert.equal(parsedXlsx.errors.length, 0);
    assert.equal(parsedXlsx.validRows.length, 2);
    assert.equal(parsedXlsx.validRows[0].date, '2026-11-27');
    assert.equal(parsedXlsx.validRows[0].assignedPicUpper, 'PETER');
    assert.equal(parsedXlsx.validRows[0].assignedEmail, 'peter@company.com');
    assert.equal(parsedXlsx.validRows[1].date, '2026-11-28');
    assert.equal(parsedXlsx.validRows[1].assignedPicUpper, 'HABEL');

    const csvText = 'Tanggal,Jam,PIC,Outlet,Judul Tugas,Catatan\n2026-11-29,10:00,Peter,RESTO,"Cek SO, Harian",Prioritas';
    const parsedCsv = parseAssignImportRows(parseCsvRows(csvText), assignablePics);
    assert.equal(parsedCsv.errors.length, 0);
    assert.equal(parsedCsv.validRows.length, 1);
    assert.equal(parsedCsv.validRows[0].assignScope, 'pic');
    assert.equal(parsedCsv.validRows[0].title, 'Cek SO, Harian');

    // Division assign row in CSV (PIC = SEMUA or blank + Divisi filled)
    const divCsv =
      'Tanggal,Jam,PIC,Divisi,Outlet,Judul Tugas,Catatan\n2026-11-30,09:00,SEMUA,Stock Accounting,DLS,Briefing Tim SA,Semua anggota wajib hadir\n2026-11-30,10:30,,GL,,Closing Bulanan,';
    const parsedDivCsv = parseAssignImportRows(parseCsvRows(divCsv), assignablePics);
    assert.equal(parsedDivCsv.errors.length, 0);
    assert.equal(parsedDivCsv.validRows.length, 2);
    assert.equal(parsedDivCsv.validRows[0].assignScope, 'division');
    assert.equal(parsedDivCsv.validRows[0].assignedDivision, 'stock_accounting');
    assert.equal(parsedDivCsv.validRows[0].assignedPic, '');
    assert.equal(parsedDivCsv.validRows[1].assignScope, 'division');
    assert.equal(parsedDivCsv.validRows[1].assignedDivision, 'gl');
  });

  it('supports Division assigns with per-PIC visits, per-PIC returnTime/cancel, and per-UID notifications', () => {
    const glAcc: AccountProfile = {
      id: 'gl_user',
      email: 'gl@company.com',
      name: 'Rina',
      role: 'gl',
      picName: 'Rina',
      active: true,
    };
    const emailOnlyPicAcc: AccountProfile = {
      id: 'peter_alt',
      email: 'peter@company.com',
      name: 'Peter Alternate',
      role: 'stock_accounting',
      picName: '',
      active: true,
    };

    // PIC assign matches immediately on login even via email fallback
    const picEvt = makeAssign({ id: 'pic_email_match', assignedEmail: 'peter@company.com' });
    assert.equal(canUserViewCalendarEvent(picEvt, emailOnlyPicAcc), true);
    assert.equal(getPendingAssignNotifications([picEvt], emailOnlyPicAcc, 'uid_peter').length, 1);

    // Division assign is visible to all division members and Admin, hidden from other divisions
    const divAssign = makeAssign({
      id: 'div_1',
      title: 'Briefing Stock Accounting',
      assignScope: 'division',
      assignedDivision: 'stock_accounting',
      assignedRole: 'stock_accounting',
      assignedPic: '',
      assignedPicUpper: '',
      assignedEmail: '',
      assignedOutlet: 'DLS',
      dismissedBy: ['uid_peter'],
      picResponses: {
        PETER: { status: 'completed', returnTime: '14:30', cancelReason: '' },
        HABEL: { status: 'cancelled', returnTime: '', cancelReason: 'Sakit' },
      },
    });

    assert.equal(canUserViewCalendarEvent(divAssign, peterAcc), true);
    assert.equal(canUserViewCalendarEvent(divAssign, habelAcc), true);
    assert.equal(canUserViewCalendarEvent(divAssign, adminAcc), true);
    assert.equal(canUserViewCalendarEvent(divAssign, glAcc), false);

    // Per-UID dismissal: Peter dismissed it, Habel has NOT dismissed it (but Habel cancelled so not pending);
    // test with a fresh division assign where only Peter dismissed
    const activeDivAssign = makeAssign({
      id: 'div_2',
      assignScope: 'division',
      assignedDivision: 'stock_accounting',
      assignedRole: 'stock_accounting',
      assignedPic: '',
      assignedPicUpper: '',
      assignedEmail: '',
      dismissedBy: ['uid_peter'],
      picResponses: {},
    });
    assert.equal(getPendingAssignNotifications([activeDivAssign], peterAcc, 'uid_peter').length, 0);
    assert.equal(getPendingAssignNotifications([activeDivAssign], habelAcc, 'uid_habel').length, 1);
    assert.equal(getPendingAssignNotifications([activeDivAssign], glAcc, 'uid_gl').length, 0);

    // Visit map expands division assign across all PICs in division respecting per-PIC responses
    const outlets = [
      { code: 'DLS', person: 'Peter' },
      { code: 'DELICA', person: 'Habel' },
      { code: 'SKCP', person: 'Charles' },
    ];
    const merged = mergeAssignsIntoVisitMap({}, [divAssign], 'stock_accounting', outlets);
    assert.equal(merged['Peter|2026-11-26']?.ok, true);
    assert.equal(merged['Peter|2026-11-26']?.entries?.[0].t, '14:30');
    assert.equal(merged['Charles|2026-11-26']?.ok, true);
    assert.equal(merged['Charles|2026-11-26']?.entries?.[0].t, '');
    assert.equal(merged['Habel|2026-11-26'], undefined); // Cancelled by Habel => 0 visits
  });
});
