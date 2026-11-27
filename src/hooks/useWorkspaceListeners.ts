import {
  Timestamp,
  collection,
  doc,
  getCountFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { OperationType, auth, db, handleFirestoreError } from '../firebase';
import {
  AccountProfile,
  AccountRole,
  AdminResetSecurityRecord,
  CalendarBannerMedia,
  CalendarEvent,
  FirebaseStorageStats,
  InputLogEntry,
  OperationalRoleId,
  OutletStoreState,
  RecordDepartment,
  RecordPrefix,
  RoleConfig,
  SavedRecord,
} from '../types/outlet';
import {
  DEFAULT_ROLE_CONFIGS,
  DEFAULT_START,
  FIRESTORE_SPARK_LIMIT_BYTES,
  buildMonthWorkingDays,
  buildOutletsByPicMap,
  estimateFirestoreDocBytes,
  mergeWorkspaceStates,
  normalizeCalendarInterval,
  normalizeCalendarRecurrenceFreq,
  normalizeCalendarVisibleTo,
  normalizeCalendarWeekdays,
  normalizeExcludedDates,
  parseDayAdjustments,
  shiftMonthKey,
} from '../utils/outletLogic';
import { parseUnlockedPastMonths } from './useAdminManagementActions';
import type { AuthStatus } from './useAuthAndRoleData';

export type WorkspaceSlice = Pick<OutletStoreState, 'ent' | 'visit'>;

export const EMPTY_SLICE: WorkspaceSlice = { ent: {}, visit: {} };

function parseOutletsByPic(raw: unknown): Record<string, string[]> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const result: Record<string, string[]> = {};
  for (const [picKey, val] of Object.entries(raw as Record<string, unknown>)) {
    const cleanKey = picKey.trim().toUpperCase();
    if (!cleanKey || !Array.isArray(val)) continue;
    result[cleanKey] = Array.from(
      new Set(
        val
          .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
          .map((c) => c.trim())
      )
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

interface UseWorkspaceListenersParams {
  authStatus: AuthStatus;
  currentAccount: AccountProfile | null;
  effectiveRoleId: OperationalRoleId;
  activeMonth: string;
  selectableMonths: string[];
  roleConfigs: Record<OperationalRoleId, RoleConfig>;
  setRoleConfigs: React.Dispatch<React.SetStateAction<Record<OperationalRoleId, RoleConfig>>>;
}

export function useWorkspaceListeners({
  authStatus,
  currentAccount,
  effectiveRoleId,
  activeMonth,
  selectableMonths,
  roleConfigs,
  setRoleConfigs,
}: UseWorkspaceListenersParams) {
  const [legacySlice, setLegacySlice] = useState<WorkspaceSlice>(EMPTY_SLICE);
  const [monthlySlices, setMonthlySlices] = useState<Record<string, WorkspaceSlice>>({});
  const [managedAccounts, setManagedAccounts] = useState<AccountProfile[]>([]);
  const [resetSecurity, setResetSecurity] = useState<AdminResetSecurityRecord | null>(null);
  const [inputLogs, setInputLogs] = useState<InputLogEntry[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarBanners, setCalendarBanners] = useState<CalendarBannerMedia[]>([]);
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

  // Listen to active role config & workspace (legacy + prevMonth + activeMonth)
  useEffect(() => {
    if (authStatus !== 'ready' || !currentAccount) return;

    const targetRole: OperationalRoleId =
      currentAccount.role === 'admin' ? effectiveRoleId : currentAccount.role;
    const prevMonth = shiftMonthKey(activeMonth, -1);

    const cfgPath = `roleConfigs/${targetRole}`;
    const unsubCfg = onSnapshot(
      doc(db, 'roleConfigs', targetRole),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          const unlockedPastMonths = parseUnlockedPastMonths(d.unlockedPastMonths);
          const parsedOutletsByPic = parseOutletsByPic(d.outletsByPic);
          const parsedDayAdjustments = parseDayAdjustments(d.dayAdjustments);
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
            ...(parsedDayAdjustments.length > 0 ? { dayAdjustments: parsedDayAdjustments } : {}),
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
  }, [authStatus, currentAccount, effectiveRoleId, activeMonth, setRoleConfigs]);

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
              const parsedDayAdjustments = parseDayAdjustments(d.dayAdjustments);
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
                  ...(parsedDayAdjustments.length > 0 ? { dayAdjustments: parsedDayAdjustments } : {}),
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
      : query(collection(db, 'savedRecords'), where('department', '==', currentAccount.role));

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
            .sort((a, b) => b.date.localeCompare(a.date) || b.refCode.localeCompare(a.refCode));
          setSavedRecords(list);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'savedRecords')
      )
    );

    const mediaQuery = query(collection(db, 'calendarMedia'), limit(30));
    unsubs.push(
      onSnapshot(
        mediaQuery,
        (snap) => {
          const list: CalendarBannerMedia[] = [];
          for (const docSnap of snap.docs) {
            const d = docSnap.data();
            const imageDataUrl = typeof d.imageDataUrl === 'string' ? d.imageDataUrl : '';
            if (!imageDataUrl.startsWith('data:image/')) continue;
            const updatedAtIso =
              d.updatedAt instanceof Timestamp
                ? d.updatedAt.toDate().toISOString()
                : undefined;
            const sortOrder =
              typeof d.sortOrder === 'number' && Number.isFinite(d.sortOrder)
                ? Math.max(0, Math.floor(d.sortOrder))
                : 0;
            list.push({
              id: docSnap.id,
              imageDataUrl,
              caption: typeof d.caption === 'string' ? d.caption : '',
              fileName: typeof d.fileName === 'string' ? d.fileName : '',
              sortOrder,
              updatedBy: String(d.updatedBy || ''),
              updatedByName: String(d.updatedByName || ''),
              updatedAtIso,
            });
          }
          list.sort(
            (a, b) =>
              (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
              (a.updatedAtIso || '').localeCompare(b.updatedAtIso || '') ||
              a.id.localeCompare(b.id)
          );
          setCalendarBanners(list);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'calendarMedia')
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authStatus, currentAccount, setRoleConfigs]);

  // Admin-only listeners: all 3 roleConfigs (outletsByPic sync) + workspaces + adminRegistry + inputLogs
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
              const parsedDayAdjustments = parseDayAdjustments(d.dayAdjustments);
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
                  ...(parsedDayAdjustments.length > 0
                    ? { dayAdjustments: parsedDayAdjustments }
                    : {}),
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

    const resetSecPath = 'adminRegistry/resetSecurity';
    unsubs.push(
      onSnapshot(
        doc(db, 'adminRegistry', 'resetSecurity'),
        (snap) => {
          if (snap.exists()) {
            const d = snap.data();
            const passwordHash = typeof d.passwordHash === 'string' ? d.passwordHash : '';
            const salt = typeof d.salt === 'string' ? d.salt : '';
            const iterations =
              typeof d.iterations === 'number' &&
              Number.isInteger(d.iterations) &&
              d.iterations > 0
                ? d.iterations
                : 100000;
            const updatedAtIso =
              d.updatedAt instanceof Timestamp
                ? d.updatedAt.toDate().toISOString()
                : undefined;
            if (/^[0-9a-f]{64}$/.test(passwordHash) && /^[0-9a-f]{32}$/.test(salt)) {
              setResetSecurity({
                passwordHash,
                salt,
                iterations,
                updatedBy: String(d.updatedBy || ''),
                updatedAtIso,
              });
            } else {
              setResetSecurity(null);
            }
          } else {
            setResetSecurity(null);
          }
        },
        (error) => handleFirestoreError(error, OperationType.GET, resetSecPath)
      )
    );

    const logsQuery = query(collection(db, 'inputLogs'), orderBy('createdAt', 'desc'), limit(300));
    unsubs.push(
      onSnapshot(
        logsQuery,
        (snap) => {
          const list: InputLogEntry[] = snap.docs.map((docSnap) => {
            const d = docSnap.data();
            const action =
              d.action === 'set' || d.action === 'clear' || d.action === 'edit'
                ? d.action
                : undefined;
            return {
              id: docSnap.id,
              uid: String(d.uid || ''),
              userEmail: String(d.userEmail || ''),
              userName: String(d.userName || ''),
              userRole: (d.userRole as AccountRole) || 'stock_accounting',
              roleId: (d.roleId as OperationalRoleId) || 'stock_accounting',
              roleLabel: String(d.roleLabel || ''),
              actionType: d.actionType === 'kunjungan' ? 'kunjungan' : 'input_harian',
              pic: String(d.pic || ''),
              outlet: String(d.outlet || ''),
              day: String(d.day || ''),
              details: String(d.details || ''),
              itemCount: Number(d.itemCount || 1),
              clientTs: String(d.clientTs || ''),
              ...(typeof d.taskKey === 'string' && d.taskKey ? { taskKey: d.taskKey } : {}),
              ...(typeof d.prevDate === 'string' ? { prevDate: d.prevDate } : {}),
              ...(typeof d.newDate === 'string' ? { newDate: d.newDate } : {}),
              ...(typeof d.prevNote === 'string' ? { prevNote: d.prevNote } : {}),
              ...(typeof d.newNote === 'string' ? { newNote: d.newNote } : {}),
              ...(action ? { action } : {}),
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
  }, [authStatus, currentAccount, selectableMonths, setRoleConfigs]);

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

    for (const rId of roleIds) {
      usedBytes += estimateFirestoreDocBytes(`roleConfigs/${rId}`, roleConfigs[rId]);
      totalDocs += 1;
    }

    for (const wsBytes of Object.values(adminWorkspaceBytes)) {
      if (wsBytes > 0) {
        usedBytes += wsBytes;
        totalDocs += 1;
      }
    }

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

    for (const bannerItem of calendarBanners) {
      usedBytes += estimateFirestoreDocBytes(`calendarMedia/${bannerItem.id}`, bannerItem);
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
    calendarBanners,
    savedRecords,
  ]);

  return {
    days,
    workspaceData,
    adminAllWorkspaces,
    managedAccounts,
    resetSecurity,
    inputLogs,
    calendarEvents,
    calendarBanners,
    savedRecords,
    firebaseStorage,
  };
}
