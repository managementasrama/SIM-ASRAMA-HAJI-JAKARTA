import React, { useState, useMemo } from 'react';
import { BuildingStat } from './BuildingOccupancySection';
import { Room, Transaction, Maintenance } from '../../types';
import { formatIndonesianDate, formatRupiah } from '../../lib/utils';
import { useBodyScrollLock } from '../../lib/scrollLock';

interface BuildingDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  building: BuildingStat | null;
  rooms: Room[];
  transactions: Transaction[];
  maintenances: Maintenance[];
  onOpenRoomDetail?: (roomId: string) => void;
  onGoToFloorPlan?: (buildingName: string) => void;
}

export function BuildingDetailModal({
  isOpen,
  onClose,
  building,
  rooms,
  transactions,
  maintenances,
  onOpenRoomDetail,
  onGoToFloorPlan,
}: BuildingDetailModalProps) {
  useBodyScrollLock(isOpen);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'TERISI' | 'BOOKED' | 'KOSONG' | 'MAINTENANCE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter kamar yang ada di gedung ini
  const buildingRooms = useMemo(() => {
    if (!building) return [];
    const bName = building.name.toLowerCase();
    return rooms.filter(r => {
      const rBld = (r.building || '').toLowerCase();
      if (bName.includes('pertemuan') || bName.includes('aula')) {
        return rBld.includes('pertemuan') || rBld.includes('aula') || r.type?.toLowerCase().includes('pertemuan') || r.type?.toLowerCase().includes('aula');
      }
      if (bName.includes('serbaguna')) {
        return rBld.includes('serbaguna') || r.type?.toLowerCase().includes('serbaguna');
      }
      return rBld === bName || rBld.includes(bName);
    }).sort((a, b) => (a.roomNumber || '').localeCompare(b.roomNumber || '', undefined, { numeric: true }));
  }, [building, rooms]);

  // Transaksi aktif di gedung ini
  const activeBuildingTxs = useMemo(() => {
    if (!building) return [];
    const roomIds = new Set(buildingRooms.map(r => r.id));
    return transactions.filter(t => roomIds.has(t.roomId) && (t.status === 'TERISI' || t.status === 'BOOKED'));
  }, [building, buildingRooms, transactions]);

  // Filtered rooms berdasarkan status & search
  const filteredRooms = useMemo(() => {
    return buildingRooms.filter(r => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNum = (r.roomNumber || '').toLowerCase().includes(q);
        const matchType = (r.type || '').toLowerCase().includes(q);
        const matchBed = (r.bedType || '').toLowerCase().includes(q);
        return matchNum || matchType || matchBed;
      }
      return true;
    });
  }, [buildingRooms, statusFilter, searchQuery]);

  if (!isOpen || !building) return null;

  const isAula = building.isAula || building.name.includes('Pertemuan') || building.name.includes('Aula') || building.name.includes('Serbaguna');

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto overflow-x-hidden animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-100 dark:border-slate-700 flex flex-col max-h-[92vh] my-auto min-w-0">
        {/* Header */}
        <div className="bg-gradient-to-r from-hajj-800 to-hajj-900 px-5 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center text-lg text-gold-300 shrink-0">
              <i className={`fa-solid ${building.icon}`}></i>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-base text-white truncate">
                  {building.shortName}
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-gold-200 border border-white/20">
                  {isAula ? 'Fasilitas Pertemuan & Acara' : 'Gedung Penginapan'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 truncate">
                Rincian keterisian unit, status kamar, dan daftar tamu aktif
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="text-white/70 hover:text-white text-lg p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer shrink-0 ml-2" 
            title="Tutup Popup"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar text-xs">
          {/* KPI Mini Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Unit</span>
              <span className="text-lg font-black text-slate-900 dark:text-slate-100">{building.total}</span>
              <span className="text-[9px] text-slate-400 block">{isAula ? 'Ruangan' : 'Kamar'}</span>
            </div>
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 text-center">
              <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block">Terisi</span>
              <span className="text-lg font-black text-emerald-900 dark:text-emerald-300">{building.occupied}</span>
              <span className="text-[9px] text-emerald-600 block">{building.occPercent}% Okupansi</span>
            </div>
            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800 text-center">
              <span className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-400 block">Booking</span>
              <span className="text-lg font-black text-blue-900 dark:text-blue-300">{building.reserved}</span>
              <span className="text-[9px] text-blue-600 block">Terjadwal</span>
            </div>
            <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 block">Kosong</span>
              <span className="text-lg font-black text-slate-800 dark:text-slate-200">{building.vacant}</span>
              <span className="text-[9px] text-slate-500 block">Siap Huni</span>
            </div>
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 text-center col-span-2 sm:col-span-1">
              <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400 block">Perbaikan</span>
              <span className="text-lg font-black text-amber-900 dark:text-amber-300">{building.maintenance}</span>
              <span className="text-[9px] text-amber-600 block">Maintenance</span>
            </div>
          </div>

          {/* Progress Bar Okupansi */}
          <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Tingkat Keterisian Gedung:
              </span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                {building.occupied} / {building.total} Unit ({building.occPercent}%)
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden flex">
              <div 
                className="bg-emerald-600 h-full transition-all duration-300"
                style={{ width: `${building.total > 0 ? (building.occupied / building.total) * 100 : 0}%` }}
                title={`Terisi: ${building.occupied}`}
              />
              <div 
                className="bg-blue-600 h-full transition-all duration-300"
                style={{ width: `${building.total > 0 ? (building.reserved / building.total) * 100 : 0}%` }}
                title={`Booking: ${building.reserved}`}
              />
              <div 
                className="bg-amber-500 h-full transition-all duration-300"
                style={{ width: `${building.total > 0 ? (building.maintenance / building.total) * 100 : 0}%` }}
                title={`Perbaikan: ${building.maintenance}`}
              />
            </div>
          </div>

          {/* Filter Status & Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 ${
                  statusFilter === 'ALL'
                    ? 'bg-slate-800 text-white dark:bg-slate-700'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                Semua ({buildingRooms.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('TERISI')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 ${
                  statusFilter === 'TERISI'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300'
                }`}
              >
                Terisi ({building.occupied})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('BOOKED')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 ${
                  statusFilter === 'BOOKED'
                    ? 'bg-blue-700 text-white'
                    : 'bg-blue-50 text-blue-800 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300'
                }`}
              >
                Booking ({building.reserved})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('KOSONG')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 ${
                  statusFilter === 'KOSONG'
                    ? 'bg-slate-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Kosong ({building.vacant})
              </button>
              {building.maintenance > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('MAINTENANCE')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 ${
                    statusFilter === 'MAINTENANCE'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300'
                  }`}
                >
                  Maint ({building.maintenance})
                </button>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Cari nomor kamar / tipe..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full sm:w-48 pl-7 pr-3 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500"
              />
              <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-2 text-slate-400 text-[10px]"></i>
            </div>
          </div>

          {/* Grid Kamar / Fasilitas */}
          <div>
            <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 mb-2 flex items-center justify-between">
              <span>Daftar {isAula ? 'Ruangan' : 'Kamar'} ({filteredRooms.length})</span>
              <span className="text-[10px] text-slate-400 font-normal">Klik kamar untuk rincian detail</span>
            </h4>

            {filteredRooms.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800">
                <i className="fa-solid fa-bed text-2xl mb-1 text-slate-300 block"></i>
                <p>Tidak ada kamar yang sesuai dengan filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                {filteredRooms.map(rm => {
                  const isTerisi = rm.status === 'TERISI';
                  const isBooked = rm.status === 'BOOKED';
                  const isMaint = rm.status === 'MAINTENANCE';

                  const badgeBg = isTerisi
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                    : isBooked
                    ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300'
                    : isMaint
                    ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300';

                  const cardBorder = isTerisi
                    ? 'border-emerald-300 dark:border-emerald-800 hover:border-emerald-500'
                    : isBooked
                    ? 'border-blue-300 dark:border-blue-800 hover:border-blue-500'
                    : isMaint
                    ? 'border-amber-300 dark:border-amber-800 hover:border-amber-500'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-400';

                  return (
                    <div
                      key={rm.id}
                      onClick={() => {
                        if (onOpenRoomDetail) {
                          onOpenRoomDetail(rm.id);
                        }
                      }}
                      className={`p-2.5 rounded-xl border bg-white dark:bg-slate-800/90 ${cardBorder} shadow-2xs hover:shadow-sm transition cursor-pointer space-y-1.5 flex flex-col justify-between`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs text-slate-900 dark:text-slate-100">
                          {rm.roomNumber}
                        </span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${badgeBg}`}>
                          {rm.status}
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        <span>{rm.type || 'Standar'}</span>
                        {rm.bedType && <span className="block text-[9.5px] text-slate-400 truncate">{rm.bedType}</span>}
                      </div>

                      <div className="pt-1 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-[9px] text-slate-400">
                        <span>Lt. {rm.floor || 1}</span>
                        {rm.qcStatus === 'LOLOS_QC' ? (
                          <span className="text-teal-600 dark:text-teal-400 font-semibold flex items-center gap-0.5">
                            <i className="fa-solid fa-check text-[8px]"></i> QC
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">Perlu QC</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tamu Aktif Saat Ini di Gedung ini */}
          {activeBuildingTxs.length > 0 && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 mb-2 flex items-center space-x-1.5">
                <i className="fa-solid fa-users text-blue-600"></i>
                <span>Tamu &amp; Reservasi Aktif ({activeBuildingTxs.length})</span>
              </h4>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
                {activeBuildingTxs.map(tx => (
                  <div
                    key={tx.id}
                    className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <span>{tx.guestName}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium">
                          Kamar {tx.roomNumber}
                        </span>
                      </div>
                      <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                        {formatIndonesianDate(tx.startDate)} ({tx.duration} {tx.durationUnit || 'Malam'})
                        {tx.kloter && tx.kloter !== '-' && ` • Kloter ${tx.kloter}`}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      tx.status === 'TERISI' 
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                    }`}>
                      {tx.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer with Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              if (onGoToFloorPlan) {
                onGoToFloorPlan(building.name);
              }
            }}
            className="px-4 py-2 bg-hajj-700 hover:bg-hajj-800 text-white font-bold rounded-xl text-xs flex items-center space-x-2 transition cursor-pointer shadow-xs"
          >
            <i className="fa-solid fa-map-location-dot text-gold-300"></i>
            <span>Buka Denah Visual Gedung Ini →</span>
          </button>
          
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-semibold rounded-xl text-xs hover:bg-slate-100 transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
