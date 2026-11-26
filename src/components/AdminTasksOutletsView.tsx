import { CalendarCheck2, Copy, Lock, LockOpen, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import {
  AccountProfile,
  FormulaType,
  OperationalRoleId,
  OutletAssignment,
  RoleConfig,
  TaskDefinition,
  TaskInputType,
} from '../types/outlet';
import {
  OPERATIONAL_ROLES,
  STOCK_ACCOUNTING_OUTLETS,
  STOCK_ACCOUNTING_TASKS,
  buildFormulaNote,
  buildMonthWorkingDays,
  currentMonthKey,
  fmtMonth,
  getPastMonths,
  getPeopleMap,
  getPersonList,
  getTaskInputType,
  getTaskTolerance,
  shiftMonthKey,
  todayIso,
} from '../utils/outletLogic';
import { ConfirmModal } from './ConfirmModal';

interface AdminTasksOutletsViewProps {
  roleConfigs: Record<OperationalRoleId, RoleConfig>;
  initialRoleId: OperationalRoleId;
  accounts: AccountProfile[];
  onSaveRoleConfig: (roleId: OperationalRoleId, nextConfig: RoleConfig) => Promise<void>;
  onSaveOpenUntilMonthAllRoles: (openUntilMonth?: string) => Promise<void>;
  onTogglePastMonthAllRoles: (monthKey: string, open: boolean) => Promise<void>;
}

const FORMULA_LABELS: Record<FormulaType, string> = {
  daily_plus_1: 'Harian (+1 dari tgl kerja)',
  weekly_plus_1: 'Mingguan (Selisih minggu + 1)',
  memo_month: 'Bulanan (Selisih bulan + 1)',
  ref_task: 'Mengikuti tugas lain',
};

function slugifyKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

export function AdminTasksOutletsView({
  roleConfigs,
  initialRoleId,
  accounts,
  onSaveRoleConfig,
  onSaveOpenUntilMonthAllRoles,
  onTogglePastMonthAllRoles,
}: AdminTasksOutletsViewProps) {
  const [targetRole, setTargetRole] = useState<OperationalRoleId>(initialRoleId);
  const config = roleConfigs[targetRole];

  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Task form state
  const [taskLabel, setTaskLabel] = useState('');
  const [taskShort, setTaskShort] = useState('');
  const [taskInputType, setTaskInputType] = useState<TaskInputType>('date');
  const [taskFormula, setTaskFormula] = useState<FormulaType>('daily_plus_1');
  const [taskRefKey, setTaskRefKey] = useState('');
  const [taskTolerance, setTaskTolerance] = useState<string>('1');
  const [toleranceDrafts, setToleranceDrafts] = useState<Record<string, string>>({});

  // Outlet form state
  const [outletPerson, setOutletPerson] = useState('');
  const [outletCode, setOutletCode] = useState('');

  // Month access state (defaults to configured openUntilMonth or Dec 2027 for convenience)
  const activeCalMonth = currentMonthKey(todayIso());
  const autoOpenMonth = shiftMonthKey(activeCalMonth, 1);
  const [openUntilDraft, setOpenUntilDraft] = useState<string>(
    () => config.openUntilMonth || '2027-12'
  );

  // Confirm delete dialog
  const [pendingDelete, setPendingDelete] = useState<
    | { type: 'task'; key: string; label: string }
    | { type: 'outlet'; code: string; person: string }
    | null
  >(null);

  const handleSelectRole = (rId: OperationalRoleId) => {
    setTargetRole(rId);
    setOpenUntilDraft(roleConfigs[rId]?.openUntilMonth || '2027-12');
    setToleranceDrafts({});
    setFeedback(null);
  };

  const peopleList = getPersonList(config.outlets);
  const peopleMap = getPeopleMap(config.outlets);
  const roleAccounts = accounts.filter((a) => a.active && a.role === targetRole);
  const suggestedPicNames = Array.from(
    new Set([
      ...peopleList,
      ...roleAccounts
        .map((a) => (a.picName || a.name).trim().toUpperCase())
        .filter(Boolean),
    ])
  );

  const activeCalDays = buildMonthWorkingDays(activeCalMonth);
  const effectiveOpenMonth =
    config.openUntilMonth && config.openUntilMonth > autoOpenMonth
      ? config.openUntilMonth
      : autoOpenMonth;
  const pastMonths = getPastMonths(todayIso()).slice().reverse();
  const unlockedPastSet = new Set(config.unlockedPastMonths || []);

  const handleSaveOpenMonthSingle = async (nextMonth?: string) => {
    setBusy(true);
    try {
      await onSaveRoleConfig(targetRole, {
        ...config,
        openUntilMonth: nextMonth,
      });
      if (nextMonth) {
        setOpenUntilDraft(nextMonth);
        setFeedback(
          `Akses periode ${config.label} dibuka hingga ${fmtMonth(`${nextMonth}-01`)}.`
        );
      } else {
        setFeedback(
          `Akses periode ${config.label} dikembalikan ke mode otomatis (bulan berjalan + 1).`
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSaveOpenMonthAll = async (nextMonth?: string) => {
    setBusy(true);
    try {
      await onSaveOpenUntilMonthAllRoles(nextMonth);
      if (nextMonth) {
        setOpenUntilDraft(nextMonth);
        setFeedback(
          `Akses periode untuk semua role (Stock Accounting, GL, Accounting) dibuka hingga ${fmtMonth(`${nextMonth}-01`)}.`
        );
      } else {
        setFeedback(
          'Akses periode semua role dikembalikan ke mode otomatis (bulan berjalan + 1).'
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleTogglePastMonthSingle = async (monthKey: string, open: boolean) => {
    setBusy(true);
    try {
      const prev = config.unlockedPastMonths || [];
      const next = open
        ? Array.from(new Set([...prev, monthKey])).sort()
        : prev.filter((m) => m !== monthKey);
      await onSaveRoleConfig(targetRole, {
        ...config,
        unlockedPastMonths: next,
      });
      setFeedback(
        open
          ? `Akses bulan ${fmtMonth(`${monthKey}-01`)} dibuka untuk user ${config.label}.`
          : `Akses bulan ${fmtMonth(`${monthKey}-01`)} ditutup kembali untuk user ${config.label}.`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleTogglePastMonthAll = async (monthKey: string, open: boolean) => {
    setBusy(true);
    try {
      await onTogglePastMonthAllRoles(monthKey, open);
      setFeedback(
        open
          ? `Akses bulan ${fmtMonth(`${monthKey}-01`)} dibuka untuk semua role.`
          : `Akses bulan ${fmtMonth(`${monthKey}-01`)} ditutup kembali untuk semua role.`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleAddTask = async (e: FormEvent) => {
    e.preventDefault();
    const cleanLabel = taskLabel.trim();
    if (!cleanLabel) return;
    const baseKey = slugifyKey(cleanLabel) || `tugas_${config.tasks.length + 1}`;
    let finalKey = baseKey;
    let counter = 2;
    while (config.tasks.some((t) => t.key === finalKey)) {
      finalKey = `${baseKey}_${counter++}`;
    }

    const parsedTolerance = Math.max(-15, Math.min(31, Math.round(Number(taskTolerance) || 0)));
    const refLabel =
      taskFormula === 'ref_task' && taskRefKey
        ? config.tasks.find((t) => t.key === taskRefKey)?.shortLabel || taskRefKey
        : undefined;
    const formulaNote = buildFormulaNote(taskFormula, parsedTolerance, refLabel);

    const newTask: TaskDefinition = {
      key: finalKey,
      label: cleanLabel.slice(0, 100),
      shortLabel: (taskShort.trim() || cleanLabel).slice(0, 24),
      defaultDate: '',
      inputType: taskInputType,
      formulaType: taskFormula,
      ...(taskFormula === 'ref_task' && taskRefKey ? { refTaskKey: taskRefKey } : {}),
      toleranceOffset: parsedTolerance,
      formulaNote,
    };

    setBusy(true);
    try {
      await onSaveRoleConfig(targetRole, {
        ...config,
        tasks: [...config.tasks, newTask],
      });
      setTaskLabel('');
      setTaskShort('');
      setFeedback(`Tugas "${newTask.label}" ditambahkan ke ${config.label}.`);
    } finally {
      setBusy(false);
    }
  };

  const handleChangeTaskInputType = async (task: TaskDefinition, nextType: TaskInputType) => {
    const tol = getTaskTolerance(task);
    const updatedTasks = config.tasks.map((t) => {
      if (t.key !== task.key) return t;
      let nextFormula: FormulaType = t.formulaType;
      let nextFormulaNote = t.formulaNote;
      if (t.formulaType !== 'ref_task') {
        if (nextType === 'month') {
          nextFormula = 'memo_month';
          nextFormulaNote = buildFormulaNote('memo_month', tol);
        } else if (nextType === 'week') {
          nextFormula = 'weekly_plus_1';
          nextFormulaNote = buildFormulaNote('weekly_plus_1', tol);
        } else {
          nextFormula = 'daily_plus_1';
          nextFormulaNote = buildFormulaNote('daily_plus_1', tol);
        }
      }
      return {
        ...t,
        inputType: nextType,
        formulaType: nextFormula,
        formulaNote: nextFormulaNote,
      };
    });
    const typeLabel =
      nextType === 'month'
        ? 'Per Bulan'
        : nextType === 'week'
          ? 'Per Minggu'
          : 'Per Tanggal';
    setBusy(true);
    try {
      await onSaveRoleConfig(targetRole, {
        ...config,
        tasks: updatedTasks,
      });
      setFeedback(`Jenis input tugas "${task.label}" diubah menjadi ${typeLabel}.`);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveTaskTolerance = async (task: TaskDefinition, rawValue: string) => {
    const parsed = Math.max(-15, Math.min(31, Math.round(Number(rawValue) || 0)));
    const refLabel =
      task.formulaType === 'ref_task' && task.refTaskKey
        ? config.tasks.find((t) => t.key === task.refTaskKey)?.shortLabel || task.refTaskKey
        : undefined;
    const updatedTasks = config.tasks.map((t) =>
      t.key === task.key
        ? {
            ...t,
            toleranceOffset: parsed,
            formulaNote: buildFormulaNote(t.formulaType, parsed, refLabel),
          }
        : t
    );

    setBusy(true);
    try {
      await onSaveRoleConfig(targetRole, {
        ...config,
        tasks: updatedTasks,
      });
      setToleranceDrafts((prev) => {
        const next = { ...prev };
        delete next[task.key];
        return next;
      });
      const unitWord =
        task.formulaType === 'memo_month'
          ? 'bulan'
          : task.formulaType === 'weekly_plus_1'
            ? 'minggu'
            : 'hari';
      setFeedback(
        `Batas toleransi tugas "${task.label}" diperbarui menjadi ${parsed >= 0 ? `+${parsed}` : parsed} ${unitWord}.`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleAddOutlet = async (e: FormEvent) => {
    e.preventDefault();
    const cleanPerson = outletPerson.trim().toUpperCase().slice(0, 60);
    const cleanCode = outletCode.trim().toUpperCase().slice(0, 40);
    if (!cleanPerson || !cleanCode) return;

    if (config.outlets.some((o) => o.code === cleanCode)) {
      setFeedback(`Outlet ${cleanCode} sudah terdaftar pada role ${config.label}.`);
      return;
    }

    const nextOutlets: OutletAssignment[] = [
      ...config.outlets,
      { person: cleanPerson, code: cleanCode },
    ];

    setBusy(true);
    try {
      await onSaveRoleConfig(targetRole, {
        ...config,
        outlets: nextOutlets,
      });
      setOutletCode('');
      setFeedback(`Outlet ${cleanCode} (${cleanPerson}) ditambahkan ke ${config.label}.`);
    } finally {
      setBusy(false);
    }
  };

  const handleCopyStockTemplate = async () => {
    setBusy(true);
    try {
      await onSaveRoleConfig(targetRole, {
        ...config,
        tasks: config.tasks.length ? config.tasks : STOCK_ACCOUNTING_TASKS,
        outlets: config.outlets.length ? config.outlets : STOCK_ACCOUNTING_OUTLETS,
      });
      setFeedback(`Template tugas & outlet berhasil disalin ke ${config.label}.`);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      if (pendingDelete.type === 'task') {
        await onSaveRoleConfig(targetRole, {
          ...config,
          tasks: config.tasks.filter((t) => t.key !== pendingDelete.key),
        });
        setFeedback(`Tugas "${pendingDelete.label}" dihapus dari ${config.label}.`);
      } else {
        await onSaveRoleConfig(targetRole, {
          ...config,
          outlets: config.outlets.filter(
            (o) => !(o.code === pendingDelete.code && o.person === pendingDelete.person)
          ),
        });
        setFeedback(`Outlet ${pendingDelete.code} dihapus dari ${config.label}.`);
      }
    } finally {
      setBusy(false);
      setPendingDelete(null);
    }
  };

  return (
    <div className="space-y-5">
      {feedback && (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
        >
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-medium underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Role Target Switcher */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Kelola Tugas & Outlet per Role
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Pilih role operasional untuk menambah atau mengatur daftar tugas, PIC, dan outlet yang dikerjakan.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {OPERATIONAL_ROLES.map((r) => {
              const isSelected = targetRole === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleSelectRole(r.id)}
                  className={`min-h-[38px] whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        {targetRole !== 'stock_accounting' &&
          config.tasks.length === 0 &&
          config.outlets.length === 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-800/50">
              <span className="text-xs text-slate-600 dark:text-slate-300">
                Role {config.label} belum memiliki tugas dan outlet. Anda dapat menambahkannya manual di bawah atau menyalin daftar awal dari Stock Accounting lalu menyesuaikannya.
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={handleCopyStockTemplate}
                className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Salin Template Awal</span>
              </button>
            </div>
          )}
      </section>

      {/* Automatic Monthly Period + Admin Period Access Control */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
              <CalendarCheck2 className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Periode Kerja & Akses Bulan/Tahun · {config.label}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Hari kerja otomatis mengikuti bulan kalender (Senin–Sabtu, tanpa hari Minggu) dan otomatis bertambah setiap masuk bulan baru. Admin juga dapat langsung membuka akses bulan tahun 2027 (atau tahun berikutnya) untuk semua role — tanggal yang belum tiba tetap dikunci hanya baca sampai hari kerja tersebut tiba.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-right dark:border-slate-700 dark:bg-slate-800">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Akses Terbuka Saat Ini
            </div>
            <div className="font-mono text-xs font-semibold text-slate-900 tabular-nums dark:text-slate-100">
              s.d. {fmtMonth(`${effectiveOpenMonth}-01`)} ({activeCalDays.length} hr/bln ini)
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div>
            <label
              htmlFor="open-until-month"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Buka Akses Periode Hingga Bulan
            </label>
            <input
              id="open-until-month"
              type="month"
              min="2026-11"
              max="2030-12"
              value={openUntilDraft}
              onChange={(e) => setOpenUntilDraft(e.target.value)}
              className="min-h-[40px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <button
            type="button"
            disabled={busy || !openUntilDraft}
            onClick={() => handleSaveOpenMonthSingle(openUntilDraft)}
            className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <LockOpen className="h-3.5 w-3.5" />
            <span>Buka untuk {config.label}</span>
          </button>

          <button
            type="button"
            disabled={busy || !openUntilDraft}
            onClick={() => handleSaveOpenMonthAll(openUntilDraft)}
            className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <LockOpen className="h-3.5 w-3.5" />
            <span>Terapkan ke Semua Role</span>
          </button>

          {effectiveOpenMonth < '2027-12' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleSaveOpenMonthAll('2027-12')}
              className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-800 transition-colors hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60"
            >
              <span>Buka Penuh 2027 (Semua Role)</span>
            </button>
          )}

          {config.openUntilMonth && (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleSaveOpenMonthAll(undefined)}
              className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Mode Otomatis</span>
            </button>
          )}
        </div>

        {/* Past Month Lock / Unlock Management */}
        <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-xs font-semibold tracking-wide text-slate-900 uppercase dark:text-slate-100">
                Akses Bulan yang Sudah Terlewati (User Non-Admin)
              </h4>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Bulan yang sudah terlewati otomatis tertutup bagi user non-admin. Admin tetap dapat melihat semua bulan dan berhak membuka atau menutup kembali akses bulan lalu. Bulan berjalan selalu terbuka.
              </p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
              Bulan Berjalan ({fmtMonth(`${activeCalMonth}-01`)}) · Selalu Terbuka
            </div>
          </div>

          {pastMonths.length === 0 ? (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
              Belum ada bulan yang terlewati sebelum {fmtMonth(`${activeCalMonth}-01`)}. Memasuki bulan berikutnya, bulan yang telah lewat otomatis terkunci bagi user dan kontrol Buka / Tutup akan muncul di sini.
            </div>
          ) : (
            <div className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50/60 dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-800/30">
              {pastMonths.map((mKey) => {
                const isOpenForRole = unlockedPastSet.has(mKey);
                const openRolesCount = OPERATIONAL_ROLES.filter((r) =>
                  (roleConfigs[r.id]?.unlockedPastMonths || []).includes(mKey)
                ).length;
                const allRolesOpen = openRolesCount === OPERATIONAL_ROLES.length;

                return (
                  <div
                    key={mKey}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                        {fmtMonth(`${mKey}-01`)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                          isOpenForRole
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {isOpenForRole ? (
                          <LockOpen className="h-3 w-3" />
                        ) : (
                          <Lock className="h-3 w-3" />
                        )}
                        <span>
                          {isOpenForRole
                            ? `Terbuka (${config.label})`
                            : `Tertutup (${config.label})`}
                        </span>
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {openRolesCount}/{OPERATIONAL_ROLES.length} role terbuka
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleTogglePastMonthSingle(mKey, !isOpenForRole)}
                        className={`inline-flex min-h-[34px] items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                          isOpenForRole
                            ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                            : 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60'
                        }`}
                      >
                        {isOpenForRole ? (
                          <Lock className="h-3.5 w-3.5" />
                        ) : (
                          <LockOpen className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {isOpenForRole
                            ? `Tutup ${config.label}`
                            : `Buka ${config.label}`}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleTogglePastMonthAll(mKey, !allRolesOpen)}
                        className={`inline-flex min-h-[34px] items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                          allRolesOpen
                            ? 'border border-slate-300 bg-slate-200/80 text-slate-800 hover:bg-slate-300/80 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600'
                            : 'bg-blue-700 text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500'
                        }`}
                      >
                        {allRolesOpen ? (
                          <Lock className="h-3.5 w-3.5" />
                        ) : (
                          <LockOpen className="h-3.5 w-3.5" />
                        )}
                        <span>{allRolesOpen ? 'Tutup Semua Role' : 'Buka Semua Role'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Tasks Manager */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Daftar Tugas · {config.label} ({config.tasks.length})
          </h3>
        </div>

        <form
          onSubmit={handleAddTask}
          className="grid grid-cols-1 items-end gap-3 border-b border-slate-200 bg-slate-50/60 p-5 sm:grid-cols-2 lg:grid-cols-12 dark:border-slate-800 dark:bg-slate-800/30"
        >
          <div className="lg:col-span-3">
            <label
              htmlFor="new-task-label"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Nama Tugas
            </label>
            <input
              id="new-task-label"
              type="text"
              required
              value={taskLabel}
              onChange={(e) => setTaskLabel(e.target.value)}
              placeholder="Contoh: Rekonsiliasi Bank"
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="lg:col-span-2">
            <label
              htmlFor="new-task-short"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Singkatan
            </label>
            <input
              id="new-task-short"
              type="text"
              value={taskShort}
              onChange={(e) => setTaskShort(e.target.value)}
              placeholder="Rekon Bank"
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="lg:col-span-2">
            <label
              htmlFor="new-task-input-type"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Jenis Input
            </label>
            <select
              id="new-task-input-type"
              value={taskInputType}
              onChange={(e) => {
                const nextInput = e.target.value as TaskInputType;
                setTaskInputType(nextInput);
                if (nextInput === 'month') {
                  setTaskFormula('memo_month');
                  setTaskTolerance('1');
                } else if (nextInput === 'week') {
                  setTaskFormula('weekly_plus_1');
                  setTaskTolerance('1');
                } else if (taskFormula === 'memo_month' || taskFormula === 'weekly_plus_1') {
                  setTaskFormula('daily_plus_1');
                  setTaskTolerance('1');
                }
              }}
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="date">Per Tanggal</option>
              <option value="week">Per Minggu</option>
              <option value="month">Per Bulan</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <label
              htmlFor="new-task-formula"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Rumus Keterlambatan
            </label>
            <select
              id="new-task-formula"
              value={taskFormula}
              onChange={(e) => {
                const nextFormula = e.target.value as FormulaType;
                setTaskFormula(nextFormula);
                setTaskTolerance(nextFormula === 'ref_task' ? '0' : '1');
                if (nextFormula === 'memo_month') {
                  setTaskInputType('month');
                } else if (nextFormula === 'weekly_plus_1') {
                  setTaskInputType('week');
                } else if (
                  nextFormula === 'daily_plus_1' &&
                  (taskInputType === 'month' || taskInputType === 'week')
                ) {
                  setTaskInputType('date');
                }
              }}
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="daily_plus_1">Harian (vs tgl kerja)</option>
              <option value="weekly_plus_1">Mingguan (vs minggu ini)</option>
              <option value="memo_month">Bulanan (vs bulan ini)</option>
              {config.tasks.length > 0 && (
                <option value="ref_task">Mengikuti tugas lain</option>
              )}
            </select>
          </div>

          <div className="lg:col-span-1">
            <label
              htmlFor="new-task-tol"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
              title="Contoh: 1 = toleransi H-1 masih dianggap Update; 0 = harus tepat hari H; 2 = toleransi 2 hari"
            >
              Toleransi
            </label>
            <input
              id="new-task-tol"
              type="number"
              min={-15}
              max={31}
              value={taskTolerance}
              onChange={(e) => setTaskTolerance(e.target.value)}
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          {taskFormula === 'ref_task' && config.tasks.length > 0 && (
            <div className="lg:col-span-2">
              <label
                htmlFor="new-task-ref"
                className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Tugas Acuan
              </label>
              <select
                id="new-task-ref"
                value={taskRefKey}
                onChange={(e) => setTaskRefKey(e.target.value)}
                className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">Pilih tugas...</option>
                {config.tasks.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="lg:col-span-2">
            <button
              type="submit"
              disabled={busy || !taskLabel.trim()}
              className="flex min-h-[40px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" />
              <span>Tambah Tugas</span>
            </button>
          </div>
        </form>

        {config.tasks.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Belum ada tugas untuk role {config.label}. Gunakan formulir di atas untuk menambahkan tugas.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                  <th className="px-5 py-3">Nama Tugas</th>
                  <th className="px-4 py-3">Singkatan</th>
                  <th className="px-4 py-3">Jenis Input</th>
                  <th className="px-4 py-3">Rumus</th>
                  <th className="px-4 py-3">Toleransi Keterlambatan</th>
                  <th className="px-5 py-3 text-right">Hapus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {config.tasks.map((t) => {
                  const savedTol = getTaskTolerance(t);
                  const draftVal = toleranceDrafts[t.key] ?? String(savedTol);
                  const isDirty = draftVal !== String(savedTol);
                  const unitLabel =
                    t.formulaType === 'memo_month'
                      ? 'bln'
                      : t.formulaType === 'weekly_plus_1'
                        ? 'mgg'
                        : 'hari';
                  const currentInputType = getTaskInputType(t);
                  return (
                    <tr key={t.key} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {t.label}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {t.shortLabel}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Jenis input ${t.label}`}
                          disabled={busy}
                          value={currentInputType}
                          onChange={(e) =>
                            handleChangeTaskInputType(t, e.target.value as TaskInputType)
                          }
                          className="min-h-[34px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <option value="date">Per Tanggal</option>
                          <option value="week">Per Minggu</option>
                          <option value="month">Per Bulan</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {FORMULA_LABELS[t.formulaType]}
                        {t.refTaskKey ? ` (${t.refTaskKey})` : ''}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={-15}
                            max={31}
                            disabled={busy}
                            aria-label={`Toleransi ${t.label}`}
                            value={draftVal}
                            onChange={(e) =>
                              setToleranceDrafts((prev) => ({
                                ...prev,
                                [t.key]: e.target.value,
                              }))
                            }
                            className="min-h-[34px] w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          />
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {unitLabel}
                          </span>
                          {isDirty && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleSaveTaskTolerance(t, draftVal)}
                              className="min-h-[32px] rounded-md bg-blue-700 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
                            >
                              Simpan
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setPendingDelete({ type: 'task', key: t.key, label: t.label })
                          }
                          aria-label={`Hapus tugas ${t.label}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Toleransi +1 berarti input H-1 masih berstatus UPDATE (0 dianggap tepat batas); ubah ke 0 jika harus tepat hari H, atau +2 / lebih untuk memperlonggar batas keterlambatan.
            </div>
          </div>
        )}
      </section>

      {/* Outlets & PIC Manager */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Daftar PIC & Outlet · {config.label} ({config.outlets.length} outlet)
          </h3>
        </div>

        <form
          onSubmit={handleAddOutlet}
          className="grid grid-cols-1 items-end gap-3 border-b border-slate-200 bg-slate-50/60 p-5 sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-800/30"
        >
          <div>
            <label
              htmlFor="new-outlet-person"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Nama PIC
            </label>
            <input
              id="new-outlet-person"
              type="text"
              list="existing-pic-list"
              required
              value={outletPerson}
              onChange={(e) => setOutletPerson(e.target.value)}
              placeholder="Contoh: PETER atau PIC baru"
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <datalist id="existing-pic-list">
              {suggestedPicNames.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            {roleAccounts.length > 0 && (
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                Saran akun {config.label}:{' '}
                {roleAccounts
                  .map((a) => `${(a.picName || a.name).toUpperCase()}`)
                  .join(', ')}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="new-outlet-code"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Kode / Nama Outlet
            </label>
            <input
              id="new-outlet-code"
              type="text"
              required
              value={outletCode}
              onChange={(e) => setOutletCode(e.target.value)}
              placeholder="Contoh: NKPM atau OUTLET-A"
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <button
            type="submit"
            disabled={busy || !outletPerson.trim() || !outletCode.trim()}
            className="flex min-h-[40px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            <span>Tambah Outlet</span>
          </button>
        </form>

        {peopleList.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Belum ada outlet untuk role {config.label}. Tambahkan PIC dan kode outlet di atas.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {peopleList.map((person) => (
              <div key={person} className="flex flex-col gap-2.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {person}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {peopleMap[person].length} outlet ditugaskan
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {peopleMap[person].map((code) => (
                    <div
                      key={code}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <span>{code}</span>
                      <button
                        type="button"
                        onClick={() => setPendingDelete({ type: 'outlet', code, person })}
                        aria-label={`Hapus outlet ${code}`}
                        className="text-slate-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title={
          pendingDelete?.type === 'task'
            ? `Hapus tugas "${pendingDelete.label}"?`
            : `Hapus outlet "${pendingDelete?.code}"?`
        }
        description="Item ini akan dihapus dari konfigurasi role aktif. Riwayat input sebelumnya tidak ikut terhapus dari database."
        confirmLabel="Ya, Hapus"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
