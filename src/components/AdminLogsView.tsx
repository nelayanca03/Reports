import { ChevronLeft, ChevronRight, Download, History, RotateCcw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  AccountProfile,
  InputLogActionType,
  InputLogEntry,
  OperationalRoleId,
  RoleConfig,
} from '../types/outlet';
import { downloadXlsxWorkbook } from '../utils/exportXlsx';
import {
  OPERATIONAL_ROLES,
  ROLE_LABELS,
  buildInputLogsTable,
  fmtDateLong,
  fmtDateTimeWithSeconds,
  todayIso,
} from '../utils/outletLogic';

interface AdminLogsViewProps {
  logs: InputLogEntry[];
  accounts: AccountProfile[];
  roleConfigs: Record<OperationalRoleId, RoleConfig>;
}

const LOG_PAGE_SIZE = 5;

export function AdminLogsView({ logs, accounts, roleConfigs }: AdminLogsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [actionFilter, setActionFilter] = useState<'ALL' | InputLogActionType>('ALL');
  const [outletFilter, setOutletFilter] = useState<string>('ALL');
  const [dateMode, setDateMode] = useState<'single' | 'range'>('single');
  const [dateExact, setDateExact] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);

  const userOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const acc of accounts) {
      map.set(acc.email.toLowerCase(), `${acc.name} (${acc.email})`);
    }
    for (const log of logs) {
      const email = log.userEmail.toLowerCase();
      if (!map.has(email)) {
        map.set(email, `${log.userName} (${log.userEmail})`);
      }
    }
    return Array.from(map.entries())
      .map(([email, label]) => ({ email, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [accounts, logs]);

  const outletOptions = useMemo(() => {
    const set = new Set<string>();
    for (const cfg of Object.values(roleConfigs)) {
      for (const o of cfg.outlets) {
        if (o.code) set.add(o.code);
      }
    }
    for (const log of logs) {
      for (const part of log.outlet.split(',')) {
        const clean = part.trim();
        if (clean && clean !== '-') set.add(clean);
      }
    }
    return Array.from(set).sort();
  }, [logs, roleConfigs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs.filter((log) => {
      if (userFilter !== 'ALL' && log.userEmail.toLowerCase() !== userFilter) {
        return false;
      }
      if (roleFilter !== 'ALL' && log.roleId !== roleFilter) {
        return false;
      }
      if (actionFilter !== 'ALL' && log.actionType !== actionFilter) {
        return false;
      }
      if (outletFilter !== 'ALL') {
        const logOutlets = log.outlet
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (!logOutlets.includes(outletFilter)) return false;
      }
      if (dateMode === 'single') {
        if (dateExact && log.day !== dateExact) return false;
      } else {
        if (dateFrom && log.day < dateFrom) return false;
        if (dateTo && log.day > dateTo) return false;
      }

      if (q) {
        const haystack = [
          log.userName,
          log.userEmail,
          log.pic,
          log.outlet,
          log.details,
          log.roleLabel,
          log.day,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [
    logs,
    searchQuery,
    userFilter,
    roleFilter,
    actionFilter,
    outletFilter,
    dateMode,
    dateExact,
    dateFrom,
    dateTo,
  ]);

  const hasActiveFilter =
    Boolean(searchQuery.trim()) ||
    userFilter !== 'ALL' ||
    roleFilter !== 'ALL' ||
    actionFilter !== 'ALL' ||
    outletFilter !== 'ALL' ||
    (dateMode === 'single' ? Boolean(dateExact) : Boolean(dateFrom) || Boolean(dateTo));

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / LOG_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = filteredLogs.length === 0 ? 0 : (safePage - 1) * LOG_PAGE_SIZE;
  const endIndex = Math.min(startIndex + LOG_PAGE_SIZE, filteredLogs.length);
  const displayedLogs = useMemo(
    () => filteredLogs.slice(startIndex, endIndex),
    [filteredLogs, startIndex, endIndex]
  );

  const handleResetFilters = () => {
    setSearchQuery('');
    setUserFilter('ALL');
    setRoleFilter('ALL');
    setActionFilter('ALL');
    setOutletFilter('ALL');
    setDateExact('');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  const handleExportLogs = () => {
    const table = buildInputLogsTable(filteredLogs);
    downloadXlsxWorkbook(`log-history-penginputan-${todayIso()}.xlsx`, [
      { name: 'Log Penginputan', columns: table.columns, rows: table.rows },
    ]);
  };

  return (
    <div className="space-y-5">
      {/* Header & Filter Panel */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Log History Penginputan Semua User
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Riwayat pengisian harian dan kunjungan outlet seluruh akun (300 aktivitas terbaru).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasActiveFilter && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset Filter</span>
              </button>
            )}
            <button
              type="button"
              disabled={filteredLogs.length === 0}
              onClick={handleExportLogs}
              className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Ekspor XLSX ({filteredLogs.length})</span>
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <label
              htmlFor="log-search"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Cari User / Outlet / Keterangan
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="log-search"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Nama user, email, outlet, atau detail..."
                className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="lg:col-span-3">
            <label
              htmlFor="log-user-filter"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Filter User
            </label>
            <select
              id="log-user-filter"
              value={userFilter}
              onChange={(e) => {
                setUserFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="ALL">Semua User ({userOptions.length})</option>
              {userOptions.map((u) => (
                <option key={u.email} value={u.email}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label
              htmlFor="log-role-filter"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Workspace Role
            </label>
            <select
              id="log-role-filter"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="ALL">Semua Role</option>
              {OPERATIONAL_ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-3">
            <label
              htmlFor="log-action-filter"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Jenis Aktivitas
            </label>
            <select
              id="log-action-filter"
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value as 'ALL' | InputLogActionType);
                setCurrentPage(1);
              }}
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="ALL">Semua Aktivitas</option>
              <option value="input_harian">Input Harian</option>
              <option value="kunjungan">Kunjungan Outlet</option>
            </select>
          </div>

          <div className="lg:col-span-4">
            <label
              htmlFor="log-outlet-filter"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Filter Outlet
            </label>
            <select
              id="log-outlet-filter"
              value={outletFilter}
              onChange={(e) => {
                setOutletFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="ALL">Semua Outlet ({outletOptions.length})</option>
              {outletOptions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 lg:col-span-8">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label
                htmlFor={dateMode === 'single' ? 'log-date-exact' : 'log-date-from'}
                className="text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                {dateMode === 'single' ? 'Filter Tanggal Kerja (Per Tanggal)' : 'Filter Tanggal Kerja (Range Tanggal)'}
              </label>
              <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setDateMode('single');
                    setCurrentPage(1);
                  }}
                  className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                    dateMode === 'single'
                      ? 'bg-white text-blue-700 shadow-xs dark:bg-slate-900 dark:text-blue-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  Per Tanggal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateMode('range');
                    setCurrentPage(1);
                  }}
                  className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                    dateMode === 'range'
                      ? 'bg-white text-blue-700 shadow-xs dark:bg-slate-900 dark:text-blue-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  Range Tanggal
                </button>
              </div>
            </div>

            {dateMode === 'single' ? (
              <input
                id="log-date-exact"
                type="date"
                value={dateExact}
                onChange={(e) => {
                  setDateExact(e.target.value);
                  setCurrentPage(1);
                }}
                className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  id="log-date-from"
                  type="date"
                  aria-label="Tanggal Kerja Dari"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <input
                  id="log-date-to"
                  type="date"
                  aria-label="Tanggal Kerja Sampai"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Logs Table */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Riwayat Aktivitas ({filteredLogs.length}
              {filteredLogs.length !== logs.length ? ` dari ${logs.length}` : ''})
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Terbaru di atas
            </span>
            <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums dark:text-slate-200">
              {filteredLogs.length === 0
                ? '(0/0)'
                : `(${startIndex + 1}–${endIndex}/${filteredLogs.length})`}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  aria-label="Halaman log sebelumnya"
                  title="5 log lebih baru"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  aria-label="Halaman log berikutnya"
                  title="5 log berikutnya"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            {logs.length === 0
              ? 'Belum ada riwayat penginputan yang tercatat. Log baru otomatis tersimpan setiap kali user menekan tombol Save pada Input Harian atau Kunjungan.'
              : 'Tidak ada log penginputan yang cocok dengan filter yang dipilih.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                  <th className="px-5 py-3 whitespace-nowrap">Waktu Input</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3 whitespace-nowrap">Aktivitas</th>
                  <th className="px-4 py-3 whitespace-nowrap">Tanggal Kerja</th>
                  <th className="px-4 py-3">PIC & Outlet</th>
                  <th className="px-5 py-3">Detail Penginputan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {displayedLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="align-top transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                  >
                    <td className="px-5 py-3.5 font-mono text-[11px] whitespace-nowrap text-slate-600 tabular-nums dark:text-slate-300">
                      {fmtDateTimeWithSeconds(log.clientTs) || log.clientTs || '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {log.userName}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {log.userEmail}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                        {ROLE_LABELS[log.userRole] || log.userRole}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          log.actionType === 'kunjungan'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                            : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                        }`}
                      >
                        {log.actionType === 'kunjungan' ? 'Kunjungan' : 'Input Harian'}
                      </span>
                      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {log.roleLabel} ({log.itemCount} item)
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono whitespace-nowrap text-slate-700 tabular-nums dark:text-slate-300">
                      {fmtDateLong(log.day)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {log.outlet || '—'}
                      </div>
                      {log.pic && (
                        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          PIC: {log.pic}
                        </div>
                      )}
                    </td>
                    <td className="max-w-md px-5 py-3.5 leading-relaxed text-slate-700 dark:text-slate-300">
                      {log.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
            <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
              Menampilkan data <strong className="font-semibold text-slate-700 dark:text-slate-200">{startIndex + 1}–{endIndex}</strong> dari <strong className="font-semibold text-slate-700 dark:text-slate-200">{filteredLogs.length}</strong> (Halaman {safePage}/{totalPages})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Sebelumnya</span>
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <span>Berikutnya</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
