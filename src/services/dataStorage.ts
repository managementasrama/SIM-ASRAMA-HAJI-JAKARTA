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
import { 
  supabase, 
  syncFullDatabaseToSupabase, 
  fetchFullDatabaseFromSupabase, 
  testSupabaseConnection, 
  type SupabaseSyncState 
} from '../lib/supabase';

export type StorageNamespace = 'LOCAL' | 'PROD' | 'DEMO';

export const LOCAL_STORAGE_KEY = 'UPT_ASRAMA_HAJI_DATABASE_V4_CLEAN';
export const LEGACY_STORAGE_KEYS = [
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
  organizationName: 'UPT ASRAMA HAJI JAKARTA',
  subTitle: 'Sistem Informasi Manajemen Operasional',
  ministryName: 'KEMENTERIAN HAJI DAN UMRAH REPUBLIK INDONESIA',
  address: 'Jl. Raya Pd. Gede, RT.1/RW.1, Pinang Ranti, Kec. Makasar, Kota Jakarta Timur, Daerah Khusus Ibukota Jakarta 13560, Indonesia.',
  phone: '0816243154',
  email: 'info@asramahajijakarta.id',
  portalUrl: 'https://asramahajijakarta.id',
  appLogo: getMinistryPngLogo()
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

  constructor() {
    this.getDatabase();
    // Inisialisasi pengecekan koneksi Supabase di background
    this.checkInitialSupabaseConnection();
  }

  private async checkInitialSupabaseConnection() {
    try {
      const res = await testSupabaseConnection();
      if (res.success) {
        this.syncStatus = 'connected';
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
      isConfigured: true
    };
  }

  /**
   * Hidrasi data terbaru dari Supabase Cloud saat aplikasi dibuka
   */
  public async hydrateFromSupabase(): Promise<CompleteStorageDatabase | null> {
    try {
      this.syncStatus = 'syncing';
      const cloudDb = await fetchFullDatabaseFromSupabase();
      if (cloudDb && Array.isArray(cloudDb.rooms) && cloudDb.rooms.length > 0) {
        this.cache = cloudDb;
        this.lastSyncTime = new Date().toISOString();
        this.syncStatus = 'connected';
        this.syncError = null;
        
        // Simpan ke localStorage sebagai cache offline
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cloudDb));
        }
        return cloudDb;
      }
      this.syncStatus = 'connected';
      return null;
    } catch (err: any) {
      this.syncStatus = 'error';
      this.syncError = err?.message || 'Gagal mengambil data dari Supabase';
      return null;
    }
  }

  public async hydrateFromServer(_ns?: any): Promise<CompleteStorageDatabase | null> {
    return this.hydrateFromSupabase();
  }

  /**
   * Sinkronisasi paksa ke Supabase
   */
  public async pushAllToSupabase(): Promise<{ success: boolean; error?: string }> {
    const db = this.getDatabase();
    this.syncStatus = 'syncing';
    const res = await syncFullDatabaseToSupabase(db);
    if (res.success) {
      this.syncStatus = 'connected';
      this.lastSyncTime = new Date().toISOString();
      this.syncError = null;
    } else {
      this.syncStatus = 'error';
      this.syncError = res.error || 'Gagal push ke Supabase';
    }
    return res;
  }

  /**
   * Mengirim data ke Supabase dengan debouncing agar hemat bandwidth dan tidak membebani UI
   */
  private triggerSupabaseSync(db: CompleteStorageDatabase) {
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }
    this.syncDebounceTimer = setTimeout(async () => {
      try {
        this.syncStatus = 'syncing';
        const res = await syncFullDatabaseToSupabase(db);
        if (res.success) {
          this.syncStatus = 'connected';
          this.lastSyncTime = new Date().toISOString();
          this.syncError = null;
        } else {
          this.syncStatus = 'error';
          this.syncError = res.error || 'Koneksi Supabase terputus';
        }
      } catch (err: any) {
        this.syncStatus = 'error';
        this.syncError = err?.message || 'Sync error';
      }
    }, 1500);
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

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        let stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!stored) {
          for (const oldKey of LEGACY_STORAGE_KEYS) {
            const oldVal = window.localStorage.getItem(oldKey);
            if (oldVal) {
              stored = oldVal;
              try { window.localStorage.removeItem(oldKey); } catch (_) {}
              break;
            }
          }
        }

        if (stored) {
          const parsed = JSON.parse(stored) as Partial<CompleteStorageDatabase>;
          if (parsed && Array.isArray(parsed.rooms)) {
            // SINKRONISASI PENGGUNA: Gunakan akun yang tersimpan dari storage/Supabase, fallback ke initialUsers hanya jika kosong
            if (!Array.isArray(parsed.users) || parsed.users.length === 0) {
              parsed.users = [...initialUsers];
            }

            // BERSIHKAN SEMUA DATA DUMMY (Transaksi dummy, Maintenance dummy, QC dummy, Log aktivitas, Shift, dsb)
            if (!parsed.schemaVersion || parsed.schemaVersion < 4) {
              parsed.transactions = [];
              parsed.maintenances = [];
              parsed.qcInspections = [];
              parsed.workSessions = [];
              parsed.auditLogs = [];
              parsed.breakfastOrders = [];
              parsed.chatMessages = [];
              parsed.schemaVersion = 4;

              // Reset status semua kamar agar KOSONG (bersih dari transaksi dummy dan catatan QC lama)
              parsed.rooms = parsed.rooms.map(r => ({
                ...r,
                status: r.status === 'MAINTENANCE' ? 'MAINTENANCE' : 'KOSONG',
                qcStatus: 'LOLOS_QC',
                lastQcDate: undefined,
                lastQcBy: undefined,
                lastQcNotes: undefined,
                activeTxId: null,
                activeMaintId: null
              }));
            }

            // Pastikan data aktivitas, shift, dan QC bertipe array
            if (!Array.isArray(parsed.auditLogs)) parsed.auditLogs = [];
            if (!Array.isArray(parsed.workSessions)) parsed.workSessions = [];
            if (!Array.isArray(parsed.qcInspections)) parsed.qcInspections = [];

            // Inisialisasi buildings jika belum ada, dan bersihkan duplikat legacy 'Ruang Pertemuan' dari daftar gedung penginapan
            if (!Array.isArray(parsed.buildings) || parsed.buildings.length === 0) {
              parsed.buildings = [...initialBuildings];
            } else {
              parsed.buildings = parsed.buildings.filter((b: any) => b.name !== 'Ruang Pertemuan' && b.id !== 'bld-5');
            }

            // Inisialisasi meetingRooms jika belum ada
            if (!Array.isArray(parsed.meetingRooms) || parsed.meetingRooms.length === 0) {
              parsed.meetingRooms = [...initialMeetingRooms];
            } else {
              // Deduplikasi parsed.meetingRooms berdasarkan id & nama unik
              const seenMRIds = new Set<string>();
              parsed.meetingRooms = parsed.meetingRooms.filter((mr: any) => {
                if (!mr || !mr.id) return false;
                const idKey = String(mr.id).trim();
                if (seenMRIds.has(idKey)) return false;
                seenMRIds.add(idKey);
                return true;
              });

              // Pastikan setiap data meetingRoom memiliki category dan building yang tepat
              parsed.meetingRooms = parsed.meetingRooms.map((mr: any) => {
                const nLower = (mr.name || '').toLowerCase().trim();
                const cLower = (mr.code || '').toLowerCase().trim();
                const bLower = (mr.building || '').toLowerCase().trim();

                let cat = mr.category;
                if (nLower.startsWith('ruang pertemuan') || nLower.startsWith('aula') || nLower.startsWith('auditorium') || nLower.startsWith('ruang rapat') || nLower.startsWith('ruang vip')) {
                  cat = 'AULA';
                } else if (!cat || (cat !== 'AULA' && cat !== 'SERBAGUNA' && cat !== 'RUANG_PERTEMUAN')) {
                  if (nLower.includes('serbaguna') || nLower.includes('multipurpose') || nLower.startsWith('gedung sg') || nLower.startsWith('sg-') || cLower === 'mp' || cLower.startsWith('sg-') || bLower.includes('serbaguna')) {
                    cat = 'SERBAGUNA';
                  } else {
                    cat = 'AULA';
                  }
                }
                const isSG = cat === 'SERBAGUNA';
                const bld = mr.building && mr.building !== 'Ruang Pertemuan' && mr.building !== 'Gedung Serbaguna (SG)' && mr.building !== 'Gedung Serbaguna'
                  ? mr.building
                  : (isSG ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan');
                return { ...mr, category: cat, building: bld };
              });
            }

            // Pastikan semua meetingRooms tersinkronkan ke dalam parsed.rooms dengan building dan type yang sesuai
            if (Array.isArray(parsed.rooms)) {
              // Deduplikasi parsed.rooms berdasarkan id
              const seenRoomIds = new Set<string>();
              parsed.rooms = parsed.rooms.filter((r: any) => {
                if (!r || !r.id) return false;
                const idKey = String(r.id).trim();
                if (seenRoomIds.has(idKey)) return false;
                seenRoomIds.add(idKey);
                return true;
              });

              parsed.meetingRooms.forEach((mr: any) => {
                const isSG = mr.category === 'SERBAGUNA';
                const targetBuilding = mr.building && mr.building !== 'Ruang Pertemuan' && mr.building !== 'Gedung Serbaguna (SG)' && mr.building !== 'Gedung Serbaguna'
                  ? mr.building
                  : (isSG ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan');
                const targetType = isSG ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan / Aula';

                const roomIdx = parsed.rooms!.findIndex((r: any) => r.id === mr.id || r.roomNumber.toLowerCase() === mr.name.toLowerCase());
                if (roomIdx >= 0) {
                  parsed.rooms![roomIdx].id = mr.id;
                  parsed.rooms![roomIdx].building = targetBuilding;
                  parsed.rooms![roomIdx].type = targetType;
                } else {
                  parsed.rooms!.push({
                    id: mr.id,
                    building: targetBuilding,
                    roomNumber: mr.name,
                    type: targetType,
                    capacity: mr.capacity,
                    status: mr.status === 'MAINTENANCE' ? 'MAINTENANCE' : (mr.status === 'TERPAKAI' || mr.status === 'TERISI' ? 'TERISI' : (mr.status === 'BOOKED' ? 'BOOKED' : 'KOSONG')),
                    qcStatus: mr.qcStatus || 'LOLOS_QC',
                    activeTxId: mr.activeTxId || null,
                    activeMaintId: null
                  });
                }
              });

              // Final deduplikasi rooms setelah sinkronisasi
              const finalSeenRoomIds = new Set<string>();
              parsed.rooms = parsed.rooms.filter((r: any) => {
                if (!r || !r.id) return false;
                const idKey = String(r.id).trim();
                if (finalSeenRoomIds.has(idKey)) return false;
                finalSeenRoomIds.add(idKey);
                return true;
              });
            }

            // Inisialisasi roomCapacityRates katalog jika belum ada atau lengkapi jika ada konfigurasi yang belum terdaftar
            if (!Array.isArray(parsed.roomCapacityRates) || parsed.roomCapacityRates.length === 0) {
              parsed.roomCapacityRates = [...initialRoomCapacityRates];
            } else {
              // Pastikan semua 24 konfigurasi 3 tipe (Ekonomi, Standar, Superior) dan Double s/d 8 Bed selalu tersedia
              initialRoomCapacityRates.forEach(initRate => {
                const exists = parsed.roomCapacityRates.some((r: any) => 
                  r.roomType?.toLowerCase() === initRate.roomType.toLowerCase() && 
                  r.bedType?.toLowerCase() === initRate.bedType.toLowerCase()
                );
                if (!exists) {
                  parsed.roomCapacityRates.push({ ...initRate });
                }
              });
            }

            // Migrasi tipe kamar (Ekonomi, Standar, Superior) dan bedType untuk semua kamar hunian
            if (Array.isArray(parsed.rooms)) {
              parsed.rooms = parsed.rooms.map((r: any) => {
                if (r.building === 'Ruang Pertemuan' || r.type?.includes('Aula') || r.type?.includes('Pertemuan')) {
                  return {
                    ...r,
                    type: 'Ruang Pertemuan / Aula',
                    capacityNumber: r.capacityNumber || parseInt(String(r.capacity).replace(/\D/g, '')) || 300,
                    pricePerNight: r.pricePerNight || 8500000
                  };
                }

                let roomType = r.type;
                if (!roomType || roomType === 'Kamar Penginapan' || roomType === 'Standar (4 Bed)' || !['Ekonomi', 'Standar', 'Superior'].includes(roomType)) {
                  if (r.building?.includes('Arafah') || r.building?.includes('Gedung A')) {
                    const num = parseInt(String(r.roomNumber).replace(/\D/g, '')) || 0;
                    roomType = (num % 3 === 0) ? 'Superior' : (num % 3 === 1 ? 'Standar' : 'Ekonomi');
                  } else if (r.building?.includes('Madinah') || r.building?.includes('Gedung D')) {
                    roomType = 'Superior';
                  } else if (r.building?.includes('Mina') || r.building?.includes('Gedung C')) {
                    const num = parseInt(String(r.roomNumber).replace(/\D/g, '')) || 0;
                    roomType = (num % 2 === 0) ? 'Ekonomi' : 'Standar';
                  } else {
                    roomType = 'Standar';
                  }
                }

                let bedType = r.bedType;
                if (!bedType) {
                  const capNum = parseInt(String(r.capacity).replace(/\D/g, '')) || 4;
                  if (capNum === 2) {
                    bedType = (r.roomNumber?.endsWith('1') || r.roomNumber?.endsWith('5')) ? 'Double Bed' : '2 Single Bed';
                  } else if (capNum === 3) {
                    bedType = '3 Single Bed';
                  } else if (capNum === 5) {
                    bedType = '5 Single Bed';
                  } else if (capNum === 6) {
                    bedType = '6 Single Bed';
                  } else if (capNum === 7) {
                    bedType = '7 Single Bed';
                  } else if (capNum >= 8) {
                    bedType = '8 Single Bed';
                  } else {
                    bedType = '4 Single Bed';
                  }
                }

                const matchedRate = findRoomRate(roomType, bedType, parsed.roomCapacityRates || initialRoomCapacityRates);
                const capPax = matchedRate ? matchedRate.capacityPax : (parseInt(String(r.capacity).replace(/\D/g, '')) || 4);
                const price = (r.pricePerNight && r.pricePerNight >= 100000 && r.pricePerNight !== 400000)
                  ? r.pricePerNight 
                  : (matchedRate ? matchedRate.pricePerNight : 400000);
                const facilities = (r.facilities && r.facilities.length > 0 && !r.facilities.includes('4 Single Bed'))
                  ? r.facilities
                  : (matchedRate?.facilities || ['AC', 'Kamar Mandi Dalam', `${bedType}`, 'Water Heater', 'Linen Bersih']);

                return {
                  ...r,
                  type: roomType,
                  bedType: bedType,
                  capacity: `${capPax} Orang`,
                  capacityNumber: capPax,
                  pricePerNight: price,
                  facilities: facilities
                };
              });
            }

            // Inisialisasi breakfast katalog jika belum ada
            if (!Array.isArray(parsed.breakfastMenuItems) || parsed.breakfastMenuItems.length === 0) {
              parsed.breakfastMenuItems = [...initialBreakfastMenuItems];
            }

            if (!Array.isArray(parsed.breakfastOrders)) {
              parsed.breakfastOrders = [];
            }

            if (!Array.isArray(parsed.chatChannels) || parsed.chatChannels.length === 0) {
              parsed.chatChannels = [...initialChatChannels];
            }

            if (!Array.isArray(parsed.chatMessages)) {
              parsed.chatMessages = [];
            }

            if (!Array.isArray(parsed.passwordResetRequests)) {
              parsed.passwordResetRequests = [];
            }

            if (!parsed.appSettings || parsed.appSettings.address?.includes('Hankam') || parsed.appSettings.phone === '(021) 8094444') {
              parsed.appSettings = { ...defaultAppSettings };
            } else {
              parsed.appSettings.subTitle = 'Sistem Informasi Manajemen Operasional';
              if (!parsed.appSettings.appLogo || parsed.appSettings.appLogo.length <= 15) {
                parsed.appSettings.appLogo = defaultAppSettings.appLogo;
              }
            }

            this.cache = parsed as CompleteStorageDatabase;
            this.saveDatabase(this.cache);
            return this.cache;
          }
        }
      }
    } catch (e) {
      console.warn('Gagal membaca database dari localStorage, menggunakan seed awal:', e);
    }

    const initDb = generateInitialDatabase(true);
    this.cache = initDb;
    this.saveDatabase(initDb);
    return initDb;
  }

  public saveDatabase(db: CompleteStorageDatabase, _ns?: any): void {
    // Pertahankan riwayat audit logs unduh PDF yang mungkin baru saja tercatat di storage/cache
    const existingAuditLogs = this.cache?.auditLogs || [];
    const incomingAuditLogs = Array.isArray(db.auditLogs) ? db.auditLogs : [];
    const mergedAuditLogs = [...incomingAuditLogs];

    existingAuditLogs.forEach(exLog => {
      const exists = mergedAuditLogs.some(l => 
        (l.id && l.id === exLog.id) || 
        (l.verificationCode && exLog.verificationCode && l.verificationCode === exLog.verificationCode)
      );
      if (!exists) {
        mergedAuditLogs.push(exLog);
      }
    });

    // Batasi jumlah auditLogs maksimal 250 terbaru untuk mencegah localStorage quota penuh
    const trimmedAuditLogs = mergedAuditLogs.slice(0, 250);
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
      users: db.users.filter(u => u.username.toLowerCase() !== 'zain'),
      exportedAt: new Date().toISOString()
    };

    this.cache = updated;

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        // Hapus key legacy untuk membebaskan ruang penyimpanan localStorage
        for (const oldKey of LEGACY_STORAGE_KEYS) {
          try { window.localStorage.removeItem(oldKey); } catch (_) {}
        }
        window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      }
    } catch (e: any) {
      console.warn('Gagal menyimpan database ke localStorage (Quota terlampaui), mencoba pemangkasan darurat:', e);
      try {
        const emergencyDb = {
          ...updated,
          auditLogs: updated.auditLogs.slice(0, 80),
          chatMessages: updated.chatMessages.slice(-50)
        };
        window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(emergencyDb));
      } catch (err2) {
        console.error('LocalStorage quota masih terlampaui setelah pemangkasan darurat:', err2);
      }
    }

    // Sinkronisasi otomatis ke Supabase Backend di cloud
    this.triggerSupabaseSync(updated);
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
    return true;
  }

  // ==========================================
  // MANAJEMEN MASTER GEDUNG (BUILDINGS CRUD)
  // ==========================================
  public getBuildings(): Building[] {
    return this.getDatabase().buildings || [];
  }

  public saveBuilding(building: Building): Building {
    const db = this.getDatabase();
    const buildings = db.buildings || [];
    const buildingWithId = {
      ...building,
      id: building.id && building.id.trim() !== '' ? building.id : `bld-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
    };
    const idx = buildings.findIndex(b => b.id === buildingWithId.id);
    let updatedBuildings: Building[];
    let rooms = db.rooms || [];
    let transactions = db.transactions || [];
    let maintenances = db.maintenances || [];
    let qcInspections = db.qcInspections || [];
    let users = db.users || [];
    let meetingRooms = db.meetingRooms || [];

    if (idx >= 0) {
      const oldBuilding = buildings[idx];
      updatedBuildings = [...buildings];
      updatedBuildings[idx] = { ...updatedBuildings[idx], ...buildingWithId };

      // Jika nama gedung berubah, sinkronkan semua kamar, transaksi, perawatan, qc, meeting rooms, dan pengguna!
      if (oldBuilding.name !== buildingWithId.name) {
        rooms = rooms.map(r => r.building === oldBuilding.name ? { ...r, building: buildingWithId.name } : r);
        meetingRooms = meetingRooms.map(m => 
          m.building === oldBuilding.name || m.name === oldBuilding.name
            ? { ...m, building: buildingWithId.name, name: m.name === oldBuilding.name ? buildingWithId.name : m.name }
            : m
        );
        transactions = transactions.map(t => t.building === oldBuilding.name ? { ...t, building: buildingWithId.name } : t);
        maintenances = maintenances.map(m => m.building === oldBuilding.name ? { ...m, building: buildingWithId.name } : m);
        qcInspections = qcInspections.map(q => q.building === oldBuilding.name ? { ...q, building: buildingWithId.name } : q);
        users = users.map(u => u.assignedBuilding === oldBuilding.name ? { ...u, assignedBuilding: buildingWithId.name } : u);
      }

      // Sinkronisasi Kapasitas / Estimasi Kamar (totalRooms) ke unit kamar di Denah Kamar
      const targetBuildingName = buildingWithId.name;
      const bldRooms = rooms.filter(r => 
        r.building.toLowerCase() === targetBuildingName.toLowerCase() || 
        (oldBuilding && r.building.toLowerCase() === oldBuilding.name.toLowerCase())
      );
      const newTotalRooms = Number(buildingWithId.totalRooms) || 0;
      const floorsCount = Math.max(1, Number(buildingWithId.floors) || 1);
      const bCode = buildingWithId.code ? buildingWithId.code.trim().toUpperCase() : '';

      if (newTotalRooms > 0 && bldRooms.length !== newTotalRooms) {
        if (newTotalRooms > bldRooms.length) {
          // Kapasitas bertambah: tambahkan kamar baru hingga total kamar sama dengan Kapasitas/Estimasi Kamar
          const needed = newTotalRooms - bldRooms.length;
          const existingRoomNumbers = new Set(rooms.map(r => r.roomNumber.toLowerCase()));
          
          let prefix = '';
          const sample = bldRooms[0];
          if (sample) {
            if (bCode && sample.roomNumber.toUpperCase().startsWith(`${bCode}-`)) {
              prefix = `${bCode}-`;
            } else if (bCode && sample.roomNumber.toUpperCase().startsWith(bCode)) {
              prefix = bCode;
            }
          } else if (bCode) {
            prefix = `${bCode}-`;
          }

          const addedRooms: Room[] = [];
          let currentFloor = 1;
          let seq = 1;
          let safetyLoop = 0;

          while (addedRooms.length < needed && safetyLoop < 2000) {
            safetyLoop++;
            // Format nomor kamar: angka pertama selalu menunjukkan lantai kamar (101, 201, dst.)
            const candidateNum = `${prefix}${currentFloor}${seq.toString().padStart(2, '0')}`;
            if (!existingRoomNumbers.has(candidateNum.toLowerCase())) {
              existingRoomNumbers.add(candidateNum.toLowerCase());
              
              const defType = buildingWithId.category === 'SERBAGUNA' ? 'Ruang Pertemuan / Aula' : 'Standar';
              const defBed = buildingWithId.category === 'SERBAGUNA' ? undefined : '4 Single Bed';
              const matchedRate = findRoomRate(defType, defBed || '4 Single Bed', db.roomCapacityRates || initialRoomCapacityRates);
              const defPrice = buildingWithId.category === 'SERBAGUNA' ? 8500000 : (matchedRate?.pricePerNight || 480000);
              const defCap = buildingWithId.category === 'SERBAGUNA' ? '500 Orang' : `${matchedRate?.capacityPax || 4} Orang`;
              const defFacilities = matchedRate?.facilities || [
                'AC Split Dingin', 
                '4 Single Bed', 
                'Kamar Mandi Dalam', 
                'Water Heater', 
                'Linen Bersih UPT', 
                'Lemari 4 Pintu'
              ];

              addedRooms.push({
                id: `room-${Date.now()}-${currentFloor}-${seq}-${Math.random().toString(36).substr(2, 4)}`,
                building: targetBuildingName,
                roomNumber: candidateNum,
                floor: currentFloor,
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

            currentFloor = (currentFloor % floorsCount) + 1;
            if (currentFloor === 1) {
              seq++;
            }
          }

          rooms = [...rooms, ...addedRooms];
        } else {
          // Kapasitas berkurang: pangkas kelebihan kamar yang berstatus KOSONG dan tidak terikat transaksi/maintenance
          const toRemoveCount = bldRooms.length - newTotalRooms;
          const deletableRooms = bldRooms
            .filter(r => r.status === 'KOSONG' && !r.activeTxId && !r.activeMaintId)
            .sort((a, b) => b.roomNumber.localeCompare(a.roomNumber, undefined, { numeric: true }));

          const idsToDelete = new Set(deletableRooms.slice(0, toRemoveCount).map(r => r.id));
          rooms = rooms.filter(r => !idsToDelete.has(r.id));
        }
      }
    } else {
      updatedBuildings = [...buildings, buildingWithId];

      // Saat membuat gedung baru, buatkan unit kamar awal otomatis sesuai jumlah totalRooms
      const requestedRooms = Number(buildingWithId.totalRooms) || 0;
      if (requestedRooms > 0) {
        const floors = Math.max(1, Number(buildingWithId.floors) || 1);
        const roomsPerFloor = Math.ceil(requestedRooms / floors);
        const newRooms: Room[] = [];
        const bCode = buildingWithId.code ? buildingWithId.code.trim().toUpperCase() : '';
        const prefix = bCode ? `${bCode}-` : '';
        let count = 0;
        for (let f = 1; f <= floors; f++) {
          for (let r = 1; r <= roomsPerFloor && count < requestedRooms; r++) {
            count++;
            const roomNum = `${prefix}${f}${r.toString().padStart(2, '0')}`;
            newRooms.push({
              id: `room-${Date.now()}-${f}-${r}-${Math.random().toString(36).substr(2, 4)}`,
              building: buildingWithId.name,
              roomNumber: roomNum,
              floor: f,
              type: buildingWithId.category === 'SERBAGUNA' ? 'Ruang Pertemuan / Aula' : 'Standar',
              bedType: buildingWithId.category === 'SERBAGUNA' ? undefined : '4 Single Bed',
              capacity: buildingWithId.category === 'SERBAGUNA' ? '500 Orang' : '4 Orang',
              capacityNumber: buildingWithId.category === 'SERBAGUNA' ? 500 : 4,
              pricePerNight: buildingWithId.category === 'SERBAGUNA' ? 8500000 : 480000,
              facilities: buildingWithId.category === 'SERBAGUNA' 
                ? ['AC Central', 'Sound System 5000W', 'Proyektor & Videotron', 'Kursi VIP & Seminar', 'Podium Pidato', 'Ruang Rias & Toilet VIP']
                : ['AC Split Dingin', '4 Single Bed', 'Kamar Mandi Dalam', 'Water Heater', 'Linen Bersih UPT', 'Lemari 4 Pintu'],
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
    return buildingWithId;
  }

  public deleteBuilding(buildingId: string): { success: boolean; message: string } {
    const db = this.getDatabase();
    const buildings = db.buildings || [];
    const bld = buildings.find(b => b.id === buildingId);
    if (!bld) {
      return { success: false, message: 'Gedung tidak ditemukan.' };
    }

    // Validasi apakah ada kamar aktif yang terasosiasi dengan gedung ini
    const rooms = db.rooms || [];
    const associatedRooms = rooms.filter(r => r.building.toLowerCase() === bld.name.toLowerCase());
    if (associatedRooms.length > 0) {
      return { 
        success: false, 
        message: `Tidak dapat menghapus '${bld.name}' karena masih terdapat ${associatedRooms.length} kamar aktif di dalamnya. Pindahkan atau hapus kamar terkait terlebih dahulu.` 
      };
    }

    const updated = buildings.filter(b => b.id !== buildingId);
    // Hapus juga dari meetingRooms jika terdaftar sebagai aula serbaguna
    const updatedMeetingRooms = (db.meetingRooms || []).filter(m => 
      m.id !== `mr-${buildingId}` && 
      m.building.toLowerCase() !== bld.name.toLowerCase() && 
      m.name.toLowerCase() !== bld.name.toLowerCase()
    );

    this.saveDatabase({ ...db, buildings: updated, meetingRooms: updatedMeetingRooms });
    return { success: true, message: `Gedung '${bld.name}' berhasil dihapus dari database.` };
  }

  // ==========================================
  // MANAJEMEN MASTER RUANG PERTEMUAN (CRUD)
  // ==========================================
  public getMeetingRooms(): MeetingRoom[] {
    return this.getDatabase().meetingRooms || [];
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

    const roomWithId: Room = {
      ...room,
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
      const count = updated.filter(r => r.building.toLowerCase() === b.name.toLowerCase()).length;
      return { ...b, totalRooms: count };
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
    return roomWithId;
  }

  public saveRooms(rooms: Room[]): Room[] {
    const db = this.getDatabase();
    this.saveDatabase({ ...db, rooms });
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
    
    // Sinkronkan totalRooms pada daftar gedung
    const buildings = (db.buildings || []).map(b => {
      const count = updatedRooms.filter(r => r.building === b.name).length;
      return { ...b, totalRooms: count };
    });

    // Sinkronkan penghapusan dari meetingRooms jika ada
    const updatedMeetingRooms = (db.meetingRooms || []).filter(m => 
      m.id !== roomId && 
      m.id !== `mr-${roomId}` && 
      !(m.name.toLowerCase() === room.roomNumber.toLowerCase() && m.building.toLowerCase() === room.building.toLowerCase())
    );

    this.saveDatabase({ ...db, rooms: updatedRooms, buildings, meetingRooms: updatedMeetingRooms });
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
    return db.roomCapacityRates;
  }

  public saveRoomCapacityRate(rate: RoomCapacityRate): RoomCapacityRate {
    const db = this.getDatabase();
    const rates = db.roomCapacityRates && db.roomCapacityRates.length > 0 
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

    const idx = rates.findIndex(r => r.id === rateWithId.id || (
      r.roomType.toLowerCase() === rateWithId.roomType.toLowerCase() && 
      r.bedType.toLowerCase() === rateWithId.bedType.toLowerCase()
    ));

    let updatedRates: RoomCapacityRate[];
    if (idx >= 0) {
      updatedRates = [...rates];
      updatedRates[idx] = { ...updatedRates[idx], ...rateWithId };
    } else {
      updatedRates = [...rates, rateWithId];
    }

    this.saveDatabase({ ...db, roomCapacityRates: updatedRates });
    return rateWithId;
  }

  public deleteRoomCapacityRate(rateId: string): { success: boolean; message: string } {
    const db = this.getDatabase();
    const rates = db.roomCapacityRates || [];
    const item = rates.find(r => r.id === rateId);
    if (!item) {
      return { success: false, message: 'Data konfigurasi kapasitas kamar tidak ditemukan.' };
    }

    // Cek apakah ada kamar yang sedang menggunakan tipe dan konfigurasi bed ini
    const rooms = db.rooms || [];
    const usingRooms = rooms.filter(r => 
      r.type?.toLowerCase() === item.roomType.toLowerCase() && 
      r.bedType?.toLowerCase() === item.bedType.toLowerCase()
    );

    if (usingRooms.length > 0) {
      return {
        success: false,
        message: `Konfigurasi '${item.roomType} - ${item.bedType}' tidak dapat dihapus karena sedang dipakai oleh ${usingRooms.length} kamar aktif (misal: ${usingRooms.slice(0, 3).map(r => r.roomNumber).join(', ')}). Ubah tipe kamar tersebut terlebih dahulu.`
      };
    }

    const updatedRates = rates.filter(r => r.id !== rateId);
    this.saveDatabase({ ...db, roomCapacityRates: updatedRates });
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
    return tx;
  }

  public saveTransactions(txs: Transaction[]): void {
    const db = this.getDatabase();
    this.saveDatabase({ ...db, transactions: txs });
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
    return m;
  }

  // ==========================================
  // AUDIT LOG & AKTIVITAS
  // ==========================================
  public getAuditLogs(): AuditLog[] {
    return this.getDatabase().auditLogs;
  }

  public addAuditLog(log: AuditLog): AuditLog {
    const db = this.getDatabase();
    const finalLog: AuditLog = {
      ...log,
      id: log.id || `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    };
    const updated = [finalLog, ...(db.auditLogs || []).filter(l => l.id !== finalLog.id && (!finalLog.verificationCode || l.verificationCode !== finalLog.verificationCode))];
    this.saveDatabase({ ...db, auditLogs: updated });

    // Pancarkan event agar state React di seluruh aplikasi tersinkronisasi instan
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sim_haji_audit_log_added', { detail: finalLog }));
    }
    return finalLog;
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
    return session;
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

  public saveChatMessage(msg: ChatMessage): ChatMessage {
    const db = this.getDatabase();
    const messages = db.chatMessages || [];
    const updatedMessages = [...messages, msg];

    // Perbarui status last message pada channel
    const channels = db.chatChannels || [];
    const updatedChannels = channels.map(c => {
      if (c.id === msg.channelId) {
        return {
          ...c,
          lastMessage: msg.message,
          lastMessageTime: msg.timeFormatted,
          lastSenderName: msg.senderName
        };
      }
      return c;
    });

    this.saveDatabase({ 
      ...db, 
      chatMessages: updatedMessages, 
      chatChannels: updatedChannels 
    });
    return msg;
  }

  public clearChatMessages(channelId?: string): void {
    const db = this.getDatabase();
    if (channelId) {
      const remaining = (db.chatMessages || []).filter(m => m.channelId !== channelId);
      this.saveDatabase({ ...db, chatMessages: remaining });
    } else {
      this.saveDatabase({ ...db, chatMessages: [] });
    }
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
      ...updates
    };
    this.saveDatabase({ ...db, appSettings: newSettings });
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
    // Default kosongkan data aktivitas, shift, QC, dan transaksi
    const initDb = generateInitialDatabase(true);
    initDb.auditLogs = [];
    initDb.workSessions = [];
    initDb.qcInspections = [];
    initDb.transactions = [];
    initDb.maintenances = [];
    initDb.breakfastOrders = [];
    initDb.chatMessages = [];
    this.cache = initDb;
    this.saveDatabase(initDb);
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
