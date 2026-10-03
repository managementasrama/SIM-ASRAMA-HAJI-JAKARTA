import { useState, useEffect } from 'react';
import { useAppContext, isQcRole } from '../store';
import { Room } from '../types';
import { compareBuildingOrder, formatRupiah, isMeetingFacility } from '../lib/utils';
import { OFFICIAL_TARIFFS } from '../data';

// Helper for distinctive building-related icons for penginapan and other facilities (synchronized with RoomsView)
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

export function QualityControlView() {
  const { rooms, qcInspections = [], currentUser, openModal, setActiveTab, selectedBuilding, setSelectedBuilding, buildings = [], meetingRooms = [] } = useAppContext();
  const [bFilter, setBFilter] = useState('ALL');
  const [qcFilter, setQcFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'ROOMS' | 'HISTORY'>('ROOMS');
  const [globalDisplay, setGlobalDisplay] = useState<'COLLAPSE' | 'EXPAND'>('COLLAPSE');
  const [buildingOverrides, setBuildingOverrides] = useState<Record<string, boolean>>({});

  const canInspect = isQcRole(currentUser?.role);

  // Tangani filter langsung jika datang dari Dashboard atau Denah Gedung
  useEffect(() => {
    if (selectedBuilding) {
      let targetBldg = selectedBuilding;
      if (targetBldg === 'Ruang Pertemuan') targetBldg = 'Ruang Pertemuan / Aula';
      if (targetBldg === 'Gedung Serbaguna') targetBldg = 'Gedung Serbaguna (SG)';

      setBFilter(targetBldg);
      setBuildingOverrides(prev => ({
        ...prev,
        [targetBldg]: false
      }));

      const timer = setTimeout(() => {
        const cleanId = `qc-building-section-${targetBldg.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const el = document.getElementById(cleanId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [selectedBuilding]);

  // Helper untuk penentuan gedung yang konsisten 100% dengan Manajemen Gedung (Denah Penyewaan)
  const getRoomBuildingKey = (r: Room): string => {
    const matchingMr = meetingRooms.find(m => m.id === r.id || m.name.toLowerCase() === r.roomNumber.toLowerCase());
    if (matchingMr) {
      if (matchingMr.category === 'SERBAGUNA') return 'Gedung Serbaguna (SG)';
      if (matchingMr.category === 'AULA' || matchingMr.category === 'RUANG_PERTEMUAN') return 'Ruang Pertemuan / Aula';
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

    if (r.building === 'Gedung Serbaguna (SG)' || r.building === 'Gedung Serbaguna' || r.type === 'Gedung Serbaguna (SG)') {
      return 'Gedung Serbaguna (SG)';
    }
    if (r.building === 'Ruang Pertemuan' || r.building === 'Ruang Pertemuan / Aula' || r.type === 'Ruang Pertemuan / Aula' || isMeetingFacility(r.building) || isMeetingFacility(r.type)) {
      return 'Ruang Pertemuan / Aula';
    }
    return r.building;
  };

  // Filtered rooms
  const filteredRooms = rooms.filter(r => {
    const effectiveBuilding = getRoomBuildingKey(r);
    if (bFilter !== 'ALL') {
      if (bFilter === 'Gedung Serbaguna (SG)' || bFilter === 'Gedung Serbaguna') {
        if (effectiveBuilding !== 'Gedung Serbaguna (SG)') return false;
      } else if (bFilter === 'Ruang Pertemuan' || bFilter === 'Ruang Pertemuan / Aula') {
        if (effectiveBuilding !== 'Ruang Pertemuan / Aula') return false;
      } else {
        if (effectiveBuilding !== bFilter) return false;
      }
    }
    if (qcFilter !== 'ALL') {
      const roomQc = r.qcStatus || 'PERLU_INSPEKSI';
      if (roomQc !== qcFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const matchRoom = r.roomNumber.toLowerCase().includes(q);
      const matchBldg = effectiveBuilding.toLowerCase().includes(q) || r.building.toLowerCase().includes(q);
      const matchNotes = (r.lastQcNotes || '').toLowerCase().includes(q);
      const matchBy = (r.lastQcBy || '').toLowerCase().includes(q);
      if (!matchRoom && !matchBldg && !matchNotes && !matchBy) return false;
    }
    return true;
  });

  // Group rooms by building (identik 100% dengan Manajemen Gedung)
  const grouped: Record<string, Room[]> = {};

  // Daftarkan semua master gedung penginapan (lewati Serbaguna dan Pertemuan agar tidak menimbulkan seksi duplikat)
  (buildings || []).forEach(b => {
    const isSpecial = b.name === 'Ruang Pertemuan' || b.name === 'Ruang Pertemuan / Aula' || b.name === 'Gedung Serbaguna' || b.name === 'Gedung Serbaguna (SG)' || b.category === 'SERBAGUNA' || b.category === 'RUANG_PERTEMUAN';
    if (!isSpecial) {
      if (bFilter === 'ALL' || bFilter === b.name) {
        if (!grouped[b.name]) grouped[b.name] = [];
      }
    }
  });

  // Daftarkan Gedung Serbaguna (SG) dan Ruang Pertemuan / Aula TEPAT SATU KALI agar selalu tunggal & sinkron
  if (bFilter === 'ALL' || bFilter === 'Gedung Serbaguna (SG)' || bFilter === 'Gedung Serbaguna') {
    if (!grouped['Gedung Serbaguna (SG)']) grouped['Gedung Serbaguna (SG)'] = [];
  }
  if (bFilter === 'ALL' || bFilter === 'Ruang Pertemuan' || bFilter === 'Ruang Pertemuan / Aula') {
    if (!grouped['Ruang Pertemuan / Aula']) grouped['Ruang Pertemuan / Aula'] = [];
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

  // KPI Metrics
  const totalRooms = rooms.length;
  const lolosQcCount = rooms.filter(r => r.qcStatus === 'LOLOS_QC').length;
  const menungguQcCount = rooms.filter(r => r.qcStatus === 'MENUNGGU_QC').length;
  const perluPerbaikanCount = rooms.filter(r => r.qcStatus === 'PERLU_PERBAIKAN').length;
  const perluInspeksiCount = rooms.filter(r => !r.qcStatus || r.qcStatus === 'PERLU_INSPEKSI').length;

  const getQcBadge = (status?: string, compact = true) => {
    switch (status) {
      case 'LOLOS_QC':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <i className="fa-solid fa-circle-check mr-1 text-emerald-600 text-[8px]"></i>
            {compact ? 'Lolos QC' : 'Lolos QC (Siap Pakai)'}
          </span>
        );
      case 'MENUNGGU_QC':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-hajj-900 border border-amber-300 animate-pulse">
            <i className="fa-solid fa-bell mr-1 text-amber-600 text-[8px]"></i>
            {compact ? 'Cek QC' : 'Telah Diperbaiki (Cek QC)'}
          </span>
        );
      case 'PERLU_PERBAIKAN':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-800 border border-red-300">
            <i className="fa-solid fa-triangle-exclamation mr-1 text-red-600 text-[8px]"></i>
            {compact ? 'Perbaikan' : 'Perlu Perbaikan'}
          </span>
        );
      case 'PERLU_INSPEKSI':
      default:
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <i className="fa-solid fa-clock-rotate-left mr-1 text-amber-600 text-[8px]"></i>
            {compact ? 'Perlu Cek' : 'Perlu Inspeksi Rutin'}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-emerald-200/80 shadow-xs hover:border-emerald-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-slate-700">Lolos QC (Siap Huni)</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs sm:text-sm border border-emerald-100">
              <i className="fa-solid fa-circle-check"></i>
            </div>
          </div>
          <div className="flex items-baseline space-x-2 mt-1.5 sm:mt-2">
            <span className="text-xl sm:text-2xl font-black text-slate-900">{lolosQcCount}</span>
            <span className="text-[11px] sm:text-xs font-bold text-emerald-600">{Math.round((lolosQcCount / totalRooms) * 100)}%</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 sm:mt-2 overflow-hidden">
            <div 
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.round((lolosQcCount / totalRooms) * 100)}%` }}
            ></div>
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-500 mt-1 sm:mt-1.5 truncate">Standar mutu kamar siap digunakan</p>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-xl border border-purple-200/90 shadow-xs hover:border-purple-300 transition bg-purple-50/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-purple-900 flex items-center gap-1.5">
              <span>Perlu Cek QC</span>
              {menungguQcCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping"></span>
              )}
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center text-xs sm:text-sm border border-purple-200">
              <i className="fa-solid fa-bell"></i>
            </div>
          </div>
          <div className="flex items-baseline space-x-2 mt-1.5 sm:mt-2">
            <span className="text-xl sm:text-2xl font-black text-purple-900">{menungguQcCount}</span>
            <span className="text-[10px] sm:text-[11px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">Prioritas</span>
          </div>
          <div className="w-full bg-purple-100/70 h-1.5 rounded-full mt-1.5 sm:mt-2 overflow-hidden">
            <div 
              className="bg-purple-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.round((menungguQcCount / totalRooms) * 100) * 3)}%` }}
            ></div>
          </div>
          <p className="text-[10px] sm:text-[11px] text-purple-700 mt-1 sm:mt-1.5 font-medium truncate">Menunggu verifikasi pasca teknisi</p>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-xl border border-rose-200/80 shadow-xs hover:border-rose-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-slate-700">Perlu Perbaikan</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center text-xs sm:text-sm border border-rose-100">
              <i className="fa-solid fa-wrench"></i>
            </div>
          </div>
          <div className="flex items-baseline space-x-2 mt-1.5 sm:mt-2">
            <span className="text-xl sm:text-2xl font-black text-slate-900">{perluPerbaikanCount}</span>
            <span className="text-[10px] sm:text-[11px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">Teknisi</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 sm:mt-2 overflow-hidden">
            <div 
              className="bg-rose-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.round((perluPerbaikanCount / totalRooms) * 100) * 3)}%` }}
            ></div>
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-500 mt-1 sm:mt-1.5 truncate">Kendala dalam proses teknisi</p>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-xl border border-amber-200/80 shadow-xs hover:border-amber-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-slate-700">Inspeksi Rutin</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-xs sm:text-sm border border-amber-100">
              <i className="fa-solid fa-clipboard-list"></i>
            </div>
          </div>
          <div className="flex items-baseline space-x-2 mt-1.5 sm:mt-2">
            <span className="text-xl sm:text-2xl font-black text-slate-900">{perluInspeksiCount}</span>
            <span className="text-[10px] sm:text-[11px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Rutin</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 sm:mt-2 overflow-hidden">
            <div 
              className="bg-amber-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.round((perluInspeksiCount / totalRooms) * 100)}%` }}
            ></div>
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-500 mt-1 sm:mt-1.5 truncate">Selesai checkout & baru</p>
        </div>
      </div>

      {/* Navigation Sub-Tabs & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveSubTab('ROOMS')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center space-x-2 ${
              activeSubTab === 'ROOMS'
                ? 'bg-white text-teal-800 shadow-xs font-black'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <i className="fa-solid fa-door-open"></i>
            <span>Status Kamar & Gedung</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeSubTab === 'ROOMS' ? 'bg-teal-100 text-teal-800' : 'bg-slate-200 text-slate-600'
            }`}>
              {filteredRooms.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('HISTORY')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center space-x-2 ${
              activeSubTab === 'HISTORY'
                ? 'bg-white text-teal-800 shadow-xs font-black'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <i className="fa-solid fa-clock-rotate-left"></i>
            <span>Riwayat Log QC</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeSubTab === 'HISTORY' ? 'bg-teal-100 text-teal-800' : 'bg-slate-200 text-slate-600'
            }`}>
              {qcInspections.length}
            </span>
          </button>
        </div>

        {/* Download QC Report Button */}
        <div className="flex items-center space-x-2 self-start sm:self-auto">
          <button
            onClick={() => openModal('modalExport', { 
              defaultType: 'QC', 
              defaultQcMode: activeSubTab === 'ROOMS' ? 'READINESS' : 'HISTORY',
              defaultBuilding: bFilter,
              defaultFormat: 'PDF'
            })}
            className="px-3 py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl shadow-xs flex items-center space-x-1.5 transition text-xs cursor-pointer"
            title="Unduh Laporan QC"
          >
            <i className="fa-solid fa-file-arrow-down"></i>
            <span>Unduh Laporan</span>
          </button>
        </div>
      </div>

      {/* SUB-VIEW 1: ROOMS INSPECTION GROUPED BY BUILDING & AULA */}
      {activeSubTab === 'ROOMS' && (
        <div className="space-y-5">
          {/* Filter & Display Controls Bar - Synchronized with RoomsView */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-slate-200 space-y-4">
            {/* Top Row: Title, Summary Count, Search Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-base shrink-0 shadow-2xs border border-teal-200">
                  <i className="fa-solid fa-clipboard-check"></i>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-black text-slate-800 tracking-tight">
                      Denah Kamar &amp; Ruang Pertemuan (Pengecekan QC)
                    </h3>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold border border-slate-200">
                      {filteredRooms.length} dari {rooms.length} Kamar
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Inspeksi kelayakan hunian, kebersihan, dan kesiapan fasilitas per gedung sebelum ditempati jemaah.
                  </p>
                </div>
              </div>

              {/* Right Side: Search Box */}
              <div className="flex items-center gap-2 w-full lg:w-auto shrink-0">
                <div className="relative flex-1 sm:w-72">
                  <input 
                    type="text" 
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Cari No Kamar / Nama Aula..." 
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 pl-8 pr-7 focus:ring-2 focus:ring-teal-600 focus:bg-white outline-none font-medium text-slate-900 transition" 
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
              </div>
            </div>

            {/* Middle Row: Quick Status Filters (1-Click Pill Buttons) */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 hidden sm:inline">Status QC:</span>
                <button
                  type="button"
                  onClick={() => setQcFilter('ALL')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5 border ${
                    qcFilter === 'ALL'
                      ? 'bg-slate-800 text-white border-slate-800 shadow-2xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <span>Semua Status</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-current">{rooms.length}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setQcFilter('LOLOS_QC')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5 border ${
                    qcFilter === 'LOLOS_QC'
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                      : 'bg-emerald-50/60 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Lolos QC (Siap Pakai)</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/30 text-current">
                    {lolosQcCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setQcFilter('MENUNGGU_QC')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5 border ${
                    qcFilter === 'MENUNGGU_QC'
                      ? 'bg-purple-700 text-white border-purple-700 shadow-2xs'
                      : 'bg-purple-50/60 hover:bg-purple-100 text-purple-800 border-purple-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  <span>Cek QC (Pasca Teknisi)</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/30 text-current">
                    {menungguQcCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setQcFilter('PERLU_INSPEKSI')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5 border ${
                    qcFilter === 'PERLU_INSPEKSI'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                      : 'bg-amber-50/60 hover:bg-amber-100 text-amber-800 border-amber-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span>Perlu Inspeksi</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/30 text-current">
                    {perluInspeksiCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setQcFilter('PERLU_PERBAIKAN')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5 border ${
                    qcFilter === 'PERLU_PERBAIKAN'
                      ? 'bg-rose-700 text-white border-rose-700 shadow-2xs'
                      : 'bg-rose-50/60 hover:bg-rose-100 text-rose-800 border-rose-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  <span>Perlu Perbaikan</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/30 text-current">
                    {perluPerbaikanCount}
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
                      ? 'bg-white text-teal-800 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <i className="fa-solid fa-expand mr-1"></i> Buka Semua
                </button>
              </div>
            </div>

            {/* Bottom Row: Detailed Dropdown Filter Bar in a Clean Light Box */}
            <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/80">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                {/* Filter 1: Gedung */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <i className="fa-solid fa-building text-slate-400"></i>
                    <span>Pilih Gedung Fasilitas:</span>
                  </label>
                  <select 
                    value={bFilter} 
                    onChange={e => setBFilter(e.target.value)} 
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-teal-600 outline-none font-medium text-slate-800 cursor-pointer shadow-2xs"
                  >
                    <option key="all" value="ALL">Semua Fasilitas Gedung &amp; Aula</option>
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

                {/* Filter 2: Status QC */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <i className="fa-solid fa-clipboard-check text-slate-400"></i>
                    <span>Status Quality Control:</span>
                  </label>
                  <select
                    value={qcFilter}
                    onChange={e => setQcFilter(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-teal-600 outline-none font-medium text-slate-800 cursor-pointer shadow-2xs"
                  >
                    <option key="all" value="ALL">Semua Status QC</option>
                    <option key="lolos" value="LOLOS_QC">🟢 Lolos QC (Siap Pakai)</option>
                    <option key="menunggu" value="MENUNGGU_QC">🟣 Perlu Cek QC (Pasca Teknisi)</option>
                    <option key="inspeksi" value="PERLU_INSPEKSI">🟡 Perlu Inspeksi Rutin</option>
                    <option key="perbaikan" value="PERLU_PERBAIKAN">🔴 Perlu Perbaikan (Teknisi)</option>
                  </select>
                </div>

                {/* Filter 3: Tampilan Gedung */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <i className="fa-solid fa-layer-group text-slate-400"></i>
                    <span>Mode Tampilan Denah:</span>
                  </label>
                  <select
                    value={globalDisplay}
                    onChange={e => handleGlobalDisplayChange(e.target.value as 'COLLAPSE' | 'EXPAND')}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-teal-600 outline-none font-medium text-slate-800 cursor-pointer shadow-2xs"
                  >
                    <option key="collapse" value="COLLAPSE">Sembunyikan Kamar (Ringkas - Nama Gedung Saja)</option>
                    <option key="expand" value="EXPAND">Buka Semua Kamar &amp; Aula</option>
                  </select>
                </div>
              </div>

              {/* Active Filter Reset */}
              {(bFilter !== 'ALL' || qcFilter !== 'ALL' || search) && (
                <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-slate-200 text-xs text-slate-600">
                  <span className="flex items-center gap-1.5 font-medium">
                    <i className="fa-solid fa-filter text-teal-700"></i>
                    <span>Filter aktif: menampilkan <strong>{filteredRooms.length}</strong> unit</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setBFilter('ALL');
                      setQcFilter('ALL');
                      setSearch('');
                    }}
                    className="text-teal-800 hover:text-teal-950 font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <i className="fa-solid fa-rotate-left text-[11px]"></i>
                    <span>Reset Semua Filter</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Grouped by Building & Aula */}
          <div className="space-y-6">
            {buildingNames.length === 0 ? (
              <div className="bg-white p-12 text-center rounded-xl border border-slate-200 text-slate-400">
                <i className="fa-solid fa-building-circle-xmark text-4xl mb-2"></i>
                <p className="text-xs font-semibold">Tidak ada kamar atau aula yang sesuai dengan filter QC.</p>
              </div>
            ) : (
              buildingNames.map(bName => {
                const bRooms = grouped[bName];
                const isCollapsed = isBuildingCollapsed(bName);
                const bObj = buildings.find(b => b.name.toLowerCase() === bName.toLowerCase());
                const isSGBuilding = bName === 'Gedung Serbaguna (SG)' || bName === 'Gedung Serbaguna' || bObj?.category === 'SERBAGUNA';
                const isAulaBuilding = bName === 'Ruang Pertemuan' || bName === 'Ruang Pertemuan / Aula' || bObj?.category === 'RUANG_PERTEMUAN';
                const isBldSerbaguna = isSGBuilding || isAulaBuilding;
                const bCapacity = bObj?.totalRooms !== undefined && bObj.totalRooms !== null 
                  ? bObj.totalRooms 
                  : bRooms.length;
                const bDescription = (bObj?.description && bObj.description.trim())
                  || (bObj?.capacityDesc && bObj.capacityDesc.trim())
                  || (isSGBuilding ? 'Fasilitas Konvensi Akbar & Acara Serbaguna UPT Asrama Haji Jakarta' : isAulaBuilding ? 'Fasilitas Ruang Rapat, Auditorium & Aula Pertemuan Resmi UPT Asrama Haji Jakarta' : OFFICIAL_TARIFFS[bName]?.desc)
                  || 'Fasilitas Standar UPT';

                const bCategory = isSGBuilding ? 'SERBAGUNA' : isAulaBuilding ? 'RUANG_PERTEMUAN' : bObj?.category;
                const bIcon = getBuildingIcon(bName, bCategory);
                const bColors = getBuildingColorClass(bName, bCategory);

                const bLolos = bRooms.filter(r => r.qcStatus === 'LOLOS_QC').length;
                const bMenunggu = bRooms.filter(r => r.qcStatus === 'MENUNGGU_QC').length;
                const bPerluPerbaikan = bRooms.filter(r => r.qcStatus === 'PERLU_PERBAIKAN').length;
                const bPerluInspeksi = bRooms.filter(r => !r.qcStatus || r.qcStatus === 'PERLU_INSPEKSI').length;

                return (
                  <div key={bName} id={`qc-building-section-${bName.replace(/[^a-zA-Z0-9]/g, '-')}`} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm space-y-3 transition">
                    {/* Building Header / Accordion Dropdown Toggle matching RoomsView */}
                    <div
                      onClick={() => toggleBuilding(bName)}
                      className="bg-slate-100 px-5 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer hover:bg-slate-200/75 transition select-none"
                      title="Klik untuk menyembunyikan / menampilkan kamar"
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-9 h-9 rounded-xl ${bColors.bg} border ${bColors.border} shadow-xs flex items-center justify-center font-bold text-sm shrink-0`}>
                          <i className={`fa-solid ${bIcon}`}></i>
                        </div>
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
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBuilding(bName);
                              setActiveTab('gedung');
                            }}
                            className="px-2.5 py-1 bg-white hover:bg-emerald-50 border border-slate-300 hover:border-emerald-300 text-slate-700 hover:text-emerald-700 rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1.5 transition cursor-pointer"
                            title="Buka denah gedung ini di Manajemen Gedung (Denah Penyewaan)"
                          >
                            <i className="fa-solid fa-map-location-dot text-emerald-600"></i>
                            <span className="hidden md:inline">Buka di Denah</span>
                          </button>
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded font-semibold">
                            {bLolos} Lolos QC
                          </span>
                          {bMenunggu > 0 && (
                            <span className="px-2 py-1 bg-purple-100 text-purple-900 border border-purple-300 rounded font-bold animate-pulse">
                              {bMenunggu} Cek QC
                            </span>
                          )}
                          {bPerluPerbaikan > 0 && (
                            <span className="px-2 py-1 bg-rose-100 text-rose-800 rounded font-semibold">
                              {bPerluPerbaikan} Perlu Perbaikan
                            </span>
                          )}
                          <span className="px-2 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded font-semibold">
                            {bPerluInspeksi} Perlu Cek
                          </span>
                          <span className="px-2 py-1 bg-slate-200/80 text-slate-700 rounded font-semibold text-[11px]">
                            {bRooms.filter(r => r.status === 'KOSONG' || (r as any).status === 'TERSEDIA').length} Tersedia
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
                      <div className={`p-2.5 sm:p-4 grid gap-2.5 sm:gap-3 ${
                        isBldSerbaguna
                          ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4' 
                          : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5'
                      }`}>
                        {bRooms.length === 0 ? (
                          <div className="col-span-full py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <i className="fa-solid fa-door-closed text-2xl text-slate-300 mb-1.5 block"></i>
                            <span>Belum ada kamar atau unit terdaftar yang cocok dengan filter QC di gedung ini.</span>
                          </div>
                        ) : (
                          bRooms.map((room: Room) => {
                            const qc = room.qcStatus || 'PERLU_INSPEKSI';
                            let cardBorder = 'border-slate-200';
                            if (qc === 'LOLOS_QC') cardBorder = 'border-emerald-300 hover:border-emerald-400';
                            if (qc === 'MENUNGGU_QC') cardBorder = 'border-amber-300 ring-2 ring-amber-300/70 shadow-xs';
                            if (qc === 'PERLU_PERBAIKAN') cardBorder = 'border-rose-200 hover:border-rose-300';
                            if (qc === 'PERLU_INSPEKSI') cardBorder = 'border-amber-200 hover:border-amber-300';

                            const isAulaCard = isBldSerbaguna;
                            const matchingMr = meetingRooms.find(m => m.id === room.id || m.name.toLowerCase() === room.roomNumber.toLowerCase());
                            const isSGCard = isAulaCard && (
                              room.building === "Gedung Serbaguna (SG)" || 
                              room.building === "Gedung Serbaguna" || 
                              room.type === "Gedung Serbaguna (SG)" || 
                              matchingMr?.category === 'SERBAGUNA'
                            );
                            const displayName = matchingMr ? matchingMr.name : (isAulaCard ? room.roomNumber : `Kamar ${room.roomNumber}`);
                            const subTitle = matchingMr 
                              ? `${matchingMr.type || 'Gedung Serbaguna'} • Kap. ${matchingMr.capacity} org` 
                              : (isSGCard ? 'Gedung Serbaguna (SG)' : isAulaCard ? 'Ruang Pertemuan / Aula' : `${room.building} • Hunian`);
                            
                            const effectiveStatus = matchingMr 
                              ? (matchingMr.status === 'TERPAKAI' ? 'TERPAKAI' : matchingMr.status === 'MAINTENANCE' ? 'MAINTENANCE' : 'TERSEDIA') 
                              : room.status;

                            const statusBadge = (
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold shrink-0 ${
                                effectiveStatus === 'TERISI' || effectiveStatus === 'TERPAKAI' ? 'bg-rose-600 text-white' :
                                effectiveStatus === 'BOOKED' ? 'bg-blue-600 text-white' :
                                effectiveStatus === 'MAINTENANCE' ? 'bg-amber-600 text-white' : 'bg-emerald-600 text-white'
                              }`}>
                                {effectiveStatus}
                              </span>
                            );

                            return (
                              <div key={room.id} className={`p-2.5 sm:p-3 rounded-xl border ${cardBorder} shadow-xs flex flex-col justify-between space-y-2 sm:space-y-2.5 hover:shadow-md transition bg-white`}>
                                <div>
                                  {qc === 'MENUNGGU_QC' && (
                                    <div className="mb-2 -mt-0.5 -mx-0.5 px-2 py-0.5 rounded-lg bg-amber-100 text-hajj-900 text-[9px] font-bold flex items-center justify-between border border-amber-300">
                                      <span className="flex items-center">
                                        <i className="fa-solid fa-bolt mr-1 text-amber-600 text-[8px]"></i> Siap Cek Pasca Teknisi
                                      </span>
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-ping"></span>
                                    </div>
                                  )}

                                  <div className="flex items-start justify-between gap-1.5">
                                    <div className="flex items-start gap-2 min-w-0 flex-1">
                                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${
                                        isSGCard
                                          ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                          : isAulaCard 
                                          ? 'bg-purple-100 text-purple-900 border border-purple-200' 
                                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                                      } shrink-0 shadow-2xs`}>
                                        <i className={`fa-solid ${
                                          isSGCard
                                            ? 'fa-building-columns text-xs text-amber-700'
                                            : isAulaCard 
                                            ? 'fa-landmark text-xs text-purple-700' 
                                            : 'fa-bed text-xs text-slate-600'
                                        }`}></i>
                                      </span>
                                      <div className="min-w-0 flex-1 flex flex-col justify-center">
                                        <span className="font-bold text-xs text-slate-900 leading-tight break-words block" title={displayName}>
                                          {displayName}
                                        </span>
                                        <span className="text-[10px] text-slate-500 font-medium leading-tight block truncate mt-0.5" title={subTitle}>
                                          {subTitle}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="shrink-0 pt-0.5 flex flex-col items-end space-y-1">
                                      {statusBadge}
                                      {getQcBadge(room.qcStatus, true)}
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 pt-1.5 border-t border-slate-100">
                                    <span className="inline-flex items-center space-x-1 font-medium">
                                      <i className={`fa-solid ${isAulaCard ? 'fa-users-line text-hajj-700' : 'fa-users text-slate-400'} text-[10px]`}></i>
                                      <span>{room.capacity} {isAulaCard ? 'Pax' : 'Orang'}</span>
                                    </span>
                                    {isAulaCard ? (
                                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
                                        isSGCard 
                                          ? 'text-amber-900 bg-amber-50 border-amber-200'
                                          : 'text-purple-900 bg-purple-50 border-purple-200'
                                      }`}>
                                        {isSGCard ? 'Serbaguna (SG)' : 'Aula / Rapat'}
                                      </span>
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

                                  {/* Tariffs */}
                                  {isAulaCard ? (
                                    (() => {
                                      const sessionRate = matchingMr?.sessionRate || (isSGCard ? 8500000 : 7000000);
                                      const dailyRate = matchingMr?.dailyRate || (isSGCard ? 15000000 : 12000000);
                                      return (
                                        <div className="text-[9.5px] text-right font-mono font-bold pt-1 flex flex-col items-end leading-tight">
                                          <span className={isSGCard ? 'text-amber-800' : 'text-purple-800'}>
                                            {formatRupiah(sessionRate)} <span className="text-[8.5px] font-sans text-slate-500 font-normal">/ 8 Jam</span>
                                          </span>
                                          <span className="text-[8.5px] text-slate-500 font-normal font-sans">
                                            {formatRupiah(dailyRate)} / 12 Jam
                                          </span>
                                        </div>
                                      );
                                    })()
                                  ) : room.pricePerNight && room.pricePerNight > 0 ? (
                                    <div className="text-[10px] text-right font-mono font-bold text-emerald-700 pt-0.5">
                                      {formatRupiah(room.pricePerNight)} <span className="text-[9px] font-sans text-slate-400 font-normal">/mlm</span>
                                    </div>
                                  ) : null}

                                  {/* QC Audit Details */}
                                  <div className="mt-2 space-y-1 bg-slate-50 p-1.5 rounded-lg border border-slate-100 text-[10px]">
                                    {room.lastQcDate && (
                                      <div className="text-slate-600 flex items-center justify-between">
                                        <span className="text-slate-400 text-[9px]">Inspeksi:</span>
                                        <span className="font-semibold text-slate-700 font-mono text-[9px]">{room.lastQcDate}</span>
                                      </div>
                                    )}
                                    {room.lastQcBy && (
                                      <div className="text-slate-600 flex items-center justify-between">
                                        <span className="text-slate-400 text-[9px]">Pemeriksa:</span>
                                        <span className="font-semibold text-slate-700 flex items-center text-[9px] truncate max-w-[90px]" title={room.lastQcBy}>
                                          <i className="fa-solid fa-user-check text-teal-600 mr-1 text-[8px]"></i>
                                          {room.lastQcBy}
                                        </span>
                                      </div>
                                    )}
                                    {room.lastQcNotes && (
                                      <div className="text-slate-700 italic text-[9px] line-clamp-1 pt-0.5 border-t border-slate-200/60" title={room.lastQcNotes}>
                                        "{room.lastQcNotes}"
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Action buttons */}
                                <div className="mt-2 pt-1.5 border-t border-slate-100 space-y-1">
                                  {canInspect ? (
                                    <button
                                      type="button"
                                      onClick={() => openModal('modalQcInspection', { room })}
                                      className={`w-full py-1.5 font-bold rounded-lg text-[10px] shadow-xs flex items-center justify-center space-x-1.5 transition cursor-pointer ${
                                        (qc === 'PERLU_INSPEKSI' || qc === 'MENUNGGU_QC')
                                          ? 'bg-amber-400 hover:bg-amber-500 text-slate-950 border border-amber-500 font-extrabold shadow-sm ring-1 ring-amber-300'
                                          : qc === 'PERLU_PERBAIKAN'
                                          ? 'bg-rose-700 hover:bg-rose-800 text-white font-bold'
                                          : 'bg-teal-700 hover:bg-teal-800 text-white font-semibold'
                                      }`}
                                    >
                                      <i className={`fa-solid ${
                                        qc === 'MENUNGGU_QC' ? 'fa-stamp text-slate-950' : 
                                        qc === 'PERLU_INSPEKSI' ? 'fa-clipboard-check text-slate-950' :
                                        qc === 'PERLU_PERBAIKAN' ? 'fa-wrench text-white' : 'fa-circle-check text-white'
                                      } text-[9px]`}></i>
                                      <span>
                                        {qc === 'MENUNGGU_QC' ? 'Inspeksi QC (Perlu Cek)' : 
                                         qc === 'PERLU_INSPEKSI' ? 'Inspeksi QC (Perlu Cek)' : 
                                         qc === 'PERLU_PERBAIKAN' ? 'Re-Inspeksi Teknisi' : 'Inspeksi QC (Lolos)'}
                                      </span>
                                    </button>
                                  ) : (
                                    <div className="text-center text-[9px] text-slate-400 italic py-0.5">
                                      <i className="fa-solid fa-lock mr-1 text-slate-300 text-[8px]"></i> Khusus QC
                                    </div>
                                  )}

                                  <div className="flex items-center space-x-1 pt-0.5">
                                    {qc === 'PERLU_PERBAIKAN' && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => openModal('modalMaintenance', { roomId: room.id })}
                                          className="flex-1 py-1 px-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded text-[9px] font-bold transition flex items-center justify-center space-x-1 cursor-pointer"
                                          title="Laporkan tiket perbaikan fasilitas ke tim teknisi"
                                        >
                                          <i className="fa-solid fa-plus text-[8px]"></i>
                                          <span>Tiket</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setActiveTab('laporanMaintenance')}
                                          className="flex-1 py-1 px-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[9px] font-bold transition flex items-center justify-center space-x-1 cursor-pointer"
                                          title="Buka laporan perawatan fasilitas"
                                        >
                                          <i className="fa-solid fa-screwdriver-wrench text-[8px]"></i>
                                          <span>Perawatan</span>
                                        </button>
                                      </>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedBuilding(bName);
                                        setActiveTab('gedung');
                                      }}
                                      className="flex-1 py-1 px-1 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-[9px] font-bold transition flex items-center justify-center space-x-1 cursor-pointer"
                                      title="Buka lokasi kamar di denah manajemen gedung"
                                    >
                                      <i className="fa-solid fa-door-open text-[8px] text-hajj-700"></i>
                                      <span>Denah Gedung</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: INSPECTION AUDIT HISTORY */}
      {activeSubTab === 'HISTORY' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center">
              <i className="fa-solid fa-list-check text-teal-600 mr-2"></i>
              Buku Log Inspeksi Mutu & Kesiapan Kamar (QC Audit Trail)
            </h3>
            <span className="text-[11px] text-slate-500">Total {qcInspections.length} pemeriksaan tercatat</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 uppercase text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Waktu Inspeksi</th>
                  <th className="p-3">Kamar / Fasilitas</th>
                  <th className="p-3">Pemeriksa QC</th>
                  <th className="p-3">Kebersihan</th>
                  <th className="p-3">Linen & Sprei</th>
                  <th className="p-3">AC & Listrik</th>
                  <th className="p-3">Sanitasi & Air</th>
                  <th className="p-3">Amenities</th>
                  <th className="p-3 text-center">Hasil QC</th>
                  <th className="p-3">Catatan Temuan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {qcInspections.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">{item.inspectionDate}</td>
                    <td className="p-3 font-bold text-slate-800">
                      {item.roomNumber}
                      <span className="block text-[10px] font-normal text-slate-400">{item.building}</span>
                    </td>
                    <td className="p-3 font-medium text-slate-800">{item.inspectorName}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.cleanliness === 'BAIK' ? 'bg-emerald-100 text-emerald-800' :
                        item.cleanliness === 'CUKUP' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {item.cleanliness}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.linenBed === 'LENGKAP_BERSIH' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {item.linenBed === 'LENGKAP_BERSIH' ? 'Bersih' : 'Perlu Ganti'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.acElectricity === 'NORMAL' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {item.acElectricity}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.plumbingWater === 'LANCAR' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {item.plumbingWater}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.amenities === 'LENGKAP' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {item.amenities}
                      </span>
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {item.result === 'LOLOS_QC' ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <i className="fa-solid fa-check mr-1 text-emerald-600"></i> LOLOS QC
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-red-100 text-red-800 border border-red-300">
                          <i className="fa-solid fa-wrench mr-1 text-red-600"></i> PERLU PERBAIKAN
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-slate-600 max-w-xs truncate" title={item.notes}>
                      {item.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
