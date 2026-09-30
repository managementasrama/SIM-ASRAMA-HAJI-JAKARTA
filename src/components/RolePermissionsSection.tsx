import React, { useState, useMemo } from 'react';
import { User, UserRole } from '../types';
import { isSuperAdmin, isKeuanganRole, isRecepRole, isQcRole, isTeknisiRole, isKoperasiRole } from '../store';

interface RolePermissionsSectionProps {
  currentUser: User | null;
  users: User[];
  onSwitchUser?: (user: User) => void;
  onOpenLaporanKwitansi?: () => void;
  onOpenGedungKamar?: () => void;
  showToast: (msg: string, type?: string) => void;
}

type DivisionKey = 'SEMUA' | 'KEUANGAN' | 'RESEPSIONIS' | 'QC' | 'TEKNISI' | 'KOPERASI' | 'ADMIN';
type AccessLevel = 'FULL' | 'CONDITIONAL' | 'READ_ONLY' | 'NO_ACCESS';

interface PermissionItem {
  id: string;
  name: string;
  category: 'KEUANGAN' | 'HUNIAN' | 'QC' | 'TEKNISI' | 'KONSUMSI' | 'SISTEM';
  description: string;
}

interface RoleDefinition {
  id: string;
  role: UserRole;
  divisionKey: DivisionKey;
  divisionName: string;
  defaultUserName: string;
  officialTitle: string;
  badgeColor: string;
  borderColor: string;
  bgColor: string;
  icon: string;
  summary: string;
  responsibilities: string[];
  kwitansiSpecialAuthority?: string;
  permissions: Record<string, AccessLevel>;
}

const PERMISSION_COLUMNS: PermissionItem[] = [
  { id: 'dashboard', name: 'Dashboard Operasional', category: 'SISTEM', description: 'Melihat ringkasan metrik hunian, status kamar, dan kalender reservasi.' },
  { id: 'gedung_kamar', name: 'Gedung & Kamar', category: 'HUNIAN', description: 'Melihat status fisik, tipe tempat tidur, dan denah lantai kamar.' },
  { id: 'checkin_booking', name: 'Check-In & Reservasi', category: 'HUNIAN', description: 'Melakukan check-in tamu individu, pendaftaran rombongan instansi, dan booking tanggal.' },
  { id: 'aula_acara', name: 'Sewa Ruang Pertemuan (Aula)', category: 'HUNIAN', description: 'Pemesanan dan operasional aula serbaguna / auditorium.' },
  { id: 'kwitansi_resmi', name: 'Cetak Kwitansi Ber-QR', category: 'KEUANGAN', description: 'Menerbitkan dan mengunduh Kwitansi Resmi Pelunasan / DP dengan QR code dan TTD sah.' },
  { id: 'catat_pembayaran', name: 'Catat Setoran / Pelunasan', category: 'KEUANGAN', description: 'Mencatat setoran uang muka (DP) dan pelunasan 100% tagihan sewa.' },
  { id: 'invoice_tagihan', name: 'Faktur Tagihan (Invoice)', category: 'KEUANGAN', description: 'Menerbitkan lembar faktur tagihan PNBP resmi untuk tamu dan instansi.' },
  { id: 'qc_inspeksi', name: 'Inspeksi & Rilis QC', category: 'QC', description: 'Melakukan checklist uji kelayakan kamar dan merilis status Lolos QC.' },
  { id: 'tiket_teknisi', name: 'Pemeliharaan & Tiket Teknisi', category: 'TEKNISI', description: 'Disposisi tiket perbaikan, eksekusi teknisi lapangan, dan update status selesai.' },
  { id: 'sarapan_katering', name: 'Katering & Sarapan Koperasi', category: 'KONSUMSI', description: 'Kelola katalog menu makanan dapur UPT dan pemrosesan pesanan konsumsi.' },
  { id: 'audit_trail', name: 'Log Audit & Verifikasi PDF', category: 'SISTEM', description: 'Melihat audit trail aktivitas petugas dan riwayat verifikasi keabsahan dokumen ber-QR.' },
  { id: 'kelola_akun_db', name: 'Kelola Akun & Basis Data', category: 'SISTEM', description: 'Otoritas menambah/edit petugas, backup, restore basis data, dan sinkronisasi Supabase.' }
];

const ROLES_CATALOG: RoleDefinition[] = [
  // --- DIVISI KEUANGAN & PERBENDAHARAAN ---
  {
    id: 'role-mgr-keuangan',
    role: 'Manager Keuangan',
    divisionKey: 'KEUANGAN',
    divisionName: 'Divisi Keuangan & Perbendaharaan',
    defaultUserName: 'H. Ahmad Fauzi, S.E., M.M.',
    officialTitle: 'Manager Keuangan / Perbendaharaan & PNBP',
    badgeColor: 'bg-gold-100 text-gold-950 border-gold-300 font-black',
    borderColor: 'border-gold-300 dark:border-gold-700',
    bgColor: 'bg-gold-50/40 dark:bg-gold-950/20',
    icon: 'fa-landmark-dome',
    summary: 'Pimpinan tertinggi penatausahaan keuangan dan kas masuk PNBP (Penerimaan Negara Bukan Pajak) di UPT Asrama Haji Jakarta.',
    responsibilities: [
      'Menetapkan dan mengawasi pelaksanaan tarif resmi PNBP sesuai ketentuan Kementerian.',
      'Otorisasi manajerial atas keabsahan seluruh lembar Kwitansi Pembayaran Resmi dan Invoice Tagihan.',
      'Rekonsiliasi arus kas masuk harian melalui Virtual Account Bank Mandiri & transfer bank persepsi.',
      'Penyusunan laporan pertanggungjawaban realisasi kas dan penagihan piutang belum lunas.'
    ],
    kwitansiSpecialAuthority: 'Otoritas Manajerial Penuh: Berhak mengesahkan penerbitan Kwitansi Pelunasan & DP, memverifikasi keabsahan nomor seri dokumen KWT/KHU-UPTAHJ/..., serta mengecek log audit unduh PDF finansial.',
    permissions: {
      dashboard: 'FULL',
      gedung_kamar: 'READ_ONLY',
      checkin_booking: 'READ_ONLY',
      aula_acara: 'READ_ONLY',
      kwitansi_resmi: 'FULL',
      catat_pembayaran: 'FULL',
      invoice_tagihan: 'FULL',
      qc_inspeksi: 'READ_ONLY',
      tiket_teknisi: 'READ_ONLY',
      sarapan_katering: 'READ_ONLY',
      audit_trail: 'FULL',
      kelola_akun_db: 'READ_ONLY'
    }
  },
  {
    id: 'role-bendahara',
    role: 'Bendahara / Keuangan',
    divisionKey: 'KEUANGAN',
    divisionName: 'Divisi Keuangan & Perbendaharaan',
    defaultUserName: 'Hj. Siti Aisyah, S.E. (NIP 19820412 200801 2 004)',
    officialTitle: 'Bendahara Penerimaan Resmi UPT Asrama Haji Jakarta',
    badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold',
    borderColor: 'border-emerald-300 dark:border-emerald-700',
    bgColor: 'bg-emerald-50/40 dark:bg-emerald-950/20',
    icon: 'fa-receipt',
    summary: 'Pejabat fungsional perbendaharaan resmi pemegang spesimen tanda tangan dan stempel digital pada lembar Kwitansi Pembayaran UPT.',
    responsibilities: [
      'Penerimaan dan verifikasi setoran kas dari tamu umum, jemaah haji, maupun instansi pemerintah.',
      'Penerbitan langsung Kwitansi Resmi ber-QR code sah untuk setiap pembayaran yang dinyatakan lunas atau DP.',
      'Monitoring rekening koran Virtual Account resmi UPT dan pencocokan bukti bayar transfer.',
      'Pemberian tanda lunas pada berkas tagihan invoice sebelum tamu atau rombongan melakukan check-out.'
    ],
    kwitansiSpecialAuthority: 'Pejabat Penandatangan Resmi: Nama dan NIP (19820412 200801 2 004) dicetak secara sah pada kolom Bendahara Penerimaan / Kasir di lembar Kwitansi Pelunasan dan Kwitansi Uang Muka (DP).',
    permissions: {
      dashboard: 'FULL',
      gedung_kamar: 'READ_ONLY',
      checkin_booking: 'READ_ONLY',
      aula_acara: 'READ_ONLY',
      kwitansi_resmi: 'FULL',
      catat_pembayaran: 'FULL',
      invoice_tagihan: 'FULL',
      qc_inspeksi: 'READ_ONLY',
      tiket_teknisi: 'READ_ONLY',
      sarapan_katering: 'READ_ONLY',
      audit_trail: 'FULL',
      kelola_akun_db: 'NO_ACCESS'
    }
  },
  {
    id: 'role-staff-keuangan',
    role: 'Staff Keuangan',
    divisionKey: 'KEUANGAN',
    divisionName: 'Divisi Keuangan & Perbendaharaan',
    defaultUserName: 'Rian Hidayat, A.Md. (NIP 19920824 201801 1 002)',
    officialTitle: 'Staf Keuangan / Kasir Operasional',
    badgeColor: 'bg-teal-100 text-teal-900 border-teal-300 font-semibold',
    borderColor: 'border-teal-300 dark:border-teal-700',
    bgColor: 'bg-teal-50/40 dark:bg-teal-950/20',
    icon: 'fa-wallet',
    summary: 'Petugas pelaksana loket kasir dan input transaksi pembayaran harian para tamu dan penyewa fasilitas.',
    responsibilities: [
      'Melayani penyewa di loket kasir untuk penerimaan bukti bayar transfer perbankan & Virtual Account.',
      'Menginput pencatatan setoran uang muka (DP) dan pelunasan sisa tagihan pada sistem aplikasi.',
      'Mencetak dan menyerahkan lembar Kwitansi Resmi serta Invoice Tagihan fisik maupun PDF kepada tamu.',
      'Melaporkan rekapitulasi setoran loket kasir harian kepada Bendahara Penerimaan.'
    ],
    kwitansiSpecialAuthority: 'Operator Kasir & Cetak: Berwenang membuka lembar Kwitansi, mencetak dokumen cetak PDF, mencatat rincian metode transfer/VA, dan menyerahkan tanda bukti kepada tamu.',
    permissions: {
      dashboard: 'FULL',
      gedung_kamar: 'READ_ONLY',
      checkin_booking: 'READ_ONLY',
      aula_acara: 'READ_ONLY',
      kwitansi_resmi: 'FULL',
      catat_pembayaran: 'FULL',
      invoice_tagihan: 'FULL',
      qc_inspeksi: 'NO_ACCESS',
      tiket_teknisi: 'NO_ACCESS',
      sarapan_katering: 'READ_ONLY',
      audit_trail: 'READ_ONLY',
      kelola_akun_db: 'NO_ACCESS'
    }
  },

  // --- DIVISI PELAYANAN & RESEPSIONIS ---
  {
    id: 'role-mgr-resepsionis',
    role: 'Manager Resepsionis',
    divisionKey: 'RESEPSIONIS',
    divisionName: 'Divisi Pelayanan & Resepsionis',
    defaultUserName: 'Dra. Hj. Nurul Hidayati',
    officialTitle: 'Manager Resepsionis & Front Office',
    badgeColor: 'bg-blue-100 text-blue-900 border-blue-300 font-bold',
    borderColor: 'border-blue-300 dark:border-blue-700',
    bgColor: 'bg-blue-50/40 dark:bg-blue-950/20',
    icon: 'fa-concierge-bell',
    summary: 'Pimpinan operasional pelayanan tamu, reservasi rombongan jemaah haji & instansi, serta alokasi gedung penginapan.',
    responsibilities: [
      'Mengatur alokasi gedung (Gedung Arafah, Muzdalifah, Mina, Madinah) untuk jemaah dan instansi.',
      'Memverifikasi registrasi rombongan akbar dan menandatangani invoice pemesanan akomodasi.',
      'Mengajukan penerbitan kwitansi ke divisi keuangan setelah bukti setoran terverifikasi.',
      'Menyetujui permintaan perpanjangan masa tinggal (extend) rombongan.'
    ],
    kwitansiSpecialAuthority: 'Akses Operasional Invoice & Kwitansi: Berhak menerbitkan faktur tagihan invoice, melihat pratinjau kwitansi, dan mengajukan validasi setoran ke Divisi Keuangan.',
    permissions: {
      dashboard: 'FULL',
      gedung_kamar: 'FULL',
      checkin_booking: 'FULL',
      aula_acara: 'FULL',
      kwitansi_resmi: 'CONDITIONAL',
      catat_pembayaran: 'CONDITIONAL',
      invoice_tagihan: 'FULL',
      qc_inspeksi: 'READ_ONLY',
      tiket_teknisi: 'READ_ONLY',
      sarapan_katering: 'READ_ONLY',
      audit_trail: 'READ_ONLY',
      kelola_akun_db: 'NO_ACCESS'
    }
  },
  {
    id: 'role-resepsionis',
    role: 'Resepsionis',
    divisionKey: 'RESEPSIONIS',
    divisionName: 'Divisi Pelayanan & Resepsionis',
    defaultUserName: 'Siti Rahmawati',
    officialTitle: 'Petugas Resepsionis / Front Desk Officer',
    badgeColor: 'bg-sky-100 text-sky-900 border-sky-300 font-medium',
    borderColor: 'border-sky-300 dark:border-sky-700',
    bgColor: 'bg-sky-50/40 dark:bg-sky-950/20',
    icon: 'fa-bell-concierge',
    summary: 'Garda depan pelayanan check-in, check-out, pencatatan identitas tamu, dan pembuatan tagihan invoice awal.',
    responsibilities: [
      'Melakukan registrasi tamu check-in, verifikasi KTP/identitas, dan serah terima kunci kamar.',
      'Mencetak invoice penagihan kamar, sewa aula, dan paket konsumsi untuk tamu.',
      'Mengarahkan tamu ke loket Divisi Keuangan untuk pelunasan atau pengambilan kwitansi sah.',
      'Melayani proses check-out kamar setelah memastikan status pembayaran lunas.'
    ],
    kwitansiSpecialAuthority: 'Akses Cetak Dokumen Tagihan: Berwenang mencetak invoice dan membuka lembar kwitansi untuk verifikasi kelunasan sebelum mengizinkan tamu check-out.',
    permissions: {
      dashboard: 'FULL',
      gedung_kamar: 'FULL',
      checkin_booking: 'FULL',
      aula_acara: 'FULL',
      kwitansi_resmi: 'READ_ONLY',
      catat_pembayaran: 'CONDITIONAL',
      invoice_tagihan: 'FULL',
      qc_inspeksi: 'NO_ACCESS',
      tiket_teknisi: 'NO_ACCESS',
      sarapan_katering: 'NO_ACCESS',
      audit_trail: 'NO_ACCESS',
      kelola_akun_db: 'NO_ACCESS'
    }
  },

  // --- DIVISI QUALITY CONTROL (QC) ---
  {
    id: 'role-mgr-qc',
    role: 'Manager QC',
    divisionKey: 'QC',
    divisionName: 'Divisi Pengawasan Mutu (QC)',
    defaultUserName: 'Ir. Bambang Tri',
    officialTitle: 'Manager Quality Control & Standar Fasilitas',
    badgeColor: 'bg-teal-100 text-teal-900 border-teal-300 font-bold',
    borderColor: 'border-teal-300 dark:border-teal-700',
    bgColor: 'bg-teal-50/40 dark:bg-teal-950/20',
    icon: 'fa-clipboard-check',
    summary: 'Penanggung jawab standarisasi kenyamanan, kebersihan, dan kelayakan seluruh kamar serta aula pertemuan.',
    responsibilities: [
      'Menetapkan standar kebersihan, kehigienisan linen, kelayakan AC, dan sanitasi per kamar.',
      'Memvalidasi hasil inspeksi staf QC dan merilis sertifikasi status "LOLOS QC" siap huni.',
      'Mendisposisikan laporan kamar rusak darurat ke Manager Teknisi untuk segera diperbaiki.',
      'Memantau kepuasan mutu akomodasi selama masa operasional haji dan diklat instansi.'
    ],
    permissions: {
      dashboard: 'FULL',
      gedung_kamar: 'FULL',
      checkin_booking: 'READ_ONLY',
      aula_acara: 'READ_ONLY',
      kwitansi_resmi: 'NO_ACCESS',
      catat_pembayaran: 'NO_ACCESS',
      invoice_tagihan: 'NO_ACCESS',
      qc_inspeksi: 'FULL',
      tiket_teknisi: 'CONDITIONAL',
      sarapan_katering: 'NO_ACCESS',
      audit_trail: 'READ_ONLY',
      kelola_akun_db: 'NO_ACCESS'
    }
  },
  {
    id: 'role-qc',
    role: 'Quality Control',
    divisionKey: 'QC',
    divisionName: 'Divisi Pengawasan Mutu (QC)',
    defaultUserName: 'Hendra Pratama',
    officialTitle: 'Petugas Quality Control Lapangan',
    badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-medium',
    borderColor: 'border-emerald-300 dark:border-emerald-700',
    bgColor: 'bg-emerald-50/40 dark:bg-emerald-950/20',
    icon: 'fa-check-double',
    summary: 'Inspektur teknis kebersihan kamar, kelengkapan sprei & linen steril, serta fungsi mekanikal/kelistrikan.',
    responsibilities: [
      'Melakukan inspeksi kamar pasca check-out dan memastikan pembersihan telah tuntas.',
      'Memeriksa 5 elemen mutu wajib: Kebersihan, Linen/Bedding, Kelistrikan/AC, Sanitasi Air, dan Fasilitas.',
      'Memberikan catatan inspeksi dan mengajukan tiket pemeliharaan jika ditemukan fasilitas rusak.'
    ],
    permissions: {
      dashboard: 'FULL',
      gedung_kamar: 'READ_ONLY',
      checkin_booking: 'NO_ACCESS',
      aula_acara: 'NO_ACCESS',
      kwitansi_resmi: 'NO_ACCESS',
      catat_pembayaran: 'NO_ACCESS',
      invoice_tagihan: 'NO_ACCESS',
      qc_inspeksi: 'FULL',
      tiket_teknisi: 'CONDITIONAL',
      sarapan_katering: 'NO_ACCESS',
      audit_trail: 'NO_ACCESS',
      kelola_akun_db: 'NO_ACCESS'
    }
  },

  // --- DIVISI TEKNISI & PEMELIHARAAN ---
  {
    id: 'role-mgr-teknisi',
    role: 'Manager Teknisi',
    divisionKey: 'TEKNISI',
    divisionName: 'Divisi Pemeliharaan Fasilitas & Teknisi',
    defaultUserName: 'Agus Setiawan, S.T.',
    officialTitle: 'Manager Pemeliharaan Fasilitas & Sarpras',
    badgeColor: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
    borderColor: 'border-amber-300 dark:border-amber-700',
    bgColor: 'bg-amber-50/40 dark:bg-amber-950/20',
    icon: 'fa-screwdriver-wrench',
    summary: 'Pimpinan tim teknisi, penanggung jawab kelistrikan, sistem pendingin AC, sanitasi air, dan lift gedung.',
    responsibilities: [
      'Menerima tiket keluhan kerusakan fasilitas dari Resepsionis dan inspeksi QC.',
      'Mendisposisikan penugasan teknisi pelaksana dengan penetapan urgensi (Normal/Urgent).',
      'Memverifikasi pekerjaan teknisi telah selesai dengan baik sebelum kamar dibuka kembali.',
      'Menerima notifikasi darurat (email & sistem) untuk perbaikan fasilitas kritikal.'
    ],
    permissions: {
      dashboard: 'FULL',
      gedung_kamar: 'READ_ONLY',
      checkin_booking: 'NO_ACCESS',
      aula_acara: 'READ_ONLY',
      kwitansi_resmi: 'NO_ACCESS',
      catat_pembayaran: 'NO_ACCESS',
      invoice_tagihan: 'NO_ACCESS',
      qc_inspeksi: 'READ_ONLY',
      tiket_teknisi: 'FULL',
      sarapan_katering: 'NO_ACCESS',
      audit_trail: 'READ_ONLY',
      kelola_akun_db: 'NO_ACCESS'
    }
  },
  {
    id: 'role-teknisi',
    role: 'Teknisi',
    divisionKey: 'TEKNISI',
    divisionName: 'Divisi Pemeliharaan Fasilitas & Teknisi',
    defaultUserName: 'Joko Susilo',
    officialTitle: 'Teknisi Sarana & Prasarana Lapangan',
    badgeColor: 'bg-orange-100 text-orange-900 border-orange-300 font-medium',
    borderColor: 'border-orange-300 dark:border-orange-700',
    bgColor: 'bg-orange-50/40 dark:bg-orange-950/20',
    icon: 'fa-wrench',
    summary: 'Eksekutor lapangan perbaikan AC, kelistrikan, genset, saluran air, dan perlengkapan gedung.',
    responsibilities: [
      'Mengambil tiket penugasan kerja perbaikan yang diberikan oleh Manager Teknisi.',
      'Melaksanakan perbaikan fisik kerusakan kamar atau fasilitas umum dengan cepat dan rapi.',
      'Mengisi catatan teknisi perbaikan dan mengonfirmasi penyelesaian tugas ke sistem.'
    ],
    permissions: {
      dashboard: 'FULL',
      gedung_kamar: 'READ_ONLY',
      checkin_booking: 'NO_ACCESS',
      aula_acara: 'NO_ACCESS',
      kwitansi_resmi: 'NO_ACCESS',
      catat_pembayaran: 'NO_ACCESS',
      invoice_tagihan: 'NO_ACCESS',
      qc_inspeksi: 'NO_ACCESS',
      tiket_teknisi: 'FULL',
      sarapan_katering: 'NO_ACCESS',
      audit_trail: 'NO_ACCESS',
      kelola_akun_db: 'NO_ACCESS'
    }
  },

  // --- DIVISI KOPERASI & KONSUMSI ---
  {
    id: 'role-mgr-koperasi',
    role: 'Manager Koperasi',
    divisionKey: 'KOPERASI',
    divisionName: 'Divisi Koperasi, Dapur & Konsumsi',
    defaultUserName: 'Hj. Fatimah, S.E.',
    officialTitle: 'Manager Koperasi, Dapur & Katering',
    badgeColor: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
    borderColor: 'border-amber-300 dark:border-amber-700',
    bgColor: 'bg-amber-50/40 dark:bg-amber-950/20',
    icon: 'fa-utensils',
    summary: 'Penanggung jawab operasional dapur UPT, penyediaan sarapan, snack box rapat aula, dan katering prasmanan.',
    responsibilities: [
      'Mengelola katalog menu makanan, ketersediaan bahan, dan penetapan harga per porsi.',
      'Memantau antrean pesanan sarapan jemaah dan jadwal pengiriman ke gedung kamar.',
      'Rekapitulasi total konsumsi dan penyesuaian tagihan dengan lembar invoice pemesanan.'
    ],
    permissions: {
      dashboard: 'FULL',
      gedung_kamar: 'READ_ONLY',
      checkin_booking: 'NO_ACCESS',
      aula_acara: 'READ_ONLY',
      kwitansi_resmi: 'NO_ACCESS',
      catat_pembayaran: 'NO_ACCESS',
      invoice_tagihan: 'READ_ONLY',
      qc_inspeksi: 'NO_ACCESS',
      tiket_teknisi: 'NO_ACCESS',
      sarapan_katering: 'FULL',
      audit_trail: 'NO_ACCESS',
      kelola_akun_db: 'NO_ACCESS'
    }
  },
  {
    id: 'role-koperasi',
    role: 'Petugas Koperasi',
    divisionKey: 'KOPERASI',
    divisionName: 'Divisi Koperasi, Dapur & Konsumsi',
    defaultUserName: 'Dewi Lestari',
    officialTitle: 'Petugas Dapur & Distribusi Konsumsi',
    badgeColor: 'bg-orange-100 text-orange-900 border-orange-300 font-medium',
    borderColor: 'border-orange-300 dark:border-orange-700',
    bgColor: 'bg-orange-50/40 dark:bg-orange-950/20',
    icon: 'fa-bowl-food',
    summary: 'Petugas pemrosesan pesanan makanan di dapur dan pengantaran sarapan ke kamar tamu/aula.',
    responsibilities: [
      'Melihat daftar pesanan sarapan dan katering aktif per kamar dan aula.',
      'Memproses penyiapan makanan dan memperbarui status pesanan menjadi DISAJIKAN.',
      'Mencatat kebutuhan diet khusus jemaah lansia atau pantangan medis.'
    ],
    permissions: {
      dashboard: 'FULL',
      gedung_kamar: 'READ_ONLY',
      checkin_booking: 'NO_ACCESS',
      aula_acara: 'NO_ACCESS',
      kwitansi_resmi: 'NO_ACCESS',
      catat_pembayaran: 'NO_ACCESS',
      invoice_tagihan: 'NO_ACCESS',
      qc_inspeksi: 'NO_ACCESS',
      tiket_teknisi: 'NO_ACCESS',
      sarapan_katering: 'FULL',
      audit_trail: 'NO_ACCESS',
      kelola_akun_db: 'NO_ACCESS'
    }
  },

  // --- ADMINISTRATOR & PIMPINAN ---
  {
    id: 'role-superadmin',
    role: 'Super Admin',
    divisionKey: 'ADMIN',
    divisionName: 'Pimpinan & Administrator Sistem',
    defaultUserName: 'H. Mochammad Hasan, S.Ag., M.Si.',
    officialTitle: 'Super Administrator / Kepala UPT Asrama Haji',
    badgeColor: 'bg-emerald-200 text-emerald-950 border-emerald-400 font-black',
    borderColor: 'border-emerald-400 dark:border-emerald-600',
    bgColor: 'bg-emerald-50/60 dark:bg-emerald-950/30',
    icon: 'fa-user-shield',
    summary: 'Otoritas tertinggi kendali sistem SIM Asrama Haji, audit keamanan, kelola semua divisi, dan perbaikan basis data.',
    responsibilities: [
      'Kendali penuh seluruh menu, modul, konfigurasi tarif, dan data master.',
      'Otorisasi pendaftaran akun petugas baru dan persetujuan reset kata sandi.',
      'Pengawasan integritas data, pencadangan basis data lokal, dan sinkronisasi cloud Supabase.',
      'Pemberian hak akses darurat dan audit log aktivitas sistem.'
    ],
    kwitansiSpecialAuthority: 'Akses Penuh Seluruh Dokumen: Memiliki izin tak terbatas untuk mencetak, memverifikasi, dan mengaudit seluruh kwitansi, invoice, serta log dokumen ber-QR.',
    permissions: {
      dashboard: 'FULL',
      gedung_kamar: 'FULL',
      checkin_booking: 'FULL',
      aula_acara: 'FULL',
      kwitansi_resmi: 'FULL',
      catat_pembayaran: 'FULL',
      invoice_tagihan: 'FULL',
      qc_inspeksi: 'FULL',
      tiket_teknisi: 'FULL',
      sarapan_katering: 'FULL',
      audit_trail: 'FULL',
      kelola_akun_db: 'FULL'
    }
  },
  {
    id: 'role-admin',
    role: 'Admin',
    divisionKey: 'ADMIN',
    divisionName: 'Pimpinan & Administrator Sistem',
    defaultUserName: 'Administrator Operasional',
    officialTitle: 'Administrator Sistem & Operasional',
    badgeColor: 'bg-slate-200 text-slate-900 border-slate-400 font-bold',
    borderColor: 'border-slate-300 dark:border-slate-600',
    bgColor: 'bg-slate-50 dark:bg-slate-800/40',
    icon: 'fa-gear',
    summary: 'Pengelola teknis harian sistem, pemantauan operasional, dan manajemen pengguna petugas.',
    responsibilities: [
      'Membantu supervisi seluruh aktivitas kerja divisi operasional.',
      'Mengelola daftar petugas, pengaturan hak akses, dan monitoring laporan.',
      'Memastikan seluruh sistem transaksi, kamar, dan katering berjalan lancar.'
    ],
    permissions: {
      dashboard: 'FULL',
      gedung_kamar: 'FULL',
      checkin_booking: 'FULL',
      aula_acara: 'FULL',
      kwitansi_resmi: 'FULL',
      catat_pembayaran: 'FULL',
      invoice_tagihan: 'FULL',
      qc_inspeksi: 'FULL',
      tiket_teknisi: 'FULL',
      sarapan_katering: 'FULL',
      audit_trail: 'FULL',
      kelola_akun_db: 'FULL'
    }
  }
];

export function RolePermissionsSection({
  currentUser,
  users,
  onSwitchUser,
  onOpenLaporanKwitansi,
  onOpenGedungKamar,
  showToast
}: RolePermissionsSectionProps) {
  const [selectedDivision, setSelectedDivision] = useState<DivisionKey>('SEMUA');
  const [viewMode, setViewMode] = useState<'KARTU' | 'MATRIKS' | 'FOKUS_KEUANGAN'>('KARTU');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedRoleKeys, setExpandedRoleKeys] = useState<Record<string, boolean>>({
    'role-mgr-keuangan': true,
    'role-bendahara': true
  });

  const toggleRoleExpand = (id: string) => {
    setExpandedRoleKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredRoles = useMemo(() => {
    return ROLES_CATALOG.filter(r => {
      if (selectedDivision !== 'SEMUA' && r.divisionKey !== selectedDivision) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchRole = r.role.toLowerCase().includes(q);
        const matchTitle = r.officialTitle.toLowerCase().includes(q);
        const matchDiv = r.divisionName.toLowerCase().includes(q);
        const matchName = r.defaultUserName.toLowerCase().includes(q);
        const matchSummary = r.summary.toLowerCase().includes(q);
        if (!matchRole && !matchTitle && !matchDiv && !matchName && !matchSummary) return false;
      }
      return true;
    });
  }, [selectedDivision, searchQuery]);

  const handleExportCSV = () => {
    const headers = ['Divisi', 'Nama Jabatan / Role', 'Pejabat Default', 'Tingkat Otoritas', ...PERMISSION_COLUMNS.map(c => c.name)];
    const rows = ROLES_CATALOG.map(r => {
      const perms = PERMISSION_COLUMNS.map(c => {
        const val = r.permissions[c.id];
        return val === 'FULL' ? 'Akses Penuh' : val === 'CONDITIONAL' ? 'Akses Terbatas' : val === 'READ_ONLY' ? 'Hanya Baca' : 'Tidak Diizinkan';
      });
      return [
        `"${r.divisionName}"`,
        `"${r.role}"`,
        `"${r.defaultUserName}"`,
        `"${r.officialTitle}"`,
        ...perms.map(p => `"${p}"`)
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Matriks_Hak_Akses_RBAC_UPT_Asrama_Haji_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Matriks Hak Akses & Otorisasi berhasil diekspor (CSV)!', 'success');
  };

  const renderBadge = (level: AccessLevel) => {
    switch (level) {
      case 'FULL':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-700 whitespace-nowrap">
            <i className="fa-solid fa-circle-check mr-1 text-[9px] text-emerald-600"></i>
            Akses Penuh
          </span>
        );
      case 'CONDITIONAL':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-700 whitespace-nowrap">
            <i className="fa-solid fa-circle-exclamation mr-1 text-[9px] text-amber-600"></i>
            Akses Terbatas
          </span>
        );
      case 'READ_ONLY':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-700 whitespace-nowrap">
            <i className="fa-solid fa-eye mr-1 text-[9px] text-blue-600"></i>
            Hanya Baca
          </span>
        );
      case 'NO_ACCESS':
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-400 border border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700 whitespace-nowrap">
            <i className="fa-solid fa-ban mr-1 text-[9px]"></i>
            Tidak Ada
          </span>
        );
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Banner Otorisasi Resmi */}
      <div className="bg-gradient-to-r from-slate-900 via-hajj-900 to-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-lg border border-gold-500/30 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <i className="fa-solid fa-shield-halved text-9xl text-gold-400"></i>
        </div>

        <div className="relative z-10 space-y-3 max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center space-x-1.5 bg-gold-500/20 text-gold-300 border border-gold-400/40 px-3 py-1 rounded-full text-xs font-bold">
              <i className="fa-solid fa-shield-halved"></i>
              <span>Otorisasi Resmi Sistem (RBAC Matrix)</span>
            </span>
            <span className="inline-flex items-center space-x-1 bg-white/10 text-slate-200 px-3 py-1 rounded-full text-xs font-mono">
              <i className="fa-solid fa-scale-balanced text-gold-400"></i>
              <span>SOP UPT Asrama Haji Jakarta</span>
            </span>
          </div>

          <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Matriks Hak Akses &amp; Otorisasi Per Divisi dan Role
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Sistem Informasi Manajemen Asrama Haji menerapkan <em>Role-Based Access Control</em> (RBAC) ketat berbasis tugas pokok dan fungsi (Tupoksi) kementerian. Setiap divisi dan jabatan memiliki kewenangan terpisah demi akuntabilitas, keamanan transaksi, dan perlindungan keabsahan dokumen ber-QR Code.
          </p>

          {/* Highlight Divisi Keuangan */}
          <div className="bg-emerald-950/60 border border-emerald-500/40 p-3.5 rounded-xl flex items-start space-x-3 text-xs">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 font-bold shadow-xs">
              <i className="fa-solid fa-receipt"></i>
            </div>
            <div>
              <p className="font-bold text-emerald-300">
                Otoritas Khusus Divisi Keuangan &amp; Akses Kwitansi Resmi:
              </p>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                Dokumen <strong>Kwitansi Resmi Pelunasan &amp; Uang Muka (DP)</strong> yang sah secara hukum dan bertanda tangan digital pejabat hanya dapat diterbitkan, divalidasi pembayarannya, dan dicetak oleh <strong>Manager Keuangan</strong>, <strong>Bendahara Penerimaan</strong>, dan <strong>Staff Keuangan</strong>. Resepsionis dan tamu hanya berwenang melihat atau meminta penerbitan setelah dana disetor.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and View Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* View Mode Toggle */}
          <div className="inline-flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold overflow-x-auto shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('KARTU')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
                viewMode === 'KARTU' ? 'bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 shadow-xs font-black' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-id-card"></i>
              <span>Kartu Rincian Role</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('MATRIKS')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
                viewMode === 'MATRIKS' ? 'bg-white dark:bg-slate-800 text-purple-800 dark:text-purple-300 shadow-xs font-black' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-table-cells"></i>
              <span>Tabel Matriks Lengkap</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('FOKUS_KEUANGAN');
                setSelectedDivision('KEUANGAN');
              }}
              className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
                viewMode === 'FOKUS_KEUANGAN' ? 'bg-emerald-700 text-white shadow-xs font-black' : 'text-slate-600 dark:text-slate-400 hover:text-emerald-700'
              }`}
            >
              <i className="fa-solid fa-coins text-gold-400"></i>
              <span>Fokus Divisi Keuangan &amp; Kwitansi</span>
            </button>
          </div>

          {/* Search Bar & Export CSV */}
          <div className="flex items-center space-x-2">
            <div className="relative flex-grow sm:flex-grow-0">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cari role, divisi, atau nama izin..."
                className="pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none w-full sm:w-64"
              />
              <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-2.5 text-slate-400 text-xs pointer-events-none"></i>
            </div>

            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition flex items-center space-x-1.5 shrink-0 cursor-pointer shadow-2xs"
              title="Unduh Tabel Matriks Hak Akses (CSV)"
            >
              <i className="fa-solid fa-file-csv text-emerald-600"></i>
              <span>Ekspor CSV</span>
            </button>
          </div>
        </div>

        {/* Division Filter Badges */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-700">
          <span className="text-[11px] font-bold text-slate-500 uppercase mr-1">Filter Divisi:</span>
          {[
            { key: 'SEMUA', label: 'Semua Divisi (13 Role)', icon: 'fa-layer-group' },
            { key: 'KEUANGAN', label: 'Keuangan & Perbendaharaan (3)', icon: 'fa-coins text-emerald-600' },
            { key: 'RESEPSIONIS', label: 'Resepsionis & Pelayanan (2)', icon: 'fa-bell-concierge text-blue-600' },
            { key: 'QC', label: 'Quality Control (2)', icon: 'fa-clipboard-check text-teal-600' },
            { key: 'TEKNISI', label: 'Pemeliharaan & Teknisi (2)', icon: 'fa-screwdriver-wrench text-amber-600' },
            { key: 'KOPERASI', label: 'Koperasi & Konsumsi (2)', icon: 'fa-utensils text-orange-600' },
            { key: 'ADMIN', label: 'Administrator & Pimpinan (2)', icon: 'fa-user-shield text-purple-600' }
          ].map(divItem => (
            <button
              key={divItem.key}
              type="button"
              onClick={() => setSelectedDivision(divItem.key as DivisionKey)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer ${
                selectedDivision === divItem.key
                  ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900 shadow-2xs font-bold'
                  : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 border border-slate-200 dark:border-slate-700'
              }`}
            >
              <i className={`fa-solid ${divItem.icon} text-[11px]`}></i>
              <span>{divItem.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* VIEW 1: KARTU RINCIAN ROLE & TANGGUNG JAWAB */}
      {viewMode === 'KARTU' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRoles.map(r => {
            const isExpanded = Boolean(expandedRoleKeys[r.id]);
            const matchedUserObj = users.find(u => u.role === r.role || u.fullName.toLowerCase().includes(r.defaultUserName.toLowerCase().split(' ')[0]));

            return (
              <div
                key={r.id}
                className={`bg-white dark:bg-slate-800 rounded-2xl border ${r.borderColor} shadow-xs p-5 space-y-4 transition flex flex-col justify-between`}
              >
                <div className="space-y-3">
                  {/* Header Card */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 flex items-center justify-center text-xl shrink-0 border border-slate-200 dark:border-slate-600 shadow-2xs">
                        <i className={`fa-solid ${r.icon}`}></i>
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] border uppercase ${r.badgeColor}`}>
                            {r.role}
                          </span>
                          <span className="text-[10px] text-slate-500 font-semibold">
                            {r.divisionName}
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm mt-0.5">
                          {r.officialTitle}
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center space-x-1">
                          <i className="fa-solid fa-user-tie text-[10px] text-gold-500"></i>
                          <span>Pejabat: <strong className="text-slate-700 dark:text-slate-300">{r.defaultUserName}</strong></span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700">
                    {r.summary}
                  </p>

                  {/* Khusus Divisi Keuangan: Kewenangan Kwitansi */}
                  {r.kwitansiSpecialAuthority && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 text-xs space-y-1">
                      <div className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center space-x-1.5">
                        <i className="fa-solid fa-receipt text-emerald-600"></i>
                        <span>Kewenangan Kwitansi Resmi:</span>
                      </div>
                      <p className="text-[11px] text-emerald-800 dark:text-emerald-300/90 leading-relaxed">
                        {r.kwitansiSpecialAuthority}
                      </p>
                    </div>
                  )}

                  {/* Tupoksi & Tanggung Jawab */}
                  <div className="space-y-1.5 text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[10px] flex items-center space-x-1">
                      <i className="fa-solid fa-list-check text-emerald-600"></i>
                      <span>Tugas Pokok &amp; Tanggung Jawab:</span>
                    </span>
                    <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400 list-disc list-inside pl-1">
                      {r.responsibilities.map((resp, idx) => (
                        <li key={idx} className="leading-snug">{resp}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Ringkasan Matriks Izin (Expandable) */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => toggleRoleExpand(r.id)}
                      className="w-full flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-emerald-700 cursor-pointer py-1"
                    >
                      <span className="flex items-center space-x-1.5">
                        <i className="fa-solid fa-shield-halved text-emerald-600"></i>
                        <span>Daftar Izin &amp; Akses Modul ({PERMISSION_COLUMNS.length} Modul)</span>
                      </span>
                      <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-xs`}></i>
                    </button>

                    {isExpanded && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-2 animate-in fade-in duration-150">
                        {PERMISSION_COLUMNS.map(col => {
                          const level = r.permissions[col.id] || 'NO_ACCESS';
                          return (
                            <div
                              key={col.id}
                              className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-1 text-[11px]"
                            >
                              <span className="font-medium text-slate-700 dark:text-slate-300 truncate" title={col.description}>
                                {col.name}
                              </span>
                              {renderBadge(level)}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                  {r.divisionKey === 'KEUANGAN' && onOpenLaporanKwitansi && (
                    <button
                      type="button"
                      onClick={onOpenLaporanKwitansi}
                      className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center space-x-1.5 transition cursor-pointer"
                      title="Buka Laporan Kamar & Kwitansi Resmi"
                    >
                      <i className="fa-solid fa-file-invoice text-gold-300"></i>
                      <span>Buka Laporan &amp; Kwitansi</span>
                    </button>
                  )}

                  {r.divisionKey === 'RESEPSIONIS' && onOpenGedungKamar && (
                    <button
                      type="button"
                      onClick={onOpenGedungKamar}
                      className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center space-x-1.5 transition cursor-pointer"
                      title="Buka Manajemen Gedung & Kamar"
                    >
                      <i className="fa-solid fa-hotel text-gold-300"></i>
                      <span>Buka Gedung &amp; Kamar</span>
                    </button>
                  )}

                  {matchedUserObj && onSwitchUser && currentUser?.id !== matchedUserObj.id && (
                    <button
                      type="button"
                      onClick={() => onSwitchUser(matchedUserObj)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-xl transition flex items-center space-x-1.5 cursor-pointer ml-auto"
                      title={`Uji coba login sebagai ${matchedUserObj.fullName}`}
                    >
                      <i className="fa-solid fa-right-to-bracket text-gold-500"></i>
                      <span>Uji Akses Akun Ini</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW 2: TABEL MATRIKS HAK AKSES LENGKAP (RBAC MATRIX) */}
      {viewMode === 'MATRIKS' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center space-x-2">
                <i className="fa-solid fa-table text-purple-600"></i>
                <span>Matriks Otorisasi Modul Lengkap (Role-Based Access Control)</span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Perbandingan komparatif hak akses setiap peran terhadap 12 modul operasional utama.
              </p>
            </div>
            <div className="flex items-center space-x-2 text-[10px]">
              <span className="flex items-center space-x-1 font-bold text-emerald-700 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Penuh</span>
              </span>
              <span className="flex items-center space-x-1 font-bold text-amber-700 dark:text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span>Terbatas</span>
              </span>
              <span className="flex items-center space-x-1 font-bold text-blue-700 dark:text-blue-400">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span>Baca</span>
              </span>
              <span className="flex items-center space-x-1 font-bold text-slate-400">
                <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                <span>Tidak Ada</span>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200">
              <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3 min-w-[200px]">Divisi &amp; Peran Jabatan</th>
                  {PERMISSION_COLUMNS.map(col => (
                    <th key={col.id} className="p-3 text-center min-w-[120px]" title={col.description}>
                      <span className="block leading-tight text-[11px]">{col.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredRoles.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition">
                    <td className="p-3">
                      <div className="flex items-center space-x-2">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-xs shrink-0">
                          <i className={`fa-solid ${r.icon}`}></i>
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white text-xs">{r.role}</div>
                          <div className="text-[10px] text-slate-500">{r.divisionName}</div>
                        </div>
                      </div>
                    </td>
                    {PERMISSION_COLUMNS.map(col => {
                      const level = r.permissions[col.id] || 'NO_ACCESS';
                      return (
                        <td key={col.id} className="p-3 text-center">
                          {renderBadge(level)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: FOKUS KHUSUS DIVISI KEUANGAN & AKSES KWITANSI */}
      {viewMode === 'FOKUS_KEUANGAN' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-md border border-emerald-400/40 space-y-3">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-gold-400 animate-pulse"></span>
              <h4 className="font-black text-lg text-white">
                Alur Otoritas Keuangan &amp; Penerbitan Kwitansi Resmi Ber-QR
              </h4>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed max-w-3xl">
              UPT Asrama Haji Jakarta menetapkan bahwa seluruh dokumen bukti penerimaan negara (PNBP) dikelola di bawah satu pintu oleh Divisi Keuangan. Hal ini menjamin kesesuaian antara kas fisik, mutasi perbankan Virtual Account Mandiri / BNI, dan rekam jejak digital kwitansi anti-duplikasi.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 text-xs">
              <div className="bg-white/10 p-3 rounded-xl border border-white/20 space-y-1">
                <span className="font-bold text-gold-300 block text-[11px]">1. Tagihan Awal</span>
                <p className="text-[11px] text-slate-200">Resepsionis menerbitkan Faktur Invoice (INV-OPR/...) berisi rincian kamar, extra bed, aula, dan konsumsi.</p>
              </div>
              <div className="bg-white/10 p-3 rounded-xl border border-white/20 space-y-1">
                <span className="font-bold text-emerald-300 block text-[11px]">2. Penerimaan Kas / VA</span>
                <p className="text-[11px] text-slate-200">Staff Keuangan / Kasir memverifikasi transfer Virtual Account UPT atau setoran tunai (DP maupun Lunas).</p>
              </div>
              <div className="bg-white/10 p-3 rounded-xl border border-white/20 space-y-1">
                <span className="font-bold text-gold-300 block text-[11px]">3. Kwitansi Ber-QR Sah</span>
                <p className="text-[11px] text-slate-200">Bendahara Penerimaan menerbitkan Kwitansi Resmi ber-QR dengan spesimen tanda tangan dan stempel digital sah.</p>
              </div>
              <div className="bg-white/10 p-3 rounded-xl border border-white/20 space-y-1">
                <span className="font-bold text-emerald-300 block text-[11px]">4. Rekonsiliasi &amp; Supabase</span>
                <p className="text-[11px] text-slate-200">Manager Keuangan memvalidasi arus kas masuk harian dan menyinkronkan data langsung ke basis data Supabase.</p>
              </div>
            </div>
          </div>

          {/* Kartu Khusus 3 Pejabat Divisi Keuangan */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ROLES_CATALOG.filter(r => r.divisionKey === 'KEUANGAN').map(r => (
              <div
                key={r.id}
                className="bg-white dark:bg-slate-800 rounded-2xl border-2 border-emerald-300 dark:border-emerald-700 p-5 shadow-sm space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-lg font-bold">
                      <i className={`fa-solid ${r.icon}`}></i>
                    </div>
                    <div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-100 text-emerald-900 border border-emerald-300">
                        {r.role}
                      </span>
                      <h4 className="font-bold text-slate-900 dark:text-white text-xs mt-1">
                        {r.defaultUserName}
                      </h4>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-200">
                    {r.kwitansiSpecialAuthority}
                  </p>

                  <div className="space-y-1 text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px] block">Otoritas Dokumen:</span>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between border-b border-slate-100 dark:border-slate-700 py-1">
                        <span className="text-slate-500">Kwitansi Ber-QR:</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">Akses Penuh (Sah)</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 dark:border-slate-700 py-1">
                        <span className="text-slate-500">Pencatatan Pembayaran:</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">Akses Penuh (DP &amp; Lunas)</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 dark:border-slate-700 py-1">
                        <span className="text-slate-500">Faktur Tagihan (Invoice):</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">Akses Penuh</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-slate-500">Log Verifikasi PDF:</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">Akses Penuh</span>
                      </div>
                    </div>
                  </div>
                </div>

                {onOpenLaporanKwitansi && (
                  <button
                    type="button"
                    onClick={onOpenLaporanKwitansi}
                    className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <i className="fa-solid fa-receipt text-gold-300"></i>
                    <span>Buka Halaman Kwitansi &amp; Laporan</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
