import { CheckCircle2, ImageDown, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import {
  AccountProfile,
  OperationalRoleId,
  OutletStoreState,
  RoleConfig,
  SavedRecord,
} from '../types/outlet';
import {
  calcTask,
  canAccountEditPic,
  canEditOutletDay,
  fmtDate,
  fmtDateLong,
  fmtMonth,
  fmtWeek,
  getPeopleMap,
  getPersonList,
  getTaskInputType,
  isOutletDayFilled,
  isSunday,
  nearestWorkingDay,
  resolveAccountPic,
  resolveAuthorizedRecordPrefix,
  todayIso,
  yesterdayIso,
} from '../utils/outletLogic';
import { ExportResultPhotoModal } from './ExportResultPhotoModal';
import { SavedRecordsSection } from './SavedRecordsSection';
import { InputHarianDailyModal } from './inputHarian/InputHarianDailyModal';

interface DraftEntry {
  d: string;
  n: string;
  cleared?: boolean;
}

interface InputHarianViewProps {
  account: AccountProfile;
  currentUserUid?: string;
  activeRoleId: OperationalRoleId;
  config: RoleConfig;
  roleConfigs: Record<OperationalRoleId, RoleConfig>;
  store: OutletStoreState;
  savedRecords: SavedRecord[];
  days: string[];
  isAdmin: boolean;
  selectedPerson: string;
  selectedOutlet: string;
  selectedDay: string;
  jumpTrigger?: number;
  onChangePerson: (person: string) => void;
  onChangeOutlet: (outlet: string) => void;
  onChangeDay: (day: string) => void;
  onSaveOutletDay: (
    outlet: string,
    day: string,
    changes: Record<string, { d: string; n: string; cleared?: boolean }>
  ) => Promise<void>;
  onCreateSavedRecord: (input: {
    date: string;
    pic: string;
    outlet: string;
    summary?: string;
    notes?: string;
  }) => Promise<string>;
  onUpdateSavedRecord: (
    recordId: string,
    input: {
      date: string;
      pic: string;
      outlet: string;
      summary?: string;
      notes?: string;
    }
  ) => Promise<void>;
  onDeleteSavedRecord: (recordId: string) => Promise<void>;
  onOpenAdminConfig: () => void;
}

export function InputHarianView({
  account,
  currentUserUid = '',
  activeRoleId,
  config,
  roleConfigs,
  store,
  savedRecords,
  days,
  isAdmin,
  selectedPerson,
  selectedOutlet,
  selectedDay,
  jumpTrigger = 0,
  onChangePerson,
  onChangeOutlet,
  onChangeDay,
  onSaveOutletDay,
  onCreateSavedRecord,
  onUpdateSavedRecord,
  onDeleteSavedRecord,
  onOpenAdminConfig,
}: InputHarianViewProps) {
  const [drafts, setDrafts] = useState<Record<string, Record<string, DraftEntry>>>({});
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dailyModalOpen, setDailyModalOpen] = useState(false);
  const [lastJumpTrigger, setLastJumpTrigger] = useState<number>(jumpTrigger);
  const [exportPhotoOpen, setExportPhotoOpen] = useState(false);
  const [exportPhotoContext, setExportPhotoContext] = useState<{
    person: string;
    outlet: string;
    day: string;
  } | null>(null);

  if (jumpTrigger !== lastJumpTrigger) {
    setLastJumpTrigger(jumpTrigger);
    if (jumpTrigger > 0) {
      setSavedNotice(null);
      setSaveError(null);
      setDailyModalOpen(true);
    }
  }

  const canManageRecords = account.role === 'admin' || account.role === 'accounting';
  const today = todayIso();
  const yesterday = yesterdayIso();
  const defaultDay = nearestWorkingDay(days, yesterday);
  const personList = getPersonList(config.outlets);
  const peopleMap = getPeopleMap(config.outlets);

  const hasDailySetup = personList.length > 0 && config.tasks.length > 0;

  const activePerson = hasDailySetup
    ? personList.includes(selectedPerson)
      ? selectedPerson
      : personList[0]
    : '';
  const outletsForPerson = hasDailySetup ? peopleMap[activePerson] || [] : [];
  const activeOutlet = hasDailySetup
    ? outletsForPerson.includes(selectedOutlet)
      ? selectedOutlet
      : outletsForPerson[0] || ''
    : '';

  const dayIndex = days.indexOf(selectedDay);
  const prevDay = dayIndex > 0 ? days[dayIndex - 1] : null;
  const nextDay = dayIndex >= 0 && dayIndex < days.length - 1 ? days[dayIndex + 1] : null;

  const dayKey = `${activeOutlet}|${selectedDay}`;
  const currentDraftMap = drafts[dayKey] || {};

  const calculatedTasks = hasDailySetup
    ? config.tasks.map((t) => {
        const calc = calcTask(store, days, config.tasks, activeOutlet, selectedDay, t.key, today);
        const draft = currentDraftMap[t.key];
        const displayD = draft ? draft.d : calc.d;
        const displayN = draft ? draft.n : calc.n;
        const isDirty = Boolean(
          draft &&
            (draft.d !== calc.d ||
              draft.n !== calc.n ||
              (draft.cleared && calc.own))
        );
        return {
          def: t,
          calc,
          draft,
          displayD,
          displayN,
          isDirty,
        };
      })
    : [];

  const dirtyEntries: Record<string, { d: string; n: string; cleared?: boolean }> = {};
  for (const item of calculatedTasks) {
    if (item.isDirty && item.draft) {
      dirtyEntries[item.def.key] = {
        d: item.draft.d,
        n: item.draft.n.slice(0, 100),
        cleared: item.draft.cleared,
      };
    }
  }
  const hasUnsavedChanges = Object.keys(dirtyEntries).length > 0;

  const pendingCount = calculatedTasks.filter((item) => item.calc.pend).length;
  const updateCount = calculatedTasks.length - pendingCount;

  const selectedDayIsSunday = isSunday(selectedDay);
  const selectedDayIsFuture = selectedDay > today;
  const selectedDayAlreadyFilled =
    hasDailySetup && activeOutlet
      ? isOutletDayFilled(store, config.tasks, activeOutlet, selectedDay)
      : false;
  const ownPic = resolveAccountPic(account, config.outlets);
  const isPicOwner = isAdmin || canAccountEditPic(account, config.outlets, activePerson);
  const canEditDay =
    hasDailySetup && activeOutlet && isPicOwner
      ? canEditOutletDay(store, config.tasks, days, activeOutlet, selectedDay, today, isAdmin)
      : false;

  const setTaskDraft = (
    taskKey: string,
    baseD: string,
    baseN: string,
    patch: Partial<DraftEntry>
  ) => {
    setSavedNotice(null);
    setSaveError(null);
    setDrafts((prev) => {
      const existingMap = prev[dayKey] || {};
      const current = existingMap[taskKey] || { d: baseD, n: baseN };
      const nextItem: DraftEntry = {
        ...current,
        ...patch,
        n: (patch.n !== undefined ? patch.n : current.n).slice(0, 100),
      };
      return {
        ...prev,
        [dayKey]: {
          ...existingMap,
          [taskKey]: nextItem,
        },
      };
    });
  };

  const clearTaskDraft = (taskKey: string, hasOwnSaved: boolean) => {
    setSavedNotice(null);
    setSaveError(null);
    setDrafts((prev) => {
      const existingMap = prev[dayKey] || {};
      if (hasOwnSaved) {
        return {
          ...prev,
          [dayKey]: {
            ...existingMap,
            [taskKey]: { d: '', n: '', cleared: true },
          },
        };
      }
      const nextMap = { ...existingMap };
      delete nextMap[taskKey];
      return {
        ...prev,
        [dayKey]: nextMap,
      };
    });
  };

  const handleSaveDay = async () => {
    if (!canEditDay || !hasUnsavedChanges || saving) return;
    setSaving(true);
    setSaveError(null);
    setSavedNotice(null);

    const formatSaveError = (err: unknown, stage: 'Data Harian' | 'Kode Referensi'): string => {
      let rawErr = '';
      let errPath = '';
      if (err instanceof Error) {
        try {
          const parsed = JSON.parse(err.message);
          rawErr = String(parsed?.error || err.message || '');
          errPath = String(parsed?.path || '');
        } catch {
          rawErr = err.message || '';
        }
      }
      const lower = rawErr.toLowerCase();
      if (
        lower.includes('missing or insufficient permissions') ||
        lower.includes('permission-denied')
      ) {
        if (!isAdmin && ownPic) {
          const picKey = ownPic.toUpperCase();
          const syncedOutlets = config.outletsByPic?.[picKey];
          if (!config.outletsByPic || !syncedOutlets || !syncedOutlets.includes(activeOutlet)) {
            return `Gagal menyimpan ${stage}: izin outlet ${activeOutlet} untuk PIC ${picKey} belum tersinkronisasi di server. Minta Admin membuka aplikasi sebentar agar konfigurasi PIC & Outlet tersinkronisasi.`;
          }
        }
        return errPath
          ? `Gagal menyimpan ${stage} (${errPath}): Akses ditolak oleh aturan keamanan (${rawErr}).`
          : `Gagal menyimpan ${stage}: Akses ditolak oleh aturan keamanan (${rawErr}).`;
      }
      return rawErr
        ? `Gagal menyimpan ${stage}: ${rawErr}`
        : `Gagal menyimpan ${stage}. Periksa koneksi atau izin akses Anda.`;
    };

    try {
      await onSaveOutletDay(activeOutlet, selectedDay, dirtyEntries);
    } catch (err) {
      setSaveError(formatSaveError(err, 'Data Harian'));
      setSaving(false);
      return;
    }

    setDrafts((prev) => {
      const next = { ...prev };
      delete next[dayKey];
      return next;
    });

    try {
      let generatedOrKeptCode: string | null = null;
      const { department } = resolveAuthorizedRecordPrefix(account, activeRoleId);
      const summaryItems: string[] = [];
      const noteLines: string[] = [];
      for (const item of calculatedTasks) {
        const dVal = (item.isDirty && item.draft ? item.draft.d : item.calc.d).trim();
        const nVal = (item.isDirty && item.draft ? item.draft.n : item.calc.n).trim();
        const label = item.def.shortLabel || item.def.label;
        const inputType = getTaskInputType(item.def);
        const dateFormatted = dVal
          ? inputType === 'month'
            ? fmtMonth(dVal)
            : inputType === 'week'
              ? fmtWeek(dVal)
              : fmtDate(dVal)
          : 'Kosong';
        summaryItems.push(`${label}: ${dateFormatted}`);
        noteLines.push(
          nVal ? `${item.def.label}: ${dateFormatted} (${nVal})` : `${item.def.label}: ${dateFormatted}`
        );
      }
      const summary = `[Input Harian] ${summaryItems.join(' · ')}`.slice(0, 200);
      const notes = noteLines.join('\n').slice(0, 1000);

      const existingDailyRecord = savedRecords.find(
        (r) =>
          r.department === department &&
          r.date === selectedDay &&
          r.outlet.toUpperCase() === activeOutlet.toUpperCase() &&
          r.summary.startsWith('[Input Harian]') &&
          (canManageRecords ||
            (currentUserUid
              ? r.createdBy === currentUserUid
              : r.createdByEmail.toLowerCase() === account.email.toLowerCase()))
      );

      if (existingDailyRecord) {
        await onUpdateSavedRecord(existingDailyRecord.id, {
          date: selectedDay,
          pic: activePerson,
          outlet: activeOutlet,
          summary,
          notes,
        });
        generatedOrKeptCode = existingDailyRecord.refCode;
      } else {
        generatedOrKeptCode = await onCreateSavedRecord({
          date: selectedDay,
          pic: activePerson,
          outlet: activeOutlet,
          summary,
          notes,
        });
      }

      setExportPhotoContext({
        person: activePerson,
        outlet: activeOutlet,
        day: selectedDay,
      });
      setSavedNotice(
        generatedOrKeptCode
          ? `Data ${activeOutlet} (${fmtDateLong(selectedDay)}) tersimpan · Kode Referensi: ${generatedOrKeptCode}.`
          : `Data ${activeOutlet} (${fmtDateLong(selectedDay)}) tersimpan.`
      );
      setDailyModalOpen(false);
    } catch (err) {
      setSaveError(
        `Data harian tersimpan, namun gagal membuat/memperbarui Kode Referensi. ${formatSaveError(err, 'Kode Referensi')}`
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {savedNotice && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{savedNotice}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {hasDailySetup && (
              <button
                type="button"
                onClick={() => {
                  if (!exportPhotoContext) {
                    setExportPhotoContext({
                      person: activePerson,
                      outlet: activeOutlet,
                      day: selectedDay,
                    });
                  }
                  setExportPhotoOpen(true);
                }}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                <ImageDown className="h-3.5 w-3.5 shrink-0" />
                <span>Ekspor Foto Hasil</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSavedNotice(null)}
              aria-label="Tutup notifikasi tersimpan"
              className="shrink-0 underline hover:no-underline"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      <SavedRecordsSection
        account={account}
        activeRoleId={activeRoleId}
        roleConfigs={roleConfigs}
        records={savedRecords}
        onOpenAddDaily={
          hasDailySetup
            ? () => {
                setSavedNotice(null);
                setSaveError(null);
                setDailyModalOpen(true);
              }
            : undefined
        }
        onOpenExportPhoto={
          hasDailySetup
            ? () => {
                setExportPhotoContext({
                  person: ownPic && personList.includes(ownPic) ? ownPic : activePerson,
                  outlet: activeOutlet,
                  day: selectedDay,
                });
                setExportPhotoOpen(true);
              }
            : undefined
        }
        onOpenExportPhotoForRecord={
          hasDailySetup
            ? (record) => {
                const matchedPic =
                  personList.find((p) => p.toUpperCase() === record.pic.trim().toUpperCase()) ||
                  (ownPic && personList.includes(ownPic) ? ownPic : activePerson);
                setExportPhotoContext({
                  person: matchedPic,
                  outlet: record.outlet,
                  day: days.includes(record.date)
                    ? record.date
                    : nearestWorkingDay(days, record.date),
                });
                setExportPhotoOpen(true);
              }
            : undefined
        }
        onCreateRecord={onCreateSavedRecord}
        onUpdateRecord={onUpdateSavedRecord}
        onDeleteRecord={onDeleteSavedRecord}
      />

      {!hasDailySetup && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Belum Ada Tugas atau Outlet untuk {config.label}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
            {personList.length === 0 && config.tasks.length === 0
              ? `Admin belum menambahkan daftar tugas maupun outlet untuk role ${config.label}.`
              : personList.length === 0
                ? `Admin belum menambahkan outlet untuk role ${config.label}.`
                : `Admin belum menambahkan daftar tugas untuk role ${config.label}.`}
          </p>
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenAdminConfig}
              className="mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Atur Tugas & Outlet {config.label}</span>
            </button>
          )}
        </section>
      )}

      {hasDailySetup && (
        <>
          <InputHarianDailyModal
            open={dailyModalOpen}
            saving={saving}
            saveError={saveError}
            account={account}
            config={config}
            store={store}
            days={days}
            today={today}
            defaultDay={defaultDay}
            selectedDay={selectedDay}
            prevDay={prevDay}
            nextDay={nextDay}
            personList={personList}
            peopleMap={peopleMap}
            activePerson={activePerson}
            outletsForPerson={outletsForPerson}
            activeOutlet={activeOutlet}
            ownPic={ownPic}
            isAdmin={isAdmin}
            isPicOwner={isPicOwner}
            canEditDay={canEditDay}
            selectedDayIsSunday={selectedDayIsSunday}
            selectedDayIsFuture={selectedDayIsFuture}
            selectedDayAlreadyFilled={selectedDayAlreadyFilled}
            hasUnsavedChanges={hasUnsavedChanges}
            updateCount={updateCount}
            pendingCount={pendingCount}
            calculatedTasks={calculatedTasks}
            onClose={() => setDailyModalOpen(false)}
            onChangeDay={onChangeDay}
            onChangePerson={onChangePerson}
            onChangeOutlet={onChangeOutlet}
            onOpenExportPhoto={() => {
              setExportPhotoContext({
                person: activePerson,
                outlet: activeOutlet,
                day: selectedDay,
              });
              setExportPhotoOpen(true);
            }}
            onSaveDay={handleSaveDay}
            onSetTaskDraft={setTaskDraft}
            onClearTaskDraft={clearTaskDraft}
            onClearNotices={() => {
              setSavedNotice(null);
              setSaveError(null);
            }}
          />

          <ExportResultPhotoModal
            open={exportPhotoOpen}
            account={account}
            config={config}
            store={store}
            days={days}
            initialPerson={exportPhotoContext?.person || activePerson}
            initialOutlet={exportPhotoContext?.outlet || activeOutlet}
            initialDay={exportPhotoContext?.day || selectedDay}
            onClose={() => setExportPhotoOpen(false)}
          />
        </>
      )}
    </div>
  );
}
