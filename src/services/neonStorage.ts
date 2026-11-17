import type { Building, ChatChannel, ChatMessage, Maintenance, MeetingRoom, Room, Transaction, WorkSession } from '../types';
import { dataStorage } from './dataStorage';

export interface ModuleChecksumItem {
  key: string;
  label: string;
  localCount: number;
  remoteCount: number;
  localHash: string;
  remoteHash: string;
  isMatch: boolean;
}

export interface DatabaseChecksumReport {
  status: 'CHECKING' | 'SYNCED' | 'MISMATCH' | 'OFFLINE' | 'ERROR';
  localChecksum: string;
  remoteChecksum: string;
  isMatch: boolean;
  checkedAt: string;
  modules: ModuleChecksumItem[];
  mismatchedModules: string[];
  message: string;
}

type Dataset = {
  buildings?: Building[];
  rooms?: Room[];
  meetingRooms?: MeetingRoom[];
  transactions?: Transaction[];
  maintenances?: Maintenance[];
};

function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    result = Math.imul(result ^ value.charCodeAt(index), 0x01000193);
  }
  return (result >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

function sectionHash(value: unknown): string {
  const records = Array.isArray(value) ? [...value].sort((a: any, b: any) => String(a?.id || '').localeCompare(String(b?.id || ''))) : [];
  return hash(JSON.stringify(records));
}

export function computeDatasetChecksums(dataset: Dataset) {
  const sections = {
    buildings: dataset.buildings || [],
    meetingRooms: dataset.meetingRooms || [],
    rooms: dataset.rooms || [],
    transactions: dataset.transactions || [],
    maintenances: dataset.maintenances || []
  };
  const signatures = Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, {
    count: value.length,
    hash: sectionHash(value)
  }])) as Record<keyof typeof sections, { count: number; hash: string }>;
  const masterChecksum = `CHK-${hash(Object.values(signatures).map(signature => signature.hash).join(':'))}`;
  return { masterChecksum, ...signatures };
}

export async function validateDatabaseChecksumAgainstNeon(localDataset: Dataset): Promise<DatabaseChecksumReport> {
  const local = computeDatasetChecksums(localDataset);
  const checkedAt = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const response = await fetch('/api/neon/state', { cache: 'no-store' });
  if (!response.ok) {
    return {
      status: 'ERROR', localChecksum: local.masterChecksum, remoteChecksum: 'UNAVAILABLE', isMatch: false,
      checkedAt, modules: [], mismatchedModules: [], message: `Neon tidak dapat diverifikasi (HTTP ${response.status}).`
    };
  }
  const result = await response.json();
  if (!result.ok || !result.data) {
    return {
      status: 'ERROR', localChecksum: local.masterChecksum, remoteChecksum: 'UNAVAILABLE', isMatch: false,
      checkedAt, modules: [], mismatchedModules: [], message: 'Data aplikasi belum tersedia di Neon.'
    };
  }
  const remote = computeDatasetChecksums(result.data);
  const labels: Record<string, string> = {
    buildings: 'Gedung Asrama', meetingRooms: 'Ruang Pertemuan / Aula', rooms: 'Kamar & Unit Fasilitas',
    transactions: 'Transaksi & Reservasi', maintenances: 'Tiket Perawatan'
  };
  const modules = Object.keys(labels).map(key => {
    const localSection = local[key as keyof typeof local] as { count: number; hash: string };
    const remoteSection = remote[key as keyof typeof remote] as { count: number; hash: string };
    return {
      key, label: labels[key], localCount: localSection.count, remoteCount: remoteSection.count,
      localHash: localSection.hash, remoteHash: remoteSection.hash, isMatch: localSection.hash === remoteSection.hash
    };
  });
  const mismatchedModules = modules.filter(module => !module.isMatch).map(module => module.label);
  const isMatch = local.masterChecksum === remote.masterChecksum && mismatchedModules.length === 0;
  return {
    status: isMatch ? 'SYNCED' : 'MISMATCH', localChecksum: local.masterChecksum,
    remoteChecksum: remote.masterChecksum, isMatch, checkedAt, modules, mismatchedModules,
    message: isMatch ? 'Data lokal sama dengan data Neon.' : `Perbedaan terdeteksi pada: ${mismatchedModules.join(', ')}`
  };
}

export async function fetchLiveChatAndPresenceFromNeon(): Promise<{
  messages: ChatMessage[];
  sessions: WorkSession[];
  channels: ChatChannel[];
}> {
  return {
    messages: dataStorage.getChatMessages(),
    sessions: dataStorage.getWorkSessions(),
    channels: dataStorage.getChatChannels()
  };
}

export async function persistNeonChanges(): Promise<{ success: boolean; error?: string }> {
  return dataStorage.flushPendingSync();
}
