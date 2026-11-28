import {
  FieldPath,
  arrayUnion,
  deleteDoc,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { useCallback } from 'react';
import { OperationType, auth, db, handleFirestoreError } from '../firebase';
import {
  AccountProfile,
  CalendarAssignScope,
  CalendarAssignStatus,
  CalendarEvent,
  CalendarRecurrenceFreq,
  OperationalRoleId,
  OutletAssignment,
} from '../types/outlet';
import { ParsedAssignImportRow } from '../utils/assignImportExport';
import {
  canAccountEditPic,
  formatReferenceCode,
  formatYymmFromIsoDate,
  getAccountPicUpper,
  getPeopleMap,
  isValidCalendarReturnTime,
  isValidCalendarStartTime,
  normalizeCalendarInterval,
  normalizeCalendarRecurrenceFreq,
  normalizeCalendarVisibleTo,
  normalizeCalendarWeekdays,
  normalizeExcludedDates,
  resolveAuthorizedRecordPrefix,
  validateAssignReturnTimeTiming,
} from '../utils/outletLogic';

interface UseCalendarAndRecordsActionsParams {
  currentAccount: AccountProfile | null;
  effectiveRoleId: OperationalRoleId;
  activeOutlets: OutletAssignment[];
  calendarEvents: CalendarEvent[];
}

export function useCalendarAndRecordsActions({
  currentAccount,
  effectiveRoleId,
  activeOutlets,
  calendarEvents,
}: UseCalendarAndRecordsActionsParams) {
  const createCalendarEvent = useCallback(
    async (input: {
      title: string;
      date: string;
      startTime: string;
      assignScope?: CalendarAssignScope;
      assignedDivision?: OperationalRoleId | '';
      assignedPic: string;
      assignedRole: OperationalRoleId;
      assignedEmail?: string;
      assignedOutlet?: string;
      notes: string;
      visibleTo?: OperationalRoleId[];
      repeatFreq?: CalendarRecurrenceFreq;
      repeatInterval?: number;
      repeatUntil?: string;
      repeatWeekdays?: number[];
      excludedDates?: string[];
    }) => {
      const uid = auth.currentUser?.uid;
      const email = (auth.currentUser?.email || currentAccount?.email || '').trim().toLowerCase();
      if (!uid || !email || !currentAccount) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      if (currentAccount.role !== 'admin') {
        throw new Error('Hanya Admin yang dapat membuat assign pada kalender.');
      }
      const cleanTitle = input.title.trim().slice(0, 120);
      if (!cleanTitle) {
        throw new Error('Judul penugasan wajib diisi.');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
        throw new Error('Tanggal penugasan tidak valid.');
      }
      if (!isValidCalendarStartTime(input.startTime)) {
        throw new Error('Jam mulai hanya diperbolehkan antara 08:00 hingga 19:00 (kelipatan 30 menit).');
      }

      const assignScope: CalendarAssignScope =
        input.assignScope === 'division' ? 'division' : 'pic';
      const assignedRole: OperationalRoleId =
        assignScope === 'division'
          ? input.assignedDivision === 'gl' || input.assignedDivision === 'accounting'
            ? input.assignedDivision
            : 'stock_accounting'
          : input.assignedRole === 'gl' || input.assignedRole === 'accounting'
            ? input.assignedRole
            : 'stock_accounting';

      const cleanPic =
        assignScope === 'division'
          ? ''
          : (input.assignedPic || '').replace(/\s+/g, ' ').trim().slice(0, 60).trim();
      if (assignScope === 'pic' && !cleanPic) {
        throw new Error('Pilih PIC tujuan penugasan terlebih dahulu.');
      }
      const cleanPicUpper = assignScope === 'division' ? '' : cleanPic.toUpperCase();
      const cleanEmail =
        assignScope === 'division'
          ? ''
          : (input.assignedEmail || '').trim().toLowerCase().slice(0, 120);
      const assignedDivision: OperationalRoleId | '' =
        assignScope === 'division' ? assignedRole : '';
      const cleanOutlet = (input.assignedOutlet || '').trim().slice(0, 40);
      const visibleTo = normalizeCalendarVisibleTo(
        input.visibleTo && input.visibleTo.length > 0 ? input.visibleTo : [assignedRole]
      );
      const createdByName =
        ((currentAccount.name || '').trim() || email).slice(0, 80).trim() || email.slice(0, 80);

      const eventId = `asg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const evtPath = `calendarEvents/${eventId}`;
      try {
        await setDoc(doc(db, 'calendarEvents', eventId), {
          title: cleanTitle,
          date: input.date,
          startTime: input.startTime,
          visibleTo: visibleTo.length > 0 ? visibleTo : [assignedRole],
          notes: (input.notes || '').trim().slice(0, 500),
          eventType: 'assign',
          assignScope,
          assignedDivision,
          assignedPic: cleanPic,
          assignedPicUpper: cleanPicUpper,
          assignedEmail: cleanEmail,
          assignedRole,
          assignedOutlet: cleanOutlet,
          assignStatus: 'assigned',
          returnTime: '',
          cancelReason: '',
          notificationDismissed: false,
          dismissedBy: [],
          picResponses: {},
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: uid,
          updatedBy: uid,
          createdByEmail: email.slice(0, 120),
          createdByName,
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, evtPath);
      }
      return eventId;
    },
    [currentAccount]
  );

  const updateCalendarEvent = useCallback(
    async (
      eventId: string,
      input: {
        title: string;
        date: string;
        startTime: string;
        assignScope?: CalendarAssignScope;
        assignedDivision?: OperationalRoleId | '';
        assignedPic: string;
        assignedRole: OperationalRoleId;
        assignedEmail?: string;
        assignedOutlet?: string;
        notes: string;
        assignStatus?: CalendarAssignStatus;
        returnTime?: string;
        cancelReason?: string;
        notificationDismissed?: boolean;
        resetDismissedBy?: boolean;
        visibleTo?: OperationalRoleId[];
      }
    ) => {
      const uid = auth.currentUser?.uid;
      if (!uid || !currentAccount) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      if (currentAccount.role !== 'admin') {
        throw new Error('Hanya Admin yang dapat mengubah assign kalender.');
      }
      const cleanTitle = input.title.trim().slice(0, 120);
      if (!cleanTitle) {
        throw new Error('Judul penugasan wajib diisi.');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
        throw new Error('Tanggal penugasan tidak valid.');
      }
      if (!isValidCalendarStartTime(input.startTime)) {
        throw new Error('Jam mulai hanya diperbolehkan antara 08:00 hingga 19:00 (kelipatan 30 menit).');
      }

      const assignScope: CalendarAssignScope =
        input.assignScope === 'division' ? 'division' : 'pic';
      const assignedRole: OperationalRoleId =
        assignScope === 'division'
          ? input.assignedDivision === 'gl' || input.assignedDivision === 'accounting'
            ? input.assignedDivision
            : 'stock_accounting'
          : input.assignedRole === 'gl' || input.assignedRole === 'accounting'
            ? input.assignedRole
            : 'stock_accounting';

      const cleanPic =
        assignScope === 'division'
          ? ''
          : (input.assignedPic || '').replace(/\s+/g, ' ').trim().slice(0, 60).trim();
      if (assignScope === 'pic' && !cleanPic) {
        throw new Error('PIC tujuan penugasan wajib diisi.');
      }
      const cleanPicUpper = assignScope === 'division' ? '' : cleanPic.toUpperCase();
      const cleanEmail =
        assignScope === 'division'
          ? ''
          : (input.assignedEmail || '').trim().toLowerCase().slice(0, 120);
      const assignedDivision: OperationalRoleId | '' =
        assignScope === 'division' ? assignedRole : '';
      const cleanOutlet = (input.assignedOutlet || '').trim().slice(0, 40);
      const assignStatus: CalendarAssignStatus =
        input.assignStatus === 'completed' || input.assignStatus === 'cancelled'
          ? input.assignStatus
          : 'assigned';
      const returnTime = (input.returnTime || '').trim();
      if (!isValidCalendarReturnTime(returnTime)) {
        throw new Error('Format jam pulang harus HH:MM (contoh 15:30).');
      }
      const visibleTo = normalizeCalendarVisibleTo(
        input.visibleTo && input.visibleTo.length > 0 ? input.visibleTo : [assignedRole]
      );

      const payload: Record<string, unknown> = {
        title: cleanTitle,
        date: input.date,
        startTime: input.startTime,
        visibleTo: visibleTo.length > 0 ? visibleTo : [assignedRole],
        notes: (input.notes || '').trim().slice(0, 500),
        eventType: 'assign',
        assignScope,
        assignedDivision,
        assignedPic: cleanPic,
        assignedPicUpper: cleanPicUpper,
        assignedEmail: cleanEmail,
        assignedRole,
        assignedOutlet: cleanOutlet,
        assignStatus,
        returnTime: assignStatus === 'cancelled' ? '' : returnTime,
        cancelReason:
          assignStatus === 'cancelled'
            ? (input.cancelReason || '').trim().slice(0, 200)
            : '',
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      };
      if (typeof input.notificationDismissed === 'boolean') {
        payload.notificationDismissed = input.notificationDismissed;
      }
      if (input.resetDismissedBy) {
        payload.dismissedBy = [];
      }

      const evtPath = `calendarEvents/${eventId}`;
      try {
        await updateDoc(doc(db, 'calendarEvents', eventId), payload);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, evtPath);
      }
    },
    [currentAccount]
  );

  const deleteCalendarEvent = useCallback(
    async (eventId: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid || !currentAccount) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      if (currentAccount.role !== 'admin') {
        throw new Error('Hanya Admin yang dapat menghapus assign kalender.');
      }
      const evtPath = `calendarEvents/${eventId}`;
      try {
        await deleteDoc(doc(db, 'calendarEvents', eventId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, evtPath);
      }
    },
    [currentAccount]
  );

  const bulkCreateAssignEvents = useCallback(
    async (rows: ParsedAssignImportRow[]): Promise<number> => {
      const uid = auth.currentUser?.uid;
      const email = (auth.currentUser?.email || currentAccount?.email || '').trim().toLowerCase();
      if (!uid || !email || !currentAccount) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      if (currentAccount.role !== 'admin') {
        throw new Error('Hanya Admin yang dapat mengunggah data assign.');
      }
      if (!rows.length) return 0;

      const createdByName =
        ((currentAccount.name || '').trim() || email).slice(0, 80).trim() || email.slice(0, 80);
      const createdByEmail = email.slice(0, 120);
      const CHUNK_SIZE = 400;
      let totalCreated = 0;

      try {
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          chunk.forEach((row, idx) => {
            const eventId = `asg_${Date.now()}_${i + idx}_${Math.random().toString(36).slice(2, 6)}`;
            const isDivision = row.assignScope === 'division';
            const cleanPic = isDivision
              ? ''
              : row.assignedPic.replace(/\s+/g, ' ').trim().slice(0, 60).trim();
            batch.set(doc(db, 'calendarEvents', eventId), {
              title: row.title.trim().slice(0, 120),
              date: row.date,
              startTime: row.startTime,
              visibleTo: [row.assignedRole],
              notes: (row.notes || '').trim().slice(0, 500),
              eventType: 'assign',
              assignScope: isDivision ? 'division' : 'pic',
              assignedDivision: isDivision ? row.assignedRole : '',
              assignedPic: cleanPic,
              assignedPicUpper: isDivision ? '' : cleanPic.toUpperCase(),
              assignedEmail: isDivision
                ? ''
                : (row.assignedEmail || '').trim().toLowerCase().slice(0, 120),
              assignedRole: row.assignedRole,
              assignedOutlet: (row.assignedOutlet || '').trim().slice(0, 40),
              assignStatus: 'assigned',
              returnTime: '',
              cancelReason: '',
              notificationDismissed: false,
              dismissedBy: [],
              picResponses: {},
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              createdBy: uid,
              updatedBy: uid,
              createdByEmail,
              createdByName,
            });
          });
          await batch.commit();
          totalCreated += chunk.length;
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'calendarEvents');
      }
      return totalCreated;
    },
    [currentAccount]
  );

  const updateAssignResponse = useCallback(
    async (
      eventId: string,
      input: {
        assignStatus: CalendarAssignStatus;
        returnTime?: string;
        cancelReason?: string;
        notificationDismissed?: boolean;
        targetPic?: string;
        forceGlobal?: boolean;
      }
    ) => {
      const uid = auth.currentUser?.uid;
      if (!uid || !currentAccount) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      const cleanId = eventId.trim();
      if (!cleanId) {
        throw new Error('ID assign tidak valid.');
      }
      const cleanReturnTime = (input.returnTime || '').trim();
      if (input.assignStatus === 'completed') {
        if (!cleanReturnTime || !isValidCalendarReturnTime(cleanReturnTime)) {
          throw new Error('Pilih jam pulang yang valid antara 08:00 – 19:00 (kelipatan 30 menit).');
        }
      } else if (cleanReturnTime && !isValidCalendarReturnTime(cleanReturnTime)) {
        throw new Error('Format jam pulang harus antara 08:00 – 19:00 (kelipatan 30 menit).');
      }

      const evt = calendarEvents.find((e) => e.id === cleanId);
      const isDivisionAssign = evt?.assignScope === 'division';
      if (evt && currentAccount.role !== 'admin') {
        const myPic = (input.targetPic || getAccountPicUpper(currentAccount)).trim().toUpperCase();
        const prevStatus = isDivisionAssign
          ? (myPic ? evt.picResponses?.[myPic]?.status : undefined) || evt.assignStatus
          : evt.assignStatus;
        if (prevStatus === 'completed' || prevStatus === 'cancelled') {
          throw new Error(
            'Jam pulang atau status assign sudah disimpan dan hanya dapat diubah oleh Admin.'
          );
        }
      }
      if (input.assignStatus === 'completed' && evt) {
        const timingErr = validateAssignReturnTimeTiming({
          assignDate: evt.date,
          startTime: evt.startTime,
          returnTime: cleanReturnTime,
          isAdmin: currentAccount.role === 'admin',
        });
        if (timingErr) {
          throw new Error(timingErr);
        }
      }
      const evtPath = `calendarEvents/${cleanId}`;
      const cleanCancelReason =
        input.assignStatus === 'cancelled'
          ? (input.cancelReason || '').trim().slice(0, 200)
          : '';
      const effectiveReturnTime = input.assignStatus === 'cancelled' ? '' : cleanReturnTime;

      try {
        if (isDivisionAssign) {
          const isAdminGlobal =
            currentAccount.role === 'admin' && (input.forceGlobal || !input.targetPic);
          if (isAdminGlobal) {
            const globalPayload: Record<string, unknown> = {
              assignStatus: input.assignStatus,
              returnTime: effectiveReturnTime,
              cancelReason: cleanCancelReason,
              notificationDismissed: input.notificationDismissed ?? false,
              updatedAt: serverTimestamp(),
              updatedBy: uid,
            };
            if (input.assignStatus === 'assigned' && input.forceGlobal) {
              globalPayload.dismissedBy = [];
              globalPayload.picResponses = {};
            }
            await updateDoc(doc(db, 'calendarEvents', cleanId), globalPayload);
          } else {
            const picKey = (input.targetPic || getAccountPicUpper(currentAccount))
              .trim()
              .toUpperCase();
            if (!picKey) {
              throw new Error('Nama PIC pada akun Anda belum diatur.');
            }
            const entry = {
              status: input.assignStatus,
              returnTime: effectiveReturnTime,
              cancelReason: cleanCancelReason,
            };
            await updateDoc(
              doc(db, 'calendarEvents', cleanId),
              new FieldPath('picResponses', picKey),
              entry,
              'dismissedBy',
              arrayUnion(uid),
              'updatedAt',
              serverTimestamp(),
              'updatedBy',
              uid
            );
          }
          return;
        }

        const payload: Record<string, unknown> = {
          assignStatus: input.assignStatus,
          returnTime: effectiveReturnTime,
          cancelReason: cleanCancelReason,
          notificationDismissed: input.notificationDismissed ?? true,
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        };
        if (input.notificationDismissed === false) {
          payload.dismissedBy = [];
        }
        await updateDoc(doc(db, 'calendarEvents', cleanId), payload);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, evtPath);
      }
    },
    [currentAccount, calendarEvents]
  );

  const dismissAssignNotification = useCallback(
    async (eventId: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid || !currentAccount) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      const cleanId = eventId.trim();
      if (!cleanId) return;
      const evt = calendarEvents.find((e) => e.id === cleanId);
      const isDivisionAssign = evt?.assignScope === 'division';
      const evtPath = `calendarEvents/${cleanId}`;
      try {
        if (isDivisionAssign) {
          await updateDoc(doc(db, 'calendarEvents', cleanId), {
            dismissedBy: arrayUnion(uid),
            updatedAt: serverTimestamp(),
            updatedBy: uid,
          });
        } else {
          await updateDoc(doc(db, 'calendarEvents', cleanId), {
            notificationDismissed: true,
            updatedAt: serverTimestamp(),
            updatedBy: uid,
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, evtPath);
      }
    },
    [currentAccount, calendarEvents]
  );

  const createPersonalReminder = useCallback(
    async (input: {
      title: string;
      date: string;
      startTime: string;
      notes: string;
      repeatFreq?: CalendarRecurrenceFreq;
      repeatInterval?: number;
      repeatUntil?: string;
      repeatWeekdays?: number[];
      excludedDates?: string[];
    }) => {
      const uid = auth.currentUser?.uid;
      const email = (auth.currentUser?.email || currentAccount?.email || '').trim().toLowerCase();
      if (!uid || !email || !currentAccount) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      const cleanTitle = input.title.trim().slice(0, 120);
      if (!cleanTitle) {
        throw new Error('Judul reminder wajib diisi.');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
        throw new Error('Tanggal reminder tidak valid.');
      }
      if (!isValidCalendarStartTime(input.startTime)) {
        throw new Error('Jam reminder hanya diperbolehkan antara 08:00 hingga 19:00 (kelipatan 30 menit).');
      }
      const repeatFreq = normalizeCalendarRecurrenceFreq(input.repeatFreq);
      const repeatInterval = normalizeCalendarInterval(input.repeatInterval);
      const rawUntil = (input.repeatUntil || '').trim();
      if (rawUntil && !/^\d{4}-\d{2}-\d{2}$/.test(rawUntil)) {
        throw new Error('Tanggal akhir pengulangan tidak valid.');
      }
      if (rawUntil && rawUntil < input.date) {
        throw new Error('Tanggal akhir pengulangan tidak boleh lebih awal dari tanggal reminder.');
      }
      const repeatUntil = repeatFreq === 'none' ? '' : rawUntil;
      const repeatWeekdays =
        repeatFreq === 'weekly' ? normalizeCalendarWeekdays(input.repeatWeekdays) : [];
      const excludedDates = normalizeExcludedDates(input.excludedDates);
      const createdByName =
        ((currentAccount.name || '').trim() || email).slice(0, 80).trim() || email.slice(0, 80);

      const remId = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const remPath = `personalReminders/${remId}`;
      try {
        await setDoc(doc(db, 'personalReminders', remId), {
          title: cleanTitle,
          date: input.date,
          startTime: input.startTime,
          notes: (input.notes || '').trim().slice(0, 500),
          repeatFreq,
          repeatInterval,
          repeatUntil,
          repeatWeekdays,
          excludedDates,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: uid,
          updatedBy: uid,
          createdByEmail: email.slice(0, 120),
          createdByName,
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, remPath);
      }
      return remId;
    },
    [currentAccount]
  );

  const updatePersonalReminder = useCallback(
    async (
      reminderId: string,
      input: {
        title: string;
        date: string;
        startTime: string;
        notes: string;
        repeatFreq?: CalendarRecurrenceFreq;
        repeatInterval?: number;
        repeatUntil?: string;
        repeatWeekdays?: number[];
        excludedDates?: string[];
      }
    ) => {
      const uid = auth.currentUser?.uid;
      if (!uid || !currentAccount) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      const cleanTitle = input.title.trim().slice(0, 120);
      if (!cleanTitle) {
        throw new Error('Judul reminder wajib diisi.');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
        throw new Error('Tanggal reminder tidak valid.');
      }
      if (!isValidCalendarStartTime(input.startTime)) {
        throw new Error('Jam reminder hanya diperbolehkan antara 08:00 hingga 19:00 (kelipatan 30 menit).');
      }
      const repeatFreq = normalizeCalendarRecurrenceFreq(input.repeatFreq);
      const repeatInterval = normalizeCalendarInterval(input.repeatInterval);
      const rawUntil = (input.repeatUntil || '').trim();
      if (rawUntil && !/^\d{4}-\d{2}-\d{2}$/.test(rawUntil)) {
        throw new Error('Tanggal akhir pengulangan tidak valid.');
      }
      if (rawUntil && rawUntil < input.date) {
        throw new Error('Tanggal akhir pengulangan tidak boleh lebih awal dari tanggal reminder.');
      }
      const repeatUntil = repeatFreq === 'none' ? '' : rawUntil;
      const repeatWeekdays =
        repeatFreq === 'weekly' ? normalizeCalendarWeekdays(input.repeatWeekdays) : [];
      const excludedDates = normalizeExcludedDates(input.excludedDates);

      const remPath = `personalReminders/${reminderId}`;
      try {
        await updateDoc(doc(db, 'personalReminders', reminderId), {
          title: cleanTitle,
          date: input.date,
          startTime: input.startTime,
          notes: (input.notes || '').trim().slice(0, 500),
          repeatFreq,
          repeatInterval,
          repeatUntil,
          repeatWeekdays,
          excludedDates,
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, remPath);
      }
    },
    [currentAccount]
  );

  const deletePersonalReminder = useCallback(
    async (reminderId: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid || !currentAccount) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      const remPath = `personalReminders/${reminderId}`;
      try {
        await deleteDoc(doc(db, 'personalReminders', reminderId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, remPath);
      }
    },
    [currentAccount]
  );

  const createSavedRecord = useCallback(
    async (input: {
      date: string;
      pic: string;
      outlet: string;
      summary?: string;
      notes?: string;
    }) => {
      const uid = auth.currentUser?.uid;
      const email = (currentAccount?.email || auth.currentUser?.email || '').trim().toLowerCase();
      if (!uid || !email || !currentAccount) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
        throw new Error('Tanggal wajib diisi dengan format yang valid.');
      }
      const cleanPic = input.pic.trim().slice(0, 60);
      const cleanOutlet = input.outlet.trim().slice(0, 40);
      if (!cleanPic) {
        throw new Error('Nama PIC wajib diisi.');
      }
      if (!cleanOutlet) {
        throw new Error('Outlet wajib dipilih dari daftar.');
      }
      const canManageAny =
        currentAccount.role === 'admin' || currentAccount.role === 'accounting';
      if (!canManageAny) {
        const isOwnPic = canAccountEditPic(currentAccount, activeOutlets, cleanPic);
        const picOutlets = getPeopleMap(activeOutlets)[cleanPic] || [];
        if (!isOwnPic || !picOutlets.includes(cleanOutlet)) {
          throw new Error(
            'Anda hanya dapat menyimpan data update daily untuk outlet dan tugas milik Anda sendiri.'
          );
        }
      }

      const { prefix, department } = resolveAuthorizedRecordPrefix(currentAccount, effectiveRoleId);
      const yymm = formatYymmFromIsoDate(input.date);
      const counterId = `${prefix}_${yymm}`;
      const counterRef = doc(db, 'recordCounters', counterId);

      let generatedRefCode = '';
      const path = `savedRecords/${prefix}${yymm}XXXX`;
      try {
        await runTransaction(db, async (tx) => {
          const counterSnap = await tx.get(counterRef);
          const nextSeq = counterSnap.exists()
            ? Number(counterSnap.data().seq || 0) + 1
            : 1;
          generatedRefCode = formatReferenceCode(prefix, yymm, nextSeq);
          const recordRef = doc(db, 'savedRecords', generatedRefCode);

          if (!counterSnap.exists()) {
            tx.set(counterRef, {
              prefix,
              yymm,
              seq: nextSeq,
              updatedAt: serverTimestamp(),
              updatedBy: uid,
            });
          } else {
            tx.update(counterRef, {
              seq: nextSeq,
              updatedAt: serverTimestamp(),
              updatedBy: uid,
            });
          }

          tx.set(recordRef, {
            refCode: generatedRefCode,
            prefix,
            yymm,
            department,
            date: input.date,
            pic: cleanPic,
            outlet: cleanOutlet,
            summary: (input.summary || '').trim().slice(0, 200),
            notes: (input.notes || '').trim().slice(0, 1000),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: uid,
            updatedBy: uid,
            createdByEmail: email.slice(0, 120),
            createdByName: (currentAccount.name || email).slice(0, 80),
          });
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }

      return generatedRefCode;
    },
    [currentAccount, effectiveRoleId, activeOutlets]
  );

  const updateSavedRecord = useCallback(
    async (
      recordId: string,
      input: {
        date: string;
        pic: string;
        outlet: string;
        summary?: string;
        notes?: string;
      }
    ) => {
      const uid = auth.currentUser?.uid;
      if (!uid || !currentAccount) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
        throw new Error('Tanggal wajib diisi dengan format yang valid.');
      }
      const cleanPic = input.pic.trim().slice(0, 60);
      const cleanOutlet = input.outlet.trim().slice(0, 40);
      if (!cleanPic) {
        throw new Error('Nama PIC wajib diisi.');
      }
      if (!cleanOutlet) {
        throw new Error('Outlet wajib dipilih dari daftar.');
      }
      const canManageAny =
        currentAccount.role === 'admin' || currentAccount.role === 'accounting';
      if (!canManageAny) {
        const isOwnPic = canAccountEditPic(currentAccount, activeOutlets, cleanPic);
        const picOutlets = getPeopleMap(activeOutlets)[cleanPic] || [];
        if (!isOwnPic || !picOutlets.includes(cleanOutlet)) {
          throw new Error(
            'Anda hanya dapat memperbarui data update daily untuk outlet dan tugas milik Anda sendiri.'
          );
        }
      }

      const recPath = `savedRecords/${recordId}`;
      try {
        await updateDoc(doc(db, 'savedRecords', recordId), {
          date: input.date,
          pic: cleanPic,
          outlet: cleanOutlet,
          summary: (input.summary || '').trim().slice(0, 200),
          notes: (input.notes || '').trim().slice(0, 1000),
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, recPath);
      }
    },
    [currentAccount, activeOutlets]
  );

  const deleteSavedRecord = useCallback(
    async (recordId: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid || !currentAccount) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      if (currentAccount.role !== 'admin' && currentAccount.role !== 'accounting') {
        throw new Error('Hanya Accounting atau Admin yang dapat menghapus data tersimpan.');
      }
      const recPath = `savedRecords/${recordId}`;
      try {
        await deleteDoc(doc(db, 'savedRecords', recordId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, recPath);
      }
    },
    [currentAccount]
  );

  const addCalendarBanner = useCallback(
    async (input: {
      imageDataUrl: string;
      caption?: string;
      fileName?: string;
      sortOrder?: number;
    }) => {
      const uid = auth.currentUser?.uid;
      if (!uid || !currentAccount) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      if (currentAccount.role !== 'admin') {
        throw new Error('Hanya Admin yang dapat menambahkan gambar kalender.');
      }
      const dataUrl = (input.imageDataUrl || '').trim();
      if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(dataUrl)) {
        throw new Error('Format gambar tidak didukung. Gunakan PNG, JPG, WEBP, atau GIF.');
      }
      if (dataUrl.length > 750000) {
        throw new Error('Ukuran gambar masih terlalu besar setelah kompresi. Pilih gambar yang lebih kecil.');
      }
      const sortOrder =
        typeof input.sortOrder === 'number' && Number.isFinite(input.sortOrder)
          ? Math.max(0, Math.min(100000, Math.floor(input.sortOrder)))
          : 0;
      const mediaId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const path = `calendarMedia/${mediaId}`;
      try {
        await setDoc(doc(db, 'calendarMedia', mediaId), {
          imageDataUrl: dataUrl,
          caption: (input.caption || '').trim().slice(0, 200),
          fileName: (input.fileName || 'kalender-gambar.jpg').trim().slice(0, 120),
          sortOrder,
          updatedAt: serverTimestamp(),
          updatedBy: uid,
          updatedByName: (currentAccount.name || currentAccount.email || 'Admin').slice(0, 80),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
      return mediaId;
    },
    [currentAccount]
  );

  const updateCalendarBanner = useCallback(
    async (
      mediaId: string,
      input: {
        imageDataUrl: string;
        caption?: string;
        fileName?: string;
        sortOrder?: number;
      }
    ) => {
      const uid = auth.currentUser?.uid;
      if (!uid || !currentAccount) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      if (currentAccount.role !== 'admin') {
        throw new Error('Hanya Admin yang dapat mengubah gambar kalender.');
      }
      const cleanId = mediaId.trim();
      if (!cleanId) {
        throw new Error('ID gambar tidak valid.');
      }
      const dataUrl = (input.imageDataUrl || '').trim();
      if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(dataUrl)) {
        throw new Error('Format gambar tidak didukung. Gunakan PNG, JPG, WEBP, atau GIF.');
      }
      if (dataUrl.length > 750000) {
        throw new Error('Ukuran gambar masih terlalu besar setelah kompresi. Pilih gambar yang lebih kecil.');
      }
      const payload: Record<string, unknown> = {
        imageDataUrl: dataUrl,
        caption: (input.caption || '').trim().slice(0, 200),
        fileName: (input.fileName || 'kalender-gambar.jpg').trim().slice(0, 120),
        updatedAt: serverTimestamp(),
        updatedBy: uid,
        updatedByName: (currentAccount.name || currentAccount.email || 'Admin').slice(0, 80),
      };
      if (typeof input.sortOrder === 'number' && Number.isFinite(input.sortOrder)) {
        payload.sortOrder = Math.max(0, Math.min(100000, Math.floor(input.sortOrder)));
      }
      const path = `calendarMedia/${cleanId}`;
      try {
        await updateDoc(doc(db, 'calendarMedia', cleanId), payload);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [currentAccount]
  );

  const deleteCalendarBanner = useCallback(
    async (mediaId: string) => {
      const uid = auth.currentUser?.uid;
      if (!uid || !currentAccount) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      if (currentAccount.role !== 'admin') {
        throw new Error('Hanya Admin yang dapat menghapus gambar kalender.');
      }
      const cleanId = mediaId.trim();
      if (!cleanId) return;
      const path = `calendarMedia/${cleanId}`;
      try {
        await deleteDoc(doc(db, 'calendarMedia', cleanId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [currentAccount]
  );

  return {
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
