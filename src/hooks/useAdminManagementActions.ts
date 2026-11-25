import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { useCallback } from 'react';
import { OperationType, auth, db, emailToAccountId, handleFirestoreError } from '../firebase';
import {
  AccountProfile,
  AccountRole,
  EntryItem,
  OperationalRoleId,
  OutletStoreState,
  RecordPrefix,
  RoleConfig,
} from '../types/outlet';
import {
  DEFAULT_ROLE_CONFIGS,
  buildOutletsByPicMap,
  currentMonthKey,
  todayIso,
} from '../utils/outletLogic';

export function parseUnlockedPastMonths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw.filter((m): m is string => typeof m === 'string' && /^\d{4}-\d{2}$/.test(m))
    )
  )
    .sort()
    .slice(0, 24);
}

interface UseAdminManagementActionsParams {
  currentAccount: AccountProfile | null;
  effectiveRoleId: OperationalRoleId;
  activeMonth: string;
  roleConfigs: Record<OperationalRoleId, RoleConfig>;
}

export function useAdminManagementActions({
  currentAccount,
  effectiveRoleId,
  activeMonth,
  roleConfigs,
}: UseAdminManagementActionsParams) {
  const saveRoleConfig = useCallback(async (roleId: OperationalRoleId, nextConfig: RoleConfig) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const path = `roleConfigs/${roleId}`;
    const validOpenMonth =
      nextConfig.openUntilMonth && /^\d{4}-\d{2}$/.test(nextConfig.openUntilMonth)
        ? nextConfig.openUntilMonth
        : undefined;
    const curMonth = currentMonthKey(todayIso());
    const validUnlockedPast = parseUnlockedPastMonths(nextConfig.unlockedPastMonths).filter(
      (m) => m < curMonth
    );
    try {
      const boundedOutlets = nextConfig.outlets.slice(0, 100);
      await setDoc(doc(db, 'roleConfigs', roleId), {
        roleId,
        label: nextConfig.label.slice(0, 60),
        start: nextConfig.start,
        ndays: Math.max(1, Math.min(60, Math.round(nextConfig.ndays))),
        ...(validOpenMonth ? { openUntilMonth: validOpenMonth } : {}),
        ...(validUnlockedPast.length > 0 ? { unlockedPastMonths: validUnlockedPast } : {}),
        tasks: nextConfig.tasks.slice(0, 30),
        outlets: boundedOutlets,
        outletsByPic: buildOutletsByPicMap(boundedOutlets),
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }, []);

  const saveOpenUntilMonthAllRoles = useCallback(
    async (openUntilMonth?: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid || currentAccount?.role !== 'admin') return;
      const validOpenMonth =
        openUntilMonth && /^\d{4}-\d{2}$/.test(openUntilMonth) ? openUntilMonth : undefined;
      const roleIds: OperationalRoleId[] = ['stock_accounting', 'gl', 'accounting'];
      for (const rId of roleIds) {
        const currentCfg = roleConfigs[rId] || DEFAULT_ROLE_CONFIGS[rId];
        await saveRoleConfig(rId, {
          ...currentCfg,
          openUntilMonth: validOpenMonth,
        });
      }
    },
    [currentAccount?.role, roleConfigs, saveRoleConfig]
  );

  const togglePastMonthAllRoles = useCallback(
    async (monthKey: string, open: boolean) => {
      const uid = auth.currentUser?.uid;
      if (!uid || currentAccount?.role !== 'admin') return;
      const curMonth = currentMonthKey(todayIso());
      if (!/^\d{4}-\d{2}$/.test(monthKey) || monthKey >= curMonth) return;
      const roleIds: OperationalRoleId[] = ['stock_accounting', 'gl', 'accounting'];
      for (const rId of roleIds) {
        const currentCfg = roleConfigs[rId] || DEFAULT_ROLE_CONFIGS[rId];
        const prevList = currentCfg.unlockedPastMonths || [];
        const nextList = open
          ? Array.from(new Set([...prevList, monthKey])).sort()
          : prevList.filter((m) => m !== monthKey);
        await saveRoleConfig(rId, {
          ...currentCfg,
          unlockedPastMonths: nextList,
        });
      }
    },
    [currentAccount?.role, roleConfigs, saveRoleConfig]
  );

  const saveAccount = useCallback(
    async (input: {
      email: string;
      name: string;
      role: AccountRole;
      picName: string;
      refPrefix?: RecordPrefix;
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
        const validRefPrefix =
          input.role === 'accounting' && (input.refPrefix === 'SA' || input.refPrefix === 'GL')
            ? input.refPrefix
            : undefined;

        if (existingSnap.exists()) {
          await updateDoc(accRef, {
            name: cleanName,
            role: input.role,
            picName: cleanPic,
            refPrefix: validRefPrefix ? validRefPrefix : deleteField(),
            active: input.active,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(accRef, {
            email,
            name: cleanName,
            role: input.role,
            picName: cleanPic,
            ...(validRefPrefix ? { refPrefix: validRefPrefix } : {}),
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
              ...(validRefPrefix ? { refPrefix: validRefPrefix } : {}),
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

      const byMonth: Record<string, { ent: OutletStoreState['ent']; visit: OutletStoreState['visit'] }> = {};
      const ensureBucket = (mKey: string) => {
        if (!byMonth[mKey]) byMonth[mKey] = { ent: {}, visit: {} };
        return byMonth[mKey];
      };

      for (const [outlet, outletMap] of Object.entries(incoming.ent || {})) {
        for (const [k, item] of Object.entries(outletMap || {})) {
          const day = k.split('|')[0] || '';
          const mKey = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.slice(0, 7) : activeMonth;
          const bucket = ensureBucket(mKey);
          if (!bucket.ent[outlet]) bucket.ent[outlet] = {};
          bucket.ent[outlet][k] = item as EntryItem;
        }
      }

      for (const [vKey, vItem] of Object.entries(incoming.visit || {})) {
        const parts = vKey.split('|');
        const day = parts[1] || '';
        const mKey = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.slice(0, 7) : activeMonth;
        const bucket = ensureBucket(mKey);
        bucket.visit[vKey] = vItem;
      }

      const monthKeys = Object.keys(byMonth);
      if (monthKeys.length === 0) {
        monthKeys.push(activeMonth);
        ensureBucket(activeMonth);
      }

      for (const mKey of monthKeys) {
        const docId = `${effectiveRoleId}_${mKey}`;
        const path = `roleMonthlyWorkspaces/${docId}`;
        try {
          const wsRef = doc(db, 'roleMonthlyWorkspaces', docId);
          const snap = await getDoc(wsRef);
          const payload = byMonth[mKey];
          if (snap.exists()) {
            await updateDoc(wsRef, {
              ent: payload.ent,
              visit: payload.visit,
              updatedAt: serverTimestamp(),
              updatedBy: uid,
            });
          } else {
            await setDoc(wsRef, {
              roleId: effectiveRoleId,
              monthKey: mKey,
              ent: payload.ent,
              visit: payload.visit,
              updatedAt: serverTimestamp(),
              updatedBy: uid,
            });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, path);
        }
      }
    },
    [currentAccount?.role, effectiveRoleId, activeMonth]
  );

  const resetRoleWorkspace = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const docId = `${effectiveRoleId}_${activeMonth}`;
    const monthlyPath = `roleMonthlyWorkspaces/${docId}`;
    try {
      const mRef = doc(db, 'roleMonthlyWorkspaces', docId);
      const mSnap = await getDoc(mRef);
      if (mSnap.exists()) {
        await updateDoc(mRef, {
          ent: {},
          visit: {},
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, monthlyPath);
    }

    // Also prune entries belonging to activeMonth from legacy doc so cleared month items never resurface
    const legacyPath = `roleWorkspaces/${effectiveRoleId}`;
    try {
      const legacyRef = doc(db, 'roleWorkspaces', effectiveRoleId);
      const legacySnap = await getDoc(legacyRef);
      if (legacySnap.exists()) {
        const d = legacySnap.data();
        const prevEnt = (d.ent as OutletStoreState['ent']) || {};
        const prevVisit = (d.visit as OutletStoreState['visit']) || {};
        const nextEnt: OutletStoreState['ent'] = {};
        for (const [outlet, outletMap] of Object.entries(prevEnt)) {
          const kept: Record<string, EntryItem> = {};
          for (const [k, v] of Object.entries(outletMap || {})) {
            if (!k.startsWith(`${activeMonth}-`)) {
              kept[k] = v;
            }
          }
          if (Object.keys(kept).length > 0) {
            nextEnt[outlet] = kept;
          }
        }
        const nextVisit: OutletStoreState['visit'] = {};
        for (const [vKey, vVal] of Object.entries(prevVisit)) {
          const dayPart = vKey.split('|')[1] || '';
          if (!dayPart.startsWith(`${activeMonth}-`)) {
            nextVisit[vKey] = vVal;
          }
        }
        await updateDoc(legacyRef, {
          ent: nextEnt,
          visit: nextVisit,
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, legacyPath);
    }
  }, [effectiveRoleId, activeMonth]);

  return {
    saveRoleConfig,
    saveOpenUntilMonthAllRoles,
    togglePastMonthAllRoles,
    saveAccount,
    deleteAccount,
    importWorkspaceData,
    resetRoleWorkspace,
  };
}
