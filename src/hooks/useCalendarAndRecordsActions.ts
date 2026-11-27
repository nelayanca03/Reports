import {
  deleteDoc,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { useCallback } from 'react';
import { OperationType, auth, db, handleFirestoreError } from '../firebase';
import {
  AccountProfile,
  CalendarRecurrenceFreq,
  OperationalRoleId,
  OutletAssignment,
} from '../types/outlet';
import {
  canAccountEditPic,
  formatReferenceCode,
  formatYymmFromIsoDate,
  getPeopleMap,
  isValidCalendarStartTime,
  normalizeCalendarInterval,
  normalizeCalendarRecurrenceFreq,
  normalizeCalendarVisibleTo,
  normalizeCalendarWeekdays,
  normalizeExcludedDates,
  resolveAuthorizedRecordPrefix,
} from '../utils/outletLogic';

interface UseCalendarAndRecordsActionsParams {
  currentAccount: AccountProfile | null;
  effectiveRoleId: OperationalRoleId;
  activeOutlets: OutletAssignment[];
}

export function useCalendarAndRecordsActions({
  currentAccount,
  effectiveRoleId,
  activeOutlets,
}: UseCalendarAndRecordsActionsParams) {
  const createCalendarEvent = useCallback(
    async (input: {
      title: string;
      date: string;
      startTime: string;
      visibleTo: OperationalRoleId[];
      notes: string;
      repeatFreq?: CalendarRecurrenceFreq;
      repeatInterval?: number;
      repeatUntil?: string;
      repeatWeekdays?: number[];
      excludedDates?: string[];
    }) => {
      const uid = auth.currentUser?.uid;
      const email = (currentAccount?.email || auth.currentUser?.email || '').trim().toLowerCase();
      if (!uid || !email || !currentAccount) {
        throw new Error('Sesi login tidak aktif. Silakan masuk ulang.');
      }
      if (currentAccount.role !== 'admin' && currentAccount.role !== 'accounting') {
        throw new Error('Hanya Accounting atau Admin yang dapat membuat event kalender.');
      }
      const cleanTitle = input.title.trim().slice(0, 120);
      if (!cleanTitle) {
        throw new Error('Judul event wajib diisi.');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
        throw new Error('Tanggal event tidak valid.');
      }
      if (!isValidCalendarStartTime(input.startTime)) {
        throw new Error('Jam mulai hanya diperbolehkan antara 08:00 hingga 19:00 (kelipatan 30 menit).');
      }
      const visibleTo = normalizeCalendarVisibleTo(input.visibleTo);
      if (visibleTo.length === 0) {
        throw new Error('Pilih minimal satu departemen penerima tampilan event.');
      }
      const repeatFreq = normalizeCalendarRecurrenceFreq(input.repeatFreq);
      const repeatInterval = normalizeCalendarInterval(input.repeatInterval);
      const rawUntil = (input.repeatUntil || '').trim();
      if (rawUntil && !/^\d{4}-\d{2}-\d{2}$/.test(rawUntil)) {
        throw new Error('Tanggal akhir pengulangan tidak valid.');
      }
      if (rawUntil && rawUntil < input.date) {
        throw new Error('Tanggal akhir pengulangan tidak boleh lebih awal dari tanggal event.');
      }
      const repeatUntil = repeatFreq === 'none' ? '' : rawUntil;
      const repeatWeekdays =
        repeatFreq === 'weekly' ? normalizeCalendarWeekdays(input.repeatWeekdays) : [];
      const excludedDates = normalizeExcludedDates(input.excludedDates);

      const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const evtPath = `calendarEvents/${eventId}`;
      try {
        await setDoc(doc(db, 'calendarEvents', eventId), {
          title: cleanTitle,
          date: input.date,
          startTime: input.startTime,
          visibleTo,
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
          createdByName: (currentAccount.name || email).slice(0, 80),
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
        visibleTo: OperationalRoleId[];
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
      if (currentAccount.role !== 'admin' && currentAccount.role !== 'accounting') {
        throw new Error('Hanya Accounting atau Admin yang dapat mengubah event kalender.');
      }
      const cleanTitle = input.title.trim().slice(0, 120);
      if (!cleanTitle) {
        throw new Error('Judul event wajib diisi.');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
        throw new Error('Tanggal event tidak valid.');
      }
      if (!isValidCalendarStartTime(input.startTime)) {
        throw new Error('Jam mulai hanya diperbolehkan antara 08:00 hingga 19:00 (kelipatan 30 menit).');
      }
      const visibleTo = normalizeCalendarVisibleTo(input.visibleTo);
      if (visibleTo.length === 0) {
        throw new Error('Pilih minimal satu departemen penerima tampilan event.');
      }
      const repeatFreq = normalizeCalendarRecurrenceFreq(input.repeatFreq);
      const repeatInterval = normalizeCalendarInterval(input.repeatInterval);
      const rawUntil = (input.repeatUntil || '').trim();
      if (rawUntil && !/^\d{4}-\d{2}-\d{2}$/.test(rawUntil)) {
        throw new Error('Tanggal akhir pengulangan tidak valid.');
      }
      if (rawUntil && rawUntil < input.date) {
        throw new Error('Tanggal akhir pengulangan tidak boleh lebih awal dari tanggal event.');
      }
      const repeatUntil = repeatFreq === 'none' ? '' : rawUntil;
      const repeatWeekdays =
        repeatFreq === 'weekly' ? normalizeCalendarWeekdays(input.repeatWeekdays) : [];
      const excludedDates = normalizeExcludedDates(input.excludedDates);

      const evtPath = `calendarEvents/${eventId}`;
      try {
        await updateDoc(doc(db, 'calendarEvents', eventId), {
          title: cleanTitle,
          date: input.date,
          startTime: input.startTime,
          visibleTo,
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
      if (currentAccount.role !== 'admin' && currentAccount.role !== 'accounting') {
        throw new Error('Hanya Accounting atau Admin yang dapat menghapus event kalender.');
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
    addCalendarBanner,
    updateCalendarBanner,
    deleteCalendarBanner,
    createSavedRecord,
    updateSavedRecord,
    deleteSavedRecord,
  };
}
