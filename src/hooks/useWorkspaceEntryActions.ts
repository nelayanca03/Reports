import {
  FieldPath,
  deleteField,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { useCallback } from 'react';
import { OperationType, auth, db, handleFirestoreError } from '../firebase';
import {
  AccountProfile,
  EntryItem,
  InputLogItemAction,
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
      const email = (currentAccount?.email || auth.currentUser?.email || '').trim().toLowerCase();
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
        const nowIso = new Date().toISOString();
        const nextEntry: EntryItem = {
          d: existing?.d || fallbackDate,
          n: (existing?.n || '').slice(0, 100),
          ts: nowIso,
          ...(isAdminAccount ? { byAdmin: true } : {}),
          [field]: safeValue,
        };
        const label = taskDef?.shortLabel || taskDef?.label || taskKey;
        const action: InputLogItemAction =
          existing && (existing.d || existing.n) ? 'edit' : 'set';
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

          if (email && currentAccount) {
            const logId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            tx.set(doc(db, 'inputLogs', logId), {
              uid,
              userEmail: email.slice(0, 120),
              userName: (currentAccount.name || email).slice(0, 80),
              userRole: currentAccount.role,
              roleId: effectiveRoleId,
              roleLabel: (activeConfig.label || effectiveRoleId).slice(0, 60),
              actionType: 'input_harian',
              pic: outletOwner.slice(0, 60),
              outlet: outlet.slice(0, 120),
              day: day.slice(0, 10),
              details: `${label}: ${nextEntry.d || '-'}${nextEntry.n ? ` (${nextEntry.n})` : ''}`.slice(
                0,
                600
              ),
              itemCount: 1,
              clientTs: nowIso.slice(0, 40),
              taskKey: taskKey.slice(0, 40),
              prevDate: (existing?.d || '').slice(0, 20),
              newDate: (nextEntry.d || '').slice(0, 20),
              prevNote: (existing?.n || '').slice(0, 100),
              newNote: (nextEntry.n || '').slice(0, 100),
              action,
              createdAt: serverTimestamp(),
            });
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
      activeConfig.label,
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

      const assignedPic =
        activeConfig.outlets.find((o) => o.code === outlet)?.person || '';
      const nowIso = new Date().toISOString();
      const perItemLogs = entries.map(([taskKey, item]) => {
        const taskDef = activeConfig.tasks.find((t) => t.key === taskKey);
        const label = taskDef?.shortLabel || taskDef?.label || taskKey;
        const ownPrev = workspaceData.ent[outlet]?.[`${day}|${taskKey}`];
        const prevDate = (ownPrev?.d || '').slice(0, 20);
        const prevNote = (ownPrev?.n || '').slice(0, 100);
        const cleanDate = (item.d || '').trim().slice(0, 20);
        const cleanNote = (item.n || '').trim().slice(0, 100);
        const isCleared = Boolean(item.cleared || (!cleanDate && !cleanNote));
        const action: InputLogItemAction = isCleared
          ? 'clear'
          : ownPrev && (ownPrev.d || ownPrev.n)
            ? 'edit'
            : 'set';

        let itemDetail: string;
        if (isCleared) {
          itemDetail = `${label}: Dikosongkan`;
        } else {
          const taskInputType = getTaskInputType(taskDef);
          const datePart = cleanDate
            ? taskInputType === 'month'
              ? fmtMonth(cleanDate)
              : taskInputType === 'week'
                ? fmtWeek(cleanDate)
                : fmtDateLong(cleanDate)
            : '-';
          itemDetail = cleanNote ? `${label}: ${datePart} (${cleanNote})` : `${label}: ${datePart}`;
        }

        return {
          actionType: 'input_harian' as const,
          pic: assignedPic,
          outlet,
          day,
          details: itemDetail,
          itemCount: 1,
          clientTs: nowIso,
          taskKey,
          prevDate,
          newDate: isCleared ? '' : cleanDate,
          prevNote,
          newNote: isCleared ? '' : cleanNote,
          action,
        };
      });

      const docId = `${effectiveRoleId}_${monthKey}`;
      const path = `roleMonthlyWorkspaces/${docId}`;
      const wsRef = doc(db, 'roleMonthlyWorkspaces', docId);
      const email = (currentAccount?.email || auth.currentUser?.email || '').trim().toLowerCase();
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

          if (email && currentAccount) {
            const baseTs = Date.now();
            perItemLogs.forEach((params, idx) => {
              const logId = `${baseTs}_${idx}_${Math.random().toString(36).slice(2, 8)}`;
              tx.set(doc(db, 'inputLogs', logId), {
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
                ...(params.taskKey !== undefined ? { taskKey: params.taskKey.slice(0, 40) } : {}),
                ...(params.prevDate !== undefined ? { prevDate: params.prevDate.slice(0, 20) } : {}),
                ...(params.newDate !== undefined ? { newDate: params.newDate.slice(0, 20) } : {}),
                ...(params.prevNote !== undefined ? { prevNote: params.prevNote.slice(0, 100) } : {}),
                ...(params.newNote !== undefined ? { newNote: params.newNote.slice(0, 100) } : {}),
                ...(params.action !== undefined ? { action: params.action } : {}),
                createdAt: serverTimestamp(),
              });
            });
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
      activeConfig.label,
      activeConfig.tasks,
      activeConfig.outlets,
      days,
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

      const docId = `${effectiveRoleId}_${monthKey}`;
      const path = `roleMonthlyWorkspaces/${docId}`;
      const wsRef = doc(db, 'roleMonthlyWorkspaces', docId);
      const nowIso = new Date().toISOString();
      const key = `${person}|${day}`;
      const email = (currentAccount?.email || auth.currentUser?.email || '').trim().toLowerCase();

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

          if (email && currentAccount) {
            const logId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            tx.set(doc(db, 'inputLogs', logId), {
              uid,
              userEmail: email.slice(0, 120),
              userName: (currentAccount.name || email).slice(0, 80),
              userRole: currentAccount.role,
              roleId: effectiveRoleId,
              roleLabel: (activeConfig.label || effectiveRoleId).slice(0, 60),
              actionType: 'kunjungan',
              pic: person.slice(0, 60),
              outlet: (uniqueOutlets.join(', ') || '-').slice(0, 120),
              day: day.slice(0, 10),
              details: visitSummary.slice(0, 600),
              itemCount: normalizedVisit.ok
                ? Math.max(1, Math.min(50, (normalizedVisit.entries || []).length))
                : 1,
              clientTs: nowIso.slice(0, 40),
              createdAt: serverTimestamp(),
            });
          }
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [currentAccount, activeConfig.label, activeConfig.outlets, effectiveRoleId, canAccessMonthForWrite]
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
