import React, { useMemo, useState } from 'react';
import { useAppContext } from '../store';
import { formatIndonesianDate, formatRupiah } from '../lib/utils';
import { Transaction } from '../types';

const paymentLabel = (status?: string) => {
  if (status === 'LUNAS') return 'Lunas';
  if (status === 'DP') return 'DP';
  return 'Belum lunas';
};

const getPaidAmount = (transaction: Transaction) =>
  Number(transaction.paidAmount || transaction.alreadyPaid || transaction.dpAmount || 0);

export function FinanceReceiptsView() {
  const { transactions, rooms, openModal, showToast } = useAppContext();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('SEMUA');

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id-ID');
    return [...transactions]
      .filter((transaction) => {
        const status = transaction.paymentStatus || (transaction.isPaid ? 'LUNAS' : 'BELUM_LUNAS');
        if (statusFilter !== 'SEMUA' && status !== statusFilter) return false;
        if (!query) return true;
        return [
          transaction.kwitansiNo,
          transaction.guestName,
          transaction.groupName,
          transaction.id,
          transaction.roomNumber,
          transaction.building,
          transaction.spkNumber,
        ].some((value) => value?.toLocaleLowerCase('id-ID').includes(query));
      })
      .sort((a, b) => (b.paymentDate || b.createdAt || '').localeCompare(a.paymentDate || a.createdAt || ''));
  }, [transactions, search, statusFilter]);

  const receiptTransactions = transactions.filter((transaction) => {
    const status = transaction.paymentStatus || (transaction.isPaid ? 'LUNAS' : 'BELUM_LUNAS');
    return status === 'LUNAS' || status === 'DP';
  });
  const totalReceived = receiptTransactions.reduce((sum, transaction) => sum + getPaidAmount(transaction), 0);
  const totalOutstanding = transactions.reduce((sum, transaction) => {
    const total = Number(transaction.totalAmount || transaction.totalPrice || 0);
    return sum + Math.max(0, total - getPaidAmount(transaction));
  }, 0);

  const openReceipt = (transaction: Transaction) => {
    const status = transaction.paymentStatus || (transaction.isPaid ? 'LUNAS' : 'BELUM_LUNAS');
    const receiptData = { transaction, room: rooms.find((room) => room.id === transaction.roomId) };
    if (status !== 'LUNAS' && status !== 'DP') {
      showToast('Kwitansi belum dapat diterbitkan sebelum ada pembayaran. Silakan catat pembayaran melalui invoice.', 'warning');
      openModal('modalInvoice', { ...receiptData, autoOpenPaymentModal: true });
      return;
    }
    openModal('modalKwitansi', receiptData);
  };

  return (
    <section className="space-y-4 sm:space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">Divisi Keuangan</p>
            <h1 className="text-xl font-black text-slate-900 dark:text-white sm:text-2xl">Kwitansi & Penerimaan</h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500 dark:text-slate-400 sm:text-sm">Kelola bukti pembayaran, pantau status pelunasan, dan buka dokumen kwitansi resmi per transaksi.</p>
          </div>
          <div className="flex items-center gap-2 self-start rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
            <i className="fa-solid fa-receipt" aria-hidden="true" />
            <span>{receiptTransactions.length} transaksi dibayar</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Total diterima</p>
          <p className="mt-2 text-lg font-black text-emerald-950 dark:text-emerald-100">{formatRupiah(totalReceived)}</p>
        </article>
        <article className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
          <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">Kwitansi terbit (Lunas + DP)</p>
          <p className="mt-2 text-lg font-black text-blue-950 dark:text-blue-100">{receiptTransactions.length} transaksi</p>
        </article>
        <article className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Sisa piutang</p>
          <p className="mt-2 text-lg font-black text-amber-950 dark:text-amber-100">{formatRupiah(totalOutstanding)}</p>
        </article>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white">Rincian transaksi & kwitansi</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Informasi pembayaran, nilai transaksi, dan nomor kwitansi.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative">
              <span className="sr-only">Cari transaksi atau nomor kwitansi</span>
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari kwitansi, nama, kamar..." className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white sm:w-64" />
            </label>
            <label>
              <span className="sr-only">Filter status pembayaran</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white sm:w-40">
                <option value="SEMUA">Semua status</option>
                <option value="LUNAS">Lunas</option>
                <option value="DP">DP</option>
                <option value="BELUM_LUNAS">Belum lunas</option>
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-bold">Kwitansi / tanggal bayar</th>
                <th className="px-4 py-3 font-bold">Penyewa / instansi</th>
                <th className="px-4 py-3 font-bold">Lokasi</th>
                <th className="px-4 py-3 text-right font-bold">Nilai transaksi</th>
                <th className="px-4 py-3 text-right font-bold">Dibayar / sisa</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 text-right font-bold">Dokumen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTransactions.map((transaction) => {
                const paid = getPaidAmount(transaction);
                const total = Number(transaction.totalAmount || transaction.totalPrice || 0);
                const remaining = Math.max(0, total - paid);
                const status = transaction.paymentStatus || (transaction.isPaid ? 'LUNAS' : 'BELUM_LUNAS');
                const hasReceipt = status === 'LUNAS' || status === 'DP';
                return (
                  <tr key={transaction.id} className="align-top transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3.5">
                      <p className="font-mono font-bold text-slate-800 dark:text-slate-100">{transaction.kwitansiNo || 'Belum diterbitkan'}</p>
                      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{transaction.paymentDate ? formatIndonesianDate(transaction.paymentDate) : 'Tanggal pembayaran belum dicatat'}</p>
                      <p className="mt-1 text-[10px] text-slate-400">ID: {transaction.id}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-slate-800 dark:text-slate-100">{transaction.groupName || transaction.guestName || '—'}</p>
                      {transaction.groupName && transaction.guestName && <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">PIC: {transaction.guestName}</p>}
                      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">SPK: {transaction.spkNumber || '—'}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-slate-700 dark:text-slate-200">{transaction.building || '—'}</p>
                      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{transaction.roomNumber || transaction.rentAulaName || '—'}</p>
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold text-slate-800 dark:text-slate-100">{formatRupiah(total)}</td>
                    <td className="px-4 py-3.5 text-right">
                      <p className="font-bold text-emerald-700 dark:text-emerald-400">{formatRupiah(paid)}</p>
                      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Sisa {formatRupiah(remaining)}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${status === 'LUNAS' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' : status === 'DP' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'}`}>{paymentLabel(status)}</span>
                      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{transaction.paymentMethod || transaction.dpMethod || '—'}</p>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button type="button" onClick={() => openReceipt(transaction)} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-bold text-white transition ${hasReceipt ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-slate-600 hover:bg-slate-700'}`} aria-label={`${hasReceipt ? 'Buka kwitansi' : 'Catat pembayaran'} untuk ${transaction.groupName || transaction.guestName}`}>
                        <i className={`fa-solid ${hasReceipt ? 'fa-receipt' : 'fa-money-bill-wave'}`} aria-hidden="true" />
                        {hasReceipt ? 'Buka kwitansi' : 'Catat bayar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredTransactions.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">Tidak ada transaksi yang sesuai dengan filter.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-200 px-4 py-3 text-[10px] text-slate-500 dark:border-slate-700 dark:text-slate-400">Menampilkan {filteredTransactions.length} dari {transactions.length} transaksi.</div>
      </div>
    </section>
  );
}
