import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  FieldPath,
  Timestamp,
  collection,
  deleteField,
  doc,
  getCountFromServer,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  OperationType,
  auth,
  db,
  emailToAccountId,
  googleProvider,
  handleFirestoreError,
} from '../firebase';
import {
  AccountProfile,
  AccountRole,
  CalendarEvent,
  EntryItem,
  FirebaseStorageStats,
  InputLogActionType,
  InputLogEntry,
  OperationalRoleId,
  OutletStoreState,
  RecordDepartment,
  RecordPrefix,
  RoleConfig,
  SavedRecord,
  VisitItem,
} from '../types/outlet';
import {
  DEFAULT_ROLE_CONFIGS,
  DEFAULT_START,
  FIRESTORE_SPARK_LIMIT_BYTES,
  LEGACY_STORAGE_KEY,
  buildMonthWorkingDays,
  buildOutletsByPicMap,
  canAccountEditPic,
  canEditOutletDay,
  currentMonthKey,
  estimateFirestoreDocBytes,
  fmtDateLong,
  fmtMonth,
  fmtWeek,
  getEntry,
  getSelectableMonths,
  getTaskInputType,
  getVisitEntries,
  isSunday,
  mergeWorkspaceStates,
  normalizeCalendarInterval,
  normalizeCalendarRecurrenceFreq,
  normalizeCalendarVisibleTo,
  normalizeCalendarWeekdays,
  normalizeExcludedDates,
  shiftMonthKey,
  todayIso,
  weekStartIso,
} from '../utils/outletLogic';
import {
  parseUnlockedPastMonths,
  useAdminManagementActions,
} from './useAdminManagementActions';
import { useCalendarAndRecordsActions } from './useCalendarAndRecordsActions';
import { useThemePreference } from './useThemePreference';

export type AuthStatus = 'loading' | 'signed_out' | 'unregistered' | 'inactive' | 'ready';

type WorkspaceSlice = Pick<OutletStoreState, 'ent' | 'visit'>;

const EMPTY_SLICE: WorkspaceSlice = { ent: {}, visit: {} };

function parseOutletsByPic(raw: unknown): Record<string, string[]> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const result: Record<string, string[]> = {};
  for (const [picKey, val] of Object.entries(raw as Record<string, unknown>)) {
    const cleanKey = picKey.trim().toUpperCase();
    if (!cleanKey || !Array.isArray(val)) continue;
    result[cleanKey] = Array.from(
      new Set(val.filter((c): c is string => typeof c === 'string' && c.trim().length > 0).map((c) => c.trim()))
    );
  }
  return result;
}

function areOutletsByPicEqual(
  a: Record<string, string[]> | undefined,
  b: Record<string, string[]>
): boolean {
  if (!a) return false;
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
    const listA = [...(a[aKeys[i]] || [])].sort();
    const listB = [...(b[bKeys[i]] || [])].sort();
    if (listA.length !== listB.length) return false;
    for (let j = 0; j < listA.length; j++) {
      if (listA[j] !== listB[j]) return false;
    }
  }
  return true;
}

function readLegacyLocalStorage(): { ent: OutletStoreState['ent']; visit: OutletStoreState['visit']; start: string } | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      ent: parsed.ent && typeof parsed.ent === 'object' ? parsed.ent : {},
      visit: parsed.visit && typeof parsed.visit === 'object' ? parsed.visit : {},
      start: typeof parsed.start === 'string' && parsed.start ? parsed.start : DEFAULT_START,
    };
  } catch {
    return null;
  }
}

export function useAuthAndRoleData() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentAccount, setCurrentAccount] = useState<AccountProfile | null>(null);

  // Admin can inspect any of the 3 operational roles; non-admin is locked to their own role.
  const [activeRoleId, setActiveRoleId] = useState<OperationalRoleId>('stock_accounting');
  // Active working month (YYYY-MM), defaults automatically to today's calendar month
  const [activeMonth, setActiveMonth] = useState<string>(() => currentMonthKey(todayIso()));

  const [roleConfigs, setRoleConfigs] = useState<Record<OperationalRoleId, RoleConfig>>(
    DEFAULT_ROLE_CONFIGS
  );

  // Active role slices (legacy + previous month for carry-over + active month)
  const [legacySlice, setLegacySlice] = useState<WorkspaceSlice>(EMPTY_SLICE);
  const [monthlySlices, setMonthlySlices] = useState<Record<string, WorkspaceSlice>>({});

  const [managedAccounts, setManagedAccounts] = useState<AccountProfile[]>([]);
  const [inputLogs, setInputLogs] = useState<InputLogEntry[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [savedRecords, setSavedRecords] = useState<SavedRecord[]>([]);
  const [adminWorkspaceBytes, setAdminWorkspaceBytes] = useState<Record<string, number>>({});
  const [adminLegacySlices, setAdminLegacySlices] = useState<
    Record<OperationalRoleId, WorkspaceSlice>
  >({
    stock_accounting: EMPTY_SLICE,
    gl: EMPTY_SLICE,
    accounting: EMPTY_SLICE,
  });
  const [adminMonthlySlices, setAdminMonthlySlices] = useState<Record<string, WorkspaceSlice>>({});
  const [totalInputLogCount, setTotalInputLogCount] = useState<number>(0);
  const { theme, toggleTheme } = useThemePreference();

  const effectiveRoleId: OperationalRoleId =
    currentAccount?.role === 'admin'
      ? activeRoleId
      : (currentAccount?.role as OperationalRoleId) || 'stock_accounting';

  const activeConfig = roleConfigs[effectiveRoleId] || DEFAULT_ROLE_CONFIGS[effectiveRoleId];

  const isAdminAccount = currentAccount?.role === 'admin';

  const maxAdminOpenMonth = useMemo(() => {
    const candidates = Object.values(roleConfigs)
      .map((c) => c.openUntilMonth || '')
      .filter((m) => /^\d{4}-\d{2}$/.test(m))
      .sort();
    return candidates[candidates.length - 1] || '';
  }, [roleConfigs]);

  const selectableMonths = useMemo(
    () =>
      getSelectableMonths(
        todayIso(),
        isAdminAccount ? [activeMonth] : [],
        isAdminAccount ? maxAdminOpenMonth : activeConfig.openUntilMonth,
        {
          isAdmin: isAdminAccount,
          unlockedPastMonths: activeConfig.unlockedPastMonths,
        }
      ),
    [
      activeMonth,
      isAdminAccount,
      maxAdminOpenMonth,
      activeConfig.openUntilMonth,
      activeConfig.unlockedPastMonths,
    ]
  );

  // Immediately redirect non-admin away from closed past months (e.g., if Admin locks it or month rolls over)
  useEffect(() => {
    if (authStatus !== 'ready' || !currentAccount) return;
    if (!selectableMonths.includes(activeMonth)) {
      const cur = currentMonthKey(todayIso());
      setActiveMonth(selectableMonths.includes(cur) ? cur : selectableMonths[0] || cur);
    }
  }, [authStatus, currentAccount, selectableMonths, activeMonth]);

  // Bootstrap initial Firestore docs when the owner/admin signs in for the first time
  const bootstrapOwnerEnvironment = useCallback(async (user: User) => {
    const email = (user.email || '').trim().toLowerCase();
    const accId = emailToAccountId(email);
    const accPath = `accounts/${accId}`;
    const accRef = doc(db, 'accounts', accId);

    let accSnap;
    try {
      accSnap = await getDoc(accRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, accPath);
    }

    const displayName = (user.displayName || 'Admin').slice(0, 80);

    if (!accSnap.exists()) {
      try {
        await setDoc(accRef, {
          email,
          name: displayName,
          role: 'admin',
          picName: '',
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: user.uid,
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, accPath);
      }
    }

    // Ensure adminRegistry/accounts exists and contains this owner account
    const dirPath = 'adminRegistry/accounts';
    const dirRef = doc(db, 'adminRegistry', 'accounts');
    try {
      const dirSnap = await getDoc(dirRef);
      if (!dirSnap.exists()) {
        await setDoc(dirRef, {
          accounts: {
            [accId]: {
              email,
              name: accSnap.exists() ? accSnap.data().name : displayName,
              role: 'admin',
              picName: '',
              active: true,
            },
          },
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, dirPath);
    }

    // Seed default roleConfigs if missing
    const legacy = readLegacyLocalStorage();
    const roleIds: OperationalRoleId[] = ['stock_accounting', 'gl', 'accounting'];
    for (const rId of roleIds) {
      const cfgPath = `roleConfigs/${rId}`;
      const cfgRef = doc(db, 'roleConfigs', rId);
      try {
        const cfgSnap = await getDoc(cfgRef);
        if (!cfgSnap.exists()) {
          const base = DEFAULT_ROLE_CONFIGS[rId];
          await setDoc(cfgRef, {
            ...base,
            outletsByPic: buildOutletsByPicMap(base.outlets),
            start: rId === 'stock_accounting' && legacy?.start ? legacy.start : base.start,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          });
        } else if (!cfgSnap.data().outletsByPic) {
          const existingOutlets = Array.isArray(cfgSnap.data().outlets)
            ? cfgSnap.data().outlets
            : [];
          await updateDoc(cfgRef, {
            outletsByPic: buildOutletsByPicMap(existingOutlets),
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, cfgPath);
      }
    }

    // Seed stock_accounting legacy workspace if missing
    const saWsPath = 'roleWorkspaces/stock_accounting';
    const saWsRef = doc(db, 'roleWorkspaces', 'stock_accounting');
    try {
      const wsSnap = await getDoc(saWsRef);
      if (!wsSnap.exists()) {
        await setDoc(saWsRef, {
          roleId: 'stock_accounting',
          ent: legacy?.ent || {},
          visit: legacy?.visit || {},
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, saWsPath);
    }
  }, []);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setFirebaseUser(null);
        setCurrentAccount(null);
        setAuthStatus('signed_out');
        return;
      }

      setFirebaseUser(user);
      setAuthStatus('loading');
      setAuthError(null);

      const email = (user.email || '').trim().toLowerCase();
      if (!email) {
        setCurrentAccount(null);
        setAuthStatus('unregistered');
        return;
      }

      const accId = emailToAccountId(email);

      try {
        if (email === BOOTSTRAPPED_ADMIN_EMAIL) {
          await bootstrapOwnerEnvironment(user);
        }

        const snap = await getDoc(doc(db, 'accounts', accId));
        if (!snap.exists()) {
          setCurrentAccount(null);
          setAuthStatus('unregistered');
          return;
        }

        const data = snap.data();
        const profile: AccountProfile = {
          id: accId,
          email: String(data.email || email),
          name: String(data.name || user.displayName || email),
          role: (data.role as AccountRole) || 'stock_accounting',
          picName: String(data.picName || ''),
          ...(data.refPrefix === 'SA' || data.refPrefix === 'GL'
            ? { refPrefix: data.refPrefix as RecordPrefix }
            : {}),
          active: Boolean(data.active),
        };

        if (!profile.active) {
          setCurrentAccount(profile);
          setAuthStatus('inactive');
          return;
        }

        setCurrentAccount(profile);
        if (profile.role !== 'admin') {
          setActiveRoleId(profile.role);
        }
        setAuthStatus('ready');
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Gagal memuat profil akun.');
        setAuthStatus('unregistered');
      }
    });

    return () => unsubscribe();
  }, [bootstrapOwnerEnvironment]);

  // Listen to active role config & workspace (legacy + prevMonth + activeMonth)
  useEffect(() => {
    if (authStatus !== 'ready' || !currentAccount) return;

    const targetRole: OperationalRoleId =
      currentAccount.role === 'admin' ? activeRoleId : currentAccount.role;
    const prevMonth = shiftMonthKey(activeMonth, -1);

    const cfgPath = `roleConfigs/${targetRole}`;
    const unsubCfg = onSnapshot(
      doc(db, 'roleConfigs', targetRole),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          const unlockedPastMonths = parseUnlockedPastMonths(d.unlockedPastMonths);
          const parsedOutletsByPic = parseOutletsByPic(d.outletsByPic);
          const parsed: RoleConfig = {
            roleId: targetRole,
            label: String(d.label || DEFAULT_ROLE_CONFIGS[targetRole].label),
            start: String(d.start || DEFAULT_START),
            ndays: Number(d.ndays || 25),
            ...(typeof d.openUntilMonth === 'string' && /^\d{4}-\d{2}$/.test(d.openUntilMonth)
              ? { openUntilMonth: d.openUntilMonth }
              : {}),
            ...(unlockedPastMonths.length > 0 ? { unlockedPastMonths } : {}),
            tasks: Array.isArray(d.tasks) ? d.tasks : [],
            outlets: Array.isArray(d.outlets) ? d.outlets : [],
            ...(parsedOutletsByPic ? { outletsByPic: parsedOutletsByPic } : {}),
          };
          setRoleConfigs((prev) => ({ ...prev, [targetRole]: parsed }));
        } else {
          setRoleConfigs((prev) => ({ ...prev, [targetRole]: DEFAULT_ROLE_CONFIGS[targetRole] }));
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, cfgPath)
    );

    const legacyPath = `roleWorkspaces/${targetRole}`;
    const unsubLegacy = onSnapshot(
      doc(db, 'roleWorkspaces', targetRole),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setLegacySlice({
            ent: (d.ent as OutletStoreState['ent']) || {},
            visit: (d.visit as OutletStoreState['visit']) || {},
          });
        } else {
          setLegacySlice(EMPTY_SLICE);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, legacyPath)
    );

    const monthsToListen = prevMonth === activeMonth ? [activeMonth] : [prevMonth, activeMonth];
    const unsubMonths = monthsToListen.map((mKey) => {
      const docId = `${targetRole}_${mKey}`;
      const mPath = `roleMonthlyWorkspaces/${docId}`;
      return onSnapshot(
        doc(db, 'roleMonthlyWorkspaces', docId),
        (snap) => {
          const nextSlice: WorkspaceSlice = snap.exists()
            ? {
                ent: (snap.data().ent as OutletStoreState['ent']) || {},
                visit: (snap.data().visit as OutletStoreState['visit']) || {},
              }
            : EMPTY_SLICE;
          setMonthlySlices((prev) => ({ ...prev, [docId]: nextSlice }));
        },
        (error) => handleFirestoreError(error, OperationType.GET, mPath)
      );
    });

    return () => {
      unsubCfg();
      unsubLegacy();
      unsubMonths.forEach((u) => u());
    };
  }, [authStatus, currentAccount, activeRoleId, activeMonth]);

  // Listen to all roleConfigs (for centralized Outlet master list), calendarEvents, and savedRecords
  useEffect(() => {
    if (authStatus !== 'ready' || !currentAccount) return;

    const unsubs: Array<() => void> = [];
    const roleIds: OperationalRoleId[] = ['stock_accounting', 'gl', 'accounting'];

    for (const rId of roleIds) {
      const cfgPath = `roleConfigs/${rId}`;
      unsubs.push(
        onSnapshot(
          doc(db, 'roleConfigs', rId),
          (snap) => {
            if (snap.exists()) {
              const d = snap.data();
              const unlockedPastMonths = parseUnlockedPastMonths(d.unlockedPastMonths);
              const parsedOutletsByPic = parseOutletsByPic(d.outletsByPic);
              setRoleConfigs((prev) => ({
                ...prev,
                [rId]: {
                  roleId: rId,
                  label: String(d.label || DEFAULT_ROLE_CONFIGS[rId].label),
                  start: String(d.start || DEFAULT_START),
                  ndays: Number(d.ndays || 25),
                  ...(typeof d.openUntilMonth === 'string' && /^\d{4}-\d{2}$/.test(d.openUntilMonth)
                    ? { openUntilMonth: d.openUntilMonth }
                    : {}),
                  ...(unlockedPastMonths.length > 0 ? { unlockedPastMonths } : {}),
                  tasks: Array.isArray(d.tasks) ? d.tasks : [],
                  outlets: Array.isArray(d.outlets) ? d.outlets : [],
                  ...(parsedOutletsByPic ? { outletsByPic: parsedOutletsByPic } : {}),
                },
              }));
            }
          },
          (error) => handleFirestoreError(error, OperationType.GET, cfgPath)
        )
      );
    }

    const canAccessAllRecordsAndEvents =
      currentAccount.role === 'admin' || currentAccount.role === 'accounting';

    const eventsQuery = canAccessAllRecordsAndEvents
      ? query(collection(db, 'calendarEvents'), orderBy('date', 'asc'))
      : query(
          collection(db, 'calendarEvents'),
          where('visibleTo', 'array-contains', currentAccount.role)
        );

    unsubs.push(
      onSnapshot(
        eventsQuery,
        (snap) => {
          const list: CalendarEvent[] = snap.docs
            .map((docSnap) => {
              const d = docSnap.data();
              const createdAtIso =
                d.createdAt instanceof Timestamp
                  ? d.createdAt.toDate().toISOString()
                  : undefined;
              const updatedAtIso =
                d.updatedAt instanceof Timestamp
                  ? d.updatedAt.toDate().toISOString()
                  : undefined;
              const repeatFreq = normalizeCalendarRecurrenceFreq(d.repeatFreq);
              const repeatInterval = normalizeCalendarInterval(d.repeatInterval);
              const repeatUntil =
                typeof d.repeatUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.repeatUntil)
                  ? d.repeatUntil
                  : '';
              const repeatWeekdays = normalizeCalendarWeekdays(d.repeatWeekdays);
              const excludedDates = normalizeExcludedDates(d.excludedDates);
              return {
                id: docSnap.id,
                title: String(d.title || ''),
                date: String(d.date || ''),
                startTime: String(d.startTime || '08:00'),
                visibleTo: normalizeCalendarVisibleTo(
                  Array.isArray(d.visibleTo) ? (d.visibleTo as OperationalRoleId[]) : []
                ),
                notes: String(d.notes || ''),
                repeatFreq,
                repeatInterval,
                repeatUntil,
                repeatWeekdays,
                excludedDates,
                createdBy: String(d.createdBy || ''),
                updatedBy: String(d.updatedBy || ''),
                createdByEmail: String(d.createdByEmail || ''),
                createdByName: String(d.createdByName || ''),
                createdAtIso,
                updatedAtIso,
              };
            })
            .sort(
              (a, b) =>
                a.date.localeCompare(b.date) ||
                a.startTime.localeCompare(b.startTime) ||
                a.title.localeCompare(b.title)
            );
          setCalendarEvents(list);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'calendarEvents')
      )
    );

    const recordsQuery = canAccessAllRecordsAndEvents
      ? query(collection(db, 'savedRecords'), orderBy('date', 'desc'), limit(500))
      : query(
          collection(db, 'savedRecords'),
          where('department', '==', currentAccount.role)
        );

    unsubs.push(
      onSnapshot(
        recordsQuery,
        (snap) => {
          const list: SavedRecord[] = snap.docs
            .map((docSnap) => {
              const d = docSnap.data();
              const createdAtIso =
                d.createdAt instanceof Timestamp
                  ? d.createdAt.toDate().toISOString()
                  : undefined;
              const updatedAtIso =
                d.updatedAt instanceof Timestamp
                  ? d.updatedAt.toDate().toISOString()
                  : undefined;
              return {
                id: docSnap.id,
                refCode: String(d.refCode || docSnap.id),
                prefix: (d.prefix === 'GL' ? 'GL' : 'SA') as RecordPrefix,
                yymm: String(d.yymm || ''),
                department: (d.department === 'gl' ? 'gl' : 'stock_accounting') as RecordDepartment,
                date: String(d.date || ''),
                pic: String(d.pic || ''),
                outlet: String(d.outlet || ''),
                summary: String(d.summary || ''),
                notes: String(d.notes || ''),
                createdBy: String(d.createdBy || ''),
                updatedBy: String(d.updatedBy || ''),
                createdByEmail: String(d.createdByEmail || ''),
                createdByName: String(d.createdByName || ''),
                createdAtIso,
                updatedAtIso,
              };
            })
            .sort(
              (a, b) =>
                b.date.localeCompare(a.date) || b.refCode.localeCompare(a.refCode)
            );
          setSavedRecords(list);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'savedRecords')
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authStatus, currentAccount]);

  // Admin-only listeners: all 3 roleConfigs + all legacy/monthly workspaces + adminRegistry + inputLogs
  useEffect(() => {
    if (authStatus !== 'ready' || currentAccount?.role !== 'admin') return;

    const unsubs: Array<() => void> = [];
    const roleIds: OperationalRoleId[] = ['stock_accounting', 'gl', 'accounting'];

    for (const rId of roleIds) {
      const path = `roleConfigs/${rId}`;
      unsubs.push(
        onSnapshot(
          doc(db, 'roleConfigs', rId),
          (snap) => {
            if (snap.exists()) {
              const d = snap.data();
              const unlockedPastMonths = parseUnlockedPastMonths(d.unlockedPastMonths);
              const parsedOutlets = Array.isArray(d.outlets) ? d.outlets : [];
              const parsedOutletsByPic = parseOutletsByPic(d.outletsByPic);
              const expectedOutletsByPic = buildOutletsByPicMap(parsedOutlets);
              if (!areOutletsByPicEqual(parsedOutletsByPic, expectedOutletsByPic) && auth.currentUser?.uid) {
                void updateDoc(doc(db, 'roleConfigs', rId), {
                  outletsByPic: expectedOutletsByPic,
                  updatedAt: serverTimestamp(),
                  updatedBy: auth.currentUser.uid,
                }).catch(() => {});
              }
              setRoleConfigs((prev) => ({
                ...prev,
                [rId]: {
                  roleId: rId,
                  label: String(d.label || DEFAULT_ROLE_CONFIGS[rId].label),
                  start: String(d.start || DEFAULT_START),
                  ndays: Number(d.ndays || 25),
                  ...(typeof d.openUntilMonth === 'string' && /^\d{4}-\d{2}$/.test(d.openUntilMonth)
                    ? { openUntilMonth: d.openUntilMonth }
                    : {}),
                  ...(unlockedPastMonths.length > 0 ? { unlockedPastMonths } : {}),
                  tasks: Array.isArray(d.tasks) ? d.tasks : [],
                  outlets: parsedOutlets,
                  outletsByPic: areOutletsByPicEqual(parsedOutletsByPic, expectedOutletsByPic)
                    ? parsedOutletsByPic || expectedOutletsByPic
                    : expectedOutletsByPic,
                },
              }));
            }
          },
          (error) => handleFirestoreError(error, OperationType.GET, path)
        )
      );

      unsubs.push(
        onSnapshot(
          doc(db, 'roleWorkspaces', rId),
          (snap) => {
            const bytes = snap.exists()
              ? estimateFirestoreDocBytes(`roleWorkspaces/${rId}`, snap.data())
              : 0;
            setAdminWorkspaceBytes((prev) => ({ ...prev, [`legacy_${rId}`]: bytes }));

            const d = snap.exists() ? snap.data() : null;
            setAdminLegacySlices((prev) => ({
              ...prev,
              [rId]: {
                ent: (d?.ent as OutletStoreState['ent']) || {},
                visit: (d?.visit as OutletStoreState['visit']) || {},
              },
            }));
          },
          (error) => handleFirestoreError(error, OperationType.GET, `roleWorkspaces/${rId}`)
        )
      );

      for (const mKey of selectableMonths) {
        const docId = `${rId}_${mKey}`;
        const mPath = `roleMonthlyWorkspaces/${docId}`;
        unsubs.push(
          onSnapshot(
            doc(db, 'roleMonthlyWorkspaces', docId),
            (snap) => {
              const bytes = snap.exists()
                ? estimateFirestoreDocBytes(mPath, snap.data())
                : 0;
              setAdminWorkspaceBytes((prev) => ({ ...prev, [docId]: bytes }));

              const d = snap.exists() ? snap.data() : null;
              setAdminMonthlySlices((prev) => ({
                ...prev,
                [docId]: {
                  ent: (d?.ent as OutletStoreState['ent']) || {},
                  visit: (d?.visit as OutletStoreState['visit']) || {},
                },
              }));
            },
            (error) => handleFirestoreError(error, OperationType.GET, mPath)
          )
        );
      }
    }

    const regPath = 'adminRegistry/accounts';
    unsubs.push(
      onSnapshot(
        doc(db, 'adminRegistry', 'accounts'),
        (snap) => {
          if (snap.exists()) {
            const accountsMap = (snap.data().accounts || {}) as Record<
              string,
              Omit<AccountProfile, 'id'>
            >;
            const list: AccountProfile[] = Object.entries(accountsMap)
              .map(([id, val]) => ({
                id,
                email: String(val.email || ''),
                name: String(val.name || ''),
                role: (val.role as AccountRole) || 'stock_accounting',
                picName: String(val.picName || ''),
                ...(val.refPrefix === 'SA' || val.refPrefix === 'GL'
                  ? { refPrefix: val.refPrefix as RecordPrefix }
                  : {}),
                active: Boolean(val.active),
              }))
              .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
            setManagedAccounts(list);
          }
        },
        (error) => handleFirestoreError(error, OperationType.GET, regPath)
      )
    );

    const logsQuery = query(
      collection(db, 'inputLogs'),
      orderBy('createdAt', 'desc'),
      limit(300)
    );
    unsubs.push(
      onSnapshot(
        logsQuery,
        (snap) => {
          const list: InputLogEntry[] = snap.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: docSnap.id,
              uid: String(d.uid || ''),
              userEmail: String(d.userEmail || ''),
              userName: String(d.userName || ''),
              userRole: (d.userRole as AccountRole) || 'stock_accounting',
              roleId: (d.roleId as OperationalRoleId) || 'stock_accounting',
              roleLabel: String(d.roleLabel || ''),
              actionType:
                d.actionType === 'kunjungan' ? 'kunjungan' : 'input_harian',
              pic: String(d.pic || ''),
              outlet: String(d.outlet || ''),
              day: String(d.day || ''),
              details: String(d.details || ''),
              itemCount: Number(d.itemCount || 1),
              clientTs: String(d.clientTs || ''),
            };
          });
          setInputLogs(list);

          void (async () => {
            try {
              const countSnap = await getCountFromServer(collection(db, 'inputLogs'));
              setTotalInputLogCount(countSnap.data().count);
            } catch (error) {
              handleFirestoreError(error, OperationType.LIST, 'inputLogs');
            }
          })();
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'inputLogs')
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authStatus, currentAccount, selectableMonths]);

  const days = useMemo(() => buildMonthWorkingDays(activeMonth), [activeMonth]);

  const workspaceData: OutletStoreState = useMemo(() => {
    const prevMonth = shiftMonthKey(activeMonth, -1);
    const merged = mergeWorkspaceStates(
      legacySlice,
      monthlySlices[`${effectiveRoleId}_${prevMonth}`],
      monthlySlices[`${effectiveRoleId}_${activeMonth}`]
    );
    return {
      ...merged,
      start: `${activeMonth}-01`,
    };
  }, [legacySlice, monthlySlices, effectiveRoleId, activeMonth]);

  const adminAllWorkspaces: Record<OperationalRoleId, OutletStoreState> = useMemo(() => {
    const result = {} as Record<OperationalRoleId, OutletStoreState>;
    const roleIds: OperationalRoleId[] = ['stock_accounting', 'gl', 'accounting'];
    for (const rId of roleIds) {
      const monthStates = selectableMonths.map((m) => adminMonthlySlices[`${rId}_${m}`]);
      const merged = mergeWorkspaceStates(adminLegacySlices[rId], ...monthStates);
      result[rId] = {
        ...merged,
        start: `${activeMonth}-01`,
      };
    }
    return result;
  }, [adminLegacySlices, adminMonthlySlices, selectableMonths, activeMonth]);

  const firebaseStorage: FirebaseStorageStats | null = useMemo(() => {
    if (currentAccount?.role !== 'admin') return null;

    const roleIds: OperationalRoleId[] = ['stock_accounting', 'gl', 'accounting'];
    let usedBytes = 0;
    let totalDocs = 0;

    // 3 roleConfigs docs
    for (const rId of roleIds) {
      usedBytes += estimateFirestoreDocBytes(`roleConfigs/${rId}`, roleConfigs[rId]);
      totalDocs += 1;
    }

    // All measured workspace docs (legacy roleWorkspaces + monthly roleMonthlyWorkspaces)
    for (const wsBytes of Object.values(adminWorkspaceBytes)) {
      if (wsBytes > 0) {
        usedBytes += wsBytes;
        totalDocs += 1;
      }
    }

    // adminRegistry/accounts + accounts/*
    const accountsRegistryMap: Record<string, unknown> = {};
    for (const acc of managedAccounts) {
      accountsRegistryMap[acc.id] = {
        email: acc.email,
        name: acc.name,
        role: acc.role,
        picName: acc.picName,
        active: acc.active,
      };
      usedBytes += estimateFirestoreDocBytes(`accounts/${acc.id}`, {
        email: acc.email,
        name: acc.name,
        role: acc.role,
        picName: acc.picName,
        active: acc.active,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'uid_placeholder_28chars_admin',
      });
      totalDocs += 1;
    }
    usedBytes += estimateFirestoreDocBytes('adminRegistry/accounts', {
      accounts: accountsRegistryMap,
      updatedAt: new Date(),
      updatedBy: 'uid_placeholder_28chars_admin',
    });
    totalDocs += 1;

    // inputLogs collection (exact total count * average measured doc size)
    const effectiveLogCount = Math.max(inputLogs.length, totalInputLogCount);
    if (inputLogs.length > 0 && effectiveLogCount > 0) {
      const sampleTotal = inputLogs.reduce(
        (sum, log) => sum + estimateFirestoreDocBytes(`inputLogs/${log.id}`, log),
        0
      );
      const avgLogBytes = sampleTotal / inputLogs.length;
      usedBytes += Math.round(avgLogBytes * effectiveLogCount);
      totalDocs += effectiveLogCount;
    }

    for (const evt of calendarEvents) {
      usedBytes += estimateFirestoreDocBytes(`calendarEvents/${evt.id}`, evt);
      totalDocs += 1;
    }

    for (const rec of savedRecords) {
      usedBytes += estimateFirestoreDocBytes(`savedRecords/${rec.id}`, rec);
      totalDocs += 1;
    }

    const limitBytes = FIRESTORE_SPARK_LIMIT_BYTES;
    const remainingBytes = Math.max(0, limitBytes - usedBytes);
    const usedPercent = Math.min(100, (usedBytes / limitBytes) * 100);

    return {
      usedBytes,
      limitBytes,
      remainingBytes,
      usedPercent,
      totalDocs,
    };
  }, [
    currentAccount?.role,
    roleConfigs,
    adminWorkspaceBytes,
    managedAccounts,
    inputLogs,
    totalInputLogCount,
    calendarEvents,
    savedRecords,
  ]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code) : '';
      if (code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        setAuthError(
          `Domain "${host}" belum diizinkan di Firebase Authentication. Tambahkan domain tersebut di Firebase Console → Authentication → Settings → Authorized domains.`
        );
        return;
      }
      if (code === 'auth/popup-blocked') {
        setAuthError('Popup login diblokir oleh browser. Izinkan popup untuk situs ini lalu coba lagi.');
        return;
      }
      if (code === 'auth/popup-closed-by-user') {
        setAuthError('Jendela login Google ditutup sebelum selesai.');
        return;
      }
      setAuthError(err instanceof Error ? err.message : 'Gagal masuk dengan Google.');
    }
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
  }, []);

  const canAccessMonthForWrite = useCallback(
    (monthKey: string) => {
      if (isAdminAccount) return true;
      const cur = currentMonthKey(todayIso());
      if (monthKey >= cur) return true;
      return (activeConfig.unlockedPastMonths || []).includes(monthKey);
    },
    [isAdminAccount, activeConfig.unlockedPastMonths]
  );

  const updateEntry = useCallback(
    async (outlet: string, day: string, taskKey: string, field: 'd' | 'n', value: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      const outletOwner = activeConfig.outlets.find((o) => o.code === outlet)?.person || '';
      if (!canAccountEditPic(currentAccount, activeConfig.outlets, outletOwner)) {
        throw new Error(
          `Akses ditolak: Anda hanya dapat menginput tugas untuk outlet milik PIC Anda sendiri (bukan milik ${outletOwner || 'PIC lain'}).`
        );
      }
      const today = todayIso();
      if (
        !canEditOutletDay(
          workspaceData,
          activeConfig.tasks,
          days,
          outlet,
          day,
          today,
          isAdminAccount
        )
      ) {
        throw new Error('Tanggal atau outlet ini terkunci dan tidak dapat diubah.');
      }
      const monthKey = currentMonthKey(day);
      if (!canAccessMonthForWrite(monthKey)) {
        throw new Error('Akses bulan ini sudah ditutup oleh Admin.');
      }

      const taskDef = activeConfig.tasks.find((t) => t.key === taskKey);
      const inputType = getTaskInputType(taskDef);
      const safeValue = field === 'n' ? value.slice(0, 100) : value.trim();

      if (field === 'd' && safeValue) {
        if (inputType === 'month') {
          if (!/^\d{4}-\d{2}/.test(safeValue) || safeValue.slice(0, 7) > currentMonthKey(today)) {
            throw new Error('Bulan update tidak boleh melebihi bulan berjalan.');
          }
        } else if (inputType === 'week') {
          if (
            !/^\d{4}-\d{2}-\d{2}$/.test(safeValue) ||
            weekStartIso(safeValue) > weekStartIso(today)
          ) {
            throw new Error('Minggu update tidak boleh melebihi minggu berjalan.');
          }
        } else if (!/^\d{4}-\d{2}-\d{2}$/.test(safeValue) || safeValue > today) {
          throw new Error('Tanggal update tidak boleh melebihi tanggal hari ini.');
        }
      }

      const docId = `${effectiveRoleId}_${monthKey}`;
      const path = `roleMonthlyWorkspaces/${docId}`;
      const wsRef = doc(db, 'roleMonthlyWorkspaces', docId);
      try {
        const existing = workspaceData.ent[outlet]?.[`${day}|${taskKey}`];
        const fallbackDate = getEntry(
          workspaceData,
          days,
          activeConfig.tasks,
          outlet,
          day,
          taskKey
        ).d;
        const nextEntry: EntryItem = {
          d: existing?.d || fallbackDate,
          n: (existing?.n || '').slice(0, 100),
          ts: new Date().toISOString(),
          ...(isAdminAccount ? { byAdmin: true } : {}),
          [field]: safeValue,
        };
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(wsRef);
          if (!snap.exists()) {
            tx.set(wsRef, {
              roleId: effectiveRoleId,
              monthKey,
              ent: {
                [outlet]: {
                  [`${day}|${taskKey}`]: nextEntry,
                },
              },
              visit: {},
              updatedAt: serverTimestamp(),
              updatedBy: uid,
            });
          } else {
            tx.update(
              wsRef,
              new FieldPath('ent', outlet, `${day}|${taskKey}`),
              nextEntry,
              'updatedAt',
              serverTimestamp(),
              'updatedBy',
              uid
            );
          }
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [
      currentAccount,
      effectiveRoleId,
      isAdminAccount,
      workspaceData,
      days,
      activeConfig.tasks,
      activeConfig.outlets,
      canAccessMonthForWrite,
    ]
  );

  const recordInputLog = useCallback(
    async (params: {
      actionType: InputLogActionType;
      pic: string;
      outlet: string;
      day: string;
      details: string;
      itemCount: number;
      clientTs: string;
    }) => {
      const uid = auth.currentUser?.uid;
      const email = (currentAccount?.email || auth.currentUser?.email || '').trim().toLowerCase();
      if (!uid || !email || !currentAccount) return;
      const logId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const logPath = `inputLogs/${logId}`;
      try {
        await setDoc(doc(db, 'inputLogs', logId), {
          uid,
          userEmail: email.slice(0, 120),
          userName: (currentAccount.name || email).slice(0, 80),
          userRole: currentAccount.role,
          roleId: effectiveRoleId,
          roleLabel: (activeConfig.label || effectiveRoleId).slice(0, 60),
          actionType: params.actionType,
          pic: params.pic.slice(0, 60),
          outlet: params.outlet.slice(0, 120),
          day: params.day.slice(0, 10),
          details: params.details.slice(0, 600),
          itemCount: Math.max(1, Math.min(50, Math.round(params.itemCount))),
          clientTs: params.clientTs.slice(0, 40),
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, logPath);
      }
    },
    [activeConfig.label, currentAccount, effectiveRoleId]
  );

  const saveOutletDayEntries = useCallback(
    async (
      outlet: string,
      day: string,
      changes: Record<string, { d: string; n: string; cleared?: boolean }>
    ) => {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      const outletOwner = activeConfig.outlets.find((o) => o.code === outlet)?.person || '';
      if (!canAccountEditPic(currentAccount, activeConfig.outlets, outletOwner)) {
        throw new Error(
          `Akses ditolak: Anda hanya dapat menginput tugas untuk outlet milik PIC Anda sendiri (bukan milik ${outletOwner || 'PIC lain'}).`
        );
      }
      const today = todayIso();
      if (
        !canEditOutletDay(
          workspaceData,
          activeConfig.tasks,
          days,
          outlet,
          day,
          today,
          isAdminAccount
        )
      ) {
        throw new Error('Tanggal atau outlet ini terkunci dan tidak dapat diubah.');
      }
      const entries = Object.entries(changes);
      if (entries.length === 0) return;

      const monthKey = currentMonthKey(day);
      if (!canAccessMonthForWrite(monthKey)) {
        throw new Error('Akses bulan ini sudah ditutup oleh Admin.');
      }

      const curMonth = currentMonthKey(today);
      const curWeekMonday = weekStartIso(today);
      for (const [taskKey, item] of entries) {
        const cleanDate = (item.d || '').trim();
        if (item.cleared || !cleanDate) continue;
        const taskDef = activeConfig.tasks.find((t) => t.key === taskKey);
        const inputType = getTaskInputType(taskDef);
        if (inputType === 'month') {
          if (!/^\d{4}-\d{2}/.test(cleanDate) || cleanDate.slice(0, 7) > curMonth) {
            throw new Error(
              `Bulan update pada ${taskDef?.label || taskKey} tidak boleh melebihi bulan berjalan.`
            );
          }
        } else if (inputType === 'week') {
          if (
            !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate) ||
            weekStartIso(cleanDate) > curWeekMonday
          ) {
            throw new Error(
              `Minggu update pada ${taskDef?.label || taskKey} tidak boleh melebihi minggu berjalan.`
            );
          }
        } else if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate) || cleanDate > today) {
          throw new Error(
            `Tanggal update pada ${taskDef?.label || taskKey} tidak boleh melebihi tanggal hari ini.`
          );
        }
      }

      const docId = `${effectiveRoleId}_${monthKey}`;
      const path = `roleMonthlyWorkspaces/${docId}`;
      const wsRef = doc(db, 'roleMonthlyWorkspaces', docId);
      const nowIso = new Date().toISOString();
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(wsRef);
          if (!snap.exists()) {
            const initialOutletEnt: Record<string, EntryItem> = {};
            for (const [taskKey, item] of entries) {
              const cleanDate = (item.d || '').trim();
              const cleanNote = (item.n || '').slice(0, 100);
              if (!item.cleared && (cleanDate || cleanNote)) {
                initialOutletEnt[`${day}|${taskKey}`] = {
                  d: cleanDate,
                  n: cleanNote,
                  ts: nowIso,
                  ...(isAdminAccount ? { byAdmin: true } : {}),
                };
              }
            }
            tx.set(wsRef, {
              roleId: effectiveRoleId,
              monthKey,
              ent: Object.keys(initialOutletEnt).length > 0 ? { [outlet]: initialOutletEnt } : {},
              visit: {},
              updatedAt: serverTimestamp(),
              updatedBy: uid,
            });
          } else {
            const updateArgs: unknown[] = [];
            for (const [taskKey, item] of entries) {
              const cleanDate = (item.d || '').trim();
              const cleanNote = (item.n || '').slice(0, 100);
              if (item.cleared || (!cleanDate && !cleanNote)) {
                updateArgs.push(new FieldPath('ent', outlet, `${day}|${taskKey}`), deleteField());
              } else {
                updateArgs.push(new FieldPath('ent', outlet, `${day}|${taskKey}`), {
                  d: cleanDate,
                  n: cleanNote,
                  ts: nowIso,
                  ...(isAdminAccount ? { byAdmin: true } : {}),
                });
              }
            }
            updateArgs.push('updatedAt', serverTimestamp(), 'updatedBy', uid);
            tx.update(
              wsRef,
              ...(updateArgs as [FieldPath | string, unknown, ...unknown[]])
            );
          }
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }

      const assignedPic =
        activeConfig.outlets.find((o) => o.code === outlet)?.person || '';
      const summaryParts = entries.map(([taskKey, item]) => {
        const taskDef = activeConfig.tasks.find((t) => t.key === taskKey);
        const label = taskDef?.shortLabel || taskDef?.label || taskKey;
        const cleanNote = (item.n || '').trim().slice(0, 100);
        if (item.cleared || (!item.d && !cleanNote)) {
          return `${label}: Dikosongkan`;
        }
        const taskInputType = getTaskInputType(taskDef);
        const datePart = item.d
          ? taskInputType === 'month'
            ? fmtMonth(item.d)
            : taskInputType === 'week'
              ? fmtWeek(item.d)
              : fmtDateLong(item.d)
          : '-';
        return cleanNote ? `${label}: ${datePart} (${cleanNote})` : `${label}: ${datePart}`;
      });

      try {
        await recordInputLog({
          actionType: 'input_harian',
          pic: assignedPic,
          outlet,
          day,
          details: summaryParts.join(' · '),
          itemCount: entries.length,
          clientTs: nowIso,
        });
      } catch (logError) {
        console.error('Gagal mencatat log input harian (data utama tetap tersimpan):', logError);
      }
    },
    [
      currentAccount,
      effectiveRoleId,
      isAdminAccount,
      workspaceData,
      activeConfig.tasks,
      activeConfig.outlets,
      days,
      recordInputLog,
      canAccessMonthForWrite,
    ]
  );

  const clearEntryForDay = useCallback(
    async (outlet: string, day: string, taskKey: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      const outletOwner = activeConfig.outlets.find((o) => o.code === outlet)?.person || '';
      if (!canAccountEditPic(currentAccount, activeConfig.outlets, outletOwner)) {
        throw new Error(
          `Akses ditolak: Anda hanya dapat mengubah data untuk outlet milik PIC Anda sendiri.`
        );
      }
      if (
        !canEditOutletDay(
          workspaceData,
          activeConfig.tasks,
          days,
          outlet,
          day,
          todayIso(),
          isAdminAccount
        )
      ) {
        throw new Error('Tanggal atau outlet ini terkunci dan tidak dapat dikosongkan.');
      }
      const monthKey = currentMonthKey(day);
      if (!canAccessMonthForWrite(monthKey)) {
        throw new Error('Akses bulan ini sudah ditutup oleh Admin.');
      }
      const docId = `${effectiveRoleId}_${monthKey}`;
      const path = `roleMonthlyWorkspaces/${docId}`;
      try {
        const wsRef = doc(db, 'roleMonthlyWorkspaces', docId);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(wsRef);
          if (snap.exists()) {
            tx.update(
              wsRef,
              new FieldPath('ent', outlet, `${day}|${taskKey}`),
              deleteField(),
              'updatedAt',
              serverTimestamp(),
              'updatedBy',
              uid
            );
          }
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [
      currentAccount,
      effectiveRoleId,
      isAdminAccount,
      workspaceData,
      activeConfig.tasks,
      activeConfig.outlets,
      days,
      canAccessMonthForWrite,
    ]
  );

  const saveVisitDay = useCallback(
    async (person: string, day: string, nextVisitInput: VisitItem) => {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      if (!canAccountEditPic(currentAccount, activeConfig.outlets, person)) {
        throw new Error(
          `Akses ditolak: Anda hanya dapat mengisi atau mengubah kunjungan atas nama PIC Anda sendiri (bukan ${person}).`
        );
      }
      if (isSunday(day) || day !== todayIso()) {
        throw new Error('Kunjungan hanya dapat disimpan pada Hari H (bukan hari Minggu).');
      }

      const monthKey = currentMonthKey(day);
      if (!canAccessMonthForWrite(monthKey)) {
        throw new Error('Akses bulan ini sudah ditutup oleh Admin.');
      }

      const normalizedEntries = getVisitEntries(nextVisitInput)
        .slice(0, 20)
        .map((entry, idx) => ({
          id: entry.id || `v_${idx + 1}`,
          outlet: entry.outlet.trim().slice(0, 40),
          f: entry.f.slice(0, 10),
          t: entry.t.slice(0, 10),
          n: entry.n.slice(0, 100),
        }));

      const first = normalizedEntries[0];
      const normalizedVisit: VisitItem = {
        ok: Boolean(nextVisitInput.ok),
        outlet: first?.outlet || nextVisitInput.outlet || '',
        f: first?.f || '',
        t: first?.t || '',
        n: first?.n || '',
        entries: nextVisitInput.ok ? normalizedEntries : [],
      };

      const docId = `${effectiveRoleId}_${monthKey}`;
      const path = `roleMonthlyWorkspaces/${docId}`;
      const wsRef = doc(db, 'roleMonthlyWorkspaces', docId);
      const nowIso = new Date().toISOString();
      const key = `${person}|${day}`;

      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(wsRef);
          if (!snap.exists()) {
            tx.set(wsRef, {
              roleId: effectiveRoleId,
              monthKey,
              ent: {},
              visit: { [key]: normalizedVisit },
              updatedAt: serverTimestamp(),
              updatedBy: uid,
            });
          } else {
            tx.update(
              wsRef,
              new FieldPath('visit', key),
              normalizedVisit,
              'updatedAt',
              serverTimestamp(),
              'updatedBy',
              uid
            );
          }
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }

      const uniqueOutlets = Array.from(
        new Set(
          (normalizedVisit.entries || [])
            .map((e) => e.outlet)
            .filter(Boolean)
        )
      );
      const visitSummary = normalizedVisit.ok
        ? (normalizedVisit.entries || [])
            .map((e, idx) => {
              const timeStr = e.f || e.t ? ` (${e.f || '?'}–${e.t || '?'})` : '';
              const noteStr = e.n ? `: ${e.n}` : '';
              return `#${idx + 1} ${e.outlet || 'Outlet'}${timeStr}${noteStr}`;
            })
            .join(' · ') || 'Sudah dikunjungi'
        : 'Status kunjungan dibatalkan / tidak dikunjungi';

      try {
        await recordInputLog({
          actionType: 'kunjungan',
          pic: person,
          outlet: uniqueOutlets.join(', ') || '-',
          day,
          details: visitSummary,
          itemCount: normalizedVisit.ok ? Math.max(1, (normalizedVisit.entries || []).length) : 1,
          clientTs: nowIso,
        });
      } catch (logError) {
        console.error('Gagal mencatat log kunjungan (data kunjungan tetap tersimpan):', logError);
      }
    },
    [currentAccount, activeConfig.outlets, effectiveRoleId, canAccessMonthForWrite, recordInputLog]
  );

  const updateVisit = useCallback(
    async (person: string, day: string, patch: Partial<VisitItem>) => {
      const key = `${person}|${day}`;
      const current: VisitItem = workspaceData.visit[key] || { ok: false, f: '', t: '', n: '' };
      await saveVisitDay(person, day, { ...current, ...patch });
    },
    [saveVisitDay, workspaceData.visit]
  );

  const {
    saveRoleConfig,
    saveOpenUntilMonthAllRoles,
    togglePastMonthAllRoles,
    saveAccount,
    deleteAccount,
    importWorkspaceData,
    resetRoleWorkspace,
  } = useAdminManagementActions({
    currentAccount,
    effectiveRoleId,
    activeMonth,
    roleConfigs,
  });

  const {
    createCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    createSavedRecord,
    updateSavedRecord,
    deleteSavedRecord,
  } = useCalendarAndRecordsActions({
    currentAccount,
    effectiveRoleId,
    activeOutlets: activeConfig.outlets,
  });

  return {
    firebaseUser,
    authStatus,
    authError,
    currentAccount,
    activeRoleId: effectiveRoleId,
    setActiveRoleId,
    activeMonth,
    setActiveMonth,
    selectableMonths,
    roleConfigs,
    activeConfig,
    days,
    store: workspaceData,
    allWorkspaces: adminAllWorkspaces,
    managedAccounts,
    inputLogs,
    calendarEvents,
    savedRecords,
    firebaseStorage,
    theme,
    toggleTheme,
    signInWithGoogle,
    signOutUser,
    updateEntry,
    saveOutletDayEntries,
    clearEntryForDay,
    updateVisit,
    saveVisitDay,
    saveRoleConfig,
    saveOpenUntilMonthAllRoles,
    togglePastMonthAllRoles,
    saveAccount,
    deleteAccount,
    importWorkspaceData,
    resetRoleWorkspace,
    createCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    createSavedRecord,
    updateSavedRecord,
    deleteSavedRecord,
  };
}
