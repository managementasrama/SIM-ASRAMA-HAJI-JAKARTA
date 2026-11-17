import { useCallback, useEffect, useState } from 'react';
import { useAppContext } from '../store';
import { dataStorage } from '../services/dataStorage';

interface NeonStateResponse {
  ok: boolean;
  data?: Record<string, unknown> | null;
  revision?: number;
  updatedAt?: string | null;
  error?: string;
}

export function SpreadsheetIntegrationView() {
  const { pullFromCentralDatabase, showToast, supabaseSyncState } = useAppContext();
  const [state, setState] = useState<NeonStateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  const refreshState = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/neon/state', { cache: 'no-store' });
      const result: NeonStateResponse = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setState(result);
    } catch (error: any) {
      setState({ ok: false, error: error?.message || 'Koneksi Neon gagal' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  const handlePush = async () => {
    setIsPushing(true);
    const result = await dataStorage.flushPendingSync();
    if (result.success) {
      showToast('Seluruh data aplikasi berhasil disimpan ke Neon.', 'success');
      await refreshState();
    } else {
      showToast(`Gagal menyimpan ke Neon: ${result.error || 'Terjadi kesalahan.'}`, 'error');
    }
    setIsPushing(false);
  };

  const handlePull = async () => {
    setIsPulling(true);
    await pullFromCentralDatabase();
    await refreshState();
    setIsPulling(false);
  };

  const payload = state?.data || {};
  const counts = [
    ['Gedung', payload.buildings],
    ['Kamar', payload.rooms],
    ['Transaksi', payload.transactions],
    ['Pengguna', payload.users],
    ['Sesi kerja', payload.workSessions],
    ['Log audit', payload.auditLogs]
  ] as const;

  return (
    <section className="mx-auto max-w-5xl space-y-6 pb-12">
      <header className="rounded-3xl border border-slate-800 bg-slate-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Neon PostgreSQL
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Basis Data Aplikasi</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Neon menjadi sumber data utama untuk frontend dan backend. Data aplikasi disimpan utuh sebagai JSONB dengan nomor revisi agar perubahan antarperangkat dapat terdeteksi.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePull}
              disabled={isPulling || isLoading}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 text-sm font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden="true">↓</span>{isPulling ? 'Memuat...' : 'Tarik data'}
            </button>
            <button
              type="button"
              onClick={handlePush}
              disabled={isPushing || supabaseSyncState.status === 'syncing'}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden="true">↑</span>{isPushing ? 'Menyimpan...' : 'Simpan sekarang'}
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Koneksi database</p>
          <div className="mt-3 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${state?.ok ? 'bg-emerald-500' : isLoading ? 'bg-amber-400' : 'bg-red-500'}`} />
            <p className="text-lg font-black text-slate-900">{isLoading ? 'Memeriksa...' : state?.ok ? 'Terhubung ke Neon' : 'Tidak terhubung'}</p>
          </div>
          {state?.error && <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p>}
          <p className="mt-2 text-sm text-slate-600">
            Status sinkronisasi: <span className="font-semibold">{supabaseSyncState.status}</span>
            {supabaseSyncState.errorMessage ? ` — ${supabaseSyncState.errorMessage}` : ''}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Revisi tersimpan</p>
          <p className="mt-3 text-3xl font-black tabular-nums text-slate-900">{state?.revision ?? '—'}</p>
          <p className="mt-2 text-sm text-slate-600">
            Terakhir diperbarui: {state?.updatedAt ? new Date(state.updatedAt).toLocaleString('id-ID') : 'Belum ada data di Neon'}
          </p>
        </article>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-900">Ringkasan dataset</h2>
            <p className="mt-1 text-sm text-slate-600">Jumlah data pada payload aplikasi yang tersimpan di Neon.</p>
          </div>
          <button type="button" onClick={() => void refreshState()} disabled={isLoading} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Perbarui status
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {counts.map(([label, rows]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{Array.isArray(rows) ? rows.length : 0}</p>
            </div>
          ))}
        </div>
      </article>

      <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
        Google Sheets tetap tersedia sebagai integrasi terpisah. Perubahan data utama aplikasi sekarang disinkronkan melalui Neon; revisi yang berubah di perangkat lain memerlukan tarik ulang sebelum penulisan berikutnya.
      </p>
    </section>
  );
}
