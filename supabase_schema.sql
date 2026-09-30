-- ==============================================================================
-- SKRIP INISIALISASI & MIGRASI DATABASE SUPABASE LENGKAP & TERKINI
-- SISTEM INFORMASI AKOMODASI & OPERASIONAL UPT ASRAMA HAJI JAKARTA
-- 
-- Versi: Terkini (Mendukung Log Unduh PDF Ber-QR, Spesimen TTD & QR Digital,
--        Inspeksi QC, Reservasi Rombongan/Instansi, Koperasi & Multi-User)
--
-- Petunjuk Penggunaan:
-- 1. Buka Dashboard Supabase Anda: https://supabase.com/dashboard/project/iiopgzyxzvmnmkgnrzvc
-- 2. Pilih menu "SQL Editor" di bilah navigasi kiri.
-- 3. Klik "New Query", tempelkan (paste) seluruh isi skrip ini, lalu klik "RUN".
-- 4. Skrip ini aman dijalankan berulang kali (Idempotent / IF NOT EXISTS).
-- ==============================================================================

-- Aktifkan ekstensi UUID jika diperlukan
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. TABEL SNAPSHOT SINKRONISASI DATABASE UTUH (APP_DATABASE_SYNC)
-- Menyimpan state terpadu untuk redundansi dan sinkronisasi real-time instan
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.app_database_sync (
    id TEXT PRIMARY KEY,
    database_payload JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 2. TABEL PENGATURAN INSTANSI (APP_SETTINGS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    organization_name TEXT NOT NULL,
    sub_title TEXT,
    ministry_name TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    portal_url TEXT,
    app_logo TEXT,
    app_favicon TEXT,
    tag_title TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Migrasi kolom tambahan app_settings jika tabel sudah ada sebelumnya
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS app_favicon TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS tag_title TEXT;

-- ==============================================================================
-- 3. TABEL PENGGUNA, STAF & SPESIMEN TANDA TANGAN DIGITAL (USERS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    password TEXT,
    department TEXT,
    supervisor_id TEXT,
    assigned_building TEXT,
    phone TEXT,
    status TEXT DEFAULT 'Aktif',
    email TEXT,
    nip TEXT,
    is_owner BOOLEAN DEFAULT false,
    signature_url TEXT,
    qr_code_url TEXT,
    signature_history JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Migrasi kolom tambahan users (spesimen TTD, NIP, & QR Code unik)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS nip TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS signature_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS qr_code_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS signature_history JSONB DEFAULT '[]'::jsonb;

-- Index pencarian pengguna
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_nip ON public.users(nip);

-- ==============================================================================
-- 4. TABEL MASTER GEDUNG (BUILDINGS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.buildings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT,
    floors INTEGER DEFAULT 1,
    total_rooms INTEGER DEFAULT 0,
    capacity_desc TEXT,
    category TEXT DEFAULT 'PENGINAPAN',
    description TEXT,
    status TEXT DEFAULT 'AKTIF',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 5. TABEL MASTER RUANG PERTEMUAN / AULA (MEETING_ROOMS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.meeting_rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT,
    building TEXT NOT NULL,
    capacity TEXT,
    capacity_number INTEGER,
    facilities TEXT[],
    daily_rate NUMERIC DEFAULT 0,
    session_rate NUMERIC DEFAULT 0,
    description TEXT,
    status TEXT DEFAULT 'TERSEDIA',
    qc_status TEXT DEFAULT 'LOLOS_QC',
    active_tx_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 6. TABEL MASTER KAMAR HUNIAN (ROOMS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.rooms (
    id TEXT PRIMARY KEY,
    building TEXT NOT NULL,
    room_number TEXT NOT NULL,
    floor INTEGER,
    type TEXT NOT NULL,
    bed_type TEXT,
    capacity TEXT,
    capacity_number INTEGER,
    status TEXT DEFAULT 'KOSONG',
    qc_status TEXT DEFAULT 'LOLOS_QC',
    last_qc_date TEXT,
    last_qc_by TEXT,
    last_qc_notes TEXT,
    active_tx_id TEXT,
    active_maint_id TEXT,
    price_per_night NUMERIC DEFAULT 0,
    facilities TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS bed_type TEXT;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS capacity_number INTEGER;

-- Index pencarian kamar
CREATE INDEX IF NOT EXISTS idx_rooms_building ON public.rooms(building);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_qc_status ON public.rooms(qc_status);

-- ==============================================================================
-- 6B. TABEL MASTER TARIF KAPASITAS KAMAR (ROOM_CAPACITY_RATES)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.room_capacity_rates (
    id TEXT PRIMARY KEY,
    room_type TEXT NOT NULL,
    bed_type TEXT NOT NULL,
    capacity_pax INTEGER DEFAULT 1,
    price_per_night NUMERIC DEFAULT 0,
    description TEXT,
    facilities TEXT[],
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_room_rates_type ON public.room_capacity_rates(room_type);
CREATE INDEX IF NOT EXISTS idx_room_rates_bed ON public.room_capacity_rates(bed_type);

-- ==============================================================================
-- 7. TABEL TRANSAKSI & RESERVASI HUNIAN / AULA (TRANSACTIONS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY,
    room_id TEXT,
    building TEXT NOT NULL,
    room_number TEXT NOT NULL,
    category TEXT,
    guest_name TEXT NOT NULL,
    guest_type TEXT DEFAULT 'INDIVIDU',
    nik_ktp TEXT,
    kloter TEXT,
    start_date TEXT NOT NULL,
    duration INTEGER DEFAULT 1,
    phone TEXT,
    notes TEXT,
    status TEXT DEFAULT 'AKTIF',
    created_user TEXT,
    is_group BOOLEAN DEFAULT false,
    group_type TEXT,
    group_name TEXT,
    group_pic TEXT,
    group_pic_phone TEXT,
    group_id TEXT,
    total_pax INTEGER,
    include_aula BOOLEAN DEFAULT false,
    rent_aula_id TEXT,
    rent_aula_name TEXT,
    rent_aula_duration INTEGER,
    rent_aula_duration_days INTEGER,
    rent_aula_session TEXT,
    catering_package TEXT,
    catering_pax_count INTEGER,
    agency_or_document TEXT,
    spk_number TEXT,
    allocated_room_numbers TEXT[],
    allocated_rooms_count INTEGER,
    breakfast BOOLEAN DEFAULT false,
    breakfast_menu TEXT,
    breakfast_portions INTEGER,
    breakfast_days INTEGER,
    breakfast_status TEXT,
    rent_type TEXT,
    duration_unit TEXT DEFAULT 'Hari',
    price_per_night NUMERIC DEFAULT 0,
    extra_bed BOOLEAN DEFAULT false,
    extra_bed_count INTEGER DEFAULT 0,
    extra_bed_price NUMERIC DEFAULT 0,
    extra_bed_notes TEXT,
    check_in_time TEXT,
    check_out_time TEXT,
    payment_status TEXT DEFAULT 'BELUM_LUNAS',
    paid_amount NUMERIC DEFAULT 0,
    dp_amount NUMERIC DEFAULT 0,
    dp_date TEXT,
    dp_method TEXT,
    dp_note TEXT,
    remaining_amount NUMERIC DEFAULT 0,
    va_number TEXT,
    va_account_name TEXT,
    bank_name TEXT,
    bank_account_number TEXT,
    payment_method TEXT,
    payment_date TEXT,
    payment_note TEXT,
    kwitansi_no TEXT,
    cancelled_at TEXT,
    cancel_reason TEXT,
    cancelled_user TEXT,
    extended_count INTEGER DEFAULT 0,
    extend_history JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Migrasi kolom tambahan transactions (Keuangan, Kwitansi, Pembayaran & Extend)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS agency_or_document TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS spk_number TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS price_per_night NUMERIC DEFAULT 0;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS extra_bed_price NUMERIC DEFAULT 0;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS extra_bed_notes TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'BELUM_LUNAS';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS dp_amount NUMERIC DEFAULT 0;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS dp_date TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS dp_method TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS dp_note TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC DEFAULT 0;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS va_number TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS va_account_name TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_date TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_note TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS kwitansi_no TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS cancelled_at TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS cancelled_user TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS extend_history JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_group_id ON public.transactions(group_id);
CREATE INDEX IF NOT EXISTS idx_transactions_start_date ON public.transactions(start_date);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_status ON public.transactions(payment_status);
CREATE INDEX IF NOT EXISTS idx_transactions_kwitansi_no ON public.transactions(kwitansi_no);

-- ==============================================================================
-- 8. TABEL PEMELIHARAAN & PERBAIKAN TEKNISI (MAINTENANCES)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.maintenances (
    id TEXT PRIMARY KEY,
    room_id TEXT,
    building TEXT NOT NULL,
    room_number TEXT NOT NULL,
    category TEXT NOT NULL,
    urgency TEXT DEFAULT 'SEDANG',
    technician TEXT,
    description TEXT,
    report_time TEXT NOT NULL,
    status TEXT DEFAULT 'MENUNGGU_PENUGASAN',
    reported_user TEXT,
    assigned_technician_id TEXT,
    assigned_technician_name TEXT,
    assigned_by_manager TEXT,
    assigned_time TEXT,
    manager_notes TEXT,
    work_completed_time TEXT,
    technician_notes TEXT,
    resolved_time TEXT,
    qc_inspection_id TEXT,
    qc_verdict TEXT,
    facility_type TEXT DEFAULT 'KAMAR',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_maintenances_status ON public.maintenances(status);
CREATE INDEX IF NOT EXISTS idx_maintenances_assigned_technician ON public.maintenances(assigned_technician_id);

-- ==============================================================================
-- 9. TABEL INSPEKSI QUALITY CONTROL (QC_INSPECTIONS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.qc_inspections (
    id TEXT PRIMARY KEY,
    room_id TEXT,
    building TEXT NOT NULL,
    room_number TEXT NOT NULL,
    inspector_id TEXT,
    inspector_name TEXT NOT NULL,
    inspection_date TEXT NOT NULL,
    cleanliness TEXT DEFAULT 'BAIK',
    linen_bed TEXT DEFAULT 'LENGKAP_BERSIH',
    ac_electricity TEXT DEFAULT 'NORMAL',
    plumbing_water TEXT DEFAULT 'LANCAR',
    amenities TEXT DEFAULT 'LENGKAP',
    result TEXT DEFAULT 'LOLOS_QC',
    decision_type TEXT,
    notes TEXT,
    maintenance_id_created TEXT,
    facility_type TEXT DEFAULT 'KAMAR',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Migrasi kolom tambahan qc_inspections
ALTER TABLE public.qc_inspections ADD COLUMN IF NOT EXISTS decision_type TEXT;

CREATE INDEX IF NOT EXISTS idx_qc_inspections_result ON public.qc_inspections(result);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_date ON public.qc_inspections(inspection_date);

-- ==============================================================================
-- 10. TABEL SESI KERJA & SHIFT STAF (WORK_SESSIONS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.work_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL,
    login_time TEXT NOT NULL,
    logout_time TEXT,
    duration_seconds INTEGER DEFAULT 0,
    duration_formatted TEXT,
    status TEXT DEFAULT 'AKTIF',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_work_sessions_user_id ON public.work_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_login_time ON public.work_sessions(login_time);

-- ==============================================================================
-- 11. TABEL LOG AUDIT AKTIVITAS SISTEM (AUDIT_LOGS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY DEFAULT ('log-' || floor(random()*1000000)::text),
    timestamp TEXT NOT NULL,
    user_name TEXT,
    role TEXT,
    action TEXT NOT NULL,
    details TEXT,
    duration_minutes NUMERIC,
    verification_code TEXT,
    document_title TEXT,
    target_id TEXT,
    signatory_name TEXT,
    signatory_role TEXT,
    signatory_nip TEXT,
    qr_code_hash TEXT,
    has_qr_and_signature BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Migrasi kolom tambahan audit_logs
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS verification_code TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS document_title TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_id TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS signatory_name TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS signatory_role TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS signatory_nip TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS qr_code_hash TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS has_qr_and_signature BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_verif_code ON public.audit_logs(verification_code);

-- ==============================================================================
-- 12. TABEL LOG UNDUH PDF BER-QR & VERIFIKASI KEABSAHAN DOKUMEN RESMI (PDF_DOWNLOAD_LOGS)
-- Menampung dokumen yang diunduh dengan tanda tangan & QR code digital resmi
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pdf_download_logs (
    id TEXT PRIMARY KEY DEFAULT ('vlog-' || floor(random()*1000000)::text),
    verification_code TEXT NOT NULL UNIQUE,
    timestamp TEXT NOT NULL,
    user_name TEXT NOT NULL,
    role TEXT NOT NULL,
    document_title TEXT NOT NULL,
    target_id TEXT,
    signatory_name TEXT,
    signatory_role TEXT,
    signatory_nip TEXT,
    qr_code_hash TEXT,
    has_qr_and_signature BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Migrasi kolom tambahan pdf_download_logs
ALTER TABLE public.pdf_download_logs ADD COLUMN IF NOT EXISTS has_qr_and_signature BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_pdf_download_verif_code ON public.pdf_download_logs (verification_code);
CREATE INDEX IF NOT EXISTS idx_pdf_download_user_name ON public.pdf_download_logs (user_name);
CREATE INDEX IF NOT EXISTS idx_pdf_download_target_id ON public.pdf_download_logs (target_id);

-- ==============================================================================
-- 13. TABEL KATALOG MENU SARAPAN & KOPERASI (BREAKFAST_MENU_ITEMS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.breakfast_menu_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price NUMERIC DEFAULT 0,
    description TEXT,
    is_available BOOLEAN DEFAULT true,
    allergens TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 14. TABEL PESANAN SARAPAN & KATERING (BREAKFAST_ORDERS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.breakfast_orders (
    id TEXT PRIMARY KEY,
    room_number TEXT NOT NULL,
    building TEXT NOT NULL,
    guest_name TEXT NOT NULL,
    phone TEXT,
    kloter TEXT,
    transaction_id TEXT,
    menu_id TEXT,
    menu_name TEXT NOT NULL,
    portions INTEGER DEFAULT 1,
    days INTEGER DEFAULT 1,
    start_date TEXT,
    delivery_time TEXT,
    status TEXT DEFAULT 'MENUNGGU',
    notes TEXT,
    dietary_restriction TEXT,
    price_per_portion NUMERIC DEFAULT 0,
    total_price NUMERIC DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_breakfast_orders_status ON public.breakfast_orders(status);
CREATE INDEX IF NOT EXISTS idx_breakfast_orders_room ON public.breakfast_orders(building, room_number);

-- ==============================================================================
-- 15. TABEL CHAT & KOMUNIKASI DIVISI (CHAT_CHANNELS & CHAT_MESSAGES)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.chat_channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    scope TEXT NOT NULL,
    type TEXT DEFAULT 'GROUP',
    department TEXT,
    participant_ids TEXT[],
    description TEXT,
    icon TEXT,
    last_message TEXT,
    last_message_time TEXT,
    last_sender_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL,
    sender_department TEXT,
    message TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    time_formatted TEXT,
    priority TEXT DEFAULT 'NORMAL',
    is_instruction BOOLEAN DEFAULT false,
    read_by TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON public.chat_messages(channel_id);

-- ==============================================================================
-- 16. TABEL PERMOHONAN RESET KATA SANDI (PASSWORD_RESET_REQUESTS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.password_reset_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    new_password TEXT NOT NULL,
    request_date TEXT NOT NULL,
    status TEXT DEFAULT 'MENUNGGU_PERSETUJUAN',
    notes TEXT,
    processed_by TEXT,
    processed_at TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_pwd_reset_status ON public.password_reset_requests(status);

-- ==============================================================================
-- KEBIJAKAN KEAMANAN ROW LEVEL SECURITY (RLS)
-- Mengaktifkan RLS dan memberikan izin akses penuh bagi aplikasi klien (Anon & Authenticated)
-- ==============================================================================
ALTER TABLE public.app_database_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qc_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_download_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.breakfast_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.breakfast_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_capacity_rates ENABLE ROW LEVEL SECURITY;

-- Buat atau perbarui kebijakan akses publik secara aman tanpa error duplikasi
DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow public all access on room_capacity_rates" ON public.room_capacity_rates;
    CREATE POLICY "Allow public all access on room_capacity_rates" ON public.room_capacity_rates FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public all access on app_database_sync" ON public.app_database_sync;
    CREATE POLICY "Allow public all access on app_database_sync" ON public.app_database_sync FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public all access on app_settings" ON public.app_settings;
    CREATE POLICY "Allow public all access on app_settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public all access on users" ON public.users;
    CREATE POLICY "Allow public all access on users" ON public.users FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public all access on buildings" ON public.buildings;
    CREATE POLICY "Allow public all access on buildings" ON public.buildings FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public all access on meeting_rooms" ON public.meeting_rooms;
    CREATE POLICY "Allow public all access on meeting_rooms" ON public.meeting_rooms FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public all access on rooms" ON public.rooms;
    CREATE POLICY "Allow public all access on rooms" ON public.rooms FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public all access on transactions" ON public.transactions;
    CREATE POLICY "Allow public all access on transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public all access on maintenances" ON public.maintenances;
    CREATE POLICY "Allow public all access on maintenances" ON public.maintenances FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public all access on qc_inspections" ON public.qc_inspections;
    CREATE POLICY "Allow public all access on qc_inspections" ON public.qc_inspections FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public all access on work_sessions" ON public.work_sessions;
    CREATE POLICY "Allow public all access on work_sessions" ON public.work_sessions FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public all access on audit_logs" ON public.audit_logs;
    CREATE POLICY "Allow public all access on audit_logs" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public all access on pdf_download_logs" ON public.pdf_download_logs;
    CREATE POLICY "Allow public all access on pdf_download_logs" ON public.pdf_download_logs FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public all access on breakfast_menu_items" ON public.breakfast_menu_items;
    CREATE POLICY "Allow public all access on breakfast_menu_items" ON public.breakfast_menu_items FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public all access on breakfast_orders" ON public.breakfast_orders;
    CREATE POLICY "Allow public all access on breakfast_orders" ON public.breakfast_orders FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public all access on chat_channels" ON public.chat_channels;
    CREATE POLICY "Allow public all access on chat_channels" ON public.chat_channels FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public all access on chat_messages" ON public.chat_messages;
    CREATE POLICY "Allow public all access on chat_messages" ON public.chat_messages FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public all access on password_reset_requests" ON public.password_reset_requests;
    CREATE POLICY "Allow public all access on password_reset_requests" ON public.password_reset_requests FOR ALL USING (true) WITH CHECK (true);
END $$;

-- ==============================================================================
-- 17. SEED DATA AWAL (PENGATURAN INSTANSI DEFAULT & AKUN PENGGUNA RESMI)
-- ==============================================================================
INSERT INTO public.app_settings (
    id, 
    organization_name, 
    sub_title, 
    ministry_name, 
    address, 
    phone, 
    email, 
    portal_url
)
VALUES (
    'default',
    'UPT ASRAMA HAJI JAKARTA',
    'Sistem Informasi Manajemen Operasional Terpadu & Hunian',
    'KEMENTERIAN HAJI DAN UMRAH REPUBLIK INDONESIA',
    'Jl. Raya Pd. Gede, RT.1/RW.1, Pinang Ranti, Kec. Makasar, Kota Jakarta Timur, Daerah Khusus Ibukota Jakarta 13560, Indonesia.',
    '0816243154',
    'info@asramahajijakarta.id',
    'https://asramahajijakarta.id'
) ON CONFLICT (id) DO UPDATE SET
    organization_name = EXCLUDED.organization_name,
    sub_title = EXCLUDED.sub_title,
    ministry_name = EXCLUDED.ministry_name,
    address = EXCLUDED.address,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    portal_url = EXCLUDED.portal_url,
    updated_at = timezone('utc'::text, now());

-- Seed Akun Pengguna Resmi UPT Asrama Haji Jakarta Untuk Semua Divisi & Role
INSERT INTO public.users (
    id, username, full_name, role, password, department, assigned_building, phone, status, nip, is_owner
) VALUES 
('u-admin', 'admin', 'H. Mochammad Hasan, S.Ag., M.Si. (Super Admin)', 'Super Admin', '12345', 'Pimpinan & Sekretariat UPT', 'Semua Gedung', '081234567890', 'Aktif', '19750810 199903 1 002', true),
('u-mgr-resepsionis', 'mgr_resepsionis', 'Dra. Hj. Nurul Hidayati (Manager Resepsionis)', 'Manager Resepsionis', '12345', 'Pelayanan & Resepsionis', 'Semua Gedung', '081255556666', 'Aktif', '19800315 200604 2 008', false),
('u-resepsionis', 'resepsionis', 'Siti Rahmawati (Resepsionis)', 'Resepsionis', '12345', 'Pelayanan & Resepsionis', 'Semua Gedung', '081277778888', 'Aktif', '19901120 201502 2 005', false),
('u-mgr-keuangan', 'mgr_keuangan', 'H. Ahmad Fauzi, S.E., M.M. (Manager Keuangan)', 'Manager Keuangan', '12345', 'Keuangan & Perbendaharaan', 'Semua Gedung', '081211223344', 'Aktif', '19790515 200501 1 003', false),
('u-keuangan', 'keuangan', 'Hj. Siti Aisyah, S.E. (Bendahara Penerimaan)', 'Bendahara / Keuangan', '12345', 'Keuangan & Perbendaharaan', 'Semua Gedung', '081299887766', 'Aktif', '19820412 200801 2 004', false),
('u-staff-keuangan', 'staff_keuangan', 'Rian Hidayat, A.Md. (Staff Keuangan / Kasir)', 'Staff Keuangan', '12345', 'Keuangan & Perbendaharaan', 'Semua Gedung', '081244556677', 'Aktif', '19920824 201801 1 002', false),
('u-mgr-qc', 'mgr_qc', 'Ir. Bambang Tri (Manager QC)', 'Manager QC', '12345', 'Pengawasan Mutu & QC', 'Semua Gedung', '081288889999', 'Aktif', '19780214 200312 1 004', false),
('u-qc', 'qc', 'Hendra Pratama (Quality Control)', 'Quality Control', '12345', 'Pengawasan Mutu & QC', 'Semua Gedung', '081311112222', 'Aktif', '19910618 201601 1 003', false),
('u-mgr-teknisi', 'mgr_teknisi', 'Agus Setiawan, S.T. (Manager Teknisi)', 'Manager Teknisi', '12345', 'Pemeliharaan Fasilitas & Teknisi', 'Semua Gedung', '081333334444', 'Aktif', '19810925 200701 1 006', false),
('u-teknisi', 'teknisi', 'Joko Susilo (Teknisi Sarpras)', 'Teknisi', '12345', 'Pemeliharaan Fasilitas & Teknisi', 'Semua Gedung', '081355556666', 'Aktif', '19880712 201402 1 007', false),
('u-mgr-koperasi', 'mgr_koperasi', 'Hj. Fatimah, S.E. (Manager Koperasi)', 'Manager Koperasi', '12345', 'Koperasi, Dapur & Konsumsi', 'Dapur & Distribusi Sarapan', '081377778888', 'Aktif', '19831205 200903 2 006', false),
('u-koperasi', 'koperasi', 'Dewi Lestari (Petugas Koperasi)', 'Petugas Koperasi', '12345', 'Koperasi, Dapur & Konsumsi', 'Dapur & Distribusi Sarapan', '081399990000', 'Aktif', '19940428 201901 2 009', false)
ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    department = EXCLUDED.department,
    phone = EXCLUDED.phone,
    nip = EXCLUDED.nip,
    status = EXCLUDED.status;

-- Selesai! Skrip SQL telah diperbarui dan siap dijalankan langsung di SQL Editor Supabase.
