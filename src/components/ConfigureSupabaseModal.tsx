import React, { useState } from 'react';
import { 
  getSupabaseSourceInfo, 
  saveCustomSupabaseCredentials, 
  removeCustomSupabaseCredentials, 
  testCustomSupabaseConnection,
  pushAllToTargetSupabase,
  SUPABASE_URL,
  SUPABASE_ANON_KEY
} from '../lib/supabase';
import { useAppContext } from '../store';

interface ConfigureSupabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConfigureSupabaseModal({ isOpen, onClose }: ConfigureSupabaseModalProps) {
  const { showToast, dataStorage } = useAppContext();
  const currentInfo = getSupabaseSourceInfo();

  const [activeTab, setActiveTab] = useState<'UI_DIRECT' | 'VERCEL_ENV' | 'SQL_SCHEMA'>('UI_DIRECT');
  const [inputUrl, setInputUrl] = useState(currentInfo.isCustom ? currentInfo.url : '');
  const [inputKey, setInputKey] = useState(currentInfo.isCustom ? (SUPABASE_ANON_KEY || '') : '');
  const [testStatus, setTestStatus] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message: string }>({
    status: 'idle',
    message: ''
  });
  const [isMigrating, setIsMigrating] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    if (!inputUrl.trim() || !inputKey.trim()) {
      setTestStatus({
        status: 'error',
        message: 'Mohon isi URL dan Anon Key terlebih dahulu.'
      });
      return;
    }
    setTestStatus({ status: 'testing', message: 'Menguji koneksi ke database Supabase...' });
    const res = await testCustomSupabaseConnection(inputUrl.trim(), inputKey.trim());
    if (res.success) {
      setTestStatus({ status: 'success', message: res.message });
      showToast('Koneksi Supabase berhasil diverifikasi!', 'success');
    } else {
      setTestStatus({ status: 'error', message: res.message });
      showToast(res.message, 'error');
    }
  };

  const handleSaveAndApply = () => {
    if (!inputUrl.trim() || !inputKey.trim()) {
      showToast('Mohon isi URL dan Anon Key Supabase yang valid.', 'error');
      return;
    }
    try {
      saveCustomSupabaseCredentials(inputUrl.trim(), inputKey.trim());
      showToast('Kredensial database Supabase berhasil disimpan! Memuat ulang sistem...', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (e: any) {
      showToast(`Gagal menyimpan kredensial: ${e?.message || 'Error'}`, 'error');
    }
  };

  const handleResetToDefault = () => {
    if (window.confirm('Apakah Anda yakin ingin mengembalikan koneksi database ke konfigurasi bawaan (Environment Variable / Default)?')) {
      removeCustomSupabaseCredentials();
      showToast('Koneksi database dikembalikan ke default. Memuat ulang sistem...', 'info');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  const handleMigrateCurrentData = async () => {
    if (!inputUrl.trim() || !inputKey.trim()) {
      showToast('Masukkan URL dan Key target terlebih dahulu.', 'warning');
      return;
    }
    setIsMigrating(true);
    try {
      const currentPayload = dataStorage.exportFullDatabase();
      const res = await pushAllToTargetSupabase(inputUrl.trim(), inputKey.trim(), currentPayload);
      if (res.success) {
        showToast('Seluruh data master (gedung, kamar, akun pengguna) berhasil disalin ke Supabase baru!', 'success');
        setTestStatus({
          status: 'success',
          message: 'Data aktif berhasil dimigrasikan ke proyek database baru!'
        });
      } else {
        showToast(`Migrasi data gagal: ${res.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`Gagal migrasi data: ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsMigrating(false);
    }
  };

  const handleCopySqlScript = () => {
    const sqlText = `-- SKRIP INISIALISASI DATABASE SUPABASE LENGKAP SIM-AKOMODASI UPT ASRAMA HAJI
-- Salin dan jalankan skrip ini di SQL Editor dashboard Supabase baru Anda.
-- File lengkap tersedia di folder project: /supabase_schema.sql

CREATE TABLE IF NOT EXISTS public.app_database_sync (
    id TEXT PRIMARY KEY,
    database_payload JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.buildings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT DEFAULT '',
    floors INTEGER DEFAULT 1,
    total_rooms INTEGER DEFAULT 0,
    description TEXT DEFAULT '',
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.rooms (
    id TEXT PRIMARY KEY,
    room_number TEXT NOT NULL,
    building TEXT NOT NULL,
    floor INTEGER DEFAULT 1,
    type TEXT DEFAULT 'Standard',
    capacity INTEGER DEFAULT 2,
    price_per_night NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'KOSONG',
    active_tx_id TEXT,
    active_maint_id TEXT,
    qc_status TEXT DEFAULT 'LOLOS_QC',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.meeting_rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    capacity INTEGER DEFAULT 50,
    price_half_day NUMERIC DEFAULT 0,
    price_full_day NUMERIC DEFAULT 0,
    facilities TEXT[] DEFAULT '{}',
    status TEXT DEFAULT 'TERSEDIA',
    active_tx_id TEXT,
    qc_status TEXT DEFAULT 'LOLOS_QC',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT DEFAULT '',
    role TEXT NOT NULL,
    department TEXT DEFAULT 'Operasional',
    shift TEXT DEFAULT 'Pagi',
    status TEXT DEFAULT 'Aktif',
    password_hash TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Aktifkan Realtime Publikasi
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_database_sync;
ALTER PUBLICATION supabase_realtime ADD TABLE public.buildings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
`;
    navigator.clipboard.writeText(sqlText);
    setCopiedSql(true);
    showToast('Skrip SQL dasar berhasil disalin ke papan klip!', 'success');
    setTimeout(() => setCopiedSql(false), 2500);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <i className="fa-solid fa-server text-lg"></i>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Konfigurasi &amp; Ganti Sumber Database Supabase
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pilih metode penggantian basis data cloud Supabase untuk aplikasi SIM-Akomodasi
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center justify-center transition cursor-pointer"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Status Bar */}
        <div className="bg-slate-900 text-slate-200 px-5 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 text-[11px]">Database Terhubung:</span>
            <span className="font-mono text-emerald-300 font-bold text-[11px] bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
              {currentInfo.host}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-slate-400 text-[11px]">Sumber Konfigurasi:</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
              currentInfo.isCustom
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : currentInfo.hasEnv
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                : 'bg-slate-700 text-slate-300'
            }`}>
              {currentInfo.isCustom
                ? 'Pengaturan Kustom UI'
                : currentInfo.hasEnv
                ? 'Environment Variable (Vercel/.env)'
                : 'Default Fallback'}
            </span>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/40 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('UI_DIRECT')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-2 cursor-pointer ${
              activeTab === 'UI_DIRECT'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <i className="fa-solid fa-sliders"></i>
            <span>1. Ganti Langsung di UI (Instan)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('VERCEL_ENV')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-2 cursor-pointer ${
              activeTab === 'VERCEL_ENV'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <i className="fa-brands fa-envira"></i>
            <span>2. Panduan Vercel / .env</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('SQL_SCHEMA')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition flex items-center justify-center space-x-2 cursor-pointer ${
              activeTab === 'SQL_SCHEMA'
                ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <i className="fa-solid fa-code"></i>
            <span>3. Skrip SQL Schema Baru</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {activeTab === 'UI_DIRECT' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
                <div className="flex items-start space-x-2.5">
                  <i className="fa-solid fa-bolt text-emerald-600 dark:text-emerald-400 mt-0.5"></i>
                  <div>
                    <h5 className="font-bold text-xs">Penggantian Instan Tanpa Perlu Build Ulang</h5>
                    <p className="text-[11px] mt-0.5 leading-relaxed text-emerald-700 dark:text-emerald-400">
                      Masukkan URL dan Anon Key proyek Supabase baru Anda di bawah ini. Anda dapat menguji koneksi terlebih dahulu, menyalin data aktif dari database saat ini, lalu menyimpan untuk langsung menggunakan database baru.
                    </p>
                  </div>
                </div>
              </div>

              {/* Form Input */}
              <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 text-[11px]">
                    Project URL Supabase Baru:
                  </label>
                  <input
                    type="text"
                    value={inputUrl}
                    onChange={e => setInputUrl(e.target.value)}
                    placeholder="https://xyzabcdefghijklmnop.supabase.co"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Ditemukan di Supabase Dashboard → Project Settings → API → Project URL
                  </span>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1 text-[11px]">
                    Project API Key (Anon / Public / Publishable):
                  </label>
                  <input
                    type="password"
                    value={inputKey}
                    onChange={e => setInputKey(e.target.value)}
                    placeholder="sb_publishable_... atau eyJhbGciOiJIUzI1NiIsIn..."
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Ditemukan di Supabase Dashboard → Project Settings → API → Project API Keys (anon / public)
                  </span>
                </div>

                {/* Test Status Feedback */}
                {testStatus.status !== 'idle' && (
                  <div className={`p-3 rounded-lg border text-[11px] flex items-center space-x-2 ${
                    testStatus.status === 'testing'
                      ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800 text-sky-800 dark:text-sky-300'
                      : testStatus.status === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                  }`}>
                    <i className={`fa-solid ${
                      testStatus.status === 'testing'
                        ? 'fa-spinner fa-spin text-sky-500'
                        : testStatus.status === 'success'
                        ? 'fa-circle-check text-emerald-500'
                        : 'fa-triangle-exclamation text-rose-500'
                    }`}></i>
                    <span>{testStatus.message}</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testStatus.status === 'testing'}
                    className="px-3 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white font-bold rounded-lg transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <i className="fa-solid fa-satellite-dish"></i>
                    <span>Uji Koneksi Baru</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleMigrateCurrentData}
                    disabled={isMigrating || !inputUrl.trim() || !inputKey.trim()}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <i className={`fa-solid ${isMigrating ? 'fa-spinner fa-spin' : 'fa-database'}`}></i>
                    <span>Salin Data Aktif ke Supabase Baru</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveAndApply}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition flex items-center space-x-1.5 cursor-pointer shadow-xs ml-auto"
                  >
                    <i className="fa-solid fa-check"></i>
                    <span>Simpan &amp; Hubungkan</span>
                  </button>
                </div>
              </div>

              {currentInfo.isCustom && (
                <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                  <div className="flex items-center space-x-2">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    <span>Saat ini Anda menggunakan kredensial kustom browser.</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetToDefault}
                    className="px-2.5 py-1 text-[11px] bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition cursor-pointer"
                  >
                    Kembalikan ke Default
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'VERCEL_ENV' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-300">
                <h5 className="font-bold text-xs flex items-center space-x-2">
                  <i className="fa-brands fa-cloudflare"></i>
                  <span>Cara Mengubah Database untuk Seluruh Pengguna via Vercel</span>
                </h5>
                <p className="text-[11px] mt-1 leading-relaxed text-blue-800 dark:text-blue-400">
                  Jika aplikasi di-hosting di <strong>Vercel</strong>, Anda cukup memperbarui Environment Variables di dashboard Vercel tanpa perlu mengubah baris kode.
                </p>
              </div>

              <div className="space-y-3 text-slate-700 dark:text-slate-300 leading-relaxed text-[11px]">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <p className="font-bold text-slate-900 dark:text-white">Langkah 1: Buka Dashboard Vercel</p>
                  <p>Buka <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline font-bold">vercel.com/dashboard</a> dan pilih repositori proyek ini.</p>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <p className="font-bold text-slate-900 dark:text-white">Langkah 2: Tambahkan / Edit Environment Variables</p>
                  <p>Pilih menu <strong>Settings</strong> → <strong>Environment Variables</strong>, lalu masukkan nama variabel berikut:</p>
                  <div className="p-2.5 bg-slate-900 text-emerald-400 font-mono text-[10px] rounded-lg space-y-1">
                    <div>VITE_SUPABASE_URL=https://&lt;id-proyek-baru&gt;.supabase.co</div>
                    <div>VITE_SUPABASE_ANON_KEY=&lt;anon-key-proyek-baru&gt;</div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <p className="font-bold text-slate-900 dark:text-white">Langkah 3: Redeploy Aplikasi</p>
                  <p>Pilih menu <strong>Deployments</strong> → klik titik tiga (...) di samping deployment terbaru → pilih <strong>Redeploy</strong> agar variabel baru diterapkan.</p>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <p className="font-bold text-slate-900 dark:text-white">Pengembangan Lokal (.env)</p>
                  <p>Jika dijalankan di komputer lokal, cukup buat/edit file <code className="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded font-mono">.env</code> di root direktori dengan kedua variabel di atas.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'SQL_SCHEMA' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-300">
                <div className="flex items-start justify-between">
                  <div>
                    <h5 className="font-bold text-xs flex items-center space-x-2">
                      <i className="fa-solid fa-table"></i>
                      <span>Inisialisasi Tabel di Supabase Baru</span>
                    </h5>
                    <p className="text-[11px] mt-1 leading-relaxed text-purple-800 dark:text-purple-400">
                      Sebelum database baru dapat digunakan, jalankan skrip SQL di bawah ini di <strong>SQL Editor</strong> dashboard Supabase Anda untuk membuat tabel dan mengaktifkan sinkronisasi realtime.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopySqlScript}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition text-xs shrink-0 flex items-center space-x-1.5 cursor-pointer ml-2"
                  >
                    <i className={`fa-solid ${copiedSql ? 'fa-check' : 'fa-copy'}`}></i>
                    <span>{copiedSql ? 'Tersalin!' : 'Salin Skrip SQL'}</span>
                  </button>
                </div>
              </div>

              <div className="relative">
                <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto max-h-56 leading-relaxed border border-slate-800">
{`-- SKRIP INISIALISASI DATABASE SUPABASE LENGKAP
CREATE TABLE IF NOT EXISTS public.app_database_sync (
    id TEXT PRIMARY KEY,
    database_payload JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.buildings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT DEFAULT '',
    floors INTEGER DEFAULT 1,
    total_rooms INTEGER DEFAULT 0,
    description TEXT DEFAULT '',
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.rooms (
    id TEXT PRIMARY KEY,
    room_number TEXT NOT NULL,
    building TEXT NOT NULL,
    floor INTEGER DEFAULT 1,
    type TEXT DEFAULT 'Standard',
    capacity INTEGER DEFAULT 2,
    price_per_night NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'KOSONG',
    active_tx_id TEXT,
    active_maint_id TEXT,
    qc_status TEXT DEFAULT 'LOLOS_QC',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT DEFAULT '',
    role TEXT NOT NULL,
    department TEXT DEFAULT 'Operasional',
    shift TEXT DEFAULT 'Pagi',
    status TEXT DEFAULT 'Aktif',
    password_hash TEXT DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Publikasi Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_database_sync;
ALTER PUBLICATION supabase_realtime ADD TABLE public.buildings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
`}
                </pre>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Catatan: Skrip lengkap 18 tabel dan fungsi verifikasi barcode/surat PDF juga tersedia di file project: <code className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">/supabase_schema.sql</code>.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Koneksi aman melalui HTTPS &amp; WSS (WebSockets)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
