import React, { useState, useMemo } from 'react';
import { useAppContext, isPetugasGedungRole, isQcRole } from '../store';
import { Room, MeetingRoom, CleaningLog, Building } from '../types';
import { formatIndonesianDate, formatRupiah, compareBuildingOrder, isMeetingFacility, resolveRoomBuildingName } from '../lib/utils';

export function BuildingStaffView() {
  const { 
    rooms = [], meetingRooms = [], buildings = [], cleaningLogs = [], 
    addCleaningLog, updateCleaningLogStatus, updateRoom, updateMeetingRoom, 
    currentUser, showToast, openModal 
  } = useAppContext();

  const [activeTab, setActiveTab] = useState<'TASKS' | 'HISTORY'>('TASKS');
  const [bFilter, setBFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal State for Cleaning Proof Submission
  const [isCleaningModalOpen, setIsCleaningModalOpen] = useState(false);
  const [targetItem, setTargetItem] = useState<{ id: string; number: string; building: string; type: 'ROOM' | 'MEETING' } | null>(null);
  const [cleaningNotes, setCleaningNotes] = useState('');
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [simulatedPhotoIndex, setSimulatedPhotoIndex] = useState(0);

  // Photo simulation samples with professional housekeeping cleaning proof
  const cleaningPhotoSamples = [
    'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80', // Clean hotel bed
    'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=800&q=80', // Clean bathroom
    'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80', // Clean room interior
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80', // Meeting hall clean
  ];

  const canClean = isPetugasGedungRole(currentUser?.role) || Boolean(currentUser && (currentUser.role === 'Super Admin' || currentUser.role === 'Admin'));
  const canInspectQc = isQcRole(currentUser?.role) || Boolean(currentUser && (currentUser.role === 'Super Admin' || currentUser.role === 'Admin'));

  // Combine lodging rooms and meeting rooms/halls for cleaning task management
  const allCleaningTasks = useMemo(() => {
    const list: Array<{
      id: string;
      number: string;
      building: string;
      type: 'ROOM' | 'MEETING';
      category: string;
      status: string;
      qcStatus?: string;
      lastCleaned?: string;
    }> = [];

    rooms.forEach(r => {
      list.push({
        id: r.id,
        number: r.roomNumber,
        building: r.building || 'Gedung A (Arafah)',
        type: 'ROOM',
        category: r.type || 'Standar',
        status: r.status,
        qcStatus: r.qcStatus || 'PERLU_INSPEKSI',
      });
    });

    meetingRooms.forEach(m => {
      list.push({
        id: m.id,
        number: m.code || m.name,
        building: m.building || 'Ruang Pertemuan / Aula',
        type: 'MEETING',
        category: m.category || 'SERBAGUNA',
        status: m.status,
        qcStatus: m.qcStatus || 'PERLU_INSPEKSI',
      });
    });

    return list;
  }, [rooms, meetingRooms]);

  const filteredTasks = useMemo(() => {
    return allCleaningTasks.filter(item => {
      if (bFilter !== 'ALL' && item.building.toLowerCase() !== bFilter.toLowerCase()) {
        if (!item.building.toLowerCase().includes(bFilter.toLowerCase())) return false;
      }
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'PERLU_INSPEKSI' && item.qcStatus !== 'PERLU_INSPEKSI' && !item.qcStatus) return false;
        if (statusFilter === 'MENUNGGU_QC' && item.qcStatus !== 'MENUNGGU_QC') return false;
        if (statusFilter === 'LOLOS_QC' && item.qcStatus !== 'LOLOS_QC') return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchNum = item.number.toLowerCase().includes(q);
        const matchBld = item.building.toLowerCase().includes(q);
        const matchCat = item.category.toLowerCase().includes(q);
        if (!matchNum && !matchBld && !matchCat) return false;
      }
      return true;
    });
  }, [allCleaningTasks, bFilter, statusFilter, searchQuery]);

  // Metrics
  const totalTasksCount = allCleaningTasks.length;
  const perluInspeksiCount = allCleaningTasks.filter(t => !t.qcStatus || t.qcStatus === 'PERLU_INSPEKSI').length;
  const menungguQcCount = allCleaningTasks.filter(t => t.qcStatus === 'MENUNGGU_QC').length;
  const lolosQcCount = allCleaningTasks.filter(t => t.qcStatus === 'LOLOS_QC').length;

  const handleOpenCleaningModal = (item: { id: string; number: string; building: string; type: 'ROOM' | 'MEETING' }) => {
    setTargetItem(item);
    setCleaningNotes('Pembersihan rutin pasca tamu check-out / penggunaan ruangan. Sprei diganti, kamar mandi disterilkan, lantai dipel dan sampah dibuang.');
    setPhotoUrlInput(cleaningPhotoSamples[0]);
    setSimulatedPhotoIndex(0);
    setIsCleaningModalOpen(true);
  };

  const handleVerifyCleaningSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetItem) return;

    const nowStr = new Date().toLocaleString('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'medium'
    });

    const newLog: CleaningLog = {
      id: `clean-${Date.now()}`,
      roomId: targetItem.type === 'ROOM' ? targetItem.id : undefined,
      meetingRoomId: targetItem.type === 'MEETING' ? targetItem.id : undefined,
      building: targetItem.building,
      roomNumber: targetItem.number,
      petugasId: currentUser?.id || 'petugas-1',
      petugasName: currentUser?.fullName || 'Petugas Gedung UPT',
      timestamp: nowStr,
      photoUrl: photoUrlInput || cleaningPhotoSamples[simulatedPhotoIndex],
      notes: cleaningNotes.trim() || 'Pembersihan steril selesai.',
      status: 'MENUNGGU_QC'
    };

    addCleaningLog(newLog);

    if (targetItem.type === 'ROOM') {
      const roomObj = rooms.find(r => r.id === targetItem.id);
      if (roomObj) {
        updateRoom({ ...roomObj, qcStatus: 'MENUNGGU_QC' });
      }
    } else {
      const mrObj = meetingRooms.find(m => m.id === targetItem.id);
      if (mrObj) {
        updateMeetingRoom({ ...mrObj, qcStatus: 'MENUNGGU_QC' });
      }
    }

    showToast(`Laporan pembersihan ${targetItem.number} berhasil dikirim dengan bukti foto ber-watermark waktu! Status beralih ke Menunggu QC.`, 'success');
    setIsCleaningModalOpen(false);
    setTargetItem(null);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-teal-900 via-hajj-900 to-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-teal-800/40">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gold-400/20 border border-gold-300/30 flex items-center justify-center text-gold-300 text-xl shadow-inner shrink-0">
            <i className="fa-solid fa-broom"></i>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base sm:text-lg font-extrabold tracking-wide text-white">
                Divisi Petugas Gedung &amp; Housekeeping SOP
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-gold-400 text-slate-950 uppercase shadow-xs">
                SOP Sterilisasi Ruangan
              </span>
            </div>
            <p className="text-xs text-teal-100 mt-1 max-w-2xl leading-relaxed">
              Manajemen tugas pembersihan kamar asrama haji, ruang serbaguna, dan aula pasca penggunaan. Dilengkapi bukti foto ber-watermark tanggal/jam otomatis serta verifikasi QC sebelum siap huni.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 self-stretch sm:self-auto justify-end">
          <button
            type="button"
            onClick={() => setActiveTab('TASKS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-2xs flex items-center space-x-2 cursor-pointer ${
              activeTab === 'TASKS' 
                ? 'bg-gold-400 text-slate-950 ring-2 ring-gold-300' 
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            <i className="fa-solid fa-list-check"></i>
            <span>Daftar Tugas &amp; Sterilisasi</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('HISTORY')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-2xs flex items-center space-x-2 cursor-pointer ${
              activeTab === 'HISTORY' 
                ? 'bg-gold-400 text-slate-950 ring-2 ring-gold-300' 
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            <i className="fa-solid fa-database"></i>
            <span>Database Log Pembersihan ({cleaningLogs.length})</span>
          </button>
        </div>
      </div>

      {/* KPI METRICS CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 flex items-center justify-center font-bold">
            <i className="fa-solid fa-building"></i>
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Total Unit / Fasilitas</span>
            <span className="text-base sm:text-lg font-extrabold text-slate-800 dark:text-white">{totalTasksCount} Unit</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 flex items-center justify-center font-bold">
            <i className="fa-solid fa-triangle-exclamation"></i>
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Perlu Inspeksi / Kotor</span>
            <span className="text-base sm:text-lg font-extrabold text-amber-600">{perluInspeksiCount} Unit</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 flex items-center justify-center font-bold">
            <i className="fa-solid fa-bell"></i>
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Menunggu QC</span>
            <span className="text-base sm:text-lg font-extrabold text-purple-700">{menungguQcCount} Unit</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center font-bold">
            <i className="fa-solid fa-circle-check"></i>
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Lolos QC / Ready</span>
            <span className="text-base sm:text-lg font-extrabold text-emerald-600">{lolosQcCount} Unit</span>
          </div>
        </div>
      </div>

      {/* TAB CONTENT 1: DAFTAR TUGAS & STERILISASI */}
      {activeTab === 'TASKS' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Filter Gedung:</span>
              <select
                value={bFilter}
                onChange={e => setBFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none cursor-pointer"
              >
                <option value="ALL">Semua Gedung &amp; Aula</option>
                {buildings.map(b => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
                <option value="Ruang Pertemuan / Aula">Ruang Pertemuan / Aula</option>
                <option value="Gedung Serbaguna (SG)">Gedung Serbaguna (SG)</option>
              </select>

              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 ml-2">Status QC:</span>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none cursor-pointer"
              >
                <option value="ALL">Semua Status Kebersihan</option>
                <option value="PERLU_INSPEKSI">⚠️ Perlu Inspeksi / Dibereskan</option>
                <option value="MENUNGGU_QC">🔔 Menunggu Verifikasi QC</option>
                <option value="LOLOS_QC">✅ Lolos QC (Steril / Ready)</option>
              </select>
            </div>

            <div className="relative w-full sm:w-64">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
              <input
                type="text"
                placeholder="Cari nomor kamar / aula..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>
          </div>

          {/* TABLE OF TASKS */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200">
              <thead className="bg-slate-100 dark:bg-slate-700/60 uppercase text-[10px] font-extrabold text-slate-500 dark:text-slate-400 tracking-wider">
                <tr>
                  <th className="p-3 rounded-l-xl">Gedung &amp; Ruangan</th>
                  <th className="p-3">Tipe / Kategori</th>
                  <th className="p-3">Status Hunian</th>
                  <th className="p-3">Status Housekeeping / QC</th>
                  <th className="p-3 text-right rounded-r-xl">Tindakan Petugas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-medium">
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400 space-y-1.5">
                      <i className="fa-solid fa-broom text-3xl text-slate-300"></i>
                      <p className="font-bold text-slate-600 dark:text-slate-300 text-sm">Tidak ada tugas pembersihan ditemukan</p>
                      <p className="text-[11px] text-slate-400">Semua kamar atau ruangan sudah bersih dan steril.</p>
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map(item => {
                    let qcBadge = null;
                    if (item.qcStatus === 'LOLOS_QC') {
                      qcBadge = <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">✅ Lolos QC (Steril)</span>;
                    } else if (item.qcStatus === 'MENUNGGU_QC') {
                      qcBadge = <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 animate-pulse">🔔 Menunggu Verifikasi QC</span>;
                    } else {
                      qcBadge = <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">⚠️ Perlu Inspeksi / Kotor</span>;
                    }

                    return (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition">
                        <td className="p-3">
                          <div className="font-extrabold text-slate-900 dark:text-white flex items-center space-x-2">
                            <i className={`fa-solid ${item.type === 'ROOM' ? 'fa-door-open text-teal-600' : 'fa-landmark text-amber-600'}`}></i>
                            <span>{item.building} • {item.type === 'ROOM' ? `Kamar ${item.number}` : item.number}</span>
                          </div>
                        </td>
                        <td className="p-3 text-slate-500">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold">
                            {item.category}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.status === 'TERISI' ? 'bg-rose-100 text-rose-800' :
                            item.status === 'READY' || item.status === 'KOSONG' ? 'bg-emerald-100 text-emerald-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="p-3">
                          {qcBadge}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenCleaningModal({ id: item.id, number: item.number, building: item.building, type: item.type })}
                            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-2xs transition flex items-center space-x-1.5 ml-auto cursor-pointer"
                          >
                            <i className="fa-solid fa-camera"></i>
                            <span>Selesai Dibereskan &amp; Unggah Foto</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: DATABASE LOG PEMBERSIHAN */}
      {activeTab === 'HISTORY' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
            <div>
              <h3 className="font-bold text-sm text-slate-800 dark:text-white">
                Riwayat Database Laporan Pembersihan &amp; Bukti Foto Petugas Gedung
              </h3>
              <p className="text-xs text-slate-500">
                Arsip lengkap seluruh aktivitas sterilisasi kamar dan aula beserta watermark waktu dan nama petugas.
              </p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-teal-50 text-teal-800 border border-teal-200">
              Total Arsip: {cleaningLogs.length} Laporan
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200">
              <thead className="bg-slate-100 dark:bg-slate-700/60 uppercase text-[10px] font-extrabold text-slate-500 dark:text-slate-400 tracking-wider">
                <tr>
                  <th className="p-3 rounded-l-xl">Waktu Laporan</th>
                  <th className="p-3">Gedung &amp; Ruangan</th>
                  <th className="p-3">Petugas Pembersih</th>
                  <th className="p-3">Bukti Foto &amp; Catatan</th>
                  <th className="p-3 text-right rounded-r-xl">Status QC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-medium">
                {cleaningLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400 space-y-1.5">
                      <i className="fa-solid fa-folder-open text-3xl text-slate-300"></i>
                      <p className="font-bold text-slate-600 dark:text-slate-300 text-sm">Belum ada riwayat laporan pembersihan tersimpan</p>
                      <p className="text-[11px] text-slate-400">Laporan yang dikirim oleh petugas gedung akan tercatat otomatis di sini.</p>
                    </td>
                  </tr>
                ) : (
                  cleaningLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition">
                      <td className="p-3 font-mono text-slate-500 text-[11px]">
                        {log.timestamp}
                      </td>
                      <td className="p-3 font-bold text-slate-900 dark:text-white">
                        {log.building} • Kamar {log.roomNumber}
                      </td>
                      <td className="p-3">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{log.petugasName}</span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center space-x-3">
                          {log.photoUrl && (
                            <img 
                              src={log.photoUrl} 
                              alt="Bukti" 
                              className="w-12 h-10 object-cover rounded-lg border border-slate-200 shadow-2xs shrink-0 cursor-pointer hover:scale-105 transition"
                              onClick={() => window.open(log.photoUrl, '_blank')}
                              title="Klik untuk memperbesar foto bukti"
                            />
                          )}
                          <div className="text-[11px] text-slate-600 dark:text-slate-300 max-w-xs truncate">
                            {log.notes}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                          🔔 Menunggu Verifikasi QC
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL UPLOAD BUKTI FOTO & LAPORAN PEMBERSIHAN */}
      {isCleaningModalOpen && targetItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-slate-700 p-5 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 flex items-center justify-center font-bold">
                  <i className="fa-solid fa-camera"></i>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800 dark:text-white">
                    Konfirmasi Pembersihan &amp; Bukti Foto
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {targetItem.building} • {targetItem.type === 'ROOM' ? `Kamar ${targetItem.number}` : targetItem.number}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCleaningModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-xs"></i>
              </button>
            </div>

            <form onSubmit={handleVerifyCleaningSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Pilih Sampel Foto Bukti Sterilisasi (Watermark Otomatis):
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {cleaningPhotoSamples.map((url, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setPhotoUrlInput(url);
                        setSimulatedPhotoIndex(idx);
                      }}
                      className={`relative rounded-xl overflow-hidden border-2 cursor-pointer transition ${
                        photoUrlInput === url ? 'border-teal-600 ring-2 ring-teal-500' : 'border-slate-200 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <img src={url} alt="Sample" className="w-full h-24 object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-slate-950/70 text-white text-[9px] px-2 py-1 font-mono flex items-center justify-between">
                        <span>Bukti #{idx + 1}</span>
                        <span className="text-gold-300 font-bold">Terverifikasi</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Catatan Pembersihan Housekeeping:
                </label>
                <textarea
                  value={cleaningNotes}
                  onChange={e => setCleaningNotes(e.target.value)}
                  rows={3}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600 resize-none"
                  placeholder="Contoh: Penggantian sprei set baru, disinfeksi kamar mandi, penyemprotan ruangan..."
                ></textarea>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-[11px] text-amber-900 dark:text-amber-300 flex items-start space-x-2">
                <i className="fa-solid fa-circle-info text-amber-600 mt-0.5"></i>
                <div>
                  <span className="font-bold block">Watermark Tanggal &amp; Jam Otomatis:</span>
                  Sistem otomatis membubuhkan stempel waktu laporan serta ID petugas {currentUser?.fullName || 'Petugas'} pada basis data QC asrama haji.
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCleaningModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs shadow-md transition flex items-center space-x-2 cursor-pointer"
                >
                  <i className="fa-solid fa-paper-plane"></i>
                  <span>Kirim Laporan &amp; Minta QC</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
