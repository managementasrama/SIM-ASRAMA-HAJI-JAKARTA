import { 
  User, 
  Room, 
  Transaction, 
  Maintenance, 
  AuditLog, 
  WorkSession, 
  QcInspection, 
  ChatChannel, 
  ChatMessage, 
  BreakfastMenuItem, 
  BreakfastOrder,
  Building,
  MeetingRoom,
  PasswordResetRequest,
  RoomCapacityRate
} from '../types';
import { 
  initialUsers, 
  getInitialRooms, 
  initialTransactions, 
  initialMaintenances, 
  initialAuditLogs, 
  initialWorkSessions, 
  initialQcInspections,
  initialBreakfastMenuItems,
  getInitialBreakfastOrders,
  initialBuildings,
  initialMeetingRooms,
  initialRoomCapacityRates,
  findRoomRate
} from '../data';
import { initialChatChannels, initialChatMessages } from '../chatData';
import { normalizeBuildingName, deduplicateRoomCapacityRates, getRoomBuildingKey, deduplicateRoomsByBuildingAndNumber } from '../lib/utils';
import { OFFICIAL_APP_LOGO } from '../officialLogo';
import { 
  supabase, 
  syncFullDatabaseToSupabase, 
  fetchFullDatabaseFromSupabase, 
  testSupabaseConnection, 
  updateTransactionInSupabaseDirect,
  updateRoomInSupabaseDirect,
  updateUserInSupabaseDirect,
  updateMeetingRoomInSupabaseDirect,
  updateMaintenanceInSupabaseDirect,
  updateBuildingInSupabaseDirect,
  updateRoomCapacityRateInSupabaseDirect,
  deleteRoomInSupabaseDirect,
  deleteBuildingInSupabaseDirect,
  deleteMeetingRoomInSupabaseDirect,
  deleteTransactionInSupabaseDirect,
  deleteUserInSupabaseDirect,
  deleteRoomCapacityRateInSupabaseDirect,
  deleteMaintenanceInSupabaseDirect,
  deleteQcInspectionInSupabaseDirect,
  deleteBreakfastOrderInSupabaseDirect,
  deleteBreakfastMenuItemInSupabaseDirect,
  clearAuditLogsInSupabaseDirect,
  clearWorkSessionsInSupabaseDirect,
  upsertWorkSessionInSupabaseDirect,
  upsertChatMessageInSupabaseDirect,
  clearChatMessagesInSupabaseDirect,
  type SupabaseSyncState 
} from '../lib/supabase';

export type StorageNamespace = 'LOCAL' | 'PROD' | 'DEMO';

export const LOCAL_STORAGE_KEY = 'UPT_ASRAMA_HAJI_DATABASE_V5_CLEAN';
export const LOCAL_STORAGE_BACKUP_KEY = 'UPT_ASRAMA_HAJI_BACKUP_V5_CLEAN';
export const LEGACY_STORAGE_KEYS = [
  'UPT_ASRAMA_HAJI_DATABASE_V4_CLEAN',
  'UPT_ASRAMA_HAJI_AUTO_BACKUP_LATEST',
  'UPT_ASRAMA_HAJI_DATABASE_V3_CLEAN',
  'UPT_ASRAMA_HAJI_LOCAL_DATABASE_V1',
  'UPT_ASRAMA_HAJI_DATABASE_V2',
  'UPT_ASRAMA_HAJI_LOCAL_DATABASE_V2'
];

export interface AppSettings {
  organizationName: string;
  subTitle: string;
  ministryName: string;
  address: string;
  phone: string;
  email: string;
  portalUrl: string;
  appLogo?: string;
  appFavicon?: string;
  tagTitle?: string;
  updatedAt?: string;
}

export interface CompleteStorageDatabase {
  schemaVersion: number;
  appName: string;
  exportedAt: string;
  appSettings: AppSettings;
  users: User[];
  buildings: Building[];
  rooms: Room[];
  meetingRooms: MeetingRoom[];
  transactions: Transaction[];
  maintenances: Maintenance[];
  qcInspections: QcInspection[];
  workSessions: WorkSession[];
  auditLogs: AuditLog[];
  chatChannels: ChatChannel[];
  chatMessages: ChatMessage[];
  breakfastMenuItems: BreakfastMenuItem[];
  breakfastOrders: BreakfastOrder[];
  roomCapacityRates: RoomCapacityRate[];
  passwordResetRequests?: PasswordResetRequest[];
}

function getMinistryPngLogo(): string {
  return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><circle cx="150" cy="150" r="146" fill="%23111827" stroke="%23fbbf24" stroke-width="6"/><circle cx="150" cy="150" r="138" fill="%23ffffff" stroke="%23fbbf24" stroke-width="2"/><circle cx="150" cy="150" r="92" fill="%23111827" stroke="%23fbbf24" stroke-width="3"/><g fill="%23fbbf24"><polygon points="38,150 41,157 49,157 43,161 45,168 38,164 31,168 33,161 27,157 35,157" transform="translate(0, -10) scale(1.2)"/><polygon points="38,150 41,157 49,157 43,161 45,168 38,164 31,168 33,161 27,157 35,157" transform="translate(224, -10) scale(1.2)"/></g><defs><path id="topArc" d="M 28,150 A 122,122 0 0,1 272,150" fill="none"/><path id="botArc" d="M 272,150 A 122,122 0 0,1 28,150" fill="none"/></defs><text fill="%23111827" font-family="Arial, sans-serif" font-size="15" font-weight="900" letter-spacing="1.5"><textPath href="%23topArc" startOffset="50%" text-anchor="middle">KEMENTERIAN HAJI DAN UMRAH</textPath></text><text fill="%23111827" font-family="Arial, sans-serif" font-size="15" font-weight="900" letter-spacing="2"><textPath href="%23botArc" startOffset="50%" text-anchor="middle">REPUBLIK INDONESIA</textPath></text><g transform="translate(150, 150) scale(1.4)"><path d="M 0,-32 C -12,-35 -35,-25 -45,-5 C -50,5 -42,18 -30,22 C -38,12 -35,-2 -25,-12 C -15,-20 -5,-25 0,-28 C 5,-25 15,-20 25,-12 C 35,-2 38,12 30,22 C 42,18 50,5 45,-5 C 35,-25 12,-35 0,-32 Z" fill="%23fbbf24"/><path d="M 0,-34 C -4,-34 -8,-32 -9,-28 C -10,-24 -6,-21 -4,-21 C -2,-21 -3,-26 0,-27 C 3,-26 2,-21 4,-21 C 6,-21 10,-24 9,-28 C 8,-32 4,-34 0,-34 Z" fill="%23fbbf24"/><rect x="-12" y="-14" width="24" height="26" rx="2" fill="%23111827" stroke="%23fbbf24" stroke-width="1.5"/><rect x="-12" y="-14" width="12" height="13" fill="%23dc2626"/><rect x="0" y="-14" width="12" height="13" fill="%23ffffff"/><rect x="-12" y="-1" width="12" height="13" fill="%23ffffff"/><rect x="0" y="-1" width="12" height="13" fill="%23dc2626"/><polygon points="0,-4 1,-1 4,-1 2,1 3,4 0,2 -3,4 -2,1 -4,-1 -1,-1" fill="%23fbbf24" transform="scale(0.8) translate(0, 1)"/><path d="M -16,16 C -10,13 10,13 16,16 C 12,20 -12,20 -16,16 Z" fill="%23ffffff" stroke="%23fbbf24" stroke-width="0.8"/></g></svg>';
}

export const defaultAppSettings: AppSettings = {
  organizationName: 'ASRAMA HAJI JAKARTA',
  subTitle: 'SIM - Sistem Informasi Manajemen',
  ministryName: 'KEMENTERIAN HAJI DAN UMRAH REPUBLIK INDONESIA',
  address: 'Jl. Raya Pd. Gede, RT.1/RW.1, Pinang Ranti, Kec. Makasar, Kota Jakarta Timur, Daerah Khusus Ibukota Jakarta 13560, Indonesia.',
  phone: '0816243154',
  email: 'info@asramahajijakarta.id',
  portalUrl: 'https://asramahajijakarta.id',
  appLogo: OFFICIAL_APP_LOGO,
  appFavicon: '/logo.png',
  tagTitle: 'SIM - Asrama Haji Jakarta'
};

export function generateInitialDatabase(onlyAdmin: boolean = false): CompleteStorageDatabase {
  const usersList = onlyAdmin
    ? initialUsers.filter(u => u.role === 'Super Admin' || u.role === 'Admin' || u.username.toLowerCase() === 'superadmin' || u.username.toLowerCase() === 'admin')
    : [...initialUsers];

  return {
    schemaVersion: 4,
    appName: 'SIM-Akomodasi UPT Asrama Haji Jakarta',
    exportedAt: new Date().toISOString(),
    appSettings: { ...defaultAppSettings },
    users: usersList,
    buildings: [...initialBuildings],
    meetingRooms: [...initialMeetingRooms],
    rooms: getInitialRooms(),
    transactions: [],
    maintenances: [],
    qcInspections: [],
    workSessions: [],
    auditLogs: [],
    chatChannels: [...initialChatChannels],
    chatMessages: [],
    breakfastMenuItems: [...initialBreakfastMenuItems],
    breakfastOrders: [],
    roomCapacityRates: [...initialRoomCapacityRates],
    passwordResetRequests: []
  };
}

export class DataStorageService {
  private cache: CompleteStorageDatabase | null = null;
  private lastSyncTime: string | null = null;
  private syncStatus: 'idle' | 'syncing' | 'connected' | 'error' = 'idle';
  private syncError: string | null = null;
  private syncDebounceTimer: any = null;
  private hasHydratedFromCloud: boolean = false;
  private pendingSyncDb: CompleteStorageDatabase | null = null;
  private syncListeners: Array<(event: { status: 'syncing' | 'connected' | 'error'; db: CompleteStorageDatabase; error?: string | null }) => void> = [];

  constructor() {
    // Hapus seluruh kunci penyimpanan lokal (tidak ada cache lokal database)
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(LOCAL_STORAGE_KEY);
        window.localStorage.removeItem(LOCAL_STORAGE_BACKUP_KEY);
        for (const oldKey of LEGACY_STORAGE_KEYS) {
          window.localStorage.removeItem(oldKey);
        }
      } catch (_) {}
    }
    this.getDatabase();
    // Inisialisasi pengecekan koneksi Supabase di background
    this.checkInitialSupabaseConnection();
  }

  public onSyncEvent(listener: (event: { status: 'syncing' | 'connected' | 'error'; db: CompleteStorageDatabase; error?: string | null }) => void): () => void {
    this.syncListeners.push(listener);
    return () => {
      this.syncListeners = this.syncListeners.filter(l => l !== listener);
    };
  }

  public subscribeSync(listener: (event: { status: 'syncing' | 'connected' | 'error'; db: CompleteStorageDatabase; error?: string | null }) => void): () => void {
    return this.onSyncEvent(listener);
  }

  private notifySyncListeners(event: { status: 'syncing' | 'connected' | 'error'; db: CompleteStorageDatabase; error?: string | null }) {
    this.syncListeners.forEach(listener => {
      try {
        listener(event);
      } catch (e) {
        console.warn('Sync listener error:', e);
      }
    });
  }

  public hasPendingSync(): boolean {
    return Boolean(this.syncDebounceTimer || this.pendingSyncDb);
  }

  public async flushPendingSync(): Promise<{ success: boolean; error?: string }> {
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
      this.syncDebounceTimer = null;
    }
    const dbToPush = this.pendingSyncDb || this.getDatabase();
    this.pendingSyncDb = null;
    return this.pushAllToSupabase(dbToPush);
  }

  private async checkInitialSupabaseConnection() {
    try {
      const res = await testSupabaseConnection();
      if (res.success) {
        this.syncStatus = 'connected';
        if (!this.lastSyncTime) {
          this.lastSyncTime = new Date().toISOString();
        }
      } else {
        this.syncStatus = 'error';
        this.syncError = res.message;
      }
    } catch (_) {}
  }

  public getNamespace(): StorageNamespace {
    return 'LOCAL';
  }

  public isProd(): boolean {
    return false;
  }

  public isDemo(): boolean {
    return false;
  }

  public getLastSyncTime(): string | null {
    return this.lastSyncTime;
  }

  public getSupabaseSyncState(): SupabaseSyncState {
    return {
      status: this.syncStatus,
      lastSyncTime: this.lastSyncTime,
      errorMessage: this.syncError,
      isConfigured: true,
      isSyncing: this.syncStatus === 'syncing',
      lastSyncedAt: this.lastSyncTime,
      lastError: this.syncError
    };
  }

  /**
   * Hidrasi data terbaru dari Supabase Cloud saat aplikasi dibuka secara aman (non-destructive)
   * Jika forceCloudOverwrite = true, maka seluruh data dari Database Pusat (Supabase) akan menjadi acuan utama.
   */
  public async hydrateFromSupabase(_forceCloudOverwrite: boolean = false): Promise<CompleteStorageDatabase | null> {
    try {
      this.syncStatus = 'syncing';
      const cloudDb = await fetchFullDatabaseFromSupabase();
      if (cloudDb) {
        // Pertahankan sesi aktif & pesan chat yang baru saja dibuat di memori lokal namun belum masuk snapshot cloud
        if (this.cache) {
          const wsMap = new Map<string, WorkSession>();
          for (const s of (cloudDb.workSessions || [])) {
            if (s && s.id) wsMap.set(s.id, s);
          }
          for (const s of (this.cache.workSessions || [])) {
            if (!s || !s.id) continue;
            const remoteS = wsMap.get(s.id);
            if (!remoteS) {
              // Hanya pertahankan jika sesi masih baru/aktif
              if (s.status === 'AKTIF') wsMap.set(s.id, s);
            } else if (s.status === 'SELESAI' && remoteS.status !== 'SELESAI') {
              wsMap.set(s.id, s);
            } else if (remoteS.status === 'SELESAI' && s.status !== 'SELESAI') {
              wsMap.set(s.id, remoteS);
            } else if ((s.durationSeconds || 0) > (remoteS.durationSeconds || 0)) {
              wsMap.set(s.id, { ...remoteS, ...s });
            }
          }
          cloudDb.workSessions = Array.from(wsMap.values()).sort((a, b) => (b.loginTime || '').localeCompare(a.loginTime || ''));

          const chMap = new Map<string, ChatChannel>();
          for (const ch of initialChatChannels) chMap.set(ch.id, { ...ch });
          for (const ch of (this.cache.chatChannels || [])) {
            if (ch && ch.id) chMap.set(ch.id, { ...(chMap.get(ch.id) || {}), ...ch });
          }
          for (const ch of (cloudDb.chatChannels || [])) {
            if (ch && ch.id) chMap.set(ch.id, { ...(chMap.get(ch.id) || {}), ...ch });
          }
          cloudDb.chatChannels = Array.from(chMap.values());

          const msgMap = new Map<string, ChatMessage>();
          for (const m of (this.cache.chatMessages || [])) {
            if (m && m.id) msgMap.set(m.id, m);
          }
          for (const m of (cloudDb.chatMessages || [])) {
            if (!m || !m.id) continue;
            const prev = msgMap.get(m.id);
            if (!prev) {
              msgMap.set(m.id, m);
            } else {
              const readSet = new Set([...(prev.readBy || []), ...(m.readBy || [])]);
              msgMap.set(m.id, { ...prev, ...m, readBy: Array.from(readSet) });
            }
          }
          cloudDb.chatMessages = Array.from(msgMap.values());
        }

        this.cache = cloudDb;
        this.lastSyncTime = new Date().toISOString();
        this.syncStatus = 'connected';
        this.syncError = null;
        this.hasHydratedFromCloud = true;
        return cloudDb;
      }
      this.syncStatus = 'connected';
      this.hasHydratedFromCloud = true;
      return null;
    } catch (err: any) {
      this.syncStatus = 'error';
      this.syncError = err?.message || 'Gagal mengambil data dari Supabase';
      return null;
    }
  }

  /**
   * Penggabungan cerdas antara database lokal dan cloud (prioritas data termutakhir)
   */
  public mergeDatabases(local: CompleteStorageDatabase, cloud: CompleteStorageDatabase, _preferCloud: boolean = false): CompleteStorageDatabase {
    // Utamakan data lokal (hasil edit pengguna) agar perubahan tidak pernah tertimpa oleh cloud.
    
    // 1. Transactions (Local wins over cloud)
    const txMap = new Map<string, Transaction>();
    (cloud.transactions || []).forEach(t => { if (t && t.id) txMap.set(t.id, t); });
    (local.transactions || []).forEach(t => { if (t && t.id) txMap.set(t.id, t); });
    const mergedTransactions = Array.from(txMap.values());

    // 2. Users
    const userMap = new Map<string, User>();
    (cloud.users || []).forEach(u => { if (u && u.id) userMap.set(u.id, u); });
    (local.users || []).forEach(u => { if (u && u.id) userMap.set(u.id, u); });
    const mergedUsers = Array.from(userMap.values());

    // 3. Maintenances
    const maintMap = new Map<string, Maintenance>();
    (cloud.maintenances || []).forEach(m => { if (m && m.id) maintMap.set(m.id, m); });
    (local.maintenances || []).forEach(m => { if (m && m.id) maintMap.set(m.id, m); });
    const mergedMaintenances = Array.from(maintMap.values());

    // 4. QC Inspections
    const qcMap = new Map<string, QcInspection>();
    (cloud.qcInspections || []).forEach(q => { if (q && q.id) qcMap.set(q.id, q); });
    (local.qcInspections || []).forEach(q => { if (q && q.id) qcMap.set(q.id, q); });
    const mergedQc = Array.from(qcMap.values());

    // 5. Breakfast Orders
    const bOrdersMap = new Map<string, BreakfastOrder>();
    (cloud.breakfastOrders || []).forEach(o => { if (o && o.id) bOrdersMap.set(o.id, o); });
    (local.breakfastOrders || []).forEach(o => { if (o && o.id) bOrdersMap.set(o.id, o); });
    const mergedBreakfastOrders = Array.from(bOrdersMap.values());

    // 6. Meeting Rooms
    const mrMap = new Map<string, MeetingRoom>();
    (cloud.meetingRooms || []).forEach(m => { if (m && m.id) mrMap.set(m.id, m); });
    (local.meetingRooms || []).forEach(m => { if (m && m.id) mrMap.set(m.id, m); });
    const mergedMeetingRooms = Array.from(mrMap.values());

    // 7. Buildings (Prioritaskan mutlak local agar edit nama gedung tidak pernah revert)
    const bldByIdMap = new Map<string, Building>();
    (cloud.buildings || []).forEach(b => {
      if (!b || !b.name) return;
      const normName = normalizeBuildingName(b.name);
      if (!normName || normName === 'Ruang Pertemuan' || normName === 'Ruang Pertemuan / Aula' || normName === 'Gedung Serbaguna (SG)' || b.id === 'bld-5') return;
      const idKey = b.id ? String(b.id).trim() : normName.toLowerCase();
      bldByIdMap.set(idKey, { ...b, name: normName });
    });
    (local.buildings || []).forEach(b => {
      if (!b || !b.name) return;
      const normName = normalizeBuildingName(b.name);
      if (!normName || normName === 'Ruang Pertemuan' || normName === 'Ruang Pertemuan / Aula' || normName === 'Gedung Serbaguna (SG)' || b.id === 'bld-5') return;
      const idKey = b.id ? String(b.id).trim() : normName.toLowerCase();
      // Local wins unconditionally
      bldByIdMap.set(idKey, { ...b, name: normName });
    });
    const bldByNameMap = new Map<string, Building>();
    Array.from(bldByIdMap.values()).forEach(b => {
      bldByNameMap.set(b.name.toLowerCase(), b);
    });
    let mergedBuildings = Array.from(bldByNameMap.values());

    // 8. Rooms (Prioritaskan local rooms)
    const roomMap = new Map<string, Room>();
    (cloud.rooms || []).forEach(r => { if (r && r.id) roomMap.set(r.id, r); });
    (local.rooms || []).forEach(r => { if (r && r.id) roomMap.set(r.id, r); });
    const normalizedSourceRooms = Array.from(roomMap.values())
      .filter(r => r && r.id)
      .map(r => ({
        ...r,
        building: getRoomBuildingKey(r, mergedMeetingRooms)
      }));
    const mergedRooms = deduplicateRoomsByBuildingAndNumber(normalizedSourceRooms, mergedMeetingRooms);

    // Selaraskan totalRooms pada gedung dengan jumlah kamar riil hasil deduplikasi
    mergedBuildings = mergedBuildings.map(b => {
      if (b.category === 'SERBAGUNA' || b.category === 'RUANG_PERTEMUAN') {
        return { ...b, totalRooms: 0 };
      }
      const actualCount = mergedRooms.filter(r =>
        getRoomBuildingKey(r, mergedMeetingRooms).toLowerCase() === b.name.toLowerCase() ||
        (r.building && r.building.toLowerCase() === b.name.toLowerCase())
      ).length;
      return { ...b, totalRooms: actualCount };
    });

    // 9. Room Capacity Rates
    const rateMap = new Map<string, RoomCapacityRate>();
    (cloud.roomCapacityRates || []).forEach(r => { if (r && r.id) rateMap.set(r.id, r); });
    (local.roomCapacityRates || []).forEach(r => { if (r && r.id) rateMap.set(r.id, r); });
    const mergedRates = Array.from(rateMap.values());

    // appSettings: Utamakan local appSettings jika ada perubahan
    const localSettings = local.appSettings || defaultAppSettings;
    const cloudSettings = cloud.appSettings || defaultAppSettings;
    
    const mergedAppSettings: AppSettings = {
      ...defaultAppSettings,
      ...cloudSettings,
      ...localSettings
    };

    if (localSettings.appLogo && localSettings.appLogo.length > 20) {
      mergedAppSettings.appLogo = localSettings.appLogo;
    } else if (cloudSettings.appLogo && cloudSettings.appLogo.length > 20) {
      mergedAppSettings.appLogo = cloudSettings.appLogo;
    } else {
      mergedAppSettings.appLogo = OFFICIAL_APP_LOGO;
    }

    return {
      schemaVersion: 4,
      appName: local.appName || cloud.appName || 'SIM Asrama Haji Jakarta',
      exportedAt: new Date().toISOString(),
      appSettings: mergedAppSettings,
      users: mergedUsers,
      buildings: mergedBuildings,
      meetingRooms: mergedMeetingRooms,
      rooms: mergedRooms,
      transactions: mergedTransactions,
      maintenances: mergedMaintenances,
      qcInspections: mergedQc,
      workSessions: local.workSessions && local.workSessions.length > 0 ? local.workSessions : (cloud.workSessions || []),
      auditLogs: [...(local.auditLogs || []), ...(cloud.auditLogs || [])].slice(0, 250),
      chatChannels: local.chatChannels && local.chatChannels.length > 0 ? local.chatChannels : (cloud.chatChannels || []),
      chatMessages: local.chatMessages && local.chatMessages.length > 0 ? local.chatMessages : (cloud.chatMessages || []),
      breakfastMenuItems: local.breakfastMenuItems && local.breakfastMenuItems.length > 0 ? local.breakfastMenuItems : (cloud.breakfastMenuItems || []),
      breakfastOrders: mergedBreakfastOrders,
      roomCapacityRates: mergedRates.length > 0 ? deduplicateRoomCapacityRates(mergedRates) : (local.roomCapacityRates || cloud.roomCapacityRates || []),
      passwordResetRequests: local.passwordResetRequests || cloud.passwordResetRequests || []
    };
  }

  /**
   * Pindai dan pulihkan data HANYA jika dipanggil secara eksplisit oleh pengguna.
   * Tidak pernah memulihkan data secara otomatis di latar belakang agar data yang sengaja
   * dihapus oleh pengguna tidak bangkit kembali.
   */
  public tryRecoverLostData(): { recovered: boolean; message: string; recoveredDb?: CompleteStorageDatabase } {
    return { recovered: false, message: 'Pemulihan otomatis dinonaktifkan agar data yang dihapus tetap terhapus secara permanen.' };
  }

  public async hydrateFromServer(_ns?: any): Promise<CompleteStorageDatabase | null> {
    return this.hydrateFromSupabase();
  }

  /**
   * Sinkronisasi paksa ke Supabase
   */
  public async pushAllToSupabase(customDb?: CompleteStorageDatabase): Promise<{ success: boolean; error?: string }> {
    const db = customDb || this.getDatabase();
    this.syncStatus = 'syncing';
    this.notifySyncListeners({ status: 'syncing', db });
    const res = await syncFullDatabaseToSupabase(db);
    if (res.success) {
      this.syncStatus = 'connected';
      this.lastSyncTime = new Date().toISOString();
      this.syncError = null;
      this.notifySyncListeners({ status: 'connected', db });
    } else {
      this.syncStatus = 'error';
      this.syncError = res.error || 'Gagal push ke Supabase';
      this.notifySyncListeners({ status: 'error', db, error: this.syncError });
    }
    return res;
  }

  /**
   * Mengirim data ke Supabase secara instan (langsung detik itu juga / 0ms delay) setiap ada perubahan
   */
  private triggerSupabaseSync(db: CompleteStorageDatabase) {
    this.pendingSyncDb = db;
    this.syncStatus = 'syncing';
    this.notifySyncListeners({ status: 'syncing', db });

    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
      this.syncDebounceTimer = null;
    }

    const payload = this.pendingSyncDb || db;
    this.pendingSyncDb = null;

    (async () => {
      try {
        this.syncStatus = 'syncing';
        const res = await syncFullDatabaseToSupabase(payload);
        if (res.success) {
          this.syncStatus = 'connected';
          this.lastSyncTime = new Date().toISOString();
          this.syncError = null;
          this.notifySyncListeners({ status: 'connected', db: payload });
        } else {
          this.syncStatus = 'error';
          this.syncError = res.error || 'Koneksi Supabase terputus';
          this.notifySyncListeners({ status: 'error', db: payload, error: this.syncError });
        }
      } catch (err: any) {
        this.syncStatus = 'error';
        this.syncError = err?.message || 'Sync error';
        this.notifySyncListeners({ status: 'error', db: payload, error: this.syncError });
      }
    })();
  }

  public setNamespace(_ns: any): CompleteStorageDatabase {
    return this.getDatabase();
  }

  public getStorageKey(): string {
    return LOCAL_STORAGE_KEY;
  }

  public getDatabase(_ns?: any): CompleteStorageDatabase {
    if (this.cache) {
      return this.cache;
    }

    const initDb = generateInitialDatabase(false);
    this.cache = initDb;
    return initDb;
  }

  public saveDatabase(db: CompleteStorageDatabase, options?: { skipCloudSync?: boolean } | any): void {
    // Hormati array audit logs yang diteruskan, jangan pernah membangkitkan log yang sengaja dihapus/dikosongkan
    const trimmedAuditLogs = Array.isArray(db.auditLogs)
      ? db.auditLogs.slice(0, 250)
      : (this.cache?.auditLogs || []).slice(0, 250);

    // Batasi chatMessages maksimal 300 terbaru
    const trimmedChatMessages = Array.isArray(db.chatMessages) ? db.chatMessages.slice(-300) : [];

    // Deduplikasi rooms & meetingRooms secara ketat untuk mencegah React non-unique key warning
    const uniqueRooms: Room[] = [];
    const seenRoomIds = new Set<string>();
    (db.rooms || []).forEach(r => {
      if (r && r.id && !seenRoomIds.has(r.id)) {
        seenRoomIds.add(r.id);
        uniqueRooms.push(r);
      }
    });

    const uniqueMeetingRooms: MeetingRoom[] = [];
    const seenMRIds = new Set<string>();
    (db.meetingRooms || []).forEach(m => {
      if (m && m.id && !seenMRIds.has(m.id)) {
        seenMRIds.add(m.id);
        uniqueMeetingRooms.push(m);
      }
    });

    const updated: CompleteStorageDatabase = {
      ...db,
      rooms: uniqueRooms,
      meetingRooms: uniqueMeetingRooms,
      auditLogs: trimmedAuditLogs,
      chatMessages: trimmedChatMessages,
      schemaVersion: 4,
      users: db.users || [],
      exportedAt: new Date().toISOString()
    };

    this.cache = updated;

    // Sinkronisasi langsung detik itu juga (real-time) ke Database Supabase (tanpa penyimpanan cache lokal)
    const shouldSkipCloud = Boolean(options && typeof options === 'object' && options.skipCloudSync);
    if (!shouldSkipCloud) {
      this.triggerSupabaseSync(updated);
    }
  }

  // ==========================================
  // MANAJEMEN PENGGUNA (CRUD)
  // ==========================================
  public getUsers(): User[] {
    return this.getDatabase().users;
  }

  public getUserById(id: string): User | undefined {
    return this.getDatabase().users.find(u => u.id === id);
  }

  public getUserByUsername(username: string): User | undefined {
    return this.getDatabase().users.find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  public saveUser(user: User): User {
    const db = this.getDatabase();
    const existingIndex = db.users.findIndex(u => u.id === user.id);
    let updatedUsers: User[];

    if (existingIndex >= 0) {
      updatedUsers = [...db.users];
      updatedUsers[existingIndex] = { ...updatedUsers[existingIndex], ...user };
    } else {
      updatedUsers = [user, ...db.users];
    }

    this.saveDatabase({ ...db, users: updatedUsers });
    return user;
  }

  public updateUser(userId: string, updates: Partial<User>): User | null {
    const db = this.getDatabase();
    const idx = db.users.findIndex(u => u.id === userId);
    if (idx === -1) return null;

    const updatedUser = { ...db.users[idx], ...updates };
    const newUsers = [...db.users];
    newUsers[idx] = updatedUser;

    this.saveDatabase({ ...db, users: newUsers });
    updateUserInSupabaseDirect(updatedUser).then(res => {
      if (!res.success) console.warn('Gagal update user ke Supabase:', res.error);
      else this.hydrateFromSupabase(true).catch(() => {});
    }).catch(err => console.warn('Supabase update user error:', err));
    return updatedUser;
  }

  public toggleUserStatus(userId: string): User | null {
    const db = this.getDatabase();
    const idx = db.users.findIndex(u => u.id === userId);
    if (idx === -1) return null;

    const currentStatus = db.users[idx].status;
    const newStatus = currentStatus === 'Aktif' ? 'Non-Aktif' : 'Aktif';
    const updatedUser = { ...db.users[idx], status: newStatus };

    const newUsers = [...db.users];
    newUsers[idx] = updatedUser;

    this.saveDatabase({ ...db, users: newUsers });
    return updatedUser;
  }

  public deleteUser(userId: string): boolean {
    const db = this.getDatabase();
    const initialLen = db.users.length;
    const newUsers = db.users.filter(u => u.id !== userId);

    if (newUsers.length === initialLen) return false;

    this.saveDatabase({ ...db, users: newUsers });
    deleteUserInSupabaseDirect(userId).catch(err => console.warn('Supabase delete user err:', err));
    return true;
  }

  // ==========================================
  // MANAJEMEN MASTER GEDUNG (BUILDINGS CRUD)
  // ==========================================
  public getBuildings(): Building[] {
    return this.getDatabase().buildings || [];
  }

  public saveBuilding(building: Building, previousBuildingName?: string): Building {
    const db = this.getDatabase();
    const buildings = db.buildings || [];
    const normalizedInputName = normalizeBuildingName(building.name);
    const buildingWithId: Building = {
      ...building,
      name: normalizedInputName || building.name.trim(),
      code: (building.code || '').trim().toUpperCase(),
      id: building.id && building.id.trim() !== '' ? building.id.trim() : `bld-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
    };

    // Cari gedung berdasarkan ID, atau fallback ke nama gedung sebelumnya agar edit nama tidak pernah menambah gedung baru
    let idx = buildings.findIndex(b => b.id === buildingWithId.id);
    if (idx < 0 && previousBuildingName) {
      const prevNorm = normalizeBuildingName(previousBuildingName).toLowerCase();
      idx = buildings.findIndex(b => 
        b.name.trim().toLowerCase() === previousBuildingName.trim().toLowerCase() ||
        normalizeBuildingName(b.name).toLowerCase() === prevNorm
      );
    }

    let updatedBuildings: Building[];
    let rooms = deduplicateRoomsByBuildingAndNumber(db.rooms || [], db.meetingRooms);
    let transactions = db.transactions || [];
    let maintenances = db.maintenances || [];
    let qcInspections = db.qcInspections || [];
    let users = db.users || [];
    let meetingRooms = db.meetingRooms || [];

    if (idx >= 0) {
      const oldBuilding = buildings[idx];
      const oldName = oldBuilding.name.trim();
      const oldNormName = normalizeBuildingName(oldName);
      const newName = buildingWithId.name.trim();
      const oldCode = (oldBuilding.code || '').trim().toUpperCase();
      const newCode = (buildingWithId.code || '').trim().toUpperCase();

      // Pastikan ID gedung tetap konsisten dengan record yang diedit
      buildingWithId.id = oldBuilding.id;
      updatedBuildings = [...buildings];
      updatedBuildings[idx] = { ...updatedBuildings[idx], ...buildingWithId };

      const isMatchingOldBuilding = (bName?: string, rObj?: Room) => {
        const cleanB = (bName || '').trim().toLowerCase();
        if (cleanB === oldName.toLowerCase() || cleanB === oldNormName.toLowerCase()) return true;
        if (normalizeBuildingName(bName || '').toLowerCase() === oldNormName.toLowerCase()) return true;
        if (rObj) {
          const eff = getRoomBuildingKey(rObj, meetingRooms).toLowerCase();
          if (eff === oldName.toLowerCase() || eff === oldNormName.toLowerCase()) return true;
        }
        return false;
      };

      // Map perubahan nomor kamar jika kode gedung juga diubah
      const renamedRoomNumMap = new Map<string, string>();

      // Jika nama gedung atau kode gedung berubah, sinkronkan semua kamar, transaksi, perawatan, qc, meeting rooms, dan pengguna!
      if (oldName.toLowerCase() !== newName.toLowerCase() || oldName !== newName || (oldCode && newCode && oldCode !== newCode)) {
        rooms = rooms.map(r => {
          if (isMatchingOldBuilding(r.building, r)) {
            let updatedRoomNum = r.roomNumber;
            if (oldCode && newCode && oldCode !== newCode) {
              const upperNum = (r.roomNumber || '').trim().toUpperCase();
              if (upperNum.startsWith(`${oldCode}-`)) {
                updatedRoomNum = `${newCode}-${r.roomNumber.trim().slice(oldCode.length + 1)}`;
                renamedRoomNumMap.set(r.roomNumber, updatedRoomNum);
              }
            }
            return { ...r, building: newName, roomNumber: updatedRoomNum };
          }
          return r;
        });

        meetingRooms = meetingRooms.map(m =>
          isMatchingOldBuilding(m.building) || m.name.trim().toLowerCase() === oldName.toLowerCase()
            ? {
                ...m,
                building: newName,
                name: m.name.trim().toLowerCase() === oldName.toLowerCase() ? newName : m.name
              }
            : m
        );

        transactions = transactions.map(t => {
          if (isMatchingOldBuilding(t.building)) {
            const newRoomNum = renamedRoomNumMap.get(t.roomNumber) || t.roomNumber;
            const newAlloc = Array.isArray(t.allocatedRoomNumbers)
              ? t.allocatedRoomNumbers.map(num => renamedRoomNumMap.get(num) || num)
              : t.allocatedRoomNumbers;
            return { ...t, building: newName, roomNumber: newRoomNum, allocatedRoomNumbers: newAlloc };
          }
          return t;
        });

        maintenances = maintenances.map(m => {
          if (isMatchingOldBuilding(m.building)) {
            return { ...m, building: newName, roomNumber: renamedRoomNumMap.get(m.roomNumber) || m.roomNumber };
          }
          return m;
        });

        qcInspections = qcInspections.map(q => {
          if (isMatchingOldBuilding(q.building)) {
            return { ...q, building: newName, roomNumber: renamedRoomNumMap.get(q.roomNumber) || q.roomNumber };
          }
          return q;
        });

        users = users.map(u =>
          isMatchingOldBuilding(u.assignedBuilding) ? { ...u, assignedBuilding: newName } : u
        );
      }

      // Hapus gedung duplikat jika ada entry lain dengan nama lama atau nama baru yang sama
      updatedBuildings = updatedBuildings.filter((b, i) => {
        if (i === idx) return true;
        const bLower = b.name.trim().toLowerCase();
        return bLower !== oldName.toLowerCase() && bLower !== newName.toLowerCase();
      });
      const currentIdx = updatedBuildings.findIndex(b => b.id === buildingWithId.id);

      // Sinkronisasi totalRooms gedung dengan jumlah kamar aktual di denah penyewaan
      const targetBuildingName = newName;
      const isFacilityHall = buildingWithId.category === 'SERBAGUNA' || buildingWithId.category === 'RUANG_PERTEMUAN';

      if (isFacilityHall) {
        rooms = rooms.filter(r =>
          r.building.toLowerCase() !== targetBuildingName.toLowerCase() &&
          !isMatchingOldBuilding(r.building, r)
        );
        if (currentIdx >= 0) {
          updatedBuildings[currentIdx] = {
            ...updatedBuildings[currentIdx],
            totalRooms: 0
          };
        }
      } else {
        const requestedRooms = buildingWithId.totalRooms !== undefined && Number(buildingWithId.totalRooms) >= 0
          ? Number(buildingWithId.totalRooms)
          : 3;

        // Deduplikasi kamar terlebih dahulu agar jumlah kamar di denah akurat
        rooms = deduplicateRoomsByBuildingAndNumber(rooms, meetingRooms);

        // Cari kamar-kamar yang terdaftar untuk gedung ini
        const bldRooms = rooms.filter(r =>
          r.building.trim().toLowerCase() === targetBuildingName.toLowerCase() ||
          getRoomBuildingKey(r, meetingRooms).toLowerCase() === targetBuildingName.toLowerCase()
        );

        if (requestedRooms !== bldRooms.length) {
          if (requestedRooms > bldRooms.length) {
            // Tambahkan kamar baru secara merata antar lantai hingga mencapai requestedRooms
            const diff = requestedRooms - bldRooms.length;
            const bCode = newCode || 'RM';
            const prefix = `${bCode}-`;
            const floors = Math.max(1, Number(buildingWithId.floors) || 1);

            const existingNums = new Set(
              rooms
                .filter(r => r.building.trim().toLowerCase() === targetBuildingName.toLowerCase())
                .map(r => r.roomNumber.trim().toUpperCase())
            );
            const newRooms: Room[] = [];
            const defType = 'Standar';
            const defBed = '4 Single Bed';
            const matchedRate = findRoomRate(defType, defBed, db.roomCapacityRates || initialRoomCapacityRates);
            const defPrice = matchedRate?.pricePerNight || 480000;
            const defCap = `${matchedRate?.capacityPax || 4} Orang`;
            const defFacilities = matchedRate?.facilities || [
              'AC Split Dingin',
              '4 Single Bed',
              'Kamar Mandi Dalam',
              'Water Heater',
              'Linen Bersih UPT',
              'Lemari 4 Pintu'
            ];

            let addedCount = 0;
            let seqInFloor = 1;

            while (addedCount < diff && seqInFloor <= 200) {
              for (let fl = 1; fl <= floors && addedCount < diff; fl++) {
                const roomNum = `${prefix}${fl}${seqInFloor.toString().padStart(2, '0')}`;
                if (!existingNums.has(roomNum.toUpperCase())) {
                  existingNums.add(roomNum.toUpperCase());
                  newRooms.push({
                    id: `room-${Date.now()}-${fl}-${seqInFloor}-${Math.random().toString(36).substr(2, 4)}`,
                    building: targetBuildingName,
                    roomNumber: roomNum,
                    floor: fl,
                    type: defType,
                    bedType: defBed,
                    capacity: defCap,
                    capacityNumber: matchedRate?.capacityPax || 4,
                    pricePerNight: defPrice,
                    facilities: defFacilities,
                    status: 'KOSONG',
                    qcStatus: 'LOLOS_QC',
                    activeTxId: null,
                    activeMaintId: null
                  });
                  addedCount++;
                }
              }
              seqInFloor++;
            }
            rooms = [...rooms, ...newRooms];
          } else {
            // requestedRooms < bldRooms.length: kurangi unit kamar surplus di denah penyewaan
            // Prioritas simpan: kamar yang sedang TERISI / BOOKED / MAINTENANCE tidak dihapus
            const diff = bldRooms.length - requestedRooms;
            const safeRoomsToDelete = [...bldRooms]
              .filter(r =>
                r.status !== 'TERISI' &&
                r.status !== 'BOOKED' &&
                r.status !== 'MAINTENANCE' &&
                !r.activeTxId &&
                !r.activeMaintId
              )
              .sort((a, b) => b.roomNumber.localeCompare(a.roomNumber, undefined, { numeric: true }));

            const toDeleteIds = new Set(
              safeRoomsToDelete
                .slice(0, diff)
                .map(r => r.id)
            );
            rooms = rooms.filter(r => !toDeleteIds.has(r.id));
          }
        }

        const finalBuildingRoomsCount = rooms.filter(r =>
          r.building.trim().toLowerCase() === targetBuildingName.toLowerCase() ||
          getRoomBuildingKey(r, meetingRooms).toLowerCase() === targetBuildingName.toLowerCase()
        ).length;

        if (currentIdx >= 0) {
          let updatedCapDesc = updatedBuildings[currentIdx].capacityDesc || '';
          if (/^\d+\s*Kamar/i.test(updatedCapDesc.trim())) {
            updatedCapDesc = updatedCapDesc.trim().replace(/^\d+/, String(finalBuildingRoomsCount));
          }
          updatedBuildings[currentIdx] = {
            ...updatedBuildings[currentIdx],
            totalRooms: finalBuildingRoomsCount,
            capacityDesc: updatedCapDesc || `${finalBuildingRoomsCount} Kamar Hunian`
          };
        }
      }
    } else {
      const isFacilityHall = buildingWithId.category === 'SERBAGUNA' || buildingWithId.category === 'RUANG_PERTEMUAN';
      
      if (isFacilityHall) {
        // Fasilitas serbaguna/aula tidak memiliki unit-unit kamar tidur
        updatedBuildings = [...buildings, { ...buildingWithId, totalRooms: 0 }];
      } else {
        // Untuk gedung penginapan baru, default kamar (unit) adalah 3
        const requestedRooms = buildingWithId.totalRooms !== undefined && Number(buildingWithId.totalRooms) > 0 
          ? Number(buildingWithId.totalRooms) 
          : 3;
        
        updatedBuildings = [...buildings, { ...buildingWithId, totalRooms: requestedRooms }];

        const floors = Math.max(1, Number(buildingWithId.floors) || 1);
        const roomsPerFloor = Math.ceil(requestedRooms / floors);
        const newRooms: Room[] = [];
        const bCode = buildingWithId.code ? buildingWithId.code.trim().toUpperCase() : '';
        const prefix = bCode ? `${bCode}-` : '';
        let count = 0;
        const defType = 'Standar';
        const defBed = '4 Single Bed';
        const matchedRate = findRoomRate(defType, defBed, db.roomCapacityRates || initialRoomCapacityRates);
        const defPrice = matchedRate?.pricePerNight || 480000;
        const defCap = `${matchedRate?.capacityPax || 4} Orang`;
        const defFacilities = matchedRate?.facilities || [
          'AC Split Dingin',
          '4 Single Bed',
          'Kamar Mandi Dalam',
          'Water Heater',
          'Linen Bersih UPT',
          'Lemari 4 Pintu'
        ];

        for (let f = 1; f <= floors; f++) {
          for (let r = 1; r <= roomsPerFloor && count < requestedRooms; r++) {
            count++;
            const roomNum = `${prefix}${f}${r.toString().padStart(2, '0')}`;
            newRooms.push({
              id: `room-${Date.now()}-${f}-${r}-${Math.random().toString(36).substr(2, 4)}`,
              building: buildingWithId.name,
              roomNumber: roomNum,
              floor: f,
              type: defType,
              bedType: defBed,
              capacity: defCap,
              capacityNumber: matchedRate?.capacityPax || 4,
              pricePerNight: defPrice,
              facilities: defFacilities,
              status: 'KOSONG',
              qcStatus: 'LOLOS_QC',
              activeTxId: null,
              activeMaintId: null
            });
          }
        }
        rooms = [...rooms, ...newRooms];
      }
    }

    // Jika kategori gedung adalah SERBAGUNA atau RUANG_PERTEMUAN, sinkronkan otomatis ke Katalog Ruang Pertemuan (meetingRooms)
    if (buildingWithId.category === 'SERBAGUNA' || buildingWithId.category === 'RUANG_PERTEMUAN') {
      const isSG = buildingWithId.category === 'SERBAGUNA';
      const mrIdx = meetingRooms.findIndex(m => 
        m.id === `mr-${buildingWithId.id}` || 
        m.name.toLowerCase() === buildingWithId.name.toLowerCase() ||
        (m.building && m.building.toLowerCase() === buildingWithId.name.toLowerCase())
      );

      const mrData: MeetingRoom = {
        id: mrIdx >= 0 ? meetingRooms[mrIdx].id : `mr-${buildingWithId.id}`,
        name: buildingWithId.name,
        code: buildingWithId.code || (isSG ? `SG-${Date.now().toString().slice(-4)}` : `AULA-${Date.now().toString().slice(-4)}`),
        category: isSG ? 'SERBAGUNA' : 'AULA',
        building: buildingWithId.name,
        capacity: buildingWithId.capacityDesc || (isSG ? '500 - 1500 Orang' : '300 - 800 Orang'),
        capacityNumber: isSG ? 1000 : 500,
        dailyRate: isSG ? 18000000 : 15000000,
        sessionRate: isSG ? 9500000 : 8500000,
        facilities: [
          'AC Central',
          'Sound System 5000W',
          'Proyektor & Videotron',
          'Kursi VIP & Seminar',
          'Podium Pidato',
          'Ruang Rias & Toilet VIP'
        ],
        description: buildingWithId.description || `${isSG ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan / Aula'} ${buildingWithId.name}`,
        status: buildingWithId.status === 'AKTIF' ? 'TERSEDIA' : 'MAINTENANCE',
        qcStatus: 'LOLOS_QC'
      };

      if (mrIdx >= 0) {
        meetingRooms[mrIdx] = { ...meetingRooms[mrIdx], ...mrData };
      } else {
        meetingRooms = [...meetingRooms, mrData];
      }
    }

    this.saveDatabase({ 
      ...db, 
      buildings: updatedBuildings, 
      rooms, 
      transactions, 
      maintenances, 
      qcInspections, 
      users,
      meetingRooms
    });
    updateBuildingInSupabaseDirect(buildingWithId).then(res => {
      if (!res.success) console.warn('Gagal update building ke Supabase:', res.error);
      else this.hydrateFromSupabase(true).catch(() => {});
    }).catch(err => console.warn('Supabase update building error:', err));
    return buildingWithId;
  }

  public deleteBuilding(buildingId: string): { success: boolean; message: string } {
    const db = this.getDatabase();
    const buildings = db.buildings || [];
    const bld = buildings.find(b => b.id === buildingId);
    if (!bld) {
      return { success: false, message: 'Gedung tidak ditemukan.' };
    }

    // Validasi apakah ada tamu yang sedang aktif (Check-In / Reservasi) di gedung ini
    const rooms = db.rooms || [];
    const bldNameLower = bld.name.trim().toLowerCase();
    const associatedRooms = rooms.filter(r => (r.building || '').trim().toLowerCase() === bldNameLower);
    
    const occupiedRooms = associatedRooms.filter(r => 
      r.status === 'TERISI' || 
      r.status === 'BOOKED' || 
      Boolean(r.activeTxId)
    );

    if (occupiedRooms.length > 0) {
      return { 
        success: false, 
        message: `Tidak dapat menghapus '${bld.name}' karena masih terdapat ${occupiedRooms.length} kamar yang sedang terisi tamu atau terbooking reservasi. Selesaikan transaksi tamu terlebih dahulu.` 
      };
    }

    // Hapus gedung dari daftar master gedung
    const updatedBuildings = buildings.filter(b => b.id !== buildingId);

    // Hapus juga semua unit kamar yang terasosiasi dengan gedung ini agar tidak menjadi data yatim
    const updatedRooms = rooms.filter(r => (r.building || '').trim().toLowerCase() !== bldNameLower);

    // Hapus juga dari meetingRooms jika terdaftar sebagai aula serbaguna
    const updatedMeetingRooms = (db.meetingRooms || []).filter(m => 
      m.id !== `mr-${buildingId}` && 
      (m.building || '').toLowerCase() !== bldNameLower && 
      (m.name || '').toLowerCase() !== bldNameLower
    );

    this.saveDatabase({ 
      ...db, 
      buildings: updatedBuildings, 
      rooms: updatedRooms, 
      meetingRooms: updatedMeetingRooms 
    });
    deleteBuildingInSupabaseDirect(buildingId, bld.name).catch(err => console.warn('Supabase delete building err:', err));
    return { 
      success: true, 
      message: `Gedung '${bld.name}' ${associatedRooms.length > 0 ? `beserta ${associatedRooms.length} unit kamar di dalamnya` : ''} berhasil dihapus dari database.` 
    };
  }

  // ==========================================
  // MANAJEMEN MASTER RUANG PERTEMUAN (CRUD)
  // ==========================================
  public getMeetingRooms(): MeetingRoom[] {
    return this.getDatabase().meetingRooms || [];
  }

  public saveMeetingRooms(meetingRooms: MeetingRoom[]): MeetingRoom[] {
    const db = this.getDatabase();
    this.saveDatabase({ ...db, meetingRooms });
    return meetingRooms;
  }

  public saveMeetingRoom(meetingRoom: MeetingRoom): MeetingRoom {
    const db = this.getDatabase();
    const meetingRooms = db.meetingRooms || [];
    const mrWithId = {
      ...meetingRoom,
      id: meetingRoom.id && meetingRoom.id.trim() !== '' ? meetingRoom.id : `mr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
    };
    const idx = meetingRooms.findIndex(m => m.id === mrWithId.id);
    let updated: MeetingRoom[];

    if (idx >= 0) {
      updated = [...meetingRooms];
      updated[idx] = { ...updated[idx], ...mrWithId };
    } else {
      updated = [...meetingRooms, mrWithId];
    }

    // Sinkronkan juga ke daftar rooms agar operasional terpadu
    const rooms = db.rooms || [];
    const roomIdx = rooms.findIndex(r => r.id === mrWithId.id || r.roomNumber === mrWithId.name);
    let updatedRooms: Room[];

    const nLower = (mrWithId.name || '').toLowerCase().trim();
    const cLower = (mrWithId.code || '').toLowerCase().trim();
    const bLower = (mrWithId.building || '').toLowerCase().trim();

    const isSG = mrWithId.category === 'SERBAGUNA' || 
      (mrWithId.category !== 'AULA' && mrWithId.category !== 'RUANG_PERTEMUAN' && 
       !nLower.startsWith('ruang pertemuan') &&
       !nLower.startsWith('aula') &&
       !nLower.startsWith('auditorium') &&
       !nLower.startsWith('ruang rapat') &&
       !nLower.startsWith('ruang vip') &&
       (nLower.includes('serbaguna') || 
        nLower.includes('multipurpose') || 
        nLower.startsWith('gedung sg') || 
        nLower.startsWith('sg-') || 
        cLower === 'mp' || 
        cLower.startsWith('sg-') || 
        bLower.includes('serbaguna')));

    const targetBuilding = mrWithId.building && mrWithId.building !== 'Ruang Pertemuan' && mrWithId.building !== 'Gedung Serbaguna' && mrWithId.building !== 'Gedung Serbaguna (SG)'
      ? mrWithId.building
      : (isSG ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan');

    const targetType = isSG ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan / Aula';

    const roomRepresentation: Room = {
      id: mrWithId.id,
      building: targetBuilding,
      roomNumber: mrWithId.name,
      type: targetType,
      capacity: mrWithId.capacity,
      status: mrWithId.status === 'MAINTENANCE' ? 'MAINTENANCE' : (mrWithId.status === 'TERPAKAI' ? 'TERISI' : 'KOSONG'),
      qcStatus: mrWithId.qcStatus || 'LOLOS_QC',
      activeTxId: mrWithId.activeTxId || null,
      activeMaintId: null
    };

    if (roomIdx >= 0) {
      updatedRooms = [...rooms];
      updatedRooms[roomIdx] = { ...updatedRooms[roomIdx], ...roomRepresentation };
    } else {
      updatedRooms = [...rooms, roomRepresentation];
    }

    // Sinkronkan totalRooms pada daftar gedung (khususnya Ruang Pertemuan atau Gedung Serbaguna)
    const buildings = (db.buildings || []).map(b => {
      if (b.name === 'Ruang Pertemuan' || b.name === 'Gedung Serbaguna (SG)' || b.category === 'SERBAGUNA' || b.category === 'RUANG_PERTEMUAN') {
        const count = updated.filter(m => m.building === b.name).length;
        return { ...b, totalRooms: count || b.totalRooms };
      }
      return b;
    });

    this.saveDatabase({ ...db, meetingRooms: updated, rooms: updatedRooms, buildings });
    updateMeetingRoomInSupabaseDirect(mrWithId).then(res => {
      if (!res.success) console.warn('Gagal update meeting room ke Supabase:', res.error);
      else this.hydrateFromSupabase(true).catch(() => {});
    }).catch(err => console.warn('Supabase update meeting room error:', err));
    return mrWithId;
  }

  public deleteMeetingRoom(meetingRoomId: string): { success: boolean; message: string } {
    const db = this.getDatabase();
    const meetingRooms = db.meetingRooms || [];
    const mr = meetingRooms.find(m => m.id === meetingRoomId);
    if (!mr) {
      return { success: false, message: 'Ruang pertemuan tidak ditemukan.' };
    }

    // Cek apakah sedang terpakai dalam transaksi aktif
    const txs = db.transactions || [];
    const activeTx = txs.find(t => (t.roomId === meetingRoomId || t.roomNumber === mr.name) && t.status === 'AKTIF');
    if (activeTx) {
      return { 
        success: false, 
        message: `Tidak dapat menghapus '${mr.name}' karena sedang ada peminjaman/booking aktif (${activeTx.guestName}).` 
      };
    }

    const updatedMR = meetingRooms.filter(m => m.id !== meetingRoomId);
    const updatedRooms = (db.rooms || []).filter(r => r.id !== meetingRoomId && r.roomNumber !== mr.name);

    const buildings = (db.buildings || []).map(b => {
      if (b.name === 'Ruang Pertemuan' || b.category === 'SERBAGUNA') {
        const count = updatedMR.filter(m => m.building === b.name || b.name === 'Ruang Pertemuan').length;
        return { ...b, totalRooms: count };
      }
      return b;
    });

    this.saveDatabase({ ...db, meetingRooms: updatedMR, rooms: updatedRooms, buildings });
    deleteMeetingRoomInSupabaseDirect(meetingRoomId).catch(err => console.warn('Supabase delete meeting room err:', err));
    return { success: true, message: `Ruang Pertemuan '${mr.name}' berhasil dihapus dari database.` };
  }

  // ==========================================
  // MANAJEMEN MASTER KAMAR (ROOMS CRUD)
  // ==========================================
  public getRooms(): Room[] {
    return this.getDatabase().rooms;
  }

  public saveRoom(room: Room): Room {
    const db = this.getDatabase();
    const rooms = db.rooms || [];
    const rates = db.roomCapacityRates || initialRoomCapacityRates;

    const assignedType = room.type || 'Standar';
    const assignedBedType = room.bedType || '4 Single Bed';
    const matchedRate = findRoomRate(assignedType, assignedBedType, rates);

    const parsedCapNum = room.capacityNumber || parseInt(String(room.capacity).replace(/\D/g, '')) || matchedRate?.capacityPax || 4;
    const finalPrice = (room.pricePerNight && room.pricePerNight > 0) 
      ? room.pricePerNight 
      : (matchedRate?.pricePerNight || 400000);

    const effectiveBuilding = getRoomBuildingKey(room, db.meetingRooms);

    const roomWithId: Room = {
      ...room,
      building: effectiveBuilding,
      id: room.id && room.id.trim() !== '' ? room.id : `room-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: assignedType,
      bedType: assignedBedType,
      capacity: `${parsedCapNum} Orang`,
      capacityNumber: parsedCapNum,
      pricePerNight: finalPrice,
      facilities: (room.facilities && room.facilities.length > 0) ? room.facilities : (matchedRate?.facilities || ['AC', 'Kamar Mandi Dalam', `${assignedBedType}`, 'Linen Bersih']),
      qcStatus: room.qcStatus || 'LOLOS_QC'
    };
    const idx = rooms.findIndex(r => r.id === roomWithId.id);
    let updated: Room[];
    let transactions = db.transactions || [];
    let maintenances = db.maintenances || [];
    let qcInspections = db.qcInspections || [];
    let meetingRooms = db.meetingRooms || [];

    if (idx >= 0) {
      const oldRoom = rooms[idx];
      updated = [...rooms];
      updated[idx] = { ...updated[idx], ...roomWithId };

      if (oldRoom.roomNumber !== roomWithId.roomNumber || oldRoom.building !== roomWithId.building) {
        transactions = transactions.map(t => 
          t.roomId === roomWithId.id || (t.roomNumber === oldRoom.roomNumber && t.building === oldRoom.building)
            ? { ...t, roomNumber: roomWithId.roomNumber, building: roomWithId.building }
            : t
        );
        maintenances = maintenances.map(m =>
          m.roomId === roomWithId.id || (m.roomNumber === oldRoom.roomNumber && m.building === oldRoom.building)
            ? { ...m, roomNumber: roomWithId.roomNumber, building: roomWithId.building }
            : m
        );
        qcInspections = qcInspections.map(q =>
          q.roomId === roomWithId.id || (q.roomNumber === oldRoom.roomNumber && q.building === oldRoom.building)
            ? { ...q, roomNumber: roomWithId.roomNumber, building: roomWithId.building }
            : q
        );
      }
    } else {
      updated = [...rooms, roomWithId];
    }

    // Pastikan gedung terdaftar dan sinkronkan totalRooms pada daftar gedung
    let buildings = [...(db.buildings || [])];
    const bldExists = buildings.some(b => b.name.toLowerCase() === roomWithId.building.toLowerCase());
    if (!bldExists && roomWithId.building && roomWithId.building !== 'Ruang Pertemuan') {
      buildings.push({
        id: `bld-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        name: roomWithId.building,
        code: roomWithId.building.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'BLD',
        floors: roomWithId.floor || 1,
        totalRooms: 1,
        capacityDesc: 'Kamar Hunian',
        category: roomWithId.type === 'Ruang Pertemuan / Aula' ? 'SERBAGUNA' : 'PENGINAPAN',
        description: `Gedung ${roomWithId.building}`,
        status: 'AKTIF'
      });
    }

    buildings = buildings.map(b => {
      if (b.category === 'SERBAGUNA' || b.category === 'RUANG_PERTEMUAN') {
        return { ...b, totalRooms: 0 };
      }
      const count = updated.filter(r => getRoomBuildingKey(r, db.meetingRooms).toLowerCase() === b.name.toLowerCase()).length;
      return { ...b, totalRooms: count > 0 ? count : (b.totalRooms || 3) };
    });

    // Sinkronkan ke meetingRooms jika kamar/gedung ini berkategori Serbaguna / Aula
    const targetBuilding = buildings.find(b => b.name.toLowerCase() === roomWithId.building.toLowerCase());
    const isSerbaguna = targetBuilding?.category === 'SERBAGUNA' || 
                        roomWithId.building === 'Ruang Pertemuan' || 
                        (roomWithId.type && (roomWithId.type.toLowerCase().includes('aula') || roomWithId.type.toLowerCase().includes('pertemuan') || roomWithId.type.toLowerCase().includes('serbaguna')));

    if (isSerbaguna) {
      const mrIdx = meetingRooms.findIndex(m => 
        m.id === roomWithId.id || 
        m.id === `mr-${roomWithId.id}` || 
        (m.name.toLowerCase() === roomWithId.roomNumber.toLowerCase() && m.building?.toLowerCase() === roomWithId.building.toLowerCase())
      );
      const mrStatus = roomWithId.status === 'MAINTENANCE' ? 'MAINTENANCE' : (roomWithId.status === 'TERISI' ? 'TERPAKAI' : 'TERSEDIA');
      
      const mrData: MeetingRoom = {
        id: mrIdx >= 0 ? meetingRooms[mrIdx].id : (roomWithId.id && roomWithId.id.startsWith('mr-') ? roomWithId.id : `mr-${roomWithId.id || Date.now()}`),
        name: roomWithId.roomNumber,
        code: `MR-${roomWithId.roomNumber}`,
        building: roomWithId.building,
        capacity: roomWithId.capacity ? `${roomWithId.capacity} Orang` : '500 Orang',
        capacityNumber: parseInt(String(roomWithId.capacity)) || 300,
        dailyRate: (roomWithId.pricePerNight && roomWithId.pricePerNight > 1000000) ? roomWithId.pricePerNight * 2 : 12000000,
        sessionRate: roomWithId.pricePerNight || 6500000,
        facilities: roomWithId.facilities && roomWithId.facilities.length > 0 
          ? roomWithId.facilities 
          : ['AC Central', 'Sound System 5000W', 'Proyektor & Videotron', 'Kursi VIP & Seminar', 'Podium Pidato', 'Ruang Rias & Toilet VIP'],
        description: `Ruang pertemuan serbaguna ${roomWithId.roomNumber} di ${roomWithId.building}`,
        status: mrStatus,
        qcStatus: roomWithId.qcStatus || 'LOLOS_QC'
      };

      if (mrIdx >= 0) {
        meetingRooms[mrIdx] = { ...meetingRooms[mrIdx], ...mrData };
      } else {
        meetingRooms = [...meetingRooms, mrData];
      }
    }

    this.saveDatabase({ 
      ...db, 
      rooms: updated, 
      buildings, 
      transactions, 
      maintenances, 
      qcInspections,
      meetingRooms
    });
    updateRoomInSupabaseDirect(roomWithId).then(res => {
      if (!res.success) console.warn('Gagal update kamar ke Supabase:', res.error);
      else this.hydrateFromSupabase(true).catch(() => {});
    }).catch(err => console.warn('Supabase update room error:', err));
    return roomWithId;
  }

  public saveRooms(rooms: Room[], options?: { skipCloudSync?: boolean }): Room[] {
    const db = this.getDatabase();
    this.saveDatabase({ ...db, rooms }, options);
    return rooms;
  }

  public deleteRoom(roomId: string): { success: boolean; message: string } {
    const db = this.getDatabase();
    const rooms = db.rooms || [];
    const room = rooms.find(r => r.id === roomId);
    if (!room) {
      return { success: false, message: 'Kamar tidak ditemukan.' };
    }

    if (room.status === 'TERISI') {
      return { success: false, message: `Tidak dapat menghapus kamar ${room.roomNumber} karena status sedang terisi tamu.` };
    }

    const updatedRooms = rooms.filter(r => r.id !== roomId);
    
    // Sinkronkan totalRooms pada daftar gedung (gedung serbaguna/aula tetap 0 unit kamar)
    const buildings = (db.buildings || []).map(b => {
      if (b.category === 'SERBAGUNA' || b.category === 'RUANG_PERTEMUAN') {
        return { ...b, totalRooms: 0 };
      }
      const count = updatedRooms.filter(r => (r.building || '').trim().toLowerCase() === (b.name || '').trim().toLowerCase()).length;
      return { ...b, totalRooms: count };
    });

    // Sinkronkan penghapusan dari meetingRooms jika ada
    const updatedMeetingRooms = (db.meetingRooms || []).filter(m => 
      m.id !== roomId && 
      m.id !== `mr-${roomId}` && 
      !(m.name.toLowerCase() === room.roomNumber.toLowerCase() && m.building.toLowerCase() === room.building.toLowerCase())
    );

    this.saveDatabase({ ...db, rooms: updatedRooms, buildings, meetingRooms: updatedMeetingRooms });
    deleteRoomInSupabaseDirect(roomId).catch(err => console.warn('Supabase delete room err:', err));
    return { success: true, message: `Kamar ${room.roomNumber} (${room.building}) berhasil dihapus.` };
  }

  // ==========================================
  // MASTER KATALOG TIPE & KAPASITAS KAMAR (CRUD)
  // (3 Tipe: Ekonomi, Standar, Superior; Double s/d 8 Bed)
  // ==========================================
  public getRoomCapacityRates(): RoomCapacityRate[] {
    const db = this.getDatabase();
    if (!Array.isArray(db.roomCapacityRates) || db.roomCapacityRates.length === 0) {
      return [...initialRoomCapacityRates];
    }
    const seenRateIds = new Set<string>();
    const seenCombos = new Set<string>();
    return db.roomCapacityRates.filter((r) => {
      if (!r || !r.id) return false;
      const idKey = String(r.id).trim();
      const comboKey = `${String(r.roomType || '').trim().toLowerCase()}::${String(r.bedType || '').trim().toLowerCase()}`;
      if (seenRateIds.has(idKey) || (comboKey !== '::' && seenCombos.has(comboKey))) {
        return false;
      }
      seenRateIds.add(idKey);
      if (comboKey !== '::') seenCombos.add(comboKey);
      return true;
    });
  }

  public saveRoomCapacityRate(rate: RoomCapacityRate): RoomCapacityRate {
    const db = this.getDatabase();
    const rates = Array.isArray(db.roomCapacityRates) 
      ? db.roomCapacityRates 
      : [...initialRoomCapacityRates];

    const rateWithId: RoomCapacityRate = {
      ...rate,
      id: rate.id && rate.id.trim() !== '' ? rate.id : `rcr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      capacityPax: Number(rate.capacityPax) || 2,
      pricePerNight: Number(rate.pricePerNight) || 350000,
      isActive: rate.isActive !== false,
      updatedAt: new Date().toISOString()
    };

    // Filter out any existing entries with this id OR matching roomType & bedType to guarantee no duplicates
    const remainingRates = rates.filter(r => 
      r.id !== rateWithId.id && 
      !(r.roomType.toLowerCase() === rateWithId.roomType.toLowerCase() && r.bedType.toLowerCase() === rateWithId.bedType.toLowerCase())
    );

    const updatedRates = [...remainingRates, rateWithId];

    this.saveDatabase({ ...db, roomCapacityRates: updatedRates });
    updateRoomCapacityRateInSupabaseDirect(rateWithId).then(res => {
      if (!res.success) console.warn('Gagal update rate ke Supabase:', res.error);
      else this.hydrateFromSupabase(true).catch(() => {});
    }).catch(err => console.warn('Supabase update rate error:', err));
    return rateWithId;
  }

  public deleteRoomCapacityRate(rateId: string): { success: boolean; message: string } {
    const db = this.getDatabase();
    const rates = Array.isArray(db.roomCapacityRates) ? db.roomCapacityRates : [];
    const item = rates.find(r => r.id === rateId);
    if (!item) {
      return { success: false, message: 'Data konfigurasi kapasitas kamar tidak ditemukan.' };
    }

    const updatedRates = rates.filter(r => r.id !== rateId);
    this.saveDatabase({ ...db, roomCapacityRates: updatedRates });
    deleteRoomCapacityRateInSupabaseDirect(rateId).catch(err => console.warn('Supabase delete rate err:', err));
    return { success: true, message: `Konfigurasi '${item.roomType} - ${item.bedType}' berhasil dihapus dari database.` };
  }

  public resetRoomCapacityRates(): RoomCapacityRate[] {
    const db = this.getDatabase();
    const freshRates = [...initialRoomCapacityRates];
    this.saveDatabase({ ...db, roomCapacityRates: freshRates });
    return freshRates;
  }

  /**
   * Terapkan tarif dan fasilitas baru dari katalog ke semua kamar yang memiliki tipe & bedType yang sama
   */
  public applyRateToAllMatchingRooms(
    roomType: string, 
    bedType: string, 
    newPrice: number, 
    facilities?: string[]
  ): { count: number; message: string } {
    const db = this.getDatabase();
    const rooms = db.rooms || [];
    let matchCount = 0;

    const updatedRooms = rooms.map(r => {
      const matchType = (r.type || 'Standar').toLowerCase() === roomType.toLowerCase();
      const matchBed = (r.bedType || '').toLowerCase() === bedType.toLowerCase();
      if (matchType && matchBed) {
        matchCount++;
        return {
          ...r,
          pricePerNight: newPrice,
          facilities: facilities && facilities.length > 0 ? facilities : r.facilities
        };
      }
      return r;
    });

    if (matchCount > 0) {
      this.saveDatabase({ ...db, rooms: updatedRooms });
    }

    return {
      count: matchCount,
      message: `Berhasil memperbarui tarif ${matchCount} unit kamar tipe ${roomType} (${bedType}) menjadi Rp ${newPrice.toLocaleString('id-ID')}/malam.`
    };
  }

  // ==========================================
  // TRANSAKSI & RESERVASI
  // ==========================================
  public getTransactions(): Transaction[] {
    return this.getDatabase().transactions;
  }

  public saveTransaction(tx: Transaction): Transaction {
    const db = this.getDatabase();
    const existingIndex = db.transactions.findIndex(t => t.id === tx.id);
    let updatedTxs: Transaction[];

    if (existingIndex >= 0) {
      updatedTxs = [...db.transactions];
      updatedTxs[existingIndex] = { ...updatedTxs[existingIndex], ...tx };
    } else {
      updatedTxs = [tx, ...db.transactions];
    }

    this.saveDatabase({ ...db, transactions: updatedTxs });
    updateTransactionInSupabaseDirect(tx).then(res => {
      if (!res.success) console.warn('Gagal update transaksi ke Supabase:', res.error);
      else this.hydrateFromSupabase(true).catch(() => {});
    }).catch(err => console.warn('Supabase update transaction error:', err));

    return tx;
  }

  public saveTransactions(txs: Transaction[]): void {
    const db = this.getDatabase();
    this.saveDatabase({ ...db, transactions: txs });
  }

  public deleteTransaction(txId: string): { success: boolean; message: string } {
    const db = this.getDatabase();
    const txs = db.transactions || [];
    const targetTx = txs.find(t => t.id === txId);
    if (!targetTx) {
      return { success: false, message: 'Transaksi tidak ditemukan.' };
    }

    const updatedTxs = txs.filter(t => t.id !== txId);

    // Bebaskan kamar jika kamar terkunci oleh transaksi ini
    const updatedRooms = (db.rooms || []).map(r => {
      if (r.activeTxId === txId || (targetTx.roomId && r.id === targetTx.roomId) || (r.roomNumber === targetTx.roomNumber)) {
        const remainingActive = updatedTxs.find(t =>
          (t.roomId === r.id || t.roomNumber === r.roomNumber || t.allocatedRoomNumbers?.includes(r.roomNumber)) &&
          (t.status === 'TERISI' || t.status === 'BOOKED')
        );
        if (remainingActive) {
          const roomStatus: 'TERISI' | 'BOOKED' = remainingActive.status === 'TERISI' ? 'TERISI' : 'BOOKED';
          return { ...r, status: roomStatus, activeTxId: remainingActive.id };
        }
        return { ...r, status: 'KOSONG' as const, activeTxId: null };
      }
      return r;
    });

    // Hapus juga pesanan sarapan terkait jika ada
    const updatedOrders = (db.breakfastOrders || []).filter(o => o.transactionId !== txId && o.id !== `BO-TX-${txId}`);

    this.saveDatabase({ ...db, transactions: updatedTxs, rooms: updatedRooms, breakfastOrders: updatedOrders });
    deleteTransactionInSupabaseDirect(txId).catch(err => console.warn('Supabase delete transaction err:', err));
    return { success: true, message: `Transaksi '${targetTx.guestName}' (${txId}) berhasil dihapus secara permanen.` };
  }

  public batchDeleteTransactions(txIds: string[]): { success: boolean; count: number } {
    const db = this.getDatabase();
    const idSet = new Set(txIds);
    const updatedTxs = (db.transactions || []).filter(t => !idSet.has(t.id));
    const updatedOrders = (db.breakfastOrders || []).filter(o => !idSet.has(o.transactionId || '') && !idSet.has(o.id.replace('BO-TX-', '')));

    const updatedRooms = (db.rooms || []).map(r => {
      if (r.activeTxId && idSet.has(r.activeTxId)) {
        const remainingActive = updatedTxs.find(t =>
          (t.roomId === r.id || t.roomNumber === r.roomNumber || t.allocatedRoomNumbers?.includes(r.roomNumber)) &&
          (t.status === 'TERISI' || t.status === 'BOOKED')
        );
        if (remainingActive) {
          const roomStatus: 'TERISI' | 'BOOKED' = remainingActive.status === 'TERISI' ? 'TERISI' : 'BOOKED';
          return { ...r, status: roomStatus, activeTxId: remainingActive.id };
        }
        return { ...r, status: 'KOSONG' as const, activeTxId: null };
      }
      return r;
    });

    this.saveDatabase({ ...db, transactions: updatedTxs, rooms: updatedRooms, breakfastOrders: updatedOrders });
    txIds.forEach(id => {
      deleteTransactionInSupabaseDirect(id).catch(() => {});
    });
    return { success: true, count: txIds.length };
  }

  // ==========================================
  // PEMELIHARAAN (MAINTENANCE)
  // ==========================================
  public getMaintenances(): Maintenance[] {
    return this.getDatabase().maintenances;
  }

  public saveMaintenance(m: Maintenance): Maintenance {
    const db = this.getDatabase();
    const idx = db.maintenances.findIndex(item => item.id === m.id);
    let updated: Maintenance[];

    if (idx >= 0) {
      updated = [...db.maintenances];
      updated[idx] = { ...updated[idx], ...m };
    } else {
      updated = [m, ...db.maintenances];
    }

    this.saveDatabase({ ...db, maintenances: updated });
    updateMaintenanceInSupabaseDirect(m).then(res => {
      if (!res.success) console.warn('Gagal update maintenance ke Supabase:', res.error);
      else this.hydrateFromSupabase(true).catch(() => {});
    }).catch(err => console.warn('Supabase update maintenance error:', err));

    return m;
  }

  public deleteMaintenance(maintId: string): boolean {
    const db = this.getDatabase();
    const updated = (db.maintenances || []).filter(m => m.id !== maintId);
    this.saveDatabase({ ...db, maintenances: updated });
    deleteMaintenanceInSupabaseDirect(maintId).catch(err => console.warn('Supabase delete maint err:', err));
    return true;
  }

  // ==========================================
  // AUDIT LOG & AKTIVITAS
  // ==========================================
  public getAuditLogs(): AuditLog[] {
    return this.getDatabase().auditLogs;
  }

  public addAuditLog(log: AuditLog): AuditLog {
    const db = this.getDatabase();
    const existingLogs = Array.isArray(db.auditLogs) ? db.auditLogs : [];
    const filtered = existingLogs.filter(
      l => l.id !== log.id && (!log.verificationCode || l.verificationCode !== log.verificationCode)
    );
    const updated = [log, ...filtered].slice(0, 250);
    this.saveDatabase({ ...db, auditLogs: updated });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sim_haji_audit_log_added', { detail: log }));
    }
    return log;
  }

  public truncateAuditLogs(keepCount: number = 50): number {
    const db = this.getDatabase();
    const currentLogs = db.auditLogs || [];
    const truncated = currentLogs.slice(0, keepCount);
    this.saveDatabase({ ...db, auditLogs: truncated });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sim_haji_audit_logs_truncated', { detail: { count: truncated.length } }));
    }
    return currentLogs.length - truncated.length;
  }

  public clearAuditLogs(): boolean {
    const db = this.getDatabase();
    this.cache = { ...db, auditLogs: [] };
    this.saveDatabase({ ...db, auditLogs: [] });
    clearAuditLogsInSupabaseDirect().catch(err => console.warn('Supabase clear audit err:', err));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sim_haji_audit_logs_cleared', {}));
    }
    return true;
  }

  // ==========================================
  // SESI KERJA & SHIFT
  // ==========================================
  public getWorkSessions(): WorkSession[] {
    return this.getDatabase().workSessions;
  }

  public saveWorkSession(session: WorkSession): WorkSession {
    const db = this.getDatabase();
    const idx = db.workSessions.findIndex(s => s.id === session.id);
    let updated: WorkSession[];

    if (idx >= 0) {
      updated = [...db.workSessions];
      updated[idx] = { ...updated[idx], ...session };
    } else {
      updated = [session, ...db.workSessions];
    }

    this.saveDatabase({ ...db, workSessions: updated });
    upsertWorkSessionInSupabaseDirect(session).catch(err => console.warn('Supabase upsert work session err:', err));
    return session;
  }

  public clearWorkSessions(): void {
    const db = this.getDatabase();
    this.cache = { ...db, workSessions: [] };
    this.saveDatabase({ ...db, workSessions: [] });
    clearWorkSessionsInSupabaseDirect().catch(err => console.warn('Supabase clear work sessions err:', err));
  }

  // ==========================================
  // QUALITY CONTROL (QC) INSPECTIONS
  // ==========================================
  public getQcInspections(): QcInspection[] {
    return this.getDatabase().qcInspections;
  }

  public saveQcInspection(inspection: QcInspection): QcInspection {
    const db = this.getDatabase();
    const idx = db.qcInspections.findIndex(q => q.id === inspection.id);
    let updated: QcInspection[];

    if (idx >= 0) {
      updated = [...db.qcInspections];
      updated[idx] = { ...updated[idx], ...inspection };
    } else {
      updated = [inspection, ...db.qcInspections];
    }

    this.saveDatabase({ ...db, qcInspections: updated });
    return inspection;
  }

  public deleteQcInspection(qcId: string): boolean {
    const db = this.getDatabase();
    const updated = (db.qcInspections || []).filter(q => q.id !== qcId);
    this.saveDatabase({ ...db, qcInspections: updated });
    deleteQcInspectionInSupabaseDirect(qcId).catch(err => console.warn('Supabase delete qc err:', err));
    return true;
  }

  // ==========================================
  // BASIS DATA CHAT & KOMUNIKASI (CRUD)
  // ==========================================
  public getChatChannels(): ChatChannel[] {
    return this.getDatabase().chatChannels || [];
  }

  public saveChatChannel(channel: ChatChannel): ChatChannel {
    const db = this.getDatabase();
    const channels = db.chatChannels || [];
    const idx = channels.findIndex(c => c.id === channel.id);
    let updated: ChatChannel[];

    if (idx >= 0) {
      updated = [...channels];
      updated[idx] = { ...updated[idx], ...channel };
    } else {
      updated = [...channels, channel];
    }

    this.saveDatabase({ ...db, chatChannels: updated });
    return channel;
  }

  public deleteChatChannel(channelId: string): boolean {
    const db = this.getDatabase();
    const channels = db.chatChannels || [];
    const updatedChannels = channels.filter(c => c.id !== channelId);
    const updatedMessages = (db.chatMessages || []).filter(m => m.channelId !== channelId);

    this.saveDatabase({ ...db, chatChannels: updatedChannels, chatMessages: updatedMessages });
    return true;
  }

  public getChatMessages(channelId?: string): ChatMessage[] {
    const all = this.getDatabase().chatMessages || [];
    if (channelId) {
      return all.filter(m => m.channelId === channelId);
    }
    return all;
  }

  public saveChatMessage(msg: ChatMessage, channelObj?: ChatChannel): ChatMessage {
    const db = this.getDatabase();
    const messages = db.chatMessages || [];
    const exists = messages.some(m => m.id === msg.id);
    const updatedMessages = exists
      ? messages.map(m => (m.id === msg.id ? { ...m, ...msg } : m))
      : [...messages, msg];

    // Perbarui status last message pada channel
    const channels = db.chatChannels || [];
    const chExists = channels.some(c => c.id === msg.channelId);
    const updatedChannels = chExists
      ? channels.map(c => {
          if (c.id === msg.channelId) {
            return {
              ...c,
              ...(channelObj || {}),
              lastMessage: msg.message,
              lastMessageTime: msg.timeFormatted,
              lastSenderName: msg.senderName
            };
          }
          return c;
        })
      : channelObj
      ? [
          {
            ...channelObj,
            lastMessage: msg.message,
            lastMessageTime: msg.timeFormatted,
            lastSenderName: msg.senderName
          },
          ...channels
        ]
      : channels;

    this.saveDatabase({ 
      ...db, 
      chatMessages: updatedMessages, 
      chatChannels: updatedChannels 
    });
    const targetCh = updatedChannels.find(c => c.id === msg.channelId) || channelObj;
    upsertChatMessageInSupabaseDirect(msg, targetCh).catch(err => console.warn('Supabase upsert chat msg err:', err));
    return msg;
  }

  public clearChatMessages(channelId?: string): void {
    const db = this.getDatabase();
    if (channelId) {
      const remaining = (db.chatMessages || []).filter(m => m.channelId !== channelId);
      this.cache = { ...db, chatMessages: remaining };
      this.saveDatabase({ ...db, chatMessages: remaining });
    } else {
      this.cache = { ...db, chatMessages: [] };
      this.saveDatabase({ ...db, chatMessages: [] });
    }
    clearChatMessagesInSupabaseDirect(channelId).catch(err => console.warn('Supabase clear chat err:', err));
  }

  // ==========================================
  // PENGATURAN APLIKASI
  // ==========================================
  public getAppSettings(): AppSettings {
    return this.getDatabase().appSettings || defaultAppSettings;
  }

  public updateAppSettings(updates: Partial<AppSettings>): AppSettings {
    const db = this.getDatabase();
    const newSettings: AppSettings = {
      ...this.getAppSettings(),
      ...updates,
      updatedAt: new Date().toISOString()
    };
    const updatedDb = { ...db, appSettings: newSettings };
    this.saveDatabase(updatedDb);
    syncFullDatabaseToSupabase(updatedDb).catch(err => console.warn('Gagal sinkronisasi appSettings ke Supabase:', err));
    return newSettings;
  }

  // ==========================================
  // CADANGAN & PEMULIHAN (BACKUP & RESTORE)
  // ==========================================
  public exportDatabaseAsJson(): string {
    const db = this.getDatabase();
    return JSON.stringify(db, null, 2);
  }

  public downloadBackupFile(customFilename?: string, _ns?: any): void {
    const jsonStr = this.exportDatabaseAsJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10);
    const defaultName = `UPT_Asrama_Haji_Jakarta_Backup_${timestamp}.json`;
    a.href = url;
    a.download = customFilename || defaultName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  public importDatabaseFromJson(jsonStr: string, _ns?: any): { 
    success: boolean; 
    message: string; 
    countSummary?: Record<string, number> 
  } {
    try {
      const parsed = JSON.parse(jsonStr) as Partial<CompleteStorageDatabase>;
      if (!parsed) {
        return { success: false, message: 'Format berkas JSON tidak valid atau kosong.' };
      }

      if (!Array.isArray(parsed.users) || !Array.isArray(parsed.rooms) || !Array.isArray(parsed.transactions)) {
        return { 
          success: false, 
          message: 'Struktur database tidak lengkap. Wajib memiliki data users, rooms, dan transactions.' 
        };
      }

      const validatedDb: CompleteStorageDatabase = {
        schemaVersion: parsed.schemaVersion || 2,
        appName: parsed.appName || 'SIM-Akomodasi UPT Asrama Haji Jakarta',
        exportedAt: new Date().toISOString(),
        appSettings: parsed.appSettings || { ...defaultAppSettings },
        users: parsed.users.filter(u => u.username.toLowerCase() !== 'zain'),
        buildings: Array.isArray(parsed.buildings) ? parsed.buildings : [...initialBuildings],
        meetingRooms: Array.isArray(parsed.meetingRooms) ? parsed.meetingRooms : [...initialMeetingRooms],
        rooms: parsed.rooms,
        transactions: parsed.transactions,
        maintenances: Array.isArray(parsed.maintenances) ? parsed.maintenances : [],
        qcInspections: Array.isArray(parsed.qcInspections) ? parsed.qcInspections : [],
        workSessions: Array.isArray(parsed.workSessions) ? parsed.workSessions : [],
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
        chatChannels: Array.isArray(parsed.chatChannels) ? parsed.chatChannels : [...initialChatChannels],
        chatMessages: Array.isArray(parsed.chatMessages) ? parsed.chatMessages : [],
        breakfastMenuItems: Array.isArray(parsed.breakfastMenuItems) ? parsed.breakfastMenuItems : [...initialBreakfastMenuItems],
        breakfastOrders: Array.isArray(parsed.breakfastOrders) ? parsed.breakfastOrders : [],
        roomCapacityRates: Array.isArray(parsed.roomCapacityRates) ? parsed.roomCapacityRates : [...initialRoomCapacityRates]
      };

      this.saveDatabase(validatedDb);

      return {
        success: true,
        message: 'Basis data berhasil dipulihkan secara penuh ke penyimpanan lokal sistem.',
        countSummary: {
          users: validatedDb.users.length,
          buildings: validatedDb.buildings.length,
          rooms: validatedDb.rooms.length,
          meetingRooms: validatedDb.meetingRooms.length,
          transactions: validatedDb.transactions.length,
          maintenances: validatedDb.maintenances.length,
          qcInspections: validatedDb.qcInspections.length,
          auditLogs: validatedDb.auditLogs.length,
          breakfastOrders: validatedDb.breakfastOrders.length,
          breakfastMenuItems: validatedDb.breakfastMenuItems.length
        }
      };
    } catch (err: any) {
      return { 
        success: false, 
        message: `Terjadi kegagalan parsing JSON: ${err?.message || 'Format tidak valid'}` 
      };
    }
  }

  public resetDatabaseToDefaults(_ns?: any): CompleteStorageDatabase {
    // Reset basis data lokal dan HANYA menyisakan akun Super Admin serta data master bersih
    // Default kosongkan data aktivitas, shift, QC, pesanan, dan transaksi
    const initDb = generateInitialDatabase(true);
    initDb.rooms = getInitialRooms();
    initDb.auditLogs = [];
    initDb.workSessions = [];
    initDb.qcInspections = [];
    initDb.transactions = [];
    initDb.maintenances = [];
    initDb.breakfastOrders = [];
    initDb.chatMessages = [];

    // Hapus total key cadangan lama agar data usang tidak pernah bangkit kembali
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(LOCAL_STORAGE_BACKUP_KEY);
        for (const oldKey of LEGACY_STORAGE_KEYS) {
          window.localStorage.removeItem(oldKey);
        }
      } catch (_) {}
    }

    this.cache = initDb;
    this.saveDatabase(initDb);
    // Segera dorong reset bersih ke Database Supabase Pusat
    this.pushAllToSupabase(initDb).catch(() => {});
    return initDb;
  }

  // ==========================================
  // MANAJEMEN SARAPAN & KATALOG MENU (CRUD)
  // ==========================================
  public getBreakfastMenuItems(): BreakfastMenuItem[] {
    return this.getDatabase().breakfastMenuItems || [];
  }

  public saveBreakfastMenuItem(item: BreakfastMenuItem): BreakfastMenuItem {
    const db = this.getDatabase();
    const items = db.breakfastMenuItems || [];
    const idx = items.findIndex(m => m.id === item.id);
    let updated: BreakfastMenuItem[];
    if (idx >= 0) {
      updated = [...items];
      updated[idx] = { ...updated[idx], ...item };
    } else {
      updated = [...items, item];
    }
    this.saveDatabase({ ...db, breakfastMenuItems: updated });
    return item;
  }

  public deleteBreakfastMenuItem(itemId: string): boolean {
    const db = this.getDatabase();
    const items = db.breakfastMenuItems || [];
    const filtered = items.filter(m => m.id !== itemId);
    this.saveDatabase({ ...db, breakfastMenuItems: filtered });
    deleteBreakfastMenuItemInSupabaseDirect(itemId).catch(err => console.warn('Supabase delete menu item err:', err));
    return true;
  }

  public getBreakfastOrders(): BreakfastOrder[] {
    return this.getDatabase().breakfastOrders || [];
  }

  public saveBreakfastOrder(order: BreakfastOrder): BreakfastOrder {
    const db = this.getDatabase();
    const orders = db.breakfastOrders || [];
    const idx = orders.findIndex(o => o.id === order.id);
    let updated: BreakfastOrder[];
    if (idx >= 0) {
      updated = [...orders];
      updated[idx] = { ...updated[idx], ...order, updatedAt: new Date().toISOString() };
    } else {
      updated = [order, ...orders];
    }
    this.saveDatabase({ ...db, breakfastOrders: updated });
    return order;
  }

  public deleteBreakfastOrder(orderId: string): boolean {
    const db = this.getDatabase();
    const orders = db.breakfastOrders || [];
    const target = orders.find(o => o.id === orderId);
    const filtered = orders.filter(o => o.id !== orderId && (!target?.id || o.id !== target.id));

    const cleanTxId = orderId.replace('BO-TX-', '').split('-')[0];
    let txUpdated = false;
    const updatedTxs = (db.transactions || []).map(tx => {
      const isMatch = 
        tx.id === orderId || 
        tx.id === cleanTxId || 
        orderId.includes(tx.id) || 
        (target?.transactionId && tx.id === target.transactionId) ||
        (target && tx.roomNumber === target.roomNumber && tx.startDate === target.startDate && tx.guestName === target.guestName);
      if (isMatch) {
        txUpdated = true;
        return {
          ...tx,
          breakfast: false,
          breakfastMenu: undefined,
          breakfastPortions: 0,
          breakfastDays: 0,
          breakfastStatus: undefined
        };
      }
      return tx;
    });

    this.saveDatabase({ 
      ...db, 
      breakfastOrders: filtered,
      transactions: txUpdated ? updatedTxs : db.transactions
    });
    deleteBreakfastOrderInSupabaseDirect(orderId).catch(err => console.warn('Supabase delete order err:', err));
    return true;
  }

  public updateBreakfastOrderStatus(orderId: string, status: BreakfastOrder['status']): boolean {
    const db = this.getDatabase();
    const orders = db.breakfastOrders || [];
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx >= 0) {
      const updated = [...orders];
      updated[idx] = { ...updated[idx], status, updatedAt: new Date().toISOString() };
      
      const txId = updated[idx].transactionId;
      let txUpdated = false;
      let updatedTxs = db.transactions || [];
      if (txId) {
        updatedTxs = (db.transactions || []).map(tx => {
          if (tx.id === txId) {
            txUpdated = true;
            return { ...tx, breakfastStatus: status };
          }
          return tx;
        });
      }

      this.saveDatabase({ 
        ...db, 
        breakfastOrders: updated,
        transactions: txUpdated ? updatedTxs : db.transactions
      });
      return true;
    } else {
      const cleanTxId = orderId.replace('BO-TX-', '').split('-')[0];
      const tx = (db.transactions || []).find(t => t.id === cleanTxId || t.id.includes(cleanTxId) || t.id === orderId);
      if (tx) {
        const newOrder: BreakfastOrder = {
          id: orderId,
          roomNumber: tx.roomNumber,
          building: tx.building,
          guestName: tx.guestName,
          phone: tx.phone,
          kloter: tx.kloter,
          transactionId: tx.id,
          menuName: tx.breakfastMenu || 'Nasi Goreng Spesial & Telur Ceplok',
          portions: tx.breakfastPortions || 4,
          days: tx.breakfastDays || tx.duration || 1,
          startDate: tx.startDate || new Date().toISOString().split('T')[0],
          deliveryTime: '06:30 WIB',
          status,
          notes: status === 'DIBATALKAN' ? 'Booking kamar dibatalkan' : 'Pesanan terintegrasi dari data reservasi kamar',
          dietaryRestriction: 'Biasa',
          pricePerPortion: 25000,
          totalPrice: (tx.breakfastPortions || 4) * 25000 * (tx.breakfastDays || tx.duration || 1),
          createdAt: `${tx.startDate || new Date().toISOString().split('T')[0]} 06:00:00`,
          updatedAt: new Date().toISOString()
        };
        const updatedTxs = (db.transactions || []).map(t => t.id === tx.id ? { ...t, breakfastStatus: status } : t);
        this.saveDatabase({ 
          ...db, 
          breakfastOrders: [newOrder, ...orders.filter(o => o.id !== orderId)],
          transactions: updatedTxs
        });
        return true;
      }
    }
    return false;
  }
  public getPasswordResetRequests(): PasswordResetRequest[] {
    const db = this.getDatabase();
    return Array.isArray(db.passwordResetRequests) ? db.passwordResetRequests : [];
  }

  public savePasswordResetRequest(request: PasswordResetRequest): void {
    const db = this.getDatabase();
    const list = this.getPasswordResetRequests();
    const idx = list.findIndex(r => r.id === request.id);
    let updatedList: PasswordResetRequest[];
    if (idx >= 0) {
      updatedList = [...list];
      updatedList[idx] = request;
    } else {
      updatedList = [request, ...list];
    }
    this.saveDatabase({ ...db, passwordResetRequests: updatedList });
  }

  public deletePasswordResetRequest(requestId: string): boolean {
    const db = this.getDatabase();
    const list = this.getPasswordResetRequests();
    const filtered = list.filter(r => r.id !== requestId);
    this.saveDatabase({ ...db, passwordResetRequests: filtered });
    return true;
  }
}

export const dataStorage = new DataStorageService();
