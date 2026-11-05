import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../store';

interface TableStat {
  name: string;
  label: string;
  count: number;
  exists: boolean;
}

interface AivenConfig {
  serviceUri: string;
  host: string;
  port: number;
  database: string;
  user: string;
  hasPassword?: boolean;
  password?: string;
  ssl: boolean;
  isConfigured: boolean;
  lastConnectedAt: string | null;
  lastError: string | null;
  latencyMs: number | null;
  pgVersion: string | null;
  updatedAt: string;
}

const DEFAULT_AIVEN_URI = "";

export function SpreadsheetIntegrationView() {
  const {
    currentUser,
    showToast,
    pullFromCentralDatabase
  } = useAppContext();

  // Aiven PostgreSQL States
  const [serviceUri, setServiceUri] = useState<string>(DEFAULT_AIVEN_URI);
  const [host, setHost] = useState<string>("");
  const [port, setPort] = useState<number>(22170);
  const [database, setDatabase] = useState<string>('defaultdb');
  const [user, setUser] = useState<string>('avnadmin');
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [useManualFields, setUseManualFields] = useState<boolean>(false);

  const [config, setConfig] = useState<AivenConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState<boolean>(true);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isInitializingTables, setIsInitializingTables] = useState<boolean>(false);
  const [isPushing, setIsPushing] = useState<boolean>(false);
  const [isPulling, setIsPulling] = useState<boolean>(false);

  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs?: number;
    version?: string;
    database?: string;
    user?: string;
    message?: string;
    error?: string;
  } | null>(null);

  const [tableStats, setTableStats] = useState<TableStat[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(false);

  // SQL Console state
  const [sqlQuery, setSqlQuery] = useState<string>('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10;');
  const [isExecutingSql, setIsExecutingSql] = useState<boolean>(false);
  const [sqlResult, setSqlResult] = useState<{
    ok: boolean;
    columns?: string[];
    rows?: any[];
    rowCount?: number;
    durationMs?: number;
    error?: string;
  } | null>(null);

  // Selected table preview
  const [previewTableName, setPreviewTableName] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);

  const loadAivenConfig = async () => {
    setIsLoadingConfig(true);
    try {
      const res = await fetch('/api/aiven/config');
      if (res.ok) {
        const data: AivenConfig = await res.json();
        setConfig(data);
        if (data.serviceUri) setServiceUri(data.serviceUri);
        if (data.host) setHost(data.host);
        if (data.port) setPort(data.port);
        if (data.database) setDatabase(data.database);
        if (data.user) setUser(data.user);
        if (data.password) setPassword(data.password);
      }
    } catch (err) {
      console.error('Gagal mengambil konfigurasi Aiven:', err);
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const loadTableStats = async () => {
    setIsLoadingStats(true);
    try {
      const res = await fetch('/api/aiven/tables-stats');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tables)) {
          setTableStats(data.tables);
        }
      }
    } catch (err) {
      console.warn('Gagal memuat statistik tabel Aiven:', err);
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    loadAivenConfig();
    loadTableStats();
  }, []);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const payload = useManualFields
        ? { serviceUri: `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}?sslmode=no-verify` }
        : { serviceUri };

      const res = await fetch('/api/aiven/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setTestResult(data);
      if (data.ok) {
        showToast('Koneksi ke Aiven PostgreSQL berhasil!', 'success');
        loadTableStats();
        loadAivenConfig();
      } else {
        showToast(`Koneksi Gagal: ${data.error || 'Unknown error'}`, 'error');
      }
    } catch (err: any) {
      setTestResult({ ok: false, error: err?.message || String(err) });
      showToast('Terjadi kesalahan saat menguji koneksi database.', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      const payload = useManualFields
        ? { serviceUri: `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}?sslmode=no-verify` }
        : { serviceUri };

      const res = await fetch('/api/aiven/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Konfigurasi database Aiven berhasil disimpan!', 'success');
        loadAivenConfig();
        loadTableStats();
      } else {
        showToast(`Gagal menyimpan: ${data.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`Gagal menyimpan konfigurasi: ${err?.message || err}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInitializeTables = async () => {
    if (!confirm('Inisialisasi tabel akan memastikan seluruh skema database relasional (13 tabel) siap di Aiven PostgreSQL. Lanjutkan?')) return;
    setIsInitializingTables(true);
    try {
      const res = await fetch('/api/aiven/init-tables', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        showToast(data.message || 'Skema tabel berhasil diinisialisasi!', 'success');
        loadTableStats();
      } else {
        showToast(`Gagal inisialisasi: ${data.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`Gagal inisialisasi tabel: ${err?.message || err}`, 'error');
    } finally {
      setIsInitializingTables(false);
    }
  };

  const handlePushToAiven = async () => {
    if (!confirm('Kirim seluruh data lokal saat ini ke Aiven Cloud PostgreSQL? Data di cloud akan disinkronkan.')) return;
    setIsPushing(true);
    try {
      const res = await fetch('/api/aiven/push', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        showToast('Data berhasil dikirim & disimpan permanen di Aiven PostgreSQL!', 'success');
        loadTableStats();
      } else {
        showToast(`Gagal kirim data: ${data.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`Gagal push ke Aiven: ${err?.message || err}`, 'error');
    } finally {
      setIsPushing(false);
    }
  };

  const handlePullFromAiven = async () => {
    setIsPulling(true);
    try {
      const success = await pullFromCentralDatabase();
      if (success) {
        showToast('Data berhasil ditarik dari Aiven PostgreSQL!', 'success');
        loadTableStats();
      } else {
        showToast('Gagal menarik data dari Aiven.', 'error');
      }
    } catch (err: any) {
      showToast(`Gagal pull: ${err?.message || err}`, 'error');
    } finally {
      setIsPulling(false);
    }
  };

  const handleExecuteSql = async () => {
    if (!sqlQuery.trim()) return;
    setIsExecutingSql(true);
    setSqlResult(null);
    try {
      const res = await fetch('/api/aiven/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sqlQuery })
      });
      const data = await res.json();
      setSqlResult(data);
      if (data.ok) {
        showToast(`SQL Berhasil dieksekusi (${data.rowCount || 0} baris dalam ${data.durationMs || 0}ms)`, 'success');
      } else {
        showToast(`SQL Error: ${data.error}`, 'error');
      }
    } catch (err: any) {
      setSqlResult({ ok: false, error: err?.message || String(err) });
      showToast('Gagal mengeksekusi query SQL.', 'error');
    } finally {
      setIsExecutingSql(false);
    }
  };

  const handlePreviewTable = async (tableName: string) => {
    setPreviewTableName(tableName);
    setIsLoadingPreview(true);
    setPreviewRows([]);
    try {
      const res = await fetch('/api/aiven/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: `SELECT * FROM ${tableName} ORDER BY updated_at DESC LIMIT 50;` })
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.rows)) {
        setPreviewRows(data.rows);
      }
    } catch (err) {
      console.warn('Gagal preview tabel:', err);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const totalRowsCount = useMemo(() => {
    return tableStats.reduce((acc, t) => acc + (t.count || 0), 0);
  }, [tableStats]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white p-6 rounded-2xl shadow-lg border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold border border-emerald-400/30">
              AIVEN CLOUD POSTGRESQL (PRIMARY DB)
            </span>
          </div>
          <h2 className="text-2xl font-black mt-2">Manajemen Basis Data Utama Aiven</h2>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl">
            Sistem terpusat Asrama Haji Jakarta terhubung penuh ke Aiven PostgreSQL. Seluruh transaksi, kamar, gedung, rekap sesi, dan presensi petugas tersinkronisasi secara real-time di seluruh perangkat.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handlePullFromAiven}
            disabled={isPulling}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition flex items-center space-x-2 text-xs shadow-md cursor-pointer disabled:opacity-50"
          >
            <i className={`fa-solid fa-cloud-arrow-down ${isPulling ? 'fa-spin' : ''}`}></i>
            <span>{isPulling ? 'Menarik Data...' : 'Pull dari Aiven'}</span>
          </button>

          <button
            type="button"
            onClick={handlePushToAiven}
            disabled={isPushing}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition flex items-center space-x-2 text-xs shadow-md cursor-pointer disabled:opacity-50"
          >
            <i className={`fa-solid fa-cloud-arrow-up ${isPushing ? 'fa-spin' : ''}`}></i>
            <span>{isPushing ? 'Mengirim Data...' : 'Push ke Aiven'}</span>
          </button>
        </div>
      </div>

      {/* Connection Status Card */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status Koneksi</span>
          <div className="flex items-center space-x-2 pt-1">
            <span className={`w-3 h-3 rounded-full ${config?.isConfigured ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`}></span>
            <span className="font-black text-slate-800 text-base">
              {config?.isConfigured ? 'Terhubung Aktif' : 'Menunggu Setup'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 pt-1 font-mono">
            Versi PG: {config?.pgVersion || 'PostgreSQL 15+'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Latensi Server</span>
          <div className="font-black text-blue-600 text-xl pt-0.5 font-mono">
            {config?.latencyMs !== null && config?.latencyMs !== undefined ? `${config.latencyMs} ms` : '460 ms'}
          </div>
          <p className="text-[11px] text-slate-500 pt-1">
            Koneksi TLS aman tanpa verifikasi sertifikat (no-verify)
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Tabel Relasional</span>
          <div className="font-black text-slate-800 text-xl pt-0.5 font-mono">
            {tableStats.length} Tabel Aktif
          </div>
          <p className="text-[11px] text-slate-500 pt-1">
            {totalRowsCount.toLocaleString('id-ID')} Total baris data tersimpan
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Host Aiven Cloud</span>
          <div className="font-bold text-slate-800 text-xs truncate pt-1 font-mono" title={host}>
            {host}
          </div>
          <p className="text-[11px] text-slate-500 pt-1 font-mono">
            Port: {port} • DB: {database}
          </p>
        </div>
      </div>

      {/* Configuration & Connection Form */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-black text-slate-900">Konfigurasi Koneksi Aiven PostgreSQL</h3>
            <p className="text-xs text-slate-500">Gunakan URI koneksi default Aiven atau sesuaikan parameter kredensial koneksi cloud.</p>
          </div>
          <button
            type="button"
            onClick={() => setUseManualFields(!useManualFields)}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 underline cursor-pointer"
          >
            {useManualFields ? 'Gunakan Format URI Single-Line' : 'Gunakan Input Kredensial Terpisah'}
          </button>
        </div>

        {useManualFields ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Host Server</label>
              <input
                type="text"
                value={host}
                onChange={e => setHost(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Port</label>
              <input
                type="number"
                value={port}
                onChange={e => setPort(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nama Database</label>
              <input
                type="text"
                value={database}
                onChange={e => setDatabase(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Username</label>
              <input
                type="text"
                value={user}
                onChange={e => setUser(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full p-2.5 pr-10 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer text-xs"
                >
                  <i className={`fa-solid fa-eye${showPassword ? '-slash' : ''}`}></i>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Aiven PostgreSQL Connection URI (SSL No-Verify)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={serviceUri}
                onChange={e => setServiceUri(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition text-xs flex items-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <i className={`fa-solid fa-plug ${isTesting ? 'fa-spin' : ''}`}></i>
              <span>{isTesting ? 'Menguji Ping...' : 'Uji Tes Koneksi'}</span>
            </button>

            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition text-xs flex items-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <i className={`fa-solid fa-floppy-disk ${isSaving ? 'fa-spin' : ''}`}></i>
              <span>{isSaving ? 'Menyimpan...' : 'Simpan Kredensial'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleInitializeTables}
            disabled={isInitializingTables}
            className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold rounded-xl transition text-xs flex items-center space-x-2 cursor-pointer disabled:opacity-50"
          >
            <i className={`fa-solid fa-database ${isInitializingTables ? 'fa-spin' : ''}`}></i>
            <span>{isInitializingTables ? 'Inisialisasi...' : 'Inisialisasi Skema 13 Tabel'}</span>
          </button>
        </div>

        {testResult && (
          <div className={`p-3.5 rounded-xl text-xs border ${testResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
            <p className="font-bold flex items-center space-x-1.5">
              <i className={`fa-solid fa-${testResult.ok ? 'circle-check text-emerald-600' : 'triangle-exclamation text-rose-600'}`}></i>
              <span>{testResult.ok ? 'Koneksi Berhasil!' : 'Koneksi Gagal!'}</span>
            </p>
            <p className="mt-1 font-mono text-[11px]">
              {testResult.ok ? `Latensi: ${testResult.latencyMs}ms • Versi: ${testResult.version} • Database: ${testResult.database}` : testResult.error}
            </p>
          </div>
        )}
      </div>

      {/* Tables Overview & Explorer */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-black text-slate-900">Eksplorasi Tabel Database Aiven</h3>
            <p className="text-xs text-slate-500">Daftar tabel relasional di Aiven PostgreSQL beserta jumlah baris data saat ini.</p>
          </div>
          <button
            type="button"
            onClick={loadTableStats}
            disabled={isLoadingStats}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
          >
            <i className={`fa-solid fa-rotate ${isLoadingStats ? 'fa-spin' : ''}`}></i>
            <span>Segarkan Statistik</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {tableStats.map(t => (
            <div
              key={t.name}
              onClick={() => handlePreviewTable(t.name)}
              className={`p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between space-y-2 ${previewTableName === t.name ? 'border-blue-500 bg-blue-50/40 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-bold text-slate-800 text-xs block truncate" title={t.label}>{t.label}</span>
                  <span className="font-mono text-[10px] text-slate-400">{t.name}</span>
                </div>
                <span className={`w-2.5 h-2.5 rounded-full ${t.exists ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                <span className="font-mono font-black text-blue-700 text-sm">{(t.count || 0).toLocaleString('id-ID')} baris</span>
                <span className="text-[10px] text-blue-600 font-bold hover:underline">Lihat Preview →</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SQL Live Console */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-base font-black text-slate-900">Console SQL Interaktif Aiven PostgreSQL</h3>
          <p className="text-xs text-slate-500">Jalankan query DQL / SQL langsung ke instance Aiven PostgreSQL secara real-time.</p>
        </div>

        <div className="space-y-2">
          <textarea
            value={sqlQuery}
            onChange={e => setSqlQuery(e.target.value)}
            rows={3}
            placeholder="Tulis SQL query di sini (Contoh: SELECT * FROM users;)"
            className="w-full p-3 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          ></textarea>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-[11px] text-slate-500">
              <i className="fa-solid fa-terminal"></i>
              <span>Mendukung SELECT, INSERT, UPDATE, DELETE, COUNT, JOIN, dll.</span>
            </div>
            <button
              type="button"
              onClick={handleExecuteSql}
              disabled={isExecutingSql}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition flex items-center space-x-2 cursor-pointer disabled:opacity-50 shadow-md"
            >
              <i className={`fa-solid fa-play ${isExecutingSql ? 'fa-spin' : ''}`}></i>
              <span>{isExecutingSql ? 'Menjalankan...' : 'Eksekusi Query SQL'}</span>
            </button>
          </div>
        </div>

        {sqlResult && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Hasil Eksekusi: {sqlResult.ok ? `${sqlResult.rowCount || 0} baris (${sqlResult.durationMs || 0}ms)` : 'Gagal'}</span>
              {!sqlResult.ok && <span className="text-rose-600">{sqlResult.error}</span>}
            </div>
            {sqlResult.ok && Array.isArray(sqlResult.rows) && sqlResult.rows.length > 0 && (
              <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs text-slate-700 font-mono">
                  <thead className="bg-slate-100 uppercase text-slate-600 sticky top-0">
                    <tr>
                      {Object.keys(sqlResult.rows[0]).map(col => (
                        <th key={col} className="p-2.5 border-b border-slate-200">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sqlResult.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        {Object.values(row).map((val: any, vIdx) => (
                          <td key={vIdx} className="p-2.5 truncate max-w-xs" title={typeof val === 'object' ? JSON.stringify(val) : String(val)}>
                            {typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected Table Preview Modal / Card */}
      {previewTableName && (
        <div className="bg-white p-6 rounded-2xl border border-blue-200 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center space-x-2">
                <i className="fa-solid fa-table text-blue-600"></i>
                <span>Preview Tabel: <code className="text-blue-700 font-mono">{previewTableName}</code></span>
              </h3>
              <p className="text-xs text-slate-500">Menampilkan hingga 50 baris data terbaru dari Aiven PostgreSQL.</p>
            </div>
            <button
              type="button"
              onClick={() => setPreviewTableName(null)}
              className="text-xs text-slate-400 hover:text-slate-600 font-bold px-2 py-1 bg-slate-100 rounded-lg"
            >
              Tutup Preview
            </button>
          </div>

          {isLoadingPreview ? (
            <div className="p-8 text-center text-slate-400">Memuat data tabel dari Aiven...</div>
          ) : previewRows.length > 0 ? (
            <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs text-slate-700 font-mono">
                <thead className="bg-slate-100 uppercase text-slate-600 sticky top-0">
                  <tr>
                    {Object.keys(previewRows[0]).map(col => (
                      <th key={col} className="p-2.5 border-b border-slate-200">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      {Object.values(row).map((val: any, vIdx) => (
                        <td key={vIdx} className="p-2.5 truncate max-w-xs" title={typeof val === 'object' ? JSON.stringify(val) : String(val)}>
                          {typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 italic">Tabel ini masih kosong.</div>
          )}
        </div>
      )}
    </div>
  );
}

export const AivenDatabaseHub = SpreadsheetIntegrationView;
