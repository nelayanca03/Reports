import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { AdminResetSecurityRecord, FullUserResetSummary } from '../../types/outlet';
import {
  RESET_PASSWORD_MAX_LENGTH,
  RESET_PASSWORD_MIN_LENGTH,
  verifyResetPassword,
} from '../../utils/resetPasswordCrypto';

interface AdminFullResetSectionProps {
  isPrimaryAdmin: boolean;
  resetSecurity: AdminResetSecurityRecord | null;
  onSaveResetPassword: (newPassword: string) => Promise<void>;
  onResetAllUserInputData: (onProgress?: (step: string) => void) => Promise<FullUserResetSummary>;
  onResetCompleted?: () => void;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

function formatUpdatedAt(iso?: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

export function AdminFullResetSection({
  isPrimaryAdmin,
  resetSecurity,
  onSaveResetPassword,
  onResetAllUserInputData,
  onResetCompleted,
}: AdminFullResetSectionProps) {
  // First-run password setup state
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [showSetupPwd, setShowSetupPwd] = useState(false);
  const [savingSetup, setSavingSetup] = useState(false);

  // Full reset execution state
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [confirmUnderstood, setConfirmUnderstood] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [progressStep, setProgressStep] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntilMs, setLockoutUntilMs] = useState(0);
  const [lockoutRemainingSec, setLockoutRemainingSec] = useState(0);
  const [lastSummary, setLastSummary] = useState<FullUserResetSummary | null>(null);

  // Change password collapsible state
  const [changeOpen, setChangeOpen] = useState(false);
  const [primaryOverride, setPrimaryOverride] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [nextPasswordConfirm, setNextPasswordConfirm] = useState('');
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [savingChange, setSavingChange] = useState(false);

  // Inline feedback message
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (lockoutUntilMs === 0) return;
    const timer = window.setInterval(() => {
      const rem = Math.max(0, Math.ceil((lockoutUntilMs - Date.now()) / 1000));
      setLockoutRemainingSec(rem);
      if (rem === 0) {
        setLockoutUntilMs(0);
        setFailedAttempts(0);
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [lockoutUntilMs]);

  const handleCreateInitialPassword = async (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const trimmed = setupPassword.trim();
    if (trimmed.length < RESET_PASSWORD_MIN_LENGTH) {
      setNotice({
        type: 'err',
        text: `Password reset minimal ${RESET_PASSWORD_MIN_LENGTH} karakter.`,
      });
      return;
    }
    if (trimmed.length > RESET_PASSWORD_MAX_LENGTH) {
      setNotice({
        type: 'err',
        text: `Password reset maksimal ${RESET_PASSWORD_MAX_LENGTH} karakter.`,
      });
      return;
    }
    if (trimmed !== setupConfirm.trim()) {
      setNotice({ type: 'err', text: 'Konfirmasi password tidak cocok.' });
      return;
    }

    setSavingSetup(true);
    try {
      await onSaveResetPassword(trimmed);
      setSetupPassword('');
      setSetupConfirm('');
      setShowSetupPwd(false);
      setNotice({
        type: 'ok',
        text: 'Password reset berhasil dibuat. Fitur Reset Semua Data Input User kini siap digunakan.',
      });
    } catch (err) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menyimpan password reset.',
      });
    } finally {
      setSavingSetup(false);
    }
  };

  const handleExecuteFullReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetSecurity || isResetting) return;
    setNotice(null);

    if (lockoutRemainingSec > 0) {
      setNotice({
        type: 'err',
        text: `Terlalu banyak percobaan salah. Tunggu ${lockoutRemainingSec} detik lagi.`,
      });
      return;
    }

    const candidate = resetPasswordInput.trim();
    if (!candidate) {
      setNotice({ type: 'err', text: 'Masukkan password reset terlebih dahulu.' });
      return;
    }
    if (!confirmUnderstood) {
      setNotice({
        type: 'err',
        text: 'Centang kotak konfirmasi sebelum melanjutkan penghapusan permanen.',
      });
      return;
    }

    setIsResetting(true);
    setProgressStep('Memverifikasi password reset...');
    try {
      const valid = await verifyResetPassword(candidate, resetSecurity);
      if (!valid) {
        const nextFailed = failedAttempts + 1;
        setFailedAttempts(nextFailed);
        setResetPasswordInput('');
        if (nextFailed >= MAX_FAILED_ATTEMPTS) {
          setLockoutUntilMs(Date.now() + LOCKOUT_SECONDS * 1000);
          setLockoutRemainingSec(LOCKOUT_SECONDS);
          setNotice({
            type: 'err',
            text: `Password salah ${MAX_FAILED_ATTEMPTS} kali. Tombol reset dikunci selama ${LOCKOUT_SECONDS} detik.`,
          });
        } else {
          setNotice({
            type: 'err',
            text: `Password reset salah (percobaan ${nextFailed}/${MAX_FAILED_ATTEMPTS}).`,
          });
        }
        return;
      }

      setFailedAttempts(0);
      const summary = await onResetAllUserInputData((step) => setProgressStep(step));
      setResetPasswordInput('');
      setShowResetPwd(false);
      setConfirmUnderstood(false);
      setLastSummary(summary);
      onResetCompleted?.();
      setNotice({
        type: 'ok',
        text: 'Seluruh data input user berhasil direset. Pengaturan master, akun, dan kalender tetap aman.',
      });
    } catch (err) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal mereset seluruh data input user.',
      });
    } finally {
      setIsResetting(false);
      setProgressStep('');
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetSecurity || savingChange) return;
    setNotice(null);

    const trimmedNew = nextPassword.trim();
    if (trimmedNew.length < RESET_PASSWORD_MIN_LENGTH) {
      setNotice({
        type: 'err',
        text: `Password baru minimal ${RESET_PASSWORD_MIN_LENGTH} karakter.`,
      });
      return;
    }
    if (trimmedNew.length > RESET_PASSWORD_MAX_LENGTH) {
      setNotice({
        type: 'err',
        text: `Password baru maksimal ${RESET_PASSWORD_MAX_LENGTH} karakter.`,
      });
      return;
    }
    if (trimmedNew !== nextPasswordConfirm.trim()) {
      setNotice({ type: 'err', text: 'Konfirmasi password baru tidak cocok.' });
      return;
    }

    setSavingChange(true);
    try {
      if (!(isPrimaryAdmin && primaryOverride)) {
        const okCurrent = await verifyResetPassword(currentPassword.trim(), resetSecurity);
        if (!okCurrent) {
          setCurrentPassword('');
          setNotice({ type: 'err', text: 'Password reset saat ini tidak cocok.' });
          return;
        }
      }

      await onSaveResetPassword(trimmedNew);
      setCurrentPassword('');
      setNextPassword('');
      setNextPasswordConfirm('');
      setShowChangePwd(false);
      setPrimaryOverride(false);
      setChangeOpen(false);
      setNotice({
        type: 'ok',
        text: 'Password reset berhasil diperbarui.',
      });
    } catch (err) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal memperbarui password reset.',
      });
    } finally {
      setSavingChange(false);
    }
  };

  const lastUpdatedLabel = formatUpdatedAt(resetSecurity?.updatedAtIso);

  return (
    <div className="space-y-4">
      {/* Scope Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900/60 dark:bg-red-950/25">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Yang Akan Dihapus Permanen</span>
          </div>
          <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-xs text-slate-700 dark:text-slate-300">
            <li>Seluruh entri Input Harian (Stock Accounting, GL, Accounting) di semua bulan</li>
            <li>Seluruh catatan Kunjungan Outlet di semua divisi dan semua bulan</li>
            <li>Seluruh Data Tersimpan &amp; Kode Referensi SA/GL (penomoran dimulai ulang dari 0001)</li>
            <li>Seluruh riwayat Log Aktivitas Input user</li>
          </ul>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/25">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>Yang Tetap Aman (Tidak Dihapus)</span>
          </div>
          <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-xs text-slate-700 dark:text-slate-300">
            <li>Daftar Akun user, email, dan pengaturan hak akses role</li>
            <li>Pengaturan Tugas, Master Outlet, PIC, Adjustment Hari Kerja, dan Akses Bulan</li>
            <li>Jadwal Kalender &amp; Gambar Kalender dari Admin</li>
            <li>Password Reset Admin ini sendiri</li>
          </ul>
        </div>
      </div>

      {/* Inline Notice Banner */}
      {notice && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            notice.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300'
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 text-xs font-medium underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Completion Summary */}
      {lastSummary && (
        <div className="rounded-xl border border-emerald-200 bg-white p-4 dark:border-emerald-900/60 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Ringkasan Data yang Berhasil Dibersihkan</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Data Bulanan</div>
              <div className="mt-0.5 text-base font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                {lastSummary.monthlyDocsDeleted}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Data Tersimpan</div>
              <div className="mt-0.5 text-base font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                {lastSummary.savedRecordsDeleted}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Urutan Kode SA/GL</div>
              <div className="mt-0.5 text-base font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                {lastSummary.countersDeleted}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Log Aktivitas</div>
              <div className="mt-0.5 text-base font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                {lastSummary.inputLogsDeleted}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STATE A: First-time password setup */}
      {!resetSecurity ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Buat Password Reset Data
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Password ini belum dibuat. Atur password khusus Admin terlebih dahulu untuk mengaktifkan tombol Reset Semua Data Input User.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateInitialPassword} className="mt-4 max-w-md space-y-3.5">
            <div>
              <label
                htmlFor="setup-reset-password"
                className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Password Reset Baru (minimal {RESET_PASSWORD_MIN_LENGTH} karakter)
              </label>
              <div className="relative">
                <input
                  id="setup-reset-password"
                  type={showSetupPwd ? 'text' : 'password'}
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  maxLength={RESET_PASSWORD_MAX_LENGTH}
                  autoComplete="new-password"
                  placeholder="Masukkan password reset..."
                  className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white pr-10 pl-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setShowSetupPwd((v) => !v)}
                  aria-label={showSetupPwd ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  {showSetupPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="setup-reset-password-confirm"
                className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Ulangi Password Reset
              </label>
              <input
                id="setup-reset-password-confirm"
                type={showSetupPwd ? 'text' : 'password'}
                value={setupConfirm}
                onChange={(e) => setSetupConfirm(e.target.value)}
                maxLength={RESET_PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                placeholder="Ketik ulang password reset..."
                className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100"
              />
            </div>

            <button
              type="submit"
              disabled={savingSetup || setupPassword.trim().length < RESET_PASSWORD_MIN_LENGTH}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
            >
              <Lock className="h-4 w-4 shrink-0" />
              <span>{savingSetup ? 'Menyimpan...' : 'Simpan Password Reset'}</span>
            </button>
          </form>
        </section>
      ) : (
        /* STATE B: Password is configured -> Execute Reset + Manage Password */
        <>
          <section className="rounded-xl border border-red-200 bg-white p-5 dark:border-red-900/60 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-red-700 dark:text-red-400">
                  Reset Semua Data Input User
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Masukkan password reset Admin dan konfirmasi di bawah untuk menghapus seluruh data yang sudah diinput oleh user di semua divisi dan semua bulan.
                </p>
              </div>
              {lastUpdatedLabel && (
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  Password diperbarui {lastUpdatedLabel}
                </span>
              )}
            </div>

            <form onSubmit={handleExecuteFullReset} className="mt-4 max-w-lg space-y-4">
              <div>
                <label
                  htmlFor="confirm-reset-password"
                  className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Password Reset Admin
                </label>
                <div className="relative">
                  <input
                    id="confirm-reset-password"
                    type={showResetPwd ? 'text' : 'password'}
                    value={resetPasswordInput}
                    onChange={(e) => setResetPasswordInput(e.target.value)}
                    disabled={isResetting || lockoutRemainingSec > 0}
                    maxLength={RESET_PASSWORD_MAX_LENGTH}
                    autoComplete="off"
                    placeholder="Masukkan password reset..."
                    className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white pr-10 pl-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-600 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPwd((v) => !v)}
                    aria-label={showResetPwd ? 'Sembunyikan password' : 'Tampilkan password'}
                    className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    {showResetPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={confirmUnderstood}
                  onChange={(e) => setConfirmUnderstood(e.target.checked)}
                  disabled={isResetting}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-red-600 focus:ring-red-600"
                />
                <span>
                  Saya memahami bahwa seluruh data input harian, kunjungan, data tersimpan, kode referensi, dan log aktivitas user dari semua divisi &amp; semua bulan akan dihapus permanen dan tidak dapat dikembalikan.
                </span>
              </label>

              {isResetting && progressStep && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                  {progressStep}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={
                    isResetting ||
                    lockoutRemainingSec > 0 ||
                    !resetPasswordInput.trim() ||
                    !confirmUnderstood
                  }
                  className="inline-flex min-h-[42px] items-center gap-2 whitespace-nowrap rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  <span>
                    {isResetting
                      ? 'Sedang Mereset Data...'
                      : lockoutRemainingSec > 0
                        ? `Terkunci (${lockoutRemainingSec} dtk)`
                        : 'Reset Semua Data Input User'}
                  </span>
                </button>
              </div>
            </form>
          </section>

          {/* Collapsible Change Reset Password */}
          <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setChangeOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                <KeyRound className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <span>Ubah Password Reset</span>
              </div>
              {changeOpen ? (
                <ChevronUp className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              )}
            </button>

            {changeOpen && (
              <form
                onSubmit={handleChangePassword}
                className="border-t border-slate-100 px-5 py-4 dark:border-slate-800"
              >
                <div className="max-w-md space-y-3.5">
                  {!(isPrimaryAdmin && primaryOverride) && (
                    <div>
                      <label
                        htmlFor="change-current-password"
                        className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        Password Reset Saat Ini
                      </label>
                      <input
                        id="change-current-password"
                        type={showChangePwd ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        maxLength={RESET_PASSWORD_MAX_LENGTH}
                        autoComplete="current-password"
                        placeholder="Masukkan password saat ini..."
                        className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100"
                      />
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="change-new-password"
                      className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Password Baru (minimal {RESET_PASSWORD_MIN_LENGTH} karakter)
                    </label>
                    <div className="relative">
                      <input
                        id="change-new-password"
                        type={showChangePwd ? 'text' : 'password'}
                        value={nextPassword}
                        onChange={(e) => setNextPassword(e.target.value)}
                        maxLength={RESET_PASSWORD_MAX_LENGTH}
                        autoComplete="new-password"
                        placeholder="Masukkan password baru..."
                        className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white pr-10 pl-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => setShowChangePwd((v) => !v)}
                        aria-label={showChangePwd ? 'Sembunyikan password' : 'Tampilkan password'}
                        className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      >
                        {showChangePwd ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="change-new-password-confirm"
                      className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Ulangi Password Baru
                    </label>
                    <input
                      id="change-new-password-confirm"
                      type={showChangePwd ? 'text' : 'password'}
                      value={nextPasswordConfirm}
                      onChange={(e) => setNextPasswordConfirm(e.target.value)}
                      maxLength={RESET_PASSWORD_MAX_LENGTH}
                      autoComplete="new-password"
                      placeholder="Ketik ulang password baru..."
                      className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100"
                    />
                  </div>

                  {isPrimaryAdmin && (
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={primaryOverride}
                        onChange={(e) => {
                          setPrimaryOverride(e.target.checked);
                          if (e.target.checked) setCurrentPassword('');
                        }}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                      />
                      <span>Lupa password lama? Atur ulang langsung sebagai Admin Utama</span>
                    </label>
                  )}

                  <div className="flex items-center gap-2.5 pt-1">
                    <button
                      type="submit"
                      disabled={
                        savingChange ||
                        nextPassword.trim().length < RESET_PASSWORD_MIN_LENGTH ||
                        (!(isPrimaryAdmin && primaryOverride) && !currentPassword.trim())
                      }
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                    >
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                      <span>{savingChange ? 'Menyimpan...' : 'Simpan Password Baru'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setChangeOpen(false);
                        setPrimaryOverride(false);
                        setCurrentPassword('');
                        setNextPassword('');
                        setNextPasswordConfirm('');
                      }}
                      className="min-h-[38px] rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              </form>
            )}
          </section>
        </>
      )}
    </div>
  );
}
