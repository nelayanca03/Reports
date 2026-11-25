import {
  FieldPath,
  deleteField,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { useCallback } from 'react';
import { OperationType, auth, db, handleFirestoreError } from '../firebase';
import {
  AccountProfile,
  EntryItem,
  InputLogActionType,
  OperationalRoleId,
  OutletStoreState,
  RoleConfig,
  VisitItem,
} from '../types/outlet';
import {
  canAccountEditPic,
  canEditOutletDay,
  currentMonthKey,
  fmtDateLong,
  fmtMonth,
  fmtWeek,
  getEntry,
  getTaskInputType,
  getVisitEntries,
  isSunday,
  todayIso,
  weekStartIso,
} from '../utils/outletLogic';

interface UseWorkspaceEntryActionsParams {
  currentAccount: AccountProfile | null;
  effectiveRoleId: OperationalRoleId;
  isAdminAccount: boolean;
  activeConfig: RoleConfig;
  workspaceData: OutletStoreState;
  days: string[];
  canAccessMonthForWrite: (monthKey: string) => boolean;
}

export function useWorkspaceEntryActions({
  currentAccount,
  effectiveRoleId,
  isAdminAccount,
  activeConfig,
  workspaceData,
  days,
  canAccessMonthForWrite,
}: UseWorkspaceEntryActionsParams) {
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
          'Akses ditolak: Anda hanya dapat mengubah data untuk outlet milik PIC Anda sendiri.'
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
        new Set((normalizedVisit.entries || []).map((e) => e.outlet).filter(Boolean))
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

  return {
    updateEntry,
    saveOutletDayEntries,
    clearEntryForDay,
    saveVisitDay,
    updateVisit,
  };
}
