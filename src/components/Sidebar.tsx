import {
  BarChart3,
  CalendarCheck,
  ClipboardEdit,
  Database,
  LogOut,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import {
  AccountProfile,
  AppView,
  OperationalRoleId,
  OutletStoreState,
  RoleConfig,
} from '../types/outlet';
import {
  OPERATIONAL_ROLES,
  ROLE_LABELS,
  calcTask,
  fmtDate,
  getPeopleMap,
  getPersonList,
  todayIso,
} from '../utils/outletLogic';

interface SidebarProps {
  account: AccountProfile;
  activeRoleId: OperationalRoleId;
  onChangeRoleId: (roleId: OperationalRoleId) => void;
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  config: RoleConfig;
  store: OutletStoreState;
  days: string[];
  selectedDay: string;
  onSignOut: () => void;
}

const OPERATIONAL_NAV: Array<{
  id: AppView;
  label: string;
  icon: typeof ClipboardEdit;
}> = [
  { id: 'input', label: 'Input Harian', icon: ClipboardEdit },
  { id: 'rekap', label: 'Rekap & Ranking', icon: BarChart3 },
  { id: 'kunj', label: 'Kunjungan', icon: CalendarCheck },
  { id: 'data', label: 'Data & Ekspor', icon: Database },
];

const ADMIN_NAV: Array<{
  id: AppView;
  label: string;
  icon: typeof SlidersHorizontal;
}> = [
  { id: 'admin_tasks', label: 'Tugas & Outlet', icon: SlidersHorizontal },
  { id: 'admin_accounts', label: 'Kelola Akun', icon: Users },
];

export function Sidebar({
  account,
  activeRoleId,
  onChangeRoleId,
  activeView,
  onSelectView,
  mobileOpen,
  onCloseMobile,
  config,
  store,
  days,
  selectedDay,
  onSignOut,
}: SidebarProps) {
  const today = todayIso();
  const isAdmin = account.role === 'admin';
  const personList = getPersonList(config.outlets);
  const peopleMap = getPeopleMap(config.outlets);

  const picPendingSummary = personList.map((person) => {
    const outlets = peopleMap[person] || [];
    let pendingItems = 0;
    for (const outletCode of outlets) {
      for (const task of config.tasks) {
        if (calcTask(store, days, config.tasks, outletCode, selectedDay, task.key, today).pend) {
          pendingItems++;
        }
      }
    }
    return {
      person,
      pendingItems,
    };
  });

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between border-r border-slate-200 bg-white px-4 py-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="space-y-5 overflow-y-auto">
        <div className="flex items-center justify-between px-2">
          <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap dark:text-slate-100">
            Update Harian Outlet
          </span>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Tutup menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Admin Workspace Switcher */}
        {isAdmin && (
          <div className="px-2">
            <label
              htmlFor="sidebar-role-switch"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Workspace Role
            </label>
            <select
              id="sidebar-role-switch"
              value={activeRoleId}
              onChange={(e) => onChangeRoleId(e.target.value as OperationalRoleId)}
              className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {OPERATIONAL_ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Operational Navigation */}
        <nav className="space-y-1" aria-label="Navigasi operasional">
          {OPERATIONAL_NAV.filter((item) => item.id !== 'rekap' || isAdmin).map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectView(item.id);
                  onCloseMobile();
                }}
                className={`flex min-h-[42px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-600 ${
                  isActive
                    ? 'bg-blue-700 text-white dark:bg-blue-600'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Admin Navigation */}
        {isAdmin && (
          <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="px-3 pb-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">
              Administrasi
            </div>
            <nav className="space-y-1" aria-label="Navigasi admin">
              {ADMIN_NAV.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectView(item.id);
                      onCloseMobile();
                    }}
                    className={`flex min-h-[42px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-600 ${
                      isActive
                        ? 'bg-blue-700 text-white dark:bg-blue-600'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        )}
      </div>

      {/* Bottom Summary & Account */}
      <div className="space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
        {picPendingSummary.length > 0 && config.tasks.length > 0 && (
          <div>
            <div className="px-2 pb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              Pending {config.label} · {fmtDate(selectedDay)}
            </div>
            <div className="max-h-36 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800/70">
              {picPendingSummary.map((row) => (
                <div
                  key={row.person}
                  className="flex items-center justify-between px-2 py-1.5 text-xs"
                >
                  <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                    {row.person}
                  </span>
                  <span
                    className={`shrink-0 font-mono tabular-nums ${
                      row.pendingItems > 0
                        ? 'font-medium text-red-600 dark:text-red-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {row.pendingItems > 0 ? `${row.pendingItems} pending` : 'Lengkap'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="px-2">
            <div className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
              {account.name}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
              {ROLE_LABELS[account.role]} · {account.email}
            </div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="mt-2.5 flex min-h-[38px] w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span>Keluar Akun</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-64 shrink-0 lg:block">{sidebarContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-50 h-full w-64 max-w-[82vw]">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}
