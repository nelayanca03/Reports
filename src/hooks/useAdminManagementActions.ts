import {
  DocumentReference,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { useCallback } from 'react';
import { OperationType, auth, db, emailToAccountId, handleFirestoreError } from '../firebase';
import {
  AccountProfile,
  AccountRole,
  EntryItem,
  FullUserResetSummary,
  OperationalRoleId,
  OutletStoreState,
  RecordPrefix,
  RoleConfig,
  WorkingDayAdjustment,
} from '../types/outlet';
import {
  DEFAULT_ROLE_CONFIGS,
  LEGACY_STORAGE_KEY,
  MIN_WORKSPACE_MONTH,
  buildOutletsByPicMap,
  currentMonthKey,
  parseDayAdjustments,
  shiftMonthKey,
  todayIso,
} from '../utils/outletLogic';
import { createResetPasswordRecord } from '../utils/resetPasswordCrypto';

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
  selectableMonths: string[];
  roleConfigs: Record<OperationalRoleId, RoleConfig>;
}

export function useAdminManagementActions({
  currentAccount,
  effectiveRoleId,
  activeMonth,
  selectableMonths,
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
    const validDayAdjustments = parseDayAdjustments(nextConfig.dayAdjustments);
    try {
      const boundedOutlets = nextConfig.outlets.slice(0, 100);
      await setDoc(doc(db, 'roleConfigs', roleId), {
        roleId,
        label: nextConfig.label.slice(0, 60),
        start: nextConfig.start,
        ndays: Math.max(1, Math.min(60, Math.round(nextConfig.ndays))),
        ...(validOpenMonth ? { openUntilMonth: validOpenMonth } : {}),
        ...(validUnlockedPast.length > 0 ? { unlockedPastMonths: validUnlockedPast } : {}),
        ...(validDayAdjustments.length > 0 ? { dayAdjustments: validDayAdjustments } : {}),
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

  const saveDayAdjustmentAllRoles = useCallback(
    async (adjustment: WorkingDayAdjustment) => {
      const uid = auth.currentUser?.uid;
      if (!uid || currentAccount?.role !== 'admin') return;
      const sanitized = parseDayAdjustments([adjustment]);
      if (sanitized.length === 0) return;
      const entry = sanitized[0];
      const roleIds: OperationalRoleId[] = ['stock_accounting', 'gl', 'accounting'];
      for (const rId of roleIds) {
        const currentCfg = roleConfigs[rId] || DEFAULT_ROLE_CONFIGS[rId];
        const prevList = currentCfg.dayAdjustments || [];
        const nextList = [entry, ...prevList.filter((a) => a.id !== entry.id)];
        await saveRoleConfig(rId, {
          ...currentCfg,
          dayAdjustments: nextList,
        });
      }
    },
    [currentAccount?.role, roleConfigs, saveRoleConfig]
  );

  const deleteDayAdjustmentAllRoles = useCallback(
    async (adjustmentId: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid || currentAccount?.role !== 'admin') return;
      const roleIds: OperationalRoleId[] = ['stock_accounting', 'gl', 'accounting'];
      for (const rId of roleIds) {
        const currentCfg = roleConfigs[rId] || DEFAULT_ROLE_CONFIGS[rId];
        const prevList = currentCfg.dayAdjustments || [];
        if (!prevList.some((a) => a.id === adjustmentId)) continue;
        await saveRoleConfig(rId, {
          ...currentCfg,
          dayAdjustments: prevList.filter((a) => a.id !== adjustmentId),
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

  const saveResetPassword = useCallback(
    async (newPassword: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid || currentAccount?.role !== 'admin') {
        throw new Error('Hanya Admin yang dapat mengatur password reset.');
      }
      const payload = await createResetPasswordRecord(newPassword);
      const ref = doc(db, 'adminRegistry', 'resetSecurity');
      const path = 'adminRegistry/resetSecurity';
      try {
        const snap = await getDoc(ref);
        if (snap.exists()) {
          await updateDoc(ref, {
            ...payload,
            updatedAt: serverTimestamp(),
            updatedBy: uid,
          });
        } else {
          await setDoc(ref, {
            ...payload,
            updatedAt: serverTimestamp(),
            updatedBy: uid,
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [currentAccount?.role]
  );

  const resetAllUserInputData = useCallback(
    async (onProgress?: (step: string) => void): Promise<FullUserResetSummary> => {
      const uid = auth.currentUser?.uid;
      if (!uid || currentAccount?.role !== 'admin') {
        throw new Error('Hanya Admin yang dapat mereset seluruh data input user.');
      }

      const roleIds: OperationalRoleId[] = ['stock_accounting', 'gl', 'accounting'];
      const seenMonths = new Set<string>([activeMonth, ...selectableMonths]);
      const seenCounters = new Set<string>();

      let workspacesCleared = 0;
      let monthlyDocsDeleted = 0;
      let savedRecordsDeleted = 0;
      let countersDeleted = 0;
      let inputLogsDeleted = 0;

      const deleteRefsInBatches = async (refs: DocumentReference[], pathLabel: string) => {
        for (let i = 0; i < refs.length; i += 400) {
          const chunk = refs.slice(i, i + 400);
          const batch = writeBatch(db);
          for (const r of chunk) {
            batch.delete(r);
          }
          try {
            await batch.commit();
          } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, pathLabel);
          }
        }
      };

      // 1. Delete all savedRecords (paginated batches)
      onProgress?.('Menghapus data tersimpan & kode referensi...');
      for (let page = 0; page < 500; page++) {
        let snap;
        try {
          snap = await getDocs(query(collection(db, 'savedRecords'), limit(400)));
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, 'savedRecords');
        }
        if (snap.empty) break;

        const batch = writeBatch(db);
        for (const docSnap of snap.docs) {
          const d = docSnap.data();
          if (typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date)) {
            seenMonths.add(d.date.slice(0, 7));
          }
          if (
            (d.prefix === 'SA' || d.prefix === 'GL') &&
            typeof d.yymm === 'string' &&
            /^\d{4}$/.test(d.yymm)
          ) {
            seenCounters.add(`${d.prefix}_${d.yymm}`);
          }
          batch.delete(docSnap.ref);
        }
        try {
          await batch.commit();
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'savedRecords');
        }
        savedRecordsDeleted += snap.size;
        onProgress?.(`Menghapus data tersimpan (${savedRecordsDeleted} data)...`);
        if (snap.size < 400) break;
      }

      // 2. Delete all inputLogs (paginated batches)
      onProgress?.('Menghapus log aktivitas input...');
      for (let page = 0; page < 500; page++) {
        let snap;
        try {
          snap = await getDocs(query(collection(db, 'inputLogs'), limit(400)));
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, 'inputLogs');
        }
        if (snap.empty) break;

        const batch = writeBatch(db);
        for (const docSnap of snap.docs) {
          const d = docSnap.data();
          if (typeof d.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.day)) {
            seenMonths.add(d.day.slice(0, 7));
          }
          batch.delete(docSnap.ref);
        }
        try {
          await batch.commit();
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'inputLogs');
        }
        inputLogsDeleted += snap.size;
        onProgress?.(`Menghapus log aktivitas (${inputLogsDeleted} log)...`);
        if (snap.size < 400) break;
      }

      // 3. Build full set of candidate months from MIN_WORKSPACE_MONTH through +12 months ahead
      const endSweepMonth = shiftMonthKey(currentMonthKey(todayIso()), 12);
      let cursorMonth = MIN_WORKSPACE_MONTH;
      let guard = 0;
      while (cursorMonth <= endSweepMonth && guard < 240) {
        seenMonths.add(cursorMonth);
        cursorMonth = shiftMonthKey(cursorMonth, 1);
        guard += 1;
      }
      const candidateMonths = Array.from(seenMonths)
        .filter((m) => /^\d{4}-\d{2}$/.test(m))
        .sort();

      // 4. Clear legacy roleWorkspaces for all 3 operational roles
      onProgress?.('Membersihkan workspace utama semua divisi...');
      for (const rId of roleIds) {
        const legacyPath = `roleWorkspaces/${rId}`;
        const legacyRef = doc(db, 'roleWorkspaces', rId);
        try {
          const legacySnap = await getDoc(legacyRef);
          if (legacySnap.exists()) {
            await updateDoc(legacyRef, {
              ent: {},
              visit: {},
              updatedAt: serverTimestamp(),
              updatedBy: uid,
            });
            workspacesCleared += 1;
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, legacyPath);
        }
      }

      // 5. Delete all existing roleMonthlyWorkspaces docs across all roles & candidate months
      onProgress?.('Menghapus data input harian & kunjungan semua bulan...');
      const monthlyDocIds: string[] = [];
      for (const rId of roleIds) {
        for (const mKey of candidateMonths) {
          monthlyDocIds.push(`${rId}_${mKey}`);
        }
      }
      const existingMonthlyRefs: DocumentReference[] = [];
      for (let i = 0; i < monthlyDocIds.length; i += 25) {
        const chunk = monthlyDocIds.slice(i, i + 25);
        try {
          const snaps = await Promise.all(
            chunk.map((id) => getDoc(doc(db, 'roleMonthlyWorkspaces', id)))
          );
          for (const s of snaps) {
            if (s.exists()) {
              existingMonthlyRefs.push(s.ref);
            }
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'roleMonthlyWorkspaces');
        }
      }
      if (existingMonthlyRefs.length > 0) {
        await deleteRefsInBatches(existingMonthlyRefs, 'roleMonthlyWorkspaces');
        monthlyDocsDeleted = existingMonthlyRefs.length;
      }

      // 6. Delete all existing recordCounters so reference numbering restarts at 0001
      onProgress?.('Mereset urutan nomor kode referensi SA & GL...');
      for (const mKey of candidateMonths) {
        const yymm = mKey.slice(2, 4) + mKey.slice(5, 7);
        seenCounters.add(`SA_${yymm}`);
        seenCounters.add(`GL_${yymm}`);
      }
      const counterIds = Array.from(seenCounters).filter((id) => /^(SA|GL)_\d{4}$/.test(id));
      const existingCounterRefs: DocumentReference[] = [];
      for (let i = 0; i < counterIds.length; i += 25) {
        const chunk = counterIds.slice(i, i + 25);
        try {
          const snaps = await Promise.all(
            chunk.map((id) => getDoc(doc(db, 'recordCounters', id)))
          );
          for (const s of snaps) {
            if (s.exists()) {
              existingCounterRefs.push(s.ref);
            }
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'recordCounters');
        }
      }
      if (existingCounterRefs.length > 0) {
        await deleteRefsInBatches(existingCounterRefs, 'recordCounters');
        countersDeleted = existingCounterRefs.length;
      }

      // 7. Clear any stale legacy local cache in browser
      try {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        // ignore storage access issues
      }

      return {
        workspacesCleared,
        monthlyDocsDeleted,
        savedRecordsDeleted,
        countersDeleted,
        inputLogsDeleted,
      };
    },
    [currentAccount?.role, activeMonth, selectableMonths]
  );

  return {
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
  };
}
