import { ArrowUpRight, Lock, Plus, Save } from 'lucide-react';
import { useState } from 'react';
import {
  AccountProfile,
  OutletStoreState,
  RoleConfig,
  VisitEntry,
  VisitItem,
} from '../types/outlet';
import {
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

  if (contextChanged || (storeVisitChanged && !isDirty && !saving)) {
    const entries = getVisitEntries(savedVisit);
    setSyncedContextKey(contextKey);
    setSyncedVisitRef(store.visit[contextKey]);
    setDraftEntries(savedVisit.ok ? entries : []);
    setCustomModeByRow((prev) => {
      if (contextChanged) return {};
      const next: Record<string, boolean> = {};
      for (const e of entries) {
        if (prev[e.id] && !e.n) next[e.id] = true;
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
    filterUpto
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
    setIsDirty(filtered.length > 0 || savedVisit.ok);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    setSavedNotice(null);
    try {
      const hasEntries = draftEntries.length > 0;
      const first = draftEntries[0];
      await onSaveVisitDay(activePerson, activeDay, {
        ok: hasEntries,
        outlet: first?.outlet || '',
        f: first?.f || '',
        t: first?.t || '',
        n: first?.n || '',
        entries: hasEntries ? draftEntries : [],
      });
      setIsDirty(false);
      setSavedNotice(
        hasEntries
          ? `Kunjungan ${activePerson} (${fmtDateLong(activeDay)}) tersimpan (${draftEntries.length}x).`
          : `Kunjungan ${activePerson} (${fmtDateLong(activeDay)}) dihapus.`
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
