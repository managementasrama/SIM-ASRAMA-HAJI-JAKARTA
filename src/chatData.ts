import { ChatChannel, ChatMessage } from './types';

export const initialChatChannels: ChatChannel[] = [
  {
    id: 'channel-all-managers',
    name: 'Forum Koordinasi Terpadu UPT',
    scope: 'ALL_MANAGERS_GROUP',
    type: 'GROUP',
    participantIds: ['u-superadmin', 'u-admin'],
    description: 'Ruang koordinasi strategis pimpinan dan seluruh divisi operasional Asrama Haji.',
    icon: 'fa-users-gear',
    lastMessage: 'Sistem komunikasi operasional aktif. Gunakan saluran ini untuk koordinasi lintas unit.',
    lastMessageTime: '08:00',
    lastSenderName: 'Sistem UPT'
  },
  {
    id: 'channel-operasional',
    name: 'Operasional Reservasi & Front Office',
    scope: 'MANAGER_TO_SUBORDINATE',
    type: 'GROUP',
    department: 'Divisi Resepsionis',
    participantIds: ['u-superadmin', 'u-admin'],
    description: 'Koordinasi penempatan jemaah, check-in, check-out, dan status kamar.',
    icon: 'fa-bell-concierge',
    lastMessage: 'Saluran koordinasi reservasi dan registrasi jemaah siap digunakan.',
    lastMessageTime: '08:00',
    lastSenderName: 'Sistem UPT'
  },
  {
    id: 'channel-fasilitas-teknisi',
    name: 'Sarana Prasarana, Teknisi & QC',
    scope: 'MANAGER_TO_SUBORDINATE',
    type: 'GROUP',
    department: 'Divisi Teknisi & QC',
    participantIds: ['u-superadmin', 'u-admin'],
    description: 'Saluran penugasan perbaikan fasilitas, genset, AC, plumbing, dan verifikasi kelayakan kamar.',
    icon: 'fa-screwdriver-wrench',
    lastMessage: 'Saluran pemeliharaan sarana prasarana dan inspeksi QC aktif.',
    lastMessageTime: '08:00',
    lastSenderName: 'Sistem UPT'
  },
  {
    id: 'channel-koperasi-konsumsi',
    name: 'Layanan Koperasi & Sarapan Tamu',
    scope: 'MANAGER_TO_SUBORDINATE',
    type: 'GROUP',
    department: 'Divisi Koperasi',
    participantIds: ['u-superadmin', 'u-admin'],
    description: 'Koordinasi pemesanan konsumsi, menu sarapan, dan pengantaran ke kamar tamu.',
    icon: 'fa-utensils',
    lastMessage: 'Saluran katering dan koperasi siap memproses pesanan sarapan.',
    lastMessageTime: '08:00',
    lastSenderName: 'Sistem UPT'
  }
];

// Seluruh pesan chat awal dikosongkan (tanpa pesan dummy)
export const initialChatMessages: ChatMessage[] = [];
