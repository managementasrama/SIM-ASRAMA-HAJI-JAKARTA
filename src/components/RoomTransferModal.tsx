import React, { useState, useEffect } from 'react';
import { useAppContext } from '../store';
import { Transaction, Room } from '../types';
import { useBodyScrollLock } from '../lib/scrollLock';

interface RoomTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  room: Room | null;
}

export const RoomTransferModal: React.FC<RoomTransferModalProps> = ({
  isOpen,
  onClose,
  transaction,
  room,
}) => {
  useBodyScrollLock(isOpen);
  const { buildings, rooms, transferRoom, showToast } = useAppContext();

  const [selectedBuilding, setSelectedBuilding] = useState<string>('');
  const [selectedTargetRoomId, setSelectedTargetRoomId] = useState<string>('');
  const [transferNotes, setTransferNotes] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      if (room) {
        setSelectedBuilding(room.building);
      } else if (buildings.length > 0) {
        setSelectedBuilding(buildings[0].name);
      }
      setSelectedTargetRoomId('');
      setTransferNotes('');
    }
  }, [isOpen, room, buildings]);

  if (!isOpen || !transaction) return null;

  // Filter available rooms in selected building (status === 'KOSONG' and not current room)
  const availableRooms = rooms.filter(r => {
    if (!r) return false;
    const matchesBld = r.building.toLowerCase() === selectedBuilding.toLowerCase();
    const isNotCurrent = room ? r.id !== room.id && r.roomNumber !== room.roomNumber : true;
    const isFree = r.status === 'KOSONG';
    return matchesBld && isNotCurrent && isFree;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetRoomId) {
      showToast('Silakan pilih kamar tujuan terlebih dahulu.', 'warning');
      return;
    }

    const targetRoom = rooms.find(r => r.id === selectedTargetRoomId);
    if (!targetRoom) {
      showToast('Kamar tujuan tidak ditemukan.', 'error');
      return;
    }

    transferRoom(transaction.id, targetRoom.id, transferNotes);
    showToast(`Berhasil memindahkan tamu ${transaction.guestName} ke ${targetRoom.building} Kamar ${targetRoom.roomNumber}.`, 'success');
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 flex flex-col my-auto animate-in fade-in zoom-in duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-hajj-800 to-hajj-900 px-4 py-3 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-gold-300 border border-white/10">
              <i className="fa-solid fa-right-left"></i>
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Fitur Pindah Kamar</h3>
              <p className="text-xs text-hajj-200">Pindahkan tamu lengkap ke gedung dan kamar lain</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Current Info */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1.5">
            <div className="flex justify-between font-bold text-slate-800">
              <span>Nama Tamu: {transaction.guestName}</span>
              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Kloter {transaction.kloter || '-'}</span>
            </div>
            <div className="text-slate-600">
              <span className="font-semibold">Kamar Asal:</span> {room ? `${room.building} - Kamar ${room.roomNumber}` : `${transaction.building} - Kamar ${transaction.roomNumber}`}
            </div>
          </div>

          {/* Minimal Dropdowns: Gedung & Kamar */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Pilih Gedung Tujuan <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedBuilding}
                onChange={(e) => {
                  setSelectedBuilding(e.target.value);
                  setSelectedTargetRoomId('');
                }}
                required
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-hajj-600"
              >
                <option value="" disabled>-- Pilih Gedung --</option>
                {buildings.filter(b => b.status === 'AKTIF' && b.category !== 'SERBAGUNA' && b.category !== 'RUANG_PERTEMUAN').map(b => (
                  <option key={b.id || b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Pilih Kamar Kosong Tujuan <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedTargetRoomId}
                onChange={(e) => setSelectedTargetRoomId(e.target.value)}
                required
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-hajj-600"
              >
                <option value="" disabled>
                  {availableRooms.length === 0 ? '-- Tidak ada kamar kosong di gedung ini --' : '-- Pilih Kamar Kosong --'}
                </option>
                {availableRooms.map(r => (
                  <option key={r.id} value={r.id}>
                    Kamar {r.roomNumber} ({r.type || 'Standar'} • Lt.{r.floor || 1} • {r.capacity || '4 Orang'} • Rp {r.pricePerNight?.toLocaleString('id-ID')}/mlm)
                  </option>
                ))}
              </select>
              {availableRooms.length === 0 && selectedBuilding && (
                <p className="text-[11px] text-amber-600 mt-1">
                  Perhatian: Semua kamar di gedung {selectedBuilding} saat ini sedang terisi atau dalam perawatan.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Catatan / Alasan Pindah (Opsional)
              </label>
              <textarea
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                rows={2}
                placeholder="Contoh: Permintaan tamu pindah ke lantai lebih rendah / kendala AC kamar asal..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-hajj-600 resize-none"
              ></textarea>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!selectedTargetRoomId || availableRooms.length === 0}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-right-left"></i>
              <span>Konfirmasi Pindah Kamar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
