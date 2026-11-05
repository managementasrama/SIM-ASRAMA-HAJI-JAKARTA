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

export function SpreadsheetIntegrationView() {
  const {
    currentUser,
    showToast,
    buildings,
    rooms,
    meetingRooms,
    roomCapacityRates,
    breakfastMenuItems,
    breakfastOrders,
    transactions,
    users,
    maintenances,
    qcInspections,
    workSessions,
    auditLogs,
    appSettings,
    pullFromCentralDatabase
  } = useAppContext();

  // Configuration state
  const [serviceUri, setServiceUri] = useState<string>('');
  const [host, setHost] = useState<string>('');
  const [port, setPort] = useState<number>(5432);
  const [database, setDatabase] = useState<string>('defaultdb');
  const [user, setUser] = useState<string>('avnadmin');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [useManualFields, setUseManualFields] = useState<boolean>(false);

  // Status & loading states
  const [config, setConfig] = useState<AivenConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState<boolean>(true);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isInitializingTables, setIsInitializingTables] = useState<boolean>(false);
  const [isPushing, setIsPushing] = useState<boolean>(false);
  const [isPulling, setIsPulling] = useState<boolean>(false);

  // Results & status info
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs?: number;
    version?: string;
    database?: string;
    user?: string;
    message?: string;
    error?: string;
  } | null>(null);

  // Table statistics
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

  // Fetch current Aiven config from backend
  const loadAivenConfig = async () => {
    setIsLoadingConfig(true);
    try {
      const res = await fetch('/api/aiven/config');
      if (res.ok) {
        const data: AivenConfig = await res.json();
        setConfig(data);
        if (data.serviceUri) {
          setServiceUri(data.serviceUri);
        }
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

  // Fetch table statistics
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

  // Parse Service URI dynamically when typed
  const handleServiceUriChange = (val: string) => {
    setServiceUri(val);
    try {
      if (val.trim().startsWith('postgres://') || val.trim().startsWith('postgresql://')) {
        const url = new URL(val.trim());
        setHost(url.hostname);
        setPort(url.port ? Number(url.port) : 5432);
        if (url.username) setUser(decodeURIComponent(url.username));
        if (url.password) setPassword(decodeURIComponent(url.password));
        if (url.pathname && url.pathname.length > 1) {
          setDatabase(url.pathname.replace(/^\//, ''));
        }
      }
    } catch (_) {
      // User is still typing URI, ignore parsing errors
    }
  };

  // Test Connection
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const payload: any = {};
      if (serviceUri.trim()) {
        payload.serviceUri = serviceUri.trim();
      } else if (host.trim() && password) {
        payload.host = host.trim();
        payload.port = port;
        payload.database = database;
        payload.user = user;
        payload.password = password;
        payload.ssl = true;
      }

      const res = await fetch('/api/aiven/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setTestResult(data);
      if (data.ok) {
        showToast(`Koneksi Aiven PostgreSQL Terverifikasi! Latensi: ${data.latencyMs}ms`, 'success');
        loadTableStats();
        loadAivenConfig();
      } else {
        showToast(data.message || data.error || 'Gagal terhubung ke Aiven', 'error');
      }
    } catch (err: any) {
      const msg = err?.message || 'Gagal menghubungi server';
      setTestResult({ ok: false, error: msg });
      showToast(`Galat tes koneksi: ${msg}`, 'error');
    } finally {
      setIsTesting(false);
    }
  };

  // Save Configuration
  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      const payload = {
        serviceUri: serviceUri.trim(),
        host: host.trim(),
        port: Number(port) || 5432,
        database: database.trim() || 'defaultdb',
        user: user.trim() || 'avnadmin',
        password: password.trim(),
        ssl: true
      };

      const res = await fetch('/api/aiven/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        setConfig(data.config);
        showToast('Konfigurasi database Aiven berhasil disimpan!', 'success');
        // Auto test connection right after saving
        handleTestConnection();
      } else {
        showToast('Gagal menyimpan konfigurasi Aiven.', 'error');
      }
    } catch (err: any) {
      showToast(`Galat penyimpanan: ${err?.message || 'Server error'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Initialize Tables
  const handleInitTables = async () => {
    setIsInitializingTables(true);
    try {
      const res = await fetch('/api/aiven/init-tables', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        showToast(`Berhasil inisialisasi ${data.total} tabel di Aiven Cloud PostgreSQL!`, 'success');
        loadTableStats();
      } else {
        showToast(data.error || 'Gagal inisialisasi tabel.', 'error');
      }
    } catch (err: any) {
      showToast(`Galat inisialisasi: ${err?.message || 'Server error'}`, 'error');
    } finally {
      setIsInitializingTables(false);
    }
  };

  // Push Local Data to Aiven
  const handlePushData = async () => {
    setIsPushing(true);
    try {
      const dataset = {
        buildings,
        rooms,
        meetingRooms,
        roomCapacityRates,
        breakfastMenuItems,
        breakfastOrders,
        transactions,
        users,
        maintenances,
        qcInspections,
        workSessions,
        auditLogs,
        appSettings
      };

      const res = await fetch('/api/aiven/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataset)
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Seluruh data sistem berhasil dikirim dan disimpan ke Aiven PostgreSQL!', 'success');
        loadTableStats();
      } else {
        showToast(data.error || 'Gagal mengirim data ke Aiven.', 'error');
      }
    } catch (err: any) {
      showToast(`Galat push data: ${err?.message || 'Server error'}`, 'error');
    } finally {
      setIsPushing(false);
    }
  };

  // Pull Data from Aiven
  const handlePullData = async () => {
    setIsPulling(true);
    try {
      const res = await fetch('/api/aiven/pull', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        showToast('Data terbaru berhasil diunduh dari Aiven Cloud PostgreSQL!', 'success');
        if (pullFromCentralDatabase) {
          await pullFromCentralDatabase();
        }
        loadTableStats();
      } else {
        showToast(data.error || 'Gagal menarik data dari Aiven.', 'error');
      }
    } catch (err: any) {
      showToast(`Galat pull data: ${err?.message || 'Server error'}`, 'error');
    } finally {
      setIsPulling(false);
    }
  };

  // Execute SQL Query
  const handleExecuteSql = async () => {
    if (!sqlQuery.trim()) return;
    setIsExecutingSql(true);
    setSqlResult(null);
    try {
      const res = await fetch('/api/aiven/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sqlQuery.trim() })
      });
      const data = await res.json();
      setSqlResult(data);
      if (data.ok) {
        showToast(`Query berhasil dijalankan (${data.rowCount} baris, ${data.durationMs}ms)`, 'success');
      } else {
        showToast(data.error || 'Query gagal dieksekusi', 'error');
      }
    } catch (err: any) {
      setSqlResult({ ok: false, error: err?.message || 'Gagal menghubungi server' });
    } finally {
      setIsExecutingSql(false);
    }
  };

  // Quick Table Preview
  const handlePreviewTable = async (tableName: string) => {
    setPreviewTableName(tableName);
    setIsLoadingPreview(true);
    try {
      const res = await fetch('/api/aiven/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: `SELECT * FROM ${tableName} LIMIT 25;` })
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.rows)) {
        setPreviewRows(data.rows);
      } else {
        setPreviewRows([]);
      }
    } catch (e) {
      setPreviewRows([]);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Total records across all tables
  const totalCloudRecords = useMemo(() => {
    return tableStats.reduce((acc, t) => acc + (t.count || 0), 0);
  }, [tableStats]);

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Status */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-7 rounded-3xl shadow-xl border border-indigo-500/30 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <i className="fa-solid fa-server text-9xl text-indigo-400"></i>
        </div>

        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/40">
              <i className="fa-solid fa-database text-xs"></i>
              <span>Aiven Cloud Database (PostgreSQL)</span>
            </span>

            {config?.isConfigured && config.lastConnectedAt && !config.lastError ? (
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span>Terhubung Real-Time</span>
              </span>
            ) : config?.lastError ? (
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-400/40">
                <i className="fa-solid fa-triangle-exclamation"></i>
                <span>Kendala Koneksi</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-400/40">
                <i className="fa-solid fa-circle-question"></i>
                <span>Siap Dikonfigurasi</span>
              </span>
            )}

            {config?.latencyMs && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-mono bg-white/10 text-slate-200 border border-white/15">
                <i className="fa-solid fa-bolt text-amber-400 text-[10px]"></i>
                <span>{config.latencyMs} ms</span>
              </span>
            )}
          </div>

          <div className="max-w-3xl space-y-2">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center space-x-2.5">
              <span>Pusat Basis Data Cloud Aiven</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                Enterprise SQL
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Basis data utama UPT Asrama Haji Jakarta telah ditingkatkan ke <strong>Aiven Managed PostgreSQL Cloud</strong>. Seluruh master data kamar, transaksi reservasi, pemeliharaan teknisi, katering sarapan, dan log audit tersimpan aman dengan enkripsi SSL/TLS tingkat tinggi.
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-indigo-500/20 text-xs">
            <div className="bg-white/5 backdrop-blur-xs p-3 rounded-2xl border border-white/10">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Host / Mesin Cloud</span>
              <span className="text-xs font-mono font-bold text-indigo-300 truncate block mt-0.5" title={config?.host || host || 'Belum diisi'}>
                {config?.host || host || 'Belum terhubung'}
              </span>
            </div>
            <div className="bg-white/5 backdrop-blur-xs p-3 rounded-2xl border border-white/10">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Nama Database</span>
              <span className="text-xs font-mono font-bold text-white block mt-0.5">
                {config?.database || database || 'defaultdb'}
              </span>
            </div>
            <div className="bg-white/5 backdrop-blur-xs p-3 rounded-2xl border border-white/10">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Rekord di Cloud</span>
              <span className="text-sm font-black text-emerald-300 block mt-0.5">
                {totalCloudRecords.toLocaleString('id-ID')} Rekord
              </span>
            </div>
            <div className="bg-white/5 backdrop-blur-xs p-3 rounded-2xl border border-white/10">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Versi Mesin SQL</span>
              <span className="text-[11px] font-mono text-slate-200 truncate block mt-0.5" title={config?.pgVersion || '-'}>
                {config?.pgVersion ? config.pgVersion.split(' ')[0] + ' ' + (config.pgVersion.split(' ')[1] || '') : 'PostgreSQL 15+'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Koneksi & Kredensial Aiven */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <i className="fa-solid fa-key text-indigo-600"></i>
              <span>Kredensial &amp; Konfigurasi Koneksi Aiven</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Salin <strong>Service URI</strong> langsung dari console.aiven.io (format: <code>postgres://user:password@host:port/database?sslmode=require</code>)
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setUseManualFields(!useManualFields)}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <i className={`fa-solid ${useManualFields ? 'fa-link' : 'fa-sliders'} mr-1.5`}></i>
              <span>{useManualFields ? 'Gunakan Service URI' : 'Pisah Form (Host & Port)'}</span>
            </button>
          </div>
        </div>

        {/* Input Fields */}
        <div className="space-y-4">
          {!useManualFields ? (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Service URI Aiven (Direkomendasikan)
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={serviceUri}
                  onChange={(e) => handleServiceUriChange(e.target.value)}
                  placeholder="postgres://avnadmin:AVNS_xxxx@pg-project-hajj.aivencloud.com:22468/defaultdb?sslmode=require"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:bg-white pr-20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                  title={showPassword ? 'Sembunyikan URI' : 'Tampilkan URI'}
                >
                  <i className={`fa-regular ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Aiven secara default menggunakan port custom (misal 22468) dan mewajibkan enkripsi <code>sslmode=require</code>.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Host Aiven</label>
                <input
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="pg-xxxx.aivencloud.com"
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Port</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  placeholder="22468"
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Database</label>
                <input
                  type="text"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  placeholder="defaultdb"
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Pengguna (User)</label>
                <input
                  type="text"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="avnadmin"
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Kata Sandi (Password)</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan kata sandi database Aiven"
                    className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                  >
                    <i className={`fa-regular ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons: Test & Save */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-2 cursor-pointer"
              >
                <i className={`fa-solid ${isTesting ? 'fa-spinner fa-spin' : 'fa-plug'}`}></i>
                <span>{isTesting ? 'Menguji Koneksi...' : 'Uji Koneksi Aiven (Ping)'}</span>
              </button>

              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={isSaving}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-2 cursor-pointer"
              >
                <i className={`fa-solid ${isSaving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
                <span>{isSaving ? 'Menyimpan...' : 'Simpan Kredensial Aiven'}</span>
              </button>
            </div>

            {config?.lastConnectedAt && (
              <span className="text-[11px] text-slate-400">
                Terakhir tersambung: {new Date(config.lastConnectedAt).toLocaleTimeString('id-ID')} WIB
              </span>
            )}
          </div>

          {/* Live Test Result Alert */}
          {testResult && (
            <div className={`p-4 rounded-2xl border text-xs animate-in fade-in duration-200 ${
              testResult.ok 
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-300'
            }`}>
              <div className="flex items-start space-x-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                  testResult.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  <i className={`fa-solid ${testResult.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}></i>
                </div>
                <div className="space-y-1">
                  <p className="font-bold">
                    {testResult.ok ? 'Koneksi ke Aiven PostgreSQL Berhasil!' : 'Koneksi ke Aiven Gagal!'}
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    {testResult.message || testResult.error}
                  </p>
                  {testResult.ok && (
                    <div className="flex flex-wrap gap-2 pt-1 font-mono text-[10px] text-emerald-700 dark:text-emerald-400">
                      <span>Database: {testResult.database}</span>
                      <span>•</span>
                      <span>User: {testResult.user}</span>
                      <span>•</span>
                      <span>Latensi: {testResult.latencyMs}ms</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Pusat Operasi Skema & Sinkronisasi Data */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <i className="fa-solid fa-arrows-rotate text-emerald-600"></i>
              <span>Pusat Sinkronisasi &amp; Migrasi Data Cloud</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Operasi skema database dan sinkronisasi dua arah antara sistem lokal dan Aiven PostgreSQL
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
          {/* Action 1: Inisialisasi Tabel */}
          <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20 flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-lg">
                <i className="fa-solid fa-table-list"></i>
              </div>
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                1. Inisialisasi Skema 13 Tabel
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                Membuat 13 tabel PostgreSQL standar enterprise (buildings, rooms, transactions, maintenances, dsb) secara otomatis di Aiven.
              </p>
            </div>
            <button
              type="button"
              onClick={handleInitTables}
              disabled={isInitializingTables}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer"
            >
              <i className={`fa-solid ${isInitializingTables ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`}></i>
              <span>{isInitializingTables ? 'Membuat Tabel...' : 'Buat / Perbarui Tabel'}</span>
            </button>
          </div>

          {/* Action 2: Push Data ke Aiven */}
          <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-lg">
                <i className="fa-solid fa-cloud-arrow-up"></i>
              </div>
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                2. Kirim Data Lokal ke Aiven (Push)
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                Menyimpan seluruh master data gedung, kamar, transaksi aktif, riwayat QC, dan akun petugas saat ini ke Aiven PostgreSQL.
              </p>
            </div>
            <button
              type="button"
              onClick={handlePushData}
              disabled={isPushing}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer"
            >
              <i className={`fa-solid ${isPushing ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}`}></i>
              <span>{isPushing ? 'Menyimpan ke Cloud...' : 'Kirim Data ke Aiven'}</span>
            </button>
          </div>

          {/* Action 3: Pull Data dari Aiven */}
          <div className="p-4 rounded-2xl border border-sky-200 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/20 flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 flex items-center justify-center font-bold text-lg">
                <i className="fa-solid fa-cloud-arrow-down"></i>
              </div>
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                3. Tarik Data dari Aiven (Pull)
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                Mengambil data terkini yang tersimpan di cloud Aiven dan menyinkronkannya kembali ke ruang kerja aplikasi.
              </p>
            </div>
            <button
              type="button"
              onClick={handlePullData}
              disabled={isPulling}
              className="w-full py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer"
            >
              <i className={`fa-solid ${isPulling ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-down'}`}></i>
              <span>{isPulling ? 'Mengunduh...' : 'Tarik Data dari Aiven'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Penjelajah Tabel & Rekord Aiven */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <i className="fa-solid fa-table text-indigo-600"></i>
              <span>Status &amp; Ringkasan 13 Tabel di Aiven</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pantau jumlah baris data yang tersimpan di setiap tabel database Aiven secara live
            </p>
          </div>

          <button
            type="button"
            onClick={loadTableStats}
            disabled={isLoadingStats}
            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer self-start sm:self-auto"
          >
            <i className={`fa-solid ${isLoadingStats ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`}></i>
            <span>Refresh Statistik</span>
          </button>
        </div>

        {/* Tables Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {tableStats.length > 0 ? (
            tableStats.map((tbl) => (
              <div
                key={tbl.name}
                className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 hover:border-indigo-300 transition flex flex-col justify-between space-y-2"
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-400 truncate">
                      {tbl.name}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      tbl.exists ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                    }`}>
                      {tbl.exists ? 'Tersedia' : 'Belum Ada'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium mt-1">
                    {tbl.label}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-700 text-xs">
                  <span className="font-black text-slate-900 dark:text-white">
                    {tbl.count.toLocaleString('id-ID')} Baris
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePreviewTable(tbl.name)}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center space-x-1 cursor-pointer"
                  >
                    <span>Preview</span>
                    <i className="fa-solid fa-arrow-right text-[9px]"></i>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full text-center py-6 text-xs text-slate-400">
              {isLoadingStats ? 'Memeriksa struktur tabel di Aiven...' : 'Tabel belum diinisialisasi atau koneksi belum terhubung.'}
            </div>
          )}
        </div>

        {/* Modal / Preview Table Rows */}
        {previewTableName && (
          <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/20 dark:bg-slate-900 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <i className="fa-solid fa-eye text-indigo-600"></i>
                <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                  Pratinjau Data Tabel: <span className="font-mono text-indigo-700 dark:text-indigo-400">{previewTableName}</span>
                </h4>
                <span className="text-[10px] text-slate-400">({previewRows.length} baris pertama)</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewTableName(null)}
                className="w-6 h-6 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 flex items-center justify-center text-xs text-slate-600 dark:text-slate-200 cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {isLoadingPreview ? (
              <div className="text-center py-6 text-xs text-slate-400">
                <i className="fa-solid fa-spinner fa-spin mr-2"></i>
                Mengambil data dari Aiven...
              </div>
            ) : previewRows.length > 0 ? (
              <div className="overflow-x-auto max-h-72 border border-slate-200 dark:border-slate-700 rounded-xl">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-100 dark:bg-slate-800 uppercase text-[10px] text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      {Object.keys(previewRows[0] || {}).map((col) => (
                        <th key={col} className="p-2 whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {previewRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-indigo-50/30">
                        {Object.values(row).map((val: any, cIdx) => (
                          <td key={cIdx} className="p-2 whitespace-nowrap text-[11px] text-slate-700 dark:text-slate-300">
                            {typeof val === 'object' && val !== null ? JSON.stringify(val).substring(0, 40) + '...' : String(val ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-slate-400">
                Tabel kosong atau belum memiliki rekord.
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Konsol SQL Interaktif Aiven (Untuk Admin & Pengembang) */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <i className="fa-solid fa-terminal text-indigo-600"></i>
              <span>Konsol Query SQL Interaktif Aiven</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Jalankan perintah SQL PostgreSQL langsung ke database cloud Aiven untuk audit atau verifikasi data
            </p>
          </div>
        </div>

        {/* Query Presets */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-400 text-[11px] font-bold mr-1">Preset Cepat:</span>
          <button
            type="button"
            onClick={() => setSqlQuery('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10;')}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 rounded-lg text-[11px] font-mono text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            10 Transaksi Terbaru
          </button>
          <button
            type="button"
            onClick={() => setSqlQuery('SELECT room_number, building_id, status, type FROM rooms ORDER BY room_number ASC;')}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 rounded-lg text-[11px] font-mono text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            Status Kamar
          </button>
          <button
            type="button"
            onClick={() => setSqlQuery('SELECT role, count(*) as total_petugas FROM users GROUP BY role;')}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 rounded-lg text-[11px] font-mono text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            Jumlah Petugas per Role
          </button>
          <button
            type="button"
            onClick={() => setSqlQuery('SELECT count(*) as total_tx, sum(total_price) as omset_total FROM transactions;')}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 rounded-lg text-[11px] font-mono text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            Total Omset Transaksi
          </button>
        </div>

        {/* SQL Textarea */}
        <div className="space-y-2">
          <textarea
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            rows={4}
            placeholder="Tuliskan query SQL di sini (misal: SELECT * FROM rooms WHERE status = 'TERISI';)"
            className="w-full p-3 bg-slate-950 text-emerald-400 font-mono text-xs rounded-2xl border border-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              * Hanya query SQL yang valid yang akan dieksekusi di database Aiven.
            </span>
            <button
              type="button"
              onClick={handleExecuteSql}
              disabled={isExecutingSql || !sqlQuery.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer shadow-xs"
            >
              <i className={`fa-solid ${isExecutingSql ? 'fa-spinner fa-spin' : 'fa-play'}`}></i>
              <span>{isExecutingSql ? 'Mengeksekusi...' : 'Jalankan Query SQL'}</span>
            </button>
          </div>
        </div>

        {/* Query Results */}
        {sqlResult && (
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between text-xs">
              <span className={`font-bold ${sqlResult.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
                {sqlResult.ok ? `Hasil Eksekusi (${sqlResult.rowCount} Baris)` : 'Eksekusi Gagal'}
              </span>
              {sqlResult.durationMs && (
                <span className="text-[11px] font-mono text-slate-400">
                  Waktu: {sqlResult.durationMs}ms
                </span>
              )}
            </div>

            {sqlResult.ok && sqlResult.rows && sqlResult.rows.length > 0 ? (
              <div className="overflow-x-auto max-h-80 border border-slate-200 dark:border-slate-700 rounded-xl">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-100 dark:bg-slate-800 uppercase text-[10px] text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      {(sqlResult.columns || []).map((col) => (
                        <th key={col} className="p-2 whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {sqlResult.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-750">
                        {(sqlResult.columns || []).map((col) => (
                          <td key={col} className="p-2 whitespace-nowrap text-[11px] text-slate-700 dark:text-slate-300">
                            {typeof row[col] === 'object' && row[col] !== null ? JSON.stringify(row[col]) : String(row[col] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : sqlResult.ok ? (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 text-center">
                Query berhasil dieksekusi tanpa baris hasil.
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-mono">
                {sqlResult.error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 6. Panduan Singkat Hubungkan Aiven Console */}
      <div className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-3">
        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center space-x-2">
          <i className="fa-solid fa-circle-question text-indigo-500"></i>
          <span>Panduan Cepat Akun Aiven Cloud Database</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600 dark:text-slate-400">
          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
            <span className="font-bold text-slate-800 dark:text-slate-200">1. Masuk ke Aiven</span>
            <p className="text-[11px]">Buka <a href="https://console.aiven.io" target="_blank" rel="noreferrer" className="text-indigo-600 underline">console.aiven.io</a> dan buat service <strong>PostgreSQL</strong> (pilih plan Free atau Developer tier).</p>
          </div>
          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
            <span className="font-bold text-slate-800 dark:text-slate-200">2. Salin Service URI</span>
            <p className="text-[11px]">Pada halaman <em>Overview</em> service Anda di Aiven, klik tombol <strong>Copy Service URI</strong>.</p>
          </div>
          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
            <span className="font-bold text-slate-800 dark:text-slate-200">3. Tempel &amp; Inisialisasi</span>
            <p className="text-[11px]">Tempelkan ke formulir di atas, klik <strong>Simpan</strong>, lalu klik <strong>Buat / Perbarui Tabel</strong> untuk memulai.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Export alias for clean architectural naming
export const AivenDatabaseHub = SpreadsheetIntegrationView;
