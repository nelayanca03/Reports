import { ArrowUpRight, CheckCircle2, Lock, Plus, Save, UserCheck, XCircle } from 'lucide-react';
import { useState } from 'react';
import { formatFriendlyFirestoreError } from '../firebase';
import {
  AccountProfile,
  CalendarAssignStatus,
  OutletStoreState,
  RoleConfig,
  VisitEntry,
  VisitItem,
} from '../types/outlet';
import {
  CALENDAR_TIME_SLOTS,
  calcVisitLeaderboard,
  canAccountEditPic,
  fmtDateLong,
  formatPicTitle,
  getPeopleMap,
  getPersonList,
  getVisitEntries,
  isSunday,
  nearestWorkingDay,
  resolveAccountPic,
  todayIso,
} from '../utils/outletLogic';
import { KunjunganEntryList } from './kunjungan/KunjunganEntryList';
import { KunjunganLeaderboardAndMatrix } from './kunjungan/KunjunganLeaderboardAndMatrix';
import { makeVisitRowId } from './kunjungan/kunjunganUtils';

interface KunjunganViewProps {
  account: AccountProfile;
  isAdmin: boolean;
  config: RoleConfig;
  store: OutletStoreState;
  days: string[];
  selectedPerson: string;
  onSaveVisitDay: (person: string, day: string, nextVisit: VisitItem) => Promise<void>;
  onUpdateAssignResponse: (
    eventId: string,
    input: {
      assignStatus: CalendarAssignStatus;
      returnTime?: string;
      cancelReason?: string;
      notificationDismissed?: boolean;
      targetPic?: string;
      forceGlobal?: boolean;
    }
  ) => Promise<void>;
  onJumpToInput: (person: string, outlet: string, day: string) => void;
}

export function KunjunganView({
  account,
  isAdmin,
  config,
  store,
  days,
  selectedPerson,
  onSaveVisitDay,
  onUpdateAssignResponse,
  onJumpToInput,
}: KunjunganViewProps) {
  const today = todayIso();
  const personList = getPersonList(config.outlets);
  const peopleMap = getPeopleMap(config.outlets);
  const allOutlets = Array.from(new Set(config.outlets.map((o) => o.code)));
  const ownPic = resolveAccountPic(account, config.outlets);

  const [visitPerson, setVisitPerson] = useState<string>(() =>
    ownPic && personList.includes(ownPic)
      ? ownPic
      : selectedPerson && personList.includes(selectedPerson)
        ? selectedPerson
        : personList[0] || ''
  );
  const [visitDay, setVisitDay] = useState<string>(() => nearestWorkingDay(days, today));
  const [prevAccountId, setPrevAccountId] = useState<string>(account.id);

  if (prevAccountId !== account.id) {
    setPrevAccountId(account.id);
    if (ownPic && personList.includes(ownPic)) {
      setVisitPerson(ownPic);
    } else if (selectedPerson && personList.includes(selectedPerson)) {
      setVisitPerson(selectedPerson);
    } else if (personList.length > 0) {
      setVisitPerson(personList[0]);
    }
  }

  const [draftEntries, setDraftEntries] = useState<VisitEntry[]>([]);
  const [customModeByRow, setCustomModeByRow] = useState<Record<string, boolean>>({});
  const [assignReturnInputs, setAssignReturnInputs] = useState<Record<string, string>>({});
  const [assignBusyId, setAssignBusyId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [boardDateMode, setBoardDateMode] = useState<'all' | 'single' | 'range'>('all');
  const [boardDateExact, setBoardDateExact] = useState<string>(today);
  const [boardDateFrom, setBoardDateFrom] = useState<string>(days[0] || today);
  const [boardDateTo, setBoardDateTo] = useState<string>(today);

  const activePerson = personList.includes(visitPerson)
    ? visitPerson
    : ownPic && personList.includes(ownPic)
      ? ownPic
      : selectedPerson && personList.includes(selectedPerson)
        ? selectedPerson
        : personList[0] || '';
  const activeDay = days.includes(visitDay) ? visitDay : nearestWorkingDay(days, today);
  const activePersonOutlets = peopleMap[activePerson] || [];
  const otherOutlets = allOutlets.filter((o) => !activePersonOutlets.includes(o));
  const defaultOutletForPerson = activePersonOutlets[0] || allOutlets[0] || '';

  const contextKey = `${activePerson}|${activeDay}`;
  const savedVisit: VisitItem = store.visit[contextKey] || {
    ok: false,
    outlet: '',
    f: '',
    t: '',
    n: '',
    entries: [],
  };

  const [syncedContextKey, setSyncedContextKey] = useState<string>('');
  const [syncedVisitRef, setSyncedVisitRef] = useState<VisitItem | undefined>(
    store.visit[contextKey]
  );

  const contextChanged = syncedContextKey !== contextKey;
  const storeVisitChanged = syncedVisitRef !== store.visit[contextKey];

  const allSavedEntries = savedVisit.ok ? getVisitEntries(savedVisit) : [];
  const assignEntries = allSavedEntries.filter((e) => Boolean(e.assignEventId));
  const savedManualEntries = allSavedEntries.filter((e) => !e.assignEventId);

  if (contextChanged || (storeVisitChanged && !isDirty && !saving)) {
    setSyncedContextKey(contextKey);
    setSyncedVisitRef(store.visit[contextKey]);
    setDraftEntries(savedManualEntries);
    setCustomModeByRow((prev) => {
      if (contextChanged) return {};
      const next: Record<string, boolean> = {};
      for (const e of savedManualEntries) {
        if (prev[e.id] && !e.n) next[e.id] = true;
      }
      return next;
    });
    setAssignReturnInputs((prev) => {
      const next: Record<string, string> = contextChanged ? {} : { ...prev };
      for (const e of assignEntries) {
        if (e.assignEventId && next[e.assignEventId] === undefined) {
          next[e.assignEventId] = e.t || '';
        }
      }
      return next;
    });
    setIsDirty(false);
    if (contextChanged) {
      setSaveError(null);
    }
  }

  if (personList.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Belum Ada PIC & Outlet untuk {config.label}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
          Data kunjungan akan muncul setelah Admin menambahkan PIC dan outlet pada role{' '}
          {config.label}.
        </p>
      </section>
    );
  }

  const rawBoardFrom = boardDateFrom || days[0] || today;
  const rawBoardTo = boardDateTo || today;
  const effBoardFrom = rawBoardFrom <= rawBoardTo ? rawBoardFrom : rawBoardTo;
  const effBoardTo = rawBoardFrom <= rawBoardTo ? rawBoardTo : rawBoardFrom;

  const filterFrom =
    boardDateMode === 'single'
      ? boardDateExact || today
      : boardDateMode === 'range'
        ? effBoardFrom
        : undefined;
  const filterUpto =
    boardDateMode === 'single'
      ? boardDateExact || today
      : boardDateMode === 'range'
        ? effBoardTo
        : undefined;

  const { elapsedDays, grandTotalVisits, rows } = calcVisitLeaderboard(
    store,
    days,
    personList,
    today,
    filterFrom,
    filterUpto,
    config.dayAdjustments
  );

  const filteredMatrixDays = days.filter((d) => {
    if (boardDateMode === 'single') {
      return boardDateExact ? d === boardDateExact : true;
    }
    if (boardDateMode === 'range') {
      return (!effBoardFrom || d >= effBoardFrom) && (!effBoardTo || d <= effBoardTo);
    }
    return true;
  });

  const todayIsSunday = isSunday(today);
  const isTodayWorkingDay = days.includes(today) && !todayIsSunday;
  const isPicOwner = isAdmin || canAccountEditPic(account, config.outlets, activePerson);
  const canEditSelectedCell =
    isPicOwner && !isSunday(activeDay) && activeDay === today && isTodayWorkingDay;

  const incompleteRows = draftEntries.filter(
    (e) => !e.outlet.trim() || !e.f.trim() || !e.t.trim()
  );
  const hasIncompleteRows = incompleteRows.length > 0;
  const canSave = canEditSelectedCell && isDirty && !hasIncompleteRows && !saving;

  const handleUpdateRow = (id: string, patch: Partial<VisitEntry>) => {
    setSavedNotice(null);
    setDraftEntries((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              ...patch,
              n: (patch.n !== undefined ? patch.n : row.n).slice(0, 100),
            }
          : row
      )
    );
    setIsDirty(true);
  };

  const handleAddRow = () => {
    setSavedNotice(null);
    setDraftEntries((prev) => [
      ...prev,
      {
        id: makeVisitRowId(),
        outlet: prev.length === 0 ? defaultOutletForPerson : '',
        f: '',
        t: '',
        n: '',
      },
    ]);
    setIsDirty(true);
  };

  const handleRemoveRow = (id: string) => {
    setSavedNotice(null);
    const filtered = draftEntries.filter((r) => r.id !== id);
    setDraftEntries(filtered);
    setIsDirty(filtered.length > 0 || savedManualEntries.length > 0);
  };

  const handleSaveAssignReturn = async (entry: VisitEntry) => {
    if (!entry.assignEventId || assignBusyId) return;
    const rawTime = (assignReturnInputs[entry.assignEventId] ?? entry.t ?? '').trim();
    if (!CALENDAR_TIME_SLOTS.includes(rawTime)) {
      setSaveError('Pilih jam pulang antara 08:00 – 19:00 WIB (kelipatan 30 menit).');
      return;
    }
    setAssignBusyId(entry.assignEventId);
    setSaveError(null);
    setSavedNotice(null);
    try {
      await onUpdateAssignResponse(entry.assignEventId, {
        assignStatus: 'completed',
        returnTime: rawTime,
        cancelReason: '',
        notificationDismissed: true,
        targetPic: activePerson,
      });
      setSavedNotice(`Jam pulang assign (${entry.outlet}) tersimpan: ${rawTime} WIB.`);
    } catch (err) {
      setSaveError(formatFriendlyFirestoreError(err, 'Gagal menyimpan jam pulang assign.'));
    } finally {
      setAssignBusyId(null);
    }
  };

  const handleCancelAssignVisit = async (entry: VisitEntry) => {
    if (!entry.assignEventId || assignBusyId) return;
    setAssignBusyId(entry.assignEventId);
    setSaveError(null);
    setSavedNotice(null);
    try {
      await onUpdateAssignResponse(entry.assignEventId, {
        assignStatus: 'cancelled',
        returnTime: '',
        cancelReason: 'Tidak jadi pergi',
        notificationDismissed: true,
        targetPic: activePerson,
      });
      setSavedNotice(`Assign (${entry.outlet}) ditandai tidak jadi pergi (0 kunjungan).`);
    } catch (err) {
      setSaveError(formatFriendlyFirestoreError(err, 'Gagal membatalkan kunjungan assign.'));
    } finally {
      setAssignBusyId(null);
    }
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    setSavedNotice(null);
    try {
      const cleanManual = draftEntries.filter((e) => !e.assignEventId);
      const hasEntries = cleanManual.length > 0;
      const first = cleanManual[0];
      await onSaveVisitDay(activePerson, activeDay, {
        ok: hasEntries,
        outlet: first?.outlet || '',
        f: first?.f || '',
        t: first?.t || '',
        n: first?.n || '',
        entries: hasEntries ? cleanManual : [],
      });
      setIsDirty(false);
      setSavedNotice(
        hasEntries
          ? `Kunjungan manual ${activePerson} (${fmtDateLong(activeDay)}) tersimpan (${cleanManual.length}x).`
          : `Kunjungan manual ${activePerson} (${fmtDateLong(activeDay)}) dihapus.`
      );
    } catch (err) {
      let msg = 'Gagal menyimpan data kunjungan. Periksa koneksi atau izin akses.';
      if (err instanceof Error) {
        try {
          const parsed = JSON.parse(err.message);
          const rawErr = String(parsed?.error || err.message || '');
          const errPath = String(parsed?.path || '');
          const lower = rawErr.toLowerCase();
          if (
            lower.includes('missing or insufficient permissions') ||
            lower.includes('permission-denied')
          ) {
            msg = errPath
              ? `Gagal menyimpan (${errPath}): Akses ditolak oleh aturan keamanan (${rawErr}).`
              : `Gagal menyimpan: Akses ditolak oleh aturan keamanan (${rawErr}).`;
          } else if (rawErr) {
            msg = `Gagal menyimpan: ${rawErr}`;
          }
        } catch {
          if (err.message) msg = `Gagal menyimpan: ${err.message}`;
        }
      }
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  const savedEntryCount = savedVisit.ok ? Math.max(1, getVisitEntries(savedVisit).length) : 0;

  return (
    <div className="space-y-5">
      <section
        className={`rounded-xl border border-slate-200 p-5 dark:border-slate-800 ${
          canEditSelectedCell ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/90 dark:bg-slate-900/70'
        }`}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Input Kunjungan ke Outlet
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {formatPicTitle(activePerson)} : {activePersonOutlets.join(', ') || '—'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`text-xs font-semibold ${
                savedVisit.ok
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {savedVisit.ok ? `Tercatat (${savedEntryCount}x kunjungan)` : 'Belum Dicatat'}
            </span>
            <button
              type="button"
              onClick={() =>
                onJumpToInput(activePerson, activePersonOutlets[0] || '', activeDay)
              }
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <span>Lihat Tugas Harian</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="visit-day-select"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Tanggal Kerja
            </label>
            <div className="flex items-center gap-1.5">
              <select
                id="visit-day-select"
                value={activeDay}
                onChange={(e) => {
                  setSavedNotice(null);
                  setVisitDay(e.target.value);
                }}
                className={`min-h-[42px] min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-sm tabular-nums focus:border-blue-600 focus:outline-none ${
                  canEditSelectedCell
                    ? 'border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                    : 'border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-500'
                }`}
              >
                {days.map((d) => {
                  const isToday = d === today;
                  return (
                    <option
                      key={d}
                      value={d}
                      className={
                        isToday
                          ? 'bg-white font-semibold text-blue-700 dark:bg-slate-800 dark:text-blue-400'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-500'
                      }
                    >
                      {fmtDateLong(d)}
                    </option>
                  );
                })}
              </select>
              {isTodayWorkingDay && activeDay !== today && (
                <button
                  type="button"
                  onClick={() => {
                    setSavedNotice(null);
                    setVisitDay(today);
                  }}
                  className="min-h-[42px] shrink-0 whitespace-nowrap rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  Hari H
                </button>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="visit-person-select"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Nama PIC
            </label>
            <select
              id="visit-person-select"
              value={activePerson}
              onChange={(e) => {
                setSavedNotice(null);
                setSaveError(null);
                setVisitPerson(e.target.value);
              }}
              className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {personList.map((p) => (
                <option key={p} value={p}>
                  {p} ({(peopleMap[p] || []).length} outlet)
                </option>
              ))}
            </select>
          </div>
        </div>

        {!isPicOwner && (
          <div
            role="status"
            className="mb-4 flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-200"
          >
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
              <span>
                <span className="font-semibold">Akses Terkunci — Kunjungan {activePerson}</span> ·{' '}
                {ownPic && personList.includes(ownPic)
                  ? `Akun Anda (${account.name} · ${ownPic}) hanya dapat mengisi kunjungan atas nama ${ownPic}.`
                  : `Akun Anda belum dipasangkan ke nama PIC pada ${config.label}, sehingga pengisian kunjungan dikunci.`}
              </span>
            </div>
            {ownPic && personList.includes(ownPic) && (
              <button
                type="button"
                onClick={() => {
                  setSavedNotice(null);
                  setSaveError(null);
                  setVisitPerson(ownPic);
                }}
                className="min-h-[32px] shrink-0 whitespace-nowrap rounded-lg bg-amber-700 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
              >
                Buka Kunjungan {ownPic}
              </button>
            )}
          </div>
        )}

        {isPicOwner && !canEditSelectedCell && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
            <Lock className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
            <span>
              {todayIsSunday
                ? 'Hanya Baca · Hari Minggu tidak memiliki input harian maupun kunjungan.'
                : `Hanya Baca (${fmtDateLong(activeDay)}) · Kunjungan hanya dapat diisi atau diubah pada Hari H (${fmtDateLong(today)}).`}
            </span>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="font-medium text-slate-600 dark:text-slate-300">
              {draftEntries.length > 0
                ? `${draftEntries.length} kunjungan tercatat di draft`
                : 'Belum ada kunjungan'}
            </span>
            {savedNotice && !isDirty && (
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                · {savedNotice}
              </span>
            )}
            {isDirty && canEditSelectedCell && (
              <span className="font-medium text-blue-700 dark:text-blue-400">
                · Belum disimpan
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {canEditSelectedCell && (
              <button
                type="button"
                onClick={handleAddRow}
                className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>
                  {draftEntries.length > 0 ? 'Tambah Kunjungan Lagi' : 'Tambah Kunjungan'}
                </span>
              </button>
            )}
            <button
              type="button"
              disabled={!canSave}
              onClick={handleSave}
              className="inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
            >
              <Save className="h-4 w-4 shrink-0" />
              <span>{saving ? 'Menyimpan...' : 'Save'}</span>
            </button>
          </div>
        </div>

        {saveError && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          >
            {saveError}
          </div>
        )}

        {canEditSelectedCell && isDirty && hasIncompleteRows && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          >
            Tidak bisa Save karena masih ada baris kunjungan yang kosong. Lengkapi kolom Outlet, Dari jam, dan Ke jam atau klik tombol Hapus pada baris yang tidak ada kunjungan.
          </div>
        )}

        {assignEntries.length > 0 && (
          <div className="mb-4 space-y-2.5 rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/60 dark:bg-blue-950/25">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-900 dark:text-blue-200">
                <UserCheck className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                <span>Kunjungan Otomatis dari Assign Kalender ({assignEntries.length})</span>
              </div>
              <span className="text-[11px] text-blue-800/80 dark:text-blue-300/80">
                Input jam pulang setelah selesai, atau klik Tidak Jadi Pergi agar menjadi 0 kunjungan.
              </span>
            </div>

            <div className="space-y-2.5">
              {assignEntries.map((entry) => {
                const evtId = entry.assignEventId || '';
                const val = assignReturnInputs[evtId] ?? entry.t ?? '';
                const isRowBusy = assignBusyId === evtId;
                const isDone = entry.assignStatus === 'completed' && Boolean(entry.t);

                return (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200/80 bg-white p-3 dark:border-blue-900/50 dark:bg-slate-900"
                  >
                    <div className="min-w-[200px] flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                          {entry.outlet}
                        </span>
                        <span className="font-mono text-xs text-slate-600 tabular-nums dark:text-slate-300">
                          Berangkat {entry.f} WIB
                          {entry.t ? ` → Pulang ${entry.t} WIB` : ''}
                        </span>
                        {isDone ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Selesai
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            Belum input jam pulang
                          </span>
                        )}
                      </div>
                      {entry.n && (
                        <p className="text-xs text-slate-600 dark:text-slate-400">{entry.n}</p>
                      )}
                    </div>

                    {isPicOwner && (!isDone || isAdmin) ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor={`assign-ret-${evtId}`}>
                          Jam Pulang (08:00 – 19:00 WIB)
                        </label>
                        <select
                          id={`assign-ret-${evtId}`}
                          disabled={isRowBusy}
                          value={val}
                          onChange={(e) =>
                            setAssignReturnInputs((prev) => ({
                              ...prev,
                              [evtId]: e.target.value,
                            }))
                          }
                          className="h-[36px] rounded-lg border border-slate-300 bg-slate-50 px-2.5 font-mono text-xs font-semibold text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          <option value="">Pilih jam...</option>
                          {val && !CALENDAR_TIME_SLOTS.includes(val) && (
                            <option value={val}>{val} WIB</option>
                          )}
                          {CALENDAR_TIME_SLOTS.map((slot) => (
                            <option key={slot} value={slot}>
                              {slot} WIB
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={isRowBusy}
                          onClick={() => handleSaveAssignReturn(entry)}
                          className="inline-flex h-[36px] items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>{isRowBusy ? '...' : 'Simpan Pulang'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isRowBusy}
                          onClick={() => handleCancelAssignVisit(entry)}
                          className="inline-flex h-[36px] items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/70"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Tidak Jadi Pergi</span>
                        </button>
                      </div>
                    ) : isDone ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <Lock className="h-3.5 w-3.5" />
                        <span>Terkunci · Pulang {entry.t} WIB</span>
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <KunjunganEntryList
          draftEntries={draftEntries}
          customModeByRow={customModeByRow}
          canEditSelectedCell={canEditSelectedCell}
          activePerson={activePerson}
          activePersonOutlets={activePersonOutlets}
          otherOutlets={otherOutlets}
          onSetCustomMode={(rowId, active) =>
            setCustomModeByRow((prev) => ({ ...prev, [rowId]: active }))
          }
          onUpdateRow={handleUpdateRow}
          onRemoveRow={handleRemoveRow}
        />
      </section>

      <KunjunganLeaderboardAndMatrix
        config={config}
        store={store}
        days={days}
        today={today}
        personList={personList}
        activePerson={activePerson}
        activeDay={activeDay}
        boardDateMode={boardDateMode}
        boardDateExact={boardDateExact}
        boardDateFrom={boardDateFrom}
        boardDateTo={boardDateTo}
        elapsedDays={elapsedDays}
        grandTotalVisits={grandTotalVisits}
        rows={rows}
        filteredMatrixDays={filteredMatrixDays}
        onChangeBoardDateMode={setBoardDateMode}
        onChangeBoardDateExact={setBoardDateExact}
        onChangeBoardDateFrom={setBoardDateFrom}
        onChangeBoardDateTo={setBoardDateTo}
        onSelectCell={(person, d) => {
          setSavedNotice(null);
          setVisitPerson(person);
          setVisitDay(d);
        }}
      />
    </div>
  );
}
