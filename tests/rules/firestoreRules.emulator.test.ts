import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  RulesTestContext,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { APP_CONFIG } from '../../src/config/appConfig';
import { emailToAccountId } from '../../src/firebase';

const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..');
const RULES_PATH = path.join(ROOT_DIR, 'firestore.rules');
const PROJECT_ID = 'demo-update-harian-outlet-rules';

const OWNER_EMAIL = APP_CONFIG.ownerEmail;
const OWNER_UID = 'uid_owner_001';

const ADMIN_EMAIL = 'admin.ops@company.com';
const ADMIN_UID = 'uid_admin_002';

const STOCK_EMAIL = 'peter@company.com';
const STOCK_UID = 'uid_stock_peter';

const GL_EMAIL = 'gl.staff@company.com';
const GL_UID = 'uid_gl_001';

const ACC_EMAIL = 'acc.lead@company.com';
const ACC_UID = 'uid_acc_001';

const INACTIVE_EMAIL = 'inactive@company.com';
const INACTIVE_UID = 'uid_inactive_001';

const OTHER_EMAIL = 'otheruser@gmail.com';

function asFirestore(ctx: RulesTestContext): Firestore {
  return ctx.firestore() as unknown as Firestore;
}

function getWibDateKeys(): { today: string; yesterday: string; currentMonth: string } {
  const nowMs = Date.now();
  const wibToday = new Date(nowMs + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const wibYesterday = new Date(nowMs - 17 * 3600 * 1000).toISOString().slice(0, 10);
  return {
    today: wibToday,
    yesterday: wibYesterday,
    currentMonth: wibToday.slice(0, 7),
  };
}

let testEnv: RulesTestEnvironment;

async function seedBaselineData(): Promise<{
  today: string;
  yesterday: string;
  currentMonth: string;
}> {
  const { today, yesterday, currentMonth } = getWibDateKeys();

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = asFirestore(ctx);

    const accounts = [
      {
        id: emailToAccountId(OWNER_EMAIL),
        email: OWNER_EMAIL,
        name: 'OWNER',
        role: 'admin',
        picName: '',
        active: true,
        createdBy: OWNER_UID,
      },
      {
        id: emailToAccountId(ADMIN_EMAIL),
        email: ADMIN_EMAIL,
        name: 'OPS ADMIN',
        role: 'admin',
        picName: '',
        active: true,
        createdBy: OWNER_UID,
      },
      {
        id: emailToAccountId(STOCK_EMAIL),
        email: STOCK_EMAIL,
        name: 'Peter',
        role: 'stock_accounting',
        picName: 'PETER',
        active: true,
        createdBy: OWNER_UID,
      },
      {
        id: emailToAccountId(GL_EMAIL),
        email: GL_EMAIL,
        name: 'GL Staff',
        role: 'gl',
        picName: 'GL_PIC',
        active: true,
        createdBy: OWNER_UID,
      },
      {
        id: emailToAccountId(ACC_EMAIL),
        email: ACC_EMAIL,
        name: 'Accounting Lead',
        role: 'accounting',
        picName: 'ACC_PIC',
        refPrefix: 'SA',
        active: true,
        createdBy: OWNER_UID,
      },
      {
        id: emailToAccountId(INACTIVE_EMAIL),
        email: INACTIVE_EMAIL,
        name: 'Deactivated User',
        role: 'stock_accounting',
        picName: 'PETER',
        active: false,
        createdBy: OWNER_UID,
      },
      {
        id: emailToAccountId(OTHER_EMAIL),
        email: OTHER_EMAIL,
        name: 'Other User',
        role: 'stock_accounting',
        picName: 'CHARLES',
        active: true,
        createdBy: OWNER_UID,
      },
    ];

    for (const acc of accounts) {
      await setDoc(doc(db, 'accounts', acc.id), {
        email: acc.email,
        name: acc.name,
        role: acc.role,
        picName: acc.picName,
        ...(acc.refPrefix ? { refPrefix: acc.refPrefix } : {}),
        active: acc.active,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: acc.createdBy,
      });
    }

    await setDoc(doc(db, 'adminRegistry', 'accounts'), {
      accounts: {},
      updatedAt: Timestamp.now(),
      updatedBy: OWNER_UID,
    });

    await setDoc(doc(db, 'roleConfigs', 'stock_accounting'), {
      roleId: 'stock_accounting',
      label: 'Stock Accounting',
      start: APP_CONFIG.defaultStartDate,
      ndays: APP_CONFIG.defaultWorkingDays,
      unlockedPastMonths: [],
      tasks: [{ key: 'ham', label: 'HAM SPC' }],
      outlets: [
        { code: 'NKPM', person: 'PETER' },
        { code: 'DELICA', person: 'PETER' },
        { code: 'SKCP', person: 'CHARLES' },
      ],
      outletsByPic: {
        PETER: ['NKPM', 'DELICA'],
        CHARLES: ['SKCP'],
      },
      updatedAt: Timestamp.now(),
      updatedBy: OWNER_UID,
    });

    await setDoc(doc(db, 'roleConfigs', 'gl'), {
      roleId: 'gl',
      label: 'GL',
      start: APP_CONFIG.defaultStartDate,
      ndays: APP_CONFIG.defaultWorkingDays,
      tasks: [],
      outlets: [],
      outletsByPic: {},
      updatedAt: Timestamp.now(),
      updatedBy: OWNER_UID,
    });

    await setDoc(doc(db, 'roleWorkspaces', 'stock_accounting'), {
      roleId: 'stock_accounting',
      ent: {},
      visit: {},
      updatedAt: Timestamp.now(),
      updatedBy: OWNER_UID,
    });

    await setDoc(doc(db, 'roleWorkspaces', 'gl'), {
      roleId: 'gl',
      ent: {},
      visit: {},
      updatedAt: Timestamp.now(),
      updatedBy: OWNER_UID,
    });

    await setDoc(doc(db, 'roleMonthlyWorkspaces', `stock_accounting_${currentMonth}`), {
      roleId: 'stock_accounting',
      monthKey: currentMonth,
      ent: {},
      visit: {},
      updatedAt: Timestamp.now(),
      updatedBy: OWNER_UID,
    });

    await setDoc(doc(db, 'roleMonthlyWorkspaces', 'stock_accounting_2020-01'), {
      roleId: 'stock_accounting',
      monthKey: '2020-01',
      ent: {},
      visit: {},
      updatedAt: Timestamp.now(),
      updatedBy: OWNER_UID,
    });

    await setDoc(doc(db, 'calendarEvents', 'evt_stock_only'), {
      title: 'Stock Opname',
      date: today,
      startTime: '09:00',
      visibleTo: ['stock_accounting'],
      notes: 'Tim Stock',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
      createdByEmail: OWNER_EMAIL,
      createdByName: 'OWNER',
    });

    await setDoc(doc(db, 'calendarEvents', 'evt_gl_only'), {
      title: 'GL Closing',
      date: today,
      startTime: '10:00',
      visibleTo: ['gl'],
      notes: 'Tim GL',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: OWNER_UID,
      updatedBy: OWNER_UID,
      createdByEmail: OWNER_EMAIL,
      createdByName: 'OWNER',
    });
  });

  return { today, yesterday, currentMonth };
}

describe('Firestore Security Rules Emulator Suite (security_spec.md + Operational RBAC)', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync(RULES_PATH, 'utf8'),
      },
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  describe('Security Spec: The "Dirty Dozen" Adversarial Payloads', () => {
    it('1. Unverified Email Spoof -> PERMISSION_DENIED on /adminRegistry/accounts', async () => {
      await seedBaselineData();
      const spoofed = testEnv.authenticatedContext('spoof_uid', {
        email: OWNER_EMAIL,
        email_verified: false,
      });
      await assertFails(getDoc(doc(asFirestore(spoofed), 'adminRegistry', 'accounts')));
    });

    it('2. Self-Registration Escalation -> PERMISSION_DENIED creating admin account', async () => {
      await seedBaselineData();
      const hacker = testEnv.authenticatedContext('hacker_uid', {
        email: 'hacker@gmail.com',
        email_verified: true,
      });
      await assertFails(
        setDoc(doc(asFirestore(hacker), 'accounts', 'hacker_at_gmail_dot_com'), {
          email: 'hacker@gmail.com',
          name: 'Hacker',
          role: 'admin',
          picName: '',
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: 'hacker_uid',
        })
      );
    });

    it('3. Self-Role Promotion -> PERMISSION_DENIED changing own role to admin', async () => {
      await seedBaselineData();
      const stockCtx = testEnv.authenticatedContext(STOCK_UID, {
        email: STOCK_EMAIL,
        email_verified: true,
      });
      await assertFails(
        updateDoc(doc(asFirestore(stockCtx), 'accounts', emailToAccountId(STOCK_EMAIL)), {
          role: 'admin',
          updatedAt: serverTimestamp(),
        })
      );
    });

    it('4. Shadow Field Injection -> PERMISSION_DENIED writing unknown field', async () => {
      await seedBaselineData();
      const adminCtx = testEnv.authenticatedContext(ADMIN_UID, {
        email: ADMIN_EMAIL,
        email_verified: true,
      });
      await assertFails(
        updateDoc(doc(asFirestore(adminCtx), 'roleWorkspaces', 'stock_accounting'), {
          isVerified: true,
          updatedAt: serverTimestamp(),
          updatedBy: ADMIN_UID,
        })
      );
    });

    it('5. Cross-Role Read -> PERMISSION_DENIED gl reading stock_accounting config or workspace', async () => {
      const { currentMonth } = await seedBaselineData();
      const glCtx = testEnv.authenticatedContext(GL_UID, {
        email: GL_EMAIL,
        email_verified: true,
      });
      await assertFails(getDoc(doc(asFirestore(glCtx), 'roleConfigs', 'stock_accounting')));
      await assertFails(getDoc(doc(asFirestore(glCtx), 'roleWorkspaces', 'stock_accounting')));
      await assertFails(
        getDoc(
          doc(asFirestore(glCtx), 'roleMonthlyWorkspaces', `stock_accounting_${currentMonth}`)
        )
      );
    });

    it('6. Cross-Role Write -> PERMISSION_DENIED accounting writing gl workspace', async () => {
      await seedBaselineData();
      const accCtx = testEnv.authenticatedContext(ACC_UID, {
        email: ACC_EMAIL,
        email_verified: true,
      });
      await assertFails(
        updateDoc(doc(asFirestore(accCtx), 'roleWorkspaces', 'gl'), {
          ent: {},
          updatedAt: serverTimestamp(),
          updatedBy: ACC_UID,
        })
      );
    });

    it('7. Non-Admin Task Mutation -> PERMISSION_DENIED updating /roleConfigs/stock_accounting', async () => {
      await seedBaselineData();
      const stockCtx = testEnv.authenticatedContext(STOCK_UID, {
        email: STOCK_EMAIL,
        email_verified: true,
      });
      await assertFails(
        updateDoc(doc(asFirestore(stockCtx), 'roleConfigs', 'stock_accounting'), {
          tasks: [],
          updatedAt: serverTimestamp(),
          updatedBy: STOCK_UID,
        })
      );
    });

    it('8. Blanket Account Scraping -> PERMISSION_DENIED listing /accounts', async () => {
      await seedBaselineData();
      const stockCtx = testEnv.authenticatedContext(STOCK_UID, {
        email: STOCK_EMAIL,
        email_verified: true,
      });
      await assertFails(getDocs(collection(asFirestore(stockCtx), 'accounts')));
    });

    it('9. Other User PII Get -> PERMISSION_DENIED reading another account document', async () => {
      await seedBaselineData();
      const stockCtx = testEnv.authenticatedContext(STOCK_UID, {
        email: STOCK_EMAIL,
        email_verified: true,
      });
      await assertFails(
        getDoc(doc(asFirestore(stockCtx), 'accounts', emailToAccountId(OTHER_EMAIL)))
      );
    });

    it('10. Deactivated Account Access -> PERMISSION_DENIED when active is false', async () => {
      await seedBaselineData();
      const inactiveCtx = testEnv.authenticatedContext(INACTIVE_UID, {
        email: INACTIVE_EMAIL,
        email_verified: true,
      });
      await assertFails(
        getDoc(doc(asFirestore(inactiveCtx), 'roleWorkspaces', 'stock_accounting'))
      );
      await assertFails(
        updateDoc(doc(asFirestore(inactiveCtx), 'roleWorkspaces', 'stock_accounting'), {
          visit: {
            [`PETER|${getWibDateKeys().today}`]: { ok: true, outlet: 'NKPM', f: '08:00', t: '09:00', n: '' },
          },
          updatedAt: serverTimestamp(),
          updatedBy: INACTIVE_UID,
        })
      );
    });

    it('11. Client Timestamp Tampering -> PERMISSION_DENIED with backdated updatedAt', async () => {
      await seedBaselineData();
      const adminCtx = testEnv.authenticatedContext(ADMIN_UID, {
        email: ADMIN_EMAIL,
        email_verified: true,
      });
      await assertFails(
        updateDoc(doc(asFirestore(adminCtx), 'roleWorkspaces', 'stock_accounting'), {
          updatedAt: Timestamp.fromMillis(Date.now() - 86400_000),
          updatedBy: ADMIN_UID,
        })
      );
    });

    it('12. ID Poisoning / Oversized Payload -> PERMISSION_DENIED', async () => {
      await seedBaselineData();
      const ownerCtx = testEnv.authenticatedContext(OWNER_UID, {
        email: OWNER_EMAIL,
        email_verified: true,
      });
      await assertFails(getDoc(doc(asFirestore(ownerCtx), 'accounts', 'invalid$id!')));
      await assertFails(
        setDoc(doc(asFirestore(ownerCtx), 'accounts', 'valid_id_01'), {
          email: 'valid@company.com',
          name: 'A'.repeat(81),
          role: 'stock_accounting',
          picName: 'VALID',
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: OWNER_UID,
        })
      );
    });
  });

  describe('Operational RBAC: Kunjungan, Input Harian, SavedRecords, Logs & Kalender', () => {
    it('allows stock_accounting PIC to read own account/config and write own outlet & today/yesterday visits', async () => {
      const { today, yesterday, currentMonth } = await seedBaselineData();
      const stockCtx = testEnv.authenticatedContext(STOCK_UID, {
        email: STOCK_EMAIL,
        email_verified: true,
      });
      const db = asFirestore(stockCtx);

      await assertSucceeds(getDoc(doc(db, 'accounts', emailToAccountId(STOCK_EMAIL))));
      await assertSucceeds(getDoc(doc(db, 'roleConfigs', 'stock_accounting')));
      await assertSucceeds(
        updateDoc(doc(db, 'roleMonthlyWorkspaces', `stock_accounting_${currentMonth}`), {
          [`ent.NKPM`]: { [`${today}|ham`]: { d: today, n: '', ts: new Date().toISOString() } },
          [`visit.PETER|${today}`]: {
            ok: true,
            outlet: 'NKPM',
            f: '08:30',
            t: '10:00',
            n: 'Stock Opname',
          },
          updatedAt: serverTimestamp(),
          updatedBy: STOCK_UID,
        })
      );
      await assertSucceeds(
        updateDoc(doc(db, 'roleMonthlyWorkspaces', `stock_accounting_${currentMonth}`), {
          [`visit.PETER|${yesterday}`]: {
            ok: true,
            outlet: 'DELICA',
            f: '09:00',
            t: '10:30',
            n: 'Meeting',
          },
          updatedAt: serverTimestamp(),
          updatedBy: STOCK_UID,
        })
      );
    });

    it('enforces server-side past-day lock: allows first fill of past day & re-edit of today, denies overwriting filled past day', async () => {
      const { today, yesterday, currentMonth } = await seedBaselineData();
      const stockCtx = testEnv.authenticatedContext(STOCK_UID, {
        email: STOCK_EMAIL,
        email_verified: true,
      });
      const db = asFirestore(stockCtx);
      const wsDoc = doc(db, 'roleMonthlyWorkspaces', `stock_accounting_${currentMonth}`);

      // 1. First fill of yesterday (unfilled past day) -> allowed
      await assertSucceeds(
        updateDoc(wsDoc, {
          [`ent.NKPM`]: {
            [`${yesterday}|ham`]: { d: yesterday, n: 'Initial fill', ts: new Date().toISOString() },
            [`${today}|ham`]: { d: today, n: 'Today v1', ts: new Date().toISOString() },
          },
          updatedAt: serverTimestamp(),
          updatedBy: STOCK_UID,
        })
      );

      // 2. Re-editing today's entry while keeping yesterday's entry intact -> allowed
      await assertSucceeds(
        updateDoc(wsDoc, {
          [`ent.NKPM`]: {
            [`${yesterday}|ham`]: { d: yesterday, n: 'Initial fill', ts: new Date().toISOString() },
            [`${today}|ham`]: { d: today, n: 'Today v2 edited', ts: new Date().toISOString() },
          },
          updatedAt: serverTimestamp(),
          updatedBy: STOCK_UID,
        })
      );

      // 3. Attempting to overwrite already-filled yesterday entry -> PERMISSION_DENIED
      await assertFails(
        updateDoc(wsDoc, {
          [`ent.NKPM`]: {
            [`${yesterday}|ham`]: { d: today, n: 'Tampered past day', ts: new Date().toISOString() },
            [`${today}|ham`]: { d: today, n: 'Today v2 edited', ts: new Date().toISOString() },
          },
          updatedAt: serverTimestamp(),
          updatedBy: STOCK_UID,
        })
      );

      // 4. Attempting to delete already-filled yesterday entry -> PERMISSION_DENIED
      await assertFails(
        updateDoc(wsDoc, {
          [`ent.NKPM`]: {
            [`${today}|ham`]: { d: today, n: 'Today v2 edited', ts: new Date().toISOString() },
          },
          updatedAt: serverTimestamp(),
          updatedBy: STOCK_UID,
        })
      );
    });

    it('denies stock_accounting writing another PIC outlet, another PIC visit, far visit date, or locked past month', async () => {
      const { today, currentMonth } = await seedBaselineData();
      const stockCtx = testEnv.authenticatedContext(STOCK_UID, {
        email: STOCK_EMAIL,
        email_verified: true,
      });
      const db = asFirestore(stockCtx);

      await assertFails(
        updateDoc(doc(db, 'roleMonthlyWorkspaces', `stock_accounting_${currentMonth}`), {
          [`ent.SKCP`]: { [today]: { d: { ham: today }, n: {}, ts: Date.now() } },
          updatedAt: serverTimestamp(),
          updatedBy: STOCK_UID,
        })
      );

      await assertFails(
        updateDoc(doc(db, 'roleMonthlyWorkspaces', `stock_accounting_${currentMonth}`), {
          [`visit.CHARLES|${today}`]: { ok: true, outlet: 'SKCP', f: '09:00', t: '10:00', n: '' },
          updatedAt: serverTimestamp(),
          updatedBy: STOCK_UID,
        })
      );

      await assertFails(
        updateDoc(doc(db, 'roleMonthlyWorkspaces', `stock_accounting_${currentMonth}`), {
          ['visit.PETER|2020-01-02']: { ok: true, outlet: 'NKPM', f: '09:00', t: '10:00', n: '' },
          updatedAt: serverTimestamp(),
          updatedBy: STOCK_UID,
        })
      );

      await assertFails(
        updateDoc(doc(db, 'roleMonthlyWorkspaces', 'stock_accounting_2020-01'), {
          ['ent.NKPM']: { '2020-01-02': { d: { ham: '2020-01-02' }, n: {}, ts: Date.now() } },
          updatedAt: serverTimestamp(),
          updatedBy: STOCK_UID,
        })
      );
    });

    it('allows non-admin to write unlocked past month after Admin unlocks it in roleConfigs', async () => {
      await seedBaselineData();
      const adminCtx = testEnv.authenticatedContext(ADMIN_UID, {
        email: ADMIN_EMAIL,
        email_verified: true,
      });
      await assertSucceeds(
        updateDoc(doc(asFirestore(adminCtx), 'roleConfigs', 'stock_accounting'), {
          unlockedPastMonths: ['2020-01'],
          updatedAt: serverTimestamp(),
          updatedBy: ADMIN_UID,
        })
      );

      const stockCtx = testEnv.authenticatedContext(STOCK_UID, {
        email: STOCK_EMAIL,
        email_verified: true,
      });
      await assertSucceeds(
        updateDoc(doc(asFirestore(stockCtx), 'roleMonthlyWorkspaces', 'stock_accounting_2020-01'), {
          ['ent.NKPM']: { '2020-01-02': { d: { ham: '2020-01-02' }, n: {}, ts: Date.now() } },
          updatedAt: serverTimestamp(),
          updatedBy: STOCK_UID,
        })
      );
    });

    it('enforces atomic counter + prefix authorization on /recordCounters and /savedRecords', async () => {
      const { today } = await seedBaselineData();
      const yymm = `${today.slice(2, 4)}${today.slice(5, 7)}`;
      const refCode = `SA${yymm}0001`;
      const stockCtx = testEnv.authenticatedContext(STOCK_UID, {
        email: STOCK_EMAIL,
        email_verified: true,
      });
      const db = asFirestore(stockCtx);

      // Without recordCounters write in the same commit -> fails (existsAfter check)
      await assertFails(
        setDoc(doc(db, 'savedRecords', refCode), {
          refCode,
          prefix: 'SA',
          yymm,
          department: 'stock_accounting',
          date: today,
          pic: 'PETER',
          outlet: 'NKPM',
          summary: '[Input Harian] HAM SPC',
          notes: 'Ok',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: STOCK_UID,
          updatedBy: STOCK_UID,
          createdByEmail: STOCK_EMAIL,
          createdByName: 'Peter',
        })
      );

      // Atomic batch updating counter + creating matching savedRecord -> succeeds
      const batch = writeBatch(db);
      batch.set(doc(db, 'recordCounters', `SA_${yymm}`), {
        prefix: 'SA',
        yymm,
        seq: 1,
        updatedAt: serverTimestamp(),
        updatedBy: STOCK_UID,
      });
      batch.set(doc(db, 'savedRecords', refCode), {
        refCode,
        prefix: 'SA',
        yymm,
        department: 'stock_accounting',
        date: today,
        pic: 'PETER',
        outlet: 'NKPM',
        summary: '[Input Harian] HAM SPC',
        notes: 'Ok',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: STOCK_UID,
        updatedBy: STOCK_UID,
        createdByEmail: STOCK_EMAIL,
        createdByName: 'Peter',
      });
      await assertSucceeds(batch.commit());

      // Cross-department GL record by stock_accounting -> denied
      const glCode = `GL${yymm}0001`;
      const crossBatch = writeBatch(db);
      crossBatch.set(doc(db, 'recordCounters', `GL_${yymm}`), {
        prefix: 'GL',
        yymm,
        seq: 1,
        updatedAt: serverTimestamp(),
        updatedBy: STOCK_UID,
      });
      crossBatch.set(doc(db, 'savedRecords', glCode), {
        refCode: glCode,
        prefix: 'GL',
        yymm,
        department: 'gl',
        date: today,
        pic: 'PETER',
        outlet: 'NKPM',
        summary: 'Unauthorized',
        notes: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: STOCK_UID,
        updatedBy: STOCK_UID,
        createdByEmail: STOCK_EMAIL,
        createdByName: 'Peter',
      });
      await assertFails(crossBatch.commit());
    });

    it('enforces append-only /inputLogs and department-scoped /calendarEvents', async () => {
      const { today } = await seedBaselineData();
      const stockCtx = testEnv.authenticatedContext(STOCK_UID, {
        email: STOCK_EMAIL,
        email_verified: true,
      });
      const stockDb = asFirestore(stockCtx);

      await assertSucceeds(
        setDoc(doc(stockDb, 'inputLogs', 'log_001'), {
          uid: STOCK_UID,
          userEmail: STOCK_EMAIL,
          userName: 'Peter',
          userRole: 'stock_accounting',
          roleId: 'stock_accounting',
          roleLabel: 'Stock Accounting',
          actionType: 'input_harian',
          pic: 'PETER',
          outlet: 'NKPM',
          day: today,
          details: 'Update HAM SPC',
          itemCount: 1,
          clientTs: new Date().toISOString(),
          createdAt: serverTimestamp(),
        })
      );

      await assertFails(updateDoc(doc(stockDb, 'inputLogs', 'log_001'), { details: 'Tampered' }));
      await assertFails(deleteDoc(doc(stockDb, 'inputLogs', 'log_001')));

      await assertSucceeds(
        setDoc(doc(stockDb, 'inputLogs', 'log_002'), {
          uid: STOCK_UID,
          userEmail: STOCK_EMAIL,
          userName: 'Peter',
          userRole: 'stock_accounting',
          roleId: 'stock_accounting',
          roleLabel: 'Stock Accounting',
          actionType: 'input_harian',
          pic: 'PETER',
          outlet: 'NKPM',
          day: today,
          details: 'HAM SPC: Update',
          itemCount: 1,
          clientTs: new Date().toISOString(),
          taskKey: 'ham',
          prevDate: '',
          newDate: today,
          prevNote: '',
          newNote: 'Sesuai',
          action: 'set',
          createdAt: serverTimestamp(),
        })
      );

      await assertFails(
        setDoc(doc(stockDb, 'inputLogs', 'log_bad_action'), {
          uid: STOCK_UID,
          userEmail: STOCK_EMAIL,
          userName: 'Peter',
          userRole: 'stock_accounting',
          roleId: 'stock_accounting',
          roleLabel: 'Stock Accounting',
          actionType: 'input_harian',
          pic: 'PETER',
          outlet: 'NKPM',
          day: today,
          details: 'Bad action',
          itemCount: 1,
          clientTs: new Date().toISOString(),
          action: 'delete_all',
          createdAt: serverTimestamp(),
        })
      );

      await assertSucceeds(getDoc(doc(stockDb, 'calendarEvents', 'evt_stock_only')));
      await assertFails(getDoc(doc(stockDb, 'calendarEvents', 'evt_gl_only')));
      const visibleSnap = await assertSucceeds(
        getDocs(
          query(
            collection(stockDb, 'calendarEvents'),
            where('visibleTo', 'array-contains', 'stock_accounting')
          )
        )
      );
      assert.equal(visibleSnap.size, 1);
    });
  });
});
