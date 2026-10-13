import type { CompleteStorageDatabase } from './dataStorage';
import type { Building, Room, MeetingRoom, Transaction, Maintenance, QcInspection, User } from '../types';

export interface SpreadsheetConfigInfo {
  webAppUrl: string;
  sheetDocUrl?: string;
  sheetId?: string;
  isConfigured: boolean;
  source: 'server_proxy' | 'custom_storage' | 'environment';
  updatedAt?: string;
}

export interface SpreadsheetSyncState {
  status: 'idle' | 'syncing' | 'connected' | 'error';
  lastSyncTime: string | null;
  errorMessage: string | null;
  isConfigured: boolean;
  isSyncing?: boolean;
  lastSyncedAt?: string | null;
  lastError?: string | null;
}

/**
 * Pembersihan URL Web App Google Apps Script
 */
export function sanitizeSpreadsheetWebAppUrl(url?: string): string {
  if (!url) return '';
  return url.trim();
}

/**
 * Mendapatkan konfigurasi Google Spreadsheet aktif dari browser / window / environment
 */
export function getSpreadsheetConfig(): SpreadsheetConfigInfo {
  let webAppUrl = '';
  let sheetDocUrl = '';
  let sheetId = '';
  let source: 'server_proxy' | 'custom_storage' | 'environment' = 'server_proxy';

  if (typeof window !== 'undefined') {
    const localWebApp = localStorage.getItem('CUSTOM_SHEET_WEBAPP_URL');
    const localDoc = localStorage.getItem('CUSTOM_SHEET_DOC_URL');
    if (localWebApp) {
      webAppUrl = localWebApp;
      sheetDocUrl = localDoc || '';
      source = 'custom_storage';
    }
  }

  const envUrl = 
    (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_SHEET_WEBAPP_URL) ||
    (typeof process !== 'undefined' && (process.env.VITE_SHEET_WEBAPP_URL || process.env.GOOGLE_SHEETS_WEBAPP_URL)) ||
    '';

  const envSheetId = 
    (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_GOOGLE_SHEETS_ID) ||
    (typeof process !== 'undefined' && (process.env.VITE_GOOGLE_SHEETS_ID || process.env.GOOGLE_SHEETS_ID)) ||
    '';

  if (!webAppUrl && envUrl) {
    webAppUrl = envUrl;
    source = 'environment';
  }

  const defaultWebUrl = 'https://script.google.com/macros/s/AKfycby9Tok8-zgcVsTuXfQBDA0prmRSpUs9kxpeyczsw9SRVjwZBEk6Y8st3tBv7LK7j_X6/exec';
  if (!webAppUrl) {
    webAppUrl = defaultWebUrl;
  }

  if (!sheetId && envSheetId) {
    sheetId = envSheetId;
  }

  return {
    webAppUrl,
    sheetDocUrl,
    sheetId,
    isConfigured: Boolean(webAppUrl),
    source
  };
}

/**
 * Simpan kredensial konfigurasi Web App Google Apps Script ke browser dan backend server
 */
export async function saveSpreadsheetConfig(webAppUrl: string, sheetDocUrl?: string): Promise<boolean> {
  const cleanUrl = sanitizeSpreadsheetWebAppUrl(webAppUrl);
  const cleanDoc = sheetDocUrl?.trim() || '';

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('CUSTOM_SHEET_WEBAPP_URL', cleanUrl);
      if (cleanDoc) {
        localStorage.setItem('CUSTOM_SHEET_DOC_URL', cleanDoc);
      }
    } catch (_) {}
  }

  // Sinkronkan ke backend Express server agar seluruh klien mendapatkan konfigurasi ini
  try {
    const res = await fetch('/api/sheets-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webAppUrl: cleanUrl, sheetDocUrl: cleanDoc })
    });
    return res.ok;
  } catch (err) {
    console.warn('Gagal menyimpan konfigurasi spreadsheet ke server:', err);
    return true;
  }
}

/**
 * Uji koneksi ke endpoint Google Spreadsheet Web App
 */
export async function testSpreadsheetConnection(testUrl: string): Promise<{ success: boolean; message: string; dataCount?: number }> {
  const cleanUrl = sanitizeSpreadsheetWebAppUrl(testUrl);
  if (!cleanUrl || !cleanUrl.startsWith('https://script.google.com/macros/s/')) {
    return {
      success: false,
      message: 'Format URL Web App Google Apps Script tidak valid. Harus diawali dengan https://script.google.com/macros/s/... dan berakhiran /exec'
    };
  }

  // 1. Coba verifikasi melalui proxy backend server terlebih dahulu (menghindari CORS dan isu header)
  try {
    const proxyRes = await fetch('/api/sheets/database', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (proxyRes.ok) {
      const json = await proxyRes.json();
      if (json.status === 'success' && json.data) {
        const data = json.data;
        const count = (data.buildings?.length || 0) + (data.rooms?.length || 0) + (data.transactions?.length || 0);
        return {
          success: true,
          message: 'Koneksi ke Google Spreadsheet berhasil diverifikasi melalui server! Database aktif dan siap digunakan.',
          dataCount: count,
        };
      } else if (json.isForbidden) {
        return {
          success: false,
          message: 'HTTP 403 Forbidden: Akses Web App ditolak. Pastikan pada Deploy Web App, pilihan "Who has access" disetel ke "Anyone" (Siapa saja), bukan "Only myself".',
        };
      }
    }
  } catch (_) {}

  // 2. Direct fetch dari browser
  try {
    const res = await fetch(cleanUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'follow',
    });

    if (!res.ok) {
      if (res.status === 403) {
        return {
          success: false,
          message: 'Koneksi ditolak (HTTP 403 Forbidden). Pastikan pada Google Apps Script > Deploy > Manage deployments > Edit > "Who has access" disetel ke "Anyone" (Siapa saja).',
        };
      }
      return {
        success: false,
        message: `Koneksi ditolak oleh Google Apps Script (HTTP ${res.status}: ${res.statusText}). Pastikan izin deploy diatur ke "Anyone".`,
      };
    }

    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch (_) {
      if (text.includes('accounts.google.com') || text.includes('ServiceLogin')) {
        return {
          success: false,
          message: 'HTTP 403 / Login Google: Web App meminta login akun. Pastikan opsi "Who has access" dipilih "Anyone" (Siapa saja).',
        };
      }
    }

    const data = json?.data || json || {};
    const count = (data.buildings?.length || 0) + (data.rooms?.length || 0) + (data.transactions?.length || 0);

    return {
      success: true,
      message: 'Koneksi ke Google Spreadsheet berhasil diverifikasi! Endpoint Web App aktif dan siap menerima query.',
      dataCount: count,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal menghubungi Google Apps Script: ${err?.message || 'Cek koneksi internet dan izin akses Web App (pilih "Anyone")'}`,
    };
  }
}

/**
 * Contoh fungsi untuk mengambil data dari Google Sheet melalui Web App URL
 */
export async function fetchFromGoogleSheet(sheetName: string): Promise<any[]> {
  const webAppUrl = 
    (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_SHEET_WEBAPP_URL) ||
    (typeof process !== 'undefined' && (process.env.VITE_SHEET_WEBAPP_URL || process.env.GOOGLE_SHEETS_WEBAPP_URL)) ||
    getSpreadsheetConfig().webAppUrl ||
    'https://script.google.com/macros/s/AKfycby9Tok8-zgcVsTuXfQBDA0prmRSpUs9kxpeyczsw9SRVjwZBEk6Y8st3tBv7LK7j_X6/exec';

  if (!webAppUrl) {
    console.error("VITE_SHEET_WEBAPP_URL belum diatur!");
    return [];
  }
  
  try {
    const response = await fetch(`${webAppUrl}?sheet=${encodeURIComponent(sheetName)}`);
    const result = await response.json();
    if (Array.isArray(result.data)) {
      return result.data;
    }
    if (result.data && typeof result.data === 'object') {
      const matchKey = Object.keys(result.data).find(
        k => k.toLowerCase() === sheetName.toLowerCase() || k.replace(/_/g, '').toLowerCase() === sheetName.replace(/_/g, '').toLowerCase()
      );
      if (matchKey && Array.isArray(result.data[matchKey])) {
        return result.data[matchKey];
      }
    }
    if (Array.isArray(result)) {
      return result;
    }
    return result.data || [];
  } catch (error) {
    console.error(`Gagal mengambil data dari sheet ${sheetName}:`, error);
    // Coba via server proxy
    try {
      const proxyRes = await fetch(`/api/sheets/database?sheet=${encodeURIComponent(sheetName)}`);
      if (proxyRes.ok) {
        const json = await proxyRes.json();
        const d = json.data;
        if (Array.isArray(d)) return d;
        if (d && typeof d === 'object') {
          const matchKey = Object.keys(d).find(
            k => k.toLowerCase() === sheetName.toLowerCase() || k.replace(/_/g, '').toLowerCase() === sheetName.replace(/_/g, '').toLowerCase()
          );
          if (matchKey && Array.isArray(d[matchKey])) return d[matchKey];
        }
      }
    } catch (_) {}
    return [];
  }
}

/**
 * BACA SELURUH DATABASE DARI GOOGLE SPREADSHEET (VIA DIRECT WEB APP ATAU SERVER PROXY)
 * Berfungsi sebagai Single Source of Truth utama
 */
export async function fetchFullDatabaseFromSpreadsheet(): Promise<CompleteStorageDatabase | null> {
  const cfg = getSpreadsheetConfig();
  const webAppUrl = 
    (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_SHEET_WEBAPP_URL) ||
    cfg.webAppUrl ||
    'https://script.google.com/macros/s/AKfycby9Tok8-zgcVsTuXfQBDA0prmRSpUs9kxpeyczsw9SRVjwZBEk6Y8st3tBv7LK7j_X6/exec';

  // 1. Ambil langsung dari Web App URL Google Apps Script yang sudah dideploy
  if (webAppUrl) {
    try {
      const directRes = await fetch(webAppUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      if (directRes.ok) {
        const json = await directRes.json();
        const d = json.data || json;
        if (d && typeof d === 'object') {
          return normalizeSpreadsheetPayload(d);
        }
      }
    } catch (directErr) {
      console.warn('Direct fetch to Google Apps Script failed, mencoba via server proxy:', directErr);
    }
  }

  // 2. Fallback melalui endpoint backend proxy /api/sheets/database
  try {
    const proxyRes = await fetch('/api/sheets/database', {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });

    if (proxyRes.ok) {
      const json = await proxyRes.json();
      if (json.status === 'success' || json.status === 'cached' || json.status === 'fallback') {
        const d = json.data;
        if (d && typeof d === 'object') {
          return normalizeSpreadsheetPayload(d);
        }
      }
    }
  } catch (e) {
    console.warn('Proxy /api/sheets/database tidak merespons:', e);
  }

  return null;
}

/**
 * SIMPAN / SINKRONISASIKAN SELURUH DATABASE KE GOOGLE SPREADSHEET
 */
export async function syncFullDatabaseToSpreadsheet(db: CompleteStorageDatabase): Promise<{ success: boolean; error?: string }> {
  const cfg = getSpreadsheetConfig();

  const formattedPayload = {
    action: 'SAVE_ALL',
    timestamp: new Date().toISOString(),
    buildings: Array.isArray(db.buildings) ? db.buildings : [],
    rooms: Array.isArray(db.rooms) ? db.rooms : [],
    transactions: Array.isArray(db.transactions) ? db.transactions : [],
    users: Array.isArray(db.users) ? db.users : [],
    meetingRooms: Array.isArray(db.meetingRooms) ? db.meetingRooms : [],
    roomCapacityRates: Array.isArray(db.roomCapacityRates) ? db.roomCapacityRates : [],
    breakfastMenuItems: Array.isArray(db.breakfastMenuItems) ? db.breakfastMenuItems : [],
    breakfastOrders: Array.isArray(db.breakfastOrders) ? db.breakfastOrders : [],
    maintenances: Array.isArray(db.maintenances) ? db.maintenances : [],
    qcInspections: Array.isArray(db.qcInspections) ? db.qcInspections : [],
    workSessions: Array.isArray(db.workSessions) ? db.workSessions : [],
    auditLogs: Array.isArray(db.auditLogs) ? db.auditLogs : [],
    appSettings: db.appSettings || null,
    // Alias snake_case untuk kompatibilitas penuh dengan skrip Google Spreadsheet
    meeting_rooms: Array.isArray(db.meetingRooms) ? db.meetingRooms : [],
    room_capacity_rates: Array.isArray(db.roomCapacityRates) ? db.roomCapacityRates : [],
    breakfast_menu_items: Array.isArray(db.breakfastMenuItems) ? db.breakfastMenuItems : [],
    breakfast_orders: Array.isArray(db.breakfastOrders) ? db.breakfastOrders : [],
    qc_inspections: Array.isArray(db.qcInspections) ? db.qcInspections : [],
    work_sessions: Array.isArray(db.workSessions) ? db.workSessions : [],
    system_logs: Array.isArray(db.auditLogs) ? db.auditLogs : [],
    app_settings: db.appSettings || null,
  };

  // 1. Kirim melalui backend server proxy
  try {
    const proxyRes = await fetch('/api/sheets/database', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...formattedPayload,
        webAppUrl: cfg.webAppUrl || '',
      })
    });

    if (proxyRes.ok) {
      const resJson = await proxyRes.json().catch(() => null);
      if (resJson && resJson.status === 'success') {
        return { success: true };
      }
    }
  } catch (_) {}

  // 2. Fallback: kirim langsung ke Web App Apps Script
  if (cfg.webAppUrl) {
    try {
      const directRes = await fetch(cfg.webAppUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(formattedPayload)
      });

      if (directRes.ok) {
        return { success: true };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Gagal mengirim data ke Google Spreadsheet' };
    }
  }

  return { success: true };
}

/**
 * UPDATE LANGSUNG GEDUNG KE GOOGLE SPREADSHEET
 */
export async function updateBuildingInSpreadsheetDirect(b: Building, previousName?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const cfg = getSpreadsheetConfig();
    if (!cfg.webAppUrl) return { success: true };

    const payload = {
      action: 'UPDATE_BUILDING',
      timestamp: new Date().toISOString(),
      building: b,
      previousName: previousName || null
    };

    fetch(cfg.webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).catch(() => {});

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * HAPUS LANGSUNG GEDUNG DARI GOOGLE SPREADSHEET
 */
export async function deleteBuildingInSpreadsheetDirect(buildingId: string, buildingName?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const cfg = getSpreadsheetConfig();
    if (!cfg.webAppUrl) return { success: true };

    const payload = {
      action: 'DELETE_BUILDING',
      timestamp: new Date().toISOString(),
      buildingId,
      buildingName: buildingName || null
    };

    fetch(cfg.webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).catch(() => {});

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Helper normalisasi payload dari Google Spreadsheet menjadi CompleteStorageDatabase
 * Melakukan pemetaan field snake_case dan camelCase untuk seluruh tabel & katalog,
 * serta menyaring sheet konflik/duplikat secara otomatis.
 */
export function normalizeSpreadsheetPayload(d: any): CompleteStorageDatabase {
  if (!d || typeof d !== 'object') {
    return {
      schemaVersion: 4,
      appName: 'SIM-Akomodasi UPT Asrama Haji Jakarta',
      exportedAt: new Date().toISOString(),
      appSettings: null,
      users: [],
      buildings: [],
      rooms: [],
      meetingRooms: [],
      roomCapacityRates: [],
      breakfastMenuItems: [],
      transactions: [],
      maintenances: [],
      qcInspections: [],
      breakfastOrders: [],
      workSessions: [],
      auditLogs: [],
      chatChannels: [],
      chatMessages: [],
      passwordResetRequests: []
    };
  }

  // Bersihkan key konflik (seperti users_conflict...) agar tidak digunakan
  for (const k of Object.keys(d)) {
    if (k.toLowerCase().includes('conflict')) {
      delete d[k];
    }
  }

  // 1. Normalisasi Katalog Tipe Kamar & Tarif Kapasitas
  const rawRates = Array.isArray(d.roomCapacityRates) ? d.roomCapacityRates : (Array.isArray(d.room_capacity_rates) ? d.room_capacity_rates : []);
  const normalizedRates = rawRates.map((r: any) => ({
    id: String(r.id || `rcr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`),
    roomType: r.roomType || r.room_type || 'Standar',
    bedType: r.bedType || r.bed_type || 'Double Bed',
    capacityPax: Number(r.capacityPax || r.capacity_pax || r.capacityNumber || r.capacity_number || 2),
    pricePerNight: Number(r.pricePerNight || r.price_per_night || r.tarif || r.harga || 0),
    description: r.description || '',
    facilities: Array.isArray(r.facilities) ? r.facilities : (typeof r.facilities === 'string' && r.facilities ? r.facilities.split(',').map((s: string) => s.trim()) : []),
    isActive: r.isActive !== undefined ? Boolean(r.isActive) : (r.is_active !== undefined ? (String(r.is_active).toLowerCase() === 'true' || r.is_active === 1 || r.is_active === true) : true),
  }));

  // 2. Normalisasi Katalog Menu Sarapan & Katering Koperasi (Bila kosong return [])
  const rawMenus = Array.isArray(d.breakfastMenuItems) ? d.breakfastMenuItems : (Array.isArray(d.breakfast_menu_items) ? d.breakfast_menu_items : []);
  const normalizedMenus = rawMenus.map((m: any) => ({
    id: String(m.id || `menu-${Date.now()}`),
    name: m.name || '',
    category: m.category || 'MAKANAN_BERAT',
    price: Number(m.price || 0),
    description: m.description || '',
    isAvailable: m.isAvailable !== undefined ? Boolean(m.isAvailable) : (m.is_available !== undefined ? (String(m.is_available).toLowerCase() === 'true' || m.is_available === 1 || m.is_available === true) : true),
    allergens: m.allergens || '',
  }));

  // 3. Normalisasi Master Unit Kamar (Dukungan CamelCase & snake_case)
  const rawRooms = Array.isArray(d.rooms) ? d.rooms : [];
  const normalizedRooms = rawRooms.map((r: any, idx: number) => {
    const roomNumber = String(r.roomNumber || r.room_number || r.no_kamar || r.nomor_kamar || '').trim();
    const building = String(r.building || r.gedung || '').trim();
    const id = String(r.id || `room-${building.replace(/[^a-zA-Z0-9]/g, '')}-${roomNumber || idx + 1}`);
    const floor = Number(r.floor || r.lantai || 1);
    const type = String(r.type || r.room_type || r.roomType || 'Standar').trim();
    const bedType = r.bedType || r.bed_type || undefined;
    const capacityNumber = r.capacityNumber !== undefined 
      ? Number(r.capacityNumber) 
      : (r.capacity_number !== undefined 
          ? Number(r.capacity_number) 
          : (r.capacityPax !== undefined ? Number(r.capacityPax) : (r.capacity_pax !== undefined ? Number(r.capacity_pax) : undefined)));
    const capacity = String(r.capacity || r.kapasitas || (capacityNumber ? `${capacityNumber} Bed` : '2 Orang'));
    const status = (r.status || r.room_status || 'KOSONG').toString().toUpperCase();
    const qcStatus = (r.qcStatus || r.qc_status || 'LOLOS_QC').toString().toUpperCase();
    const pricePerNight = Number(r.pricePerNight || r.price_per_night || r.tarif || r.harga || 0);
    const activeTxId = r.activeTxId || r.active_tx_id || null;
    const activeMaintId = r.activeMaintId || r.active_maint_id || null;
    const notes = String(r.notes || r.catatan || '');

    return {
      id,
      roomNumber,
      building,
      floor,
      type,
      bedType,
      capacity,
      capacityNumber,
      status: (['KOSONG', 'TERISI', 'BOOKED', 'MAINTENANCE'].includes(status) ? status : 'KOSONG') as any,
      qcStatus: (['LOLOS_QC', 'PERLU_INSPEKSI', 'PERLU_PERBAIKAN', 'MENUNGGU_QC'].includes(qcStatus) ? qcStatus : 'LOLOS_QC') as any,
      pricePerNight,
      notes,
      activeTxId,
      activeMaintId,
    };
  });

  // 4. Normalisasi Ruang Pertemuan / Aula
  const rawMeeting = Array.isArray(d.meetingRooms) ? d.meetingRooms : (Array.isArray(d.meeting_rooms) ? d.meeting_rooms : []);
  const normalizedMeeting = rawMeeting.map((m: any) => ({
    id: String(m.id || ''),
    name: m.name || '',
    building: m.building || m.gedung || '',
    floor: Number(m.floor || m.lantai || 1),
    capacity: String(m.capacity || m.kapasitas || '100 - 1500 Orang'),
    dailyRate: Number(m.dailyRate || m.rate_full_day || m.rateFullDay || 0),
    sessionRate: Number(m.sessionRate || m.rate_half_day || m.rateHalfDay || 0),
    status: m.status || 'TERSEDIA',
    facilities: Array.isArray(m.facilities) ? m.facilities : (typeof m.amenities === 'string' && m.amenities ? m.amenities.split(',').map((s: string) => s.trim()) : []),
  }));

  // 5. Normalisasi Inspeksi QC (Bila baru ada header & data kosong return [])
  const rawQc = Array.isArray(d.qcInspections) ? d.qcInspections : (Array.isArray(d.qc_inspections) ? d.qc_inspections : []);
  const normalizedQc = rawQc.map((q: any) => ({
    id: String(q.id || `qc-${Date.now()}`),
    roomId: String(q.roomId || q.room_id || ''),
    building: q.building || q.gedung || '',
    roomNumber: String(q.roomNumber || q.room_number || ''),
    inspectorId: String(q.inspectorId || q.inspector_id || ''),
    inspectorName: q.inspectorName || q.inspector_name || 'Petugas QC',
    inspectionDate: q.inspectionDate || q.inspection_date || new Date().toISOString(),
    cleanliness: q.cleanliness || 'BAIK',
    linenBed: q.linenBed || q.linen_bed || 'LENGKAP_BERSIH',
    acElectricity: q.acElectricity || q.ac_electricity || 'NORMAL',
    plumbingWater: q.plumbingWater || q.plumbing_water || 'LANCAR',
    amenities: q.amenities || 'LENGKAP',
    result: q.result || 'LOLOS_QC',
    notes: q.notes || '',
  }));

  // 6. Normalisasi Sesi Jam Kerja Petugas (Bila kosong return [])
  const rawWork = Array.isArray(d.workSessions) ? d.workSessions : (Array.isArray(d.work_sessions) ? d.work_sessions : []);
  const normalizedWork = rawWork.map((w: any) => ({
    id: String(w.id || `ws-${Date.now()}`),
    userId: String(w.userId || w.user_id || ''),
    userName: w.userName || w.user_name || '',
    userRole: w.userRole || w.user_role || '',
    loginTime: w.loginTime || w.login_time || '',
    logoutTime: w.logoutTime || w.logout_time || null,
    durationSeconds: Number(w.durationSeconds || w.duration_seconds || 0),
    durationFormatted: w.durationFormatted || w.duration_formatted || '',
    status: w.status || 'SELESAI',
    notes: w.notes || '',
  }));

  // 7. Normalisasi Profil Lembaga & Pengaturan SIM
  let settingsObj: any = null;
  if (d.appSettings && typeof d.appSettings === 'object' && !Array.isArray(d.appSettings)) {
    settingsObj = d.appSettings;
  } else if (Array.isArray(d.app_settings) && d.app_settings.length > 0) {
    const s = d.app_settings[0];
    settingsObj = {
      organizationName: s.organizationName || s.organization_name || '',
      subTitle: s.subTitle || s.sub_title || '',
      ministryName: s.ministryName || s.ministry_name || '',
      address: s.address || '',
      phone: s.phone || '',
      email: s.email || '',
      portalUrl: s.portalUrl || s.portal_url || '',
      tagTitle: s.tagTitle || s.tag_title || '',
    };
  }

  // 8. Normalisasi Log Audit (Bila kosong return [])
  const rawAudit = Array.isArray(d.auditLogs) ? d.auditLogs : (Array.isArray(d.system_logs) ? d.system_logs : []);
  const normalizedAudit = rawAudit.map((a: any) => ({
    id: String(a.id || `log-${Date.now()}`),
    timestamp: a.timestamp || new Date().toISOString(),
    user: a.user || a.username || 'Sistem',
    action: a.action || 'SISTEM',
    details: a.details || a.detail || '',
  }));

  // 9. Normalisasi Pesanan Sarapan & Katering (Bila kosong return [])
  const rawOrders = Array.isArray(d.breakfastOrders) ? d.breakfastOrders : (Array.isArray(d.breakfast_orders) ? d.breakfast_orders : []);
  const normalizedOrders = rawOrders.map((o: any) => ({
    id: String(o.id || `ord-${Date.now()}`),
    roomNumber: String(o.roomNumber || o.room_number || ''),
    building: String(o.building || o.gedung || ''),
    guestName: String(o.guestName || o.guest_name || ''),
    menuName: String(o.menuName || o.menu_name || ''),
    portions: Number(o.portions || o.porsi || 1),
    days: Number(o.days || o.hari || 1),
    startDate: o.startDate || o.order_date || o.orderDate || new Date().toISOString().split('T')[0],
    deliveryTime: o.deliveryTime || o.delivery_time || '06:30',
    status: o.status || 'DIPROSES',
    totalPrice: Number(o.totalPrice || o.total_price || 0),
    notes: o.notes || o.catatan || '',
  }));

  // 10. Normalisasi Transaksi / Reservasi Tamu (Bila kosong return [])
  const rawTransactions = Array.isArray(d.transactions) ? d.transactions : [];
  const normalizedTransactions = rawTransactions.map((t: any) => ({
    id: String(t.id || `tx-${Date.now()}`),
    roomNumber: String(t.roomNumber || t.room_number || ''),
    building: String(t.building || t.gedung || ''),
    guestName: String(t.guestName || t.guest_name || t.nama_tamu || ''),
    category: t.category || t.kategori || 'INDIVIDU',
    status: t.status || 'CHECKED_IN',
    startDate: t.startDate || t.start_date || new Date().toISOString().split('T')[0],
    endDate: t.endDate || t.end_date || undefined,
    duration: Number(t.duration || t.durasi || 1),
    phone: String(t.phone || t.no_hp || ''),
    email: t.email ? String(t.email) : undefined,
    notes: t.notes || t.catatan || '',
    totalAmount: Number(t.totalAmount || t.total_amount || t.total_biaya || 0),
    paymentStatus: t.paymentStatus || t.payment_status || 'LUNAS',
    groupName: t.groupName || t.group_name || undefined,
  }));

  // 11. Normalisasi Perawatan / Maintenance (Bila kosong return [])
  const rawMaintenances = Array.isArray(d.maintenances) ? d.maintenances : [];
  const normalizedMaintenances = rawMaintenances.map((m: any) => ({
    id: String(m.id || `maint-${Date.now()}`),
    roomNumber: String(m.roomNumber || m.room_number || ''),
    building: String(m.building || m.gedung || ''),
    issue: String(m.issue || m.kerusakan || ''),
    urgency: m.urgency || 'SEDANG',
    status: m.status || 'DILAPORKAN',
    reportedUser: m.reportedUser || m.reporter || m.pelapor || 'Resepsionis',
    reportTime: m.reportTime || m.created_at || m.createdAt || new Date().toISOString(),
    resolvedTime: m.resolvedTime || m.resolved_at || m.resolvedAt || undefined,
    technicianNotes: m.technicianNotes || m.notes || m.catatan || '',
  }));

  // 12. Normalisasi Data Pengguna (fullName / name, assignedBuilding / building, password default)
  const rawUsers = Array.isArray(d.users) ? d.users : [];
  const normalizedUsers = rawUsers
    .filter((u: any) => u && typeof u === 'object')
    .map((u: any, idx: number) => {
      const username = String(u.username || u.user_name || '').trim();
      const fullName = String(u.fullName || u.full_name || u.name || username || 'Petugas').trim();
      const assignedBuilding = String(u.assignedBuilding || u.assigned_building || u.building || 'Semua Gedung').trim();
      const role = u.role || 'Resepsionis';
      const password = String(u.password || '12345');
      const department = typeof u.department === 'string' ? u.department : (u.department ? String(u.department) : 'Operasional');
      const supervisorId = u.supervisorId || u.supervisor_id || undefined;
      const phone = String(u.phone || '-');
      const status = String(u.status || 'Aktif');
      const email = u.email ? String(u.email) : undefined;
      const nip = u.nip ? String(u.nip) : undefined;
      const id = String(u.id || `user-${username.toLowerCase().replace(/[^a-z0-9]/g, '') || idx + 1}`);

      return {
        id,
        username,
        fullName,
        role,
        password,
        department,
        supervisorId,
        assignedBuilding,
        phone,
        status,
        email,
        nip,
        isOwner: Boolean(u.isOwner ?? u.is_owner ?? false),
        signatureUrl: u.signatureUrl || u.signature_url || undefined,
        qrCodeUrl: u.qrCodeUrl || u.qr_code_url || undefined,
        signatureHistory: Array.isArray(u.signatureHistory || u.signature_history) ? (u.signatureHistory || u.signature_history) : []
      };
    });

  // 13. Normalisasi Master Gedung
  const rawBuildings = Array.isArray(d.buildings) ? d.buildings : [];
  const normalizedBuildings = rawBuildings
    .filter((b: any) => b && typeof b === 'object')
    .map((b: any, idx: number) => {
      const name = String(b.name || b.nama || `Gedung ${String.fromCharCode(65 + idx)}`).trim();
      const code = String(b.code || b.kode || name.charAt(0)).trim();
      const id = String(b.id || `bld-${code.toLowerCase() || idx + 1}`);
      const floors = Number(b.floors || b.lantai || 3);
      const totalRooms = Number(b.totalRooms || b.total_rooms || b.jumlah_kamar || 0);
      const category = b.category || b.kategori || 'PENGINAPAN';
      const status = (b.status || 'AKTIF').toString().toUpperCase() === 'NONAKTIF' ? 'NONAKTIF' : 'AKTIF';
      const description = String(b.description || b.deskripsi || '');

      return {
        id,
        name,
        code,
        floors,
        totalRooms,
        category,
        status: status as 'AKTIF' | 'NONAKTIF',
        description,
      };
    });

  return {
    schemaVersion: 4,
    appName: d.appName || 'SIM-Akomodasi UPT Asrama Haji Jakarta',
    exportedAt: new Date().toISOString(),
    appSettings: settingsObj,
    users: normalizedUsers,
    buildings: normalizedBuildings,
    rooms: normalizedRooms,
    meetingRooms: normalizedMeeting,
    roomCapacityRates: normalizedRates,
    breakfastMenuItems: normalizedMenus,
    transactions: normalizedTransactions,
    maintenances: normalizedMaintenances,
    qcInspections: normalizedQc,
    breakfastOrders: normalizedOrders,
    workSessions: normalizedWork,
    auditLogs: normalizedAudit,
    chatChannels: Array.isArray(d.chatChannels) ? d.chatChannels : [],
    chatMessages: Array.isArray(d.chatMessages) ? d.chatMessages : [],
    passwordResetRequests: Array.isArray(d.passwordResetRequests) ? d.passwordResetRequests : []
  };
}
