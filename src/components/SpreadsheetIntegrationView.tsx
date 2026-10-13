import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../store';
import { ActionConfirmModal } from './CatalogManagementModals';

export function SpreadsheetIntegrationView() {
  const { 
    currentUser, 
    showToast, 
    buildings, 
    rooms, 
    meetingRooms, 
    transactions, 
    users, 
    maintenances, 
    dataStorage,
    pushAllToSupabase,
    pullFromCentralDatabase
  } = useAppContext();

  const [scriptUrl, setScriptUrl] = useState('');
  const [sheetDocUrl, setSheetDocUrl] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>('Belum disinkronkan');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  
  // Data hasil baca dari Spreadsheet
  const [fetchedData, setFetchedData] = useState<{
    buildings?: any[];
    rooms?: any[];
    transactions?: any[];
    users?: any[];
    raw?: any;
  } | null>(null);
  
  const [activePreviewTab, setActivePreviewTab] = useState<'BUILDINGS' | 'ROOMS' | 'TRANSACTIONS' | 'USERS' | 'RAW'>('BUILDINGS');
  const [activeGuideTab, setActiveGuideTab] = useState<'STEP1' | 'STEP2' | 'STEP3' | 'SCRIPT'>('STEP1');
  const [copiedScript, setCopiedScript] = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [showPushConfirm, setShowPushConfirm] = useState(false);
  const [syncLogs, setSyncLogs] = useState<Array<{ time: string; type: 'FETCH' | 'PUSH' | 'CONFIG'; message: string; success: boolean }>>([]);

  // Ambil konfigurasi tersimpan saat pertama kali dibuka
  useEffect(() => {
    try {
      const savedUrl = localStorage.getItem('CUSTOM_SHEET_WEBAPP_URL');
      const savedDocUrl = localStorage.getItem('CUSTOM_SHEET_DOC_URL');
      const savedLastTime = localStorage.getItem('CUSTOM_SHEET_LAST_SYNC');
      
      if (savedUrl) {
        setScriptUrl(savedUrl);
        setIsConnected(true);
        setSyncStatus('Terkonfigurasi dengan URL Web App');
      }
      if (savedDocUrl) {
        setSheetDocUrl(savedDocUrl);
      }
      if (savedLastTime) {
        setLastSyncTime(savedLastTime);
      }
    } catch (_) {}
  }, []);

  const addLog = (type: 'FETCH' | 'PUSH' | 'CONFIG', message: string, success: boolean) => {
    const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setSyncLogs(prev => [{ time: timeStr, type, message, success }, ...prev.slice(0, 19)]);
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = scriptUrl.trim();
    if (!cleanUrl.startsWith('https://script.google.com/macros/s/') || !cleanUrl.includes('/exec')) {
      showToast('Format URL Web App Google Apps Script tidak valid! Harus berawalan https://script.google.com/macros/s/... dan berakhiran /exec', 'warning');
      return;
    }
    
    try {
      localStorage.setItem('CUSTOM_SHEET_WEBAPP_URL', cleanUrl);
      if (sheetDocUrl.trim()) {
        localStorage.setItem('CUSTOM_SHEET_DOC_URL', sheetDocUrl.trim());
      }
      setIsConnected(true);
      setSyncStatus('URL Web App Google Apps Script berhasil disimpan');
      addLog('CONFIG', 'URL Web App Google Apps Script berhasil disimpan.', true);
      showToast('Konfigurasi Google Spreadsheet berhasil disimpan!', 'success');
    } catch (err: any) {
      showToast('Gagal menyimpan konfigurasi ke browser', 'error');
    }
  };

  const handleResetConfig = () => {
    try {
      localStorage.removeItem('CUSTOM_SHEET_WEBAPP_URL');
      localStorage.removeItem('CUSTOM_SHEET_DOC_URL');
      localStorage.removeItem('CUSTOM_SHEET_LAST_SYNC');
      setScriptUrl('');
      setSheetDocUrl('');
      setIsConnected(false);
      setFetchedData(null);
      setSyncStatus('Konfigurasi telah direset');
      setLastSyncTime(null);
      addLog('CONFIG', 'Konfigurasi Spreadsheet dikosongkan.', true);
      showToast('Konfigurasi integrasi Spreadsheet telah dihapus.', 'info');
    } catch (_) {}
  };

  // Baca Data dari Spreadsheet via GET
  const handleTestDataFetch = async () => {
    if (!scriptUrl.trim()) {
      showToast('Masukkan URL Web App Google Apps Script terlebih dahulu!', 'warning');
      return;
    }
    setIsLoading(true);
    setSyncStatus('Sedang membaca database dari Google Spreadsheet...');
    
    try {
      const response = await fetch(scriptUrl.trim(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const raw = await response.json();
      const nowStr = new Date().toLocaleString('id-ID');
      setLastSyncTime(nowStr);
      try {
        localStorage.setItem('CUSTOM_SHEET_LAST_SYNC', nowStr);
      } catch (_) {}

      // Normalisasi struktur data yang dikembalikan oleh doGet
      let normalizedBuildings: any[] = [];
      let normalizedRooms: any[] = [];
      let normalizedTransactions: any[] = [];
      let normalizedUsers: any[] = [];

      if (raw && typeof raw === 'object') {
        const d = raw.data || raw;
        if (Array.isArray(d.buildings)) normalizedBuildings = d.buildings;
        if (Array.isArray(d.rooms)) normalizedRooms = d.rooms;
        if (Array.isArray(d.transactions)) normalizedTransactions = d.transactions;
        if (Array.isArray(d.users)) normalizedUsers = d.users;
      }

      setFetchedData({
        buildings: normalizedBuildings,
        rooms: normalizedRooms,
        transactions: normalizedTransactions,
        users: normalizedUsers,
        raw
      });

      setIsConnected(true);
      const summaryMsg = `Berhasil membaca: ${normalizedBuildings.length} Gedung, ${normalizedRooms.length} Kamar, ${normalizedTransactions.length} Transaksi, ${normalizedUsers.length} Akun`;
      setSyncStatus(summaryMsg);
      addLog('FETCH', summaryMsg, true);
      showToast('Koneksi berhasil! Seluruh data dari Google Spreadsheet berhasil terbaca.', 'success');
    } catch (err: any) {
      console.error('Error fetching spreadsheet data:', err);
      const errMsg = `Gagal membaca Spreadsheet: ${err?.message || 'Pastikan izin Web App diatur ke "Anyone"'}`;
      setSyncStatus(errMsg);
      addLog('FETCH', errMsg, false);
      showToast('Gagal terhubung ke Spreadsheet. Pastikan Web App di-deploy dengan akses "Anyone" (Siapa Saja).', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Terapkan data yang dibaca dari Spreadsheet ke aplikasi
  const handleApplyDataToApp = async () => {
    if (!fetchedData) return;
    setShowApplyConfirm(false);
    setIsLoading(true);

    try {
      const currentDb = dataStorage.getDatabase();
      const updatedDb = {
        ...currentDb,
        buildings: (fetchedData.buildings && fetchedData.buildings.length > 0) ? fetchedData.buildings : currentDb.buildings,
        rooms: (fetchedData.rooms && fetchedData.rooms.length > 0) ? fetchedData.rooms : currentDb.rooms,
        transactions: (fetchedData.transactions && fetchedData.transactions.length > 0) ? fetchedData.transactions : currentDb.transactions,
        users: (fetchedData.users && fetchedData.users.length > 0) ? fetchedData.users : currentDb.users,
        exportedAt: new Date().toISOString()
      };

      dataStorage.saveDatabase(updatedDb);
      await pushAllToSupabase(updatedDb);
      await pullFromCentralDatabase();

      showToast('Data dari Google Spreadsheet berhasil diterapkan ke sistem dan database cloud!', 'success');
      addLog('FETCH', 'Data dari Spreadsheet berhasil diterapkan ke sistem & Supabase.', true);
    } catch (err: any) {
      showToast(`Gagal menerapkan data: ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Kirim (Export) Data Aplikasi ke Google Spreadsheet via POST
  const handlePushDataToSpreadsheet = async () => {
    setShowPushConfirm(false);
    if (!scriptUrl.trim()) {
      showToast('Masukkan URL Web App terlebih dahulu!', 'warning');
      return;
    }
    setIsPushing(true);
    setSyncStatus('Sedang mengirim data aplikasi ke Google Spreadsheet...');

    try {
      const payload = {
        action: 'SAVE_ALL',
        timestamp: new Date().toISOString(),
        buildings: buildings.map(b => ({
          id: b.id,
          name: b.name,
          code: b.code || '',
          floors: b.floors || 1,
          total_rooms: b.totalRooms || 0,
          category: b.category || 'PENGINAPAN',
          status: b.status || 'AKTIF'
        })),
        rooms: rooms.map(r => ({
          id: r.id,
          room_number: r.roomNumber,
          building: r.building,
          floor: r.floor || 1,
          type: r.type || 'Standar',
          capacity: r.capacity || '',
          status: r.status || 'KOSONG',
          price_per_night: r.pricePerNight || 0
        })),
        transactions: transactions.map(t => ({
          id: t.id,
          room_number: t.roomNumber,
          building: t.building || '',
          guest_name: t.guestName,
          category: t.category,
          status: t.status,
          start_date: t.startDate,
          duration: t.duration,
          phone: t.phone || '',
          notes: t.notes || ''
        })),
        users: users.map(u => ({
          id: u.id,
          username: u.username,
          full_name: u.fullName,
          role: u.role,
          department: u.department || '',
          status: u.status || 'Aktif',
          phone: u.phone || ''
        }))
      };

      // Catatan: Google Apps Script Web App menerima POST via text/plain agar tidak terkena CORS preflight issue
      const response = await fetch(scriptUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload)
      });

      const resJson = await response.json().catch(() => ({ status: 'success' }));
      const nowStr = new Date().toLocaleString('id-ID');
      setLastSyncTime(nowStr);
      try {
        localStorage.setItem('CUSTOM_SHEET_LAST_SYNC', nowStr);
      } catch (_) {}

      setSyncStatus('Data aplikasi berhasil dikirim dan disimpan ke baris Google Spreadsheet!');
      addLog('PUSH', 'Data berhasil dikirim ke Google Spreadsheet.', true);
      showToast('Data aplikasi berhasil disinkronkan ke Google Spreadsheet!', 'success');
    } catch (err: any) {
      console.error('Error pushing data to spreadsheet:', err);
      const errMsg = `Gagal mengirim data ke Spreadsheet: ${err?.message || 'Cek fungsi doPost di Apps Script'}`;
      setSyncStatus(errMsg);
      addLog('PUSH', errMsg, false);
      showToast('Gagal mengirim data ke Spreadsheet. Pastikan fungsi doPost() terpasang di Apps Script.', 'error');
    } finally {
      setIsPushing(false);
    }
  };

  // Kode Google Apps Script siap salin (Code.gs)
  const appsScriptCode = `/**
 * ==============================================================================
 * KODE RESMI GOOGLE APPS SCRIPT: INTEGRASI SIM ASRAMA HAJI JAKARTA
 * Pasang skrip ini di Google Spreadsheet: Menu Extensions > Apps Script
 * ==============================================================================
 */

// 1. FUNGSI UNTUK MEMBACA SELURUH DATA DARI SPREADSHEET (GET REQUEST)
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var result = {
      status: "success",
      generatedAt: new Date().toISOString(),
      data: {
        buildings: readSheetAsObjects(ss, "buildings"),
        rooms: readSheetAsObjects(ss, "rooms"),
        transactions: readSheetAsObjects(ss, "transactions"),
        users: readSheetAsObjects(ss, "users")
      }
    };

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. FUNGSI UNTUK MENULIS / MENYINKRONKAN DATA DARI APLIKASI KE SPREADSHEET (POST REQUEST)
function doPost(e) {
  try {
    var contents = e.postData ? e.postData.contents : "";
    var payload = JSON.parse(contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (payload.buildings && Array.isArray(payload.buildings)) {
      writeObjectsToSheet(ss, "buildings", payload.buildings);
    }
    if (payload.rooms && Array.isArray(payload.rooms)) {
      writeObjectsToSheet(ss, "rooms", payload.rooms);
    }
    if (payload.transactions && Array.isArray(payload.transactions)) {
      writeObjectsToSheet(ss, "transactions", payload.transactions);
    }
    if (payload.users && Array.isArray(payload.users)) {
      writeObjectsToSheet(ss, "users", payload.users);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Data berhasil disinkronkan ke Google Spreadsheet!",
      updatedAt: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// HELPER: Membaca sheet menjadi array of JSON objects berdasarkan baris header (Baris 1)
function readSheetAsObjects(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var obj = {};
    var hasContent = false;
    for (var j = 0; j < headers.length; j++) {
      var key = String(headers[j]).trim();
      if (key) {
        obj[key] = row[j];
        if (row[j] !== "" && row[j] !== null) hasContent = true;
      }
    }
    if (hasContent) rows.push(obj);
  }
  return rows;
}

// HELPER: Menulis array of objects ke sheet (membuat header otomatis jika sheet baru)
function writeObjectsToSheet(ss, sheetName, items) {
  if (!items || items.length === 0) return;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clearContents();
  }

  // Dapatkan seluruh nama kolom
  var headers = Object.keys(items[0]);
  var output = [headers];

  for (var i = 0; i < items.length; i++) {
    var row = [];
    for (var j = 0; j < headers.length; j++) {
      var val = items[i][headers[j]];
      row.push(val !== undefined && val !== null ? val : "");
    }
    output.push(row);
  }

  sheet.getRange(1, 1, output.length, headers.length).setValues(output);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#d1fae5");
}`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(appsScriptCode);
    setCopiedScript(true);
    showToast('Kode skrip Google Apps Script berhasil disalin ke clipboard!', 'success');
    setTimeout(() => setCopiedScript(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto my-4 text-xs sm:text-sm animate-in fade-in duration-200">
      {/* 1. Header & Hero Bar */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-3xl p-5 sm:p-7 shadow-xl border border-emerald-500/30 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none flex items-center justify-center">
          <i className="fa-solid fa-file-excel text-[180px]"></i>
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center space-x-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center justify-center text-2xl sm:text-3xl shrink-0 shadow-inner">
              <i className="fa-solid fa-file-excel"></i>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-xl font-black text-white tracking-wide">
                  Panduan &amp; Integrasi Google Spreadsheet
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 uppercase tracking-wider">
                  Live Sync
                </span>
              </div>
              <p className="text-xs sm:text-sm text-emerald-200/90 mt-1 max-w-2xl leading-relaxed">
                Hubungkan dan jadikan Google Spreadsheet sebagai sumber data atau arsip cadangan langsung bagi SIM Asrama Haji. Anda dapat membaca data atau mengirim perubahan secara instan melalui Google Apps Script Web App.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {sheetDocUrl && (
              <a
                href={sheetDocUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-emerald-200 border border-emerald-400/30 font-bold rounded-xl text-xs transition flex items-center space-x-1.5 shadow-sm"
              >
                <i className="fa-solid fa-arrow-up-right-from-square text-xs"></i>
                <span>Buka Spreadsheet</span>
              </a>
            )}
            <button
              type="button"
              onClick={handleCopyScript}
              className="px-4 py-2 bg-gold-500 hover:bg-gold-400 text-slate-950 font-extrabold rounded-xl text-xs transition flex items-center space-x-1.5 shadow-md cursor-pointer"
            >
              <i className={`fa-solid ${copiedScript ? 'fa-check' : 'fa-copy'}`}></i>
              <span>{copiedScript ? 'Tersalin!' : 'Salin Kode Skrip (Code.gs)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Status Koneksi & Tombol Aksi Cepat */}
      <div className={`p-4 sm:p-5 rounded-2xl border transition-all shadow-sm ${
        isConnected 
          ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/60 text-emerald-950 dark:text-emerald-100' 
          : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/60 text-amber-950 dark:text-amber-100'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${
              isConnected 
                ? 'bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200' 
                : 'bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200'
            }`}>
              <i className={`fa-solid ${isConnected ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}></i>
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-sm block">
                  Status: {isConnected ? 'Terhubung ke Google Spreadsheet' : 'Belum Dikonfigurasi'}
                </span>
                {lastSyncTime && (
                  <span className="text-[10px] bg-emerald-200/60 dark:bg-emerald-800/60 px-2 py-0.5 rounded-md font-mono text-emerald-800 dark:text-emerald-200">
                    Terakhir: {lastSyncTime}
                  </span>
                )}
              </div>
              <p className="text-xs opacity-90 truncate mt-0.5">{syncStatus}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto shrink-0">
            <button
              type="button"
              onClick={handleTestDataFetch}
              disabled={isLoading || isPushing || !scriptUrl.trim()}
              className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold rounded-xl shadow transition flex items-center space-x-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <span>Membaca Data...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-cloud-arrow-down"></i>
                  <span>Baca Database Spreadsheet</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowPushConfirm(true)}
              disabled={isLoading || isPushing || !scriptUrl.trim()}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 text-white font-bold rounded-xl shadow transition flex items-center space-x-2 cursor-pointer"
              title="Kirim seluruh data aplikasi ke Google Spreadsheet"
            >
              {isPushing ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <span>Mengirim Data...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-cloud-arrow-up"></i>
                  <span>Kirim Data ke Spreadsheet</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 3. Form Input URL Web App & Dokumen Spreadsheet */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
          <div className="flex items-center space-x-2">
            <i className="fa-solid fa-link text-emerald-600 text-sm"></i>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
              Pengaturan URL Endpoint Google Apps Script
            </h3>
          </div>
          {isConnected && (
            <button
              type="button"
              onClick={handleResetConfig}
              className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 font-bold flex items-center space-x-1 cursor-pointer"
            >
              <i className="fa-solid fa-trash-can"></i>
              <span>Reset Pengaturan</span>
            </button>
          )}
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-3.5">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs mb-1">
              URL Web App Google Apps Script (.exec) <span className="text-rose-500">*</span>
            </label>
            <input
              type="url"
              required
              value={scriptUrl}
              onChange={(e) => setScriptUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/AKfycbx.../exec"
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-600 focus:outline-none transition"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              URL ini Anda peroleh setelah klik <strong>Deploy &gt; New deployment &gt; Web app</strong> di Google Apps Script editor.
            </p>
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs mb-1">
              URL Dokumen Google Spreadsheet (Tautan Spreadsheet Langsung - Opsional)
            </label>
            <input
              type="url"
              value={sheetDocUrl}
              onChange={(e) => setSheetDocUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/.../edit"
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-600 focus:outline-none transition"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Tautan ke berkas Google Sheet Anda agar tombol <em>Buka Spreadsheet</em> dapat langsung membuka tab baru.
            </p>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-700">
            <button
              type="submit"
              className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow transition cursor-pointer flex items-center space-x-1.5"
            >
              <i className="fa-solid fa-floppy-disk"></i>
              <span>Simpan Konfigurasi URL</span>
            </button>
          </div>
        </form>
      </div>

      {/* 4. Hasil Pembacaan Data Spreadsheet (Preview & Terapkan) */}
      {fetchedData && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-emerald-200 dark:border-emerald-800 shadow-sm space-y-4 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center space-x-2">
                <i className="fa-solid fa-table text-emerald-600"></i>
                <span>Hasil Pembacaan Data dari Google Spreadsheet</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Data berikut berhasil ditarik dari sheet. Anda dapat meninjaunya atau langsung menerapkan ke aplikasi.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setShowApplyConfirm(true)}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow transition flex items-center space-x-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-download"></i>
                <span>Terapkan Data Ini ke Aplikasi</span>
              </button>
            </div>
          </div>

          {/* Tab Selector Hasil Baca */}
          <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setActivePreviewTab('BUILDINGS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shrink-0 ${
                activePreviewTab === 'BUILDINGS' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-building"></i>
              <span>Gedung ({fetchedData.buildings?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePreviewTab('ROOMS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shrink-0 ${
                activePreviewTab === 'ROOMS' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-door-open"></i>
              <span>Kamar ({fetchedData.rooms?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePreviewTab('TRANSACTIONS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shrink-0 ${
                activePreviewTab === 'TRANSACTIONS' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-receipt"></i>
              <span>Transaksi ({fetchedData.transactions?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePreviewTab('USERS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shrink-0 ${
                activePreviewTab === 'USERS' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-users"></i>
              <span>Petugas ({fetchedData.users?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePreviewTab('RAW')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shrink-0 ${
                activePreviewTab === 'RAW' 
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-code"></i>
              <span>JSON Raw</span>
            </button>
          </div>

          {/* Preview Content */}
          <div className="overflow-x-auto max-h-72 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 p-2 text-xs">
            {activePreviewTab === 'BUILDINGS' && (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                    <th className="p-2">ID</th>
                    <th className="p-2">Nama Gedung</th>
                    <th className="p-2">Kode</th>
                    <th className="p-2">Lantai</th>
                    <th className="p-2">Total Kamar</th>
                    <th className="p-2">Kategori</th>
                  </tr>
                </thead>
                <tbody>
                  {(fetchedData.buildings || []).map((b, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800">
                      <td className="p-2 font-mono text-slate-500">{b.id || `bld-${i+1}`}</td>
                      <td className="p-2 font-bold text-slate-800 dark:text-slate-200">{b.name}</td>
                      <td className="p-2 font-mono">{b.code}</td>
                      <td className="p-2">{b.floors}</td>
                      <td className="p-2">{b.total_rooms || b.totalRooms || 0}</td>
                      <td className="p-2">{b.category}</td>
                    </tr>
                  ))}
                  {(!fetchedData.buildings || fetchedData.buildings.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-400">Tidak ada baris data gedung di sheet 'buildings'.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activePreviewTab === 'ROOMS' && (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                    <th className="p-2">No. Kamar</th>
                    <th className="p-2">Gedung</th>
                    <th className="p-2">Lantai</th>
                    <th className="p-2">Tipe</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Tarif/Malam</th>
                  </tr>
                </thead>
                <tbody>
                  {(fetchedData.rooms || []).map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800">
                      <td className="p-2 font-bold text-slate-800 dark:text-slate-200">{r.room_number || r.roomNumber}</td>
                      <td className="p-2">{r.building}</td>
                      <td className="p-2">{r.floor}</td>
                      <td className="p-2">{r.type}</td>
                      <td className="p-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-700">
                          {r.status || 'KOSONG'}
                        </span>
                      </td>
                      <td className="p-2 font-mono">Rp {Number(r.price_per_night || r.pricePerNight || 0).toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                  {(!fetchedData.rooms || fetchedData.rooms.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-400">Tidak ada baris data kamar di sheet 'rooms'.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activePreviewTab === 'TRANSACTIONS' && (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                    <th className="p-2">Nama Tamu</th>
                    <th className="p-2">Kamar</th>
                    <th className="p-2">Kategori</th>
                    <th className="p-2">Tgl Mulai</th>
                    <th className="p-2">Durasi</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(fetchedData.transactions || []).map((t, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800">
                      <td className="p-2 font-bold text-slate-800 dark:text-slate-200">{t.guest_name || t.guestName}</td>
                      <td className="p-2">{t.room_number || t.roomNumber}</td>
                      <td className="p-2">{t.category}</td>
                      <td className="p-2 font-mono">{t.start_date || t.startDate}</td>
                      <td className="p-2">{t.duration} Hari</td>
                      <td className="p-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(!fetchedData.transactions || fetchedData.transactions.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-400">Tidak ada baris data transaksi di sheet 'transactions'.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activePreviewTab === 'USERS' && (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                    <th className="p-2">Username</th>
                    <th className="p-2">Nama Lengkap</th>
                    <th className="p-2">Role</th>
                    <th className="p-2">Departemen</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(fetchedData.users || []).map((u, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800">
                      <td className="p-2 font-mono text-emerald-600 font-bold">@{u.username}</td>
                      <td className="p-2 font-bold text-slate-800 dark:text-slate-200">{u.full_name || u.fullName}</td>
                      <td className="p-2">{u.role}</td>
                      <td className="p-2">{u.department}</td>
                      <td className="p-2">{u.status || 'Aktif'}</td>
                    </tr>
                  ))}
                  {(!fetchedData.users || fetchedData.users.length === 0) && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400">Tidak ada baris data petugas di sheet 'users'.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activePreviewTab === 'RAW' && (
              <pre className="p-3 font-mono text-[11px] text-slate-700 dark:text-slate-300 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(fetchedData.raw, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* 5. Panduan Langkah demi Langkah */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
          <div className="flex items-center space-x-2">
            <i className="fa-solid fa-circle-question text-emerald-600 text-sm"></i>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
              Panduan Lengkap Konfigurasi Google Spreadsheet &amp; Apps Script
            </h3>
          </div>

          <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveGuideTab('STEP1')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${activeGuideTab === 'STEP1' ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-2xs' : 'text-slate-600 dark:text-slate-400'}`}
            >
              1. Buat Sheet
            </button>
            <button
              type="button"
              onClick={() => setActiveGuideTab('STEP2')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${activeGuideTab === 'STEP2' ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-2xs' : 'text-slate-600 dark:text-slate-400'}`}
            >
              2. Apps Script
            </button>
            <button
              type="button"
              onClick={() => setActiveGuideTab('STEP3')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${activeGuideTab === 'STEP3' ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-2xs' : 'text-slate-600 dark:text-slate-400'}`}
            >
              3. Deploy Web App
            </button>
            <button
              type="button"
              onClick={() => setActiveGuideTab('SCRIPT')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${activeGuideTab === 'SCRIPT' ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-2xs' : 'text-slate-600 dark:text-slate-400'}`}
            >
              Kode Skrip
            </button>
          </div>
        </div>

        {activeGuideTab === 'STEP1' && (
          <div className="space-y-3 animate-in fade-in">
            <div className="flex items-start space-x-3 p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 font-bold flex items-center justify-center text-xs shrink-0">1</span>
              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-900 dark:text-slate-100">Buat File Google Spreadsheet Baru</h4>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-xs">
                  Buka <a href="https://sheets.new" target="_blank" rel="noreferrer" className="text-emerald-600 dark:text-emerald-400 font-bold underline">sheets.new</a> di browser Anda. Berikan nama dokumen, misalnya: <strong>Database SIM Asrama Haji Jakarta</strong>.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2">
                  <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="font-mono text-emerald-600 font-bold text-xs block">Tab: buildings</span>
                    <span className="text-[11px] text-slate-500">Header: id, name, code, floors, total_rooms, category, status</span>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="font-mono text-emerald-600 font-bold text-xs block">Tab: rooms</span>
                    <span className="text-[11px] text-slate-500">Header: id, room_number, building, floor, type, status, price_per_night</span>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="font-mono text-emerald-600 font-bold text-xs block">Tab: transactions</span>
                    <span className="text-[11px] text-slate-500">Header: id, guest_name, room_number, building, start_date, duration, status</span>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="font-mono text-emerald-600 font-bold text-xs block">Tab: users</span>
                    <span className="text-[11px] text-slate-500">Header: id, username, full_name, role, department, status, phone</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeGuideTab === 'STEP2' && (
          <div className="space-y-3 animate-in fade-in">
            <div className="flex items-start space-x-3 p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 font-bold flex items-center justify-center text-xs shrink-0">2</span>
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 dark:text-slate-100">Buka Menu Extensions &gt; Apps Script</h4>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-xs">
                  Di Google Spreadsheet Anda, klik menu <strong>Extensions (Ekstensi) &gt; Apps Script</strong>.
                </p>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-xs">
                  Hapus fungsi bawaan <code className="text-emerald-600 font-mono">myFunction()</code>, kemudian tempelkan (paste) seluruh kode dari tab <strong>Kode Skrip</strong> di atas ke dalam file <strong>Code.gs</strong>. Tekan tombol <strong>Save (Ctrl+S / Cmd+S)</strong>.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeGuideTab === 'STEP3' && (
          <div className="space-y-3 animate-in fade-in">
            <div className="flex items-start space-x-3 p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 font-bold flex items-center justify-center text-xs shrink-0">3</span>
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 dark:text-slate-100">Deploy sebagai Web App (Akses Anyone)</h4>
                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <p>1. Di editor Apps Script, klik tombol biru <strong>Deploy &gt; New deployment</strong> di kanan atas.</p>
                  <p>2. Pilih jenis deployment: ikon gerigi &gt; <strong>Web app</strong>.</p>
                  <p>3. <strong>Execute as:</strong> Pilih <em>Me (email Anda)</em>.</p>
                  <p>4. <strong>Who has access:</strong> Pilih <strong className="text-emerald-700 dark:text-emerald-400">Anyone (Siapa saja)</strong> agar aplikasi dapat membaca dan menulis data tanpa memblokir CORS.</p>
                  <p>5. Klik <strong>Deploy</strong>, izinkan akses akun (Authorize access), lalu salin <strong>Web App URL</strong> yang dihasilkan (berakhiran <code className="text-emerald-600 font-mono">/exec</code>) dan masukkan ke kolom di atas.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeGuideTab === 'SCRIPT' && (
          <div className="space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">File: Code.gs</span>
              <button
                type="button"
                onClick={handleCopyScript}
                className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
              >
                <i className={`fa-solid ${copiedScript ? 'fa-check' : 'fa-copy'}`}></i>
                <span>{copiedScript ? 'Tersalin!' : 'Salin Kode'}</span>
              </button>
            </div>
            <pre className="p-3.5 bg-slate-950 text-emerald-300 rounded-xl font-mono text-[11px] overflow-x-auto max-h-96 leading-relaxed border border-slate-800 custom-scrollbar">
              {appsScriptCode}
            </pre>
          </div>
        )}
      </div>

      {/* 6. Riwayat Log Sinkronisasi */}
      {syncLogs.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2.5">
            <div className="flex items-center space-x-2">
              <i className="fa-solid fa-clock-rotate-left text-slate-500"></i>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                Log Riwayat Sinkronisasi Spreadsheet Sesi Ini
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setSyncLogs([])}
              className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              Bersihkan Log
            </button>
          </div>

          <div className="space-y-1.5 font-mono text-[11px]">
            {syncLogs.map((log, idx) => (
              <div 
                key={idx}
                className={`p-2 rounded-lg flex items-center justify-between gap-2 border ${
                  log.success 
                    ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200' 
                    : 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40 text-rose-900 dark:text-rose-200'
                }`}
              >
                <div className="flex items-center space-x-2 truncate">
                  <span className="font-bold text-[10px] px-1.5 py-0.2 rounded bg-white dark:bg-slate-800 border">
                    {log.type}
                  </span>
                  <span className="truncate">{log.message}</span>
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">{log.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation Modals */}
      <ActionConfirmModal
        isOpen={showApplyConfirm}
        title="Terapkan Data dari Google Spreadsheet"
        subtitle="Konfirmasi Sinkronisasi Masuk"
        message="Apakah Anda yakin ingin menerapkan seluruh data yang terbaca dari Google Spreadsheet ke dalam aplikasi dan database pusat? Data lokal & cloud akan diselaraskan."
        confirmText="Ya, Terapkan ke Aplikasi"
        variant="primary"
        icon="fa-download"
        onClose={() => setShowApplyConfirm(false)}
        onConfirm={handleApplyDataToApp}
      />

      <ActionConfirmModal
        isOpen={showPushConfirm}
        title="Kirim Data ke Google Spreadsheet"
        subtitle="Konfirmasi Sinkronisasi Keluar"
        message="Apakah Anda yakin ingin mengekspor seluruh data aktif (Gedung, Kamar, Transaksi, Petugas) ke Google Spreadsheet? Baris data pada sheet terkait akan diperbarui."
        confirmText="Ya, Kirim ke Spreadsheet"
        variant="primary"
        icon="fa-cloud-arrow-up"
        onClose={() => setShowPushConfirm(false)}
        onConfirm={handlePushDataToSpreadsheet}
      />
    </div>
  );
}
