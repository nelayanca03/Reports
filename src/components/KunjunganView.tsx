import { ArrowUpRight, Check, Lock, Minus, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { OutletStoreState, RoleConfig, VisitEntry, VisitItem } from '../types/outlet';
import {
  calcVisitLeaderboard,
  fmtDate,
  fmtDateFull,
  fmtDateLong,
  formatPicTitle,
  getPeopleMap,
  getPersonList,
  getVisitEntries,
  isSunday,
  nearestWorkingDay,
  todayIso,
} from '../utils/outletLogic';

interface KunjunganViewProps {
  config: RoleConfig;
  store: OutletStoreState;
  days: string[];
  selectedPerson: string;
  onSaveVisitDay: (person: string, day: string, nextVisit: VisitItem) => Promise<void>;
  onJumpToInput: (person: string, outlet: string, day: string) => void;
}

const HALF_HOUR_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
  const hh = String(Math.floor(i / 2)).padStart(2, '0');
  const mm = i % 2 === 0 ? '00' : '30';
  return `${hh}:${mm}`;
});

const VISIT_REASON_OPTIONS = [
  'Stock Opname',
  'Pengecekkan Asset',
  'Pengecekkan Discrepancy',
  'Pengecekkan Inventory',
  'Meeting',
] as const;

const CUSTOM_REASON_VALUE = '__custom__';

function parseVisitNote(
  rawNote: string,
  isCustomActive?: boolean
): { category: string; customText: string } {
  if (isCustomActive) {
    return { category: CUSTOM_REASON_VALUE, customText: rawNote };
  }
  if (!rawNote) {
    return { category: '', customText: '' };
  }
  for (const opt of VISIT_REASON_OPTIONS) {
    if (rawNote === opt) {
      return { category: opt, customText: '' };
    }
    if (rawNote.startsWith(`${opt} — `)) {
      return { category: opt, customText: rawNote.slice(opt.length + 3) };
    }
  }
  return { category: CUSTOM_REASON_VALUE, customText: rawNote };
}

function composeVisitNote(category: string, customText: string): string {
  if (!category || category === CUSTOM_REASON_VALUE) {
    return customText.slice(0, 100);
  }
  if (customText.trim()) {
    return `${category} — ${customText}`.slice(0, 100);
  }
  return category.slice(0, 100);
}

function makeVisitRowId(): string {
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function KunjunganView({
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

  const [visitPerson, setVisitPerson] = useState<string>(() =>
    selectedPerson && personList.includes(selectedPerson) ? selectedPerson : personList[0] || ''
  );
  const [visitDay, setVisitDay] = useState<string>(() => nearestWorkingDay(days, today));

  const [draftOk, setDraftOk] = useState<boolean>(false);
  const [draftEntries, setDraftEntries] = useState<VisitEntry[]>([]);
  const [customModeByRow, setCustomModeByRow] = useState<Record<string, boolean>>({});
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (personList.length > 0 && !personList.includes(visitPerson)) {
      setVisitPerson(
        selectedPerson && personList.includes(selectedPerson) ? selectedPerson : personList[0]
      );
    }
  }, [personList, selectedPerson, visitPerson]);

  useEffect(() => {
    if (days.length > 0 && !days.includes(visitDay)) {
      setVisitDay(nearestWorkingDay(days, today));
    }
  }, [days, today, visitDay]);

  const activePerson = personList.includes(visitPerson) ? visitPerson : personList[0] || '';
  const activeDay = days.includes(visitDay) ? visitDay : nearestWorkingDay(days, today);
  const activePersonOutlets = peopleMap[activePerson] || [];
  const otherOutlets = allOutlets.filter((o) => !activePersonOutlets.includes(o));
  const defaultOutletForPerson = activePersonOutlets[0] || allOutlets[0] || '';

  const savedVisit: VisitItem = store.visit[`${activePerson}|${activeDay}`] || {
    ok: false,
    outlet: '',
    f: '',
    t: '',
    n: '',
    entries: [],
  };

  // Sync draft when switching PIC, day, or when Firestore snapshot updates while not dirty
  useEffect(() => {
    const entries = getVisitEntries(savedVisit);
    setDraftOk(savedVisit.ok);
    setDraftEntries(savedVisit.ok ? entries : []);
    setCustomModeByRow({});
    setIsDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePerson, activeDay, store.visit[`${activePerson}|${activeDay}`]]);

  if (personList.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Belum Ada PIC & Outlet untuk {config.label}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
          Data kunjungan akan muncul setelah Admin menambahkan PIC dan outlet pada role {config.label}.
        </p>
      </section>
    );
  }

  const { elapsedDays, grandTotalVisits, rows } = calcVisitLeaderboard(
    store,
    days,
    personList,
    today
  );

  const todayIsSunday = isSunday(today);
  const isTodayWorkingDay = days.includes(today) && !todayIsSunday;
  const canEditSelectedCell =
    !isSunday(activeDay) && activeDay === today && isTodayWorkingDay;

  const incompleteRows = draftOk
    ? draftEntries.filter((e) => !e.outlet.trim() || !e.f.trim() || !e.t.trim())
    : [];
  const hasIncompleteRows = incompleteRows.length > 0 || (draftOk && draftEntries.length === 0);
  const canSave = canEditSelectedCell && isDirty && !hasIncompleteRows && !saving;

  const handleToggleVisited = (checked: boolean) => {
    setSavedNotice(null);
    setDraftOk(checked);
    if (checked && draftEntries.length === 0) {
      setDraftEntries([
        {
          id: makeVisitRowId(),
          outlet: defaultOutletForPerson,
          f: '',
          t: '',
          n: '',
        },
      ]);
    } else if (!checked) {
      setDraftEntries([]);
    }
    setIsDirty(checked || savedVisit.ok);
  };

  const handleUpdateRow = (id: string, patch: Partial<VisitEntry>) => {
    setSavedNotice(null);
    setDraftOk(true);
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
    setDraftOk(true);
    setDraftEntries((prev) => [
      ...prev,
      {
        id: makeVisitRowId(),
        outlet: '',
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
    if (filtered.length === 0) {
      setDraftOk(false);
      setIsDirty(savedVisit.ok);
    } else {
      setIsDirty(true);
    }
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const first = draftEntries[0];
      await onSaveVisitDay(activePerson, activeDay, {
        ok: draftOk && draftEntries.length > 0,
        outlet: first?.outlet || '',
        f: first?.f || '',
        t: first?.t || '',
        n: first?.n || '',
        entries: draftOk ? draftEntries : [],
      });
      setIsDirty(false);
      setSavedNotice(
        draftOk
          ? `Kunjungan ${activePerson} (${fmtDateLong(activeDay)}) tersimpan.`
          : `Kunjungan ${activePerson} (${fmtDateLong(activeDay)}) dihapus.`
      );
    } finally {
      setSaving(false);
    }
  };

  const savedEntryCount = savedVisit.ok ? Math.max(1, getVisitEntries(savedVisit).length) : 0;

  return (
    <div className="space-y-5">
      {/* Input Kunjungan ke Outlet */}
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
              {savedVisit.ok
                ? `Tercatat (${savedEntryCount}x kunjungan)`
                : 'Belum Dicatat'}
            </span>
            <button
              type="button"
              onClick={() =>
                onJumpToInput(
                  activePerson,
                  activePersonOutlets[0] || '',
                  activeDay
                )
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

        {!canEditSelectedCell && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
            <Lock className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
            <span>
              {todayIsSunday
                ? 'Hanya Baca · Hari Minggu tidak memiliki input harian maupun kunjungan.'
                : `Hanya Baca (${fmtDateLong(activeDay)}) · Kunjungan hanya dapat diisi atau diubah pada Hari H (${fmtDateLong(today)}).`}
            </span>
          </div>
        )}

        {/* Visited Toggle & Action Bar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <label
            className={`inline-flex min-h-[42px] items-center gap-3 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium transition-colors dark:border-slate-700 ${
              canEditSelectedCell
                ? 'cursor-pointer bg-slate-50 text-slate-800 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/70'
                : 'cursor-not-allowed bg-slate-200/80 text-slate-400 dark:bg-slate-800/50 dark:text-slate-500'
            }`}
          >
            <input
              type="checkbox"
              disabled={!canEditSelectedCell}
              checked={draftOk}
              onChange={(e) => handleToggleVisited(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span>Sudah dikunjungi ({draftEntries.length} kunjungan)</span>
          </label>

          <div className="flex flex-wrap items-center gap-2.5">
            {savedNotice && !isDirty && (
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {savedNotice}
              </span>
            )}
            {isDirty && canEditSelectedCell && (
              <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
                Belum disimpan
              </span>
            )}
            {canEditSelectedCell && (
              <button
                type="button"
                onClick={handleAddRow}
                className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{draftEntries.length > 0 ? 'Tambah Kunjungan Lagi' : 'Tambah Kunjungan'}</span>
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

        {canEditSelectedCell && isDirty && hasIncompleteRows && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          >
            Tidak bisa Save karena masih ada baris kunjungan yang kosong. Lengkapi kolom Outlet, Dari jam, dan Ke jam atau klik tombol Hapus pada baris yang tidak ada kunjungan.
          </div>
        )}

        {/* Dynamic Visit Entries */}
        {draftEntries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-400">
            {canEditSelectedCell
              ? 'Belum ada kunjungan dicatat. Klik "Tambah Kunjungan" untuk mengisi kunjungan outlet, atau tekan Save jika ingin menghapus catatan kunjungan hari ini.'
              : 'Tidak ada catatan kunjungan pada tanggal ini.'}
          </div>
        ) : (
          <div className="space-y-3">
            {draftEntries.map((entry, idx) => {
              const missingOutlet = !entry.outlet.trim();
              const missingFrom = !entry.f.trim();
              const missingTo = !entry.t.trim();
              const parsedNote = parseVisitNote(entry.n, customModeByRow[entry.id]);
              const fromOptions =
                entry.f && !HALF_HOUR_SLOTS.includes(entry.f)
                  ? [entry.f, ...HALF_HOUR_SLOTS]
                  : HALF_HOUR_SLOTS;
              const toOptions =
                entry.t && !HALF_HOUR_SLOTS.includes(entry.t)
                  ? [entry.t, ...HALF_HOUR_SLOTS]
                  : HALF_HOUR_SLOTS;

              return (
                <div
                  key={entry.id}
                  className="grid grid-cols-1 items-end gap-3 rounded-lg border border-slate-200/80 bg-slate-50/70 p-3.5 sm:grid-cols-2 lg:grid-cols-12 dark:border-slate-800 dark:bg-slate-800/35"
                >
                  <div className="lg:col-span-2">
                    <label
                      htmlFor={`visit-outlet-${entry.id}`}
                      className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
                    >
                      Kunjungan #{idx + 1} · Outlet
                    </label>
                    <select
                      id={`visit-outlet-${entry.id}`}
                      disabled={!canEditSelectedCell}
                      value={entry.outlet}
                      onChange={(e) => handleUpdateRow(entry.id, { outlet: e.target.value })}
                      className={`min-h-[40px] w-full rounded-lg border bg-white px-3 py-2 text-xs font-medium text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-200/80 disabled:text-slate-400 focus:border-blue-600 focus:outline-none dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500 ${
                        canEditSelectedCell && missingOutlet
                          ? 'border-red-400 dark:border-red-500'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <option value="">Pilih outlet...</option>
                      {activePersonOutlets.length > 0 && (
                        <optgroup label={`Outlet ${activePerson}`}>
                          {activePersonOutlets.map((code) => (
                            <option key={code} value={code}>
                              {code}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {otherOutlets.length > 0 && (
                        <optgroup label="Outlet Lainnya">
                          {otherOutlets.map((code) => (
                            <option key={code} value={code}>
                              {code}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  <div className="lg:col-span-2">
                    <label
                      htmlFor={`visit-from-${entry.id}`}
                      className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
                    >
                      Dari jam
                    </label>
                    <select
                      id={`visit-from-${entry.id}`}
                      disabled={!canEditSelectedCell}
                      value={entry.f}
                      onChange={(e) => handleUpdateRow(entry.id, { f: e.target.value })}
                      className={`min-h-[40px] w-full rounded-lg border bg-white px-2.5 py-2 font-mono text-xs text-slate-900 tabular-nums disabled:cursor-not-allowed disabled:bg-slate-200/80 disabled:text-slate-400 focus:border-blue-600 focus:outline-none dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500 ${
                        canEditSelectedCell && missingFrom
                          ? 'border-red-400 dark:border-red-500'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <option value="">Pilih jam...</option>
                      {fromOptions.map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-2">
                    <label
                      htmlFor={`visit-to-${entry.id}`}
                      className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
                    >
                      Ke jam
                    </label>
                    <select
                      id={`visit-to-${entry.id}`}
                      disabled={!canEditSelectedCell}
                      value={entry.t}
                      onChange={(e) => handleUpdateRow(entry.id, { t: e.target.value })}
                      className={`min-h-[40px] w-full rounded-lg border bg-white px-2.5 py-2 font-mono text-xs text-slate-900 tabular-nums disabled:cursor-not-allowed disabled:bg-slate-200/80 disabled:text-slate-400 focus:border-blue-600 focus:outline-none dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500 ${
                        canEditSelectedCell && missingTo
                          ? 'border-red-400 dark:border-red-500'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <option value="">Pilih jam...</option>
                      {toOptions.map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-3">
                    <label
                      htmlFor={`visit-reason-${entry.id}`}
                      className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
                    >
                      Keterangan Kunjungan
                    </label>
                    <select
                      id={`visit-reason-${entry.id}`}
                      disabled={!canEditSelectedCell}
                      value={parsedNote.category}
                      onChange={(e) => {
                        const nextCategory = e.target.value;
                        if (nextCategory === CUSTOM_REASON_VALUE) {
                          setCustomModeByRow((prev) => ({ ...prev, [entry.id]: true }));
                          handleUpdateRow(entry.id, { n: parsedNote.customText });
                        } else {
                          setCustomModeByRow((prev) => ({ ...prev, [entry.id]: false }));
                          handleUpdateRow(entry.id, {
                            n: composeVisitNote(nextCategory, parsedNote.customText),
                          });
                        }
                      }}
                      className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-200/80 disabled:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500"
                    >
                      <option value="">Pilih keterangan...</option>
                      {VISIT_REASON_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                      <option value={CUSTOM_REASON_VALUE}>Custom (Isi Sendiri)</option>
                    </select>
                  </div>

                  <div className={canEditSelectedCell ? 'lg:col-span-2' : 'lg:col-span-3'}>
                    <label
                      htmlFor={`visit-note-${entry.id}`}
                      className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
                    >
                      Keterangan Custom
                    </label>
                    <input
                      id={`visit-note-${entry.id}`}
                      type="text"
                      maxLength={100}
                      disabled={!canEditSelectedCell}
                      value={parsedNote.customText}
                      placeholder={
                        canEditSelectedCell
                          ? parsedNote.category && parsedNote.category !== CUSTOM_REASON_VALUE
                            ? 'Catatan tambahan (opsional)'
                            : 'Isi keterangan sendiri...'
                          : 'Terkunci'
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!parsedNote.category) {
                          setCustomModeByRow((prev) => ({ ...prev, [entry.id]: true }));
                          handleUpdateRow(entry.id, { n: val });
                        } else if (parsedNote.category === CUSTOM_REASON_VALUE) {
                          handleUpdateRow(entry.id, { n: val });
                        } else {
                          handleUpdateRow(entry.id, {
                            n: composeVisitNote(parsedNote.category, val),
                          });
                        }
                      }}
                      className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-200/80 disabled:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500"
                    />
                  </div>

                  {canEditSelectedCell && (
                    <div className="flex justify-end lg:col-span-1">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(entry.id)}
                        title="Hapus baris kunjungan ini"
                        aria-label={`Hapus kunjungan #${idx + 1}`}
                        className="inline-flex h-[40px] w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-red-600 transition-colors hover:border-red-200 hover:bg-red-50 dark:border-slate-700 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/50 lg:w-10 lg:px-0"
                      >
                        <Trash2 className="h-4 w-4 shrink-0" />
                        <span className="lg:hidden">Hapus</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Leaderboard */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Dashboard Kunjungan ke Outlet · {config.label}
          </h2>
          <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
            Total kunjungan: {grandTotalVisits}x · Hari berjalan: {elapsedDays} dari {days.length} hari kerja
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                <th className="w-12 px-5 py-3">#</th>
                <th className="px-4 py-3">Nama PIC</th>
                <th className="px-4 py-3 text-right">Hari Kunjungan</th>
                <th className="px-4 py-3 text-right">Total Kunjungan</th>
                <th className="px-4 py-3 text-right">Hari Berjalan</th>
                <th className="px-5 py-3">Rate Kunjungan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r, idx) => {
                const pct = Math.round(r.rate * 100);
                return (
                  <tr
                    key={r.person}
                    className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                  >
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-slate-100">
                      {r.person}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-medium text-slate-900 tabular-nums dark:text-slate-100">
                      {r.visitedCount}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-medium text-slate-700 tabular-nums dark:text-slate-300">
                      {r.totalVisits}x
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-600 tabular-nums dark:text-slate-300">
                      {r.elapsedDays}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-blue-700 transition-transform dark:bg-blue-500"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums dark:text-slate-300">
                          {pct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Matrix */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Total Kunjungan per Hari
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Klik sel tanggal pada matriks untuk melihat atau mengubah detail di formulir atas
            </p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {fmtDate(days[0])} – {fmtDate(days[days.length - 1])}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                <th className="sticky left-0 z-10 bg-slate-50 px-5 py-3 font-medium dark:bg-slate-800/90">
                  Nama PIC
                </th>
                {days.map((d) => {
                  const isToday = d === today;
                  return (
                    <th
                      key={d}
                      title={fmtDateFull(d)}
                      className={`px-1.5 py-3 text-center font-mono font-medium tabular-nums ${
                        isToday ? 'text-blue-700 dark:text-blue-400' : ''
                      }`}
                    >
                      {fmtDate(d).slice(0, 2)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {personList.map((person) => (
                <tr key={person}>
                  <td className="sticky left-0 z-10 bg-white px-5 py-2.5 font-semibold text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                    {person}
                  </td>
                  {days.map((d) => {
                    const v = store.visit[`${person}|${d}`];
                    const isSelected = activePerson === person && activeDay === d;
                    const isToday = d === today;
                    const visited = Boolean(v?.ok);
                    const entries = visited ? getVisitEntries(v) : [];
                    const count = visited ? Math.max(1, entries.length) : 0;
                    const detailsText = entries
                      .map(
                        (e) =>
                          `${e.outlet || 'Outlet'}${e.f || e.t ? ` (${e.f || '?'}–${e.t || '?'})` : ''}${e.n ? `: ${e.n}` : ''}`
                      )
                      .join(' | ');
                    const tooltip = visited
                      ? `${person} · ${fmtDateLong(d)}${isToday ? ' (Hari H)' : ''} · ${count}x: ${detailsText}`
                      : `${person} · ${fmtDateLong(d)}${isToday ? ' (Hari H — belum dicatat)' : ''}`;

                    return (
                      <td
                        key={d}
                        className={`px-1 py-1.5 text-center ${
                          isToday ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                        }`}
                      >
                        <button
                          type="button"
                          title={tooltip}
                          aria-label={tooltip}
                          onClick={() => {
                            setSavedNotice(null);
                            setVisitPerson(person);
                            setVisitDay(d);
                          }}
                          className={`mx-auto flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                            isSelected
                              ? 'ring-2 ring-blue-600 ring-offset-1 dark:ring-offset-slate-900'
                              : ''
                          } ${
                            visited
                              ? isToday
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-400 dark:hover:bg-emerald-950'
                                : 'bg-emerald-50/60 text-emerald-700/75 hover:bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400/75 dark:hover:bg-emerald-950/50'
                              : isToday
                                ? 'border border-blue-200 bg-white text-slate-400 hover:bg-blue-50 hover:text-blue-700 dark:border-blue-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
                                : 'bg-slate-100/70 text-slate-300 hover:bg-slate-200/70 hover:text-slate-500 dark:bg-slate-800/40 dark:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-400'
                          }`}
                        >
                          {visited ? (
                            count > 1 ? (
                              <span className="font-mono text-[11px] font-bold tabular-nums">
                                {count}x
                              </span>
                            ) : (
                              <Check className="h-4 w-4" />
                            )
                          ) : (
                            <Minus className="h-3 w-3" />
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
