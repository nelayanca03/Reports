import { CheckCircle2, Edit3, Plus, Trash2, XCircle } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../firebase';
import { AccountProfile, AccountRole, OperationalRoleId, RecordPrefix, RoleConfig } from '../types/outlet';
import { ROLE_LABELS, getPersonList } from '../utils/outletLogic';
import { ConfirmModal } from './ConfirmModal';

interface AdminAccountsViewProps {
  accounts: AccountProfile[];
  roleConfigs: Record<OperationalRoleId, RoleConfig>;
  isPrimaryAdmin: boolean;
  onSaveAccount: (input: {
    email: string;
    name: string;
    role: AccountRole;
    picName: string;
    refPrefix?: RecordPrefix;
    active: boolean;
  }) => Promise<void>;
  onDeleteAccount: (accountId: string) => Promise<void>;
}

export function AdminAccountsView({
  accounts,
  roleConfigs,
  isPrimaryAdmin,
  onSaveAccount,
  onDeleteAccount,
}: AdminAccountsViewProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<AccountRole>('stock_accounting');
  const [picName, setPicName] = useState('');
  const [refPrefix, setRefPrefix] = useState<RecordPrefix>('SA');
  const [active, setActive] = useState(true);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AccountProfile | null>(null);

  const resetForm = () => {
    setEmail('');
    setName('');
    setRole('stock_accounting');
    setPicName('');
    setRefPrefix('SA');
    setActive(true);
    setEditingEmail(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !name.trim()) return;
    if (role === 'admin' && !isPrimaryAdmin) return;

    setBusy(true);
    try {
      await onSaveAccount({
        email: cleanEmail,
        name: name.trim(),
        role,
        picName: picName.trim().toUpperCase(),
        ...(role === 'accounting' ? { refPrefix } : {}),
        active,
      });
      setFeedback(
        editingEmail
          ? `Akun ${cleanEmail} berhasil diperbarui.`
          : `Akun ${cleanEmail} berhasil ditambahkan.`
      );
      resetForm();
    } finally {
      setBusy(false);
    }
  };

  const handleStartEdit = (acc: AccountProfile) => {
    if (!isPrimaryAdmin && acc.role === 'admin') return;
    setEditingEmail(acc.email);
    setEmail(acc.email);
    setName(acc.name);
    setRole(acc.role);
    setPicName(acc.picName);
    setRefPrefix(acc.refPrefix || 'SA');
    setActive(acc.active);
    setFeedback(null);
  };

  const handleToggleActive = async (acc: AccountProfile) => {
    if (acc.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL) return;
    if (!isPrimaryAdmin && acc.role === 'admin') return;
    setBusy(true);
    try {
      await onSaveAccount({
        email: acc.email,
        name: acc.name,
        role: acc.role,
        picName: acc.picName,
        ...(acc.role === 'accounting' && acc.refPrefix ? { refPrefix: acc.refPrefix } : {}),
        active: !acc.active,
      });
      setFeedback(
        `Status akun ${acc.email} diubah menjadi ${!acc.active ? 'Aktif' : 'Nonaktif'}.`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleQuickRoleChange = async (acc: AccountProfile, nextRole: AccountRole) => {
    if (acc.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL) return;
    if (nextRole === acc.role) return;
    if (!isPrimaryAdmin && (acc.role === 'admin' || nextRole === 'admin')) return;
    setBusy(true);
    try {
      await onSaveAccount({
        email: acc.email,
        name: acc.name,
        role: nextRole,
        picName: acc.picName,
        ...(nextRole === 'accounting' ? { refPrefix: acc.refPrefix || 'SA' } : {}),
        active: acc.active,
      });
      setFeedback(`Role akun ${acc.email} diubah menjadi ${ROLE_LABELS[nextRole]}.`);
    } finally {
      setBusy(false);
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

      {/* Add / Edit Account Form */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {editingEmail ? `Edit Akun (${editingEmail})` : 'Tambah Akun Baru'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {isPrimaryAdmin
                ? 'Pengguna yang didaftarkan dapat langsung masuk memakai Masuk dengan Google. Admin Utama dapat mengatur role user biasa menjadi Admin.'
                : 'Pengguna yang didaftarkan dapat langsung masuk memakai Masuk dengan Google. Penetapan role Admin hanya dapat dilakukan oleh Admin Utama.'}
            </p>
          </div>
          {editingEmail && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-medium text-slate-500 underline hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Batal Edit
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <label
              htmlFor="acc-email"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Email Google
            </label>
            <input
              id="acc-email"
              type="email"
              required
              disabled={Boolean(editingEmail)}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@gmail.com"
              className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 disabled:opacity-60 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="lg:col-span-3">
            <label
              htmlFor="acc-name"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Nama Pengguna
            </label>
            <input
              id="acc-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Peter"
              className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="lg:col-span-2">
            <label
              htmlFor="acc-role"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Role
            </label>
            <select
              id="acc-role"
              value={role}
              disabled={editingEmail?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL}
              onChange={(e) => setRole(e.target.value as AccountRole)}
              className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-60 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="stock_accounting">Stock Accounting</option>
              <option value="gl">GL</option>
              <option value="accounting">Accounting</option>
              {isPrimaryAdmin && <option value="admin">Admin</option>}
            </select>
          </div>

          <div className={role === 'accounting' ? 'lg:col-span-2' : 'lg:col-span-2'}>
            <label
              htmlFor="acc-pic"
              className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              PIC Default (Sesuai Tugas & Outlet)
            </label>
            <input
              id="acc-pic"
              type="text"
              list="account-pic-suggestions"
              value={picName}
              onChange={(e) => setPicName(e.target.value)}
              placeholder="PETER / MELVIN"
              className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <datalist id="account-pic-suggestions">
              {(role === 'admin'
                ? Array.from(
                    new Set(
                      Object.values(roleConfigs).flatMap((cfg) => getPersonList(cfg.outlets))
                    )
                  )
                : getPersonList(roleConfigs[role]?.outlets || [])
              ).map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          {role === 'accounting' && (
            <div className="lg:col-span-2">
              <label
                htmlFor="acc-prefix"
                className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Prefix Kode Ref
              </label>
              <select
                id="acc-prefix"
                value={refPrefix}
                onChange={(e) => setRefPrefix(e.target.value as RecordPrefix)}
                className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="SA">SA (Stock Accounting)</option>
                <option value="GL">GL (General Ledger)</option>
              </select>
            </div>
          )}

          <div className="flex items-end lg:col-span-2">
            <button
              type="submit"
              disabled={busy || !email.trim() || !name.trim()}
              className="flex min-h-[42px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>{editingEmail ? 'Simpan' : 'Tambah Akun'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Accounts Table */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Daftar Akun Terdaftar ({accounts.length})
          </h3>
          {isPrimaryAdmin && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Ubah dropdown Role untuk mengangkat atau mengatur role Admin
            </span>
          )}
        </div>

        {accounts.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Belum ada akun terdaftar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[740px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                  <th className="px-5 py-3">Nama</th>
                  <th className="px-4 py-3">Email Google</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">PIC Default</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {accounts.map((acc) => {
                  const isOwner = acc.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
                  const canModifyRow = !isOwner && (isPrimaryAdmin || acc.role !== 'admin');
                  return (
                    <tr
                      key={acc.id}
                      className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                    >
                      <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-slate-100">
                        {acc.name}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                        {acc.email}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                        {isOwner ? (
                          <span className="font-semibold text-blue-700 dark:text-blue-400">
                            Admin Utama
                          </span>
                        ) : canModifyRow ? (
                          <select
                            aria-label={`Ubah role ${acc.email}`}
                            disabled={busy}
                            value={acc.role}
                            onChange={(e) =>
                              handleQuickRoleChange(acc, e.target.value as AccountRole)
                            }
                            className="min-h-[34px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          >
                            <option value="stock_accounting">Stock Accounting</option>
                            <option value="gl">GL</option>
                            <option value="accounting">Accounting</option>
                            {isPrimaryAdmin && <option value="admin">Admin</option>}
                          </select>
                        ) : (
                          <span>{ROLE_LABELS[acc.role]}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                        {acc.picName || '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          disabled={!canModifyRow || busy}
                          onClick={() => handleToggleActive(acc)}
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold disabled:cursor-default ${
                            acc.active
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {acc.active ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>AKTIF</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3.5 w-3.5" />
                              <span>NONAKTIF</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          {(isOwner || canModifyRow) && (
                            <button
                              type="button"
                              onClick={() => handleStartEdit(acc)}
                              aria-label={`Edit akun ${acc.email}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                          )}
                          {canModifyRow && (
                            <button
                              type="button"
                              onClick={() => setPendingDelete(acc)}
                              aria-label={`Hapus akun ${acc.email}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title={`Hapus akun ${pendingDelete?.email}?`}
        description="Pengguna ini tidak akan lagi dapat masuk ke aplikasi setelah akunnya dihapus."
        confirmLabel="Ya, Hapus Akun"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) {
            await onDeleteAccount(pendingDelete.id);
            setFeedback(`Akun ${pendingDelete.email} telah dihapus.`);
            setPendingDelete(null);
          }
        }}
      />
    </div>
  );
}
