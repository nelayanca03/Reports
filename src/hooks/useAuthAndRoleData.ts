import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
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
  OperationalRoleId,
  OutletStoreState,
  RecordPrefix,
  RoleConfig,
} from '../types/outlet';
import {
  DEFAULT_ROLE_CONFIGS,
  DEFAULT_START,
  LEGACY_STORAGE_KEY,
  buildOutletsByPicMap,
  currentMonthKey,
  getSelectableMonths,
  todayIso,
} from '../utils/outletLogic';
import { useAdminManagementActions } from './useAdminManagementActions';
import { useCalendarAndRecordsActions } from './useCalendarAndRecordsActions';
import { useThemePreference } from './useThemePreference';
import { useWorkspaceEntryActions } from './useWorkspaceEntryActions';
import { useWorkspaceListeners } from './useWorkspaceListeners';

export type AuthStatus = 'loading' | 'signed_out' | 'unregistered' | 'inactive' | 'ready';

function readLegacyLocalStorage(): {
  ent: OutletStoreState['ent'];
  visit: OutletStoreState['visit'];
  start: string;
} | null {
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

  const [activeRoleId, setActiveRoleId] = useState<OperationalRoleId>('stock_accounting');
  const [activeMonth, setActiveMonth] = useState<string>(() => currentMonthKey(todayIso()));
  const [roleConfigs, setRoleConfigs] = useState<Record<OperationalRoleId, RoleConfig>>(
    DEFAULT_ROLE_CONFIGS
  );

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

  const resolvedActiveMonth = useMemo(() => {
    if (authStatus !== 'ready' || !currentAccount) return activeMonth;
    if (selectableMonths.includes(activeMonth)) return activeMonth;
    const cur = currentMonthKey(todayIso());
    return selectableMonths.includes(cur) ? cur : selectableMonths[0] || cur;
  }, [authStatus, currentAccount, selectableMonths, activeMonth]);

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
    } else if (accSnap.data().role !== 'admin' || accSnap.data().active !== true) {
      try {
        await updateDoc(accRef, {
          role: 'admin',
          active: true,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, accPath);
      }
    }

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
      } else {
        const prevMap = (dirSnap.data().accounts as Record<string, Record<string, unknown>>) || {};
        const prevOwner = prevMap[accId];
        if (!prevOwner || prevOwner.role !== 'admin' || prevOwner.active !== true) {
          await setDoc(dirRef, {
            accounts: {
              ...prevMap,
              [accId]: {
                email,
                name: prevOwner?.name || (accSnap.exists() ? accSnap.data().name : displayName),
                role: 'admin',
                picName: typeof prevOwner?.picName === 'string' ? prevOwner.picName : '',
                active: true,
              },
            },
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, dirPath);
    }

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
      const isBootstrappedOwner = email === BOOTSTRAPPED_ADMIN_EMAIL;

      try {
        if (isBootstrappedOwner) {
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
          role: isBootstrappedOwner ? 'admin' : ((data.role as AccountRole) || 'stock_accounting'),
          picName: String(data.picName || ''),
          ...(data.refPrefix === 'SA' || data.refPrefix === 'GL'
            ? { refPrefix: data.refPrefix as RecordPrefix }
            : {}),
          active: isBootstrappedOwner ? true : Boolean(data.active),
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

  const {
    days,
    workspaceData,
    adminAllWorkspaces,
    managedAccounts,
    resetSecurity,
    inputLogs,
    calendarEvents,
    personalReminders,
    calendarBanners,
    savedRecords,
    firebaseStorage,
  } = useWorkspaceListeners({
    authStatus,
    currentAccount,
    effectiveRoleId,
    activeMonth: resolvedActiveMonth,
    selectableMonths,
    roleConfigs,
    setRoleConfigs,
  });

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

  const {
    updateEntry,
    saveOutletDayEntries,
    clearEntryForDay,
    saveVisitDay,
    updateVisit,
  } = useWorkspaceEntryActions({
    currentAccount,
    effectiveRoleId,
    isAdminAccount,
    activeConfig,
    workspaceData,
    days,
    canAccessMonthForWrite,
  });

  const {
    saveRoleConfig,
    saveOpenUntilMonthAllRoles,
    togglePastMonthAllRoles,
    saveDayAdjustmentAllRoles,
    deleteDayAdjustmentAllRoles,
    saveAccount,
    deleteAccount,
    importWorkspaceData,
    resetRoleWorkspace,
    saveResetPassword,
    resetAllUserInputData,
  } = useAdminManagementActions({
    currentAccount,
    effectiveRoleId,
    activeMonth: resolvedActiveMonth,
    selectableMonths,
    roleConfigs,
  });

  const {
    createCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    bulkCreateAssignEvents,
    updateAssignResponse,
    dismissAssignNotification,
    createPersonalReminder,
    updatePersonalReminder,
    deletePersonalReminder,
    addCalendarBanner,
    updateCalendarBanner,
    deleteCalendarBanner,
    createSavedRecord,
    updateSavedRecord,
    deleteSavedRecord,
  } = useCalendarAndRecordsActions({
    currentAccount,
    effectiveRoleId,
    activeOutlets: activeConfig.outlets,
    calendarEvents,
  });

  return {
    firebaseUser,
    authStatus,
    authError,
    currentAccount,
    activeRoleId: effectiveRoleId,
    setActiveRoleId,
    activeMonth: resolvedActiveMonth,
    setActiveMonth,
    selectableMonths,
    roleConfigs,
    activeConfig,
    days,
    store: workspaceData,
    allWorkspaces: adminAllWorkspaces,
    managedAccounts,
    resetSecurity,
    inputLogs,
    calendarEvents,
    personalReminders,
    calendarBanners,
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
    saveDayAdjustmentAllRoles,
    deleteDayAdjustmentAllRoles,
    saveAccount,
    deleteAccount,
    importWorkspaceData,
    resetRoleWorkspace,
    saveResetPassword,
    resetAllUserInputData,
    createCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    bulkCreateAssignEvents,
    updateAssignResponse,
    dismissAssignNotification,
    createPersonalReminder,
    updatePersonalReminder,
    deletePersonalReminder,
    addCalendarBanner,
    updateCalendarBanner,
    deleteCalendarBanner,
    createSavedRecord,
    updateSavedRecord,
    deleteSavedRecord,
  };
}
