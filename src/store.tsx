import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
  UserRole,
  EmailNotificationItem,
  RoomCapacityRate,
  UserPermissions
} from './types';
import { initialUsers, getInitialRooms, initialTransactions, initialMaintenances, initialAuditLogs, initialWorkSessions, initialQcInspections, initialBuildings, initialMeetingRooms } from './data';
import { initialChatChannels, initialChatMessages } from './chatData';
import { playNotificationSound } from './lib/sound';
import { getRealTodayDate, formatIndonesianDate, addDaysToDateStr, getTxDays, getRealLocalDateTimeStr, parseLocalTimeString, formatRupiah, deduplicateRoomCapacityRates, normalizeBuildingName } from './lib/utils';
import { dataStorage, DataStorageService, StorageNamespace, AppSettings } from './services/dataStorage';
import { supabase, syncFullDatabaseToSupabase, validateDatabaseChecksumAgainstSupabase, computeDatasetChecksums, DatabaseChecksumReport } from './lib/supabase';
import { useBodyScrollLock } from './lib/scrollLock';
import { 
  getEmailNotifications, 
  sendMaintenanceEmailNotification, 
  markEmailNotificationAsRead, 
  clearEmailNotificationHistory 
} from './lib/emailNotificationService';

export function formatHMS(totalSeconds: number): string {
  if (totalSeconds < 0) totalSeconds = 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours} Jam ${minutes} Menit ${seconds} Detik`;
}

// Role Authorization Helpers
export function isSuperAdmin(role?: string): boolean {
  return role === 'Super Admin' || role === 'Admin';
}
export function isManagerTeknisi(role?: string): boolean {
  return role === 'Manager Teknisi' || isSuperAdmin(role);
}
export function isManagerQc(role?: string): boolean {
  return role === 'Manager QC' || isSuperAdmin(role);
}
export function isManagerRecep(role?: string): boolean {
  return role === 'Manager Resepsionis' || isSuperAdmin(role);
}
export function isManagerKoperasi(role?: string): boolean {
  return role === 'Manager Koperasi' || isSuperAdmin(role);
}
export function isManagerKeuangan(role?: string): boolean {
  return role === 'Manager Keuangan' || isSuperAdmin(role);
}
export function isManagerRole(role?: string): boolean {
  return isSuperAdmin(role) || 
         role === 'Manager Resepsionis' || 
         role === 'Manager QC' || 
         role === 'Manager Teknisi' || 
         role === 'Manager Koperasi' ||
         role === 'Manager Keuangan';
}
export function isRecepRole(role?: string): boolean {
  return role === 'Resepsionis' || role === 'Manager Resepsionis' || isSuperAdmin(role);
}
export function isTeknisiRole(role?: string): boolean {
  return role === 'Teknisi' || role === 'Manager Teknisi' || isSuperAdmin(role);
}
export function isQcRole(role?: string): boolean {
  return role === 'Quality Control' || role === 'Manager QC' || isSuperAdmin(role);
}
export function isKoperasiRole(role?: string): boolean {
  return role === 'Petugas Koperasi' || role === 'Manager Koperasi' || role === 'Koperasi' || isSuperAdmin(role);
}
export function isKeuanganRole(role?: string, department?: string): boolean {
  if (!role && !department) return false;
  const lower = (role || '').toLowerCase();
  const deptLower = (department || '').toLowerCase();
  return isSuperAdmin(role) || 
         lower.includes('keuangan') || 
         lower.includes('bendahara') || 
         lower.includes('kasir') ||
         lower.includes('finance') ||
         lower.includes('penerimaan') ||
         deptLower.includes('keuangan') ||
         deptLower.includes('perbendaharaan');
}

export function getUserEffectivePermissions(user?: User | null): UserPermissions {
  if (!user) {
    return {};
  }
  const role = user.role || '';
  const isSuper = isSuperAdmin(role) || user.isOwner;
  const isKeuangan = isKeuanganRole(role, user.department);
  const isRecep = isRecepRole(role);
  const isQc = isQcRole(role);
  const isTek = isTeknisiRole(role);
  const isKop = isKoperasiRole(role);

  // Baseline defaults based on official SOP and Role
  const defaults: UserPermissions = {
    canConfigApp: isSuper,
    canManageProfile: true,
    canManageSignature: true,
    canCrudRooms: isSuper || isRecep,
    canCrudCheckin: isSuper || isRecep,
    canCrudBooking: isSuper || isRecep,
    canCrudGroup: isSuper || isRecep,
    canCrudAula: isSuper || isRecep,
    canRecordPayment: isSuper || isKeuangan,
    canIssueInvoice: isSuper || isKeuangan || isRecep,
    canIssueKwitansi: isSuper || isKeuangan,
    canCrudMaintenance: isSuper || isTek || isQc,
    canCrudQc: isSuper || isQc,
    canCrudCatering: isSuper || isKop,
    canManageUsers: isSuper,
    canManagePermissions: isSuper,
    canViewAuditLog: isSuper || isKeuangan || isRecep || isTek || isQc || isKop,
    canExportReports: isSuper || isKeuangan || isRecep || isTek || isQc
  };

  // If account has customized permissions saved by Admin, merge them with priority
  if (user.permissions) {
    return { ...defaults, ...user.permissions };
  }
  return defaults;
}

interface AppContextType {
  currentUser: User | null;
  users: User[];
  rooms: Room[];
  transactions: Transaction[];
  maintenances: Maintenance[];
  auditLogs: AuditLog[];
  workSessions: WorkSession[];
  qcInspections: QcInspection[];
  activeSessionId: string | null;
  clearWorkSessions: () => void;
  activeTab: string;
  toasts: { id: string, msg: string, type: string }[];
  modalState: { [key: string]: any };
  
  // Storage Mode (PROD / DEMO) & Dark Mode
  storageNamespace: StorageNamespace;
  switchStorageNamespace: (ns: StorageNamespace) => void;
  isNetworkOnline: boolean;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  updateCurrentAccount: (updatedData: { fullName?: string; username?: string; phone?: string; password?: string; signatureUrl?: string; qrCodeUrl?: string; signatureHistory?: any[] }) => void;
  appSettings: AppSettings;
  updateAppSettings: (newTitleOrUpdates?: string | Partial<AppSettings>, newLogo?: string) => void;

  // Supabase Cloud Sync & Checksum Validation
  supabaseSyncState: {
    status: 'idle' | 'syncing' | 'connected' | 'error';
    lastSyncTime: string | null;
    errorMessage: string | null;
  };
  checksumReport: DatabaseChecksumReport;
  verifyDatabaseChecksum: (silent?: boolean) => Promise<DatabaseChecksumReport>;
  triggerBackgroundSync: (reason?: string) => Promise<void>;
  pullFromCentralDatabase: () => Promise<void>;
  manualSyncSupabase: () => Promise<void>;
  pushAllToSupabase: () => Promise<void>;

  // Chat State & Methods
  chatChannels: ChatChannel[];
  chatMessages: ChatMessage[];
  isChatOpen: boolean;
  activeChatChannelId: string | null;
  chatSoundEnabled: boolean;
  chatNotificationToast: { message: ChatMessage; channelName: string; channelId: string } | null;
  unreadTotalCount: number;
  openChat: (channelId?: string) => void;
  closeChat: () => void;
  setActiveChatChannelId: (channelId: string | null) => void;
  toggleChatSound: () => void;
  sendChatMessage: (channelId: string, text: string, priority?: 'NORMAL' | 'PENTING' | 'URGENT', isInstruction?: boolean) => void;
  markChannelAsRead: (channelId: string) => void;
  dismissChatNotification: () => void;
  simulateIncomingChatMessage: (channelId?: string) => void;
  
  login: (user: User, preferNamespace?: StorageNamespace, rememberDevice?: boolean) => void;
  logout: () => void;
  setActiveTab: (tab: string) => void;
  selectedBuilding: string | null;
  setSelectedBuilding: (buildingName: string | null) => void;
  addUser: (user: User) => void;
  updateUser: (user: User) => void;
  toggleUserStatus: (userId: string) => void;
  deleteUser: (userId: string) => void;
  
  addTransaction: (tx: Transaction) => void;
  addGroupBooking: (txs: Transaction[], groupName: string) => void;
  updateGroupBooking: (editGroupId: string, txs: Transaction[], groupName: string) => void;
  updateTransaction: (tx: Transaction) => void;
  updateBreakfastStatus: (txId: string, status: 'MENUNGGU' | 'SEDANG_DIBUAT' | 'PENGANTARAN' | 'SELESAI' | 'DIBATALKAN') => void;
  checkoutRoom: (roomId: string, txId?: string) => void;
  activateCheckin: (roomId: string, targetTxId?: string) => void;
  cancelBooking: (roomId: string, txId?: string, reason?: string) => void;
  batchCancelGroup: (txIdsOrGroupId: string[] | string, reason?: string) => boolean;
  extendTransaction: (
    txId: string, 
    additionalDuration: number, 
    extendBreakfast?: boolean, 
    extendExtraBed?: boolean, 
    reason?: string,
    paymentOption?: {
      mode: 'LUNAS_SEKARANG' | 'BAYAR_NANTI' | 'DP_SEKARANG';
      amount?: number;
      method?: string;
      bankName?: string;
      vaNumber?: string;
      vaAccountName?: string;
      bankAccountNumber?: string;
      notes?: string;
    },
    extendEntireGroup?: boolean
  ) => boolean;
  batchCheckinGroup: (txIdsOrGroupId: string[] | string) => boolean;
  batchCheckoutGroup: (txIdsOrGroupId: string[] | string) => boolean;
  
  addMaintenance: (maint: Maintenance) => void;
  assignTechnicianToMaintenance: (maintId: string, technicianId: string, technicianName: string, managerNotes?: string) => boolean;
  markMaintenanceRepaired: (maintId: string, technicianNotes: string) => boolean;
  updateMaintenanceStatus: (maintId: string, newStatus: 'MENUNGGU_PENUGASAN' | 'PROSES' | 'MENUNGGU_QC' | 'SELESAI', technicianNotes?: string) => boolean;
  finishMaintenance: (roomId: string) => boolean;

  addQcInspection: (inspection: QcInspection) => void;
  
  // Breakfast Orders & Menu Catalog Database Management
  breakfastMenuItems: BreakfastMenuItem[];
  breakfastOrders: BreakfastOrder[];
  addBreakfastOrder: (order: BreakfastOrder) => void;
  updateBreakfastOrder: (order: BreakfastOrder) => void;
  deleteBreakfastOrder: (orderId: string) => void;
  updateBreakfastOrderStatusState: (orderId: string, status: BreakfastOrder['status']) => void;
  addBreakfastMenuItem: (item: BreakfastMenuItem) => void;
  updateBreakfastMenuItem: (item: BreakfastMenuItem) => void;
  deleteBreakfastMenuItem: (itemId: string) => void;

  logAudit: (action: string, details: string, durationMinutes?: number) => void;
  addAuditLog: (log: AuditLog) => AuditLog;
  showToast: (msg: string, type?: string) => void;
  removeToast: (id: string) => void;
  
  openModal: (modalId: string, data?: any) => void;
  closeModal: (modalId: string) => void;

  // Master Buildings & Meeting Rooms Database Catalog
  buildings: Building[];
  meetingRooms: MeetingRoom[];
  addBuilding: (building: Building) => void;
  updateBuilding: (building: Building) => void;
  deleteBuilding: (buildingId: string) => boolean;
  addMeetingRoom: (mr: MeetingRoom) => void;
  updateMeetingRoom: (mr: MeetingRoom) => void;
  deleteMeetingRoom: (mrId: string) => boolean;
  addRoom: (room: Room) => void;
  updateRoom: (room: Room) => void;
  deleteRoom: (roomId: string) => boolean;

  // Master Katalog Tipe & Kapasitas Kamar (3 Tipe: Ekonomi, Standar, Superior; Double s/d 8 Bed)
  roomCapacityRates: RoomCapacityRate[];
  addRoomCapacityRate: (rate: RoomCapacityRate) => void;
  updateRoomCapacityRate: (rate: RoomCapacityRate) => void;
  deleteRoomCapacityRate: (rateId: string) => boolean;
  resetRoomCapacityRates: () => void;
  applyRateToAllRooms: (roomType: string, bedType: string, newPrice: number, facilities?: string[]) => void;

  // Centralized Local Storage Database Management
  dataStorage: DataStorageService;
  exportDatabaseBackup: () => void;
  importDatabaseBackup: (jsonString: string) => boolean;
  resetDatabase: () => void;
  clearChatHistory: (channelId?: string) => void;
  addChatChannel: (channel: ChatChannel) => void;
  deleteChatChannel: (channelId: string) => boolean;

  // Account Registration & Password Reset Requests with Admin Approval
  passwordResetRequests: PasswordResetRequest[];
  requestPasswordReset: (username: string, newPassword: string, notes?: string) => { success: boolean; message: string };
  approvePasswordReset: (requestId: string) => boolean;
  rejectPasswordReset: (requestId: string, notes?: string) => boolean;
  registerAccountRequest: (userData: { fullName: string; username: string; password?: string; role: UserRole; department?: string; phone: string; assignedBuilding?: string }) => { success: boolean; message: string };
  approveUserRegistration: (userId: string) => boolean;
  rejectUserRegistration: (userId: string) => boolean;

  // Email Notifications to Manager Teknisi
  emailNotifications: EmailNotificationItem[];
  sendMaintenanceEmail: (params: any) => EmailNotificationItem;
  markEmailAsRead: (id: string) => void;
  clearEmailHistory: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [storageNamespace, setStorageNamespace] = useState<StorageNamespace>(() => dataStorage.getNamespace());
  const [emailNotifications, setEmailNotifications] = useState<EmailNotificationItem[]>(() => getEmailNotifications());
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      // Sesi tab aktif menggunakan sessionStorage (otomatis keluar saat browser/tab ditutup sesuai standar website)
      const sessionSaved = sessionStorage.getItem('sim_haji_current_user');
      if (sessionSaved) {
        const u = JSON.parse(sessionSaved);
        if (u && u.id) return u;
      }
      // Periksa localStorage HANYA jika fitur Ingat Sesi aktif secara eksplisit (default: false)
      const isRemember = localStorage.getItem('sim_haji_remember_session');
      if (isRemember === 'true') {
        const localSaved = localStorage.getItem('sim_haji_current_user');
        if (localSaved) {
          const u = JSON.parse(localSaved);
          if (u && u.id) return u;
        }
      } else {
        // Bersihkan data sesi lokal agar tidak tersisa saat browser baru dibuka
        localStorage.removeItem('sim_haji_current_user');
      }
    } catch (_) {}
    return null;
  });

  useEffect(() => {
    try {
      if (currentUser) {
        sessionStorage.setItem('sim_haji_current_user', JSON.stringify(currentUser));
        const isRemember = localStorage.getItem('sim_haji_remember_session');
        if (isRemember === 'true') {
          localStorage.setItem('sim_haji_current_user', JSON.stringify(currentUser));
        } else {
          localStorage.removeItem('sim_haji_current_user');
        }
      } else {
        localStorage.removeItem('sim_haji_current_user');
        sessionStorage.removeItem('sim_haji_current_user');
      }
    } catch (_) {}
  }, [currentUser]);
  const [users, setUsers] = useState<User[]>(() => dataStorage.getUsers());
  const [buildings, setBuildings] = useState<Building[]>(() => dataStorage.getBuildings());
  const [meetingRooms, setMeetingRooms] = useState<MeetingRoom[]>(() => dataStorage.getMeetingRooms());
  const [rooms, setRooms] = useState<Room[]>(() => dataStorage.getRooms());
  const [roomCapacityRates, setRoomCapacityRatesState] = useState<RoomCapacityRate[]>(() => deduplicateRoomCapacityRates(dataStorage.getRoomCapacityRates()));
  const setRoomCapacityRates = (ratesOrFn: RoomCapacityRate[] | ((prev: RoomCapacityRate[]) => RoomCapacityRate[])) => {
    if (typeof ratesOrFn === 'function') {
      setRoomCapacityRatesState(prev => deduplicateRoomCapacityRates(ratesOrFn(prev)));
    } else {
      setRoomCapacityRatesState(deduplicateRoomCapacityRates(ratesOrFn));
    }
  };
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const today = getRealTodayDate();
    const stored = dataStorage.getTransactions();
    return stored.map(t => {
      if (t.building === 'Ruang Pertemuan' && t.status !== 'DIBATALKAN') {
        const durDays = getTxDays(t);
        const endDate = addDaysToDateStr(t.startDate, Math.max(0, durDays - 1));
        if (today > endDate) {
          return { ...t, status: 'SELESAI' as const };
        } else if (today >= t.startDate && today <= endDate) {
          return { ...t, status: 'TERISI' as const };
        } else if (today < t.startDate) {
          return { ...t, status: 'BOOKED' as const };
        }
      }
      return t;
    });
  });
  const [maintenances, setMaintenances] = useState<Maintenance[]>(() => dataStorage.getMaintenances());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => dataStorage.getAuditLogs());
  const [workSessions, setWorkSessions] = useState<WorkSession[]>(() => dataStorage.getWorkSessions());
  const [qcInspections, setQcInspections] = useState<QcInspection[]>(() => dataStorage.getQcInspections());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: string, msg: string, type: string }[]>([]);
  const [modalState, setModalState] = useState<{ [key: string]: any }>({});

  // Chat States
  const [chatChannels, setChatChannels] = useState<ChatChannel[]>(() => dataStorage.getChatChannels());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => dataStorage.getChatMessages());
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [activeChatChannelId, setActiveChatChannelId] = useState<string | null>(null);
  const [chatSoundEnabled, setChatSoundEnabled] = useState<boolean>(true);
  const [chatNotificationToast, setChatNotificationToast] = useState<{ message: ChatMessage; channelName: string; channelId: string } | null>(null);

  // Permohonan Reset Password States
  const [passwordResetRequests, setPasswordResetRequests] = useState<PasswordResetRequest[]>(() => dataStorage.getPasswordResetRequests());

  // Real-time Network Online / Offline Detection
  const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  // Dark Mode State & Toggle
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('upt_haji_dark_mode') === 'true';
  });

  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    localStorage.setItem('upt_haji_dark_mode', String(next));
    if (next) {
      document.documentElement.classList.add('dark');
      showToast("Mode Gelap diaktifkan", "info");
    } else {
      document.documentElement.classList.remove('dark');
      showToast("Mode Terang diaktifkan", "info");
    }
  };

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const updateCurrentAccount = (updatedData: { fullName?: string; username?: string; phone?: string; password?: string; signatureUrl?: string; qrCodeUrl?: string; signatureHistory?: any[] }) => {
    if (!currentUser) return;
    const updatedUser: User = {
      ...currentUser,
      fullName: updatedData.fullName !== undefined ? updatedData.fullName : currentUser.fullName,
      username: updatedData.username !== undefined ? updatedData.username : currentUser.username,
      phone: updatedData.phone !== undefined ? updatedData.phone : currentUser.phone,
      password: updatedData.password !== undefined ? updatedData.password : currentUser.password,
      signatureUrl: updatedData.signatureUrl !== undefined ? updatedData.signatureUrl : currentUser.signatureUrl,
      qrCodeUrl: updatedData.qrCodeUrl !== undefined ? updatedData.qrCodeUrl : currentUser.qrCodeUrl,
      signatureHistory: updatedData.signatureHistory !== undefined ? updatedData.signatureHistory : currentUser.signatureHistory,
    };
    setUsers(prev => prev.map(u => u.id === currentUser.id ? updatedUser : u));
    setCurrentUser(updatedUser);
    dataStorage.saveUser(updatedUser);
    try {
      localStorage.setItem('sim_haji_current_user', JSON.stringify(updatedUser));
      sessionStorage.setItem('sim_haji_current_user', JSON.stringify(updatedUser));
    } catch (_) {}
    logAudit('Edit Akun Mandiri', `Pengguna ${updatedUser.fullName} memperbarui informasi profil akun & tanda tangan digital.`);
    showToast('Profil akun & tanda tangan berhasil diperbarui dan disimpan ke database!', 'success');
  };

  const [appSettings, setAppSettings] = useState<AppSettings>(() => dataStorage.getAppSettings());

  useEffect(() => {
    if (appSettings?.tagTitle || appSettings?.organizationName) {
      document.title = appSettings.tagTitle || `${appSettings.organizationName} - Sistem Operasional`;
    }
    if (appSettings?.appFavicon && appSettings.appFavicon.startsWith('data:')) {
      let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = appSettings.appFavicon;
    }
  }, [appSettings]);

  const updateAppSettings = (newTitleOrUpdates?: string | Partial<AppSettings>, newLogo?: string) => {
    if (!currentUser) return;
    const canManage = isSuperAdmin(currentUser.role) || currentUser.role === 'Admin' || currentUser.isOwner || getUserEffectivePermissions(currentUser).canConfigApp;
    if (!canManage) {
      showToast('Hanya Super Admin atau Administrator yang berhak mengubah konfigurasi branding sistem.', 'warning');
      return;
    }
    let updates: Partial<AppSettings> = {};
    if (typeof newTitleOrUpdates === 'string') {
      updates = {
        organizationName: newTitleOrUpdates,
        appLogo: newLogo
      };
    } else if (newTitleOrUpdates) {
      updates = newTitleOrUpdates;
    }
    const updated = dataStorage.updateAppSettings(updates);
    setAppSettings(updated);
    logAudit('Pengaturan Web Admin', `Admin mengubah konfigurasi judul (${updated.organizationName}), sub judul (${updated.subTitle}), logo & branding sistem.`);
    showToast('Konfigurasi Web Sistem berhasil diperbarui!', 'success');
  };

  // Breakfast Orders & Menu Catalog Database States
  const [breakfastMenuItems, setBreakfastMenuItems] = useState<BreakfastMenuItem[]>(() => dataStorage.getBreakfastMenuItems());
  const [breakfastOrders, setBreakfastOrders] = useState<BreakfastOrder[]>(() => dataStorage.getBreakfastOrders());

  useEffect(() => {
    const handleOnline = () => setIsNetworkOnline(true);
    const handleOffline = () => setIsNetworkOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Supabase Cloud Sync State & Checksum Validation State
  const [supabaseSyncState, setSupabaseSyncState] = useState(dataStorage.getSupabaseSyncState());
  const [checksumReport, setChecksumReport] = useState<DatabaseChecksumReport>(() => {
    const initialSig = computeDatasetChecksums({
      buildings: dataStorage.getBuildings(),
      rooms: dataStorage.getRooms(),
      meetingRooms: dataStorage.getMeetingRooms(),
      transactions: dataStorage.getTransactions(),
      maintenances: dataStorage.getMaintenances()
    });
    return {
      status: 'CHECKING',
      localChecksum: initialSig.masterChecksum,
      remoteChecksum: 'MEMERIKSA...',
      isMatch: true,
      checkedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      modules: [],
      mismatchedModules: [],
      message: 'Memvalidasi checksum cache lokal terhadap Database Pusat...'
    };
  });

  const verifyDatabaseChecksum = async (silent: boolean = false, customDataset?: {
    buildings?: Building[];
    rooms?: Room[];
    meetingRooms?: MeetingRoom[];
    transactions?: Transaction[];
    maintenances?: Maintenance[];
  }): Promise<DatabaseChecksumReport> => {
    const dataset = customDataset || {
      buildings,
      rooms,
      meetingRooms,
      transactions,
      maintenances
    };
    if (!silent) {
      setChecksumReport(prev => ({ ...prev, status: 'CHECKING', message: 'Memvalidasi checksum terhadap Database Pusat...' }));
    }
    const report = await validateDatabaseChecksumAgainstSupabase(dataset);
    setChecksumReport(report);
    if (!silent) {
      if (report.status === 'SYNCED') {
        showToast(`Checksum Valid (${report.localChecksum}): Cache lokal identik dengan Database Pusat!`, 'success');
      } else if (report.status === 'MISMATCH') {
        showToast(`Peringatan Checksum: Cache lokal (${report.localChecksum}) berbeda dari Database Pusat (${report.remoteChecksum})!`, 'warning');
      }
    }
    return report;
  };

  // Periodik update status Supabase & validasi checksum berkala
  useEffect(() => {
    const timer = setInterval(() => {
      setSupabaseSyncState(dataStorage.getSupabaseSyncState());
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Dengarkan event sinkronisasi latar belakang dari setiap mutasi dataStorage (misal: booking kamar, check-in, edit gedung/kamar)
  useEffect(() => {
    const unsubscribe = dataStorage.onSyncEvent(async (event) => {
      setSupabaseSyncState(dataStorage.getSupabaseSyncState());
      if (event.status === 'syncing') {
        const localSig = computeDatasetChecksums({
          buildings: event.db.buildings,
          rooms: event.db.rooms,
          meetingRooms: event.db.meetingRooms,
          transactions: event.db.transactions,
          maintenances: event.db.maintenances
        });
        setChecksumReport(prev => ({
          ...prev,
          status: 'CHECKING',
          localChecksum: localSig.masterChecksum,
          message: 'Menyinkronkan mutasi terbaru ke Database Pusat...'
        }));
      } else if (event.status === 'connected' || event.status === 'error') {
        await verifyDatabaseChecksum(true, {
          buildings: event.db.buildings,
          rooms: event.db.rooms,
          meetingRooms: event.db.meetingRooms,
          transactions: event.db.transactions,
          maintenances: event.db.maintenances
        });
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (!dataStorage.hasPendingSync()) {
        verifyDatabaseChecksum(true, { buildings, rooms, meetingRooms, transactions, maintenances });
      }
    }, 1800);
    return () => clearTimeout(debounce);
  }, [buildings, rooms, meetingRooms, transactions, maintenances]);

  // =========================================================================
  // LAYER VALIDASI STATE GLOBAL (ROOM & QC REAL-TIME SYNCHRONIZATION)
  // Menjamin konsistensi status kamar, transaksi aktif, pemeliharaan & QC
  // Menghindari data kamar tidak sinkron atau tamu cekin tak terlihat
  // =========================================================================
  const validateAndSyncRoomStates = (
    currentRooms: Room[],
    currentTransactions: Transaction[],
    currentMaintenances: Maintenance[]
  ): { nextRooms: Room[]; hasChanges: boolean } => {
    let hasChanges = false;
    const nextRooms = currentRooms.map(r => {
      // Cari transaksi aktif untuk kamar ini dengan pencocokan multi-field
      const matchingActiveTxs = currentTransactions.filter(t => 
        (t.roomId === r.id || (t.roomNumber === r.roomNumber && (!t.building || normalizeBuildingName(t.building) === normalizeBuildingName(r.building))) || t.id === r.activeTxId) &&
        t.status !== 'DIBATALKAN' && 
        t.status !== 'SELESAI'
      );

      const terisiTx = matchingActiveTxs.find(t => t.status === 'TERISI');
      const bookedTx = matchingActiveTxs.find(t => t.status === 'BOOKED');
      const activeMaint = currentMaintenances.find(m => 
        (m.id === r.activeMaintId || m.roomId === r.id || (m.roomNumber === r.roomNumber && (!m.building || normalizeBuildingName(m.building) === normalizeBuildingName(r.building)))) && 
        m.status !== 'SELESAI'
      );

      let targetStatus = r.status;
      let targetActiveTxId = r.activeTxId;
      let targetActiveMaintId = r.activeMaintId;
      let targetQcStatus = r.qcStatus || 'LOLOS_QC';

      if (activeMaint) {
        targetStatus = 'MAINTENANCE';
        targetActiveMaintId = activeMaint.id;
        if (activeMaint.status === 'MENUNGGU_QC') {
          targetQcStatus = 'MENUNGGU_QC';
        } else if (activeMaint.qcVerdict === 'PERLU_PERBAIKAN' || targetQcStatus !== 'MENUNGGU_QC') {
          targetQcStatus = 'PERLU_PERBAIKAN';
        }
      } else if (terisiTx) {
        targetStatus = 'TERISI';
        targetActiveTxId = terisiTx.id;
        targetActiveMaintId = null;
      } else if (bookedTx) {
        if (targetStatus !== 'MAINTENANCE') {
          targetStatus = 'BOOKED';
        }
        targetActiveTxId = bookedTx.id;
      } else {
        // Tidak ada transaksi aktif dan tidak ada maintenance berjalan
        if (targetStatus === 'TERISI' || targetStatus === 'BOOKED') {
          targetStatus = 'KOSONG';
          targetActiveTxId = null;
          if (targetQcStatus === 'LOLOS_QC') {
            targetQcStatus = 'PERLU_INSPEKSI';
          }
        }
        if (targetActiveTxId) {
          targetActiveTxId = null;
        }
        if (targetStatus === 'MAINTENANCE' && !activeMaint) {
          targetStatus = 'KOSONG';
          targetActiveMaintId = null;
        }
      }

      if (
        r.status !== targetStatus ||
        r.activeTxId !== targetActiveTxId ||
        r.activeMaintId !== targetActiveMaintId ||
        r.qcStatus !== targetQcStatus
      ) {
        hasChanges = true;
        return {
          ...r,
          status: targetStatus,
          activeTxId: targetActiveTxId,
          activeMaintId: targetActiveMaintId,
          qcStatus: targetQcStatus
        };
      }
      return r;
    });

    return { nextRooms, hasChanges };
  };

  // Sinkronisasi data awal saat aplikasi dibuka
  useEffect(() => {
    async function loadCloudDatabase() {
      try {
        const cloudDb = await dataStorage.hydrateFromSupabase();
        if (cloudDb) {
          setUsers(cloudDb.users);
          setBuildings(cloudDb.buildings || []);
          setMeetingRooms(cloudDb.meetingRooms || []);
          const { nextRooms, hasChanges } = validateAndSyncRoomStates(
            cloudDb.rooms || [],
            cloudDb.transactions || [],
            cloudDb.maintenances || []
          );
          setRooms(nextRooms);
          setTransactions(cloudDb.transactions);
          setMaintenances(cloudDb.maintenances);
          setAuditLogs(cloudDb.auditLogs);
          setWorkSessions(cloudDb.workSessions);
          setQcInspections(cloudDb.qcInspections);
          setBreakfastMenuItems(cloudDb.breakfastMenuItems || []);
          setBreakfastOrders(cloudDb.breakfastOrders || []);
          if (cloudDb.roomCapacityRates && Array.isArray(cloudDb.roomCapacityRates)) {
            setRoomCapacityRates(cloudDb.roomCapacityRates);
          }
          if (cloudDb.passwordResetRequests && Array.isArray(cloudDb.passwordResetRequests)) {
            setPasswordResetRequests(cloudDb.passwordResetRequests);
          }
          if (cloudDb.appSettings) setAppSettings(cloudDb.appSettings);
          setSupabaseSyncState(dataStorage.getSupabaseSyncState());
          if (hasChanges) {
            dataStorage.saveRooms(nextRooms);
          }
          await verifyDatabaseChecksum(true, {
            buildings: cloudDb.buildings || [],
            rooms: nextRooms,
            meetingRooms: cloudDb.meetingRooms || [],
            transactions: cloudDb.transactions || [],
            maintenances: cloudDb.maintenances || []
          });
        } else {
          // Hanya jika Supabase tidak tersedia (offline), coba pulihkan dari cadangan lokal
          const recovery = dataStorage.tryRecoverLostData();
          if (recovery.recovered && recovery.recoveredDb) {
            const rDb = recovery.recoveredDb;
            setUsers(rDb.users);
            setBuildings(rDb.buildings || []);
            setMeetingRooms(rDb.meetingRooms || []);
            const { nextRooms, hasChanges } = validateAndSyncRoomStates(
              rDb.rooms || [],
              rDb.transactions || [],
              rDb.maintenances || []
            );
            setRooms(nextRooms);
            setTransactions(rDb.transactions);
            setMaintenances(rDb.maintenances);
            setAuditLogs(rDb.auditLogs);
            setWorkSessions(rDb.workSessions);
            setQcInspections(rDb.qcInspections);
            setBreakfastMenuItems(rDb.breakfastMenuItems || []);
            setBreakfastOrders(rDb.breakfastOrders || []);
            if (hasChanges) {
              dataStorage.saveRooms(nextRooms);
            }
            showToast(recovery.message, 'success');
          } else {
            // Validasi state lokal jika belum terhidrasi
            setRooms(prev => {
              const { nextRooms, hasChanges } = validateAndSyncRoomStates(prev, transactions, maintenances);
              if (hasChanges) dataStorage.saveRooms(nextRooms);
              return nextRooms;
            });
          }
        }
      } catch (err) {
        console.warn('Gagal memuat database dari Supabase:', err);
      }
    }
    loadCloudDatabase();
  }, []);

  // Sinkronisasi latar belakang otomatis saat berpindah tab (navigasi aplikasi maupun tab browser)
  const triggerBackgroundSync = async (reason?: string) => {
    try {
      setChecksumReport(prev => ({
        ...prev,
        status: 'CHECKING',
        message: reason ? `Sinkronisasi latar belakang (${reason})...` : 'Sinkronisasi latar belakang...'
      }));

      // Jika ada mutasi lokal yang sedang menunggu dikirim ke Supabase, segera dorong (flush) terlebih dahulu
      if (dataStorage.hasPendingSync()) {
        await dataStorage.flushPendingSync();
        setSupabaseSyncState(dataStorage.getSupabaseSyncState());
        await verifyDatabaseChecksum(true, {
          buildings: dataStorage.getBuildings(),
          rooms: dataStorage.getRooms(),
          meetingRooms: dataStorage.getMeetingRooms(),
          transactions: dataStorage.getTransactions(),
          maintenances: dataStorage.getMaintenances()
        });
        return;
      }

      // Periksa checksum terhadap Database Pusat (Supabase)
      const currentCheck = await validateDatabaseChecksumAgainstSupabase({
        buildings: dataStorage.getBuildings(),
        rooms: dataStorage.getRooms(),
        meetingRooms: dataStorage.getMeetingRooms(),
        transactions: dataStorage.getTransactions(),
        maintenances: dataStorage.getMaintenances()
      });

      if (currentCheck.status === 'MISMATCH') {
        // Tarik pembaruan dari Database Pusat secara otomatis di latar belakang agar antar-tab / Vercel & AI Studio selalu selaras
        const cloudDb = await dataStorage.hydrateFromSupabase(true);
        if (cloudDb) {
          setUsers(cloudDb.users);
          setBuildings(cloudDb.buildings || []);
          setMeetingRooms(cloudDb.meetingRooms || []);
          const { nextRooms, hasChanges } = validateAndSyncRoomStates(
            cloudDb.rooms || [],
            cloudDb.transactions || [],
            cloudDb.maintenances || []
          );
          setRooms(nextRooms);
          setTransactions(cloudDb.transactions);
          setMaintenances(cloudDb.maintenances);
          setAuditLogs(cloudDb.auditLogs);
          setWorkSessions(cloudDb.workSessions);
          setQcInspections(cloudDb.qcInspections);
          setBreakfastMenuItems(cloudDb.breakfastMenuItems || []);
          setBreakfastOrders(cloudDb.breakfastOrders || []);
          if (cloudDb.roomCapacityRates && Array.isArray(cloudDb.roomCapacityRates)) {
            setRoomCapacityRates(cloudDb.roomCapacityRates);
          }
          if (cloudDb.passwordResetRequests && Array.isArray(cloudDb.passwordResetRequests)) {
            setPasswordResetRequests(cloudDb.passwordResetRequests);
          }
          if (cloudDb.appSettings) setAppSettings(cloudDb.appSettings);
          if (hasChanges) {
            dataStorage.saveRooms(nextRooms);
          }
          setSupabaseSyncState(dataStorage.getSupabaseSyncState());
          await verifyDatabaseChecksum(true, {
            buildings: cloudDb.buildings || [],
            rooms: nextRooms,
            meetingRooms: cloudDb.meetingRooms || [],
            transactions: cloudDb.transactions || [],
            maintenances: cloudDb.maintenances || []
          });
          return;
        }
      }

      setChecksumReport(currentCheck);
      setSupabaseSyncState(dataStorage.getSupabaseSyncState());
    } catch (err) {
      console.warn('Background sync warning:', err);
    }
  };

  // Trigger background sync setiap kali pengguna berpindah tab menu di dalam aplikasi (activeTab)
  useEffect(() => {
    triggerBackgroundSync(`Menu ${activeTab}`);
  }, [activeTab]);

  // Trigger background sync setiap kali pengguna kembali ke tab browser / fokus jendela
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerBackgroundSync('Fokus Tab Browser');
      }
    };
    const handleWindowFocus = () => {
      triggerBackgroundSync('Fokus Jendela');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  const pullFromCentralDatabase = async () => {
    showToast('Menarik & menyamakan data dari Database Pusat (Supabase)...', 'info');
    try {
      const cloudDb = await dataStorage.hydrateFromSupabase(true);
      if (cloudDb) {
        setUsers(cloudDb.users);
        setBuildings(cloudDb.buildings || []);
        setMeetingRooms(cloudDb.meetingRooms || []);
        const { nextRooms, hasChanges } = validateAndSyncRoomStates(
          cloudDb.rooms || [],
          cloudDb.transactions || [],
          cloudDb.maintenances || []
        );
        setRooms(nextRooms);
        setTransactions(cloudDb.transactions);
        setMaintenances(cloudDb.maintenances);
        setAuditLogs(cloudDb.auditLogs);
        setWorkSessions(cloudDb.workSessions);
        setQcInspections(cloudDb.qcInspections);
        setBreakfastMenuItems(cloudDb.breakfastMenuItems || []);
        setBreakfastOrders(cloudDb.breakfastOrders || []);
        if (cloudDb.roomCapacityRates && Array.isArray(cloudDb.roomCapacityRates)) {
          setRoomCapacityRates(cloudDb.roomCapacityRates);
        }
        if (cloudDb.passwordResetRequests && Array.isArray(cloudDb.passwordResetRequests)) {
          setPasswordResetRequests(cloudDb.passwordResetRequests);
        }
        if (cloudDb.appSettings) setAppSettings(cloudDb.appSettings);
        if (hasChanges) {
          dataStorage.saveRooms(nextRooms);
        }
        await dataStorage.pushAllToSupabase();
        setSupabaseSyncState(dataStorage.getSupabaseSyncState());
        await verifyDatabaseChecksum(true, {
          buildings: cloudDb.buildings || [],
          rooms: nextRooms,
          meetingRooms: cloudDb.meetingRooms || [],
          transactions: cloudDb.transactions || [],
          maintenances: cloudDb.maintenances || []
        });
        showToast('Cache lokal berhasil diselaraskan 100% dengan Database Pusat!', 'success');
      } else {
        showToast('Tidak dapat menarik data dari Database Pusat.', 'warning');
      }
    } catch (err: any) {
      showToast(`Gagal menarik data pusat: ${err?.message || 'Error'}`, 'error');
    }
  };

  const manualSyncSupabase = async () => {
    showToast('Menghubungi Supabase Cloud...', 'info');
    try {
      const cloudDb = await dataStorage.hydrateFromSupabase(true);
      if (cloudDb) {
        setUsers(cloudDb.users);
        setBuildings(cloudDb.buildings || []);
        setMeetingRooms(cloudDb.meetingRooms || []);
        const { nextRooms, hasChanges } = validateAndSyncRoomStates(
          cloudDb.rooms || [],
          cloudDb.transactions || [],
          cloudDb.maintenances || []
        );
        setRooms(nextRooms);
        setTransactions(cloudDb.transactions);
        setMaintenances(cloudDb.maintenances);
        setAuditLogs(cloudDb.auditLogs);
        setWorkSessions(cloudDb.workSessions);
        setQcInspections(cloudDb.qcInspections);
        setBreakfastMenuItems(cloudDb.breakfastMenuItems || []);
        setBreakfastOrders(cloudDb.breakfastOrders || []);
        if (cloudDb.roomCapacityRates && Array.isArray(cloudDb.roomCapacityRates)) {
          setRoomCapacityRates(cloudDb.roomCapacityRates);
        }
        if (cloudDb.passwordResetRequests && Array.isArray(cloudDb.passwordResetRequests)) {
          setPasswordResetRequests(cloudDb.passwordResetRequests);
        }
        if (cloudDb.appSettings) setAppSettings(cloudDb.appSettings);
        setSupabaseSyncState(dataStorage.getSupabaseSyncState());
        if (hasChanges) {
          dataStorage.saveRooms(nextRooms);
        }
        await dataStorage.pushAllToSupabase();
        await verifyDatabaseChecksum(true, {
          buildings: cloudDb.buildings || [],
          rooms: nextRooms,
          meetingRooms: cloudDb.meetingRooms || [],
          transactions: cloudDb.transactions || [],
          maintenances: cloudDb.maintenances || []
        });
        showToast('Sinkronisasi & Validasi Checksum Supabase berhasil diperbarui!', 'success');
      } else {
        const pushRes = await dataStorage.pushAllToSupabase();
        setSupabaseSyncState(dataStorage.getSupabaseSyncState());
        await verifyDatabaseChecksum(true);
        if (pushRes.success) {
          showToast('Data berhasil disimpan ke Supabase Cloud!', 'success');
        } else {
          showToast(`Koneksi Supabase: ${pushRes.error || 'Terhubung'}`, 'warning');
        }
      }
    } catch (err: any) {
      showToast(`Gagal sinkronisasi: ${err?.message || 'Error'}`, 'error');
    }
  };

  const pushAllToSupabase = async () => {
    showToast('Mengunggah seluruh basis data ke Supabase...', 'info');
    const res = await dataStorage.pushAllToSupabase();
    setSupabaseSyncState(dataStorage.getSupabaseSyncState());
    await verifyDatabaseChecksum(true);
    if (res.success) {
      showToast('Seluruh data berhasil disimpan & diverifikasi dengan Supabase Cloud!', 'success');
    } else {
      showToast(`Gagal mengunggah ke Supabase: ${res.error || 'Error'}`, 'error');
    }
  };

  // Switch storage namespace and refresh in-memory state
  const switchStorageNamespace = (newNs: StorageNamespace) => {
    setStorageNamespace(newNs);
    const db = dataStorage.getDatabase();
    setUsers(db.users);
    setBuildings(db.buildings || []);
    setMeetingRooms(db.meetingRooms || []);
    setRooms(db.rooms);
    setTransactions(db.transactions);
    setMaintenances(db.maintenances);
    setAuditLogs(db.auditLogs);
    setWorkSessions(db.workSessions);
    setQcInspections(db.qcInspections);
    setChatChannels(db.chatChannels);
    setChatMessages(db.chatMessages);
    setBreakfastMenuItems(db.breakfastMenuItems || []);
    setBreakfastOrders(db.breakfastOrders || []);
    setRoomCapacityRates(db.roomCapacityRates || []);
    setPasswordResetRequests(db.passwordResetRequests || []);
    setAppSettings(db.appSettings || dataStorage.getAppSettings());
  };

  // Sync state changes with dataStorage for durable persistence
  useEffect(() => {
    dataStorage.saveDatabase({
      schemaVersion: 2,
      appName: 'SIM-Akomodasi UPT Asrama Haji Jakarta',
      exportedAt: new Date().toISOString(),
      appSettings: dataStorage.getAppSettings(),
      users,
      buildings,
      meetingRooms,
      rooms,
      transactions,
      maintenances,
      qcInspections,
      workSessions,
      auditLogs,
      chatChannels,
      chatMessages,
      breakfastMenuItems,
      breakfastOrders,
      roomCapacityRates,
      passwordResetRequests
    }, storageNamespace);
  }, [storageNamespace, users, buildings, meetingRooms, rooms, transactions, maintenances, qcInspections, workSessions, auditLogs, chatChannels, chatMessages, breakfastMenuItems, breakfastOrders, roomCapacityRates, passwordResetRequests]);

  // Auto-dismiss notification toast after 7 seconds
  useEffect(() => {
    if (!chatNotificationToast) return;
    const timer = setTimeout(() => {
      setChatNotificationToast(null);
    }, 7000);
    return () => clearTimeout(timer);
  }, [chatNotificationToast]);

  // Dynamic calculation of unread messages for current user
  const unreadTotalCount = currentUser
    ? chatMessages.filter(m => {
        if (m.senderId === currentUser.id) return false;
        if (m.readBy.includes(currentUser.id)) return false;
        const channel = chatChannels.find(c => c.id === m.channelId);
        if (!channel) return false;
        return isSuperAdmin(currentUser.role) || channel.participantIds.includes(currentUser.id);
      }).length
    : 0;

  const markChannelAsRead = (channelId: string) => {
    if (!currentUser) return;
    setChatMessages(prev => prev.map(m => {
      if (m.channelId === channelId && !m.readBy.includes(currentUser.id)) {
        return { ...m, readBy: [...m.readBy, currentUser.id] };
      }
      return m;
    }));
  };

  const openChat = (channelId?: string) => {
    setIsChatOpen(true);
    if (channelId) {
      const exists = chatChannels.some(c => c.id === channelId);
      if (!exists && channelId.startsWith('dm-')) {
        const parts = channelId.split('-');
        const otherId = parts.find(p => p !== 'dm' && p !== currentUser?.id);
        const otherUser = users.find(u => u.id === otherId);
        if (otherUser && currentUser) {
          const newDirectChannel: ChatChannel = {
            id: channelId,
            name: otherUser.fullName,
            type: 'DIRECT',
            scope: 'DIRECT' as any,
            participantIds: [currentUser.id, otherUser.id],
            description: `Obrolan Pribadi dengan ${otherUser.fullName} (${otherUser.role})`,
            icon: 'fa-user',
            lastMessage: 'Obrolan pribadi siap digunakan.',
            lastMessageTime: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            lastSenderName: 'Sistem'
          };
          setChatChannels(prev => [newDirectChannel, ...prev]);
        }
      }
      setActiveChatChannelId(channelId);
      markChannelAsRead(channelId);
    } else if (activeChatChannelId) {
      markChannelAsRead(activeChatChannelId);
    }
  };

  const closeChat = () => {
    setIsChatOpen(false);
  };

  const handleSetActiveChatChannelId = (channelId: string | null) => {
    setActiveChatChannelId(channelId);
    if (channelId) {
      markChannelAsRead(channelId);
    }
  };

  const toggleChatSound = () => {
    setChatSoundEnabled(prev => {
      const next = !prev;
      if (next) {
        playNotificationSound();
        showToast("Suara notifikasi pesan diaktifkan", "info");
      } else {
        showToast("Suara notifikasi pesan dinonaktifkan (senyap)", "warning");
      }
      return next;
    });
  };

  const dismissChatNotification = () => {
    setChatNotificationToast(null);
  };

  const sendChatMessage = (channelId: string, text: string, priority: 'NORMAL' | 'PENTING' | 'URGENT' = 'NORMAL', isInstruction: boolean = false) => {
    if (!currentUser || !text.trim()) return;

    const now = new Date();
    const timeFormatted = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      channelId,
      senderId: currentUser.id,
      senderName: currentUser.fullName,
      senderRole: currentUser.role,
      senderDepartment: currentUser.department || 'Operasional',
      message: text.trim(),
      timestamp,
      timeFormatted,
      priority,
      isInstruction,
      readBy: [currentUser.id]
    };

    dataStorage.saveChatMessage(newMsg);
    setChatMessages(dataStorage.getChatMessages());
    setChatChannels(dataStorage.getDatabase().chatChannels || []);
    syncFullDatabaseToSupabase(dataStorage.getDatabase()).catch(err => console.warn('Gagal sync chat ke Supabase:', err));

    if (isInstruction || priority === 'URGENT') {
      logAudit(
        isInstruction ? 'Instruksi Chat Resmi' : 'Chat Urgent',
        `${currentUser.fullName} (${currentUser.role}) mengirimkan ${isInstruction ? 'instruksi tugas' : 'pesan mendesak'}: "${text.trim().substring(0, 75)}..."`
      );
    }
  };

  const simulateIncomingChatMessage = (targetChannelId?: string) => {
    if (!currentUser) return;

    let targetChannel: ChatChannel | undefined;
    let sender: User | undefined;
    let text = '';
    let priority: 'NORMAL' | 'PENTING' | 'URGENT' = 'NORMAL';
    let isInstruction = false;

    if (targetChannelId) {
      targetChannel = chatChannels.find(c => c.id === targetChannelId);
    }

    if (targetChannel) {
      const otherParticipantId = targetChannel.participantIds.find(id => id !== currentUser.id);
      sender = users.find(u => u.id === otherParticipantId);
    }

    if (!targetChannel || !sender) {
      if (currentUser.role === 'Manager Resepsionis') {
        targetChannel = chatChannels.find(c => c.id === 'dm-u2-u5') || chatChannels[0];
        sender = users.find(u => u.id === 'u5'); // Ir. Hendra Kusuma (Manager QC)
        text = 'Bu Siti, kamar A-105 dan A-106 baru selesai diverifikasi dan LOLOS QC. Siap untuk check-in jemaah sore ini!';
        priority = 'PENTING';
      } else if (currentUser.role === 'Manager QC') {
        targetChannel = chatChannels.find(c => c.id === 'dm-u5-u8') || chatChannels[0];
        sender = users.find(u => u.id === 'u8'); // H. Joko Susilo, ST (Manager Teknisi)
        text = 'Pak Hendra, perbaikan keran wastafel dan shower di C-104 sudah tuntas diganti part baru. Mohon tim QC verifikasi kelayakannya.';
        priority = 'NORMAL';
      } else if (currentUser.role === 'Manager Teknisi') {
        targetChannel = chatChannels.find(c => c.id === 'dm-u5-u8') || chatChannels[0];
        sender = users.find(u => u.id === 'u5'); // Ir. Hendra Kusuma (Manager QC)
        text = 'Pak Joko, ada temuan rembesan AC di Gedung Mina kamar 208 saat inspeksi. Mohon segera kirim teknisi untuk penanganan darurat ya!';
        priority = 'URGENT';
        isInstruction = true;
      } else if (currentUser.role === 'Manager Koperasi') {
        targetChannel = chatChannels.find(c => c.id === 'dm-u2-u11') || chatChannels[0];
        sender = users.find(u => u.role === 'Manager Resepsionis' || u.id === 'u-mgr-resepsionis') || users.find(u => u.role.includes('Resepsionis')) || users[0];
        text = 'Bu Rina, rombongan jemaah Kloter 03 sebanyak 120 orang tiba malam ini. Mohon disiapkan sarapan pagi box jam 05.30 WIB.';
        priority = 'PENTING';
      } else if (currentUser.role.includes('Teknisi')) {
        targetChannel = chatChannels.find(c => c.id === `dm-u8-${currentUser.id}` || c.id === 'group-teknisi') || chatChannels[0];
        sender = users.find(u => u.id === 'u8'); // Manager Teknisi
        text = `Instruksi Segera: Lakukan pengecekan darurat fasilitas pompa air Gedung Arafah. Pastikan seluruh debit air lancar!`;
        priority = 'URGENT';
        isInstruction = true;
      } else if (currentUser.role.includes('Resepsionis')) {
        targetChannel = chatChannels.find(c => c.id === `dm-u2-${currentUser.id}` || c.id === 'group-recep') || chatChannels[0];
        sender = users.find(u => u.id === 'u2'); // Manager Resepsionis
        text = `Arahan Manager: Pastikan formulir data jemaah lansia dan kunci kamar cadangan sudah disiapkan rapi di meja lobi ya.`;
        priority = 'PENTING';
        isInstruction = true;
      } else if (currentUser.role.includes('QC') || currentUser.role.includes('Quality')) {
        targetChannel = chatChannels.find(c => c.id === `dm-u5-${currentUser.id}` || c.id === 'group-qc') || chatChannels[0];
        sender = users.find(u => u.id === 'u5'); // Manager QC
        text = `Instruksi Manager: Tolong prioritaskan uji sanitasi dan kelayakan linen di lantai 2 Gedung Muzdalifah sebelum pukul 17.00.`;
        priority = 'PENTING';
        isInstruction = true;
      } else if (currentUser.role.includes('Koperasi')) {
        targetChannel = chatChannels.find(c => c.id === 'group-koperasi' || c.id === 'dm-u11-u12') || chatChannels[0];
        sender = users.find(u => u.id === 'u11'); // Manager Koperasi
        text = `Siti, koordinasikan tim dapur untuk pengemasan box sarapan higienis jemaah kloter baru.`;
        priority = 'NORMAL';
        isInstruction = true;
      } else {
        targetChannel = chatChannels.find(c => c.id === 'channel-all-managers') || chatChannels[0];
        sender = users.find(u => u.id === 'u2') || users[1];
        text = 'Lapor Pak Pimpinan, seluruh koordinasi operasional antar divisi hari ini berjalan optimal dan tertib.';
        priority = 'NORMAL';
      }
    }

    if (!sender) {
      sender = users.find(u => u.id !== currentUser.id) || users[0];
    }
    if (!text) {
      text = 'Halo, koordinasi operasional Asrama Haji terpantau aman dan terkendali.';
    }

    const now = new Date();
    const timeFormatted = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);

    const incomingMsg: ChatMessage = {
      id: `sim-msg-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      channelId: targetChannel.id,
      senderId: sender.id,
      senderName: sender.fullName,
      senderRole: sender.role,
      senderDepartment: sender.department || 'Operasional',
      message: text,
      timestamp,
      timeFormatted,
      priority,
      isInstruction,
      readBy: [sender.id]
    };

    setChatMessages(prev => [...prev, incomingMsg]);

    setChatChannels(prev => prev.map(c => {
      if (c.id === targetChannel!.id) {
        return {
          ...c,
          lastMessage: text,
          lastMessageTime: timeFormatted,
          lastSenderName: sender!.fullName
        };
      }
      return c;
    }));

    if (chatSoundEnabled) {
      playNotificationSound();
    }

    setChatNotificationToast({
      message: incomingMsg,
      channelName: targetChannel.name,
      channelId: targetChannel.id
    });
  };

  const [loginTime, setLoginTime] = useState<number | null>(null);

  const showToast = (msg: string, type: string = 'info') => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const logAudit = (action: string, details: string, durationMinutes?: number) => {
    const entry: AuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      user: currentUser ? currentUser.fullName : 'System',
      role: currentUser ? currentUser.role : 'System',
      action,
      details,
      durationMinutes
    };
    dataStorage.addAuditLog(entry);
    setAuditLogs(prev => [entry, ...prev.filter(l => l.id !== entry.id)]);
  };

  const addAuditLog = (log: AuditLog): AuditLog => {
    const saved = dataStorage.addAuditLog(log);
    setAuditLogs(prev => [saved, ...prev.filter(l => l.id !== saved.id && (!saved.verificationCode || l.verificationCode !== saved.verificationCode))]);
    return saved;
  };

  // Sinkronisasi otomatis saat ada log unduh PDF yang ditambahkan dari modul ekspor PDF
  useEffect(() => {
    const handleLogAdded = (event: any) => {
      const newLog = event?.detail as AuditLog;
      if (newLog) {
        setAuditLogs(prev => [newLog, ...prev.filter(l => l.id !== newLog.id && (!newLog.verificationCode || l.verificationCode !== newLog.verificationCode))]);
      }
    };
    window.addEventListener('sim_haji_audit_log_added', handleLogAdded);
    return () => window.removeEventListener('sim_haji_audit_log_added', handleLogAdded);
  }, []);

  const login = (user: User, _preferNamespace?: StorageNamespace, rememberDevice: boolean = false) => {
    if (user.status === 'Menunggu Persetujuan') {
      showToast("Pendaftaran akun Anda masih menunggu persetujuan (ACC) dari Administrator!", "warning");
      return;
    }
    if (user.status === 'Non-Aktif') {
      showToast("Akses Ditolak: Akun petugas ini berstatus Non-Aktif. Hubungi Administrator!", "error");
      return;
    }

    try {
      if (rememberDevice) {
        localStorage.setItem('sim_haji_remember_session', 'true');
        localStorage.setItem('sim_haji_current_user', JSON.stringify(user));
        sessionStorage.setItem('sim_haji_current_user', JSON.stringify(user));
      } else {
        localStorage.setItem('sim_haji_remember_session', 'false');
        localStorage.removeItem('sim_haji_current_user');
        sessionStorage.setItem('sim_haji_current_user', JSON.stringify(user));
      }
    } catch (_) {}

    setCurrentUser(user);
    const now = new Date();
    const loginTimeStr = getRealLocalDateTimeStr(now);

    // Periksa apakah pengguna ini sudah memiliki sesi AKTIF yang belum ditutup
    const existingActive = workSessions.find(
      s => s.userId === user.id && s.status === 'AKTIF' && !s.logoutTime
    );

    if (existingActive) {
      // Lanjutkan sesi aktif yang sudah ada tanpa membuat duplikat sesi baru
      setActiveSessionId(existingActive.id);
      const parsedStart = parseLocalTimeString(existingActive.loginTime).getTime();
      setLoginTime(parsedStart);
      logAudit(
        "Login System", 
        `Petugas ${user.fullName} (${user.role}) melanjutkan sesi kerja aktif (${existingActive.id})`
      );
      showToast(`Melanjutkan sesi aktif, ${user.fullName} (${user.role})!`, "success");
      setActiveTab('dashboard');
      return;
    }

    const nowMs = now.getTime();
    setLoginTime(nowMs);

    const newSessionId = `SESI-${Date.now().toString().slice(-4)}`;
    setActiveSessionId(newSessionId);

    const newSession: WorkSession = {
      id: newSessionId,
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      loginTime: loginTimeStr,
      logoutTime: null,
      durationSeconds: 0,
      durationFormatted: '0 Jam 0 Menit 0 Detik (Sedang Berjalan)',
      status: 'AKTIF',
      notes: `Sesi login petugas (${user.role} - ${user.department || 'Operasional'})`
    };

    setWorkSessions(prev => {
      // Tutup sesi aktif lain yang mungkin tertinggal dari akun yang sama
      const sanitized = prev.map(s => {
        if (s.userId === user.id && s.status === 'AKTIF') {
          const sTime = parseLocalTimeString(s.loginTime).getTime();
          const sDur = Math.max(1, Math.floor((nowMs - sTime) / 1000));
          return {
            ...s,
            status: 'SELESAI' as const,
            logoutTime: loginTimeStr,
            durationSeconds: sDur,
            durationFormatted: formatHMS(sDur)
          };
        }
        return s;
      });
      return [newSession, ...sanitized];
    });

    logAudit(
      "Login System", 
      `Petugas ${user.fullName} (${user.role}) masuk bertugas pada ${loginTimeStr}`
    );

    showToast(`Selamat datang, ${user.fullName} (${user.role})!`, "success");

    // All roles land on Dashboard
    setActiveTab('dashboard');
  };

  const logout = () => {
    if (currentUser) {
      const now = new Date();
      const logoutTimeStr = getRealLocalDateTimeStr(now);
      const nowMs = now.getTime();
      let totalSeconds = 0;
      let durationStr = "0 Jam 0 Menit 0 Detik";

      setWorkSessions(prev => prev.map(s => {
        if (s.id === activeSessionId || (s.userId === currentUser.id && s.status === 'AKTIF')) {
          const sTime = parseLocalTimeString(s.loginTime).getTime();
          const sDur = Math.max(1, Math.floor((nowMs - sTime) / 1000));
          const sFormatted = formatHMS(sDur);
          totalSeconds = sDur;
          durationStr = sFormatted;
          return {
            ...s,
            logoutTime: logoutTimeStr,
            durationSeconds: sDur,
            durationFormatted: sFormatted,
            status: 'SELESAI' as const
          };
        }
        return s;
      }));

      const totalMins = Math.floor(totalSeconds / 60);
      logAudit(
        "Logout System",
        `Petugas ${currentUser.fullName} (${currentUser.role}) checkout tugas pada ${logoutTimeStr}. Durasi kerja: ${durationStr}.`,
        totalMins
      );
    }
    setCurrentUser(null);
    setLoginTime(null);
    setActiveSessionId(null);
    try {
      localStorage.removeItem('sim_haji_current_user');
      sessionStorage.removeItem('sim_haji_current_user');
      localStorage.removeItem('sim_haji_active_session_id');
    } catch (_) {}
    showToast("Anda telah keluar dari sistem (Check-Out Shift).", "info");
  };

  const clearWorkSessions = () => {
    setWorkSessions([]);
    setActiveSessionId(null);
    setLoginTime(null);
    logAudit("Reset Sesi Kerja", "Daftar rekap riwayat sesi & jam kerja petugas telah dibersihkan.");
    showToast("Rekap sesi dan jam kerja berhasil direset!", "success");
  };

  const addUser = (user: User) => {
    if (!isSuperAdmin(currentUser?.role)) {
      showToast("Akses Ditolak: Hanya Administrator yang berwenang menambah akun petugas!", "error");
      return;
    }
    setUsers(prev => [...prev, user]);
    dataStorage.saveUser(user);
    logAudit("Tambah User", `Membuat akun baru: ${user.username} (${user.role}) - ${user.department || 'Operasional'}`);
    showToast(`Akun petugas ${user.fullName} (${user.role}) berhasil ditambahkan ke direktori pengguna!`, "success");
  };

  const updateUser = (updatedUser: User) => {
    if (!isSuperAdmin(currentUser?.role) && currentUser?.id !== updatedUser.id) {
      showToast("Akses Ditolak: Hanya Administrator yang berwenang mengubah data akun petugas!", "error");
      return;
    }
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    dataStorage.saveUser(updatedUser);
    if (currentUser && currentUser.id === updatedUser.id) {
      setCurrentUser(updatedUser);
      try {
        localStorage.setItem('sim_haji_current_user', JSON.stringify(updatedUser));
        sessionStorage.setItem('sim_haji_current_user', JSON.stringify(updatedUser));
      } catch (_) {}
    }
    logAudit("Ubah Akun", `Memperbarui akun: ${updatedUser.username} (${updatedUser.fullName}) - ${updatedUser.role}`);
    showToast(`Data petugas ${updatedUser.fullName} berhasil diperbarui di sistem!`, "success");
  };

  const toggleUserStatus = (userId: string) => {
    if (!isSuperAdmin(currentUser?.role)) {
      showToast("Akses Ditolak: Hanya Administrator yang berwenang mengubah status akun!", "error");
      return;
    }
    const target = users.find(u => u.id === userId);
    if (!target) return;
    if (target.id === currentUser?.id) {
      showToast("Anda tidak dapat menonaktifkan akun yang sedang aktif Anda gunakan!", "warning");
      return;
    }
    const newStatus = target.status === 'Aktif' ? 'Non-Aktif' : 'Aktif';
    const updatedUser = { ...target, status: newStatus };
    setUsers(prev => prev.map(u => u.id === userId ? updatedUser : u));
    dataStorage.saveUser(updatedUser);
    logAudit("Status User", `Mengubah status akun ${target.username} (${target.fullName}) menjadi ${newStatus}`);
    showToast(`Status akun ${target.fullName} diubah menjadi ${newStatus}`, newStatus === 'Aktif' ? 'success' : 'info');
  };

  const deleteUser = (userId: string) => {
    if (!isSuperAdmin(currentUser?.role)) {
      showToast("Akses Ditolak: Hanya Administrator yang berwenang menghapus akun!", "error");
      return;
    }
    const target = users.find(u => u.id === userId);
    if (!target) return;
    if (target.id === currentUser?.id) {
      showToast("Anda tidak dapat menghapus akun Anda sendiri!", "warning");
      return;
    }
    setUsers(prev => prev.filter(u => u.id !== userId));
    dataStorage.deleteUser(userId);
    logAudit("Hapus User", `Menghapus akun ${target.username} (${target.fullName})`);
    showToast(`Akun ${target.fullName} berhasil dihapus dari sistem.`, "info");
  };

  const requestPasswordReset = (username: string, newPassword: string, notes?: string): { success: boolean; message: string } => {
    const cleanUser = username.trim().toLowerCase();
    const foundUser = users.find(u => u.username.toLowerCase() === cleanUser) || dataStorage.getUserByUsername(cleanUser);
    if (!foundUser) {
      return { success: false, message: 'Username / NIP tidak ditemukan dalam direktori petugas!' };
    }
    if (!newPassword || newPassword.trim().length < 3) {
      return { success: false, message: 'Kata sandi baru minimal 3 karakter!' };
    }

    const newReq: PasswordResetRequest = {
      id: `pr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId: foundUser.id,
      username: foundUser.username,
      fullName: foundUser.fullName,
      role: foundUser.role,
      newPassword: newPassword.trim(),
      requestDate: getRealLocalDateTimeStr(),
      status: 'MENUNGGU_PERSETUJUAN',
      notes: notes?.trim() || 'Permohonan reset kata sandi diajukan oleh petugas'
    };

    setPasswordResetRequests(prev => [newReq, ...prev]);
    dataStorage.savePasswordResetRequest(newReq);
    logAudit('PERMOHONAN_RESET_PASSWORD', `Pengajuan reset kata sandi baru untuk akun ${foundUser.fullName} (${foundUser.username})`);
    return { 
      success: true, 
      message: 'Permohonan kata sandi baru berhasil diajukan! Kata sandi akan aktif setelah disetujui (ACC) oleh Administrator.' 
    };
  };

  const approvePasswordReset = (requestId: string): boolean => {
    const req = (passwordResetRequests || []).find(r => r.id === requestId) || dataStorage.getPasswordResetRequests().find(r => r.id === requestId);
    if (!req) {
      showToast("Permohonan reset kata sandi tidak ditemukan atau telah diproses!", "error");
      return false;
    }

    // 1. Perbarui kata sandi di dataStorage dan state users
    let targetUser = users.find(u => u.id === req.userId || u.username.toLowerCase() === req.username.toLowerCase()) || dataStorage.getUserByUsername(req.username);
    if (targetUser) {
      const updatedUser: User = { ...targetUser, password: req.newPassword };
      setUsers(prevUsers => prevUsers.map(u => (u.id === targetUser!.id ? updatedUser : u)));
      dataStorage.saveUser(updatedUser);
    }

    // 2. Perbarui status permohonan menjadi DISETUJUI
    const updatedReq: PasswordResetRequest = {
      ...req,
      status: 'DISETUJUI',
      processedBy: currentUser?.fullName || 'Administrator Operasional',
      processedAt: getRealLocalDateTimeStr()
    };
    setPasswordResetRequests(prev => prev.map(r => r.id === requestId ? updatedReq : r));
    dataStorage.savePasswordResetRequest(updatedReq);

    logAudit('ACC_RESET_PASSWORD', `Menyetujui perubahan kata sandi akun ${req.username} (${req.fullName})`);
    showToast(`Kata sandi baru untuk ${req.fullName} (@${req.username}) BERHASIL DI-ACC! Petugas kini dapat masuk dengan sandi baru.`, 'success');
    return true;
  };

  const rejectPasswordReset = (requestId: string, notes?: string): boolean => {
    const req = (passwordResetRequests || []).find(r => r.id === requestId) || dataStorage.getPasswordResetRequests().find(r => r.id === requestId);
    if (!req) {
      showToast("Permohonan reset kata sandi tidak ditemukan atau telah diproses!", "error");
      return false;
    }

    const updatedReq: PasswordResetRequest = {
      ...req,
      status: 'DITOLAK',
      notes: notes ? `${req.notes || ''} [Catatan Penolakan: ${notes}]` : req.notes,
      processedBy: currentUser?.fullName || 'Administrator Operasional',
      processedAt: getRealLocalDateTimeStr()
    };
    setPasswordResetRequests(prev => prev.map(r => r.id === requestId ? updatedReq : r));
    dataStorage.savePasswordResetRequest(updatedReq);

    logAudit('REJECT_RESET_PASSWORD', `Menolak permohonan reset kata sandi akun ${req.username}`);
    showToast(`Permohonan reset kata sandi untuk @${req.username} (${req.fullName}) TELAH DITOLAK.`, 'info');
    return true;
  };

  const registerAccountRequest = (userData: {
    fullName: string;
    username: string;
    password?: string;
    role: UserRole;
    department?: string;
    phone: string;
    assignedBuilding?: string;
  }): { success: boolean; message: string } => {
    const cleanUser = userData.username.trim().toLowerCase();
    if (!cleanUser) {
      return { success: false, message: 'Username / NIP tidak boleh kosong!' };
    }
    const exists = users.find(u => u.username.toLowerCase() === cleanUser) || dataStorage.getUserByUsername(cleanUser);
    if (exists) {
      return { success: false, message: `Username "${userData.username}" sudah digunakan di sistem!` };
    }

    const newUser: User = {
      id: `u-reg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      fullName: userData.fullName.trim(),
      username: cleanUser,
      password: userData.password?.trim() || '12345',
      role: userData.role || 'Resepsionis',
      department: userData.department || 'Pelayanan & Resepsionis',
      assignedBuilding: userData.assignedBuilding || 'Semua Gedung',
      supervisorId: null,
      phone: userData.phone.trim() || '-',
      status: 'Menunggu Persetujuan'
    };

    setUsers(prev => [newUser, ...prev]);
    dataStorage.saveUser(newUser);
    logAudit('DAFTAR_AKUN_BARU', `Pendaftaran akun baru: ${newUser.fullName} (${newUser.username}) - menunggu persetujuan Administrator`);
    return { 
      success: true, 
      message: 'Pendaftaran akun berhasil dikirim! Akun Anda sedang menunggu persetujuan (ACC) dari Administrator sebelum dapat masuk.' 
    };
  };

  const approveUserRegistration = (userId: string): boolean => {
    const target = users.find(u => u.id === userId) || dataStorage.getUserById(userId);
    if (!target) {
      showToast("Akun pendaftaran tidak ditemukan atau sudah diproses!", "error");
      return false;
    }

    const updatedUser: User = { ...target, status: 'Aktif' };
    setUsers(prev => prev.map(u => u.id === userId ? updatedUser : u));
    dataStorage.saveUser(updatedUser);

    logAudit('ACC_PENDAFTARAN_AKUN', `Menyetujui pendaftaran akun petugas: ${target.fullName} (${target.username}) sebagai ${target.role}`);
    showToast(`Akun ${target.fullName} (@${target.username}) BERHASIL DI-ACC & AKTIF! Petugas sekarang dapat login.`, 'success');
    return true;
  };

  const rejectUserRegistration = (userId: string): boolean => {
    const target = users.find(u => u.id === userId) || dataStorage.getUserById(userId);
    if (!target) {
      showToast("Akun pendaftaran tidak ditemukan atau sudah diproses!", "error");
      return false;
    }

    setUsers(prev => prev.filter(u => u.id !== userId));
    dataStorage.deleteUser(userId);

    logAudit('REJECT_PENDAFTARAN_AKUN', `Menolak dan menghapus pendaftaran akun petugas: ${target.fullName} (${target.username})`);
    showToast(`Pendaftaran akun ${target.fullName} (@${target.username}) TELAH DITOLAK dan dihapus dari sistem.`, 'info');
    return true;
  };

  const addTransaction = (tx: Transaction) => {
    if (!isRecepRole(currentUser?.role)) {
      showToast("Akses Ditolak: Hanya staf Resepsionis yang berwenang memproses Check-In & Booking!", "error");
      return;
    }
    const stampedTx: Transaction = {
      ...tx,
      createdAt: tx.createdAt || new Date().toISOString()
    };
    setTransactions(prev => {
      const next = [...prev, stampedTx];
      dataStorage.saveTransactions(next);
      return next;
    });

    if (stampedTx.breakfast && (!stampedTx.cateringPackage || stampedTx.cateringPackage !== 'TIDAK')) {
      const newOrder: BreakfastOrder = {
        id: `BO-TX-${stampedTx.id}`,
        roomNumber: stampedTx.roomNumber,
        building: stampedTx.building,
        guestName: stampedTx.guestName,
        phone: stampedTx.phone,
        kloter: stampedTx.kloter,
        transactionId: stampedTx.id,
        startDate: stampedTx.startDate,
        days: stampedTx.breakfastDays || stampedTx.duration || 1,
        portions: stampedTx.breakfastPortions || 1,
        menuName: stampedTx.breakfastMenu || (stampedTx.building === 'Ruang Pertemuan' ? 'Snack Box Pertemuan & Kopi' : 'Nasi Goreng Spesial'),
        deliveryTime: '06:30 WIB',
        status: (stampedTx.breakfastStatus as any) || 'MENUNGGU',
        notes: stampedTx.notes || (stampedTx.building === 'Ruang Pertemuan' ? 'Konsumsi ruang pertemuan / aula' : 'Pesanan sarapan reservasi kamar'),
        dietaryRestriction: 'Biasa',
        pricePerPortion: 25000,
        totalPrice: (stampedTx.breakfastPortions || 1) * 25000 * (stampedTx.breakfastDays || stampedTx.duration || 1),
        createdAt: stampedTx.createdAt || `${stampedTx.startDate} 06:00:00`
      };
      setBreakfastOrders(prev => [newOrder, ...prev.filter(o => o.id !== newOrder.id)]);
      dataStorage.saveBreakfastOrder(newOrder);
    }

    setRooms(prev => {
      const updatedRooms = prev.map(r => {
        if (r.id === tx.roomId || (r.roomNumber === tx.roomNumber && (!tx.building || normalizeBuildingName(tx.building) === normalizeBuildingName(r.building)))) {
          if (r.status === 'KOSONG' || tx.status === 'TERISI') {
            return { ...r, status: tx.status as any, activeTxId: tx.id };
          }
        }
        return r;
      });
      dataStorage.saveRooms(updatedRooms);
      return updatedRooms;
    });

    setMeetingRooms(prev => {
      const updatedMR = prev.map(mr => {
        if (mr.id === tx.roomId || mr.name === tx.roomNumber) {
          return {
            ...mr,
            status: tx.status === 'TERISI' ? 'TERPAKAI' : (tx.status === 'BOOKED' ? 'TERSEDIA' : mr.status),
            activeTxId: tx.id
          };
        }
        return mr;
      });
      dataStorage.saveMeetingRooms(updatedMR);
      return updatedMR;
    });
    logAudit(tx.status === 'BOOKED' ? "BOOKING" : "CHECKIN", `Untuk ${tx.roomNumber} (${tx.guestName})`);
    showToast(`Transaksi berhasil dikonfirmasi!`, "success");
  };

  const addGroupBooking = (txList: Transaction[], groupName: string) => {
    if (!isRecepRole(currentUser?.role)) {
      showToast("Akses Ditolak: Hanya staf Resepsionis & Admin yang berwenang mendaftarkan rombongan!", "error");
      return;
    }
    const nowIso = new Date().toISOString();
    const stampedTxList = txList.map(tx => ({
      ...tx,
      createdAt: tx.createdAt || nowIso
    }));
    setTransactions(prev => {
      const next = [...prev, ...stampedTxList];
      dataStorage.saveTransactions(next);
      return next;
    });

    // Create breakfast orders for group transactions that have breakfast
    const groupBreakfastOrders: BreakfastOrder[] = [];
    stampedTxList.forEach(tx => {
      if (tx.breakfast && (!tx.cateringPackage || tx.cateringPackage !== 'TIDAK')) {
        const order: BreakfastOrder = {
          id: `BO-TX-${tx.id}`,
          roomNumber: tx.roomNumber,
          building: tx.building,
          guestName: tx.guestName,
          phone: tx.phone,
          kloter: tx.kloter,
          transactionId: tx.id,
          startDate: tx.startDate,
          days: tx.breakfastDays || tx.duration || 1,
          portions: tx.breakfastPortions || 1,
          menuName: tx.breakfastMenu || (tx.building === 'Ruang Pertemuan' ? 'Snack Box Pertemuan' : 'Nasi Kotak Rombongan'),
          deliveryTime: '06:30 WIB',
          status: (tx.breakfastStatus as any) || 'MENUNGGU',
          notes: `[Rombongan: ${groupName}] Pesanan katering rombongan`,
          dietaryRestriction: 'Biasa',
          pricePerPortion: 25000,
          totalPrice: (tx.breakfastPortions || 1) * 25000 * (tx.breakfastDays || tx.duration || 1),
          createdAt: `${tx.startDate} 06:00:00`
        };
        groupBreakfastOrders.push(order);
        dataStorage.saveBreakfastOrder(order);
      }
    });
    if (groupBreakfastOrders.length > 0) {
      setBreakfastOrders(prev => [...groupBreakfastOrders, ...prev]);
    }

    setRooms(prev => {
      const updatedRooms = prev.map(r => {
        const matchTx = txList.find(t => t.roomId === r.id);
        if (matchTx) {
          return { ...r, status: matchTx.status as any, activeTxId: matchTx.id };
        }
        return r;
      });
      dataStorage.saveRooms(updatedRooms);
      return updatedRooms;
    });
    logAudit("REGISTRASI_ROMBONGAN", `Mendaftarkan rombongan "${groupName}" sebanyak ${txList.length} fasilitas.`);
    showToast(`Rombongan "${groupName}" (${txList.length} kamar/fasilitas) berhasil didaftarkan!`, "success");
  };

  const updateGroupBooking = (editGroupId: string, txList: Transaction[], groupName: string) => {
    if (!isRecepRole(currentUser?.role)) {
      showToast("Akses Ditolak: Hanya staf Resepsionis & Admin yang berwenang mengubah data rombongan!", "error");
      return;
    }

    const newRoomIds = new Set(txList.map(t => t.roomId));
    let nextTransactions: Transaction[] = [];

    setTransactions(prev => {
      const filtered = prev.filter(t => {
        if (t.groupId === editGroupId) return false;
        if (t.isGroup && t.groupName && t.groupName.toLowerCase() === groupName.toLowerCase() && newRoomIds.has(t.roomId)) return false;
        return true;
      });
      nextTransactions = [...filtered, ...txList];
      dataStorage.saveTransactions(nextTransactions);
      return nextTransactions;
    });

    // Synchronize breakfast orders for the group
    setBreakfastOrders(prev => {
      let updatedOrders = [...prev];

      // 1. Remove breakfast orders for transactions in this group that no longer include breakfast
      const removedTxIds = new Set(
        txList.filter(t => !t.breakfast || t.cateringPackage === 'TIDAK').map(t => t.id)
      );
      const removedRoomNumbers = new Set(
        txList.filter(t => !t.breakfast || t.cateringPackage === 'TIDAK').map(t => t.roomNumber)
      );

      updatedOrders = updatedOrders.filter(o => {
        const isTxMatch = (o.transactionId && removedTxIds.has(o.transactionId)) ||
                          (o.id && Array.from(removedTxIds).some(id => o.id === `BO-TX-${id}` || o.id.includes(id)));
        const isRoomMatch = o.roomNumber && removedRoomNumbers.has(o.roomNumber) && (
          Boolean(o.notes?.toLowerCase().includes(groupName.toLowerCase())) ||
          Boolean(o.guestName && o.guestName.toLowerCase().includes(groupName.toLowerCase()))
        );

        if (isTxMatch || isRoomMatch) {
          dataStorage.deleteBreakfastOrder(o.id);
          return false;
        }
        return true;
      });

      // 2. Update or insert breakfast orders for transactions that DO include breakfast
      txList.forEach(t => {
        if (t.breakfast && (!t.cateringPackage || t.cateringPackage !== 'TIDAK')) {
          const existingIdx = updatedOrders.findIndex(o => 
            o.transactionId === t.id || o.id === `BO-TX-${t.id}` || o.roomNumber === t.roomNumber
          );

          const syncedOrder: BreakfastOrder = {
            id: existingIdx >= 0 ? updatedOrders[existingIdx].id : `BO-TX-${t.id}`,
            roomNumber: t.roomNumber,
            building: t.building,
            guestName: t.guestName,
            phone: t.phone,
            kloter: t.kloter,
            transactionId: t.id,
            startDate: t.startDate,
            days: t.breakfastDays || t.duration || 1,
            portions: t.breakfastPortions || 1,
            menuName: t.breakfastMenu || (t.building === 'Ruang Pertemuan' ? 'Snack Box Pertemuan' : 'Nasi Kotak Rombongan'),
            deliveryTime: '06:30 WIB',
            status: (t.breakfastStatus as any) || 'MENUNGGU',
            notes: `[Rombongan: ${groupName}] Penyesuaian katering & sarapan`,
            dietaryRestriction: 'Biasa',
            pricePerPortion: 25000,
            totalPrice: (t.breakfastPortions || 1) * 25000 * (t.breakfastDays || t.duration || 1),
            createdAt: `${t.startDate} 06:00:00`
          };

          if (existingIdx >= 0) {
            updatedOrders[existingIdx] = syncedOrder;
          } else {
            updatedOrders.push(syncedOrder);
          }
          dataStorage.saveBreakfastOrder(syncedOrder);
        }
      });

      const currentDb = dataStorage.getDatabase();
      dataStorage.saveDatabase({ ...currentDb, breakfastOrders: updatedOrders });
      return updatedOrders;
    });

    setRooms(prev => {
      const updatedRooms = prev.map(r => {
        const nowInGroup = txList.find(t => t.roomId === r.id);
        if (nowInGroup) {
          return { ...r, status: nowInGroup.status as any, activeTxId: nowInGroup.id };
        }
        const wasInGroupOld = transactions.some(t => (t.groupId === editGroupId || (t.isGroup && t.groupName?.toLowerCase() === groupName.toLowerCase())) && t.roomId === r.id);
        if (wasInGroupOld && !nowInGroup) {
          return { ...r, status: 'KOSONG', activeTxId: null, qcStatus: 'PERLU_INSPEKSI' };
        }
        return r;
      });
      dataStorage.saveRooms(updatedRooms);
      return updatedRooms;
    });

    logAudit("SESUAIKAN_ROMBONGAN", `Menyesuaikan data rombongan "${groupName}" (${txList.length} fasilitas).`);
    showToast(`Data rombongan "${groupName}" berhasil disesuaikan!`, "success");
  };

  const updateTransaction = (updatedTx: Transaction) => {
    let nextTransactions: Transaction[] = [];
    const oldTx = transactions.find(t => t.id === updatedTx.id);

    // Normalisasi properti extraBed jika false
    if (!updatedTx.extraBed) {
      updatedTx = {
        ...updatedTx,
        extraBed: false,
        extraBedCount: undefined,
        extraBedNotes: undefined
      };
    }

    // Normalisasi properti breakfast jika false
    if (!updatedTx.breakfast || updatedTx.cateringPackage === 'TIDAK' || updatedTx.status === 'DIBATALKAN') {
      updatedTx = {
        ...updatedTx,
        breakfast: false,
        breakfastMenu: undefined,
        breakfastPortions: undefined,
        breakfastDays: undefined,
        breakfastStatus: undefined,
        cateringPackage: 'TIDAK',
        cateringPaxCount: 0
      };
    }

    setTransactions(prev => {
      nextTransactions = prev.map(t => t.id === updatedTx.id ? updatedTx : t);
      dataStorage.saveTransactions(nextTransactions);
      return nextTransactions;
    });

    // Synchronize breakfast orders with the updated transaction
    setBreakfastOrders(prev => {
      if (!updatedTx.breakfast || updatedTx.cateringPackage === 'TIDAK' || updatedTx.status === 'DIBATALKAN') {
        // Tamu membatalkan / tidak memakai paket sarapan: hapus order sarapan terkait dari sistem dapur
        const filtered = prev.filter(o => {
          const isMatch = 
            (o.transactionId && o.transactionId === updatedTx.id) ||
            o.id === `BO-TX-${updatedTx.id}` ||
            (o.id && updatedTx.id && o.id.includes(updatedTx.id)) ||
            (o.roomNumber === updatedTx.roomNumber && (
              !o.guestName || 
              o.guestName.trim().toLowerCase() === updatedTx.guestName.trim().toLowerCase() ||
              (oldTx && o.guestName.trim().toLowerCase() === oldTx.guestName.trim().toLowerCase()) ||
              o.startDate === updatedTx.startDate ||
              (oldTx && o.startDate === oldTx.startDate)
            )) ||
            (oldTx && o.roomNumber === oldTx.roomNumber);
          if (isMatch) {
            dataStorage.deleteBreakfastOrder(o.id);
            return false;
          }
          return true;
        });
        const currentDb = dataStorage.getDatabase();
        dataStorage.saveDatabase({ ...currentDb, breakfastOrders: filtered });
        return filtered;
      } else {
        // Tamu memakai paket sarapan: sinkronkan tanggal, porsi, hari, menu, dan status
        let found = false;
        const mapped = prev.map(o => {
          const isMatch = 
            (o.transactionId && o.transactionId === updatedTx.id) ||
            o.id === `BO-TX-${updatedTx.id}` ||
            (o.id && updatedTx.id && o.id.includes(updatedTx.id)) ||
            (o.roomNumber === updatedTx.roomNumber && (
              o.guestName.trim().toLowerCase() === updatedTx.guestName.trim().toLowerCase() ||
              (oldTx && o.guestName.trim().toLowerCase() === oldTx.guestName.trim().toLowerCase())
            ));
          if (isMatch) {
            found = true;
            const synced: BreakfastOrder = {
              ...o,
              roomNumber: updatedTx.roomNumber,
              building: updatedTx.building,
              guestName: updatedTx.guestName,
              phone: updatedTx.phone || o.phone,
              kloter: updatedTx.kloter || o.kloter,
              transactionId: updatedTx.id,
              startDate: updatedTx.startDate,
              days: updatedTx.breakfastDays || updatedTx.duration || 1,
              portions: updatedTx.breakfastPortions || 1,
              menuName: updatedTx.breakfastMenu || o.menuName,
              status: (updatedTx.breakfastStatus as any) || o.status || 'MENUNGGU',
              totalPrice: (updatedTx.breakfastPortions || 1) * (o.pricePerPortion || 25000) * (updatedTx.breakfastDays || updatedTx.duration || 1),
            };
            dataStorage.saveBreakfastOrder(synced);
            return synced;
          }
          return o;
        });

        if (!found && updatedTx.breakfast && (!updatedTx.cateringPackage || updatedTx.cateringPackage !== 'TIDAK')) {
          const newOrder: BreakfastOrder = {
            id: `BO-TX-${updatedTx.id}`,
            roomNumber: updatedTx.roomNumber,
            building: updatedTx.building,
            guestName: updatedTx.guestName,
            phone: updatedTx.phone,
            kloter: updatedTx.kloter,
            transactionId: updatedTx.id,
            startDate: updatedTx.startDate,
            days: updatedTx.breakfastDays || updatedTx.duration || 1,
            portions: updatedTx.breakfastPortions || 1,
            menuName: updatedTx.breakfastMenu || (updatedTx.building === 'Ruang Pertemuan' ? 'Snack Box Pertemuan' : 'Nasi Goreng Spesial'),
            deliveryTime: '06:30 WIB',
            status: (updatedTx.breakfastStatus as any) || 'MENUNGGU',
            dietaryRestriction: 'Biasa',
            pricePerPortion: 25000,
            totalPrice: (updatedTx.breakfastPortions || 1) * 25000 * (updatedTx.breakfastDays || updatedTx.duration || 1),
            createdAt: `${updatedTx.startDate} 06:00:00`
          };
          mapped.push(newOrder);
          dataStorage.saveBreakfastOrder(newOrder);
        }

        const currentDb = dataStorage.getDatabase();
        dataStorage.saveDatabase({ ...currentDb, breakfastOrders: mapped });
        return mapped;
      }
    });

    // Synchronize room status based on remaining active transactions
    setRooms(prev => prev.map(r => {
      if (r.id === updatedTx.roomId || (r.roomNumber === updatedTx.roomNumber && r.building === updatedTx.building)) {
        const pool = nextTransactions.length > 0 ? nextTransactions : transactions;
        const roomTxs = pool.filter(t => 
          (t.roomId === r.id || (t.roomNumber === r.roomNumber && t.building === r.building)) && 
          t.status !== 'DIBATALKAN' && 
          t.status !== 'SELESAI'
        );

        const terisiTx = roomTxs.find(t => t.status === 'TERISI');
        const bookedTx = roomTxs.find(t => t.status === 'BOOKED');

        if (terisiTx) {
          return { ...r, status: 'TERISI', activeTxId: terisiTx.id };
        } else if (bookedTx) {
          return { ...r, status: 'BOOKED', activeTxId: bookedTx.id };
        } else {
          return { ...r, status: 'KOSONG', activeTxId: null, qcStatus: r.qcStatus || 'LOLOS_QC' };
        }
      }
      return r;
    }));

    const auditDetail = [
      `Kamar ${updatedTx.roomNumber} (${updatedTx.guestName})`,
      `Tgl: ${updatedTx.startDate}`,
      `Durasi: ${updatedTx.duration} ${updatedTx.durationUnit || 'Malam'}`,
      updatedTx.breakfast ? `Sarapan: Ya (${updatedTx.breakfastPortions || 1} Porsi)` : 'Tanpa Sarapan',
      updatedTx.extraBed ? `Extra Bed: Ya (+${updatedTx.extraBedCount || 1} Bed)` : 'Tanpa Extra Bed'
    ].join(' | ');
    logAudit("SESUAIKAN_BOOKING", `Menyesuaikan data booking: ${auditDetail}`);
  };

  const updateBreakfastStatus = (txId: string, status: 'MENUNGGU' | 'SEDANG_DIBUAT' | 'PENGANTARAN' | 'SELESAI' | 'DIBATALKAN') => {
    if (!isKoperasiRole(currentUser?.role) && !isRecepRole(currentUser?.role) && !isSuperAdmin(currentUser?.role)) {
      showToast("Akses Ditolak: Anda tidak memiliki wewenang untuk memperbarui status pesanan sarapan!", "error");
      return;
    }
    setTransactions(prev => {
      const updated = prev.map(t => t.id === txId ? { ...t, breakfastStatus: status } : t);
      dataStorage.saveTransactions(updated);
      return updated;
    });
    const statusLabel = 
      status === 'SEDANG_DIBUAT' ? 'Sedang Dibuat di Dapur' : 
      status === 'PENGANTARAN' ? 'Sedang Pengantaran ke Kamar' : 
      status === 'SELESAI' ? 'Selesai Diantar' : 
      status === 'DIBATALKAN' ? 'Dibatalkan (Booking Batal)' : 'Menunggu';
    const tx = transactions.find(t => t.id === txId);
    logAudit("Status Sarapan", `${currentUser?.fullName} mengubah status pesanan sarapan ${tx?.roomNumber || txId} (${tx?.guestName || ''}) menjadi: ${statusLabel}`);
    showToast(`Status sarapan diperbarui: ${statusLabel}`, "success");
  };

  const checkoutRoom = (roomIdOrTxId: string, txId?: string) => {
    if (!isRecepRole(currentUser?.role)) {
      showToast("Akses Ditolak: Hanya staf Resepsionis yang berwenang memproses Check-Out!", "error");
      return;
    }
    let targetTxId: string | null = txId || null;
    let targetRoom = rooms.find(r => r.id === roomIdOrTxId);
    
    // If not found by roomId, check if roomIdOrTxId is actually a transaction ID
    if (!targetRoom) {
      const matchTx = transactions.find(t => t.id === roomIdOrTxId);
      if (matchTx) {
        targetTxId = matchTx.id;
        targetRoom = rooms.find(r => r.id === matchTx.roomId) || rooms.find(r => r.roomNumber === matchTx.roomNumber);
      }
    }

    if (!targetTxId && targetRoom) {
      if (targetRoom.activeTxId) {
        targetTxId = targetRoom.activeTxId;
      } else {
        const activeTx = transactions.find(t => (t.roomId === targetRoom?.id || t.roomNumber === targetRoom?.roomNumber) && t.status === 'TERISI');
        if (activeTx) {
          targetTxId = activeTx.id;
        }
      }
    }

    const roomId = targetRoom?.id || roomIdOrTxId;

    if (targetTxId) {
      const targetTx = transactions.find(t => t.id === targetTxId);
      const room = targetRoom || rooms.find(r => r.id === roomId);
      const guestName = targetTx?.guestName || 'Tamu';

      const updatedTxs = transactions.map(t => t.id === targetTxId ? { ...t, status: "SELESAI" as const } : t);
      setTransactions(updatedTxs);
      dataStorage.saveTransactions(updatedTxs);
      
      setRooms(prev => {
        const nextR = prev.map(r => {
          if (r.id === roomId || (room && (r.roomNumber === room.roomNumber && (!room.building || normalizeBuildingName(r.building) === normalizeBuildingName(room.building))))) {
            const activeTxs = updatedTxs.filter(t => (t.roomId === r.id || (t.roomNumber === r.roomNumber && (!t.building || normalizeBuildingName(t.building) === normalizeBuildingName(r.building))) || t.id === r.activeTxId) && (t.status === 'TERISI' || t.status === 'BOOKED'));
            const stillTerisi = activeTxs.find(t => t.status === 'TERISI');
            if (stillTerisi) {
              return { ...r, status: "TERISI", activeTxId: stillTerisi.id };
            }
            const nextBooked = activeTxs.find(t => t.status === 'BOOKED');
            if (nextBooked) {
              return { ...r, status: "BOOKED", activeTxId: nextBooked.id, qcStatus: "PERLU_INSPEKSI" };
            }
            return { ...r, status: "KOSONG", activeTxId: null, qcStatus: "PERLU_INSPEKSI" };
          }
          return r;
        });
        dataStorage.saveRooms(nextR);
        return nextR;
      });

      setMeetingRooms(prev => {
        const updatedMR = prev.map(mr => {
          if (mr.id === roomId || (room && mr.name === room.roomNumber)) {
            return {
              ...mr,
              status: 'TERSEDIA',
              activeTxId: null,
              qcStatus: 'PERLU_INSPEKSI'
            };
          }
          return mr;
        });
        dataStorage.saveMeetingRooms(updatedMR);
        return updatedMR;
      });
      
      logAudit("Check-Out", `Check-out berhasil untuk ${guestName} di ruangan ${room?.roomNumber || roomId}. Status kamar kini Perlu Inspeksi QC.`);
      showToast(`Check-Out untuk ${guestName} (${room?.roomNumber || roomId}) berhasil! Kamar siap diinspeksi kebersihan QC.`, "success");
    }
  };

  const cancelBooking = (roomIdOrTxId: string, txId?: string, reason?: string) => {
    if (!isRecepRole(currentUser?.role)) {
      showToast("Akses Ditolak: Hanya staf Resepsionis yang berwenang membatalkan booking!", "error");
      return;
    }
    let targetTxId: string | null = txId || null;
    let targetRoom = rooms.find(r => r.id === roomIdOrTxId);

    if (!targetRoom) {
      const matchTx = transactions.find(t => t.id === roomIdOrTxId);
      if (matchTx) {
        targetTxId = matchTx.id;
        targetRoom = rooms.find(r => r.id === matchTx.roomId) || rooms.find(r => r.roomNumber === matchTx.roomNumber);
      }
    }

    if (!targetTxId && targetRoom) {
      if (targetRoom.activeTxId) {
        targetTxId = targetRoom.activeTxId;
      } else {
        const bookedTx = transactions.find(t => (t.roomId === targetRoom?.id || t.roomNumber === targetRoom?.roomNumber) && t.status === 'BOOKED');
        if (bookedTx) {
          targetTxId = bookedTx.id;
        }
      }
    }

    const roomId = targetRoom?.id || roomIdOrTxId;

    if (targetTxId) {
      const targetTx = transactions.find(t => t.id === targetTxId);
      const room = rooms.find(r => r.id === roomId);
      const guestName = targetTx?.guestName || 'Reservasi';

      const cancelReasonSuffix = reason ? ` [DIBATALKAN: ${reason}]` : ' [DIBATALKAN]';
      const updatedTxs = transactions.map(t => {
        if (t.id === targetTxId) {
          return {
            ...t,
            status: "DIBATALKAN" as const,
            breakfastStatus: "DIBATALKAN" as const,
            notes: t.notes ? `${t.notes}${cancelReasonSuffix}` : cancelReasonSuffix.trim(),
            cancelledAt: new Date().toISOString(),
            cancelledBy: currentUser?.fullName || 'Resepsionis',
            cancelReason: reason || 'Dibatalkan oleh staf resepsionis'
          };
        }
        return t;
      });
      setTransactions(updatedTxs);
      dataStorage.saveTransactions(updatedTxs);

      // Also update any linked breakfast orders to DIBATALKAN
      setBreakfastOrders(prev => prev.map(o => {
        if (o.transactionId === targetTxId || o.id === `BO-TX-${targetTxId}` || (targetTx && o.roomNumber === targetTx.roomNumber && o.startDate === targetTx.startDate)) {
          const updated = { 
            ...o, 
            status: 'DIBATALKAN' as const, 
            cancelReason: reason || 'Booking kamar dibatalkan',
            cancelledAt: new Date().toISOString()
          };
          dataStorage.saveBreakfastOrder(updated);
          return updated;
        }
        return o;
      }));
      
      // Free all affected rooms including targetTx.roomId, roomId, rentAulaId, and allocatedRoomNumbers
      const affectedRoomIds = new Set<string>();
      if (roomId) affectedRoomIds.add(roomId);
      if (targetTx?.roomId) affectedRoomIds.add(targetTx.roomId);
      if (targetTx?.rentAulaId) affectedRoomIds.add(targetTx.rentAulaId);
      if (targetTx?.allocatedRoomNumbers && Array.isArray(targetTx.allocatedRoomNumbers)) {
        rooms.forEach(r => {
          if (targetTx.allocatedRoomNumbers?.includes(r.roomNumber)) {
            affectedRoomIds.add(r.id);
          }
        });
      }

      setRooms(prev => {
        const nextR = prev.map(r => {
          if (affectedRoomIds.has(r.id) || (room && (r.roomNumber === room.roomNumber && (!room.building || normalizeBuildingName(r.building) === normalizeBuildingName(room.building))))) {
            const activeTxs = updatedTxs.filter(t => (t.roomId === r.id || t.allocatedRoomNumbers?.includes(r.roomNumber) || (t.roomNumber === r.roomNumber && (!t.building || normalizeBuildingName(t.building) === normalizeBuildingName(r.building))) || t.id === r.activeTxId) && (t.status === 'TERISI' || t.status === 'BOOKED'));
            const stillTerisi = activeTxs.find(t => t.status === 'TERISI');
            if (stillTerisi) {
              return { ...r, status: "TERISI", activeTxId: stillTerisi.id };
            }
            const nextBooked = activeTxs.find(t => t.status === 'BOOKED');
            if (nextBooked) {
              return { ...r, status: "BOOKED", activeTxId: nextBooked.id };
            }
            return { ...r, status: "KOSONG", activeTxId: null };
          }
          return r;
        });
        dataStorage.saveRooms(nextR);
        return nextR;
      });

      setMeetingRooms(prev => {
        const updatedMR = prev.map(mr => {
          if (affectedRoomIds.has(mr.id) || (room && mr.name === room.roomNumber)) {
            return {
              ...mr,
              status: 'TERSEDIA',
              activeTxId: null
            };
          }
          return mr;
        });
        dataStorage.saveMeetingRooms(updatedMR);
        return updatedMR;
      });
      
      logAudit("Batal Booking", `Booking ${guestName} dibatalkan untuk unit ${room?.roomNumber || roomId}${reason ? ` (${reason})` : ''}. Status diperbarui menjadi DIBATALKAN.`);
      showToast(`Booking ${guestName} (${room?.roomNumber || roomId}) telah berhasil dibatalkan. Data tetap tersimpan dalam laporan dengan status DIBATALKAN.`, "success");
    }
  };

  const batchCancelGroup = (txIdsOrGroupId: string[] | string, reason?: string): boolean => {
    if (!isRecepRole(currentUser?.role)) {
      showToast("Akses Ditolak: Hanya staf Resepsionis yang berwenang membatalkan booking rombongan!", "error");
      return false;
    }

    let targetTxs: Transaction[] = [];

    if (Array.isArray(txIdsOrGroupId)) {
      targetTxs = transactions.filter(t => txIdsOrGroupId.includes(t.id) && t.status !== 'DIBATALKAN' && t.status !== 'SELESAI');
    } else {
      const key = txIdsOrGroupId.trim().toLowerCase();
      targetTxs = transactions.filter(t => {
        if (t.status === 'DIBATALKAN' || t.status === 'SELESAI') return false;
        if (t.groupId && t.groupId.toLowerCase() === key) return true;
        if (t.groupName && t.groupName.trim().toLowerCase() === key) return true;
        if (t.guestName && t.guestName.trim().toLowerCase() === key) return true;
        if (key.startsWith('kloter-') && t.kloter && `kloter-${t.kloter.toLowerCase()}` === key) return true;
        return false;
      });
    }

    if (targetTxs.length === 0) {
      showToast("Tidak ada reservasi aktif yang dapat dibatalkan pada rombongan ini.", "info");
      return false;
    }

    const cancelIds = new Set(targetTxs.map(t => t.id));
    const cancelNote = reason ? ` [DIBATALKAN ROMBONGAN: ${reason}]` : ' [DIBATALKAN ROMBONGAN]';
    const nowIso = new Date().toISOString();

    const updatedTxs = transactions.map(t => {
      if (cancelIds.has(t.id)) {
        return {
          ...t,
          status: 'DIBATALKAN' as const,
          breakfastStatus: 'DIBATALKAN' as const,
          notes: t.notes ? `${t.notes}${cancelNote}` : cancelNote.trim(),
          cancelledAt: nowIso,
          cancelledBy: currentUser?.fullName || 'Resepsionis',
          cancelReason: reason || 'Dibatalkan rombongan'
        };
      }
      return t;
    });
    setTransactions(updatedTxs);
    dataStorage.saveTransactions(updatedTxs);

    // Update breakfastOrders for cancelled transactions
    setBreakfastOrders(prev => prev.map(o => {
      const matchTx = targetTxs.find(tx => tx.id === o.transactionId || o.id === `BO-TX-${tx.id}` || (o.roomNumber === tx.roomNumber && o.startDate === tx.startDate));
      if (matchTx || (o.transactionId && cancelIds.has(o.transactionId))) {
        const updated = { 
          ...o, 
          status: 'DIBATALKAN' as const, 
          cancelReason: reason || 'Booking rombongan dibatalkan',
          cancelledAt: nowIso
        };
        dataStorage.saveBreakfastOrder(updated);
        return updated;
      }
      return o;
    }));

    const affectedRoomIds = new Set<string>();
    targetTxs.forEach(t => {
      if (t.roomId) affectedRoomIds.add(t.roomId);
      if (t.rentAulaId) affectedRoomIds.add(t.rentAulaId);
      if (t.allocatedRoomNumbers && Array.isArray(t.allocatedRoomNumbers)) {
        rooms.forEach(r => {
          if (t.allocatedRoomNumbers?.includes(r.roomNumber)) {
            affectedRoomIds.add(r.id);
          }
        });
      }
    });

    setRooms(prev => prev.map(r => {
      if (affectedRoomIds.has(r.id)) {
        const remainingActive = updatedTxs.filter(t => (t.roomId === r.id || t.allocatedRoomNumbers?.includes(r.roomNumber)) && (t.status === 'TERISI' || t.status === 'BOOKED'));
        const stillTerisi = remainingActive.find(t => t.status === 'TERISI');
        if (stillTerisi) {
          return { ...r, status: 'TERISI', activeTxId: stillTerisi.id };
        }
        const nextBooked = remainingActive.find(t => t.status === 'BOOKED');
        if (nextBooked) {
          return { ...r, status: 'BOOKED', activeTxId: nextBooked.id };
        }
        return { ...r, status: 'KOSONG', activeTxId: null };
      }
      return r;
    }));

    const sampleName = targetTxs[0].groupName || targetTxs[0].guestName || 'Rombongan';
    const roomListStr = targetTxs.map(t => t.roomNumber).join(', ');
    logAudit("BATAL_BOOKING_ROMBONGAN", `Pembatalan booking rombongan "${sampleName}": ${targetTxs.length} unit (${roomListStr}) dibatalkan. Status diperbarui ke DIBATALKAN.`);
    showToast(`Booking rombongan "${sampleName}" (${targetTxs.length} kamar) berhasil dibatalkan. Data tetap tercatat dalam laporan.`, "success");
    return true;
  };

  const activateCheckin = (roomIdOrTxId: string, targetTxId?: string) => {
    if (!isRecepRole(currentUser?.role)) {
      showToast("Akses Ditolak: Hanya staf Resepsionis yang berwenang mengaktifkan Check-In!", "error");
      return;
    }
    let room = rooms.find(r => r.id === roomIdOrTxId);
    let txIdToActivate = targetTxId;

    if (!room) {
      const matchTx = transactions.find(t => t.id === roomIdOrTxId);
      if (matchTx) {
        txIdToActivate = matchTx.id;
        room = rooms.find(r => r.id === matchTx.roomId) || rooms.find(r => r.roomNumber === matchTx.roomNumber);
      }
    }

    if (!room) return;
    if (!txIdToActivate) {
      txIdToActivate = room.activeTxId || transactions.find(t => (t.roomId === room?.id || t.roomNumber === room?.roomNumber) && t.status === 'BOOKED')?.id;
    }
    if (!txIdToActivate) return;

    const targetTx = transactions.find(t => t.id === txIdToActivate);
    const guestName = targetTx?.guestName || 'Tamu';

    const updatedTxs = transactions.map(t => t.id === txIdToActivate ? { ...t, status: "TERISI" as const } : t);
    setTransactions(updatedTxs);
    dataStorage.saveTransactions(updatedTxs);
    setRooms(prev => {
      const nextR = prev.map(r => (r.id === room.id || r.roomNumber === room.roomNumber) ? { ...r, status: "TERISI", activeTxId: txIdToActivate } : r);
      dataStorage.saveRooms(nextR);
      return nextR;
    });
    setMeetingRooms(prev => {
      const nextMR = prev.map(mr => (mr.id === room.id || mr.name === room.roomNumber) ? { ...mr, status: "TERPAKAI", activeTxId: txIdToActivate } : mr);
      dataStorage.saveMeetingRooms(nextMR);
      return nextMR;
    });

    logAudit("Aktivasi Check-In", `Aktivasi status terisi dari booking ${room.roomNumber} (${guestName})`);
    showToast(`Check-In untuk ${room.roomNumber} (${guestName}) berhasil diaktifkan!`, "success");
  };

  const extendTransaction = (
    txId: string, 
    additionalDuration: number, 
    extendBreakfast: boolean = false, 
    extendExtraBed: boolean = false,
    reason?: string,
    paymentOption?: {
      mode: 'LUNAS_SEKARANG' | 'BAYAR_NANTI' | 'DP_SEKARANG';
      amount?: number;
      method?: string;
      bankName?: string;
      vaNumber?: string;
      vaAccountName?: string;
      bankAccountNumber?: string;
      notes?: string;
    },
    extendEntireGroup: boolean = false
  ): boolean => {
    if (!isRecepRole(currentUser?.role)) {
      showToast("Akses Ditolak: Hanya staf Resepsionis yang berwenang memproses perpanjangan sewa (Extend)!", "error");
      return false;
    }

    const tx = transactions.find(t => t.id === txId);
    if (!tx) {
      showToast("Data transaksi tidak ditemukan.", "error");
      return false;
    }

    const isAula = tx.building === 'Ruang Pertemuan';
    const currentDuration = Number(tx.duration) || 1;
    const added = Number(additionalDuration) || 1;
    const newTotalDuration = currentDuration + added;
    const unit = tx.durationUnit || (isAula ? 'Jam' : 'Malam');

    // Determine target transactions (single or entire group)
    const targetTxs = (extendEntireGroup && tx.groupId)
      ? transactions.filter(t => t.groupId === tx.groupId && t.status !== 'DIBATALKAN' && t.status !== 'SELESAI')
      : [tx];

    const targetRoomIds = targetTxs.map(t => t.roomId);
    const targetRoomNums = targetTxs.map(t => t.roomNumber);
    const targetMemberIds = targetTxs.map(t => t.id);

    // Conflict detection across all target rooms
    const currentCheckout = !isAula 
      ? addDaysToDateStr(tx.startDate, currentDuration)
      : addDaysToDateStr(tx.startDate, Math.max(1, Math.ceil(currentDuration / 24)) - 1);
    const newCheckout = !isAula 
      ? addDaysToDateStr(tx.startDate, newTotalDuration)
      : addDaysToDateStr(tx.startDate, Math.max(1, Math.ceil(newTotalDuration / 24)) - 1);

    const conflict = transactions.find(other => {
      if (targetMemberIds.includes(other.id)) return false;
      if (other.status === 'DIBATALKAN' || other.status === 'SELESAI') return false;

      const isSameRoom = targetRoomIds.includes(other.roomId) || targetRoomNums.includes(other.roomNumber);
      if (!isSameRoom) return false;

      const otherNights = other.durationUnit === 'Malam' ? other.duration : Math.max(1, Math.ceil((other.duration || 1) / 24));
      const otherEnd = !isAula 
        ? addDaysToDateStr(other.startDate, other.duration) 
        : addDaysToDateStr(other.startDate, otherNights);

      return other.startDate < newCheckout && otherEnd > currentCheckout;
    });

    if (conflict) {
      showToast(`Tidak dapat memperpanjang sewa! Kamar ${conflict.roomNumber} (${conflict.building}) sudah di-booking oleh tamu "${conflict.guestName || conflict.groupName}" pada tanggal ${formatIndonesianDate(conflict.startDate)} s.d. ${formatIndonesianDate(addDaysToDateStr(conflict.startDate, conflict.duration))}.`, "error");
      return false;
    }

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const todayStr = getRealTodayDate();

    targetTxs.forEach(targetItem => {
      const itemCurDuration = Number(targetItem.duration) || 1;
      const itemNewTotalDuration = itemCurDuration + added;
      const historyItem = {
        date: nowStr,
        addedDuration: added,
        unit,
        newTotalDuration: itemNewTotalDuration,
        user: currentUser?.fullName || 'Resepsionis',
        reason: reason || 'Permintaan perpanjangan masa sewa oleh tamu / jemaah'
      };

      const newBreakfastDays = extendBreakfast 
        ? (targetItem.breakfastDays || targetItem.duration) + added 
        : targetItem.breakfastDays;

      const updatedTx: Transaction = {
        ...targetItem,
        duration: itemNewTotalDuration,
        breakfastDays: newBreakfastDays,
        extendedCount: (targetItem.extendedCount || 0) + 1,
        extendHistory: [...(targetItem.extendHistory || []), historyItem],
        notes: targetItem.notes 
          ? `${targetItem.notes} | [Extend +${added} ${unit} pada ${formatIndonesianDate(nowStr.substring(0, 10))}]`
          : `[Extend +${added} ${unit} pada ${formatIndonesianDate(nowStr.substring(0, 10))}]`
      };

      if (extendExtraBed) {
        updatedTx.extraBed = true;
        updatedTx.extraBedCount = (targetItem.extraBedCount || 0) > 0 ? targetItem.extraBedCount : 1;
      }

      if (extendBreakfast) {
        updatedTx.breakfast = true;
        updatedTx.breakfastDays = (targetItem.breakfastDays || targetItem.duration) + added;
      }

      // Handle payment logic for the extension
      if (paymentOption) {
        const addedPayAmount = Number(paymentOption.amount || 0);
        const previousPaid = Number(targetItem.paidAmount || targetItem.dpAmount || 0);

        if (paymentOption.vaNumber) updatedTx.vaNumber = paymentOption.vaNumber;
        if (paymentOption.vaAccountName) updatedTx.vaAccountName = paymentOption.vaAccountName;
        if (paymentOption.bankAccountNumber) updatedTx.bankAccountNumber = paymentOption.bankAccountNumber;

        if (paymentOption.mode === 'LUNAS_SEKARANG') {
          updatedTx.paidAmount = previousPaid + addedPayAmount;
          updatedTx.paymentStatus = 'LUNAS';
          updatedTx.remainingAmount = 0;
          updatedTx.paymentMethod = paymentOption.method || targetItem.paymentMethod || 'VA_UPT';
          if (paymentOption.bankName) updatedTx.bankName = paymentOption.bankName;
          updatedTx.paymentDate = todayStr;
          updatedTx.paymentNote = paymentOption.notes || `Pelunasan perpanjangan sewa +${added} ${unit}`;
        } else if (paymentOption.mode === 'BAYAR_NANTI') {
          // Additional bill is deferred to check-out (recorded as piutang)
          updatedTx.paymentStatus = previousPaid > 0 ? 'DP' : 'BELUM_LUNAS';
          updatedTx.notes = `${updatedTx.notes} | [Biaya extend +${added} ${unit} ditagihkan saat check-out]`;
        } else if (paymentOption.mode === 'DP_SEKARANG') {
          const newTotalPaid = previousPaid + addedPayAmount;
          updatedTx.paidAmount = newTotalPaid;
          updatedTx.dpAmount = newTotalPaid;
          updatedTx.dpDate = todayStr;
          updatedTx.dpMethod = paymentOption.method || targetItem.dpMethod || 'VA_UPT';
          updatedTx.paymentStatus = 'DP';
          if (paymentOption.notes) {
            updatedTx.dpNote = paymentOption.notes;
          }
        }
      }

      updateTransaction(updatedTx);
    });

    const newCheckoutDateStr = !isAula ? addDaysToDateStr(tx.startDate, newTotalDuration) : tx.startDate;
    const targetLabel = targetTxs.length > 1 
      ? `Rombongan ${tx.groupName || tx.guestName} (${targetTxs.length} kamar)`
      : `${tx.roomNumber} (${tx.guestName})`;

    const payNotice = paymentOption?.mode === 'LUNAS_SEKARANG' 
      ? ` Pembayaran: LUNAS (${formatRupiah(paymentOption.amount || 0)}).`
      : paymentOption?.mode === 'BAYAR_NANTI'
      ? ` Pembayaran: Ditagihkan saat Check-Out.`
      : paymentOption?.mode === 'DP_SEKARANG'
      ? ` Pembayaran: DP Tambahan (${formatRupiah(paymentOption.amount || 0)}).`
      : '';

    logAudit(
      "Extend Sewa",
      `Petugas ${currentUser?.fullName} memperpanjang sewa ${targetLabel} sebanyak +${added} ${unit}.${payNotice} Total durasi baru: ${newTotalDuration} ${unit}.${extendBreakfast ? ' Termasuk sarapan.' : ''}`
    );

    showToast(
      `Perpanjangan sewa ${targetLabel} berhasil! (+${added} ${unit})${!isAula ? ` hingga ${formatIndonesianDate(newCheckoutDateStr)}` : ''}.${payNotice}`,
      "success"
    );

    return true;
  };

  const batchCheckinGroup = (txIdsOrGroupId: string[] | string): boolean => {
    if (!isRecepRole(currentUser?.role)) {
      showToast("Akses Ditolak: Hanya staf Resepsionis yang berwenang memproses Check-In!", "error");
      return false;
    }

    let targetTxs: Transaction[] = [];
    if (Array.isArray(txIdsOrGroupId)) {
      targetTxs = transactions.filter(t => txIdsOrGroupId.includes(t.id));
    } else {
      const key = (txIdsOrGroupId || '').trim().toLowerCase();
      targetTxs = transactions.filter(t => {
        if (t.status === 'DIBATALKAN' || t.status === 'SELESAI') return false;
        if (t.groupId && t.groupId.toLowerCase() === key) return true;
        if (t.groupName && t.groupName.trim().toLowerCase() === key) return true;
        if (t.guestName && t.guestName.trim().toLowerCase() === key) return true;
        if (key.startsWith('kloter-') && t.kloter && `kloter-${t.kloter.toLowerCase()}` === key) return true;
        if (t.notes && t.notes.toLowerCase().includes(key)) return true;
        return false;
      });
    }

    const toCheckin = targetTxs.filter(t => t.status === 'BOOKED');
    if (toCheckin.length === 0) {
      showToast("Semua kamar dalam rombongan ini sudah berstatus Check-In atau Selesai.", "info");
      return false;
    }

    const toCheckinIds = new Set(toCheckin.map(t => t.id));
    const updatedTxs = transactions.map(t => {
      if (toCheckinIds.has(t.id)) {
        return { ...t, status: 'TERISI' as const };
      }
      return t;
    });
    setTransactions(updatedTxs);

    const updatedRoomIds = new Set(toCheckin.map(t => t.roomId));
    setRooms(prev => prev.map(r => {
      if (updatedRoomIds.has(r.id)) {
        const activeTx = toCheckin.find(t => t.roomId === r.id);
        return { ...r, status: 'TERISI', activeTxId: activeTx?.id || r.activeTxId };
      }
      return r;
    }));

    const sampleName = toCheckin[0].groupName || toCheckin[0].guestName || 'Rombongan';
    const roomListStr = toCheckin.map(t => t.roomNumber).join(', ');
    logAudit("BATCH_CHECKIN", `Batch Check-In untuk rombongan "${sampleName}": ${toCheckin.length} kamar (${roomListStr}) berhasil diaktifkan`);
    showToast(`Berhasil! ${toCheckin.length} kamar rombongan "${sampleName}" telah aktif Check-In.`, "success");
    return true;
  };

  const batchCheckoutGroup = (txIdsOrGroupId: string[] | string): boolean => {
    if (!isRecepRole(currentUser?.role)) {
      showToast("Akses Ditolak: Hanya staf Resepsionis yang berwenang memproses Check-Out!", "error");
      return false;
    }

    let targetTxs: Transaction[] = [];
    if (Array.isArray(txIdsOrGroupId)) {
      targetTxs = transactions.filter(t => txIdsOrGroupId.includes(t.id));
    } else {
      const key = (txIdsOrGroupId || '').trim().toLowerCase();
      targetTxs = transactions.filter(t => {
        if (t.status === 'DIBATALKAN' || t.status === 'SELESAI') return false;
        if (t.groupId && t.groupId.toLowerCase() === key) return true;
        if (t.groupName && t.groupName.trim().toLowerCase() === key) return true;
        if (t.guestName && t.guestName.trim().toLowerCase() === key) return true;
        if (key.startsWith('kloter-') && t.kloter && `kloter-${t.kloter.toLowerCase()}` === key) return true;
        if (t.notes && t.notes.toLowerCase().includes(key)) return true;
        return false;
      });
    }

    const toCheckout = targetTxs.filter(t => t.status === 'TERISI');
    if (toCheckout.length === 0) {
      showToast("Tidak ada kamar aktif (Terisi) yang perlu di-check out pada rombongan ini.", "info");
      return false;
    }

    const toCheckoutIds = new Set(toCheckout.map(t => t.id));
    const updatedTxs = transactions.map(t => {
      if (toCheckoutIds.has(t.id)) {
        return { ...t, status: 'SELESAI' as const };
      }
      return t;
    });
    setTransactions(updatedTxs);

    const checkoutRoomIds = new Set(toCheckout.map(t => t.roomId));
    setRooms(prev => prev.map(r => {
      if (checkoutRoomIds.has(r.id)) {
        const remainingActive = updatedTxs.filter(t => t.roomId === r.id && (t.status === 'TERISI' || t.status === 'BOOKED'));
        const stillTerisi = remainingActive.find(t => t.status === 'TERISI');
        if (stillTerisi) {
          return { ...r, status: 'TERISI', activeTxId: stillTerisi.id };
        }
        const nextBooked = remainingActive.find(t => t.status === 'BOOKED');
        if (nextBooked) {
          return { ...r, status: 'BOOKED', activeTxId: nextBooked.id, qcStatus: 'PERLU_INSPEKSI' };
        }
        return { ...r, status: 'KOSONG', activeTxId: null, qcStatus: 'PERLU_INSPEKSI' };
      }
      return r;
    }));

    const sampleName = toCheckout[0].groupName || toCheckout[0].guestName || 'Rombongan';
    const roomListStr = toCheckout.map(t => t.roomNumber).join(', ');
    logAudit("BATCH_CHECKOUT", `Batch Check-Out untuk rombongan "${sampleName}": ${toCheckout.length} kamar (${roomListStr}) selesai. Menunggu inspeksi kebersihan QC.`);
    showToast(`Check-Out selesai! ${toCheckout.length} kamar rombongan "${sampleName}" berhasil di-checkout & siap diinspeksi QC.`, "success");
    return true;
  };

  const addMaintenance = (maint: Maintenance) => {
    setMaintenances(prev => [...prev, maint]);
    setRooms(prev => prev.map(r => r.id === maint.roomId ? { ...r, status: "MAINTENANCE", activeMaintId: maint.id, qcStatus: "PERLU_PERBAIKAN" } : r));
    logAudit("Lapor Maintenance", `Laporan perawatan ${maint.category} (${maint.urgency}) di ${maint.roomNumber} (${maint.building})`);
    
    if (maint.urgency === 'URGENT' || maint.urgency === 'Urgent') {
      try {
        const sentEmail = sendMaintenanceEmailNotification({
          maintenance: maint,
          eventType: 'URGENT_MAINTENANCE',
          currentUser
        });
        setEmailNotifications(prev => [sentEmail, ...prev]);
        playNotificationSound();
        showToast(`🚨 [ALERT URGENT] Tiket Perbaikan Darurat untuk ${maint.roomNumber} (${maint.category})! Notifikasi email otomatis terkirim ke Manajer Teknisi.`, 'error');
      } catch (err) {
        console.error('Failed to dispatch urgent email notification', err);
        showToast(`🚨 [ALERT URGENT] Tiket Perbaikan Darurat untuk ${maint.roomNumber} (${maint.category}): ${maint.description}`, 'error');
      }
    } else {
      showToast(`Tiket perbaikan ${maint.roomNumber} berhasil dicatat dan menunggu penugasan Manager Teknisi!`, "warning");
    }
  };

  const assignTechnicianToMaintenance = (maintId: string, technicianId: string, technicianName: string, managerNotes?: string): boolean => {
    if (!isManagerTeknisi(currentUser?.role)) {
      showToast("Akses Ditolak: Hanya Manager Teknisi atau Super Admin yang berwenang menugaskan teknisi!", "error");
      return false;
    }

    const maint = maintenances.find(m => m.id === maintId);
    if (!maint) {
      showToast("Data perawatan tidak ditemukan.", "error");
      return false;
    }

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    setMaintenances(prev => prev.map(m => {
      if (m.id === maintId) {
        return {
          ...m,
          status: 'PROSES',
          assignedTechnicianId: technicianId,
          assignedTechnicianName: technicianName,
          assignedByManager: currentUser.fullName,
          assignedTime: nowStr,
          managerNotes: managerNotes || m.managerNotes,
          technician: technicianName
        };
      }
      return m;
    }));

    setRooms(prev => prev.map(r => r.id === maint.roomId ? { ...r, status: "MAINTENANCE", activeMaintId: maint.id } : r));

    logAudit(
      "Penugasan Teknisi", 
      `Manager Teknisi ${currentUser.fullName} menugaskan ${technicianName} untuk memperbaiki ${maint.roomNumber} (${maint.building})${managerNotes ? `. Instruksi: ${managerNotes}` : ''}`
    );
    showToast(`🛠️ [TUGAS BARU] Perbaikan ${maint.roomNumber} (${maint.category}) telah ditugaskan kepada ${technicianName}! Segera cek panel tugas.`, "success");
    return true;
  };

  const markMaintenanceRepaired = (maintId: string, technicianNotes: string): boolean => {
    if (!isTeknisiRole(currentUser?.role)) {
      showToast("Akses Ditolak: Hanya petugas Teknisi / Manager Teknisi yang berwenang memperbarui status perbaikan!", "error");
      return false;
    }

    const maint = maintenances.find(m => m.id === maintId);
    if (!maint) {
      showToast("Data perawatan tidak ditemukan.", "error");
      return false;
    }

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    setMaintenances(prev => prev.map(m => {
      if (m.id === maintId) {
        return {
          ...m,
          status: 'MENUNGGU_QC',
          workCompletedTime: nowStr,
          technicianNotes: technicianNotes || m.technicianNotes || 'Pekerjaan perbaikan fisik telah diselesaikan teknisi.'
        };
      }
      return m;
    }));

    setRooms(prev => prev.map(r => {
      if (r.id === maint.roomId) {
        return { 
          ...r, 
          status: "MAINTENANCE", 
          qcStatus: "MENUNGGU_QC",
          lastQcNotes: `Perbaikan teknisi telah selesai (${nowStr}). Menunggu inspeksi & pengesahan Tim QC.`
        };
      }
      return r;
    }));

    setMeetingRooms(prev => prev.map(mr => {
      if (mr.id === maint.roomId || mr.name === maint.roomNumber) {
        return {
          ...mr,
          status: 'MAINTENANCE',
          qcStatus: 'MENUNGGU_QC'
        };
      }
      return mr;
    }));

    logAudit(
      "Perbaikan Selesai - Menunggu QC", 
      `Petugas ${currentUser.fullName} menyatakan perbaikan ${maint.roomNumber} telah selesai. Kamar/ruangan berstatus MENUNGGU_QC untuk diverifikasi Tim Quality Control.`
    );
    showToast(`Perbaikan ${maint.roomNumber} selesai diperbaiki! Menunggu verifikasi & uji kelayakan QC.`, "info");
    return true;
  };

  const updateMaintenanceStatus = (maintId: string, newStatus: 'MENUNGGU_PENUGASAN' | 'PROSES' | 'MENUNGGU_QC' | 'SELESAI', technicianNotes?: string): boolean => {
    if (!isTeknisiRole(currentUser?.role)) {
      showToast("Akses Ditolak: Hanya petugas Teknisi yang berwenang memperbarui status perawatan!", "error");
      return false;
    }

    const maint = maintenances.find(m => m.id === maintId);
    if (!maint) {
      showToast("Data perawatan tidak ditemukan.", "error");
      return false;
    }

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    setMaintenances(prev => prev.map(m => {
      if (m.id === maintId) {
        return {
          ...m,
          status: newStatus,
          resolvedTime: newStatus === 'SELESAI' ? nowStr : m.resolvedTime,
          technicianNotes: technicianNotes !== undefined ? technicianNotes : m.technicianNotes,
          technician: m.technician || currentUser.fullName
        };
      }
      return m;
    }));

    setRooms(prev => prev.map(r => {
      if (r.id === maint.roomId) {
        if (newStatus === 'SELESAI') {
          return { ...r, status: "KOSONG", activeMaintId: null, qcStatus: "LOLOS_QC" };
        } else if (newStatus === 'MENUNGGU_QC') {
          return { ...r, status: "MAINTENANCE", activeMaintId: maint.id, qcStatus: "MENUNGGU_QC" };
        } else {
          return { ...r, status: "MAINTENANCE", activeMaintId: maint.id };
        }
      }
      return r;
    }));

    setMeetingRooms(prev => prev.map(mr => {
      if (mr.id === maint.roomId || mr.name === maint.roomNumber) {
        if (newStatus === 'SELESAI') {
          return { ...mr, status: "TERSEDIA", qcStatus: "LOLOS_QC" };
        } else if (newStatus === 'MENUNGGU_QC') {
          return { ...mr, status: "MAINTENANCE", qcStatus: "MENUNGGU_QC" };
        } else {
          return { ...mr, status: "MAINTENANCE" };
        }
      }
      return mr;
    }));

    const statusLabel = newStatus === 'SELESAI' 
      ? 'Selesai & Disahkan Lolos' 
      : newStatus === 'MENUNGGU_QC' 
      ? 'Perbaikan Selesai (Menunggu QC)' 
      : newStatus === 'PROSES' 
      ? 'Dalam Pengerjaan Teknisi' 
      : 'Menunggu Penugasan';

    if (newStatus === 'SELESAI') {
      try {
        const sentEmail = sendMaintenanceEmailNotification({
          maintenance: { ...maint, status: 'SELESAI', resolvedTime: nowStr },
          eventType: 'MAINTENANCE_COMPLETED',
          currentUser,
          technicianNotes: technicianNotes !== undefined ? technicianNotes : maint.technicianNotes,
          resolvedTime: nowStr
        });
        setEmailNotifications(prev => [sentEmail, ...prev]);
        showToast(`📧 [EMAIL TERKIRIM] Laporan perbaikan selesai dikirim otomatis ke Manajer Teknisi!`, "success");
      } catch (err) {
        console.error('Failed to dispatch completion email notification', err);
      }
    }

    logAudit(
      "Update Status Maintenance", 
      `${currentUser.fullName} mengubah status perbaikan fasilitas ${maint.roomNumber} (${maint.building}) menjadi "${statusLabel}"`
    );
    showToast(`Status perbaikan ${maint.roomNumber} diperbarui: ${statusLabel}`, "success");
    return true;
  };

  const finishMaintenance = (roomId: string): boolean => {
    if (!isTeknisiRole(currentUser?.role)) {
      showToast("Akses Ditolak: Hanya petugas Teknisi yang berwenang memperbarui status perbaikan!", "error");
      return false;
    }

    const room = rooms.find(r => r.id === roomId);
    if (!room) return false;

    const targetMaint = maintenances.find(m => m.roomId === roomId && (m.status === 'PROSES' || m.status === 'MENUNGGU_PENUGASAN'));

    if (targetMaint) {
      return markMaintenanceRepaired(targetMaint.id, 'Perbaikan diselesaikan langsung oleh teknisi. Menunggu verifikasi QC.');
    } else {
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, status: "MAINTENANCE", qcStatus: "MENUNGGU_QC" } : r));
      setMeetingRooms(prev => prev.map(mr => (mr.id === roomId || mr.name === room.roomNumber) ? { ...mr, status: "MAINTENANCE", qcStatus: "MENUNGGU_QC" } : mr));
      logAudit("Selesai Pekerjaan Teknisi", `Teknisi ${currentUser.fullName} menyelesaikan pekerjaan pada ${room.roomNumber}. Menunggu pengesahan QC.`);
      showToast(`${room.roomNumber} telah selesai diperbaiki! Wajib diverifikasi QC sebelum disewakan.`, "info");
      return true;
    }
  };

  const addQcInspection = (inspection: QcInspection) => {
    if (!isQcRole(currentUser?.role)) {
      showToast("Akses Ditolak: Hanya petugas Quality Control yang berwenang melakukan inspeksi!", "error");
      return;
    }

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    setQcInspections(prev => [inspection, ...prev]);

    const isLolos = inspection.result === 'LOLOS_QC' || inspection.result === 'LOLOS_VERIFIKASI_TEKNISI';
    const isRevisi = inspection.result === 'REVISI_PERBAIKAN';

    if (isLolos) {
      // 1. Mark Room / Meeting Hall as KOSONG & LOLOS_QC (Siap Huni / Disewa)
      setRooms(prev => prev.map(r => {
        if (r.id === inspection.roomId || r.roomNumber === inspection.roomNumber) {
          return {
            ...r,
            status: (r.status === 'TERISI' ? 'TERISI' : 'KOSONG') as any,
            activeMaintId: null,
            qcStatus: 'LOLOS_QC',
            lastQcDate: inspection.inspectionDate,
            lastQcBy: inspection.inspectorName,
            lastQcNotes: inspection.notes || 'Kondisi kamar/gedung bersih, fasilitas normal, dan LOLOS standar QC'
          };
        }
        return r;
      }));

      // Sinkronkan ke katalog meetingRooms
      setMeetingRooms(prev => prev.map(mr => {
        if (mr.id === inspection.roomId || mr.name === inspection.roomNumber) {
          return {
            ...mr,
            status: mr.status === 'TERPAKAI' ? 'TERPAKAI' : 'TERSEDIA',
            qcStatus: 'LOLOS_QC'
          };
        }
        return mr;
      }));

      // 2. Resolve any associated maintenance tickets and dispatch completion email to Manager Teknisi
      const resolvedList: Maintenance[] = [];
      setMaintenances(prev => prev.map(m => {
        if ((m.roomId === inspection.roomId || m.roomNumber === inspection.roomNumber) && (m.status === 'MENUNGGU_QC' || m.status === 'PROSES' || m.status === 'MENUNGGU_PENUGASAN')) {
          const resolvedMaint: Maintenance = {
            ...m,
            status: 'SELESAI',
            resolvedTime: nowStr,
            qcVerdict: 'LOLOS_QC',
            qcInspectionId: inspection.id
          };
          resolvedList.push(resolvedMaint);
          return resolvedMaint;
        }
        return m;
      }));

      // Kirim notifikasi email penyelesaian pekerjaan otomatis ke Manager Teknisi
      resolvedList.forEach(m => {
        try {
          const sentEmail = sendMaintenanceEmailNotification({
            maintenance: m,
            eventType: 'MAINTENANCE_COMPLETED',
            currentUser,
            technicianNotes: `Inspeksi QC Lolos oleh ${inspection.inspectorName}. Catatan: ${inspection.notes || 'Fasilitas dalam kondisi prima & siap pakai.'}`,
            resolvedTime: nowStr
          });
          setEmailNotifications(prev => [sentEmail, ...prev]);
        } catch (err) {
          console.error('Failed to dispatch QC completion email', err);
        }
      });

      const isPostRepair = inspection.result === 'LOLOS_VERIFIKASI_TEKNISI' || inspection.decisionType === 'LOLOS_PASCA_TEKNISI';
      logAudit(
        isPostRepair ? "Verifikasi QC Pasca Teknisi: Disahkan Lolos" : "Inspeksi QC Disahkan (Lolos)",
        `Tim QC (${inspection.inspectorName}) menyatakan fasilitas ${inspection.roomNumber} (${inspection.building}) ${isPostRepair ? 'RESMI LOLOS Verifikasi Akhir Pasca Perbaikan Teknisi' : 'RESMI LOLOS QC'}. Fasilitas dipulihkan menjadi KOSONG / TERSEDIA dan siap digunakan!`
      );
      showToast(`Fasilitas ${inspection.roomNumber} terverifikasi LOLOS QC & SIAP HUNI!`, "success");

    } else if (isRevisi) {
      // REVISI: Hasil perbaikan teknisi belum tuntas / tidak memenuhi standar QC
      setRooms(prev => prev.map(r => {
        if (r.id === inspection.roomId || r.roomNumber === inspection.roomNumber) {
          return {
            ...r,
            status: 'MAINTENANCE',
            qcStatus: 'PERLU_PERBAIKAN',
            lastQcDate: inspection.inspectionDate,
            lastQcBy: inspection.inspectorName,
            lastQcNotes: `[REVISI QC]: ${inspection.notes}`
          };
        }
        return r;
      }));

      setMeetingRooms(prev => prev.map(mr => {
        if (mr.id === inspection.roomId || mr.name === inspection.roomNumber) {
          return {
            ...mr,
            status: 'MAINTENANCE',
            qcStatus: 'PERLU_PERBAIKAN'
          };
        }
        return mr;
      }));

      // Kembalikan tiket maintenance ke PROSES agar teknisi memperbaikinya kembali
      setMaintenances(prev => prev.map(m => {
        if ((m.roomId === inspection.roomId || m.roomNumber === inspection.roomNumber) && (m.status === 'MENUNGGU_QC' || m.status === 'PROSES')) {
          return {
            ...m,
            status: 'PROSES',
            qcVerdict: 'PERLU_PERBAIKAN',
            description: `${m.description} | [REVISI QC ${inspection.inspectorName}]: ${inspection.notes || 'Hasil perbaikan belum memenuhi standar, perlu perbaikan ulang.'}`
          };
        }
        return m;
      }));

      logAudit(
        "Verifikasi QC: Revisi Perbaikan Teknisi",
        `QC (${inspection.inspectorName}) menolak hasil perbaikan ${inspection.roomNumber} (${inspection.building}). Tiket dikembalikan ke Teknisi untuk perbaikan ulang. Catatan: ${inspection.notes}`
      );
      showToast(`Hasil perbaikan ${inspection.roomNumber} DITOLAK QC. Tiket dikembalikan ke teknisi untuk revisi/perbaikan ulang!`, "warning");

    } else {
      // PERLU PERBAIKAN: Temuan ketidaklayakan baru saat inspeksi rutin
      const newMaintId = `MNT-QC-${Date.now().toString().slice(-4)}`;

      setRooms(prev => prev.map(r => {
        if (r.id === inspection.roomId || r.roomNumber === inspection.roomNumber) {
          return {
            ...r,
            status: 'MAINTENANCE',
            activeMaintId: newMaintId,
            qcStatus: 'PERLU_PERBAIKAN',
            lastQcDate: inspection.inspectionDate,
            lastQcBy: inspection.inspectorName,
            lastQcNotes: inspection.notes || 'Ditemukan ketidaklayakan saat inspeksi QC. Diteruskan ke Manager Teknisi.'
          };
        }
        return r;
      }));

      setMeetingRooms(prev => prev.map(mr => {
        if (mr.id === inspection.roomId || mr.name === inspection.roomNumber) {
          return {
            ...mr,
            status: 'MAINTENANCE',
            qcStatus: 'PERLU_PERBAIKAN'
          };
        }
        return mr;
      }));

      const newMaint: Maintenance = {
        id: newMaintId,
        roomId: inspection.roomId,
        roomNumber: inspection.roomNumber,
        building: inspection.building,
        category: 'Temuan Tidak Layak QC',
        urgency: 'Tinggi',
        description: `Laporan QC (${inspection.inspectorName}): ${inspection.notes || 'Fasilitas tidak memenuhi standar kelayakan, butuh perbaikan teknisi.'}`,
        reportedUser: `QC - ${inspection.inspectorName}`,
        reportTime: inspection.inspectionDate,
        status: 'MENUNGGU_PENUGASAN',
        technician: 'Menunggu Penugasan Manager Teknisi',
        facilityType: inspection.facilityType || (inspection.roomNumber.includes('Aula') ? 'RUANG_PERTEMUAN' : 'KAMAR')
      };

      setMaintenances(prev => [newMaint, ...prev]);

      logAudit(
        "Temuan QC: Tidak Layak",
        `QC ${inspection.inspectorName} menyatakan ${inspection.roomNumber} (${inspection.building}) TIDAK LAYAK. Tiket dibuat dengan status MENUNGGU PENUGASAN dari Manager Teknisi.`
      );
      showToast(`Laporan QC tersimpan: ${inspection.roomNumber} TIDAK LAYAK. Diteruskan ke Manager Teknisi!`, "warning");
    }

    // Persistensi permanen ke dataStorage & sinkronisasi Supabase Cloud
    try {
      const currentDb = dataStorage.getDatabase();
      let nextRooms = [...(currentDb.rooms || rooms)];
      let nextMeetingRooms = [...(currentDb.meetingRooms || meetingRooms)];
      let nextMaintenances = [...(currentDb.maintenances || maintenances)];

      if (isLolos) {
        nextRooms = nextRooms.map(r => (r.id === inspection.roomId || r.roomNumber === inspection.roomNumber) ? {
          ...r,
          status: (r.status === 'TERISI' ? 'TERISI' : 'KOSONG') as any,
          activeMaintId: null,
          qcStatus: 'LOLOS_QC',
          lastQcDate: inspection.inspectionDate,
          lastQcBy: inspection.inspectorName,
          lastQcNotes: inspection.notes || 'Kondisi kamar/gedung bersih, fasilitas normal, dan LOLOS standar QC'
        } : r);
        nextMeetingRooms = nextMeetingRooms.map(mr => (mr.id === inspection.roomId || mr.name === inspection.roomNumber) ? {
          ...mr,
          status: mr.status === 'TERPAKAI' ? 'TERPAKAI' : 'TERSEDIA',
          qcStatus: 'LOLOS_QC'
        } : mr);
        nextMaintenances = nextMaintenances.map(m => ((m.roomId === inspection.roomId || m.roomNumber === inspection.roomNumber) && (m.status === 'MENUNGGU_QC' || m.status === 'PROSES' || m.status === 'MENUNGGU_PENUGASAN')) ? {
          ...m,
          status: 'SELESAI',
          resolvedTime: nowStr,
          qcVerdict: 'LOLOS_QC',
          qcInspectionId: inspection.id
        } : m);
      } else if (isRevisi) {
        nextRooms = nextRooms.map(r => (r.id === inspection.roomId || r.roomNumber === inspection.roomNumber) ? {
          ...r,
          status: 'MAINTENANCE',
          qcStatus: 'PERLU_PERBAIKAN',
          lastQcDate: inspection.inspectionDate,
          lastQcBy: inspection.inspectorName,
          lastQcNotes: `[REVISI QC]: ${inspection.notes}`
        } : r);
        nextMeetingRooms = nextMeetingRooms.map(mr => (mr.id === inspection.roomId || mr.name === inspection.roomNumber) ? {
          ...mr,
          status: 'MAINTENANCE',
          qcStatus: 'PERLU_PERBAIKAN'
        } : mr);
        nextMaintenances = nextMaintenances.map(m => ((m.roomId === inspection.roomId || m.roomNumber === inspection.roomNumber) && (m.status === 'MENUNGGU_QC' || m.status === 'PROSES')) ? {
          ...m,
          status: 'PROSES',
          qcVerdict: 'PERLU_PERBAIKAN',
          description: `${m.description} | [REVISI QC ${inspection.inspectorName}]: ${inspection.notes || 'Hasil perbaikan belum memenuhi standar, perlu perbaikan ulang.'}`
        } : m);
      } else {
        const generatedMaintId = `MNT-QC-${Date.now().toString().slice(-4)}`;
        nextRooms = nextRooms.map(r => (r.id === inspection.roomId || r.roomNumber === inspection.roomNumber) ? {
          ...r,
          status: 'MAINTENANCE',
          activeMaintId: generatedMaintId,
          qcStatus: 'PERLU_PERBAIKAN',
          lastQcDate: inspection.inspectionDate,
          lastQcBy: inspection.inspectorName,
          lastQcNotes: inspection.notes || 'Ditemukan ketidaklayakan saat inspeksi QC. Diteruskan ke Manager Teknisi.'
        } : r);
        nextMeetingRooms = nextMeetingRooms.map(mr => (mr.id === inspection.roomId || mr.name === inspection.roomNumber) ? {
          ...mr,
          status: 'MAINTENANCE',
          qcStatus: 'PERLU_PERBAIKAN'
        } : mr);
        const newMaintItem: Maintenance = {
          id: generatedMaintId,
          roomId: inspection.roomId,
          roomNumber: inspection.roomNumber,
          building: inspection.building,
          category: 'Temuan Tidak Layak QC',
          urgency: 'Tinggi',
          description: `Laporan QC (${inspection.inspectorName}): ${inspection.notes || 'Fasilitas tidak memenuhi standar kelayakan, butuh perbaikan teknisi.'}`,
          reportedUser: `QC - ${inspection.inspectorName}`,
          reportTime: inspection.inspectionDate,
          status: 'MENUNGGU_PENUGASAN',
          technician: 'Menunggu Penugasan Manager Teknisi',
          facilityType: inspection.facilityType || (inspection.roomNumber.includes('Aula') ? 'RUANG_PERTEMUAN' : 'KAMAR')
        };
        nextMaintenances = [newMaintItem, ...nextMaintenances.filter(m => m.id !== generatedMaintId)];
      }

      // Validasi layer untuk memastikan state kamar & denah 100% konsisten
      const { nextRooms: validatedRooms } = validateAndSyncRoomStates(
        nextRooms,
        currentDb.transactions || transactions,
        nextMaintenances
      );

      dataStorage.saveDatabase({
        ...currentDb,
        qcInspections: [inspection, ...(currentDb.qcInspections || []).filter(q => q.id !== inspection.id)],
        rooms: validatedRooms,
        meetingRooms: nextMeetingRooms,
        maintenances: nextMaintenances
      });
      // Sinkronkan state rooms di global context agar denah penyewaan ter-update otomatis
      setRooms(validatedRooms);
    } catch (saveErr) {
      console.error('Failed to persist QC inspection to dataStorage:', saveErr);
    }
  };

  const openModal = (modalId: string, data?: any) => {
    // Validasi Cek-In Kamar: Jika status kamar masih butuh cek QC, blokir popup Cek-In dan tampilkan notifikasi
    if (modalId === 'modalCheckin' && data?.actionType === 'CHECKIN' && data?.roomId) {
      const targetRoom = rooms.find(r => r.id === data.roomId);
      if (targetRoom && (!targetRoom.qcStatus || targetRoom.qcStatus !== 'LOLOS_QC')) {
        const qcText = 
          targetRoom.qcStatus === 'MENUNGGU_QC' ? 'Menunggu Verifikasi Akhir Pasca Perbaikan Teknisi' :
          targetRoom.qcStatus === 'PERLU_PERBAIKAN' ? 'Perlu Perbaikan Teknisi' :
          'Perlu Inspeksi QC Rutin';
        showToast(`Kamar ${targetRoom.roomNumber} (${targetRoom.building}) berstatus "${qcText}". Kamar belum dapat di-check-in sebelum dilakukan inspeksi QC dan dinyatakan LOLOS_QC (Siap Huni)!`, "warning");
        return;
      }
    }
    setModalState(prev => ({ ...prev, [modalId]: { isOpen: true, data } }));
  };

  const closeModal = (modalId: string) => {
    setModalState(prev => ({ ...prev, [modalId]: { isOpen: false, data: null } }));
  };

  // Centralized Local Backup & Database Handlers
  const exportDatabaseBackup = () => {
    try {
      dataStorage.downloadBackupFile();
      showToast('Cadangan basis data lokal berhasil diunduh.', 'success');
      logAudit('Ekspor Cadangan Data', 'Pengguna mengunduh cadangan lengkap basis data sistem.');
    } catch {
      showToast('Gagal membuat berkas cadangan data.', 'error');
    }
  };

  const importDatabaseBackup = (jsonString: string): boolean => {
    try {
      const res = dataStorage.importDatabaseFromJson(jsonString);
      if (res.success) {
        const db = dataStorage.getDatabase();
        setUsers(db.users);
        setRooms(db.rooms);
        setTransactions(db.transactions);
        setMaintenances(db.maintenances);
        setAuditLogs(db.auditLogs);
        setWorkSessions(db.workSessions);
        setQcInspections(db.qcInspections);
        setChatChannels(db.chatChannels);
        setChatMessages(db.chatMessages);
        setBreakfastMenuItems(db.breakfastMenuItems || []);
        setBreakfastOrders(db.breakfastOrders || []);
        showToast(res.message, 'success');
        logAudit('Impor Cadangan Data', 'Pengguna memulihkan basis data sistem dari berkas JSON.');
        return true;
      }
      showToast(res.message, 'error');
      return false;
    } catch {
      showToast('Terjadi kesalahan saat membaca berkas cadangan.', 'error');
      return false;
    }
  };

  const resetDatabase = () => {
    // Reset pangkalan data lokal dan pastikan HANYA akun Super Admin dan Admin yang tersisa
    // Default kosongkan data aktivitas, shift, dan QC
    const db = dataStorage.resetDatabaseToDefaults();
    setUsers(db.users);
    setBuildings(db.buildings || []);
    setMeetingRooms(db.meetingRooms || []);
    setRooms(db.rooms);
    setTransactions([]);
    setMaintenances([]);
    setAuditLogs([]);
    setWorkSessions([]);
    setQcInspections([]);
    setActiveSessionId(null);
    setChatChannels(db.chatChannels);
    setChatMessages([]);
    setBreakfastMenuItems(db.breakfastMenuItems);
    setBreakfastOrders([]);
    setRoomCapacityRates(db.roomCapacityRates || dataStorage.getRoomCapacityRates());
    if (db.users && db.users.length > 0) {
      setCurrentUser(db.users[0]);
    }
    showToast('Basis data berhasil direset! Data aktivitas, shift, dan QC telah dikosongkan.', 'success');
  };

  // ==========================================
  // METODE DATABASE MASTER GEDUNG (BUILDING CRUD)
  // ==========================================
  const addBuilding = (building: Building) => {
    if (!currentUser || (!isSuperAdmin(currentUser?.role) && currentUser?.role !== 'Admin')) {
      showToast('Akses Ditolak: Hanya Super Admin atau Admin yang berwenang menambah gedung baru!', 'error');
      return;
    }
    dataStorage.saveBuilding(building);
    setBuildings(dataStorage.getBuildings());
    setRooms(dataStorage.getRooms());
    setMeetingRooms(dataStorage.getMeetingRooms());
    setTransactions(dataStorage.getTransactions());
    setMaintenances(dataStorage.getMaintenances());
    setQcInspections(dataStorage.getQcInspections());
    showToast(`Gedung "${building.name}" berhasil ditambahkan ke database!`, 'success');
    logAudit('Tambah Gedung', `Menambahkan gedung baru: ${building.name} (${building.code}) - ${building.totalRooms} Kamar`);
  };

  const updateBuilding = (building: Building) => {
    if (!currentUser || (!isSuperAdmin(currentUser?.role) && currentUser?.role !== 'Admin')) {
      showToast('Akses Ditolak: Hanya Super Admin atau Admin yang berwenang mengubah data gedung!', 'error');
      return;
    }
    const existingBld = buildings.find(b => b.id === building.id);
    const previousName = existingBld?.name;
    const savedBuilding = dataStorage.saveBuilding(building, previousName);
    const updatedBuildingsList = dataStorage.getBuildings();
    const updatedRoomsList = dataStorage.getRooms();
    setBuildings(updatedBuildingsList);
    setRooms(updatedRoomsList);
    setMeetingRooms(dataStorage.getMeetingRooms());
    setTransactions(dataStorage.getTransactions());
    setMaintenances(dataStorage.getMaintenances());
    setQcInspections(dataStorage.getQcInspections());
    setUsers(dataStorage.getUsers());
    if (previousName && selectedBuilding && selectedBuilding.trim().toLowerCase() === previousName.trim().toLowerCase()) {
      setSelectedBuilding(savedBuilding.name);
    }
    const liveCount = updatedRoomsList.filter(r => r.building.trim().toLowerCase() === savedBuilding.name.trim().toLowerCase()).length;
    showToast(`Data gedung "${savedBuilding.name}" berhasil diperbarui & unit denah kamar otomatis disesuaikan (${liveCount} Kamar)!`, 'success');
    logAudit('Ubah Gedung', `Memperbarui profil gedung: ${previousName && previousName !== savedBuilding.name ? `${previousName} -> ` : ''}${savedBuilding.name} (Kapasitas: ${liveCount} Kamar)`);
  };

  const deleteBuilding = (buildingId: string): boolean => {
    if (!currentUser || (!isSuperAdmin(currentUser?.role) && currentUser?.role !== 'Admin')) {
      showToast('Akses Ditolak: Hanya Super Admin atau Admin yang berwenang menghapus gedung!', 'error');
      return false;
    }
    const bld = buildings.find(b => b.id === buildingId);
    const res = dataStorage.deleteBuilding(buildingId);
    if (!res.success) {
      showToast(res.message, 'error');
      return false;
    }
    setBuildings(dataStorage.getBuildings());
    setRooms(dataStorage.getRooms());
    setMeetingRooms(dataStorage.getMeetingRooms());
    setTransactions(dataStorage.getTransactions());
    setMaintenances(dataStorage.getMaintenances());
    setQcInspections(dataStorage.getQcInspections());
    showToast(res.message, 'info');
    logAudit('Hapus Gedung', `Menghapus gedung: ${bld?.name || buildingId}`);
    return true;
  };

  // ==========================================
  // METODE DATABASE RUANG PERTEMUAN (CRUD)
  // ==========================================
  const addMeetingRoom = (mr: MeetingRoom) => {
    if (!currentUser || (!isSuperAdmin(currentUser?.role) && currentUser?.role !== 'Admin' && currentUser?.role !== 'Manager Resepsionis')) {
      showToast('Akses Ditolak: Anda tidak memiliki wewenang untuk menambah ruang pertemuan!', 'error');
      return;
    }
    dataStorage.saveMeetingRoom(mr);
    setMeetingRooms(dataStorage.getMeetingRooms());
    setRooms(dataStorage.getRooms());
    setBuildings(dataStorage.getBuildings());
    setTransactions(dataStorage.getTransactions());
    setMaintenances(dataStorage.getMaintenances());
    showToast(`Ruang Pertemuan "${mr.name}" berhasil ditambahkan ke database!`, 'success');
    logAudit('Tambah Ruang Pertemuan', `Menambahkan ruang pertemuan: ${mr.name} (Kapasitas: ${mr.capacity} orang)`);
  };

  const updateMeetingRoom = (mr: MeetingRoom) => {
    if (!currentUser || (!isSuperAdmin(currentUser?.role) && currentUser?.role !== 'Admin' && currentUser?.role !== 'Manager Resepsionis')) {
      showToast('Akses Ditolak: Anda tidak memiliki wewenang untuk mengubah ruang pertemuan!', 'error');
      return;
    }
    dataStorage.saveMeetingRoom(mr);
    setMeetingRooms(dataStorage.getMeetingRooms());
    setRooms(dataStorage.getRooms());
    setBuildings(dataStorage.getBuildings());
    setTransactions(dataStorage.getTransactions());
    setMaintenances(dataStorage.getMaintenances());
    showToast(`Data ruang pertemuan "${mr.name}" berhasil diperbarui!`, 'success');
    logAudit('Ubah Ruang Pertemuan', `Memperbarui ruang pertemuan: ${mr.name}`);
  };

  const deleteMeetingRoom = (mrId: string): boolean => {
    if (!currentUser || (!isSuperAdmin(currentUser?.role) && currentUser?.role !== 'Admin')) {
      showToast('Akses Ditolak: Hanya Super Admin atau Admin yang berwenang menghapus ruang pertemuan!', 'error');
      return false;
    }
    const mr = meetingRooms.find(m => m.id === mrId);
    const res = dataStorage.deleteMeetingRoom(mrId);
    if (!res.success) {
      showToast(res.message, 'error');
      return false;
    }
    setMeetingRooms(dataStorage.getMeetingRooms());
    setRooms(dataStorage.getRooms());
    setBuildings(dataStorage.getBuildings());
    setTransactions(dataStorage.getTransactions());
    setMaintenances(dataStorage.getMaintenances());
    showToast(res.message, 'info');
    logAudit('Hapus Ruang Pertemuan', `Menghapus ruang pertemuan: ${mr?.name || mrId}`);
    return true;
  };

  // ==========================================
  // METODE DATABASE MASTER KAMAR (ROOMS CRUD)
  // ==========================================
  const addRoom = (room: Room) => {
    if (!currentUser || (!isSuperAdmin(currentUser?.role) && currentUser?.role !== 'Admin' && currentUser?.role !== 'Manager Resepsionis')) {
      showToast('Akses Ditolak: Hanya Admin atau Manager Resepsionis yang dapat menambah kamar!', 'error');
      return;
    }
    dataStorage.saveRoom(room);
    setRooms(dataStorage.getRooms());
    setBuildings(dataStorage.getBuildings());
    setMeetingRooms(dataStorage.getMeetingRooms());
    setTransactions(dataStorage.getTransactions());
    setMaintenances(dataStorage.getMaintenances());
    setQcInspections(dataStorage.getQcInspections());
    showToast(`Kamar ${room.roomNumber} (${room.building}) berhasil ditambahkan ke database!`, 'success');
    logAudit('Tambah Kamar', `Menambah kamar: No ${room.roomNumber}, Gedung ${room.building}, Tipe ${room.type}`);
  };

  const updateRoom = (room: Room) => {
    if (!currentUser || (!isSuperAdmin(currentUser?.role) && currentUser?.role !== 'Admin' && currentUser?.role !== 'Manager Resepsionis')) {
      showToast('Akses Ditolak: Anda tidak memiliki wewenang untuk mengubah profil kamar!', 'error');
      return;
    }
    dataStorage.saveRoom(room);
    setRooms(dataStorage.getRooms());
    setBuildings(dataStorage.getBuildings());
    setMeetingRooms(dataStorage.getMeetingRooms());
    setTransactions(dataStorage.getTransactions());
    setMaintenances(dataStorage.getMaintenances());
    setQcInspections(dataStorage.getQcInspections());
    showToast(`Data kamar ${room.roomNumber} berhasil diperbarui!`, 'success');
    logAudit('Ubah Kamar', `Memperbarui kamar: ${room.roomNumber} (${room.building})`);
  };

  const deleteRoom = (roomId: string): boolean => {
    if (!currentUser || (!isSuperAdmin(currentUser?.role) && currentUser?.role !== 'Admin')) {
      showToast('Akses Ditolak: Hanya Super Admin atau Admin yang berwenang menghapus unit kamar!', 'error');
      return false;
    }
    const room = rooms.find(r => r.id === roomId);
    const res = dataStorage.deleteRoom(roomId);
    if (!res.success) {
      showToast(res.message, 'error');
      return false;
    }
    setRooms(dataStorage.getRooms());
    setBuildings(dataStorage.getBuildings());
    setMeetingRooms(dataStorage.getMeetingRooms());
    setTransactions(dataStorage.getTransactions());
    setMaintenances(dataStorage.getMaintenances());
    setQcInspections(dataStorage.getQcInspections());
    showToast(res.message, 'info');
    logAudit('Hapus Kamar', `Menghapus kamar: ${room?.roomNumber || roomId} (${room?.building || ''})`);
    return true;
  };

  // ==========================================
  // METODE KATALOG TIPE & KAPASITAS KAMAR (CRUD)
  // ==========================================
  const addRoomCapacityRate = (rate: RoomCapacityRate) => {
    if (!currentUser || (!isSuperAdmin(currentUser?.role) && currentUser?.role !== 'Admin' && currentUser?.role !== 'Manager Resepsionis')) {
      showToast('Akses Ditolak: Hanya Admin atau Manager Resepsionis yang dapat menambah konfigurasi tarif kamar!', 'error');
      return;
    }
    const saved = dataStorage.saveRoomCapacityRate(rate);
    setRoomCapacityRates(dataStorage.getRoomCapacityRates());

    // Sinkronkan langsung ke tabel Supabase Cloud
    supabase.from('room_capacity_rates').upsert({
      id: saved.id,
      room_type: saved.roomType,
      bed_type: saved.bedType,
      capacity_pax: saved.capacityPax,
      price_per_night: saved.pricePerNight,
      description: saved.description || null,
      facilities: saved.facilities || [],
      is_active: saved.isActive ?? true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' }).then(({ error }) => {
      if (error && error.code !== '42P01') console.warn('Supabase rate upsert:', error.message);
    });

    showToast(`Konfigurasi kamar ${rate.roomType} (${rate.bedType} - Rp ${rate.pricePerNight.toLocaleString('id-ID')}) berhasil disimpan!`, 'success');
    logAudit('Tambah Tarif Kamar', `Menambah konfigurasi kapasitas: ${rate.roomType} - ${rate.bedType} (Rp ${rate.pricePerNight})`);
  };

  const updateRoomCapacityRate = (rate: RoomCapacityRate) => {
    if (!currentUser || (!isSuperAdmin(currentUser?.role) && currentUser?.role !== 'Admin' && currentUser?.role !== 'Manager Resepsionis')) {
      showToast('Akses Ditolak: Anda tidak memiliki hak untuk mengubah tarif & kapasitas kamar!', 'error');
      return;
    }
    const saved = dataStorage.saveRoomCapacityRate(rate);
    setRoomCapacityRates(dataStorage.getRoomCapacityRates());

    // Sinkronkan langsung ke tabel Supabase Cloud
    supabase.from('room_capacity_rates').upsert({
      id: saved.id,
      room_type: saved.roomType,
      bed_type: saved.bedType,
      capacity_pax: saved.capacityPax,
      price_per_night: saved.pricePerNight,
      description: saved.description || null,
      facilities: saved.facilities || [],
      is_active: saved.isActive ?? true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' }).then(({ error }) => {
      if (error && error.code !== '42P01') console.warn('Supabase rate update:', error.message);
    });

    showToast(`Konfigurasi kamar ${rate.roomType} (${rate.bedType}) berhasil diperbarui!`, 'success');
    logAudit('Ubah Tarif Kamar', `Memperbarui konfigurasi kapasitas: ${rate.roomType} - ${rate.bedType} (Rp ${rate.pricePerNight})`);
  };

  const deleteRoomCapacityRate = (rateId: string): boolean => {
    if (!currentUser || (!isSuperAdmin(currentUser?.role) && currentUser?.role !== 'Admin' && currentUser?.role !== 'Manager Resepsionis' && currentUser?.role !== 'Manager')) {
      showToast('Akses Ditolak: Hanya Super Admin, Admin, atau Manager Resepsionis yang berwenang menghapus konfigurasi tarif kamar!', 'error');
      return false;
    }
    const item = roomCapacityRates.find(r => r.id === rateId);
    const res = dataStorage.deleteRoomCapacityRate(rateId);
    if (!res.success) {
      showToast(res.message, 'error');
      return false;
    }
    setRoomCapacityRates(dataStorage.getRoomCapacityRates());

    // Hapus juga langsung dari tabel Supabase Cloud
    supabase.from('room_capacity_rates').delete().eq('id', rateId).then(({ error }) => {
      if (error && error.code !== '42P01') console.warn('Supabase rate delete:', error.message);
    });

    showToast(res.message, 'info');
    logAudit('Hapus Tarif Kamar', `Menghapus konfigurasi: ${item?.roomType || ''} - ${item?.bedType || rateId}`);
    return true;
  };

  const resetRoomCapacityRates = () => {
    if (!currentUser || (!isSuperAdmin(currentUser?.role) && currentUser?.role !== 'Admin' && currentUser?.role !== 'Manager Resepsionis' && currentUser?.role !== 'Manager')) {
      showToast('Akses Ditolak: Anda tidak memiliki wewenang untuk mereset katalog tarif!', 'error');
      return;
    }
    const fresh = dataStorage.resetRoomCapacityRates();
    setRoomCapacityRates(fresh);
    showToast('Katalog kapasitas dan tarif kamar berhasil direset ke standar resmi UPT Asrama Haji.', 'success');
    logAudit('Reset Tarif Kamar', 'Mereset katalog kapasitas dan tarif kamar ke standar baku UPT');
  };

  const applyRateToAllRooms = (roomType: string, bedType: string, newPrice: number, facilities?: string[]) => {
    if (!currentUser || (!isSuperAdmin(currentUser?.role) && currentUser?.role !== 'Admin' && currentUser?.role !== 'Manager Resepsionis' && currentUser?.role !== 'Manager')) {
      showToast('Akses Ditolak: Tidak memiliki otorisasi sinkronisasi massal!', 'error');
      return;
    }
    const res = dataStorage.applyRateToAllMatchingRooms(roomType, bedType, newPrice, facilities);
    setRooms(dataStorage.getRooms());
    showToast(res.message, 'success');
    logAudit('Terapkan Tarif Kamar Massal', `Sinkronisasi tarif ${roomType} (${bedType}) ke ${res.count} unit kamar aktif`);
  };

  // ==========================================
  // METODE MANAJEMEN DATABASE CHAT
  // ==========================================
  const clearChatHistory = (channelId?: string) => {
    dataStorage.clearChatMessages(channelId);
    if (channelId) {
      setChatMessages(prev => prev.filter(m => m.channelId !== channelId));
      showToast('Riwayat pesan pada saluran ini berhasil dibersihkan dari database.', 'info');
    } else {
      setChatMessages([]);
      showToast('Seluruh riwayat obrolan berhasil dibersihkan dari database.', 'info');
    }
    logAudit('Bersihkan Chat', channelId ? `Menghapus riwayat obrolan channel ID ${channelId}` : 'Menghapus seluruh riwayat obrolan sistem');
  };

  const addChatChannel = (channel: ChatChannel) => {
    dataStorage.saveChatChannel(channel);
    setChatChannels(prev => [...prev.filter(c => c.id !== channel.id), channel]);
    showToast(`Saluran komunikasi "${channel.name}" berhasil dibuat!`, 'success');
    logAudit('Tambah Saluran Chat', `Membuat saluran chat: ${channel.name}`);
  };

  const deleteChatChannel = (channelId: string): boolean => {
    if (!isSuperAdmin(currentUser?.role)) {
      showToast('Akses Ditolak: Hanya Administrator yang dapat menghapus saluran!', 'error');
      return false;
    }
    dataStorage.deleteChatChannel(channelId);
    setChatChannels(prev => prev.filter(c => c.id !== channelId));
    setChatMessages(prev => prev.filter(m => m.channelId !== channelId));
    showToast('Saluran komunikasi berhasil dihapus dari database.', 'info');
    logAudit('Hapus Saluran Chat', `Menghapus saluran chat ID ${channelId}`);
    return true;
  };

  // ==========================================
  // METODE DATABASE PESANAN SARAPAN & MENU
  // ==========================================
  const addBreakfastOrder = (order: BreakfastOrder) => {
    dataStorage.saveBreakfastOrder(order);
    setBreakfastOrders(prev => [order, ...prev.filter(o => o.id !== order.id)]);

    // Sinkronkan ke transaksi aktif / booking di Manajemen Gedung
    setTransactions(prev => {
      let changed = false;
      const updated = prev.map(t => {
        const isMatch = (order.transactionId && t.id === order.transactionId) ||
                        (t.roomNumber === order.roomNumber && (t.building === order.building || !order.building) && t.status !== 'DIBATALKAN' && t.status !== 'SELESAI');
        if (isMatch) {
          changed = true;
          return {
            ...t,
            breakfast: true,
            breakfastMenu: order.menuName,
            breakfastPortions: order.portions,
            breakfastDays: order.days || t.duration,
            breakfastStatus: (order.status as any) || 'MENUNGGU',
            cateringPackage: t.cateringPackage && t.cateringPackage !== 'TIDAK' ? t.cateringPackage : 'SARAPAN',
            cateringPaxCount: order.portions
          };
        }
        return t;
      });
      if (changed) {
        dataStorage.saveTransactions(updated);
      }
      return updated;
    });

    showToast(`Pesanan sarapan kamar ${order.roomNumber} (${order.portions} porsi) berhasil dicatat & disinkronkan ke Manajemen Gedung!`, 'success');
    logAudit('Tambah Pesanan Sarapan', `Pesanan baru kamar ${order.roomNumber}: ${order.menuName} (${order.portions} porsi)`);
  };

  const updateBreakfastOrder = (order: BreakfastOrder) => {
    dataStorage.saveBreakfastOrder(order);
    setBreakfastOrders(prev => prev.map(o => o.id === order.id ? order : o));

    // Sinkronkan perubahan ke transaksi di Manajemen Gedung
    setTransactions(prev => {
      let changed = false;
      const updated = prev.map(t => {
        const isMatch = (order.transactionId && t.id === order.transactionId) ||
                        (t.roomNumber === order.roomNumber && (t.building === order.building || !order.building) && t.status !== 'DIBATALKAN' && t.status !== 'SELESAI');
        if (isMatch) {
          changed = true;
          return {
            ...t,
            breakfast: true,
            breakfastMenu: order.menuName,
            breakfastPortions: order.portions,
            breakfastDays: order.days || t.duration,
            breakfastStatus: (order.status as any) || t.breakfastStatus || 'MENUNGGU',
            cateringPackage: t.cateringPackage && t.cateringPackage !== 'TIDAK' ? t.cateringPackage : 'SARAPAN',
            cateringPaxCount: order.portions
          };
        }
        return t;
      });
      if (changed) {
        dataStorage.saveTransactions(updated);
      }
      return updated;
    });

    showToast(`Pesanan sarapan kamar ${order.roomNumber} berhasil diperbarui & disinkronkan ke Manajemen Gedung!`, 'success');
    logAudit('Ubah Pesanan Sarapan', `Memperbarui pesanan sarapan kamar ${order.roomNumber}: ${order.menuName}`);
  };

  const deleteBreakfastOrder = (orderId: string) => {
    const target = breakfastOrders.find(o => o.id === orderId);
    const cleanTxId = orderId.replace('BO-TX-', '').split('-')[0];
    
    // Call dataStorage
    dataStorage.deleteBreakfastOrder(orderId);

    // Remove from breakfast orders state
    setBreakfastOrders(prev => prev.filter(o => o.id !== orderId && (!target?.id || o.id !== target.id)));

    // Clear breakfast flag on transactions so consolidatedOrders will never resurrect it
    let matchedRoom = target?.roomNumber || '';
    setTransactions(prev => {
      let changed = false;
      const updated = prev.map(t => {
        const isMatch = 
          t.id === orderId || 
          t.id === cleanTxId || 
          orderId.includes(t.id) || 
          (target?.transactionId && t.id === target.transactionId) ||
          (target && t.roomNumber === target.roomNumber && (t.building === target.building || !target.building) && t.guestName === target.guestName);
        if (isMatch) {
          changed = true;
          if (!matchedRoom) matchedRoom = t.roomNumber;
          return {
            ...t,
            breakfast: false,
            breakfastMenu: undefined,
            breakfastPortions: 0,
            breakfastDays: 0,
            breakfastStatus: undefined,
            cateringPackage: 'TIDAK',
            cateringPaxCount: 0
          };
        }
        return t;
      });
      if (changed) {
        dataStorage.saveTransactions(updated);
      }
      return updated;
    });

    const roomLabel = matchedRoom ? `kamar ${matchedRoom}` : (target?.roomNumber ? `kamar ${target.roomNumber}` : 'pesanan');
    showToast(`Pesanan sarapan ${roomLabel} berhasil dihapus permanen dan disinkronkan ke kamar.`, 'info');
    logAudit('Hapus Pesanan Sarapan', `Menghapus pesanan sarapan ID ${orderId} (${roomLabel})`);
  };

  const updateBreakfastOrderStatusState = (orderId: string, status: BreakfastOrder['status']) => {
    let currentOrder = breakfastOrders.find(o => o.id === orderId);
    if (!currentOrder && orderId && typeof orderId === 'string' && orderId.startsWith('BO-TX-')) {
      const txId = orderId.replace('BO-TX-', '').split('-')[0];
      const tx = transactions.find(t => t.id === txId || t.id.includes(txId) || t.id === orderId);
      if (tx) {
        currentOrder = {
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
          startDate: tx.startDate || getRealTodayDate(),
          deliveryTime: '06:30 WIB',
          status: tx.status === 'DIBATALKAN' ? 'DIBATALKAN' : (tx.breakfastStatus || 'MENUNGGU'),
          createdAt: `${tx.startDate || getRealTodayDate()} 06:00:00`
        };
      }
    }
    const currentStatus = currentOrder?.status || 'MENUNGGU';

    if (currentStatus === 'DIBATALKAN' && status !== 'DIBATALKAN') {
      showToast('Pesanan ini telah dibatalkan karena reservasi kamar dibatalkan. Status tidak dapat diubah.', 'warning');
      return;
    }

    const statusRanks: Record<string, number> = {
      MENUNGGU: 0,
      SEDANG_DIBUAT: 1,
      PENGANTARAN: 2,
      SELESAI: 3,
      DIBATALKAN: -1
    };

    const currentRank = statusRanks[currentStatus] ?? 0;
    const targetRank = statusRanks[status] ?? 0;

    if (targetRank < currentRank && currentStatus !== 'DIBATALKAN' && status !== 'DIBATALKAN') {
      showToast('Alur produksi dapur bersifat maju satu arah (Forward-Only). Status tidak dapat dikembalikan ke tahap sebelumnya.', 'warning');
      return;
    }

    if (status === currentStatus) return;

    dataStorage.updateBreakfastOrderStatus(orderId, status);
    let target = currentOrder;
    setBreakfastOrders(prev => {
      const exists = prev.some(o => o.id === orderId);
      if (exists) {
        return prev.map(o => o.id === orderId ? { 
          ...o, 
          status, 
          updatedAt: new Date().toISOString(),
          ...(status === 'DIBATALKAN' ? { cancelledAt: o.cancelledAt || new Date().toISOString(), cancelReason: o.cancelReason || 'Dibatalkan oleh staf' } : {})
        } : o);
      } else if (target) {
        return [...prev, { 
          ...target, 
          status,
          ...(status === 'DIBATALKAN' ? { cancelledAt: target.cancelledAt || new Date().toISOString(), cancelReason: target.cancelReason || 'Dibatalkan oleh staf' } : {})
        }];
      }
      return prev;
    });

    if (target?.transactionId) {
      updateBreakfastStatus(target.transactionId, status);
    } else if (target) {
      const matchTx = transactions.find(t => t.roomNumber === target.roomNumber && (t.building === target.building || !target.building) && t.status !== 'DIBATALKAN' && t.status !== 'SELESAI');
      if (matchTx) {
        updateBreakfastStatus(matchTx.id, status);
      }
    }

    const statusLabels: Record<string, string> = {
      MENUNGGU: 'Menunggu',
      SEDANG_DIBUAT: 'Sedang Dimasak di Dapur',
      PENGANTARAN: 'Dalam Pengantaran ke Kamar',
      SELESAI: 'Selesai Disajikan',
      DIBATALKAN: 'Dibatalkan (Booking Batal)'
    };
    showToast(`Status sarapan kamar ${target?.roomNumber || ''} diubah ke: ${statusLabels[status] || status}`, 'info');
    logAudit('Status Sarapan', `Status sarapan kamar ${target?.roomNumber || ''} menjadi ${status}`);
  };

  const addBreakfastMenuItem = (item: BreakfastMenuItem) => {
    dataStorage.saveBreakfastMenuItem(item);
    setBreakfastMenuItems(prev => [...prev.filter(m => m.id !== item.id), item]);
    showToast(`Menu sarapan "${item.name}" berhasil ditambahkan ke katalog dapur!`, 'success');
    logAudit('Tambah Menu Sarapan', `Katalog menu ditambah: ${item.name} (Rp ${item.price.toLocaleString('id-ID')})`);
  };

  const updateBreakfastMenuItem = (item: BreakfastMenuItem) => {
    dataStorage.saveBreakfastMenuItem(item);
    setBreakfastMenuItems(prev => prev.map(m => m.id === item.id ? item : m));
    showToast(`Menu sarapan "${item.name}" berhasil diperbarui!`, 'success');
    logAudit('Ubah Menu Sarapan', `Katalog menu diubah: ${item.name}`);
  };

  const deleteBreakfastMenuItem = (itemId: string) => {
    const target = breakfastMenuItems.find(m => m.id === itemId);
    dataStorage.deleteBreakfastMenuItem(itemId);
    setBreakfastMenuItems(prev => prev.filter(m => m.id !== itemId));
    showToast(`Menu sarapan "${target?.name || itemId}" dihapus dari katalog.`, 'info');
    logAudit('Hapus Menu Sarapan', `Menghapus menu sarapan ID ${itemId}`);
  };

  const sendMaintenanceEmail = (params: any): EmailNotificationItem => {
    const sent = sendMaintenanceEmailNotification(params);
    setEmailNotifications(prev => [sent, ...prev]);
    showToast(`📧 [NOTIFIKASI TERKIRIM] Email "${sent.subject}" berhasil dikirim ke ${sent.recipientName}!`, "success");
    return sent;
  };

  const markEmailAsRead = (id: string) => {
    const updated = markEmailNotificationAsRead(id);
    setEmailNotifications(updated);
  };

  const clearEmailHistory = () => {
    clearEmailNotificationHistory();
    setEmailNotifications([]);
    showToast("Riwayat arsip notifikasi email teknisi berhasil dibersihkan.", "info");
  };

  // Modal scroll lock on body (mencegah scroll latar belakang saat modal terbuka)
  const isAnyModalOpen = Object.values(modalState).some((m: any) => Boolean(m?.isOpen));
  useBodyScrollLock(isAnyModalOpen);

  return (
    <AppContext.Provider value={{
      currentUser, users, rooms, transactions, maintenances, auditLogs, workSessions, qcInspections, activeSessionId, activeTab, toasts, modalState,
      storageNamespace, switchStorageNamespace, isNetworkOnline, isDarkMode, toggleDarkMode, updateCurrentAccount, appSettings, updateAppSettings,
      buildings, meetingRooms, addBuilding, updateBuilding, deleteBuilding, addMeetingRoom, updateMeetingRoom, deleteMeetingRoom, addRoom, updateRoom, deleteRoom,
      roomCapacityRates, addRoomCapacityRate, updateRoomCapacityRate, deleteRoomCapacityRate, resetRoomCapacityRates, applyRateToAllRooms,
      breakfastMenuItems, breakfastOrders, addBreakfastOrder, updateBreakfastOrder, deleteBreakfastOrder, updateBreakfastOrderStatusState,
      addBreakfastMenuItem, updateBreakfastMenuItem, deleteBreakfastMenuItem,
      emailNotifications, sendMaintenanceEmail, markEmailAsRead, clearEmailHistory,
      chatChannels, chatMessages, isChatOpen, activeChatChannelId, chatSoundEnabled, chatNotificationToast, unreadTotalCount,
      openChat, closeChat, setActiveChatChannelId: handleSetActiveChatChannelId, toggleChatSound, sendChatMessage,
      markChannelAsRead, dismissChatNotification, simulateIncomingChatMessage,
      clearChatHistory, addChatChannel, deleteChatChannel,
      passwordResetRequests, requestPasswordReset, approvePasswordReset, rejectPasswordReset, registerAccountRequest, approveUserRegistration, rejectUserRegistration,
      login, logout, clearWorkSessions, setActiveTab, selectedBuilding, setSelectedBuilding, addUser, updateUser, toggleUserStatus, deleteUser, addTransaction, addGroupBooking, updateGroupBooking, updateTransaction, updateBreakfastStatus, checkoutRoom, activateCheckin, cancelBooking, batchCancelGroup, extendTransaction, batchCheckinGroup, batchCheckoutGroup,
      addMaintenance, assignTechnicianToMaintenance, markMaintenanceRepaired, updateMaintenanceStatus, finishMaintenance, addQcInspection, logAudit, addAuditLog, showToast, removeToast, openModal, closeModal,
      supabaseSyncState, checksumReport, verifyDatabaseChecksum, triggerBackgroundSync, pullFromCentralDatabase, manualSyncSupabase, pushAllToSupabase,
      dataStorage, exportDatabaseBackup, importDatabaseBackup, resetDatabase
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
}
