import { AlertCircle, LogIn, LogOut, ShieldCheck } from 'lucide-react';
import { AuthStatus } from '../hooks/useAuthAndRoleData';

interface LoginViewProps {
  authStatus: AuthStatus;
  userEmail: string | null;
  authError: string | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function LoginView({
  authStatus,
  userEmail,
  authError,
  theme,
  onToggleTheme,
  onSignIn,
  onSignOut,
}: LoginViewProps) {
  return (
    <div className="flex min-h-screen flex-col justify-between bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between">
        <span className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Update Harian Outlet
        </span>
        <button
          type="button"
          onClick={onToggleTheme}
          className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
        </button>
      </div>

      <main className="mx-auto my-8 w-full max-w-md">
        <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          {authStatus === 'loading' ? (
            <div className="space-y-4 py-6 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-700 dark:border-slate-700 dark:border-t-blue-500" />
              <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Memeriksa sesi akun...
              </div>
            </div>
          ) : authStatus === 'unregistered' ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Akun Belum Terdaftar
                  </h1>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Email <span className="font-mono font-medium text-slate-900 dark:text-slate-200">{userEmail}</span> belum ditambahkan ke daftar pengguna aktif.
                  </p>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Silakan hubungi Admin untuk mendaftarkan email Google Anda beserta role yang sesuai (<span className="font-medium">Admin</span>, <span className="font-medium">Stock Accounting</span>, <span className="font-medium">GL</span>, atau <span className="font-medium">Accounting</span>).
              </p>

              <button
                type="button"
                onClick={onSignOut}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <LogOut className="h-4 w-4" />
                <span>Keluar & Ganti Akun</span>
              </button>
            </div>
          ) : authStatus === 'inactive' ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Akses Akun Dinonaktifkan
                  </h1>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Akun <span className="font-mono font-medium text-slate-900 dark:text-slate-200">{userEmail}</span> saat ini berstatus nonaktif.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onSignOut}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <LogOut className="h-4 w-4" />
                <span>Keluar & Ganti Akun</span>
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  Masuk ke Sistem Outlet
                </h1>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Akses pemantauan harian outlet, ranking keterlambatan, dan log kunjungan sesuai role akun Anda.
                </p>
              </div>

              {authError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
                  {authError}
                </div>
              )}

              <button
                type="button"
                onClick={onSignIn}
                className="flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                <LogIn className="h-4 w-4" />
                <span>Masuk dengan Google</span>
              </button>

              <div className="border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <div className="font-medium text-slate-700 dark:text-slate-300">
                  Pembagian Role Sistem
                </div>
                <p className="mt-1 leading-relaxed">
                  Admin · Stock Accounting · GL · Accounting. Seluruh data awal outlet dan tugas operasional telah dipetakan ke role Stock Accounting.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="mx-auto w-full max-w-4xl text-center text-xs text-slate-400 dark:text-slate-500">
        Update Harian Outlet
      </footer>
    </div>
  );
}
