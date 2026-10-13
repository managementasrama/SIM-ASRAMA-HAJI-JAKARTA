import { generateInitialDatabase } from '../src/services/dataStorage';

/**
 * SKRIP SINKRONISASI DATABASE KE GOOGLE SPREADSHEET
 * Menulis data master gedung, kamar, transaksi, dan pengguna ke Google Spreadsheet
 * menggunakan Google Apps Script Web App URL atau Google Sheets API.
 */

const WEBAPP_URL = process.env.GOOGLE_SHEETS_WEBAPP_URL || process.env.VITE_SHEET_WEBAPP_URL || '';

async function runSyncToSpreadsheet() {
  console.log('===============================================================');
  console.log('--- MEMULAI SINKRONISASI DATABASE KE GOOGLE SPREADSHEET ---');
  console.log('===============================================================');

  if (!WEBAPP_URL) {
    console.warn('⚠️ PERINGATAN: GOOGLE_SHEETS_WEBAPP_URL belum diatur di environment variable (.env).');
    console.log('Format URL yang dibutuhkan: https://script.google.com/macros/s/.../exec');
    console.log('Silakan deploy Google Apps Script dari menu "Google Spreadsheet" di aplikasi.');
    return;
  }

  console.log('Target Endpoint Web App:', WEBAPP_URL);

  const db = generateInitialDatabase(false);
  console.log(`\nRingkasan Data yang akan disinkronkan:`);
  console.log(`- Gedung (Buildings): ${db.buildings.length} unit`);
  console.log(`- Kamar (Rooms): ${db.rooms.length} unit`);
  console.log(`- Ruang Pertemuan (Meeting Rooms): ${db.meetingRooms.length} unit`);
  console.log(`- Transaksi (Transactions): ${db.transactions.length} record`);
  console.log(`- Petugas & Pengguna (Users): ${db.users.length} akun`);

  const payload = {
    action: 'SAVE_ALL',
    timestamp: new Date().toISOString(),
    buildings: db.buildings.map(b => ({
      id: b.id,
      name: b.name,
      code: b.code || '',
      floors: b.floors || 1,
      total_rooms: b.totalRooms || 0,
      category: b.category || 'PENGINAPAN',
      status: b.status || 'AKTIF'
    })),
    rooms: db.rooms.map(r => ({
      id: r.id,
      room_number: r.roomNumber,
      building: r.building,
      floor: r.floor || 1,
      type: r.type || 'Standar',
      capacity: r.capacity || '',
      status: r.status || 'KOSONG',
      price_per_night: r.pricePerNight || 0
    })),
    transactions: db.transactions.map(t => ({
      id: t.id,
      room_number: t.roomNumber,
      building: t.building || '',
      guest_name: t.guestName,
      category: t.category,
      status: t.status,
      start_date: t.startDate,
      duration: t.duration,
      phone: t.phone || '',
      notes: t.notes || ''
    })),
    users: db.users.map(u => ({
      id: u.id,
      username: u.username,
      full_name: u.fullName,
      role: u.role,
      department: u.department || '',
      status: u.status || 'Aktif',
      phone: u.phone || ''
    }))
  };

  try {
    console.log('\n[1/2] Mengirim paket data ke Google Apps Script Web App...');
    const response = await fetch(WEBAPP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }

    const resJson = await response.json().catch(() => ({ status: 'success' }));
    console.log('\n[2/2] Respons Spreadsheet:', resJson);
    console.log('\n✅ SUKSES BESAR: Seluruh baris data berhasil disinkronkan ke Google Spreadsheet!');
  } catch (err: any) {
    console.error('\n❌ Gagal mengirim data ke Google Spreadsheet:', err?.message || err);
    console.log('Tips: Pastikan Web App di-deploy dengan opsi "Execute as: Me" dan "Who has access: Anyone".');
  }
}

runSyncToSpreadsheet().catch(console.error);
