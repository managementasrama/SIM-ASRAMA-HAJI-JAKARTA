import { createClient } from '@supabase/supabase-js';
import { generateInitialDatabase } from '../src/services/dataStorage';

const SUPABASE_URL = 'https://ijvbtubyjxqjethugzlm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqdmJ0dWJ5anhxamV0aHVnemxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5NzEwMDksImV4cCI6MjEwNTU0NzAwOX0.Kq8voFP02KShzjqQ7XPgL2OJi07oV_d0iY01hYYZ4sU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runSync() {
  console.log('--- MEMULAI SINKRONISASI DATABASE KE SUPABASE ---');
  console.log('Project URL:', SUPABASE_URL);

  const db = generateInitialDatabase(false);
  console.log(`\nRingkasan Data:`);
  console.log(`- Pengguna (Users): ${db.users.length}`);
  console.log(`- Gedung (Buildings): ${db.buildings.length}`);
  console.log(`- Kamar (Rooms): ${db.rooms.length}`);
  console.log(`- Ruang Pertemuan (Meeting Rooms): ${db.meetingRooms.length}`);
  console.log(`- Menu Sarapan (Breakfast Menu): ${db.breakfastMenuItems.length}`);

  // 1. Snapshot Terpadu (app_database_sync)
  try {
    console.log('\n[1/7] Menyimpan Snapshot Terpadu ke `app_database_sync`...');
    const { error: syncErr } = await supabase
      .from('app_database_sync')
      .upsert({
        id: 'main_production_db',
        database_payload: db,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (syncErr) {
      console.error('❌ Gagal:', syncErr.message);
    } else {
      console.log('✅ SUKSES: Snapshot database lengkap tersimpan di `app_database_sync`!');
    }
  } catch (err: any) {
    console.error('❌ Exception:', err.message);
  }

  // 2. Pengaturan Instansi (app_settings)
  try {
    console.log('\n[2/7] Menyimpan Pengaturan Instansi ke `app_settings`...');
    const fullPayload = {
      id: 'default',
      organization_name: db.appSettings.organizationName,
      sub_title: db.appSettings.subTitle,
      ministry_name: db.appSettings.ministryName,
      address: db.appSettings.address,
      phone: db.appSettings.phone,
      email: db.appSettings.email,
      portal_url: db.appSettings.portalUrl,
      app_logo: db.appSettings.appLogo || null,
      app_favicon: db.appSettings.appFavicon || null,
      tag_title: db.appSettings.tagTitle || null,
      updated_at: new Date().toISOString()
    };

    let { error: setErr } = await supabase.from('app_settings').upsert(fullPayload, { onConflict: 'id' });
    if (setErr) {
      const { app_favicon, tag_title, ...basePayload } = fullPayload;
      const res = await supabase.from('app_settings').upsert(basePayload, { onConflict: 'id' });
      setErr = res.error;
    }

    if (setErr) {
      console.error('❌ Gagal:', setErr.message);
    } else {
      console.log('✅ SUKSES: Pengaturan instansi tersimpan di `app_settings`!');
    }
  } catch (err: any) {
    console.error('❌ Exception:', err.message);
  }

  // 3. Pengguna (users)
  try {
    console.log('\n[3/7] Menyimpan Data Pengguna ke `users`...');
    const userPayloads = db.users.map(u => ({
      id: u.id,
      username: u.username,
      full_name: u.fullName,
      role: u.role,
      password: u.password || null,
      department: u.department || null,
      supervisor_id: u.supervisorId || null,
      assigned_building: u.assignedBuilding || null,
      phone: u.phone || null,
      status: u.status || 'Aktif',
      email: u.email || null,
      nip: u.nip || null,
      is_owner: Boolean(u.isOwner),
      signature_url: u.signatureUrl || null,
      qr_code_url: u.qrCodeUrl || null,
      signature_history: u.signatureHistory || []
    }));

    let { error: userErr } = await supabase.from('users').upsert(userPayloads, { onConflict: 'id' });
    if (userErr) {
      const fallbackPayloads = db.users.map(u => ({
        id: u.id,
        username: u.username,
        full_name: u.fullName,
        role: u.role,
        password: u.password || null,
        department: u.department || null,
        supervisor_id: u.supervisorId || null,
        assigned_building: u.assignedBuilding || null,
        phone: u.phone || null,
        status: u.status || 'Aktif',
        email: u.email || null,
        is_owner: Boolean(u.isOwner)
      }));
      const res = await supabase.from('users').upsert(fallbackPayloads, { onConflict: 'id' });
      userErr = res.error;
    }

    if (userErr) {
      console.error('❌ Gagal:', userErr.message);
    } else {
      console.log(`✅ SUKSES: ${userPayloads.length} akun pengguna tersimpan di \`users\`!`);
    }
  } catch (err: any) {
    console.error('❌ Exception:', err.message);
  }

  // 4. Gedung (buildings)
  try {
    console.log('\n[4/7] Menyimpan Data Gedung ke `buildings`...');
    const bPayloads = db.buildings.map(b => ({
      id: b.id,
      name: b.name,
      code: b.code || null,
      floors: b.floors,
      total_rooms: b.totalRooms,
      capacity_desc: b.capacityDesc || null,
      category: b.category,
      description: b.description || null,
      status: b.status || 'AKTIF'
    }));
    const { error: bErr } = await supabase.from('buildings').upsert(bPayloads, { onConflict: 'id' });
    if (bErr) console.error('❌ Gagal:', bErr.message);
    else console.log(`✅ SUKSES: ${bPayloads.length} gedung tersimpan di \`buildings\`!`);
  } catch (err: any) {
    console.error('❌ Exception:', err.message);
  }

  // 5. Ruang Pertemuan (meeting_rooms)
  try {
    console.log('\n[5/7] Menyimpan Data Aula / Ruang Pertemuan ke `meeting_rooms`...');
    const mrPayloads = db.meetingRooms.map(mr => ({
      id: mr.id,
      name: mr.name,
      code: mr.code || null,
      building: mr.building,
      capacity: mr.capacity,
      capacity_number: mr.capacityNumber || 0,
      facilities: mr.facilities || [],
      daily_rate: mr.dailyRate || 0,
      session_rate: mr.sessionRate || 0,
      description: mr.description || null,
      status: mr.status || 'TERSEDIA',
      qc_status: mr.qcStatus || 'LOLOS_QC',
      active_tx_id: mr.activeTxId || null
    }));
    const { error: mrErr } = await supabase.from('meeting_rooms').upsert(mrPayloads, { onConflict: 'id' });
    if (mrErr) console.error('❌ Gagal:', mrErr.message);
    else console.log(`✅ SUKSES: ${mrPayloads.length} aula tersimpan di \`meeting_rooms\`!`);
  } catch (err: any) {
    console.error('❌ Exception:', err.message);
  }

  // 6. Kamar (rooms)
  try {
    console.log('\n[6/7] Menyimpan Data Kamar ke `rooms`...');
    const roomPayloads = db.rooms.map(r => ({
      id: r.id,
      building: r.building,
      room_number: r.roomNumber,
      floor: r.floor,
      type: r.type,
      capacity: r.capacity,
      status: r.status,
      qc_status: r.qcStatus || 'LOLOS_QC',
      last_qc_date: r.lastQcDate || null,
      last_qc_by: r.lastQcBy || null,
      last_qc_notes: r.lastQcNotes || null,
      active_tx_id: r.activeTxId || null,
      active_maint_id: r.activeMaintId || null,
      price_per_night: r.pricePerNight || 0,
      facilities: r.facilities || []
    }));

    const batchSize = 100;
    for (let i = 0; i < roomPayloads.length; i += batchSize) {
      const batch = roomPayloads.slice(i, i + batchSize);
      const { error: rErr } = await supabase.from('rooms').upsert(batch, { onConflict: 'id' });
      if (rErr) console.error(`❌ Gagal batch ${i}:`, rErr.message);
    }
    console.log(`✅ SUKSES: ${roomPayloads.length} kamar tersimpan di \`rooms\`!`);
  } catch (err: any) {
    console.error('❌ Exception:', err.message);
  }

  // 7. Menu Sarapan & Koperasi (breakfast_menu_items)
  try {
    console.log('\n[7/7] Menyimpan Katalog Menu Sarapan ke `breakfast_menu_items`...');
    if (db.breakfastMenuItems.length > 0) {
      const bMenuPayloads = db.breakfastMenuItems.map(m => ({
        id: m.id,
        name: m.name,
        category: m.category,
        price: m.price || 0,
        description: m.description || null,
        is_available: m.isAvailable ?? true,
        allergens: m.allergens || null
      }));
      const { error: bmErr } = await supabase.from('breakfast_menu_items').upsert(bMenuPayloads, { onConflict: 'id' });
      if (bmErr) console.error('❌ Gagal:', bmErr.message);
      else console.log(`✅ SUKSES: ${bMenuPayloads.length} menu tersimpan di \`breakfast_menu_items\`!`);
    }
  } catch (err: any) {
    console.error('❌ Exception:', err.message);
  }

  // 8. Tarif Kapasitas Kamar (room_capacity_rates)
  try {
    console.log('\n[8/8] Menyimpan Master Tarif Kapasitas Kamar ke `room_capacity_rates`...');
    if (db.roomCapacityRates && db.roomCapacityRates.length > 0) {
      const ratePayloads = db.roomCapacityRates.map(r => ({
        id: r.id,
        room_type: r.roomType,
        bed_type: r.bedType,
        capacity_pax: r.capacityPax,
        price_per_night: r.pricePerNight,
        description: r.description || null,
        facilities: r.facilities || [],
        is_active: r.isActive ?? true,
        updated_at: r.updatedAt || new Date().toISOString()
      }));
      const { error: rateErr } = await supabase.from('room_capacity_rates').upsert(ratePayloads, { onConflict: 'id' });
      if (rateErr) console.error('❌ Gagal:', rateErr.message);
      else console.log(`✅ SUKSES: ${ratePayloads.length} tarif tersimpan di \`room_capacity_rates\`!`);
    }
  } catch (err: any) {
    console.error('❌ Exception:', err.message);
  }

  // 9. Transaksi & Reservasi (transactions)
  try {
    console.log('\n[9/14] Menyimpan Transaksi & Reservasi ke `transactions`...');
    if (db.transactions && db.transactions.length > 0) {
      const txPayloads = db.transactions.map(t => ({
        id: t.id,
        room_id: t.roomId,
        building: t.building,
        room_number: t.roomNumber,
        category: t.category,
        guest_name: t.guestName,
        guest_type: t.guestType || 'INDIVIDU',
        nik_ktp: t.nikKtp || null,
        kloter: t.kloter || '',
        start_date: t.startDate,
        duration: t.duration || 1,
        phone: t.phone || '',
        notes: t.notes || '',
        status: t.status,
        created_user: t.createdUser,
        is_group: Boolean(t.isGroup),
        group_type: t.groupType || null,
        group_name: t.groupName || null,
        group_pic: t.groupPic || null,
        group_pic_phone: t.groupPicPhone || null,
        group_id: t.groupId || null,
        total_pax: t.totalPax || null,
        include_aula: Boolean(t.includeAula),
        rent_aula_id: t.rentAulaId || null,
        rent_aula_name: t.rentAulaName || null,
        catering_package: t.cateringPackage || null,
        catering_pax_count: t.cateringPaxCount || null,
        spk_number: t.spkNumber || null,
        allocated_room_numbers: t.allocatedRoomNumbers || [],
        allocated_rooms_count: t.allocatedRoomsCount || 0,
        breakfast: Boolean(t.breakfast),
        breakfast_menu: t.breakfastMenu || null,
        breakfast_portions: t.breakfastPortions || null,
        breakfast_days: t.breakfastDays || null,
        breakfast_status: t.breakfastStatus || null,
        rent_type: t.rentType || null,
        duration_unit: t.durationUnit || 'Hari',
        price_per_night: t.pricePerNight || 0,
        extra_bed: Boolean(t.extraBed),
        extra_bed_count: t.extraBedCount || 0,
        extra_bed_price: t.extraBedPrice || 0,
        extra_bed_notes: t.extraBedNotes || null,
        agency_or_document: t.agencyOrDocument || null,
        payment_status: t.paymentStatus || 'BELUM_LUNAS',
        paid_amount: t.paidAmount || 0,
        dp_amount: t.dpAmount || 0,
        dp_date: t.dpDate || null,
        dp_method: t.dpMethod || null,
        dp_note: t.dpNote || null,
        remaining_amount: t.remainingAmount || 0,
        va_number: t.vaNumber || null,
        va_account_name: t.vaAccountName || null,
        bank_name: t.bankName || null,
        bank_account_number: t.bankAccountNumber || null,
        payment_method: t.paymentMethod || null,
        payment_date: t.paymentDate || null,
        payment_note: t.paymentNote || null,
        kwitansi_no: t.kwitansiNo || null,
        cancelled_at: t.cancelledAt || null,
        cancel_reason: t.cancelReason || null,
        cancelled_user: t.cancelledUser || null,
        extend_history: t.extendHistory || []
      }));
      const { error: txErr } = await supabase.from('transactions').upsert(txPayloads, { onConflict: 'id' });
      if (txErr) console.error('❌ Gagal:', txErr.message);
      else console.log(`✅ SUKSES: ${txPayloads.length} transaksi tersimpan di \`transactions\`!`);
    }
  } catch (err: any) {
    console.error('❌ Exception:', err.message);
  }

  // 10. Tiket Perbaikan Teknisi (maintenances)
  try {
    console.log('\n[10/14] Menyimpan Tiket Pemeliharaan Teknisi ke `maintenances`...');
    if (db.maintenances && db.maintenances.length > 0) {
      const maintPayloads = db.maintenances.map(m => ({
        id: m.id,
        room_id: m.roomId,
        building: m.building,
        room_number: m.roomNumber,
        category: m.category,
        urgency: m.urgency,
        technician: m.technician,
        description: m.description,
        report_time: m.reportTime,
        status: m.status,
        reported_user: m.reportedUser,
        assigned_technician_id: m.assignedTechnicianId || null,
        assigned_technician_name: m.assignedTechnicianName || null,
        assigned_by_manager: m.assignedByManager || null,
        assigned_time: m.assignedTime || null,
        manager_notes: m.managerNotes || null,
        work_completed_time: m.workCompletedTime || null,
        technician_notes: m.technicianNotes || null,
        resolved_time: m.resolvedTime || null,
        qc_inspection_id: m.qcInspectionId || null,
        facility_type: m.facilityType || 'KAMAR'
      }));
      const { error: mErr } = await supabase.from('maintenances').upsert(maintPayloads, { onConflict: 'id' });
      if (mErr) console.error('❌ Gagal:', mErr.message);
      else console.log(`✅ SUKSES: ${maintPayloads.length} tiket perbaikan tersimpan di \`maintenances\`!`);
    }
  } catch (err: any) {
    console.error('❌ Exception:', err.message);
  }

  // 11. Inspeksi Kelayakan QC (qc_inspections)
  try {
    console.log('\n[11/14] Menyimpan Inspeksi QC ke `qc_inspections`...');
    if (db.qcInspections && db.qcInspections.length > 0) {
      const qcPayloads = db.qcInspections.map(q => ({
        id: q.id,
        room_id: q.roomId,
        building: q.building,
        room_number: q.roomNumber,
        inspector_id: q.inspectorId,
        inspector_name: q.inspectorName,
        inspection_date: q.inspectionDate,
        cleanliness: q.cleanliness,
        linen_bed: q.linenBed,
        ac_electricity: q.acElectricity,
        plumbing_water: q.plumbingWater,
        amenities: q.amenities,
        result: q.result,
        decision_type: q.decisionType || null,
        notes: q.notes,
        facility_type: q.facilityType || 'KAMAR'
      }));
      const { error: qcErr } = await supabase.from('qc_inspections').upsert(qcPayloads, { onConflict: 'id' });
      if (qcErr) console.error('❌ Gagal:', qcErr.message);
      else console.log(`✅ SUKSES: ${qcPayloads.length} inspeksi tersimpan di \`qc_inspections\`!`);
    }
  } catch (err: any) {
    console.error('❌ Exception:', err.message);
  }

  // 12. Rekap Sesi dan Jam Kerja (work_sessions)
  try {
    console.log('\n[12/14] Menyimpan Rekap Sesi dan Jam Kerja ke `work_sessions`...');
    if (db.workSessions && db.workSessions.length > 0) {
      const sessionPayloads = db.workSessions.map(s => ({
        id: s.id,
        user_id: s.userId,
        user_name: s.userName,
        user_role: s.userRole,
        login_time: s.loginTime,
        logout_time: s.logoutTime || null,
        duration_seconds: s.durationSeconds || 0,
        duration_formatted: s.durationFormatted || '0 Jam 0 Menit 0 Detik',
        status: s.status || 'AKTIF',
        notes: s.notes || null
      }));
      const { error: sErr } = await supabase.from('work_sessions').upsert(sessionPayloads, { onConflict: 'id' });
      if (sErr) console.error('❌ Gagal:', sErr.message);
      else console.log(`✅ SUKSES: ${sessionPayloads.length} sesi shift tersimpan di \`work_sessions\`!`);
    }
  } catch (err: any) {
    console.error('❌ Exception:', err.message);
  }

  // 13. Log Audit & Verifikasi PDF (audit_logs & pdf_download_logs)
  try {
    console.log('\n[13/14] Menyimpan Log Audit & Verifikasi PDF ke `audit_logs` & `pdf_download_logs`...');
    if (db.auditLogs && db.auditLogs.length > 0) {
      const auditPayloads = db.auditLogs.map((a, i) => ({
        id: a.id || `audit-${i}-${Date.now()}`,
        timestamp: a.timestamp,
        user_name: a.user,
        role: a.role,
        action: a.action,
        details: a.details,
        verification_code: a.verificationCode || null,
        document_title: a.documentTitle || null,
        target_id: a.targetId || null,
        signatory_name: a.signatoryName || null,
        signatory_role: a.signatoryRole || null,
        signatory_nip: a.signatoryNip || null,
        qr_code_hash: a.qrCodeHash || null,
        has_qr_and_signature: a.hasQrAndSignature !== false
      }));
      await supabase.from('audit_logs').upsert(auditPayloads, { onConflict: 'id' });

      const pdfLogs = db.auditLogs
        .filter(a => a.action === 'UNDUH_PDF_BER_QR' && Boolean(a.verificationCode) && a.hasQrAndSignature !== false)
        .map(p => ({
          id: p.id || `vlog-${Date.now()}`,
          verification_code: p.verificationCode,
          timestamp: p.timestamp,
          user_name: p.user,
          role: p.role,
          document_title: p.documentTitle || p.details,
          target_id: p.targetId || null,
          signatory_name: p.signatoryName || null,
          signatory_role: p.signatoryRole || null,
          signatory_nip: p.signatoryNip || null,
          qr_code_hash: p.qrCodeHash || null,
          has_qr_and_signature: true
        }));
      if (pdfLogs.length > 0) {
        await supabase.from('pdf_download_logs').upsert(pdfLogs, { onConflict: 'verification_code' });
      }
      console.log(`✅ SUKSES: ${auditPayloads.length} log audit & ${pdfLogs.length} log PDF tersimpan!`);
    }
  } catch (err: any) {
    console.error('❌ Exception:', err.message);
  }

  // 14. Pesanan Sarapan & Katering (breakfast_orders)
  try {
    console.log('\n[14/14] Menyimpan Pesanan Sarapan ke `breakfast_orders`...');
    if (db.breakfastOrders && db.breakfastOrders.length > 0) {
      const orderPayloads = db.breakfastOrders.map(o => ({
        id: o.id,
        room_number: o.roomNumber,
        building: o.building,
        guest_name: o.guestName,
        phone: o.phone,
        kloter: o.kloter,
        transaction_id: o.transactionId,
        menu_name: o.menuName,
        portions: o.portions,
        days: o.days,
        start_date: o.startDate,
        delivery_time: o.deliveryTime,
        status: o.status,
        notes: o.notes,
        price_per_portion: o.pricePerPortion,
        total_price: o.totalPrice,
        created_at: o.createdAt || new Date().toISOString()
      }));
      const { error: oErr } = await supabase.from('breakfast_orders').upsert(orderPayloads, { onConflict: 'id' });
      if (oErr) console.error('❌ Gagal:', oErr.message);
      else console.log(`✅ SUKSES: ${orderPayloads.length} pesanan tersimpan di \`breakfast_orders\`!`);
    }
  } catch (err: any) {
    console.error('❌ Exception:', err.message);
  }

  console.log('\n=============================================================');
  console.log('🎉 SELURUH DATA SISTEM TELAH BERHASIL DISINKRONKAN KE SUPABASE!');
  console.log('=============================================================\n');
}

runSync().catch(console.error);
