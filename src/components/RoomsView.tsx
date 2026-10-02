import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext, isTeknisiRole, isManagerTeknisi, isQcRole, isRecepRole, isKoperasiRole, isSuperAdmin } from '../store';
import { OFFICIAL_TARIFFS, initialRoomCapacityRates, findRoomRate } from '../data';
import { Room, Building, MeetingRoom, Transaction, RoomCapacityRate } from '../types';
import { getRealTodayDate, getRealDateWithOffset, formatIndonesianDate, addDaysToDateStr, formatRupiah, getTxDays, compareBuildingOrder, isMeetingFacility, deduplicateRoomCapacityRates } from '../lib/utils';
import { BuildingModal, MeetingRoomModal, RoomModal, RoomCapacityRateModal, DeleteConfirmModal, ActionConfirmModal } from './CatalogManagementModals';

// Helper for distinctive building-related icons for penginapan and other facilities
const PENGINAPAN_ICONS = [
  'fa-hotel',
  'fa-city',
  'fa-building-columns',
  'fa-building-user',
  'fa-house-chimney-window',
  'fa-building-shield',
  'fa-building-flag',
  'fa-tower-observation',
  'fa-archway',
  'fa-landmark-dome'
];

function getBuildingIcon(bName: string, category?: string): string {
  const norm = bName.toLowerCase();
  if (category === 'SERBAGUNA' || norm.includes('serbaguna') || norm.includes('sg-') || norm.includes('(sg)')) {
    return 'fa-layer-group';
  }
  if (category === 'RUANG_PERTEMUAN' || norm.includes('ruang pertemuan') || norm.includes('aula') || norm.includes('auditorium')) {
    return 'fa-landmark';
  }
  if (norm.includes('arafah')) return 'fa-kaaba';
  if (norm.includes('muzdalifah')) return 'fa-mosque';
  if (norm.includes('mina')) return 'fa-tents';
  if (norm.includes('madinah')) return 'fa-archway';
  if (norm.includes('sekretariat') || norm.includes('kantor')) return 'fa-building-columns';
  
  // Deterministic hash so each newly added penginapan building has its own distinct building icon
  let hash = 0;
  for (let i = 0; i < bName.length; i++) {
    hash = (hash * 31 + bName.charCodeAt(i)) >>> 0;
  }
  return PENGINAPAN_ICONS[hash % PENGINAPAN_ICONS.length];
}

function getBuildingColorClass(bName: string, category?: string): { bg: string; text: string; border: string } {
  const norm = bName.toLowerCase();
  if (category === 'SERBAGUNA' || norm.includes('serbaguna') || norm.includes('sg-')) {
    return { bg: 'bg-amber-600 text-white', text: 'text-amber-800', border: 'border-amber-700' };
  }
  if (category === 'RUANG_PERTEMUAN' || norm.includes('ruang pertemuan') || norm.includes('aula')) {
    return { bg: 'bg-purple-700 text-white', text: 'text-purple-800', border: 'border-purple-800' };
  }
  if (norm.includes('arafah')) return { bg: 'bg-emerald-800 text-emerald-100', text: 'text-emerald-800', border: 'border-emerald-700' };
  if (norm.includes('muzdalifah')) return { bg: 'bg-blue-800 text-blue-100', text: 'text-blue-800', border: 'border-blue-700' };
  if (norm.includes('mina')) return { bg: 'bg-teal-800 text-teal-100', text: 'text-teal-800', border: 'border-teal-700' };
  if (norm.includes('madinah')) return { bg: 'bg-amber-800 text-amber-100', text: 'text-amber-800', border: 'border-amber-700' };
  
  const palette = [
    { bg: 'bg-indigo-800 text-indigo-100', text: 'text-indigo-800', border: 'border-indigo-700' },
    { bg: 'bg-cyan-800 text-cyan-100', text: 'text-cyan-800', border: 'border-cyan-700' },
    { bg: 'bg-rose-800 text-rose-100', text: 'text-rose-800', border: 'border-rose-700' },
    { bg: 'bg-emerald-700 text-emerald-100', text: 'text-emerald-700', border: 'border-emerald-600' },
    { bg: 'bg-violet-800 text-violet-100', text: 'text-violet-800', border: 'border-violet-700' },
  ];
  let hash = 0;
  for (let i = 0; i < bName.length; i++) {
    hash = (hash * 31 + bName.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

export function RoomsView() {
  const { 
    rooms, transactions, maintenances, openModal, finishMaintenance, currentUser, setActiveTab,
    buildings = [], meetingRooms = [], deleteBuilding, deleteMeetingRoom, deleteRoom, showToast,
    selectedBuilding, setSelectedBuilding,
    roomCapacityRates = [], addRoomCapacityRate, updateRoomCapacityRate, deleteRoomCapacityRate, resetRoomCapacityRates, applyRateToAllRooms
  } = useAppContext();

  // Sub-tabs for Rooms & Facilities View
  const [activeCatalogTab, setActiveCatalogTab] = useState<'ROOMS_GRID' | 'BUILDINGS_CATALOG' | 'ROOM_CAPACITY_RATES'>('ROOMS_GRID');
  const [bldgViewMode, setBldgViewMode] = useState<'TABLE' | 'CARDS'>('TABLE');

  // Modal State for CRUD
  const [isBuildingModalOpen, setIsBuildingModalOpen] = useState(false);
  const [buildingToEdit, setBuildingToEdit] = useState<Building | null>(null);

  const [isMeetingRoomModalOpen, setIsMeetingRoomModalOpen] = useState(false);
  const [meetingRoomToEdit, setMeetingRoomToEdit] = useState<MeetingRoom | null>(null);
  const [defaultCategoryForNewMeetingRoom, setDefaultCategoryForNewMeetingRoom] = useState<'AULA' | 'SERBAGUNA' | undefined>(undefined);

  // Helper untuk klasifikasi Serbaguna (SG) vs Ruang Pertemuan / Aula
  const isMeetingRoomSG = (m: MeetingRoom): boolean => {
    if (m.category === 'AULA' || m.category === 'RUANG_PERTEMUAN') return false;
    if (m.category === 'SERBAGUNA') return true;
    const nLower = (m.name || '').toLowerCase().trim();
    const cLower = (m.code || '').toLowerCase().trim();
    const bLower = (m.building || '').toLowerCase().trim();
    if (nLower.startsWith('ruang pertemuan') || nLower.startsWith('aula') || nLower.startsWith('auditorium') || nLower.startsWith('ruang rapat') || nLower.startsWith('ruang vip')) {
      return false;
    }
    return (
      nLower.includes('serbaguna') || 
      nLower.includes('multipurpose') || 
      nLower.startsWith('gedung sg') || 
      nLower.startsWith('sg-') || 
      cLower === 'mp' || 
      cLower === 'sg-1' || 
      cLower === 'sg-2' ||
      bLower.includes('serbaguna')
    );
  };

  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [roomToEdit, setRoomToEdit] = useState<Room | null>(null);
  const [selectedBuildingForNewRoom, setSelectedBuildingForNewRoom] = useState<string | undefined>(undefined);

  // Modal State for RoomCapacityRate CRUD
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [rateToEdit, setRateToEdit] = useState<RoomCapacityRate | null>(null);
  const [rateTypeFilter, setRateTypeFilter] = useState<string>('ALL');
  const [rateSearch, setRateSearch] = useState('');

  // Delete Confirmation Modal State
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    itemName: string;
    itemType: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    itemName: '',
    itemType: '',
    onConfirm: () => {}
  });

  // Action Confirmation Modal State (untuk Reset & Terapkan Massal)
  const [actionConfirmState, setActionConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    message: string;
    confirmText: string;
    variant?: 'danger' | 'warning' | 'primary' | 'success';
    icon?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    subtitle: '',
    message: '',
    confirmText: 'Lanjutkan',
    onConfirm: () => {}
  });

  const [bFilter, setBFilter] = useState('ALL');
  const [sFilter, setSFilter] = useState('ALL');
  const [roomTypeFilter, setRoomTypeFilter] = useState<string>('ALL');
  const [bedTypeFilter, setBedTypeFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [myZoneOnly, setMyZoneOnly] = useState(false);
  const [globalDisplay, setGlobalDisplay] = useState<'COLLAPSE' | 'EXPAND'>('COLLAPSE');
  const [buildingOverrides, setBuildingOverrides] = useState<Record<string, boolean>>({});
  const [bldgCategoryFilter, setBldgCategoryFilter] = useState<'ALL' | 'PENGINAPAN' | 'SERBAGUNA' | 'RUANG_PERTEMUAN'>('ALL');

  // Tangani navigasi langsung dari Dashboard / Keterisian Per Gedung
  useEffect(() => {
    if (selectedBuilding) {
      setActiveCatalogTab('ROOMS_GRID');
      setBFilter('ALL');
      // Otomatis buka kamar gedung yang dipilih (false = terbuka / tidak ter-collapse)
      setBuildingOverrides(prev => ({
        ...prev,
        [selectedBuilding]: false
      }));

      // Scroll halus ke kartu gedung yang dituju
      const timer = setTimeout(() => {
        const cleanId = `building-section-${selectedBuilding.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const el = document.getElementById(cleanId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [selectedBuilding]);

  const isRecep = isRecepRole(currentUser?.role);
  const isTeknisi = isTeknisiRole(currentUser?.role);
  const isManagerTek = isManagerTeknisi(currentUser?.role);
  const isQc = isQcRole(currentUser?.role);
  const isKoperasi = isKoperasiRole(currentUser?.role);
  const isSuperAdm = Boolean(currentUser && (isSuperAdmin(currentUser.role) || currentUser.role === 'Admin'));
  const canManageMaster = isSuperAdm || currentUser?.role === 'Manager Resepsionis' || currentUser?.role === 'Manager';
  const canManageRooms = isSuperAdm || isRecep;

  // Daftar tarif kapasitas kamar yang terbebas dari duplikasi
  const cleanRatesList = useMemo(() => {
    return deduplicateRoomCapacityRates(roomCapacityRates || []);
  }, [roomCapacityRates]);

  // Daftar tipe kamar unik yang terdaftar pada katalog tarif
  const catalogRoomTypes = useMemo(() => {
    const types = new Set<string>();
    cleanRatesList.forEach(r => {
      if (r.roomType && r.roomType.trim()) types.add(r.roomType.trim());
    });
    const defaults = ['Ekonomi', 'Standar', 'Superior'];
    const ordered: string[] = [];
    defaults.forEach(d => {
      if (types.has(d)) {
        ordered.push(d);
        types.delete(d);
      }
    });
    Array.from(types).sort().forEach(t => ordered.push(t));
    return ordered;
  }, [cleanRatesList]);

  // Determine user's zone
  const hasAssignedZone = currentUser?.assignedBuilding && 
    !currentUser.assignedBuilding.includes('Pusat Komando') && 
    !currentUser.assignedBuilding.includes('Kawasan') && 
    !currentUser.assignedBuilding.includes('Semua') &&
    currentUser.assignedBuilding !== '-';

  const isRoomInUserZone = (roomBuilding: string): boolean => {
    if (!hasAssignedZone || !myZoneOnly || !currentUser?.assignedBuilding) return true;
    const zone = currentUser.assignedBuilding;
    if (zone.includes('A & B') || (zone.includes('Gedung A') && zone.includes('Gedung B'))) {
      return roomBuilding === 'Gedung A (Arafah)' || roomBuilding === 'Gedung B (Muzdalifah)';
    }
    if (zone.includes('C, D') || zone.includes('C & D')) {
      return roomBuilding === 'Gedung C (Mina)' || roomBuilding === 'Gedung D (Madinah)' || roomBuilding === 'Ruang Pertemuan / Aula' || roomBuilding === 'Ruang Pertemuan' || roomBuilding === 'Gedung Serbaguna (SG)';
    }
    return true;
  };

  // Helper akurat untuk menentukan nama gedung pengelompokan ruangan pada Denah
  const getRoomBuildingKey = (r: Room): string => {
    // 1. Cek dari master meetingRooms jika terdaftar
    const matchingMr = meetingRooms.find(m => m.id === r.id || m.name.toLowerCase() === r.roomNumber.toLowerCase());
    if (matchingMr) {
      if (matchingMr.category === 'SERBAGUNA') {
        return 'Gedung Serbaguna (SG)';
      }
      if (matchingMr.category === 'AULA' || matchingMr.category === 'RUANG_PERTEMUAN') {
        return 'Ruang Pertemuan / Aula';
      }
      if (matchingMr.building && matchingMr.building !== 'Ruang Pertemuan' && matchingMr.building !== 'Ruang Pertemuan / Aula' && matchingMr.building !== 'Gedung Serbaguna' && matchingMr.building !== 'Gedung Serbaguna (SG)') {
        return matchingMr.building;
      }
      const nLower = matchingMr.name.toLowerCase().trim();
      const cLower = (matchingMr.code || '').toLowerCase().trim();
      const bLower = (matchingMr.building || '').toLowerCase().trim();
      if (nLower.startsWith('ruang pertemuan') || nLower.startsWith('aula') || nLower.startsWith('auditorium') || nLower.startsWith('ruang rapat') || nLower.startsWith('ruang vip')) {
        return 'Ruang Pertemuan / Aula';
      }
      if (nLower.includes('serbaguna') || nLower.includes('multipurpose') || nLower.startsWith('gedung sg') || nLower.startsWith('sg-') || cLower === 'mp' || cLower.startsWith('sg-') || bLower.includes('serbaguna')) {
        return 'Gedung Serbaguna (SG)';
      }
      return 'Ruang Pertemuan / Aula';
    }

    // 2. Evaluasi dari properti Room
    if (r.building === 'Gedung Serbaguna (SG)' || r.building === 'Gedung Serbaguna' || r.type === 'Gedung Serbaguna (SG)') {
      return 'Gedung Serbaguna (SG)';
    }
    if (r.building === 'Ruang Pertemuan' || r.building === 'Ruang Pertemuan / Aula' || r.type === 'Ruang Pertemuan / Aula' || isMeetingFacility(r.building) || isMeetingFacility(r.type)) {
      return 'Ruang Pertemuan / Aula';
    }
    return r.building;
  };

  const filteredRooms = rooms.filter(r => {
    const effectiveBuilding = getRoomBuildingKey(r);

    if (myZoneOnly && !isRoomInUserZone(effectiveBuilding)) return false;

    if (bFilter !== 'ALL') {
      if (bFilter === 'Gedung Serbaguna (SG)' || bFilter === 'Gedung Serbaguna') {
        if (effectiveBuilding !== 'Gedung Serbaguna (SG)') return false;
      } else if (bFilter === 'Ruang Pertemuan' || bFilter === 'Ruang Pertemuan / Aula') {
        if (effectiveBuilding !== 'Ruang Pertemuan / Aula') return false;
      } else {
        if (effectiveBuilding !== bFilter) return false;
      }
    }

    if (sFilter !== 'ALL' && r.status !== sFilter) return false;
    if (roomTypeFilter !== 'ALL') {
      if (roomTypeFilter === 'Ruang Pertemuan / Aula') {
        const isMtg = effectiveBuilding === 'Ruang Pertemuan / Aula' || effectiveBuilding === 'Gedung Serbaguna (SG)' || r.type === 'Ruang Pertemuan / Aula' || r.type === 'Gedung Serbaguna (SG)' || isMeetingFacility(effectiveBuilding);
        if (!isMtg) return false;
      } else {
        if (r.type !== roomTypeFilter) return false;
      }
    }
    if (bedTypeFilter !== 'ALL' && r.bedType !== bedTypeFilter) return false;
    if (search && !r.roomNumber.toLowerCase().includes(search.toLowerCase()) && !r.building.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped: Record<string, Room[]> = {};
  // Daftarkan semua master gedung penginapan (lewati Serbaguna dan Pertemuan agar tidak menimbulkan seksi duplikat)
  buildings.forEach(b => {
    const isSpecial = b.name === 'Ruang Pertemuan' || b.name === 'Ruang Pertemuan / Aula' || b.name === 'Gedung Serbaguna' || b.name === 'Gedung Serbaguna (SG)' || b.category === 'SERBAGUNA' || b.category === 'RUANG_PERTEMUAN';
    if (!isSpecial) {
      if (bFilter === 'ALL' || bFilter === b.name) {
        if (!myZoneOnly || isRoomInUserZone(b.name)) {
          grouped[b.name] = [];
        }
      }
    }
  });

  // Daftarkan Gedung Serbaguna (SG) dan Ruang Pertemuan / Aula TEPAT SATU KALI agar selalu tunggal & sinkron
  if ((bFilter === 'ALL' || bFilter === 'Gedung Serbaguna (SG)' || bFilter === 'Gedung Serbaguna') && (!myZoneOnly || isRoomInUserZone('Gedung Serbaguna (SG)'))) {
    grouped['Gedung Serbaguna (SG)'] = [];
  }
  if ((bFilter === 'ALL' || bFilter === 'Ruang Pertemuan' || bFilter === 'Ruang Pertemuan / Aula') && (!myZoneOnly || isRoomInUserZone('Ruang Pertemuan / Aula'))) {
    grouped['Ruang Pertemuan / Aula'] = [];
  }

  filteredRooms.forEach(r => {
    let bKey = getRoomBuildingKey(r);
    if (bKey === 'Ruang Pertemuan') bKey = 'Ruang Pertemuan / Aula';
    if (bKey === 'Gedung Serbaguna') bKey = 'Gedung Serbaguna (SG)';
    if (!grouped[bKey]) grouped[bKey] = [];
    if (!grouped[bKey].some(existing => existing.id === r.id)) {
      grouped[bKey].push(r);
    }
  });

  const buildingNames = Object.keys(grouped).filter(bName => {
    if (!search) return true;
    if (grouped[bName].length > 0) return true;
    return bName.toLowerCase().includes(search.toLowerCase());
  }).sort(compareBuildingOrder);

  const isBuildingCollapsed = (bName: string): boolean => {
    if (buildingOverrides[bName] !== undefined) {
      return buildingOverrides[bName];
    }
    return globalDisplay === 'COLLAPSE';
  };

  const toggleBuilding = (bName: string) => {
    const current = isBuildingCollapsed(bName);
    setBuildingOverrides(prev => ({
      ...prev,
      [bName]: !current,
    }));
  };

  const handleGlobalDisplayChange = (mode: 'COLLAPSE' | 'EXPAND') => {
    setGlobalDisplay(mode);
    setBuildingOverrides({});
  };

  const realTodayStr = getRealTodayDate();
  const realTomorrowStr = getRealDateWithOffset(1);

  const renderQcBadge = (qc?: string) => {
    switch (qc) {
      case 'LOLOS_QC':
        return <span className="text-[9px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-bold">✅ Lolos QC</span>;
      case 'MENUNGGU_QC':
        return <span className="text-[9px] px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded font-bold animate-pulse">🔔 Menunggu QC</span>;
      case 'PERLU_PERBAIKAN':
        return <span className="text-[9px] px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded font-bold">⚠️ Perlu Perbaikan</span>;
      case 'PERLU_INSPEKSI':
      default:
        return <span className="text-[9px] px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded font-bold">⚠️ Perlu Cek QC</span>;
    }
  };

  const getRoomCard = (room: Room) => {
    let statusBadge = null;
    let borderClass = '';
    let btnAction = null;
    const isAula = room.building === "Ruang Pertemuan" || room.building === "Gedung Serbaguna (SG)" || room.building === "Gedung Serbaguna" || isMeetingFacility(room.building) || room.type?.toLowerCase().includes("aula") || room.type?.toLowerCase().includes("pertemuan") || room.type?.toLowerCase().includes("serbaguna");
    const matchingMrCard = isAula ? meetingRooms.find(m => m.id === room.id || m.name.toLowerCase() === room.roomNumber.toLowerCase() || m.code?.toLowerCase() === room.roomNumber.toLowerCase()) : null;
    const isSG = isAula && (
      room.building === "Gedung Serbaguna (SG)" || 
      room.building === "Gedung Serbaguna" || 
      room.type === "Gedung Serbaguna (SG)" || 
      matchingMrCard?.category === 'SERBAGUNA' ||
      room.roomNumber.toLowerCase().includes('serbaguna') ||
      room.roomNumber.toLowerCase().startsWith('sg')
    );

    // Active transactions for this room
    const activeRoomTxs = transactions.filter(t => 
      t.roomId === room.id && 
      t.status !== 'DIBATALKAN' && 
      t.status !== 'SELESAI'
    );

    const activeTx = transactions.find(t => t.id === room.activeTxId);
    const evalDate = activeTx?.startDate || activeRoomTxs[0]?.startDate || realTodayStr;

    // =========================================================================
    // 1. LOGIC RUANG PERTEMUAN (AULA & GEDUNG SERBAGUNA)
    // =========================================================================
    if (isAula) {
      if (room.status === 'MAINTENANCE') {
        const aulaMaint = maintenances.find(m => m.id === room.activeMaintId || (m.roomId === room.id && m.status !== 'SELESAI'));
        const isWaitingQc = room.qcStatus === 'MENUNGGU_QC' || aulaMaint?.status === 'MENUNGGU_QC';

        if (isWaitingQc) {
          borderClass = 'border-purple-300 bg-purple-50/70';
          statusBadge = <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-700 text-white animate-pulse">Menunggu QC</span>;
          btnAction = (
            <div className="space-y-1">
              {isQc ? (
                <button 
                  onClick={() => openModal('modalQcInspection', { room })} 
                  className="w-full py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg text-xs shadow flex items-center justify-center space-x-1.5 transition"
                  title={`Lakukan inspeksi kelayakan ${isSG ? 'gedung serbaguna' : 'aula'} untuk lolos QC`}
                >
                  <i className="fa-solid fa-clipboard-check"></i>
                  <span>{isSG ? 'Inspeksi QC Gedung SG' : 'Inspeksi QC Aula'}</span>
                </button>
              ) : isTeknisi ? (
                <button 
                  onClick={() => { if (aulaMaint) openModal('modalUpdateMaintenance', { maintenance: aulaMaint }); }} 
                  className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-xs shadow flex items-center justify-center space-x-1.5 transition"
                  title="Lihat status verifikasi QC"
                >
                  <i className="fa-solid fa-clock-rotate-left"></i>
                  <span>Telah Diperbaiki (Menunggu QC)</span>
                </button>
              ) : isRecep ? (
                <button 
                  onClick={() => openModal('modalCheckin', { roomId: room.id, actionType: 'BOOKING', initialDate: addDaysToDateStr(evalDate, 1) })} 
                  className="w-full py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold rounded-lg text-xs border border-blue-200 flex items-center justify-center space-x-1.5 transition cursor-pointer"
                  title={`Booking ${isSG ? 'gedung serbaguna' : 'aula'} untuk jadwal mendatang`}
                >
                  <i className="fa-solid fa-calendar-plus text-blue-600"></i>
                  <span>{isSG ? 'Booking Gedung SG (Menunggu QC)' : 'Booking Aula (Menunggu QC)'}</span>
                </button>
              ) : (
                <div className="w-full py-1 px-1.5 bg-purple-100 text-purple-900 rounded text-[10px] font-bold border border-purple-200 text-center">
                  Menunggu Inspeksi QC
                </div>
              )}
            </div>
          );
        } else {
          borderClass = 'border-amber-300 bg-amber-50/60';
          statusBadge = <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-600 text-white">Maintenance</span>;
          btnAction = (
            <div className="space-y-1">
              {isManagerTek && aulaMaint?.status === 'MENUNGGU_PENUGASAN' ? (
                <button 
                  onClick={() => openModal('modalAssignTechnician', { maintenance: aulaMaint })} 
                  className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs shadow flex items-center justify-center space-x-1.5 transition"
                >
                  <i className="fa-solid fa-user-plus"></i>
                  <span>Tugaskan Teknisi</span>
                </button>
              ) : isTeknisi ? (
                <button 
                  onClick={() => {
                    if (aulaMaint) {
                      openModal('modalUpdateMaintenance', { maintenance: aulaMaint });
                    } else {
                      finishMaintenance(room.id);
                    }
                  }} 
                  className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs shadow flex items-center justify-center space-x-1.5 transition"
                >
                  <i className="fa-solid fa-wrench"></i>
                  <span>Update / Selesai Perbaikan</span>
                </button>
              ) : (
                <div className="w-full py-1 px-1.5 bg-amber-100/90 text-amber-900 rounded text-[10px] font-bold border border-amber-200 text-center">
                  Perbaikan Sedang Berjalan
                </div>
              )}
            </div>
          );
        }
      } else if (activeRoomTxs.length === 0) {
        // AWAL / KOSONG
        borderClass = 'border-slate-200 bg-white hover:border-hajj-500';
        statusBadge = <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">Kosong</span>;
        btnAction = isRecep ? (
          <button 
            onClick={() => openModal('modalCheckin', { roomId: room.id, actionType: 'BOOKING', initialDate: realTodayStr })} 
            className="w-full py-2 bg-hajj-700 hover:bg-hajj-800 text-white font-bold rounded-lg text-xs shadow flex items-center justify-center space-x-1.5 transition"
          >
            <i className="fa-solid fa-calendar-check text-gold-300"></i>
            <span>{isSG ? 'Booking Gedung Serbaguna' : 'Booking Ruang Pertemuan / Aula'}</span>
          </button>
        ) : isQc ? (
          <button 
            onClick={() => openModal('modalQcInspection', { room })} 
            className="w-full py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg text-xs shadow flex items-center justify-center space-x-1.5 transition"
          >
            <i className="fa-solid fa-clipboard-check"></i>
            <span>{isSG ? 'Inspeksi QC Gedung SG' : 'Inspeksi QC Aula'}</span>
          </button>
        ) : isTeknisi ? (
          <button 
            onClick={() => openModal('modalMaintenance', { roomId: room.id })} 
            className="w-full py-1.5 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 font-semibold rounded-lg text-xs flex items-center justify-center space-x-1.5 transition"
          >
            <i className="fa-solid fa-wrench text-amber-600"></i>
            <span>{isSG ? 'Lapor Perbaikan Gedung SG' : 'Lapor Perbaikan'}</span>
          </button>
        ) : (
          <div className="w-full text-center text-[10px] text-slate-400 py-1 font-medium">{isSG ? 'Gedung Serbaguna Siap Disewa' : 'Aula Siap Disewa'}</div>
        );
      } else {
        // ADA PENYEWA YANG BOOKING AULA
        const sameDateTxs = activeRoomTxs.filter(t => {
          const tDays = getTxDays(t);
          for (let j = 0; j < tDays; j++) {
            if (addDaysToDateStr(t.startDate, j) === evalDate) {
              return true;
            }
          }
          return false;
        });

        const has12OrMultiDay = sameDateTxs.some(t => t.duration >= 12 || t.durationUnit === 'Hari' || t.duration >= 24);
        const count8Jam = sameDateTxs.filter(t => (t.duration === 8 || (t.duration < 12 && t.durationUnit !== 'Hari'))).length;
        const isAulaFull = has12OrMultiDay || count8Jam >= 2;
        const isOne8Jam = !has12OrMultiDay && count8Jam === 1;

        if (isAulaFull) {
          borderClass = 'border-purple-300 bg-purple-50/70';
          statusBadge = (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-700 text-white">
              {has12OrMultiDay ? 'Penuh (12 Jam - 7 Hari)' : 'Penuh (2x 8 Jam)'}
            </span>
          );
          btnAction = isRecep ? (
            <div className="space-y-1.5">
              <div className="text-[10px] text-purple-900 bg-purple-100/90 p-1.5 rounded-lg font-semibold border border-purple-200">
                <div className="font-bold flex items-center space-x-1 text-purple-950">
                  <i className="fa-solid fa-circle-exclamation text-purple-700"></i>
                  <span>Kuota Tanggal Penuh</span>
                </div>
                <div className="text-[9px] text-purple-800 truncate mt-0.5" title={sameDateTxs.map(t => `${t.guestName} (${t.duration} Jam)`).join(', ')}>
                  {has12OrMultiDay 
                    ? `1 Penyewa 12 Jam / Multi-hari (${sameDateTxs[0]?.guestName})` 
                    : `2 Penyewa 8 Jam (${sameDateTxs.map(t => t.guestName).join(' & ')})`}
                </div>
              </div>
              <button 
                onClick={() => openModal('modalCheckin', { roomId: room.id, actionType: 'BOOKING', initialDate: addDaysToDateStr(evalDate, 1) })} 
                className="w-full py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg text-xs shadow flex items-center justify-center space-x-1.5 transition"
                title={`Tanggal ini sudah penuh. Klik untuk booking tanggal berikutnya (${addDaysToDateStr(evalDate, 1)})`}
              >
                <i className="fa-solid fa-calendar-plus text-gold-300"></i>
                <span>Booking Tgl Lain (+1 Hari)</span>
              </button>
              <button 
                onClick={() => openModal('modalCheckoutSelection', { roomId: room.id, type: 'CANCEL' })} 
                className="w-full py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-lg text-xs border border-red-200 flex items-center justify-center space-x-1.5 transition"
              >
                <i className="fa-solid fa-xmark"></i>
                <span>Batalkan Booking</span>
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-[10px] text-purple-900 bg-purple-100 p-1.5 rounded font-medium border border-purple-200">
                <span className="font-bold">Terpakai Penuh:</span> {sameDateTxs[0]?.guestName}
              </div>
              {isQc && (
                <button 
                  onClick={() => openModal('modalQcInspection', { room })} 
                  className="w-full py-1 bg-teal-50 text-teal-800 hover:bg-teal-100 font-semibold rounded text-[11px] border border-teal-200 transition"
                >
                  <i className="fa-solid fa-clipboard-check mr-1"></i> Inspeksi QC Aula
                </button>
              )}
            </div>
          );
        } else if (isOne8Jam) {
          borderClass = 'border-amber-300 bg-amber-50/70';
          statusBadge = (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-600 text-white">
              1 Penyewa (8 Jam)
            </span>
          );
          btnAction = isRecep ? (
            <div className="space-y-1.5">
              <div className="text-[10px] text-amber-900 bg-amber-100/90 p-1.5 rounded-lg font-semibold border border-amber-200">
                <div className="font-bold flex items-center space-x-1 text-amber-950">
                  <i className="fa-solid fa-clock text-amber-700"></i>
                  <span>Sisa 1 Sesi (8 Jam)</span>
                </div>
                <div className="text-[9px] text-amber-800 truncate mt-0.5">
                  {sameDateTxs[0]?.guestName} (8 Jam)
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button 
                  type="button"
                  onClick={() => openModal('modalRoomDetail', { roomId: room.id })}
                  className="py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs border border-slate-200 flex items-center justify-center space-x-1 transition cursor-pointer"
                  title="Buka rincian sewa & tambah sesi"
                >
                  <i className="fa-solid fa-file-lines text-slate-500 text-[10px]"></i>
                  <span>Rincian Ruangan</span>
                </button>
                <button 
                  type="button"
                  onClick={() => openModal('modalCheckoutSelection', { roomId: room.id, type: 'CANCEL' })} 
                  className="py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-lg text-xs border border-red-200 flex items-center justify-center space-x-1 transition cursor-pointer"
                  title="Batalkan reservasi"
                >
                  <i className="fa-solid fa-xmark text-[10px]"></i>
                  <span>Batal</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-amber-800 bg-amber-50 p-1.5 rounded font-medium border border-amber-200">
              1 Sesi Terisi: {sameDateTxs[0]?.guestName} (8 Jam)
            </div>
          );
        } else {
          borderClass = 'border-blue-300 bg-blue-50/60';
          statusBadge = <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white">Booked</span>;
          btnAction = isRecep ? (
            <div className="space-y-1.5">
              <button 
                onClick={() => openModal('modalCheckin', { roomId: room.id, actionType: 'BOOKING', initialDate: addDaysToDateStr(evalDate, 1) })} 
                className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs shadow flex items-center justify-center space-x-1.5 transition"
              >
                <i className="fa-solid fa-calendar-plus"></i>
                <span>Booking Tgl Lain (+1 Hari)</span>
              </button>
              <div className="grid grid-cols-2 gap-1.5">
                <button 
                  type="button"
                  onClick={() => openModal('modalRoomDetail', { roomId: room.id })}
                  className="py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs border border-slate-200 flex items-center justify-center space-x-1 transition cursor-pointer"
                  title="Buka rincian reservasi"
                >
                  <i className="fa-solid fa-file-lines text-indigo-600 text-[10px]"></i>
                  <span>Rincian Ruangan</span>
                </button>
                <button 
                  onClick={() => openModal('modalCheckoutSelection', { roomId: room.id, type: 'CANCEL' })} 
                  className="py-1 bg-red-50 hover:bg-red-100 text-red-700 font-semibold rounded-lg text-xs border border-red-200 flex items-center justify-center space-x-1 transition cursor-pointer"
                >
                  <i className="fa-solid fa-xmark text-[10px]"></i>
                  <span>Batal</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-blue-800 bg-blue-50 p-1.5 rounded font-medium border border-blue-200">
              Reservasi: {activeRoomTxs[0]?.guestName}
            </div>
          );
        }
      }
    } else {
      // =========================================================================
      // 2. LOGIC GEDUNG (KAMAR PENGINAPAN: GEDUNG A, B, C, D)
      // =========================================================================
      switch(room.status) {
        case 'KOSONG': {
          const bookedTxs = transactions.filter(t => t.roomId === room.id && t.status === 'BOOKED');
          borderClass = 'border-slate-200 bg-white hover:border-hajj-500';
          statusBadge = <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">Kosong</span>;
          
          if (isRecep) {
            const isNeedQc = !room.qcStatus || room.qcStatus !== 'LOLOS_QC';
            btnAction = (
              <div className="space-y-1.5">
                <button 
                  onClick={() => openModal('modalCheckin', { roomId: room.id, actionType: 'CHECKIN', initialDate: realTodayStr })} 
                  className={`w-full py-1.5 font-bold rounded-lg text-xs shadow-xs flex items-center justify-center space-x-1.5 transition cursor-pointer ${
                    isNeedQc
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                  title={
                    isNeedQc
                      ? "Perhatian: Kamar masih berstatus perlu cek QC oleh tim penilai mutu"
                      : (bookedTxs.length > 0 ? "Pilih tamu reservasi atau check-in tamu baru" : "Tamu langsung Cek In hari ini")
                  }
                >
                  <i className={`fa-solid ${isNeedQc ? 'fa-triangle-exclamation text-amber-200' : 'fa-door-open'}`}></i>
                  <span>
                    {isNeedQc
                      ? (bookedTxs.length > 0 ? `Cek In (${bookedTxs.length} Booking - Perlu QC)` : 'Cek In (Perlu Cek QC)')
                      : (bookedTxs.length > 0 ? `Cek In (${bookedTxs.length} Booking)` : 'Cek In')}
                  </span>
                </button>
                <button 
                  onClick={() => openModal('modalCheckin', { roomId: room.id, actionType: 'BOOKING', initialDate: realTomorrowStr })} 
                  className="w-full py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold rounded-lg text-xs border border-blue-200 flex items-center justify-center space-x-1.5 transition cursor-pointer"
                  title={isNeedQc ? "Booking kamar ini (Status: Perlu Cek QC)" : "Booking untuk tanggal besok / mendatang"}
                >
                  <i className="fa-solid fa-calendar-plus text-blue-600"></i>
                  <span>{isNeedQc ? 'Booking (Perlu Cek QC)' : 'Booking Tgl Lain'}</span>
                </button>
              </div>
            );
          } else if (isQc) {
            btnAction = (
              <div className="space-y-1">
                <button 
                  onClick={() => openModal('modalQcInspection', { room })} 
                  className="w-full py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg text-xs shadow flex items-center justify-center space-x-1.5 transition"
                >
                  <i className="fa-solid fa-clipboard-check"></i>
                  <span>Inspeksi QC Kamar</span>
                </button>
                <div className="text-[9px] text-slate-500 text-center font-medium">
                  {room.qcStatus === 'LOLOS_QC' ? '✅ Lolos Standar QC' : '⚠️ Perlu Verifikasi QC'}
                </div>
              </div>
            );
          } else if (isTeknisi) {
            btnAction = (
              <div className="space-y-1">
                <button 
                  onClick={() => openModal('modalMaintenance', { roomId: room.id })} 
                  className="w-full py-1.5 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 font-semibold rounded-lg text-xs flex items-center justify-center space-x-1.5 transition"
                >
                  <i className="fa-solid fa-wrench text-amber-600"></i>
                  <span>Lapor Kerusakan</span>
                </button>
                <div className="text-[9px] text-slate-400 text-center font-medium">Fasilitas Standar OK</div>
              </div>
            );
          } else if (isKoperasi) {
            btnAction = (
              <div className="w-full py-2 bg-slate-50 border border-slate-200 rounded-lg text-center text-[10px] text-slate-500 font-medium">
                <i className="fa-solid fa-bed text-slate-400 mr-1"></i> Kamar Kosong (Tanpa Tamu)
              </div>
            );
          } else {
            btnAction = (
              <div className="w-full text-center text-[10px] text-slate-400 py-1 font-medium">Kamar Kosong</div>
            );
          }
          break;
        }

        case 'BOOKED': {
          const bookedTxs = transactions.filter(t => t.roomId === room.id && t.status === 'BOOKED');
          borderClass = 'border-blue-300 bg-blue-50/60';
          statusBadge = (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white flex items-center space-x-1">
              <span>Booked</span>
              {bookedTxs.length > 1 && <span className="bg-white text-blue-800 rounded-full px-1 text-[9px] font-extrabold">{bookedTxs.length}</span>}
            </span>
          );
          
          if (isRecep) {
            const isNeedQc = !room.qcStatus || room.qcStatus !== 'LOLOS_QC';
            btnAction = (
              <div className="space-y-1.5">
                <div className="text-[10px] text-slate-700 truncate font-bold mb-0.5">
                  <i className="fa-solid fa-calendar-check text-blue-600 mr-1"></i> {activeTx ? activeTx.guestName : (bookedTxs[0]?.guestName || 'Reservasi')}
                </div>
                <button 
                  type="button"
                  onClick={() => openModal('modalCheckin', { roomId: room.id, actionType: 'CHECKIN', initialDate: realTodayStr })} 
                  className={`w-full py-1.5 font-bold rounded-lg text-xs shadow flex items-center justify-center space-x-1.5 transition cursor-pointer ${
                    isNeedQc
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                  title={
                    isNeedQc 
                      ? "Perhatian: Kamar masih berstatus perlu cek QC oleh tim penilai mutu" 
                      : "Pilih data tamu booking untuk proses check-in masuk kamar"
                  }
                >
                  <i className={`fa-solid ${isNeedQc ? 'fa-triangle-exclamation text-amber-200' : 'fa-door-open'}`}></i>
                  <span>
                    {isNeedQc
                      ? `Check-In (${bookedTxs.length} Tamu - Perlu QC)`
                      : `Check-In (${bookedTxs.length} Tamu Booking)`}
                  </span>
                </button>
                <div className="grid grid-cols-3 gap-1">
                  <button 
                    type="button"
                    onClick={() => openModal('modalCheckin', { roomId: room.id, actionType: 'BOOKING', initialDate: realTomorrowStr })} 
                    className="py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold rounded-lg text-[11px] border border-blue-200 flex items-center justify-center space-x-1 transition cursor-pointer"
                    title="Booking untuk tanggal lain / mendatang"
                  >
                    <i className="fa-solid fa-calendar-plus text-blue-600 text-[10px]"></i>
                    <span>Tgl Lain</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => openModal('modalRoomDetail', { roomId: room.id })} 
                    className="py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-[11px] border border-slate-200 flex items-center justify-center space-x-1 transition cursor-pointer"
                    title="Buka rincian reservasi dan cetak invoice"
                  >
                    <i className="fa-solid fa-file-invoice text-indigo-600 text-[10px]"></i>
                    <span>Rincian</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => openModal('modalCheckoutSelection', { roomId: room.id, type: 'CANCEL' })} 
                    className="py-1 bg-red-50 text-red-700 hover:bg-red-100 font-semibold rounded-lg text-[11px] border border-red-200 flex items-center justify-center space-x-1 transition cursor-pointer"
                    title="Batalkan reservasi ini"
                  >
                    <i className="fa-solid fa-xmark text-[10px]"></i>
                    <span>Batal</span>
                  </button>
                </div>
              </div>
            );
          } else {
            btnAction = (
              <div className="space-y-1">
                <div className="text-[10px] text-blue-900 bg-blue-100/90 p-1.5 rounded-lg font-medium border border-blue-200">
                  <span className="font-bold">Booking:</span> {activeTx ? activeTx.guestName : (bookedTxs[0]?.guestName || 'Tamu Reservasi')}
                </div>
                {isQc && (
                  <button 
                    onClick={() => openModal('modalQcInspection', { room })} 
                    className="w-full py-1 bg-teal-50 text-teal-800 hover:bg-teal-100 font-semibold rounded text-[11px] border border-teal-200 transition"
                  >
                    <i className="fa-solid fa-clipboard-check mr-1"></i> Cek Kesiapan Kamar
                  </button>
                )}
              </div>
            );
          }
          break;
        }

        case 'TERISI': {
          const bookedTxs = transactions.filter(t => t.roomId === room.id && t.status === 'BOOKED');
          const terisiTxs = transactions.filter(t => t.roomId === room.id && t.status === 'TERISI');
          borderClass = 'border-emerald-300 bg-emerald-50/60';
          statusBadge = (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white flex items-center space-x-1">
              <span>Terisi</span>
              {terisiTxs.length > 1 && (
                <span className="bg-white text-emerald-800 rounded-full px-1.5 py-0 text-[9px] font-extrabold ml-1">
                  {terisiTxs.length} Tamu
                </span>
              )}
            </span>
          );

          if (isRecep) {
            btnAction = (
              <div className="space-y-1.5">
                <div className="text-[10px] text-slate-700 truncate font-bold mb-0.5 flex items-center justify-between">
                  <span className="truncate">
                    <i className="fa-solid fa-user text-emerald-600 mr-1"></i> 
                    {terisiTxs.length > 1 
                      ? `${terisiTxs[0].guestName} (+${terisiTxs.length - 1})` 
                      : (activeTx ? activeTx.guestName : 'Jemaah')}
                  </span>
                  {activeTx?.extraBed && (
                    <span className="text-[9px] px-1 py-0.2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-bold shrink-0 ml-1" title={`${activeTx.extraBedCount || 1} Extra Bed`}>
                      +{activeTx.extraBedCount || 1} Bed
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button 
                    type="button"
                    onClick={() => openModal('modalCheckoutSelection', { roomId: room.id, type: 'CHECKOUT' })} 
                    className="py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs shadow-xs flex items-center justify-center space-x-1 transition cursor-pointer"
                    title="Check-Out tamu dari kamar"
                  >
                    <i className="fa-solid fa-right-from-bracket text-[10px]"></i>
                    <span>Check-Out</span>
                  </button>
                  {((activeTx && activeTx.status === 'TERISI') || (terisiTxs.length > 0 && terisiTxs[0].status === 'TERISI')) && (
                    <button 
                      type="button"
                      onClick={() => openModal('modalExtend', { transaction: activeTx || terisiTxs[0], room, returnToRoomId: room.id })} 
                      className="py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg text-xs shadow-xs flex items-center justify-center space-x-1 transition cursor-pointer"
                      title="Perpanjang masa sewa kamar (Extend)"
                    >
                      <i className="fa-solid fa-clock-rotate-left text-[10px]"></i>
                      <span>Extend</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button 
                    type="button"
                    onClick={() => {
                      const nextDate = activeTx ? addDaysToDateStr(activeTx.startDate, activeTx.duration) : addDaysToDateStr(evalDate, 1);
                      openModal('modalCheckin', { roomId: room.id, actionType: 'BOOKING', initialDate: nextDate });
                    }} 
                    className="py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold rounded-lg text-xs border border-blue-200 flex items-center justify-center space-x-1 transition cursor-pointer"
                    title="Booking untuk tanggal setelah tamu checkout"
                  >
                    <i className="fa-solid fa-calendar-plus text-blue-600 text-[10px]"></i>
                    <span>Booking Tgl Lain</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => openModal('modalRoomDetail', { roomId: room.id })}
                    className="py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs border border-slate-200 flex items-center justify-center space-x-1.5 transition cursor-pointer"
                    title="Buka rincian lengkap & administrasi kamar"
                  >
                    <i className="fa-solid fa-file-lines text-slate-500 text-[10px]"></i>
                    <span>Rincian Kamar</span>
                  </button>
                </div>
                {bookedTxs.length > 0 && (
                  <button 
                    type="button"
                    onClick={() => openModal('modalCheckoutSelection', { roomId: room.id, type: 'CANCEL' })} 
                    className="w-full py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold rounded-lg text-[11px] border border-amber-200 flex items-center justify-center space-x-1 transition cursor-pointer"
                    title="Batalkan reservasi booking tamu yang belum tiba"
                  >
                    <i className="fa-solid fa-ban text-amber-600"></i>
                    <span>Batalkan Booking ({bookedTxs.length})</span>
                  </button>
                )}
              </div>
            );
          } else if (isKoperasi) {
            const hasBreakfast = activeTx?.breakfast;
            btnAction = (
              <div className="space-y-1.5">
                <div className="text-[10px] text-slate-800 bg-orange-50 border border-orange-200 p-1.5 rounded-lg font-medium">
                  <div className="font-bold text-orange-950 truncate">{activeTx?.guestName || 'Tamu Menginap'}</div>
                  <div className="text-[9px] text-orange-800 mt-0.5">
                    {hasBreakfast ? `🍱 ${activeTx?.breakfastMenu} (${activeTx?.breakfastPortions || 1} Porsi)` : '❌ Tidak Pesan Sarapan'}
                  </div>
                </div>
                <button 
                  onClick={() => setActiveTab('pesananSarapan')} 
                  className="w-full py-1 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded text-xs transition"
                >
                  <i className="fa-solid fa-utensils mr-1"></i> Buka Pesanan Dapur
                </button>
              </div>
            );
          } else {
            btnAction = (
              <div className="space-y-1">
                <div className="text-[10px] text-emerald-900 bg-emerald-50 border border-emerald-200 p-1.5 rounded font-medium">
                  <span className="font-bold">Tamu Menginap:</span> {activeTx?.guestName || 'Jemaah'}
                </div>
                <button 
                  onClick={() => openModal('modalMaintenance', { roomId: room.id })} 
                  className="w-full py-1 bg-amber-50 text-amber-800 hover:bg-amber-100 font-semibold rounded text-[11px] border border-amber-200 transition"
                >
                  <i className="fa-solid fa-wrench mr-1 text-amber-600"></i> Lapor Kendala Kamar
                </button>
              </div>
            );
          }
          break;
        }

        case 'MAINTENANCE': {
          const roomMaint = maintenances.find(m => m.id === room.activeMaintId || (m.roomId === room.id && m.status !== 'SELESAI'));
          const isWaitingQc = room.qcStatus === 'MENUNGGU_QC' || roomMaint?.status === 'MENUNGGU_QC';

          if (isWaitingQc) {
            borderClass = 'border-purple-300 bg-purple-50/70';
            statusBadge = <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-700 text-white animate-pulse">Menunggu QC</span>;
            btnAction = (
              <div className="space-y-1.5">
                {isQc ? (
                  <button 
                    onClick={() => openModal('modalQcInspection', { room })} 
                    className="w-full py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg text-xs shadow flex items-center justify-center space-x-1.5 transition"
                    title="Lakukan inspeksi kelayakan kamar untuk lolos QC"
                  >
                    <i className="fa-solid fa-clipboard-check"></i>
                    <span>Inspeksi QC Kamar</span>
                  </button>
                ) : isTeknisi ? (
                  <button 
                    onClick={() => { if (roomMaint) openModal('modalUpdateMaintenance', { maintenance: roomMaint }); }} 
                    className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-xs shadow flex items-center justify-center space-x-1.5 transition"
                    title="Lihat status verifikasi QC"
                  >
                    <i className="fa-solid fa-clock-rotate-left"></i>
                    <span>Telah Diperbaiki (Menunggu QC)</span>
                  </button>
                ) : (
                  <div className="w-full py-1 px-1.5 bg-purple-100 text-purple-900 rounded text-[10px] font-bold border border-purple-200 text-center">
                    Menunggu Verifikasi QC
                  </div>
                )}
                {isRecep && (
                  <button 
                    onClick={() => openModal('modalCheckin', { roomId: room.id, actionType: 'BOOKING', initialDate: addDaysToDateStr(evalDate, 1) })} 
                    className="w-full py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold rounded-lg text-xs border border-blue-200 flex items-center justify-center space-x-1.5 transition"
                    title="Booking untuk jadwal tanggal berikutnya"
                  >
                    <i className="fa-solid fa-calendar-plus text-blue-600"></i>
                    <span>Booking Tgl Lain (+1 Hari)</span>
                  </button>
                )}
              </div>
            );
          } else {
            borderClass = 'border-amber-300 bg-amber-50/70';
            statusBadge = <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-600 text-white">Maintenance</span>;
            btnAction = (
              <div className="space-y-1.5">
                {isManagerTek && roomMaint?.status === 'MENUNGGU_PENUGASAN' ? (
                  <button 
                    onClick={() => openModal('modalAssignTechnician', { maintenance: roomMaint })} 
                    className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs shadow flex items-center justify-center space-x-1.5 transition"
                  >
                    <i className="fa-solid fa-user-plus"></i>
                    <span>Tugaskan Teknisi</span>
                  </button>
                ) : isTeknisi ? (
                  <button 
                    onClick={() => {
                      if (roomMaint) {
                        openModal('modalUpdateMaintenance', { maintenance: roomMaint });
                      } else {
                        finishMaintenance(room.id);
                      }
                    }} 
                    className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs shadow flex items-center justify-center space-x-1.5 transition"
                    title="Update status perbaikan atau laporkan selesai"
                  >
                    <i className="fa-solid fa-wrench"></i>
                    <span>Update / Selesai Perbaikan</span>
                  </button>
                ) : (
                  <div className="w-full py-1 px-1.5 bg-amber-100/90 text-amber-900 rounded text-[10px] font-bold border border-amber-200 text-center flex items-center justify-center space-x-1">
                    <i className="fa-solid fa-wrench text-amber-700 text-[10px]"></i>
                    <span>Sedang Dikerjakan Teknisi</span>
                  </div>
                )}
                {isRecep && (
                  <button 
                    onClick={() => openModal('modalCheckin', { roomId: room.id, actionType: 'BOOKING', initialDate: addDaysToDateStr(evalDate, 1) })} 
                    className="w-full py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold rounded-lg text-xs border border-blue-200 flex items-center justify-center space-x-1.5 transition"
                    title="Booking untuk jadwal tanggal berikutnya"
                  >
                    <i className="fa-solid fa-calendar-plus text-blue-600"></i>
                    <span>Booking Tgl Lain (+1 Hari)</span>
                  </button>
                )}
              </div>
            );
          }
          break;
        }
      }
    }

    const hasOccupant = !!activeTx;

    return (
      <div 
        key={room.id} 
        className={`p-2.5 sm:p-3 rounded-xl border ${borderClass} shadow-xs flex flex-col justify-between space-y-2 sm:space-y-2.5 relative group hover:shadow-md transition bg-white`}
      >
        <div>
          <div className="flex items-start justify-between gap-1.5">
            <button 
              type="button"
              onClick={() => openModal('modalRoomDetail', { roomId: room.id })}
              className="font-bold text-xs text-slate-800 hover:text-hajj-800 flex items-start gap-2 text-left cursor-pointer min-w-0 flex-1 group/btn"
              title="Klik untuk melihat rincian & kelola kamar ini"
            >
              {(() => {
                const matchingMrCard = meetingRooms.find(m => m.id === room.id || m.name.toLowerCase() === room.roomNumber.toLowerCase());
                const isSGCard = isAula && (
                  room.building === "Gedung Serbaguna (SG)" || 
                  room.building === "Gedung Serbaguna" || 
                  room.type === "Gedung Serbaguna (SG)" || 
                  matchingMrCard?.category === 'SERBAGUNA'
                );
                return (
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${
                    isSGCard
                      ? 'bg-amber-100 text-amber-900 border border-amber-200'
                      : isAula 
                      ? 'bg-purple-100 text-purple-900 border border-purple-200' 
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  } shrink-0 shadow-2xs`}>
                    <i className={`fa-solid ${
                      isSGCard
                        ? 'fa-building-columns text-xs text-amber-700'
                        : isAula 
                        ? 'fa-landmark text-xs text-purple-700' 
                        : 'fa-bed text-xs text-slate-600'
                    }`}></i>
                  </span>
                );
              })()}
              <div className="min-w-0 flex-1 flex flex-col justify-center">
                <span className="font-bold text-xs text-slate-900 leading-tight break-words block group-hover/btn:text-hajj-700">
                  {isAula ? room.roomNumber : `Kamar ${room.roomNumber}`}
                </span>
                <span className="text-[10px] text-slate-500 font-medium leading-tight block truncate mt-0.5">
                  {(() => {
                    const matchingMrCard = meetingRooms.find(m => m.id === room.id || m.name.toLowerCase() === room.roomNumber.toLowerCase());
                    const isSGCard = isAula && (
                      room.building === "Gedung Serbaguna (SG)" || 
                      room.building === "Gedung Serbaguna" || 
                      room.type === "Gedung Serbaguna (SG)" || 
                      matchingMrCard?.category === 'SERBAGUNA'
                    );
                    return isSGCard ? 'Gedung Serbaguna (SG)' : isAula ? 'Ruang Pertemuan / Aula' : `${room.building} • Hunian`;
                  })()}
                </span>
              </div>
            </button>
            <div className="shrink-0 pt-0.5 flex flex-col items-end space-y-1">
              {statusBadge}
              {renderQcBadge(room.qcStatus)}
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 pt-1.5 border-t border-slate-100">
            <span className="inline-flex items-center space-x-1 font-medium">
              <i className={`fa-solid ${isAula ? 'fa-users-line text-hajj-700' : 'fa-users text-slate-400'} text-[10px]`}></i>
              <span>{room.capacity} {isAula ? 'Pax' : 'Orang'}</span>
            </span>
            {isAula ? (
              (() => {
                const matchingMrCard = meetingRooms.find(m => m.id === room.id || m.name.toLowerCase() === room.roomNumber.toLowerCase());
                const isSGCard = (
                  room.building === "Gedung Serbaguna (SG)" || 
                  room.building === "Gedung Serbaguna" || 
                  room.type === "Gedung Serbaguna (SG)" || 
                  matchingMrCard?.category === 'SERBAGUNA'
                );
                return (
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
                    isSGCard 
                      ? 'text-amber-900 bg-amber-50 border-amber-200'
                      : 'text-purple-900 bg-purple-50 border-purple-200'
                  }`}>
                    {isSGCard ? 'Serbaguna (SG)' : 'Aula / Rapat'}
                  </span>
                );
              })()
            ) : (
              <div className="flex items-center space-x-1">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                  room.type === 'Superior'
                    ? 'bg-purple-100 text-purple-800 border-purple-300'
                    : room.type === 'Ekonomi'
                    ? 'bg-teal-100 text-teal-800 border-teal-300'
                    : 'bg-blue-100 text-blue-800 border-blue-300'
                }`}>
                  {room.type || 'Standar'}
                </span>
                {room.bedType && (
                  <span className="text-[9px] font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    {room.bedType}
                  </span>
                )}
              </div>
            )}
          </div>
          {isAula ? (
            (() => {
              const matchingMrCard = meetingRooms.find(m => m.id === room.id || m.name.toLowerCase() === room.roomNumber.toLowerCase() || m.code?.toLowerCase() === room.roomNumber.toLowerCase());
              const sessionRate = matchingMrCard?.sessionRate || (isSG ? 8500000 : 7000000);
              const dailyRate = matchingMrCard?.dailyRate || (isSG ? 15000000 : 12000000);
              return (
                <div className="text-[9.5px] text-right font-mono font-bold pt-1 flex flex-col items-end leading-tight">
                  <span className={isSG ? 'text-amber-800 dark:text-amber-300' : 'text-purple-800 dark:text-purple-300'}>
                    {formatRupiah(sessionRate)} <span className="text-[8.5px] font-sans text-slate-500 font-normal">/ Sesi (8 Jam)</span>
                  </span>
                  <span className="text-[8.5px] text-slate-500 font-normal font-sans">
                    {formatRupiah(dailyRate)} / 12 Jam (Penuh)
                  </span>
                </div>
              );
            })()
          ) : room.pricePerNight && room.pricePerNight > 0 ? (
            <div className="text-[10px] text-right font-mono font-bold text-emerald-700 pt-0.5">
              {formatRupiah(room.pricePerNight)} <span className="text-[9px] font-sans text-slate-400 font-normal">/mlm</span>
            </div>
          ) : null}
        </div>

        <div className="pt-1 border-t border-slate-100 space-y-1">
          {btnAction}
          <div className="flex items-center justify-between gap-1 pt-0.5">
            <button 
              type="button"
              onClick={() => openModal('modalMaintenance', { roomId: room.id })} 
              title="Set Maintenance / Perawatan" 
              className="w-full text-center text-[10px] text-slate-600 hover:text-amber-700 py-1 rounded bg-slate-50 hover:bg-amber-50 border border-slate-200 cursor-pointer transition flex items-center justify-center space-x-1 font-semibold"
            >
              <i className="fa-solid fa-wrench text-[9px] text-amber-600"></i>
              <span>Perawatan</span>
            </button>

            {canManageRooms && (
              <button 
                type="button"
                onClick={() => {
                  const isMeetingRoom = isAula || 
                                        room.building === 'Ruang Pertemuan' || 
                                        room.building === 'Gedung Serbaguna (SG)' || 
                                        room.building === 'Gedung Serbaguna' || 
                                        room.type === 'Ruang Pertemuan / Aula' || 
                                        room.type === 'Gedung Serbaguna (SG)' || 
                                        meetingRooms.some(m => m.id === room.id || m.name.toLowerCase() === room.roomNumber.toLowerCase());
                  if (isMeetingRoom) {
                    const matchingMr = meetingRooms.find(m => m.id === room.id || m.name.toLowerCase() === room.roomNumber.toLowerCase()) || {
                      id: room.id,
                      name: room.roomNumber,
                      building: room.building,
                      capacity: typeof room.capacity === 'string' ? room.capacity : `${room.capacity} Orang`,
                      capacityNumber: typeof room.capacity === 'number' ? room.capacity : 500,
                      facilities: room.facilities,
                      dailyRate: room.pricePerNight || 15000000,
                      sessionRate: Math.round((room.pricePerNight || 15000000) * 0.6),
                      status: room.status === 'MAINTENANCE' ? 'MAINTENANCE' : (room.status === 'TERISI' ? 'TERPAKAI' : 'TERSEDIA'),
                    };
                    setMeetingRoomToEdit(matchingMr as any);
                    setIsMeetingRoomModalOpen(true);
                  } else {
                    setRoomToEdit(room);
                    setIsRoomModalOpen(true);
                  }
                }} 
                title={isAula ? "Edit Fasilitas Ruang Pertemuan / Aula" : "Edit Data Kamar"} 
                className="p-1 text-[10px] text-slate-500 hover:text-blue-700 rounded hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer transition"
              >
                <i className="fa-solid fa-pen-to-square"></i>
              </button>
            )}

            {canManageMaster && (
              <button 
                type="button"
                onClick={() => {
                  setDeleteConfirmState({
                    isOpen: true,
                    title: 'Hapus Kamar',
                    itemName: `${room.building} - Kamar ${room.roomNumber}`,
                    itemType: 'Kamar',
                    onConfirm: () => {
                      deleteRoom(room.id);
                      showToast(`Kamar ${room.roomNumber} berhasil dihapus dari database.`, 'info');
                    }
                  });
                }} 
                title="Hapus Kamar" 
                className="p-1 text-[10px] text-slate-400 hover:text-rose-700 rounded hover:bg-rose-50 cursor-pointer transition"
              >
                <i className="fa-solid fa-trash-can"></i>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. EXECUTIVE METRIC CARDS (Panel Okupansi Kamar & Manajemen Ruangan) */}
      {(() => {
        const realToday = getRealTodayDate();
        const kamarRooms = rooms.filter(r => r.building !== 'Ruang Pertemuan' && !isMeetingFacility(r.building) && !r.type?.toLowerCase().includes('pertemuan') && !r.type?.toLowerCase().includes('aula'));
        const totalKamar = kamarRooms.length;
        const terisiKamar = kamarRooms.filter(r => r.status === 'TERISI').length;
        const bookedKamar = kamarRooms.filter(r => r.status === 'BOOKED').length;
        const maintKamar = kamarRooms.filter(r => r.status === 'MAINTENANCE').length;
        const kosongKamar = kamarRooms.filter(r => r.status === 'KOSONG').length;
        const occupancyPercent = totalKamar > 0 ? Math.round((terisiKamar / totalKamar) * 100) : 0;

        const aulaRooms = rooms.filter(r => r.building === 'Ruang Pertemuan' || isMeetingFacility(r.building) || r.type?.toLowerCase().includes('pertemuan') || r.type?.toLowerCase().includes('aula'));
        const totalAula = aulaRooms.length;
        const aulaTerisi = aulaRooms.filter(r => r.status === 'TERISI' || r.status === 'BOOKED').length;

        const activeTransactions = transactions.filter(tx => tx.status === 'TERISI');
        const jemaahCount = activeTransactions.filter(tx => tx.category === 'JEMAAH').length;
        const umumCount = activeTransactions.filter(tx => tx.category === 'UMUM').length;

        const checkinTodayList = transactions.filter(tx => {
          return tx.building !== 'Ruang Pertemuan' && tx.status === 'BOOKED' && tx.startDate === realToday;
        });

        const urgentMaintenances = maintenances.filter(m => m.status !== 'SELESAI' && m.urgency === 'Urgent');
        const activeMaintenances = maintenances.filter(m => m.status !== 'SELESAI');

        const readyQcRooms = rooms.filter(r => r.qcStatus === 'LOLOS_QC').length;
        const waitingQcRooms = rooms.filter(r => r.qcStatus === 'MENUNGGU_QC').length;

        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
            {/* Okupansi Kamar */}
            <div 
              onClick={() => setActiveCatalogTab('ROOMS_GRID')}
              className="bg-white dark:bg-slate-800 p-2.5 sm:p-3.5 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 flex flex-col justify-between hover:border-emerald-400 dark:hover:border-emerald-500 hover:shadow-sm transition cursor-pointer group"
              title="Denah & daftar seluruh kamar"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider group-hover:text-emerald-700 dark:group-hover:text-emerald-400">Okupansi</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-black text-[9px] sm:text-[10px] border border-emerald-200 dark:border-emerald-800">
                  {occupancyPercent}%
                </span>
              </div>
              <div className="my-1.5 sm:my-2">
                <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 group-hover:text-emerald-800 dark:group-hover:text-emerald-300">{terisiKamar}<span className="text-xs font-semibold text-slate-400 dark:text-slate-500">/{totalKamar}</span></div>
                <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 mt-1 sm:mt-1.5 overflow-hidden">
                  <div className="bg-emerald-600 dark:bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${occupancyPercent}%` }}></div>
                </div>
              </div>
              <span className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center justify-between">
                <span className="truncate">{kosongKamar} Siap Huni</span>
                <i className="fa-solid fa-arrow-right text-[8px] sm:text-[9px] text-slate-400 dark:text-slate-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition ml-1 shrink-0"></i>
              </span>
            </div>

            {/* Tamu / Jemaah Menginap */}
            <div 
              onClick={() => setActiveCatalogTab('ROOMS_GRID')}
              className="bg-white dark:bg-slate-800 p-2.5 sm:p-3.5 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 flex flex-col justify-between hover:border-emerald-400 dark:hover:border-emerald-500 hover:shadow-sm transition cursor-pointer group"
              title="Daftar tamu dan jemaah yang sedang menginap"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Tamu Inap</span>
                <i className="fa-solid fa-users text-emerald-600 dark:text-emerald-400 text-xs"></i>
              </div>
              <div className="my-1.5 sm:my-2">
                <div className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-400">{activeTransactions.length} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">Kamar</span></div>
                <p className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{jemaahCount} Haji • {umumCount} Umum</p>
              </div>
              <span className="text-[9px] sm:text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center justify-between">
                <span className="flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Hunian Aktif</span>
                </span>
                <i className="fa-solid fa-arrow-right text-[8px] sm:text-[9px] text-slate-400 dark:text-slate-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition ml-1 shrink-0"></i>
              </span>
            </div>

            {/* Reservasi Terjadwal */}
            <div 
              onClick={() => setActiveCatalogTab('ROOMS_GRID')}
              className="bg-white dark:bg-slate-800 p-2.5 sm:p-3.5 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 flex flex-col justify-between hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-sm transition cursor-pointer group"
              title="Kalender Reservasi & Hunian"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-[11px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">Reservasi</span>
                <i className="fa-solid fa-calendar-check text-blue-600 dark:text-blue-400 text-xs"></i>
              </div>
              <div className="my-1.5 sm:my-2">
                <div className="text-xl sm:text-2xl font-black text-blue-700 dark:text-blue-400">{bookedKamar}</div>
                <p className="text-[9px] sm:text-[10px] text-blue-600 dark:text-blue-400 mt-0.5 truncate">{checkinTodayList.length} Check-in Hari Ini</p>
              </div>
              <span className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>Booking Datang</span>
                <i className="fa-solid fa-calendar text-[8px] sm:text-[9px] text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition ml-1 shrink-0"></i>
              </span>
            </div>

            {/* Ruang Pertemuan (Aula) */}
            <div 
              onClick={() => {
                setActiveCatalogTab('BUILDINGS_CATALOG');
                setBldgCategoryFilter('RUANG_PERTEMUAN');
              }}
              className="bg-white dark:bg-slate-800 p-2.5 sm:p-3.5 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 flex flex-col justify-between hover:border-purple-400 dark:hover:border-purple-500 hover:shadow-sm transition cursor-pointer group"
              title="Katalog Fasilitas Pertemuan & Aula"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-[11px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">R. Pertemuan</span>
                <i className="fa-solid fa-landmark text-purple-600 dark:text-purple-400 text-xs"></i>
              </div>
              <div className="my-1.5 sm:my-2">
                <div className="text-xl sm:text-2xl font-black text-purple-700 dark:text-purple-400">{totalAula}</div>
                <p className="text-[9px] sm:text-[10px] text-purple-600 dark:text-purple-400 mt-0.5 truncate">{aulaTerisi} Sesi Sewa</p>
              </div>
              <span className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span className="truncate">Gedung SG &amp; Aula</span>
                <i className="fa-solid fa-arrow-right text-[8px] sm:text-[9px] text-slate-400 dark:text-slate-500 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition ml-1 shrink-0"></i>
              </span>
            </div>

            {/* Maintenance / Perbaikan */}
            <div 
              onClick={() => setActiveCatalogTab('ROOMS_GRID')}
              className="bg-white dark:bg-slate-800 p-2.5 sm:p-3.5 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 flex flex-col justify-between hover:border-amber-400 dark:hover:border-amber-500 hover:shadow-sm transition cursor-pointer group"
              title="Tiket kendala teknis & sarana prasarana"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Maintenance</span>
                <i className="fa-solid fa-screwdriver-wrench text-amber-600 dark:text-amber-400 text-xs"></i>
              </div>
              <div className="my-1.5 sm:my-2">
                <div className="text-xl sm:text-2xl font-black text-amber-700 dark:text-amber-400">{maintKamar}</div>
                <p className="text-[9px] sm:text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 truncate">{urgentMaintenances.length} Tiket Urgen</p>
              </div>
              <span className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>{activeMaintenances.length} Kasus</span>
                <i className="fa-solid fa-arrow-right text-[8px] sm:text-[9px] text-slate-400 dark:text-slate-500 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition ml-1 shrink-0"></i>
              </span>
            </div>

            {/* Standar Mutu QC */}
            <div 
              onClick={() => setActiveCatalogTab('ROOMS_GRID')}
              className="bg-white dark:bg-slate-800 p-2.5 sm:p-3.5 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 flex flex-col justify-between hover:border-teal-400 dark:hover:border-teal-500 hover:shadow-sm transition cursor-pointer group"
              title="Modul verifikasi Kendali Mutu (QC)"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-[11px] font-bold text-teal-700 dark:text-teal-400 uppercase tracking-wider">Mutu QC</span>
                <i className="fa-solid fa-clipboard-check text-teal-600 dark:text-teal-400 text-xs"></i>
              </div>
              <div className="my-1.5 sm:my-2">
                <div className="text-xl sm:text-2xl font-black text-teal-700 dark:text-teal-400">{readyQcRooms}</div>
                <p className="text-[9px] sm:text-[10px] text-teal-600 dark:text-teal-400 mt-0.5 truncate">{waitingQcRooms} Butuh Cek QC</p>
              </div>
              <span className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>Lolos Mutu Standar</span>
                <i className="fa-solid fa-arrow-right text-[8px] sm:text-[9px] text-slate-400 dark:text-slate-500 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition ml-1 shrink-0"></i>
              </span>
            </div>
          </div>
        );
      })()}

      {/* Top Header & Sub-Navigation Tabs */}
      <div className="bg-white p-2 sm:p-2.5 rounded-2xl shadow-xs border border-slate-200">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveCatalogTab('ROOMS_GRID')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center justify-between space-x-2 ${
              activeCatalogTab === 'ROOMS_GRID'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <div className="flex items-center space-x-2 truncate">
              <i className="fa-solid fa-bed text-emerald-600 shrink-0"></i>
              <span className="truncate">Denah Penyewaan</span>
            </div>
            <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full font-bold shrink-0">
              {rooms.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCatalogTab('BUILDINGS_CATALOG')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center justify-between space-x-2 ${
              activeCatalogTab === 'BUILDINGS_CATALOG'
                ? 'bg-white text-blue-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <div className="flex items-center space-x-2 truncate">
              <i className="fa-solid fa-building-circle-check text-blue-600 shrink-0"></i>
              <span className="truncate">Katalog Gedung &amp; Fasilitas</span>
            </div>
            <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full font-bold shrink-0">
              {buildings.filter(b => !b.category || b.category === 'PENGINAPAN').length + meetingRooms.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCatalogTab('ROOM_CAPACITY_RATES')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center justify-between space-x-2 ${
              activeCatalogTab === 'ROOM_CAPACITY_RATES'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <div className="flex items-center space-x-2 truncate">
              <i className="fa-solid fa-tags text-emerald-600 shrink-0"></i>
              <span className="truncate">Katalog Tipe Kamar</span>
            </div>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold border border-emerald-300 shrink-0">
              {catalogRoomTypes.length} Tipe Kamar
            </span>
          </button>
        </div>
      </div>

      {/* VIEW 1: DENAH & KAMAR HUNIAN */}
      {activeCatalogTab === 'ROOMS_GRID' && (
        <div className="space-y-4">
          {/* Filter & Display Controls Bar - Neatly structured and modern */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-slate-200 space-y-4">
            {/* Top Row: Title, Summary Count, Search Bar & Tombol Input Kamar Di Sampingnya */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-base shrink-0 shadow-2xs border border-emerald-200">
                  <i className="fa-solid fa-hotel"></i>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-black text-slate-800 tracking-tight">
                      Denah Kamar &amp; Ruang Pertemuan
                    </h3>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold border border-slate-200">
                      {filteredRooms.length} dari {rooms.length} Kamar
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Kelola status hunian kamar, ketersediaan aula, dan pemeliharaan fasilitas per gedung.
                  </p>
                </div>
              </div>

              {/* Right Side: Search Box & Tombol Input Kamar Berdampingan */}
              <div className="flex items-center gap-2 w-full lg:w-auto shrink-0">
                <div className="relative flex-1 sm:w-72">
                  <input 
                    type="text" 
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Cari No Kamar / Nama Aula..." 
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 pl-8 pr-7 focus:ring-2 focus:ring-emerald-600 focus:bg-white outline-none font-medium text-slate-900 transition" 
                  />
                  <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-3 text-slate-400 text-xs"></i>
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs cursor-pointer p-0.5"
                      title="Hapus pencarian"
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  )}
                </div>

                {/* Tombol Input Kamar Baru di Samping Kolom Pencarian */}
                <button
                  type="button"
                  onClick={() => {
                    setRoomToEdit(null);
                    setSelectedBuildingForNewRoom(bFilter !== 'ALL' && bFilter !== 'Ruang Pertemuan' ? bFilter : undefined);
                    setIsRoomModalOpen(true);
                  }}
                  className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 active:scale-98 text-white font-bold rounded-xl text-xs shadow-xs transition flex items-center space-x-1.5 cursor-pointer shrink-0 border border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  title="Input data kamar baru ke master gedung"
                >
                  <i className="fa-solid fa-plus text-gold-300"></i>
                  <span>Input Kamar</span>
                </button>
              </div>
            </div>

            {/* Middle Row: Quick Status Filters (1-Click Pill Buttons) */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 hidden sm:inline">Status:</span>
                <button
                  type="button"
                  onClick={() => setSFilter('ALL')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5 border ${
                    sFilter === 'ALL'
                      ? 'bg-slate-800 text-white border-slate-800 shadow-2xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <span>Semua</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-current">{rooms.length}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSFilter('KOSONG')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5 border ${
                    sFilter === 'KOSONG'
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                      : 'bg-emerald-50/60 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Kosong</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/30 text-current">
                    {rooms.filter(r => r.status === 'KOSONG').length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSFilter('TERISI')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5 border ${
                    sFilter === 'TERISI'
                      ? 'bg-rose-700 text-white border-rose-700 shadow-2xs'
                      : 'bg-rose-50/60 hover:bg-rose-100 text-rose-800 border-rose-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  <span>Terisi</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/30 text-current">
                    {rooms.filter(r => r.status === 'TERISI').length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSFilter('BOOKED')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5 border ${
                    sFilter === 'BOOKED'
                      ? 'bg-blue-700 text-white border-blue-700 shadow-2xs'
                      : 'bg-blue-50/60 hover:bg-blue-100 text-blue-800 border-blue-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span>Booked</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/30 text-current">
                    {rooms.filter(r => r.status === 'BOOKED').length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSFilter('MAINTENANCE')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5 border ${
                    sFilter === 'MAINTENANCE'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                      : 'bg-amber-50/60 hover:bg-amber-100 text-amber-800 border-amber-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span>Maintenance</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/30 text-current">
                    {rooms.filter(r => r.status === 'MAINTENANCE').length}
                  </span>
                </button>
              </div>

              {/* Toggle Ringkas / Buka Semua */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => handleGlobalDisplayChange('COLLAPSE')}
                  className={`px-2.5 py-1 rounded font-bold transition cursor-pointer text-[11px] ${
                    globalDisplay === 'COLLAPSE'
                      ? 'bg-white text-slate-800 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <i className="fa-solid fa-compress mr-1"></i> Ringkas
                </button>
                <button
                  type="button"
                  onClick={() => handleGlobalDisplayChange('EXPAND')}
                  className={`px-2.5 py-1 rounded font-bold transition cursor-pointer text-[11px] ${
                    globalDisplay === 'EXPAND'
                      ? 'bg-white text-emerald-800 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <i className="fa-solid fa-expand mr-1"></i> Buka Semua
                </button>
              </div>
            </div>

            {/* Bottom Row: Detailed Dropdown Filter Bar in a Clean Light Box */}
            <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/80">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {/* Filter 1: Gedung */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <i className="fa-solid fa-building text-slate-400"></i>
                    <span>Pilih Gedung:</span>
                  </label>
                  <select 
                    value={bFilter} 
                    onChange={e => setBFilter(e.target.value)} 
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-emerald-600 outline-none font-medium text-slate-800 cursor-pointer shadow-2xs"
                  >
                    <option key="all" value="ALL">Semua Fasilitas Gedung</option>
                    {buildings.filter(b => 
                      b.name !== 'Ruang Pertemuan' && 
                      b.name !== 'Ruang Pertemuan / Aula' && 
                      b.name !== 'Gedung Serbaguna (SG)' && 
                      b.name !== 'Gedung Serbaguna' &&
                      b.category !== 'SERBAGUNA' &&
                      b.category !== 'RUANG_PERTEMUAN'
                    ).slice().sort((a, b) => compareBuildingOrder(a.name, b.name)).map(b => (
                      <option key={b.id} value={b.name}>{b.name}</option>
                    ))}
                    <option key="gedung-serbaguna" value="Gedung Serbaguna (SG)">🏢 Gedung Serbaguna (SG)</option>
                    <option key="ruang-pertemuan" value="Ruang Pertemuan / Aula">🏛️ Ruang Pertemuan / Aula</option>
                  </select>
                </div>

                {/* Filter 2: Tipe Kamar */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <i className="fa-solid fa-tags text-slate-400"></i>
                    <span>Tipe Kamar:</span>
                  </label>
                  <select 
                    value={roomTypeFilter} 
                    onChange={e => setRoomTypeFilter(e.target.value)} 
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-emerald-600 outline-none font-medium text-slate-800 cursor-pointer shadow-2xs"
                  >
                    <option value="ALL">Semua Tipe Kamar</option>
                    <option value="Ekonomi">🟢 Ekonomi</option>
                    <option value="Standar">🔵 Standar (Reguler)</option>
                    <option value="Superior">🟣 Superior (VIP)</option>
                    {catalogRoomTypes.filter(t => !['Ekonomi', 'Standar', 'Superior'].includes(t)).map(t => (
                      <option key={t} value={t}>🏷️ {t}</option>
                    ))}
                    <option value="Ruang Pertemuan / Aula">🏛️ Ruang Pertemuan</option>
                  </select>
                </div>

                {/* Filter 3: Kapasitas Bed */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <i className="fa-solid fa-bed text-slate-400"></i>
                    <span>Kapasitas Bed:</span>
                  </label>
                  <select 
                    value={bedTypeFilter} 
                    onChange={e => setBedTypeFilter(e.target.value)} 
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-emerald-600 outline-none font-medium text-slate-800 cursor-pointer shadow-2xs"
                  >
                    <option value="ALL">Semua Kapasitas Bed</option>
                    <option value="Double Bed">Double Bed (2 Orang)</option>
                    <option value="2 Single Bed">2 Single Bed</option>
                    <option value="3 Single Bed">3 Single Bed</option>
                    <option value="4 Single Bed">4 Single Bed</option>
                    <option value="5 Single Bed">5 Single Bed</option>
                    <option value="6 Single Bed">6 Single Bed</option>
                    <option value="7 Single Bed">7 Single Bed</option>
                    <option value="8 Single Bed">8 Single Bed</option>
                  </select>
                </div>

                {/* Filter 4: Status Keterisian */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <i className="fa-solid fa-circle-dot text-slate-400"></i>
                    <span>Status Keterisian:</span>
                  </label>
                  <select 
                    value={sFilter} 
                    onChange={e => setSFilter(e.target.value)} 
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-emerald-600 outline-none font-medium text-slate-800 cursor-pointer shadow-2xs"
                  >
                    <option key="all" value="ALL">Semua Status</option>
                    <option key="kosong" value="KOSONG">🟢 Kosong (Tersedia)</option>
                    <option key="terisi" value="TERISI">🔴 Terisi (Check-In)</option>
                    <option key="booked" value="BOOKED">🔵 Booked (Reservasi)</option>
                    <option key="maint" value="MAINTENANCE">🟠 Maintenance</option>
                  </select>
                </div>
              </div>

              {/* Active Filters Reset Bar if any filter is applied */}
              {(bFilter !== 'ALL' || roomTypeFilter !== 'ALL' || bedTypeFilter !== 'ALL' || sFilter !== 'ALL' || search) && (
                <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-slate-200 text-xs text-slate-600">
                  <span className="flex items-center gap-1.5 font-medium">
                    <i className="fa-solid fa-filter text-emerald-600"></i>
                    <span>Filter aktif: menampilkan <strong>{filteredRooms.length}</strong> kamar</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setBFilter('ALL');
                      setRoomTypeFilter('ALL');
                      setBedTypeFilter('ALL');
                      setSFilter('ALL');
                      setSearch('');
                    }}
                    className="text-emerald-700 hover:text-emerald-900 font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <i className="fa-solid fa-rotate-left text-[11px]"></i>
                    <span>Reset Semua Filter</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {buildingNames.length === 0 ? (
              <div className="bg-white p-12 text-center rounded-xl border border-slate-200 text-slate-400">
                <i className="fa-solid fa-building-circle-xmark text-4xl mb-2"></i>
                <p className="text-xs font-semibold">Tidak ada kamar atau gedung yang sesuai dengan filter pencarian.</p>
              </div>
            ) : (
              buildingNames.map(bName => {
                const bRooms = grouped[bName];
                const isCollapsed = isBuildingCollapsed(bName);
                const bObj = buildings.find(b => b.name.toLowerCase() === bName.toLowerCase());
                const isSGBuilding = bName === 'Gedung Serbaguna (SG)' || bName === 'Gedung Serbaguna' || bObj?.category === 'SERBAGUNA';
                const isAulaBuilding = bName === 'Ruang Pertemuan' || bName === 'Ruang Pertemuan / Aula' || bObj?.category === 'RUANG_PERTEMUAN';
                const isBldSerbaguna = isSGBuilding || isAulaBuilding;
                const bCapacity = (isSGBuilding || isAulaBuilding)
                  ? bRooms.length
                  : (bObj?.totalRooms !== undefined && bObj.totalRooms !== null 
                    ? bObj.totalRooms 
                    : bRooms.length);
                const bDescription = (bObj?.description && bObj.description.trim())
                  || (bObj?.capacityDesc && bObj.capacityDesc.trim())
                  || (isSGBuilding ? 'Fasilitas Konvensi Akbar & Acara Serbaguna UPT Asrama Haji Jakarta' : isAulaBuilding ? 'Fasilitas Ruang Rapat, Auditorium & Aula Pertemuan Resmi UPT Asrama Haji Jakarta' : OFFICIAL_TARIFFS[bName]?.desc)
                  || 'Fasilitas Standar UPT';

                return (
                  <div key={bName} id={`building-section-${bName.replace(/[^a-zA-Z0-9]/g, '-')}`} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm space-y-3 transition">
                    {/* Building Header / Accordion Dropdown */}
                    <div 
                      onClick={() => toggleBuilding(bName)}
                      className="bg-slate-100 px-5 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer hover:bg-slate-200/75 transition select-none"
                      title="Klik untuk menyembunyikan / menampilkan kamar atau ruangan"
                    >
                      <div className="flex items-center space-x-3">
                        {(() => {
                          const bCategory = isSGBuilding ? 'SERBAGUNA' : isAulaBuilding ? 'RUANG_PERTEMUAN' : bObj?.category;
                          const bIcon = getBuildingIcon(bName, bCategory);
                          const bColors = getBuildingColorClass(bName, bCategory);
                          return (
                            <div className={`w-9 h-9 rounded-xl ${bColors.bg} border ${bColors.border} shadow-xs flex items-center justify-center font-bold text-sm shrink-0`}>
                              <i className={`fa-solid ${bIcon}`}></i>
                            </div>
                          );
                        })()}
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="font-bold text-sm text-slate-900">
                              {isSGBuilding 
                                ? 'Gedung Serbaguna (SG) - Fasilitas Serbaguna & Konvensi' 
                                : isAulaBuilding
                                ? 'Ruang Pertemuan / Aula - Fasilitas Rapat & Pertemuan Resmi'
                                : bName}
                            </h3>
                            {isCollapsed && (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] rounded font-semibold border border-amber-200">
                                {isBldSerbaguna ? 'Ruang Disembunyikan' : 'Kamar Disembunyikan'}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {bCapacity} {isBldSerbaguna ? 'Ruang Pertemuan / Aula' : 'Kamar Hunian'} | {bDescription}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2 text-xs flex-wrap gap-y-1">
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded font-semibold">{bRooms.filter(r => r.status === 'KOSONG').length} Tersedia</span>
                          <span className="px-2 py-1 bg-emerald-600 text-white rounded font-semibold">{bRooms.filter(r => r.status === 'TERISI').length} Terisi</span>
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded font-semibold">{bRooms.filter(r => r.status === 'BOOKED').length} Booked</span>
                          <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded font-semibold">{bRooms.filter(r => r.status === 'MAINTENANCE').length} Maint</span>
                          <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded font-semibold" title="Kamar/Aula yang memerlukan inspeksi QC">
                            {bRooms.filter(r => !r.qcStatus || r.qcStatus === 'PERLU_INSPEKSI' || r.qcStatus === 'MENUNGGU_QC').length} Perlu QC
                          </span>
                        </div>

                        <button
                          type="button"
                          className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-300/60 transition"
                          aria-label={isCollapsed ? 'Tampilkan Kamar' : 'Sembunyikan Kamar'}
                        >
                          <i className={`fa-solid fa-chevron-${isCollapsed ? 'down' : 'up'}`}></i>
                        </button>
                      </div>
                    </div>

                    {/* Rooms Grid */}
                    {!isCollapsed && (
                      bRooms.length === 0 ? (
                        <div className="p-8 text-center bg-slate-50/70 border-t border-slate-100 rounded-b-xl space-y-2">
                          <i className="fa-solid fa-bed text-3xl text-slate-300"></i>
                          <p className="text-xs font-bold text-slate-700">Belum ada unit kamar terdaftar di {bName}.</p>
                          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                            Gedung ini baru didaftarkan atau belum memiliki kamar. Anda dapat menambahkan kamar baru secara manual.
                          </p>
                          {canManageRooms && (
                            <div className="pt-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setRoomToEdit(null);
                                  setSelectedBuildingForNewRoom(bName);
                                  setIsRoomModalOpen(true);
                                }}
                                className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition inline-flex items-center space-x-1.5 cursor-pointer"
                              >
                                <i className="fa-solid fa-plus"></i>
                                <span>+ Tambah {isBldSerbaguna ? (isSGBuilding ? 'Fasilitas Gedung Serbaguna' : 'Ruang Pertemuan / Aula') : `Kamar ke ${bName}`}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className={`p-2.5 sm:p-4 grid gap-2.5 sm:gap-3 ${
                          bName === 'Ruang Pertemuan' || bName === 'Gedung Serbaguna (SG)' || bName === 'Gedung Serbaguna' || isSGBuilding || isAulaBuilding
                            ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4'
                            : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5'
                        }`}>
                          {bRooms.map(r => getRoomCard(r))}
                        </div>
                      )
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: KATALOG GEDUNG & FASILITAS (PENGINAPAN, SERBAGUNA & RUANG PERTEMUAN / AULA) */}
      {activeCatalogTab === 'BUILDINGS_CATALOG' && (() => {
        const penginapanBuildings = buildings.filter(b => !b.category || b.category === 'PENGINAPAN');
        const serbagunaMRs = meetingRooms.filter(isMeetingRoomSG);
        const aulaMRs = meetingRooms.filter(m => !isMeetingRoomSG(m));

        type UnifiedCatalogItem = {
          id: string;
          sourceType: 'BUILDING' | 'MEETING_ROOM';
          originalItem: Building | MeetingRoom;
          code: string;
          name: string;
          category: 'PENGINAPAN' | 'SERBAGUNA' | 'RUANG_PERTEMUAN';
          floors: number;
          unitCountText: string;
          capacityDesc: string;
          status: string;
          dailyRate?: number;
          sessionRate?: number;
          facilities?: string[];
          buildingLocation?: string;
        };

        // Format items Serbaguna (SG) disinkronkan dengan master data fasilitas pertemuan
        const serbagunaItems: UnifiedCatalogItem[] = [
          ...serbagunaMRs.map(mr => ({
            id: mr.id,
            sourceType: 'MEETING_ROOM' as const,
            originalItem: mr,
            code: mr.code || 'SG',
            name: mr.name,
            category: 'SERBAGUNA' as const,
            floors: 1,
            unitCountText: '1 Gedung / Hall',
            capacityDesc: `${mr.capacity} • Harian: ${formatRupiah(mr.dailyRate)}/12 Jam • Sesi: ${formatRupiah(mr.sessionRate || 8500000)}/8 Jam`,
            status: mr.status === 'TERSEDIA' ? 'AKTIF' : (mr.status === 'MAINTENANCE' ? 'NONAKTIF' : mr.status),
            dailyRate: mr.dailyRate,
            sessionRate: mr.sessionRate,
            facilities: mr.facilities,
            buildingLocation: mr.building
          })),
          ...buildings.filter(b => 
            b.category === 'SERBAGUNA' && 
            b.name !== 'Gedung Serbaguna' && 
            b.name !== 'Gedung Serbaguna (SG)' && 
            !serbagunaMRs.some(mr => mr.name.toLowerCase() === b.name.toLowerCase() || mr.id === b.id || mr.id === `mr-${b.id}`)
          ).map(b => ({
            id: b.id,
            sourceType: 'BUILDING' as const,
            originalItem: b,
            code: b.code,
            name: b.name,
            category: 'SERBAGUNA' as const,
            floors: b.floors || 1,
            unitCountText: `${b.totalRooms || 1} Aula / Unit`,
            capacityDesc: b.capacityDesc || b.description || 'Gedung Serbaguna (SG)',
            status: b.status,
            facilities: b.facilities,
            buildingLocation: b.location
          }))
        ];

        // Format items Ruang Pertemuan / Aula disinkronkan dengan master data fasilitas pertemuan
        const aulaItems: UnifiedCatalogItem[] = [
          ...aulaMRs.map(mr => ({
            id: mr.id,
            sourceType: 'MEETING_ROOM' as const,
            originalItem: mr,
            code: mr.code || 'AULA',
            name: mr.name,
            category: 'RUANG_PERTEMUAN' as const,
            floors: 1,
            unitCountText: '1 Ruang Pertemuan',
            capacityDesc: `${mr.capacity} • Harian: ${formatRupiah(mr.dailyRate)}/12 Jam • Sesi: ${formatRupiah(mr.sessionRate || 8500000)}/8 Jam`,
            status: mr.status === 'TERSEDIA' ? 'AKTIF' : (mr.status === 'MAINTENANCE' ? 'NONAKTIF' : mr.status),
            dailyRate: mr.dailyRate,
            sessionRate: mr.sessionRate,
            facilities: mr.facilities,
            buildingLocation: mr.building
          })),
          ...buildings.filter(b => 
            b.category === 'RUANG_PERTEMUAN' && 
            b.name !== 'Ruang Pertemuan' && 
            b.name !== 'Ruang Pertemuan / Aula' && 
            !aulaMRs.some(mr => mr.name.toLowerCase() === b.name.toLowerCase() || mr.id === b.id || mr.id === `mr-${b.id}`)
          ).map(b => ({
            id: b.id,
            sourceType: 'BUILDING' as const,
            originalItem: b,
            code: b.code,
            name: b.name,
            category: 'RUANG_PERTEMUAN' as const,
            floors: b.floors || 1,
            unitCountText: `${b.totalRooms || 1} Ruang / Unit`,
            capacityDesc: b.capacityDesc || b.description || 'Ruang Pertemuan / Aula',
            status: b.status,
            facilities: b.facilities,
            buildingLocation: b.location
          }))
        ];

        // Format items Penginapan
        const penginapanItems: UnifiedCatalogItem[] = penginapanBuildings.map(b => ({
          id: b.id,
          sourceType: 'BUILDING' as const,
          originalItem: b,
          code: b.code,
          name: b.name,
          category: 'PENGINAPAN' as const,
          floors: b.floors || 1,
          unitCountText: `${b.totalRooms || 50} Kamar`,
          capacityDesc: b.capacityDesc || b.description || '-',
          status: b.status,
          facilities: b.facilities,
          buildingLocation: b.location
        }));

        let displayedItems: UnifiedCatalogItem[] = [];

        if (bldgCategoryFilter === 'ALL') {
          displayedItems = [...penginapanItems, ...serbagunaItems, ...aulaItems];
        } else if (bldgCategoryFilter === 'PENGINAPAN') {
          displayedItems = penginapanItems;
        } else if (bldgCategoryFilter === 'SERBAGUNA') {
          displayedItems = serbagunaItems;
        } else if (bldgCategoryFilter === 'RUANG_PERTEMUAN') {
          displayedItems = aulaItems;
        }

        return (
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4 animate-in fade-in duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-4">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                  <i className="fa-solid fa-building-circle-check text-blue-600 dark:text-blue-400"></i>
                  <span>Katalog Gedung &amp; Fasilitas</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Pusat kelola master data gedung penginapan, gedung serbaguna (SG), dan ruang pertemuan / aula resmi di UPT Asrama Haji Jakarta.
                </p>
              </div>

              {canManageMaster && (
                <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                  {bldgCategoryFilter === 'SERBAGUNA' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMeetingRoomToEdit(null);
                        setDefaultCategoryForNewMeetingRoom('SERBAGUNA');
                        setIsMeetingRoomModalOpen(true);
                      }}
                      className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-2 cursor-pointer"
                    >
                      <i className="fa-solid fa-plus"></i>
                      <span>Tambah Gedung Serbaguna (SG)</span>
                    </button>
                  ) : bldgCategoryFilter === 'RUANG_PERTEMUAN' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMeetingRoomToEdit(null);
                        setDefaultCategoryForNewMeetingRoom('AULA');
                        setIsMeetingRoomModalOpen(true);
                      }}
                      className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-2 cursor-pointer"
                    >
                      <i className="fa-solid fa-plus"></i>
                      <span>Tambah Ruang Pertemuan / Aula</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setBuildingToEdit(null);
                          setIsBuildingModalOpen(true);
                        }}
                        className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-2 cursor-pointer"
                      >
                        <i className="fa-solid fa-plus"></i>
                        <span>Tambah Gedung Baru</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMeetingRoomToEdit(null);
                          setDefaultCategoryForNewMeetingRoom(undefined);
                          setIsMeetingRoomModalOpen(true);
                        }}
                        className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-2 cursor-pointer"
                      >
                        <i className="fa-solid fa-landmark"></i>
                        <span>Tambah Fasilitas Pertemuan</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Sub-Kategori Filter Tabs & View Mode Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-900/60 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => setBldgCategoryFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    bldgCategoryFilter === 'ALL'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <span>Semua Kategori</span>
                  <span className="px-1.5 py-0.2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-full text-[10px] font-black">
                    {penginapanItems.length + serbagunaItems.length + aulaItems.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setBldgCategoryFilter('PENGINAPAN')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    bldgCategoryFilter === 'PENGINAPAN'
                      ? 'bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 shadow-2xs ring-1 ring-emerald-300 dark:ring-emerald-700'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <i className="fa-solid fa-hotel text-emerald-600"></i>
                  <span>Penginapan</span>
                  <span className="px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-full text-[10px] font-black">
                    {penginapanItems.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setBldgCategoryFilter('SERBAGUNA')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    bldgCategoryFilter === 'SERBAGUNA'
                      ? 'bg-white dark:bg-slate-800 text-amber-800 dark:text-amber-300 shadow-2xs ring-1 ring-amber-300 dark:ring-amber-700'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <i className="fa-solid fa-building-columns text-amber-600"></i>
                  <span>Gedung Serbaguna (SG)</span>
                  <span className="px-1.5 py-0.2 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 rounded-full text-[10px] font-black">
                    {serbagunaItems.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setBldgCategoryFilter('RUANG_PERTEMUAN')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    bldgCategoryFilter === 'RUANG_PERTEMUAN'
                      ? 'bg-white dark:bg-slate-800 text-purple-800 dark:text-purple-300 shadow-2xs ring-1 ring-purple-300 dark:ring-purple-700'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <i className="fa-solid fa-landmark text-purple-600"></i>
                  <span>Ruang Pertemuan / Aula</span>
                  <span className="px-1.5 py-0.2 bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 rounded-full text-[10px] font-black">
                    {aulaItems.length}
                  </span>
                </button>
              </div>

              {/* View Mode Toggle: Tabel vs Kartu */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/60 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setBldgViewMode('TABLE')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    bldgViewMode === 'TABLE'
                      ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 shadow-2xs ring-1 ring-blue-200 dark:ring-blue-700'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="Tampilan Tabel"
                >
                  <i className="fa-solid fa-table-list"></i>
                  <span>Tabel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBldgViewMode('CARDS')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    bldgViewMode === 'CARDS'
                      ? 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300 shadow-2xs ring-1 ring-purple-200 dark:ring-purple-700'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="Tampilan Kartu / Grid"
                >
                  <i className="fa-solid fa-grip"></i>
                  <span>Kartu Detail</span>
                </button>
              </div>
            </div>

            {/* KONTEN: TAMPILAN TABEL */}
            {bldgViewMode === 'TABLE' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                  <thead className="bg-slate-100 dark:bg-slate-900 uppercase text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-3">Kode</th>
                      <th className="p-3">Nama Gedung / Fasilitas</th>
                      <th className="p-3">Kategori Fasilitas</th>
                      <th className="p-3">Lantai</th>
                      <th className="p-3">Estimasi Kamar / Unit</th>
                      <th className="p-3">Kapasitas &amp; Spesifikasi</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {displayedItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400 italic">
                          Tidak ada gedung atau fasilitas dalam kategori ini. Klik tombol di atas untuk menambah fasilitas baru.
                        </td>
                      </tr>
                    ) : (
                      displayedItems.map(item => {
                        const isSG = item.category === 'SERBAGUNA';
                        const isAulaCat = item.category === 'RUANG_PERTEMUAN';
                        const bIcon = isSG 
                          ? 'fa-building-columns text-amber-600' 
                          : isAulaCat 
                            ? 'fa-landmark text-purple-600' 
                            : `${getBuildingIcon(item.name, item.code)} text-emerald-600`;

                        return (
                          <tr key={`${item.sourceType}-${item.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition">
                            <td className="p-3 font-mono font-bold text-blue-700 dark:text-blue-400">{item.code}</td>
                            <td className="p-3 font-bold text-slate-900 dark:text-slate-100">
                              <div className="flex items-center space-x-2">
                                <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-600">
                                  <i className={`fa-solid ${bIcon} text-xs`}></i>
                                </div>
                                <span className="truncate">{item.name}</span>
                              </div>
                            </td>
                            <td className="p-3">
                              {isSG ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 inline-flex items-center gap-1">
                                  <i className="fa-solid fa-building-columns text-[9px] text-amber-700 dark:text-amber-300"></i>
                                  <span>Serbaguna (SG)</span>
                                </span>
                              ) : isAulaCat ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-900 dark:text-purple-200 border border-purple-300 dark:border-purple-700 inline-flex items-center gap-1">
                                  <i className="fa-solid fa-landmark text-[9px] text-purple-700 dark:text-purple-300"></i>
                                  <span>Ruang Pertemuan / Aula</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 inline-flex items-center gap-1">
                                  <i className={`fa-solid ${getBuildingIcon(item.name, item.code)} text-[9px] text-emerald-700 dark:text-emerald-300`}></i>
                                  <span>Penginapan</span>
                                </span>
                              )}
                            </td>
                            <td className="p-3 font-semibold text-slate-700 dark:text-slate-300">{item.floors || 1} Lantai</td>
                            <td className="p-3 font-bold text-emerald-700 dark:text-emerald-400">
                              {item.unitCountText}
                            </td>
                            <td className="p-3 text-slate-600 dark:text-slate-300 max-w-xs truncate">{item.capacityDesc || '-'}</td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                item.status === 'AKTIF' || item.status === 'TERSEDIA' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                              }`}>
                                {item.status === 'TERSEDIA' ? 'AKTIF' : item.status}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end space-x-1.5">
                                {canManageMaster ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (item.sourceType === 'MEETING_ROOM') {
                                          setMeetingRoomToEdit(item.originalItem as MeetingRoom);
                                          setIsMeetingRoomModalOpen(true);
                                        } else {
                                          setBuildingToEdit(item.originalItem as Building);
                                          setIsBuildingModalOpen(true);
                                        }
                                      }}
                                      className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition cursor-pointer"
                                      title="Edit Data"
                                    >
                                      <i className="fa-solid fa-pen-to-square"></i>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (item.sourceType === 'MEETING_ROOM') {
                                          setDeleteConfirmState({
                                            isOpen: true,
                                            title: 'Hapus Fasilitas Pertemuan',
                                            itemName: item.name,
                                            itemType: isSG ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan / Aula',
                                            onConfirm: () => {
                                              deleteMeetingRoom(item.id);
                                            }
                                          });
                                        } else {
                                          setDeleteConfirmState({
                                            isOpen: true,
                                            title: 'Hapus Gedung',
                                            itemName: item.name,
                                            itemType: 'Gedung',
                                            onConfirm: () => {
                                              deleteBuilding(item.id);
                                            }
                                          });
                                        }
                                      }}
                                      className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition cursor-pointer"
                                      title="Hapus Data"
                                    >
                                      <i className="fa-solid fa-trash-can"></i>
                                    </button>
                                  </>
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic">Hanya Lihat</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              /* KONTEN: TAMPILAN KARTU DETAIL (GRID) */
              displayedItems.length === 0 ? (
                <div className="p-8 text-center text-slate-400 italic bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                  Tidak ada gedung atau fasilitas dalam kategori ini. Klik tombol di atas untuk menambah fasilitas baru.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayedItems.map(item => {
                    const isSG = item.category === 'SERBAGUNA';
                    const isAulaCat = item.category === 'RUANG_PERTEMUAN';
                    const iconCard = isSG ? 'fa-building-columns' : isAulaCat ? 'fa-landmark' : getBuildingIcon(item.name, item.code);
                    const iconColorClass = isSG 
                      ? 'text-amber-700 bg-amber-100 border-amber-200' 
                      : isAulaCat 
                        ? 'text-purple-800 bg-purple-100 border-purple-200' 
                        : 'text-emerald-800 bg-emerald-100 border-emerald-200';
                    const badgeClass = isSG 
                      ? 'bg-amber-100 text-amber-900 border-amber-300' 
                      : isAulaCat 
                        ? 'bg-purple-100 text-purple-900 border-purple-200' 
                        : 'bg-emerald-100 text-emerald-900 border-emerald-200';
                    const cardBorderHover = isSG 
                      ? 'hover:border-amber-400' 
                      : isAulaCat 
                        ? 'hover:border-purple-300' 
                        : 'hover:border-emerald-300';

                    return (
                      <div key={`${item.sourceType}-${item.id}`} className={`p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ${cardBorderHover} shadow-xs transition space-y-3 flex flex-col justify-between`}>
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center space-x-2.5">
                              <div className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold text-sm shrink-0 ${iconColorClass}`}>
                                <i className={`fa-solid ${iconCard}`}></i>
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100 leading-snug">{item.name}</h4>
                                </div>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                                  {item.code} • {isSG ? 'Gedung Serbaguna (SG)' : isAulaCat ? 'Ruang Pertemuan / Aula' : 'Gedung Penginapan'}
                                </span>
                              </div>
                            </div>

                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold border shrink-0 ${badgeClass}`}>
                              {isSG ? 'Serbaguna (SG)' : isAulaCat ? 'R. Pertemuan / Aula' : 'Penginapan'}
                            </span>
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700 space-y-1.5 text-xs">
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="text-slate-500 dark:text-slate-400">Kapasitas / Unit:</span>
                              <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">{item.unitCountText}</span>
                            </div>
                            {item.dailyRate ? (
                              <div className="flex justify-between items-center text-[11px]">
                                <span className="text-slate-500 dark:text-slate-400">Tarif Sewa Harian (12 Jam):</span>
                                <span className="font-bold font-mono text-emerald-700 dark:text-emerald-400">{formatRupiah(item.dailyRate)}</span>
                              </div>
                            ) : null}
                            {item.sessionRate ? (
                              <div className="flex justify-between items-center text-[11px]">
                                <span className="text-slate-500 dark:text-slate-400">Tarif Sewa Per Sesi (8 Jam):</span>
                                <span className="font-bold font-mono text-slate-700 dark:text-slate-300">{formatRupiah(item.sessionRate)}</span>
                              </div>
                            ) : null}
                            {item.capacityDesc && (
                              <div className="flex justify-between items-center text-[11px]">
                                <span className="text-slate-500 dark:text-slate-400">Spesifikasi:</span>
                                <span className="text-slate-700 dark:text-slate-300 font-medium truncate max-w-[180px]">{item.capacityDesc}</span>
                              </div>
                            )}

                            {item.facilities && item.facilities.length > 0 && (
                              <div className="pt-1">
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1">Fasilitas Utama:</span>
                                <div className="flex flex-wrap gap-1">
                                  {item.facilities.slice(0, 4).map((f, i) => (
                                    <span key={i} className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-[9px] font-medium">
                                      {f}
                                    </span>
                                  ))}
                                  {item.facilities.length > 4 && (
                                    <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded text-[9px]">
                                      +{item.facilities.length - 4} lainnya
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            item.status === 'AKTIF' || item.status === 'TERSEDIA' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}>
                            {item.status === 'TERSEDIA' ? 'AKTIF' : item.status}
                          </span>

                          <div className="flex items-center space-x-1">
                            {canManageMaster && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (item.sourceType === 'MEETING_ROOM') {
                                      setMeetingRoomToEdit(item.originalItem as MeetingRoom);
                                      setIsMeetingRoomModalOpen(true);
                                    } else {
                                      setBuildingToEdit(item.originalItem as Building);
                                      setIsBuildingModalOpen(true);
                                    }
                                  }}
                                  className="px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded font-semibold transition cursor-pointer"
                                >
                                  <i className="fa-solid fa-pen-to-square mr-1"></i>
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (item.sourceType === 'MEETING_ROOM') {
                                      setDeleteConfirmState({
                                        isOpen: true,
                                        title: 'Hapus Fasilitas Pertemuan',
                                        itemName: item.name,
                                        itemType: isSG ? 'Gedung Serbaguna (SG)' : 'Ruang Pertemuan / Aula',
                                        onConfirm: () => {
                                          deleteMeetingRoom(item.id);
                                        }
                                      });
                                    } else {
                                      setDeleteConfirmState({
                                        isOpen: true,
                                        title: 'Hapus Gedung',
                                        itemName: item.name,
                                        itemType: 'Gedung',
                                        onConfirm: () => {
                                          deleteBuilding(item.id);
                                        }
                                      });
                                    }
                                  }}
                                  className="px-2 py-1 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded font-semibold transition cursor-pointer"
                                >
                                  <i className="fa-solid fa-trash-can mr-1"></i>
                                  <span>Hapus</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        );
      })()}

      {/* VIEW 4: KATALOG TIPE KAMAR & TARIF KAPASITAS (3 Tipe Baku: Ekonomi, Standar, Superior & Bebas Tipe Kustom; Double s/d 8 Bed) */}
      {activeCatalogTab === 'ROOM_CAPACITY_RATES' && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-5 animate-in fade-in duration-150">
          {/* Header & Deskripsi */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-base text-slate-900 flex items-center space-x-2">
                <i className="fa-solid fa-tags text-emerald-600"></i>
                <span>Katalog Tipe Kamar &amp; Tarif Kapasitas</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Konfigurasi ragam tipe kamar (<strong>Ekonomi</strong>, <strong>Standar</strong>, <strong>Superior</strong>, maupun tipe kustom) dengan fleksibilitas kapasitas tempat tidur (<strong>Double Bed</strong>, <strong>2 Single Bed</strong>, <strong>3 Single Bed</strong>, <strong>4 Single Bed</strong> hingga <strong>8 Single Bed</strong>) beserta tarif resmi per malam.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              {canManageMaster && (
                <button
                  type="button"
                  onClick={() => {
                    setActionConfirmState({
                      isOpen: true,
                      title: 'Reset Standar Katalog Tipe Kamar',
                      subtitle: 'Standar Baku Resmi UPT Asrama Haji',
                      message: 'Apakah Anda yakin ingin mereset seluruh konfigurasi tarif, kapasitas bed (Double Bed hingga 8 Single Bed), dan tipe kamar ke standar baku resmi UPT Asrama Haji (24 konfigurasi default)? Konfigurasi kustom akan dikembalikan ke standar awal.',
                      confirmText: 'Ya, Reset Standar UPT',
                      variant: 'warning',
                      icon: 'fa-rotate-left',
                      onConfirm: () => {
                        resetRoomCapacityRates();
                      }
                    });
                  }}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
                  title="Kembalikan konfigurasi tarif ke standar baku UPT (24 konfigurasi default)"
                >
                  <i className="fa-solid fa-rotate-left text-slate-500"></i>
                  <span>Reset Standar UPT</span>
                </button>
              )}

              {canManageRooms && (
                <button
                  type="button"
                  onClick={() => {
                    setRateToEdit(null);
                    setIsRateModalOpen(true);
                  }}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-2 cursor-pointer"
                >
                  <i className="fa-solid fa-plus"></i>
                  <span>Tambah Konfigurasi Tipe &amp; Bed</span>
                </button>
              )}
            </div>
          </div>

          {/* KPI Summary Cards (5-Grid) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Konfigurasi</span>
              <span className="text-xl font-black text-slate-900 mt-1 block">{cleanRatesList.length}</span>
              <span className="text-[10px] text-slate-500">{catalogRoomTypes.length} Tipe Kamar Terdaftar</span>
            </div>

            <div className="p-3 rounded-xl bg-teal-50 border border-teal-200">
              <span className="text-[10px] uppercase font-bold text-teal-700 block flex items-center justify-between">
                <span>Tipe Ekonomi</span>
                <span className="w-2 h-2 rounded-full bg-teal-500"></span>
              </span>
              <span className="text-xl font-black text-teal-900 mt-1 block">
                {cleanRatesList.filter(r => r.roomType === 'Ekonomi').length} Konfigurasi
              </span>
              <span className="text-[10px] text-teal-700">Kapasitas 2 s/d 8 Bed</span>
            </div>

            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
              <span className="text-[10px] uppercase font-bold text-blue-700 block flex items-center justify-between">
                <span>Tipe Standar</span>
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              </span>
              <span className="text-xl font-black text-blue-900 mt-1 block">
                {cleanRatesList.filter(r => r.roomType === 'Standar').length} Konfigurasi
              </span>
              <span className="text-[10px] text-blue-700">Kapasitas 2 s/d 8 Bed</span>
            </div>

            <div className="p-3 rounded-xl bg-purple-50 border border-purple-200">
              <span className="text-[10px] uppercase font-bold text-purple-700 block flex items-center justify-between">
                <span>Tipe Superior</span>
                <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              </span>
              <span className="text-xl font-black text-purple-900 mt-1 block">
                {cleanRatesList.filter(r => r.roomType === 'Superior').length} Konfigurasi
              </span>
              <span className="text-[10px] text-purple-700">Kapasitas 2 s/d 8 Bed</span>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <span className="text-[10px] uppercase font-bold text-amber-800 block flex items-center justify-between">
                <span>Tipe Kustom / Lain</span>
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              </span>
              <span className="text-xl font-black text-amber-900 mt-1 block">
                {cleanRatesList.filter(r => !['Ekonomi', 'Standar', 'Superior'].includes(r.roomType)).length} Konfigurasi
              </span>
              <span className="text-[10px] text-amber-700">Deluxe, VIP, &amp; Kustom</span>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-slate-700 mr-1">Filter Tipe Kamar:</span>
              {(['ALL', ...catalogRoomTypes]).map(t => {
                const count = t === 'ALL' 
                  ? cleanRatesList.length 
                  : cleanRatesList.filter(r => r.roomType === t).length;
                const isSel = rateTypeFilter === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setRateTypeFilter(t)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                      isSel 
                        ? 'bg-emerald-700 text-white shadow-xs' 
                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span>{t === 'ALL' ? 'Semua Tipe' : t}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isSel ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative">
              <input
                type="text"
                value={rateSearch}
                onChange={e => setRateSearch(e.target.value)}
                placeholder="Cari konfigurasi bed / fasilitas..."
                className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 pl-8 outline-none focus:ring-2 focus:ring-emerald-600 w-48 sm:w-64"
              />
              <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-2.5 text-slate-400 text-xs"></i>
            </div>
          </div>

          {/* Rates Cards Grid (5-GRID SYSTEM) */}
          {(() => {
            const filteredRates = cleanRatesList.filter(r => {
              if (rateTypeFilter !== 'ALL' && r.roomType !== rateTypeFilter) return false;
              if (rateSearch) {
                const q = rateSearch.toLowerCase();
                const matchType = r.roomType.toLowerCase().includes(q);
                const matchBed = r.bedType.toLowerCase().includes(q);
                const matchDesc = (r.description || '').toLowerCase().includes(q);
                const matchFac = (r.facilities || []).some(f => f.toLowerCase().includes(q));
                if (!matchType && !matchBed && !matchDesc && !matchFac) return false;
              }
              return true;
            });

            if (filteredRates.length === 0) {
              return (
                <div className="p-12 text-center text-slate-400 italic bg-slate-50 rounded-xl border border-slate-200">
                  <i className="fa-solid fa-tags text-4xl mb-2 text-slate-300 block"></i>
                  <p className="font-semibold text-xs text-slate-600">Tidak ada konfigurasi tipe kamar &amp; tarif yang sesuai dengan filter.</p>
                  <p className="text-[11px] text-slate-400 mt-1">Gunakan tombol &quot;Tambah Konfigurasi Tipe &amp; Bed&quot; di atas untuk mendaftarkan kombinasi baru.</p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {filteredRates.map((rate, rateIdx) => {
                  const matchingRooms = rooms.filter(rm => 
                    rm.type?.toLowerCase() === rate.roomType.toLowerCase() && 
                    rm.bedType?.toLowerCase() === rate.bedType.toLowerCase()
                  );

                  const isSuperior = rate.roomType === 'Superior';
                  const isEkonomi = rate.roomType === 'Ekonomi';
                  const isStandar = rate.roomType === 'Standar';

                  return (
                    <div 
                      key={rate.id || `rate-${rate.roomType}-${rate.bedType}-${rateIdx}`}
                      className="p-3 rounded-xl border border-slate-200 bg-white hover:border-emerald-400 hover:shadow-md transition flex flex-col justify-between space-y-2.5 text-xs group"
                    >
                      <div className="space-y-2">
                        {/* Top: Badges & Bed Type */}
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border truncate max-w-[120px] ${
                              isSuperior 
                                ? 'bg-purple-50 text-purple-800 border-purple-200' 
                                : isEkonomi 
                                ? 'bg-teal-50 text-teal-800 border-teal-200'
                                : isStandar
                                ? 'bg-blue-50 text-blue-800 border-blue-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}>
                              {rate.roomType}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                              {rate.capacityPax} Pax
                            </span>
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                              isSuperior 
                                ? 'bg-purple-100 text-purple-800' 
                                : isEkonomi 
                                ? 'bg-teal-100 text-teal-800'
                                : isStandar
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              <i className="fa-solid fa-bed"></i>
                            </div>
                            <h4 className="font-bold text-xs text-slate-900 leading-tight">
                              {rate.bedType}
                            </h4>
                          </div>
                        </div>

                        {/* Pricing Box */}
                        <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 flex flex-col justify-center">
                          <span className="text-[10px] text-slate-400 font-medium">Tarif Sewa / Malam:</span>
                          <span className="text-sm font-black font-mono text-emerald-700 tracking-tight">
                            {formatRupiah(rate.pricePerNight)}
                          </span>
                        </div>

                        {/* Description */}
                        {rate.description && (
                          <p className="text-[10px] text-slate-500 line-clamp-1 italic" title={rate.description}>
                            {rate.description}
                          </p>
                        )}

                        {/* Facilities Chips */}
                        <div className="pt-1.5 border-t border-slate-100">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Fasilitas:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {(rate.facilities || []).slice(0, 3).map((f, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-slate-50 text-slate-600 rounded text-[9px] font-medium border border-slate-200 truncate max-w-[120px]" title={f}>
                                {f}
                              </span>
                            ))}
                            {(rate.facilities || []).length > 3 && (
                              <span className="px-1 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-semibold" title={(rate.facilities || []).slice(3).join(', ')}>
                                +{(rate.facilities || []).length - 3}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Connected Rooms */}
                        <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">Unit Terhubung:</span>
                          <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] ${
                            matchingRooms.length > 0 
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}>
                            {matchingRooms.length} Kamar
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
                        {canManageMaster && (
                          <button
                            type="button"
                            onClick={() => {
                              setActionConfirmState({
                                isOpen: true,
                                title: 'Sinkronisasi Tarif Massal',
                                subtitle: `Tipe ${rate.roomType} (${rate.bedType})`,
                                message: `Terapkan tarif resmi ${formatRupiah(rate.pricePerNight)}/malam dan fasilitas standar ke seluruh ${matchingRooms.length} unit kamar aktif bertipe ${rate.roomType} (${rate.bedType})?`,
                                confirmText: 'Terapkan Massal',
                                variant: 'success',
                                icon: 'fa-arrows-rotate',
                                onConfirm: () => {
                                  applyRateToAllRooms(rate.roomType, rate.bedType, rate.pricePerNight, rate.facilities);
                                }
                              });
                            }}
                            className="p-1.5 px-2 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 rounded-lg border border-emerald-200 transition flex items-center space-x-1 cursor-pointer"
                            title="Terapkan tarif & fasilitas ke seluruh unit kamar bertipe ini"
                          >
                            <i className="fa-solid fa-arrows-rotate text-[9px]"></i>
                            <span className="hidden xl:inline">Terapkan</span>
                          </button>
                        )}

                        <div className="flex items-center space-x-1 ml-auto">
                          {canManageRooms && (
                            <button
                              type="button"
                              onClick={() => {
                                setRateToEdit(rate);
                                setIsRateModalOpen(true);
                              }}
                              className="p-1.5 px-2 text-[10px] text-blue-600 hover:bg-blue-50 rounded-lg font-bold border border-blue-200 transition flex items-center space-x-1 cursor-pointer"
                              title="Edit konfigurasi tarif & tipe kamar"
                            >
                              <i className="fa-solid fa-pen-to-square text-[10px]"></i>
                              <span>Edit</span>
                            </button>
                          )}

                          {canManageMaster && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteConfirmState({
                                  isOpen: true,
                                  title: 'Hapus Konfigurasi Tarif Kamar',
                                  itemName: `${rate.roomType} - ${rate.bedType} (Rp ${rate.pricePerNight.toLocaleString('id-ID')})`,
                                  itemType: 'Konfigurasi Tarif Kamar',
                                  onConfirm: () => {
                                    deleteRoomCapacityRate(rate.id);
                                  }
                                });
                              }}
                              className="p-1.5 px-2 text-[10px] text-rose-600 hover:bg-rose-50 rounded-lg font-bold border border-rose-200 transition flex items-center space-x-1 cursor-pointer"
                              title="Hapus konfigurasi ini"
                            >
                              <i className="fa-solid fa-trash-can text-[10px]"></i>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* CRUD MODALS */}
      <BuildingModal
        isOpen={isBuildingModalOpen}
        onClose={() => {
          setIsBuildingModalOpen(false);
          setBuildingToEdit(null);
        }}
        buildingToEdit={buildingToEdit}
      />

      <MeetingRoomModal
        isOpen={isMeetingRoomModalOpen}
        onClose={() => {
          setIsMeetingRoomModalOpen(false);
          setMeetingRoomToEdit(null);
          setDefaultCategoryForNewMeetingRoom(undefined);
        }}
        meetingRoomToEdit={meetingRoomToEdit}
        defaultCategory={defaultCategoryForNewMeetingRoom}
      />

      <RoomModal
        isOpen={isRoomModalOpen}
        onClose={() => {
          setIsRoomModalOpen(false);
          setRoomToEdit(null);
          setSelectedBuildingForNewRoom(undefined);
        }}
        roomToEdit={roomToEdit}
        defaultBuilding={selectedBuildingForNewRoom}
      />

      <RoomCapacityRateModal
        isOpen={isRateModalOpen}
        onClose={() => {
          setIsRateModalOpen(false);
          setRateToEdit(null);
        }}
        rateToEdit={rateToEdit}
      />

      <DeleteConfirmModal
        isOpen={deleteConfirmState.isOpen}
        title={deleteConfirmState.title}
        itemName={deleteConfirmState.itemName}
        itemType={deleteConfirmState.itemType}
        onClose={() => setDeleteConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={deleteConfirmState.onConfirm}
      />

      <ActionConfirmModal
        isOpen={actionConfirmState.isOpen}
        title={actionConfirmState.title}
        subtitle={actionConfirmState.subtitle}
        message={actionConfirmState.message}
        confirmText={actionConfirmState.confirmText}
        variant={actionConfirmState.variant}
        icon={actionConfirmState.icon}
        onClose={() => setActionConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={actionConfirmState.onConfirm}
      />
    </div>
  );
}
