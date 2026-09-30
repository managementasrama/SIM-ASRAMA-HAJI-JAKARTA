import { createClient } from '@supabase/supabase-js';
import type { CompleteStorageDatabase } from '../services/dataStorage';
import { initialRoomCapacityRates } from '../data';
import type { 
  Building, 
  Room, 
  MeetingRoom, 
  Transaction, 
  Maintenance, 
  QcInspection, 
  WorkSession, 
  AuditLog, 
  ChatChannel, 
  ChatMessage, 
  BreakfastMenuItem, 
  BreakfastOrder, 
  User,
  RoomCapacityRate
} from '../types';

/**
 * Pembersihan URL Supabase jika pengguna menyertakan path endpoint '/rest/v1' atau trailing slash.
 * createClient memerlukan base project URL seperti https://xyz.supabase.co
 */
function sanitizeSupabaseUrl(url?: string): string {
  if (!url) return '';
  return url.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}

// Deteksi environment variable aman untuk Vite & Vercel
const rawEnvUrl = 
  (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && (process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)) ||
  'https://ijvbtubyjxqjethugzlm.supabase.co';

const rawEnvKey = 
  (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && (process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY)) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqdmJ0dWJ5anhxamV0aHVnemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5NzEwMDksImV4cCI6MjEwNTU0NzAwOX0.Kq8voFP02KShzjqQ7XPgL2OJi07oV_d0iY01hYYZ4sU';

export const SUPABASE_URL = sanitizeSupabaseUrl(rawEnvUrl);
export const SUPABASE_ANON_KEY = (rawEnvKey || '').trim();

/**
 * Klien resmi Supabase (@supabase/supabase-js)
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

export interface SupabaseSyncState {
  status: 'idle' | 'syncing' | 'connected' | 'error';
  lastSyncTime: string | null;
  errorMessage: string | null;
  isConfigured: boolean;
}

/**
 * Uji konektivitas ke Supabase
 */
export async function testSupabaseConnection(): Promise<{ success: boolean; message: string }> {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { success: false, message: 'URL atau Anon Key Supabase belum dikonfigurasi.' };
    }

    // Coba ping tabel app_database_sync atau users
    const { error } = await supabase.from('app_database_sync').select('id').limit(1);
    if (error) {
      // Jika tabel belum dibuat, periksa koneksi rest
      if (error.code === '42P01') {
        return { 
          success: true, 
          message: 'Terkoneksi ke Supabase! Catatan: Tabel database belum dibuat. Silakan jalankan script SQL yang telah disediakan di SQL Editor Supabase.' 
        };
      }
      return { success: false, message: `Koneksi Supabase gagal: ${error.message} (Code: ${error.code})` };
    }

    return { success: true, message: 'Berhasil terhubung ke Supabase Database secara realtime!' };
  } catch (err: any) {
    return { success: false, message: `Gagal menghubungi Supabase: ${err?.message || 'Network error'}` };
  }
}

/**
 * Ambil seluruh database dari Supabase
 */
/**
 * Pemetaan record tabel users Supabase (snake_case) ke objek User aplikasi (camelCase)
 */
export function mapSupabaseUserToAppUser(u: any): User {
  return {
    id: u.id,
    username: u.username,
    fullName: u.full_name || u.fullName || u.username,
    role: u.role,
    password: u.password || '12345',
    department: u.department || 'Operasional',
    supervisorId: u.supervisor_id || u.supervisorId || undefined,
    assignedBuilding: u.assigned_building || u.assignedBuilding || 'Semua Gedung',
    phone: u.phone || '-',
    status: u.status || 'Aktif',
    email: u.email || undefined,
    nip: u.nip || undefined,
    isOwner: u.is_owner ?? u.isOwner ?? false,
    signatureUrl: u.signature_url || u.signatureUrl || undefined,
    qrCodeUrl: u.qr_code_url || u.qrCodeUrl || undefined,
    signatureHistory: u.signature_history || u.signatureHistory || []
  };
}

export function mapSupabaseBuildingToAppBuilding(b: any): Building {
  return {
    id: b.id,
    name: b.name,
    code: b.code || undefined,
    floors: b.floors ?? 1,
    totalRooms: b.total_rooms ?? b.totalRooms ?? 0,
    capacityDesc: b.capacity_desc || b.capacityDesc || undefined,
    category: b.category || 'PENGINAPAN',
    description: b.description || undefined,
    status: b.status || 'AKTIF',
    createdAt: b.created_at || b.createdAt || undefined
  };
}

export function mapSupabaseMeetingRoomToAppMeetingRoom(m: any): MeetingRoom {
  return {
    id: m.id,
    name: m.name,
    code: m.code || undefined,
    building: m.building,
    capacity: m.capacity || '',
    capacityNumber: m.capacity_number ?? m.capacityNumber ?? 0,
    facilities: m.facilities || [],
    dailyRate: Number(m.daily_rate ?? m.dailyRate ?? 0),
    sessionRate: Number(m.session_rate ?? m.sessionRate ?? 0),
    description: m.description || undefined,
    status: m.status || 'TERSEDIA',
    qcStatus: m.qc_status || m.qcStatus || 'LOLOS_QC',
    activeTxId: m.active_tx_id || m.activeTxId || null,
    createdAt: m.created_at || m.createdAt || undefined
  };
}

export function mapSupabaseRoomToAppRoom(r: any): Room {
  return {
    id: r.id,
    building: r.building,
    roomNumber: r.room_number || r.roomNumber,
    floor: r.floor ?? undefined,
    type: r.type,
    bedType: r.bed_type || r.bedType || undefined,
    capacity: r.capacity || '',
    capacityNumber: r.capacity_number ?? r.capacityNumber ?? undefined,
    status: r.status || 'KOSONG',
    qcStatus: r.qc_status || r.qcStatus || 'LOLOS_QC',
    lastQcDate: r.last_qc_date || r.lastQcDate || undefined,
    lastQcBy: r.last_qc_by || r.lastQcBy || undefined,
    lastQcNotes: r.last_qc_notes || r.lastQcNotes || undefined,
    activeTxId: r.active_tx_id !== undefined ? r.active_tx_id : (r.activeTxId !== undefined ? r.activeTxId : null),
    activeMaintId: r.active_maint_id !== undefined ? r.active_maint_id : (r.activeMaintId !== undefined ? r.activeMaintId : null),
    pricePerNight: Number(r.price_per_night ?? r.pricePerNight ?? 0),
    facilities: r.facilities || [],
    createdAt: r.created_at || r.createdAt || undefined
  };
}

export function mapSupabaseTransactionToAppTransaction(t: any): Transaction {
  return {
    id: t.id,
    roomId: t.room_id || t.roomId || '',
    building: t.building || '',
    roomNumber: t.room_number || t.roomNumber || '',
    category: t.category || '',
    guestName: t.guest_name || t.guestName || '',
    guestType: t.guest_type || t.guestType || 'INDIVIDU',
    nikKtp: t.nik_ktp || t.nikKtp || undefined,
    kloter: t.kloter || '',
    startDate: t.start_date || t.startDate || '',
    duration: Number(t.duration || 1),
    phone: t.phone || '',
    notes: t.notes || '',
    status: t.status || 'AKTIF',
    createdUser: t.created_user || t.createdUser || 'System',
    isGroup: Boolean(t.is_group ?? t.isGroup),
    groupType: t.group_type || t.groupType || undefined,
    groupName: t.group_name || t.groupName || undefined,
    groupPic: t.group_pic || t.groupPic || undefined,
    groupPicPhone: t.group_pic_phone || t.groupPicPhone || undefined,
    groupId: t.group_id || t.groupId || undefined,
    totalPax: t.total_pax ?? t.totalPax ?? undefined,
    includeAula: Boolean(t.include_aula ?? t.includeAula),
    rentAulaId: t.rent_aula_id || t.rentAulaId || undefined,
    rentAulaName: t.rent_aula_name || t.rentAulaName || undefined,
    rentAulaDuration: t.rent_aula_duration ?? t.rentAulaDuration ?? undefined,
    rentAulaDurationDays: t.rent_aula_duration_days ?? t.rentAulaDurationDays ?? undefined,
    rentAulaSession: t.rent_aula_session || t.rentAulaSession || undefined,
    cateringPackage: t.catering_package || t.cateringPackage || undefined,
    cateringPaxCount: t.catering_pax_count ?? t.cateringPaxCount ?? undefined,
    agencyOrDocument: t.agency_or_document || t.agencyOrDocument || undefined,
    spkNumber: t.spk_number || t.spkNumber || undefined,
    allocatedRoomNumbers: t.allocated_room_numbers || t.allocatedRoomNumbers || undefined,
    allocatedRoomsCount: t.allocated_rooms_count ?? t.allocatedRoomsCount ?? undefined,
    breakfast: Boolean(t.breakfast),
    breakfastMenu: t.breakfast_menu || t.breakfastMenu || undefined,
    breakfastPortions: t.breakfast_portions ?? t.breakfastPortions ?? undefined,
    breakfastDays: t.breakfast_days ?? t.breakfastDays ?? undefined,
    breakfastStatus: t.breakfast_status || t.breakfastStatus || undefined,
    rentType: t.rent_type || t.rentType || undefined,
    durationUnit: t.duration_unit || t.durationUnit || 'Hari',
    pricePerNight: Number(t.price_per_night ?? t.pricePerNight ?? 0),
    extraBed: Boolean(t.extra_bed ?? t.extraBed),
    extraBedCount: Number(t.extra_bed_count ?? t.extraBedCount ?? 0),
    extraBedPrice: Number(t.extra_bed_price ?? t.extraBedPrice ?? 0),
    extraBedNotes: t.extra_bed_notes || t.extraBedNotes || undefined,
    checkInTime: t.check_in_time || t.checkInTime || undefined,
    checkOutTime: t.check_out_time || t.checkOutTime || undefined,
    paymentStatus: t.payment_status || t.paymentStatus || 'BELUM_LUNAS',
    paidAmount: Number(t.paid_amount ?? t.paidAmount ?? 0),
    dpAmount: Number(t.dp_amount ?? t.dpAmount ?? 0),
    dpDate: t.dp_date || t.dpDate || undefined,
    dpMethod: t.dp_method || t.dpMethod || undefined,
    dpNote: t.dp_note || t.dpNote || undefined,
    remainingAmount: Number(t.remaining_amount ?? t.remainingAmount ?? 0),
    vaNumber: t.va_number || t.vaNumber || undefined,
    vaAccountName: t.va_account_name || t.vaAccountName || undefined,
    bankName: t.bank_name || t.bankName || undefined,
    bankAccountNumber: t.bank_account_number || t.bankAccountNumber || undefined,
    paymentMethod: t.payment_method || t.paymentMethod || undefined,
    paymentDate: t.payment_date || t.paymentDate || undefined,
    paymentNote: t.payment_note || t.paymentNote || undefined,
    kwitansiNo: t.kwitansi_no || t.kwitansiNo || undefined,
    cancelledAt: t.cancelled_at || t.cancelledAt || undefined,
    cancelReason: t.cancel_reason || t.cancelReason || undefined,
    cancelledUser: t.cancelled_user || t.cancelledUser || undefined,
    extendedCount: Number(t.extended_count ?? t.extendedCount ?? 0),
    extendHistory: t.extend_history || t.extendHistory || []
  };
}

export function mapSupabaseMaintenanceToAppMaintenance(m: any): Maintenance {
  return {
    id: m.id,
    roomId: m.room_id || m.roomId || '',
    building: m.building || '',
    roomNumber: m.room_number || m.roomNumber || '',
    category: m.category || '',
    urgency: m.urgency || 'SEDANG',
    technician: m.technician || '',
    description: m.description || '',
    reportTime: m.report_time || m.reportTime || '',
    status: m.status || 'MENUNGGU_PENUGASAN',
    reportedUser: m.reported_user || m.reportedUser || 'System',
    assignedTechnicianId: m.assigned_technician_id || m.assignedTechnicianId || undefined,
    assignedTechnicianName: m.assigned_technician_name || m.assignedTechnicianName || undefined,
    assignedByManager: m.assigned_by_manager || m.assignedByManager || undefined,
    assignedTime: m.assigned_time || m.assignedTime || undefined,
    managerNotes: m.manager_notes || m.managerNotes || undefined,
    workCompletedTime: m.work_completed_time || m.workCompletedTime || undefined,
    technicianNotes: m.technician_notes || m.technicianNotes || undefined,
    resolvedTime: m.resolved_time || m.resolvedTime || undefined,
    qcInspectionId: m.qc_inspection_id || m.qcInspectionId || undefined,
    qcVerdict: m.qc_verdict || m.qcVerdict || undefined,
    facilityType: m.facility_type || m.facilityType || 'KAMAR'
  };
}

export function mapSupabaseQcToAppQc(q: any): QcInspection {
  return {
    id: q.id,
    roomId: q.room_id || q.roomId || '',
    building: q.building || '',
    roomNumber: q.room_number || q.roomNumber || '',
    inspectorId: q.inspector_id || q.inspectorId || '',
    inspectorName: q.inspector_name || q.inspectorName || '',
    inspectionDate: q.inspection_date || q.inspectionDate || '',
    cleanliness: q.cleanliness || 'BAIK',
    linenBed: q.linen_bed || q.linenBed || 'LENGKAP_BERSIH',
    acElectricity: q.ac_electricity || q.acElectricity || 'NORMAL',
    plumbingWater: q.plumbing_water || q.plumbingWater || 'LANCAR',
    amenities: q.amenities || 'LENGKAP',
    result: q.result || 'LOLOS_QC',
    decisionType: q.decision_type || q.decisionType || undefined,
    notes: q.notes || '',
    maintenanceIdCreated: q.maintenance_id_created || q.maintenanceIdCreated || undefined,
    facilityType: q.facility_type || q.facilityType || 'KAMAR'
  };
}

export function mapSupabaseWorkSessionToAppWorkSession(s: any): WorkSession {
  return {
    id: s.id,
    userId: s.user_id || s.userId || '',
    userName: s.user_name || s.userName || '',
    userRole: s.user_role || s.userRole || '',
    loginTime: s.login_time || s.loginTime || '',
    logoutTime: s.logout_time || s.logoutTime || null,
    durationSeconds: Number(s.duration_seconds ?? s.durationSeconds ?? 0),
    durationFormatted: s.duration_formatted || s.durationFormatted || '0 Jam 0 Menit 0 Detik',
    status: s.status || 'AKTIF',
    notes: s.notes || undefined
  };
}

export function mapSupabaseAuditLogToAppAuditLog(a: any): AuditLog {
  return {
    id: a.id,
    timestamp: a.timestamp || '',
    user: a.user_name || a.user || '',
    role: a.role || '',
    action: a.action || '',
    details: a.details || '',
    durationMinutes: a.duration_minutes ? Number(a.duration_minutes) : (a.durationMinutes ? Number(a.durationMinutes) : undefined),
    verificationCode: a.verification_code || a.verificationCode || undefined,
    documentTitle: a.document_title || a.documentTitle || undefined,
    targetId: a.target_id || a.targetId || undefined,
    signatoryName: a.signatory_name || a.signatoryName || undefined,
    signatoryRole: a.signatory_role || a.signatoryRole || undefined,
    signatoryNip: a.signatory_nip || a.signatoryNip || undefined,
    qrCodeHash: a.qr_code_hash || a.qrCodeHash || undefined,
    hasQrAndSignature: a.has_qr_and_signature !== undefined ? Boolean(a.has_qr_and_signature) : (a.hasQrAndSignature !== undefined ? Boolean(a.hasQrAndSignature) : true)
  };
}

export function mapSupabaseBreakfastOrderToAppBreakfastOrder(o: any): BreakfastOrder {
  return {
    id: o.id,
    roomNumber: o.room_number || o.roomNumber || '',
    building: o.building || '',
    guestName: o.guest_name || o.guestName || '',
    phone: o.phone || '',
    kloter: o.kloter || '',
    transactionId: o.transaction_id || o.transactionId || '',
    menuId: o.menu_id || o.menuId || undefined,
    menuName: o.menu_name || o.menuName || '',
    portions: Number(o.portions || 1),
    days: Number(o.days || 1),
    startDate: o.start_date || o.startDate || undefined,
    deliveryTime: o.delivery_time || o.deliveryTime || undefined,
    status: o.status || 'MENUNGGU',
    notes: o.notes || '',
    dietaryRestriction: o.dietary_restriction || o.dietaryRestriction || undefined,
    pricePerPortion: Number(o.price_per_portion ?? o.pricePerPortion ?? 0),
    totalPrice: Number(o.total_price ?? o.totalPrice ?? 0),
    createdAt: o.created_at || o.createdAt || new Date().toISOString(),
    updatedAt: o.updated_at || o.updatedAt || undefined
  };
}

export function mapSupabaseBreakfastMenuItemToAppMenuItem(m: any): BreakfastMenuItem {
  return {
    id: m.id,
    name: m.name,
    category: m.category,
    price: Number(m.price || 0),
    description: m.description || '',
    isAvailable: m.is_available ?? m.isAvailable ?? true,
    allergens: m.allergens || undefined
  };
}

export function mapSupabaseRoomCapacityRateToAppRate(r: any): RoomCapacityRate {
  return {
    id: r.id,
    roomType: r.room_type || r.roomType,
    bedType: r.bed_type || r.bedType,
    capacityPax: Number(r.capacity_pax ?? r.capacityPax ?? 1),
    pricePerNight: Number(r.price_per_night ?? r.pricePerNight ?? 0),
    description: r.description || undefined,
    facilities: r.facilities || [],
    isActive: r.is_active ?? r.isActive ?? true,
    updatedAt: r.updated_at || r.updatedAt || undefined
  };
}

/**
 * Mengambil seluruh database dari Supabase Cloud
 */
export async function fetchFullDatabaseFromSupabase(): Promise<CompleteStorageDatabase | null> {
  try {
    // 1. Ambil data users langsung dari tabel Supabase users agar selalu sinkron dengan database
    let directUsers: User[] | null = null;
    try {
      const { data: uData } = await supabase.from('users').select('*');
      if (uData && uData.length > 0) {
        directUsers = uData.map(mapSupabaseUserToAppUser);
      }
    } catch (uErr) {
      console.warn('Gagal membaca tabel users Supabase:', uErr);
    }

    // 2. Coba ambil dari tabel snapshot terpadu app_database_sync
    const { data: syncData, error: syncError } = await supabase
      .from('app_database_sync')
      .select('database_payload, updated_at')
      .eq('id', 'main_production_db')
      .maybeSingle();

    if (!syncError && syncData && syncData.database_payload) {
      const payload = syncData.database_payload as CompleteStorageDatabase;
      // Jika tabel users di Supabase memiliki data, prioritaskan agar identik dengan tabel Supabase
      if (directUsers && directUsers.length > 0) {
        payload.users = directUsers;
      }
      return payload;
    }

    // 3. Jika tidak ada di app_database_sync, query dari masing-masing tabel relasional
    const [
      usersRes,
      buildingsRes,
      roomsRes,
      meetingRoomsRes,
      transactionsRes,
      maintenancesRes,
      qcRes,
      sessionsRes,
      auditRes,
      breakfastMenuRes,
      breakfastOrdersRes,
      ratesRes,
      pwdRes,
      settingsRes
    ] = await Promise.all([
      supabase.from('users').select('*'),
      supabase.from('buildings').select('*'),
      supabase.from('rooms').select('*'),
      supabase.from('meeting_rooms').select('*'),
      supabase.from('transactions').select('*'),
      supabase.from('maintenances').select('*'),
      supabase.from('qc_inspections').select('*'),
      supabase.from('work_sessions').select('*'),
      supabase.from('audit_logs').select('*'),
      supabase.from('breakfast_menu_items').select('*'),
      supabase.from('breakfast_orders').select('*'),
      supabase.from('room_capacity_rates').select('*'),
      supabase.from('password_reset_requests').select('*'),
      supabase.from('app_settings').select('*').maybeSingle()
    ]);

    // Jika setidaknya tabel users atau rooms ada isinya, kita konstruksi database lengkap
    if ((usersRes.data && usersRes.data.length > 0) || (roomsRes.data && roomsRes.data.length > 0)) {
      const mappedUsers = (usersRes.data || []).map(mapSupabaseUserToAppUser);
      const db: CompleteStorageDatabase = {
        schemaVersion: 4,
        appName: 'SIM-Akomodasi UPT Asrama Haji Jakarta',
        exportedAt: new Date().toISOString(),
        appSettings: (settingsRes.data as any) || undefined,
        users: mappedUsers.length > 0 ? mappedUsers : (directUsers || []),
        buildings: (buildingsRes.data || []).map(mapSupabaseBuildingToAppBuilding),
        rooms: (roomsRes.data || []).map(mapSupabaseRoomToAppRoom),
        meetingRooms: (meetingRoomsRes.data || []).map(mapSupabaseMeetingRoomToAppMeetingRoom),
        transactions: (transactionsRes.data || []).map(mapSupabaseTransactionToAppTransaction),
        maintenances: (maintenancesRes.data || []).map(mapSupabaseMaintenanceToAppMaintenance),
        qcInspections: (qcRes.data || []).map(mapSupabaseQcToAppQc),
        workSessions: (sessionsRes.data || []).map(mapSupabaseWorkSessionToAppWorkSession),
        auditLogs: (auditRes.data || []).map(mapSupabaseAuditLogToAppAuditLog),
        chatChannels: [],
        chatMessages: [],
        breakfastMenuItems: (breakfastMenuRes.data || []).map(mapSupabaseBreakfastMenuItemToAppMenuItem),
        breakfastOrders: (breakfastOrdersRes.data || []).map(mapSupabaseBreakfastOrderToAppBreakfastOrder),
        roomCapacityRates: ratesRes.data && ratesRes.data.length > 0
          ? ratesRes.data.map(mapSupabaseRoomCapacityRateToAppRate)
          : initialRoomCapacityRates,
        passwordResetRequests: pwdRes.data || []
      };
      return db;
    }

    return null;
  } catch (e) {
    console.warn('Gagal membaca data dari Supabase:', e);
    return null;
  }
}

/**
 * Simpan seluruh database ke Supabase
 */
export async function syncFullDatabaseToSupabase(db: CompleteStorageDatabase): Promise<{ success: boolean; error?: string }> {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { success: false, error: 'Kredensial Supabase tidak ditemukan' };
    }

    // 1. Simpan snapshot terpadu ke app_database_sync (cepat, atomic, dan menjamin relasi utuh)
    const { error: syncError } = await supabase
      .from('app_database_sync')
      .upsert({
        id: 'main_production_db',
        database_payload: db,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (syncError && syncError.code !== '42P01') {
      console.warn('Peringatan saat upsert app_database_sync:', syncError.message);
    }

    // 2. Simpan juga ke tabel-tabel individual jika tabel sudah dibuat
    // (Jalankan secara background/non-blocking)
    syncIndividualTables(db).catch(err => {
      console.warn('Sync individual tables info/warning:', err?.message);
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error syncing to Supabase:', err);
    return { success: false, error: err?.message || 'Sync error' };
  }
}

/**
 * Sinkronisasi data ke tabel-tabel individual Supabase (upsert batch)
 */
async function syncIndividualTables(db: CompleteStorageDatabase) {
  // Simpan settings
  if (db.appSettings) {
    const fullSettingsPayload = {
      id: 'default',
      organization_name: db.appSettings.organizationName,
      sub_title: db.appSettings.subTitle,
      ministry_name: db.appSettings.ministryName,
      address: db.appSettings.address,
      phone: db.appSettings.phone,
      email: db.appSettings.email,
      portal_url: db.appSettings.portalUrl,
      app_logo: db.appSettings.appLogo || null,
      app_favicon: db.appSettings.appFavicon || null,
      tag_title: db.appSettings.tagTitle || null,
      updated_at: new Date().toISOString()
    };
    const { error: setErr } = await supabase.from('app_settings').upsert(fullSettingsPayload, { onConflict: 'id' });
    if (setErr && (setErr.message.includes('column') || setErr.code === 'PGRST204')) {
      // Fallback tanpa kolom baru
      const { app_favicon, tag_title, ...baseSettingsPayload } = fullSettingsPayload;
      await supabase.from('app_settings').upsert(baseSettingsPayload, { onConflict: 'id' });
    }
  }

  // Simpan users
  if (db.users && db.users.length > 0) {
    const userPayloads = db.users.map(u => ({
      id: u.id,
      username: u.username,
      full_name: u.fullName,
      role: u.role,
      password: u.password,
      department: u.department,
      supervisor_id: u.supervisorId || null,
      assigned_building: u.assignedBuilding || null,
      phone: u.phone || null,
      status: u.status || 'Aktif',
      email: u.email || null,
      nip: u.nip || null,
      is_owner: Boolean(u.isOwner),
      signature_url: u.signatureUrl || null,
      qr_code_url: u.qrCodeUrl || null,
      signature_history: u.signatureHistory || []
    }));
    
    const { error: uErr } = await supabase.from('users').upsert(userPayloads, { onConflict: 'id' });
    if (uErr && (uErr.message.includes('column') || uErr.code === 'PGRST204')) {
      // Fallback ke kolom standar jika skema SQL belum di-alter di dashboard
      const fallbackUserPayloads = db.users.map(u => ({
        id: u.id,
        username: u.username,
        full_name: u.fullName,
        role: u.role,
        password: u.password,
        department: u.department,
        supervisor_id: u.supervisorId || null,
        assigned_building: u.assignedBuilding || null,
        phone: u.phone || null,
        status: u.status || 'Aktif',
        email: u.email || null,
        is_owner: Boolean(u.isOwner)
      }));
      await supabase.from('users').upsert(fallbackUserPayloads, { onConflict: 'id' });
    }

    // Hapus user di Supabase yang sudah dihapus di aplikasi agar data selalu identik
    try {
      const activeIds = db.users.map(u => u.id);
      const { data: existingRemoteUsers } = await supabase.from('users').select('id');
      if (existingRemoteUsers && existingRemoteUsers.length > 0) {
        const toDeleteIds = existingRemoteUsers.map(r => r.id).filter(id => !activeIds.includes(id));
        if (toDeleteIds.length > 0) {
          await supabase.from('users').delete().in('id', toDeleteIds);
        }
      }
    } catch (cleanErr) {
      console.warn('Gagal membersihkan user terhapus di Supabase:', cleanErr);
    }
  }

  // Simpan buildings
  if (db.buildings && db.buildings.length > 0) {
    const bldPayloads = db.buildings.map(b => ({
      id: b.id,
      name: b.name,
      code: b.code,
      floors: b.floors,
      total_rooms: b.totalRooms,
      capacity_desc: b.capacityDesc,
      category: b.category,
      description: b.description,
      status: b.status
    }));
    await supabase.from('buildings').upsert(bldPayloads, { onConflict: 'id' });
  }

  // Simpan rooms
  if (db.rooms && db.rooms.length > 0) {
    const roomPayloads = db.rooms.map(r => ({
      id: r.id,
      building: r.building,
      room_number: r.roomNumber,
      floor: r.floor,
      type: r.type,
      capacity: r.capacity,
      status: r.status,
      qc_status: r.qcStatus,
      last_qc_date: r.lastQcDate,
      last_qc_by: r.lastQcBy,
      last_qc_notes: r.lastQcNotes,
      active_tx_id: r.activeTxId,
      active_maint_id: r.activeMaintId,
      price_per_night: r.pricePerNight,
      facilities: r.facilities
    }));
    await supabase.from('rooms').upsert(roomPayloads, { onConflict: 'id' });
  }

  // Simpan meeting rooms
  if (db.meetingRooms && db.meetingRooms.length > 0) {
    const mrPayloads = db.meetingRooms.map(m => ({
      id: m.id,
      name: m.name,
      code: m.code,
      building: m.building,
      capacity: m.capacity,
      capacity_number: m.capacityNumber,
      facilities: m.facilities,
      daily_rate: m.dailyRate,
      session_rate: m.sessionRate,
      description: m.description,
      status: m.status,
      qc_status: m.qcStatus,
      active_tx_id: m.activeTxId
    }));
    await supabase.from('meeting_rooms').upsert(mrPayloads, { onConflict: 'id' });
  }

  // Simpan transactions
  if (db.transactions && db.transactions.length > 0) {
    const txPayloads = db.transactions.map(t => ({
      id: t.id,
      room_id: t.roomId,
      building: t.building,
      room_number: t.roomNumber,
      category: t.category,
      guest_name: t.guestName,
      guest_type: t.guestType,
      nik_ktp: t.nikKtp,
      kloter: t.kloter,
      start_date: t.startDate,
      duration: t.duration,
      phone: t.phone,
      notes: t.notes,
      status: t.status,
      created_user: t.createdUser,
      is_group: t.isGroup,
      group_type: t.groupType,
      group_name: t.groupName,
      group_pic: t.groupPic,
      group_pic_phone: t.groupPicPhone,
      group_id: t.groupId,
      total_pax: t.totalPax,
      include_aula: t.includeAula,
      rent_aula_id: t.rentAulaId,
      rent_aula_name: t.rentAulaName,
      catering_package: t.cateringPackage,
      catering_pax_count: t.cateringPaxCount,
      spk_number: t.spkNumber,
      allocated_room_numbers: t.allocatedRoomNumbers,
      allocated_rooms_count: t.allocatedRoomsCount,
      breakfast: t.breakfast,
      breakfast_menu: t.breakfastMenu,
      breakfast_portions: t.breakfastPortions,
      breakfast_days: t.breakfastDays,
      breakfast_status: t.breakfastStatus,
      rent_type: t.rentType,
      duration_unit: t.durationUnit,
      extra_bed: t.extraBed,
      extra_bed_count: t.extraBedCount,
      extra_bed_price: t.extraBedPrice || 0,
      extra_bed_notes: t.extraBedNotes || null,
      agency_or_document: t.agencyOrDocument || null,
      price_per_night: t.pricePerNight || 0,
      payment_status: t.paymentStatus || 'BELUM_LUNAS',
      paid_amount: t.paidAmount || 0,
      dp_amount: t.dpAmount || 0,
      dp_date: t.dpDate || null,
      dp_method: t.dpMethod || null,
      dp_note: t.dpNote || null,
      remaining_amount: t.remainingAmount || 0,
      va_number: t.vaNumber || null,
      va_account_name: t.vaAccountName || null,
      bank_name: t.bankName || null,
      bank_account_number: t.bankAccountNumber || null,
      payment_method: t.paymentMethod || null,
      payment_date: t.paymentDate || null,
      payment_note: t.paymentNote || null,
      kwitansi_no: t.kwitansiNo || null,
      cancelled_at: t.cancelledAt || null,
      cancel_reason: t.cancelReason || null,
      cancelled_user: t.cancelledUser || null,
      extend_history: t.extendHistory || [],
      check_in_time: t.checkInTime,
      check_out_time: t.checkOutTime
    }));
    await supabase.from('transactions').upsert(txPayloads, { onConflict: 'id' });
  }

  // Simpan maintenances
  if (db.maintenances && db.maintenances.length > 0) {
    const maintPayloads = db.maintenances.map(m => ({
      id: m.id,
      room_id: m.roomId,
      building: m.building,
      room_number: m.roomNumber,
      category: m.category,
      urgency: m.urgency,
      technician: m.technician,
      description: m.description,
      report_time: m.reportTime,
      status: m.status,
      reported_user: m.reportedUser,
      assigned_technician_id: m.assignedTechnicianId,
      assigned_technician_name: m.assignedTechnicianName,
      assigned_by_manager: m.assignedByManager,
      assigned_time: m.assignedTime,
      manager_notes: m.managerNotes,
      work_completed_time: m.workCompletedTime,
      technician_notes: m.technicianNotes,
      resolved_time: m.resolvedTime,
      qc_inspection_id: m.qcInspectionId,
      facility_type: m.facilityType
    }));
    await supabase.from('maintenances').upsert(maintPayloads, { onConflict: 'id' });
  }

  // Simpan QC inspections
  if (db.qcInspections && db.qcInspections.length > 0) {
    const qcPayloads = db.qcInspections.map(q => ({
      id: q.id,
      room_id: q.roomId,
      building: q.building,
      room_number: q.roomNumber,
      inspector_id: q.inspectorId,
      inspector_name: q.inspectorName,
      inspection_date: q.inspectionDate,
      cleanliness: q.cleanliness,
      linen_bed: q.linenBed,
      ac_electricity: q.acElectricity,
      plumbing_water: q.plumbingWater,
      amenities: q.amenities,
      result: q.result,
      decision_type: q.decisionType || null,
      notes: q.notes,
      facility_type: q.facilityType
    }));
    await supabase.from('qc_inspections').upsert(qcPayloads, { onConflict: 'id' });
  }

  // Simpan Breakfast items
  if (db.breakfastMenuItems && db.breakfastMenuItems.length > 0) {
    const menuPayloads = db.breakfastMenuItems.map(m => ({
      id: m.id,
      name: m.name,
      category: m.category,
      price: m.price,
      description: m.description,
      is_available: m.isAvailable,
      allergens: m.allergens
    }));
    await supabase.from('breakfast_menu_items').upsert(menuPayloads, { onConflict: 'id' });
  }

  // Simpan Breakfast orders
  if (db.breakfastOrders && db.breakfastOrders.length > 0) {
    const orderPayloads = db.breakfastOrders.map(o => ({
      id: o.id,
      room_number: o.roomNumber,
      building: o.building,
      guest_name: o.guestName,
      phone: o.phone,
      kloter: o.kloter,
      transaction_id: o.transactionId,
      menu_name: o.menuName,
      portions: o.portions,
      days: o.days,
      start_date: o.startDate,
      delivery_time: o.deliveryTime,
      status: o.status,
      notes: o.notes,
      price_per_portion: o.pricePerPortion,
      total_price: o.totalPrice
    }));
    await supabase.from('breakfast_orders').upsert(orderPayloads, { onConflict: 'id' });
  }

  // Simpan Audit Logs & PDF Download Logs
  if (db.auditLogs && db.auditLogs.length > 0) {
    const auditPayloads = db.auditLogs.map((a, i) => ({
      id: a.id || `audit-${i}-${Date.now()}`,
      timestamp: a.timestamp,
      user_name: a.user,
      role: a.role,
      action: a.action,
      details: a.details,
      verification_code: a.verificationCode || null,
      document_title: a.documentTitle || null,
      target_id: a.targetId || null,
      signatory_name: a.signatoryName || null,
      signatory_role: a.signatoryRole || null,
      signatory_nip: a.signatoryNip || null,
      qr_code_hash: a.qrCodeHash || null,
      has_qr_and_signature: a.hasQrAndSignature !== false
    }));
    await supabase.from('audit_logs').upsert(auditPayloads, { onConflict: 'id' });

    // Filter yang bertipe unduh PDF ber-QR & TTD sah untuk tabel cepat pdf_download_logs
    const pdfLogs = db.auditLogs
      .filter(a => 
        a.action === 'UNDUH_PDF_BER_QR' && 
        Boolean(a.verificationCode) && 
        a.hasQrAndSignature !== false && 
        Boolean(a.signatoryName && !a.signatoryName.includes('Belum Ada'))
      )
      .map(p => ({
        id: p.id || `vlog-${Date.now()}`,
        verification_code: p.verificationCode,
        timestamp: p.timestamp,
        user_name: p.user,
        role: p.role,
        document_title: p.documentTitle || p.details,
        target_id: p.targetId || null,
        signatory_name: p.signatoryName || null,
        signatory_role: p.signatoryRole || null,
        signatory_nip: p.signatoryNip || null,
        qr_code_hash: p.qrCodeHash || null,
        has_qr_and_signature: true
      }));
    if (pdfLogs.length > 0) {
      await supabase.from('pdf_download_logs').upsert(pdfLogs, { onConflict: 'verification_code' });
    }
  }

  // Simpan Work Sessions (Rekap Sesi & Jam Kerja Shift)
  if (db.workSessions && db.workSessions.length > 0) {
    const sessionPayloads = db.workSessions.map(s => ({
      id: s.id,
      user_id: s.userId,
      user_name: s.userName,
      user_role: s.userRole,
      login_time: s.loginTime,
      logout_time: s.logoutTime || null,
      duration_seconds: s.durationSeconds || 0,
      duration_formatted: s.durationFormatted || '0 Jam 0 Menit 0 Detik',
      status: s.status || 'AKTIF',
      notes: s.notes || null
    }));
    await supabase.from('work_sessions').upsert(sessionPayloads, { onConflict: 'id' });
  }

  // Simpan Permohonan Reset Password (password_reset_requests)
  if (db.passwordResetRequests && db.passwordResetRequests.length > 0) {
    const pwdPayloads = db.passwordResetRequests.map(p => ({
      id: p.id,
      user_id: p.userId,
      username: p.username,
      full_name: p.fullName,
      role: p.role,
      new_password: p.newPassword,
      request_date: p.requestDate,
      status: p.status || 'MENUNGGU_PERSETUJUAN',
      notes: p.notes || null,
      processed_by: p.processedBy || null,
      processed_at: p.processedAt || null
    }));
    await supabase.from('password_reset_requests').upsert(pwdPayloads, { onConflict: 'id' });
  }

  // Simpan Master Tarif Kapasitas Kamar (room_capacity_rates)
  if (db.roomCapacityRates && db.roomCapacityRates.length > 0) {
    const ratePayloads = db.roomCapacityRates.map(r => ({
      id: r.id,
      room_type: r.roomType,
      bed_type: r.bedType,
      capacity_pax: r.capacityPax,
      price_per_night: r.pricePerNight,
      description: r.description || null,
      facilities: r.facilities || [],
      is_active: r.isActive ?? true,
      updated_at: r.updatedAt || new Date().toISOString()
    }));
    await supabase.from('room_capacity_rates').upsert(ratePayloads, { onConflict: 'id' });
  }
}

/**
 * Catat log unduh PDF ber-QR langsung ke Supabase (audit_logs & pdf_download_logs)
 */
export async function recordPdfDownloadLogToSupabase(log: AuditLog): Promise<boolean> {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;

    const auditPayload = {
      id: log.id || `audit-${Date.now()}`,
      timestamp: log.timestamp,
      user_name: log.user,
      role: log.role,
      action: log.action,
      details: log.details,
      verification_code: log.verificationCode || null,
      document_title: log.documentTitle || null,
      target_id: log.targetId || null,
      signatory_name: log.signatoryName || null,
      signatory_role: log.signatoryRole || null,
      signatory_nip: log.signatoryNip || null,
      qr_code_hash: log.qrCodeHash || null,
      has_qr_and_signature: log.hasQrAndSignature !== false
    };

    await supabase.from('audit_logs').upsert([auditPayload], { onConflict: 'id' });

    // Hanya masukkan ke tabel pdf_download_logs jika benar-benar memiliki QR & TTD sah
    if (
      log.action === 'UNDUH_PDF_BER_QR' && 
      log.verificationCode && 
      log.hasQrAndSignature !== false &&
      log.signatoryName && 
      !log.signatoryName.includes('Belum Ada')
    ) {
      await supabase.from('pdf_download_logs').upsert([{
        id: log.id || `vlog-${Date.now()}`,
        verification_code: log.verificationCode,
        timestamp: log.timestamp,
        user_name: log.user,
        role: log.role,
        document_title: log.documentTitle || log.details,
        target_id: log.targetId || null,
        signatory_name: log.signatoryName || null,
        signatory_role: log.signatoryRole || null,
        signatory_nip: log.signatoryNip || null,
        qr_code_hash: log.qrCodeHash || null,
        has_qr_and_signature: true
      }], { onConflict: 'verification_code' });
    }

    return true;
  } catch (err) {
    console.warn('Gagal mencatat log unduh PDF ke Supabase:', err);
    return false;
  }
}

/**
 * Verifikasi keaslian dokumen PDF / QR Code langsung terhadap Supabase Database
 */
export async function verifyDocumentFromSupabase(queryCode: string): Promise<{
  found: boolean;
  source: 'pdf_download_logs' | 'audit_logs' | 'users' | 'not_found';
  data?: any;
}> {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { found: false, source: 'not_found' };

    const rawClean = queryCode.trim();
    if (!rawClean) return { found: false, source: 'not_found' };

    // Bersihkan nama file jika berformat duplikat unduhan browser (contoh: "Laporan_Audit_Log (2).pdf" -> "Laporan_Audit_Log.pdf")
    const cleanFile = rawClean
      .replace(/\s*\(\d+\)\.pdf$/i, '.pdf')
      .replace(/\s*-\s*copy\s*(\d*)\.pdf$/i, '.pdf')
      .replace(/_\d+\.pdf$/i, '.pdf')
      .trim();
    const cleanBase = cleanFile.replace(/\.pdf$/i, '').trim();

    // 1. Cek di tabel pdf_download_logs (Database resmi Log Unduh PDF Ber-QR)
    const { data: pdfLog } = await supabase
      .from('pdf_download_logs')
      .select('*')
      .or(`verification_code.ilike.%${rawClean}%,verification_code.ilike.%${cleanFile}%,target_id.ilike.%${cleanFile}%,target_id.ilike.%${rawClean}%,document_title.ilike.%${cleanBase}%`)
      .limit(1)
      .maybeSingle();

    if (pdfLog) {
      return { found: true, source: 'pdf_download_logs', data: pdfLog };
    }

    // 2. Cek di tabel audit_logs khusus aksi UNDUH_PDF_BER_QR
    const { data: auditLog } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('action', 'UNDUH_PDF_BER_QR')
      .or(`verification_code.ilike.%${rawClean}%,target_id.ilike.%${cleanFile}%,details.ilike.%${cleanFile}%,details.ilike.%${cleanBase}%`)
      .limit(1)
      .maybeSingle();

    if (auditLog && auditLog.verification_code) {
      return { found: true, source: 'audit_logs', data: auditLog };
    }

    // 3. Cek di tabel users untuk QR Code atau identitas pejabat
    const { data: userMatch } = await supabase
      .from('users')
      .select('id, username, full_name, role, nip, signature_url, qr_code_url')
      .or(`id.ilike.%${rawClean}%,full_name.ilike.%${rawClean}%,username.ilike.%${rawClean}%`)
      .limit(1)
      .maybeSingle();

    if (userMatch && userMatch.signature_url) {
      return { 
        found: true, 
        source: 'users', 
        data: { 
          user: userMatch.full_name, 
          role: userMatch.role, 
          signatory_name: userMatch.full_name, 
          signatory_role: userMatch.role, 
          signatory_nip: userMatch.nip,
          signature_url: userMatch.signature_url,
          qr_code_url: userMatch.qr_code_url
        } 
      };
    }

    return { found: false, source: 'not_found' };
  } catch (e) {
    console.warn('Gagal verifikasi dari Supabase:', e);
    return { found: false, source: 'not_found' };
  }
}
