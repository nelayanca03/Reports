import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  FieldPath,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
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
  OperationalRoleId,
  OutletStoreState,
  RoleConfig,
  VisitItem,
} from '../types/outlet';
import {
  DEFAULT_ROLE_CONFIGS,
  DEFAULT_START,
  LEGACY_STORAGE_KEY,
  buildWorkingDays,
  getEntry,
  isSunday,
  todayIso,
} from '../utils/outletLogic';

const THEME_STORAGE_KEY = 'outlet-theme-v1';

export type AuthStatus = 'loading' | 'signed_out' | 'unregistered' | 'inactive' | 'ready';

function loadInitialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // ignore
  }
  return 'light';
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

  const [roleConfigs, setRoleConfigs] = useState<Record<OperationalRoleId, RoleConfig>>(
    DEFAULT_ROLE_CONFIGS
  );
  const [workspaceData, setWorkspaceData] = useState<OutletStoreState>({
    ent: {},
    visit: {},
    start: DEFAULT_START,
  });
  const [managedAccounts, setManagedAccounts] = useState<AccountProfile[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(loadInitialTheme);

  // Theme sync
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

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
            start: rId === 'stock_accounting' && legacy?.start ? legacy.start : base.start,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, cfgPath);
      }
    }

    // Seed stock_accounting workspace (migrating legacy localStorage disc-v1 if available)
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
      const accPath = `accounts/${accId}`;

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

  // Listen to active role config & workspace once authenticated & authorized
  useEffect(() => {
    if (authStatus !== 'ready' || !currentAccount) return;

    const targetRole: OperationalRoleId =
      currentAccount.role === 'admin' ? activeRoleId : currentAccount.role;

    const cfgPath = `roleConfigs/${targetRole}`;
    const unsubCfg = onSnapshot(
      doc(db, 'roleConfigs', targetRole),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          const parsed: RoleConfig = {
            roleId: targetRole,
            label: String(d.label || DEFAULT_ROLE_CONFIGS[targetRole].label),
            start: String(d.start || DEFAULT_START),
            ndays: Number(d.ndays || 25),
            tasks: Array.isArray(d.tasks) ? d.tasks : [],
            outlets: Array.isArray(d.outlets) ? d.outlets : [],
          };
          setRoleConfigs((prev) => ({ ...prev, [targetRole]: parsed }));
        } else {
          setRoleConfigs((prev) => ({ ...prev, [targetRole]: DEFAULT_ROLE_CONFIGS[targetRole] }));
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, cfgPath)
    );

    const wsPath = `roleWorkspaces/${targetRole}`;
    const unsubWs = onSnapshot(
      doc(db, 'roleWorkspaces', targetRole),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setWorkspaceData({
            ent: (d.ent as OutletStoreState['ent']) || {},
            visit: (d.visit as OutletStoreState['visit']) || {},
            start: roleConfigs[targetRole]?.start || DEFAULT_START,
          });
        } else {
          setWorkspaceData({
            ent: {},
            visit: {},
            start: roleConfigs[targetRole]?.start || DEFAULT_START,
          });
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, wsPath)
    );

    return () => {
      unsubCfg();
      unsubWs();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, currentAccount, activeRoleId]);

  // Admin-only listeners: all 3 roleConfigs + adminRegistry/accounts
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
              setRoleConfigs((prev) => ({
                ...prev,
                [rId]: {
                  roleId: rId,
                  label: String(d.label || DEFAULT_ROLE_CONFIGS[rId].label),
                  start: String(d.start || DEFAULT_START),
                  ndays: Number(d.ndays || 25),
                  tasks: Array.isArray(d.tasks) ? d.tasks : [],
                  outlets: Array.isArray(d.outlets) ? d.outlets : [],
                },
              }));
            }
          },
          (error) => handleFirestoreError(error, OperationType.GET, path)
        )
      );
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
                active: Boolean(val.active),
              }))
              .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
            setManagedAccounts(list);
          }
        },
        (error) => handleFirestoreError(error, OperationType.GET, regPath)
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authStatus, currentAccount]);

  const effectiveRoleId: OperationalRoleId =
    currentAccount?.role === 'admin'
      ? activeRoleId
      : (currentAccount?.role as OperationalRoleId) || 'stock_accounting';

  const activeConfig = roleConfigs[effectiveRoleId] || DEFAULT_ROLE_CONFIGS[effectiveRoleId];

  const days = useMemo(
    () => buildWorkingDays(activeConfig.start, activeConfig.ndays),
    [activeConfig.start, activeConfig.ndays]
  );

  const storeWithConfigStart: OutletStoreState = useMemo(
    () => ({
      ...workspaceData,
      start: activeConfig.start,
    }),
    [workspaceData, activeConfig.start]
  );

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Gagal masuk dengan Google.');
    }
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
  }, []);

  const ensureWorkspaceDoc = useCallback(
    async (roleId: OperationalRoleId, uid: string) => {
      const wsRef = doc(db, 'roleWorkspaces', roleId);
      const snap = await getDoc(wsRef);
      if (!snap.exists()) {
        await setDoc(wsRef, {
          roleId,
          ent: {},
          visit: {},
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        });
      }
      return wsRef;
    },
    []
  );

  const updateEntry = useCallback(
    async (outlet: string, day: string, taskKey: string, field: 'd' | 'n', value: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      if (isSunday(day)) return;
      if (currentAccount?.role !== 'admin' && day !== todayIso()) return;
      const path = `roleWorkspaces/${effectiveRoleId}`;
      try {
        const wsRef = await ensureWorkspaceDoc(effectiveRoleId, uid);
        const existing = workspaceData.ent[outlet]?.[`${day}|${taskKey}`];
        const fallbackDate = getEntry(
          storeWithConfigStart,
          days,
          activeConfig.tasks,
          outlet,
          day,
          taskKey
        ).d;
        const nextEntry = {
          d: existing?.d || fallbackDate,
          n: existing?.n || '',
          [field]: value,
        };
        await updateDoc(
          wsRef,
          new FieldPath('ent', outlet, `${day}|${taskKey}`),
          nextEntry,
          'updatedAt',
          serverTimestamp(),
          'updatedBy',
          uid
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [
      currentAccount?.role,
      effectiveRoleId,
      ensureWorkspaceDoc,
      workspaceData.ent,
      storeWithConfigStart,
      days,
      activeConfig.tasks,
    ]
  );

  const clearEntryForDay = useCallback(
    async (outlet: string, day: string, taskKey: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      if (isSunday(day)) return;
      if (currentAccount?.role !== 'admin' && day !== todayIso()) return;
      const path = `roleWorkspaces/${effectiveRoleId}`;
      try {
        const wsRef = doc(db, 'roleWorkspaces', effectiveRoleId);
        await updateDoc(
          wsRef,
          new FieldPath('ent', outlet, `${day}|${taskKey}`),
          deleteField(),
          'updatedAt',
          serverTimestamp(),
          'updatedBy',
          uid
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [currentAccount?.role, effectiveRoleId]
  );

  const updateVisit = useCallback(
    async (person: string, day: string, patch: Partial<VisitItem>) => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      if (isSunday(day)) return;
      if (currentAccount?.role !== 'admin' && day !== todayIso()) return;
      const path = `roleWorkspaces/${effectiveRoleId}`;
      try {
        const wsRef = await ensureWorkspaceDoc(effectiveRoleId, uid);
        const key = `${person}|${day}`;
        const current: VisitItem = workspaceData.visit[key] || { ok: false, f: '', t: '', n: '' };
        const nextVisit: VisitItem = { ...current, ...patch };
        await updateDoc(
          wsRef,
          new FieldPath('visit', key),
          nextVisit,
          'updatedAt',
          serverTimestamp(),
          'updatedBy',
          uid
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [currentAccount?.role, effectiveRoleId, ensureWorkspaceDoc, workspaceData.visit]
  );

  const saveRoleConfig = useCallback(async (roleId: OperationalRoleId, nextConfig: RoleConfig) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const path = `roleConfigs/${roleId}`;
    try {
      await setDoc(doc(db, 'roleConfigs', roleId), {
        roleId,
        label: nextConfig.label.slice(0, 60),
        start: nextConfig.start,
        ndays: Math.max(1, Math.min(60, Math.round(nextConfig.ndays))),
        tasks: nextConfig.tasks.slice(0, 30),
        outlets: nextConfig.outlets.slice(0, 100),
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }, []);

  const saveAccount = useCallback(
    async (input: {
      email: string;
      name: string;
      role: AccountRole;
      picName: string;
      active: boolean;
    }) => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const email = input.email.trim().toLowerCase();
      const accId = emailToAccountId(email);
      const accPath = `accounts/${accId}`;
      const accRef = doc(db, 'accounts', accId);

      try {
        const existingSnap = await getDoc(accRef);
        const cleanName = input.name.trim().slice(0, 80);
        const cleanPic = input.picName.trim().slice(0, 60);

        if (existingSnap.exists()) {
          await updateDoc(accRef, {
            name: cleanName,
            role: input.role,
            picName: cleanPic,
            active: input.active,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(accRef, {
            email,
            name: cleanName,
            role: input.role,
            picName: cleanPic,
            active: input.active,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: uid,
          });
        }

        // Sync adminRegistry/accounts
        const regRef = doc(db, 'adminRegistry', 'accounts');
        const regSnap = await getDoc(regRef);
        const prevMap = regSnap.exists() ? regSnap.data().accounts || {} : {};
        await setDoc(regRef, {
          accounts: {
            ...prevMap,
            [accId]: {
              email,
              name: cleanName,
              role: input.role,
              picName: cleanPic,
              active: input.active,
            },
          },
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, accPath);
      }
    },
    []
  );

  const deleteAccount = useCallback(async (accountId: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const accPath = `accounts/${accountId}`;
    try {
      await deleteDoc(doc(db, 'accounts', accountId));
      const regRef = doc(db, 'adminRegistry', 'accounts');
      const regSnap = await getDoc(regRef);
      if (regSnap.exists()) {
        const prevMap = { ...(regSnap.data().accounts || {}) };
        delete prevMap[accountId];
        await setDoc(regRef, {
          accounts: prevMap,
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, accPath);
    }
  }, []);

  const importWorkspaceData = useCallback(
    async (incoming: OutletStoreState) => {
      const uid = auth.currentUser?.uid;
      if (!uid || currentAccount?.role !== 'admin') return;
      const path = `roleWorkspaces/${effectiveRoleId}`;
      try {
        await setDoc(doc(db, 'roleWorkspaces', effectiveRoleId), {
          roleId: effectiveRoleId,
          ent: incoming.ent || {},
          visit: incoming.visit || {},
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [currentAccount?.role, effectiveRoleId]
  );

  const resetRoleWorkspace = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const path = `roleWorkspaces/${effectiveRoleId}`;
    try {
      await setDoc(doc(db, 'roleWorkspaces', effectiveRoleId), {
        roleId: effectiveRoleId,
        ent: {},
        visit: {},
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }, [effectiveRoleId]);

  return {
    firebaseUser,
    authStatus,
    authError,
    currentAccount,
    activeRoleId: effectiveRoleId,
    setActiveRoleId,
    roleConfigs,
    activeConfig,
    days,
    store: storeWithConfigStart,
    managedAccounts,
    theme,
    toggleTheme,
    signInWithGoogle,
    signOutUser,
    updateEntry,
    clearEntryForDay,
    updateVisit,
    saveRoleConfig,
    saveAccount,
    deleteAccount,
    importWorkspaceData,
    resetRoleWorkspace,
  };
}
