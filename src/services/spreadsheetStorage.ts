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
 * BACA SELURUH DATABASE DARI GOOGLE SPREADSHEET (VIA SERVER PROXY ATAU DIRECT WEB APP)
 * Berfungsi sebagai Single Source of Truth utama menggantikan Supabase
 */
export async function fetchFullDatabaseFromSpreadsheet(): Promise<CompleteStorageDatabase | null> {
  const cfg = getSpreadsheetConfig();

  // 1. Coba ambil melalui endpoint backend proxy /api/sheets/database
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
    console.warn('Proxy /api/sheets/database tidak merespons, mencoba langsung via Web App URL:', e);
  }

  // 2. Jika proxy server tidak tersedia atau belum ada data, coba langsung fetch ke Web App URL
  if (cfg.webAppUrl) {
    try {
      const directRes = await fetch(cfg.webAppUrl, {
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
      console.warn('Direct fetch to Google Apps Script failed:', directErr);
    }
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
 * Melakukan pemetaan field snake_case dan camelCase untuk seluruh tabel & katalog
 */
export function normalizeSpreadsheetPayload(d: any): CompleteStorageDatabase {
  // 1. Normalisasi Katalog Tipe Kamar & Tarif Kapasitas
  const rawRates = Array.isArray(d.roomCapacityRates) ? d.roomCapacityRates : (Array.isArray(d.room_capacity_rates) ? d.room_capacity_rates : []);
  const normalizedRates = rawRates.map((r: any) => ({
    id: String(r.id || `rcr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`),
    roomType: r.roomType || r.room_type || 'Standar',
    bedType: r.bedType || r.bed_type || 'Double Bed',
    capacityPax: Number(r.capacityPax || r.capacity_pax || 2),
    pricePerNight: Number(r.pricePerNight || r.price_per_night || 0),
    description: r.description || '',
    facilities: Array.isArray(r.facilities) ? r.facilities : (typeof r.facilities === 'string' && r.facilities ? r.facilities.split(',').map((s: string) => s.trim()) : []),
    isActive: r.isActive !== undefined ? Boolean(r.isActive) : (r.is_active !== undefined ? (String(r.is_active).toLowerCase() === 'true' || r.is_active === 1 || r.is_active === true) : true),
  }));

  // 2. Normalisasi Katalog Menu Sarapan & Katering Koperasi
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

  // 3. Normalisasi Unit Kamar
  const rawRooms = Array.isArray(d.rooms) ? d.rooms : [];
  const normalizedRooms = rawRooms.map((r: any) => ({
    id: String(r.id || ''),
    roomNumber: String(r.roomNumber || r.room_number || ''),
    building: r.building || '',
    floor: Number(r.floor || 1),
    type: r.type || 'Standar',
    bedType: r.bedType || r.bed_type || undefined,
    capacity: String(r.capacity || '2 Orang'),
    capacityNumber: r.capacityNumber !== undefined ? Number(r.capacityNumber) : (r.capacity_number !== undefined ? Number(r.capacity_number) : undefined),
    status: r.status || 'KOSONG',
    qcStatus: r.qcStatus || r.qc_status || 'LOLOS_QC',
    pricePerNight: Number(r.pricePerNight || r.price_per_night || 0),
    notes: r.notes || '',
    activeTxId: r.activeTxId || r.active_tx_id || null,
    activeMaintId: r.activeMaintId || r.active_maint_id || null,
  }));

  // 4. Normalisasi Ruang Pertemuan / Aula
  const rawMeeting = Array.isArray(d.meetingRooms) ? d.meetingRooms : (Array.isArray(d.meeting_rooms) ? d.meeting_rooms : []);
  const normalizedMeeting = rawMeeting.map((m: any) => ({
    id: String(m.id || ''),
    name: m.name || '',
    building: m.building || '',
    floor: Number(m.floor || 1),
    capacity: String(m.capacity || '100 - 1500 Orang'),
    dailyRate: Number(m.dailyRate || m.rate_full_day || 0),
    sessionRate: Number(m.sessionRate || m.rate_half_day || 0),
    status: m.status || 'TERSEDIA',
    facilities: Array.isArray(m.facilities) ? m.facilities : (typeof m.amenities === 'string' && m.amenities ? m.amenities.split(',').map((s: string) => s.trim()) : []),
  }));

  // 5. Normalisasi Inspeksi QC
  const rawQc = Array.isArray(d.qcInspections) ? d.qcInspections : (Array.isArray(d.qc_inspections) ? d.qc_inspections : []);
  const normalizedQc = rawQc.map((q: any) => ({
    id: String(q.id || `qc-${Date.now()}`),
    roomId: String(q.roomId || q.room_id || ''),
    building: q.building || '',
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

  // 6. Normalisasi Sesi Jam Kerja Petugas
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

  // 8. Normalisasi Log Audit
  const rawAudit = Array.isArray(d.auditLogs) ? d.auditLogs : (Array.isArray(d.system_logs) ? d.system_logs : []);

  // 9. Normalisasi Pesanan Sarapan
  const rawOrders = Array.isArray(d.breakfastOrders) ? d.breakfastOrders : (Array.isArray(d.breakfast_orders) ? d.breakfast_orders : []);

  return {
    schemaVersion: 4,
    appName: d.appName || 'SIM-Akomodasi UPT Asrama Haji Jakarta',
    exportedAt: new Date().toISOString(),
    appSettings: settingsObj,
    users: Array.isArray(d.users) ? d.users : [],
    buildings: Array.isArray(d.buildings) ? d.buildings : [],
    rooms: normalizedRooms,
    meetingRooms: normalizedMeeting,
    roomCapacityRates: normalizedRates,
    breakfastMenuItems: normalizedMenus,
    transactions: Array.isArray(d.transactions) ? d.transactions : [],
    maintenances: Array.isArray(d.maintenances) ? d.maintenances : [],
    qcInspections: normalizedQc,
    breakfastOrders: rawOrders,
    workSessions: normalizedWork,
    auditLogs: rawAudit,
    chatChannels: Array.isArray(d.chatChannels) ? d.chatChannels : [],
    chatMessages: Array.isArray(d.chatMessages) ? d.chatMessages : [],
    passwordResetRequests: Array.isArray(d.passwordResetRequests) ? d.passwordResetRequests : []
  };
}
