import { Download, Menu, Moon, Sun } from 'lucide-react';
import { AppView } from '../types/outlet';

interface TopBarProps {
  activeView: AppView;
  roleLabel: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenMobileMenu: () => void;
  onQuickExportCsv: () => void;
}

const VIEW_TITLES: Record<AppView, string> = {
  input: 'Input Harian',
  rekap: 'Rekap & Ranking',
  kunj: 'Kunjungan Outlet',
  data: 'Data & Ekspor',
  admin_tasks: 'Kelola Tugas & Outlet',
  admin_accounts: 'Kelola Akun',
};

export function TopBar({
  activeView,
  roleLabel,
  theme,
  onToggleTheme,
  onOpenMobileMenu,
  onQuickExportCsv,
}: TopBarProps) {
  const isAdminView = activeView === 'admin_tasks' || activeView === 'admin_accounts';

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-sm sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Buka menu navigasi"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 lg:hidden dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="hidden text-slate-400 sm:inline dark:text-slate-500">
            {isAdminView ? 'Administrasi' : roleLabel}
          </span>
          <span className="hidden text-slate-300 sm:inline dark:text-slate-700" aria-hidden="true">
            /
          </span>
          <h1 className="truncate font-semibold text-slate-900 dark:text-slate-100">
            {VIEW_TITLES[activeView]}
          </h1>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
          title={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {!isAdminView && (
          <button
            type="button"
            onClick={onQuickExportCsv}
            className="flex min-h-[40px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>Ekspor CSV</span>
          </button>
        )}
      </div>
    </header>
  );
}
