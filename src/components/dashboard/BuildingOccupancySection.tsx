import React, { useState } from 'react';

export interface BuildingStat {
  name: string;
  shortName: string;
  total: number;
  occupied: number;
  reserved: number;
  vacant: number;
  maintenance: number;
  occPercent: number;
  icon: string;
  isAula?: boolean;
  minPrice?: number;
  maxPrice?: number;
  priceLabel?: string;
  totalPax?: number;
  capacityDesc?: string;
}

interface BuildingOccupancySectionProps {
  buildingStats: BuildingStat[];
  totalKamar: number;
  terisiKamar: number;
  bookedKamar: number;
  kosongKamar: number;
  maintKamar: number;
  occupancyPercent: number;
  setSelectedBuilding: (building: string) => void;
  setActiveTab: (tab: string) => void;
}

export function BuildingOccupancySection({
  buildingStats,
  totalKamar,
  terisiKamar,
  bookedKamar,
  kosongKamar,
  maintKamar,
  occupancyPercent,
  setSelectedBuilding,
  setActiveTab,
}: BuildingOccupancySectionProps) {
  const [bCategoryFilter, setBCategoryFilter] = useState<'ALL' | 'RESIDENTIAL' | 'AULA'>('ALL');

  const filteredBuildings = buildingStats.filter(b => {
    const isAula = b.name.includes('Pertemuan') || b.name.includes('Aula');
    if (bCategoryFilter === 'RESIDENTIAL') return !isAula;
    if (bCategoryFilter === 'AULA') return isAula;
    return true;
  });

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs p-4 sm:p-5 h-full flex flex-col justify-between space-y-4">
      <div className="space-y-3.5">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-800 flex items-center justify-center font-bold text-base shadow-xs shrink-0">
              <i className="fa-solid fa-building"></i>
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Keterisian & Denah Per Gedung
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Monitoring visual okupansi {buildingStats.length} Gedung Asrama & Aula Terpadu
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <div 
              onClick={() => setActiveTab('gedung')}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer hover:shadow-xs transition ${
                maintKamar === 0
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300'
              }`}
              title="Klik untuk membuka denah visual interaktif"
            >
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${maintKamar === 0 ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${maintKamar === 0 ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              </span>
              <span>{maintKamar === 0 ? 'Prima' : `${maintKamar} Maint`}</span>
            </div>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => setBCategoryFilter('ALL')}
            className={`flex-1 py-1 px-2 rounded-lg transition cursor-pointer text-center ${
              bCategoryFilter === 'ALL'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Semua ({buildingStats.length})
          </button>
          <button
            type="button"
            onClick={() => setBCategoryFilter('RESIDENTIAL')}
            className={`flex-1 py-1 px-2 rounded-lg transition cursor-pointer text-center ${
              bCategoryFilter === 'RESIDENTIAL'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Asrama (A-D)
          </button>
          <button
            type="button"
            onClick={() => setBCategoryFilter('AULA')}
            className={`flex-1 py-1 px-2 rounded-lg transition cursor-pointer text-center ${
              bCategoryFilter === 'AULA'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Aula & Pertemuan
          </button>
        </div>

        {/* Global Complex Progress Strip */}
        <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-700/70 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-400 font-semibold">
              Okupansi Asrama Keseluruhan:
            </span>
            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
              {terisiKamar}/{totalKamar} Kamar ({occupancyPercent}%)
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden flex">
            <div 
              className="bg-emerald-600 h-full transition-all duration-500" 
              style={{ width: `${(terisiKamar / Math.max(1, totalKamar)) * 100}%` }} 
              title={`Terisi: ${terisiKamar}`}
            />
            <div 
              className="bg-blue-600 h-full transition-all duration-500" 
              style={{ width: `${(bookedKamar / Math.max(1, totalKamar)) * 100}%` }} 
              title={`Booking: ${bookedKamar}`}
            />
            <div 
              className="bg-amber-500 h-full transition-all duration-500" 
              style={{ width: `${(maintKamar / Math.max(1, totalKamar)) * 100}%` }} 
              title={`Maintenance: ${maintKamar}`}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
              <span>Terisi ({terisiKamar})</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
              <span>Booking ({bookedKamar})</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600"></span>
              <span>Kosong ({kosongKamar})</span>
            </span>
            {maintKamar > 0 && (
              <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                <span>Maint ({maintKamar})</span>
              </span>
            )}
          </div>
        </div>

        {/* Building Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-0.5">
          {filteredBuildings.map(b => {
            const isAula = b.name.includes('Pertemuan') || b.name.includes('Aula');
            return (
              <div 
                key={b.name} 
                onClick={() => {
                  setSelectedBuilding(b.name);
                  setActiveTab('gedung');
                }}
                className="p-3 bg-slate-50/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 space-y-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs cursor-pointer group"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-1.5 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    <i className={`fa-solid ${b.icon} text-slate-400 group-hover:text-blue-500 text-xs transition-colors shrink-0`}></i>
                    <span className="truncate">{b.shortName}</span>
                  </span>
                  <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 shrink-0">
                    {b.occupied}/{b.total} ({b.occPercent}%)
                  </span>
                </div>

                {/* Progress bar per building */}
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden flex">
                  <div 
                    className={`${isAula ? 'bg-purple-600' : 'bg-emerald-600'} h-full transition-all duration-500`} 
                    style={{ width: `${b.occPercent}%` }} 
                  />
                  <div 
                    className="bg-blue-600 h-full transition-all duration-500" 
                    style={{ width: `${b.total > 0 ? (b.reserved / b.total) * 100 : 0}%` }} 
                  />
                  <div 
                    className="bg-amber-500 h-full transition-all duration-500" 
                    style={{ width: `${b.total > 0 ? (b.maintenance / b.total) * 100 : 0}%` }} 
                  />
                </div>

                {/* Mini Room Status Pill Indicator & Pricing Info */}
                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-medium">
                      {b.occupied} Terisi
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 font-medium">
                      {b.vacant} Kosong
                    </span>
                    {b.maintenance > 0 && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-medium">
                        {b.maintenance} Maint
                      </span>
                    )}
                  </div>
                  <span className="text-hajj-700 dark:text-gold-400 font-bold group-hover:underline flex items-center space-x-0.5 transition shrink-0">
                    <span>Denah</span>
                    <span>→</span>
                  </span>
                </div>

                {/* Synced Price & Capacity Details */}
                {(b.priceLabel || b.capacityDesc) && (
                  <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[9.5px]">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 truncate max-w-[65%]" title={b.priceLabel}>
                      <i className="fa-solid fa-tag text-[9px] shrink-0 text-emerald-600"></i>
                      <span className="truncate">{b.priceLabel}</span>
                    </span>
                    {b.capacityDesc && (
                      <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 shrink-0" title={b.capacityDesc}>
                        <i className="fa-solid fa-users text-[9px] shrink-0 text-blue-500"></i>
                        <span>{b.capacityDesc}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Ringkasan */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span>Total: <strong className="text-slate-700 dark:text-slate-200 font-mono">{totalKamar} Kamar</strong></span>
          <span>•</span>
          <span>Okupansi: <strong className="text-emerald-700 dark:text-emerald-400 font-bold font-mono">{occupancyPercent}%</strong></span>
        </span>
        <button
          type="button"
          onClick={() => setActiveTab('gedung')}
          className="text-blue-700 dark:text-blue-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span>Buka Modul Denah Kamar →</span>
        </button>
      </div>
    </div>
  );
}

