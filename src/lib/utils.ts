import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Transaction, Room, RoomCapacityRate, MeetingRoom } from "../types"
import QRCode from 'qrcode';
import { dataStorage } from "../services/dataStorage";

const cachedLogoImages = new Map<string, HTMLImageElement>();

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getRealTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getRealLocalDateTimeStr(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

export function parseLocalTimeString(str: string | null | undefined): Date {
  if (!str) return new Date();
  const [datePart, timePart] = str.trim().split(' ');
  if (!datePart) return new Date();
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss] = (timePart || '00:00:00').split(':').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return new Date();
  return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0);
}

export function getRealDateWithOffset(offsetDays: number = 1): string {
  const target = new Date();
  target.setDate(target.getDate() + offsetDays);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatIndonesianDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function addDaysToDateStr(dateStr: string, days: number = 1): string {
  if (!dateStr) return getRealDateWithOffset(days);
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const target = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  target.setDate(target.getDate() + days);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatRupiah(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
}

export function angkaKeTerbilang(nilai: number): string {
  if (isNaN(nilai) || nilai <= 0) return 'Nol Rupiah';
  const satuan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  
  function konversi(n: number): string {
    if (n < 12) return satuan[n];
    if (n < 20) return konversi(n - 10) + ' Belas';
    if (n < 100) return konversi(Math.floor(n / 10)) + ' Puluh' + (n % 10 !== 0 ? ' ' + konversi(n % 10) : '');
    if (n < 200) return 'Seratus' + (n - 100 !== 0 ? ' ' + konversi(n - 100) : '');
    if (n < 1000) return konversi(Math.floor(n / 100)) + ' Ratus' + (n % 100 !== 0 ? ' ' + konversi(n % 100) : '');
    if (n < 2000) return 'Seribu' + (n - 1000 !== 0 ? ' ' + konversi(n - 1000) : '');
    if (n < 1000000) return konversi(Math.floor(n / 1000)) + ' Ribu' + (n % 1000 !== 0 ? ' ' + konversi(n % 1000) : '');
    if (n < 1000000000) return konversi(Math.floor(n / 1000000)) + ' Juta' + (n % 1000000 !== 0 ? ' ' + konversi(n % 1000000) : '');
    if (n < 1000000000000) return konversi(Math.floor(n / 1000000000)) + ' Miliar' + (n % 1000000000 !== 0 ? ' ' + konversi(n % 1000000000) : '');
    return konversi(Math.floor(n / 1000000000000)) + ' Triliun' + (n % 1000000000000 !== 0 ? ' ' + konversi(n % 1000000000000) : '');
  }

  return konversi(Math.round(nilai)).trim() + ' Rupiah';
}

export function formatIndonesianDateTime(dateTimeStr: string | null | undefined): string {
  if (!dateTimeStr) return '-';
  const parts = dateTimeStr.split(' ');
  const datePart = parts[0];
  const timePart = parts[1] || '';
  const indDate = formatIndonesianDate(datePart);
  return timePart ? `${indDate}, ${timePart} WIB` : indDate;
}

export const BUILDING_ORDER = [
  'Gedung A (Arafah)',
  'Gedung B (Muzdalifah)',
  'Gedung C (Mina)',
  'Gedung D (Madinah)',
  'Gedung D2',
  'Gedung D3',
  'Gedung D4',
  'Gedung D5',
  'Gedung E',
  'Gedung G',
  'Gedung H',
  'Gedung Utama',
  'Gedung Serbaguna (SG)',
  'Ruang Pertemuan / Aula',
  'Ruang Pertemuan',
];

/**
 * Checks if a building or room represents meeting / multipurpose / hall facilities
 */
export function isMeetingFacility(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return lower.includes('ruang pertemuan') || 
         lower.includes('aula') || 
         lower.includes('serbaguna') ||
         lower.includes('auditorium') ||
         lower.includes('gedung sg') ||
         lower.includes('multipurpose') ||
         lower.includes('sg-') ||
         lower.includes('sg 1') ||
         lower.includes('sg 2') ||
         lower.includes('meeting') ||
         lower.includes('rapat');
}

/**
 * Compares building names to ensure consistent sorting:
 * 1. Standard residential buildings (A, B, C, D, etc.) first
 * 2. Ruang Pertemuan / Aula (fasilitas serbaguna & rapat) strictly at the very bottom
 */
export function compareBuildingOrder(a?: string | null, b?: string | null): number {
  const strA = (a || '').trim();
  const strB = (b || '').trim();
  if (strA === strB) return 0;
  if (!strA) return 1;
  if (!strB) return -1;

  const isAMeeting = isMeetingFacility(strA);
  const isBMeeting = isMeetingFacility(strB);
  
  // Meeting rooms / Aula / Serbaguna always strictly at the bottom
  if (isAMeeting && !isBMeeting) return 1;
  if (!isAMeeting && isBMeeting) return -1;
  
  const normA = normalizeBuildingName(strA).toLowerCase();
  const normB = normalizeBuildingName(strB).toLowerCase();

  const idxA = BUILDING_ORDER.findIndex(o => o.toLowerCase() === normA || o.toLowerCase() === strA.toLowerCase());
  const idxB = BUILDING_ORDER.findIndex(o => o.toLowerCase() === normB || o.toLowerCase() === strB.toLowerCase());
  
  if (idxA !== -1 && idxB !== -1) return idxA - idxB;
  if (idxA !== -1) return -1;
  if (idxB !== -1) return 1;
  return strA.localeCompare(strB, undefined, { numeric: true });
}

export function getTxDays(t: Transaction): number {
  if (t.rentAulaDurationDays && t.rentAulaDurationDays >= 1) {
    return t.rentAulaDurationDays;
  }
  if (t.durationUnit === 'Hari') {
    return t.duration >= 24 ? Math.ceil(t.duration / 24) : Math.max(1, t.duration);
  }
  if (t.duration >= 24) {
    return Math.ceil(t.duration / 24);
  }
  return 1;
}

export function checkMeetingRoomAvailability(
  roomId: string,
  startDate: string,
  duration: number,
  transactions: Transaction[],
  excludeTxId?: string,
  durationUnit?: string,
  daysCount?: number
): { isValid: boolean; message?: string } {
  const isEightHours = duration === 8;
  const isHourly = durationUnit === 'Jam' || duration === 8 || duration === 4 || duration === 12;
  const proposedDays = daysCount && daysCount >= 1
    ? daysCount
    : (durationUnit === 'Hari' || (!isHourly && duration < 24 && duration >= 1))
    ? (duration >= 24 ? Math.ceil(duration / 24) : Math.max(1, duration))
    : (duration >= 24 ? Math.ceil(duration / 24) : 1);

  const datesToCheck: string[] = [];
  for (let i = 0; i < proposedDays; i++) {
    datesToCheck.push(addDaysToDateStr(startDate, i));
  }

  for (const dateStr of datesToCheck) {
    const activeTxsOnDate = transactions.filter(t => {
      if (t.roomId !== roomId) return false;
      if (t.status === 'DIBATALKAN' || t.status === 'SELESAI') return false;
      if (excludeTxId && t.id === excludeTxId) return false;

      const tDays = getTxDays(t);
      for (let j = 0; j < tDays; j++) {
        if (addDaysToDateStr(t.startDate, j) === dateStr) {
          return true;
        }
      }
      return false;
    });

    const has12OrMultiDay = activeTxsOnDate.some(t => t.duration >= 12 || t.durationUnit === 'Hari' || t.duration >= 24);
    const count8 = activeTxsOnDate.filter(t => (t.duration === 8 || (t.duration < 12 && t.durationUnit !== 'Hari'))).length;

    if (isEightHours) {
      if (has12OrMultiDay) {
        return {
          isValid: false,
          message: `Pada tanggal ${formatIndonesianDate(dateStr)}, ruang pertemuan sudah disewa paket 12 Jam / Multi-hari. Silakan ganti ke tanggal lain yang kosong.`
        };
      }
      if (count8 >= 2) {
        return {
          isValid: false,
          message: `Pada tanggal ${formatIndonesianDate(dateStr)}, ruang pertemuan sudah mencapai batas maksimal 2 penyewa (2x 8 Jam). Silakan ganti ke tanggal lain yang kosong.`
        };
      }
    } else {
      if (activeTxsOnDate.length > 0) {
        return {
          isValid: false,
          message: `Pada tanggal ${formatIndonesianDate(dateStr)}, ruang pertemuan sudah memiliki jadwal penyewaan aktif (ada penyewa 8 Jam atau 12 Jam / Multi-hari). Pemesanan 12 Jam hingga berhari-hari memerlukan ruangan kosong penuh. Silakan ganti ke tanggal lain yang kosong.`
        };
      }
    }
  }

  return { isValid: true };
}

export function generateQrCodeDataUrl(text: string): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    // Fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 180, 180);

    const primaryColor = '#164e63'; // Rich dark teal / cyan matching reference

    // Generate actual standard-compliant QR matrix using qrcode library with high error correction ('H')
    const qr = QRCode.create(text || 'UPT-ASRAMA-VERIFIED', { errorCorrectionLevel: 'H' });
    const qrSize = qr.modules.size;
    const qrData = qr.modules.data;

    // Presisi simetris: Hitung ukuran sel dan margin agar QR code benar-benar berada tepat di tengah kanvas
    const availableSize = 160;
    const cellSize = availableSize / qrSize;
    const actualQrSize = qrSize * cellSize;
    const marginX = (canvas.width - actualQrSize) / 2;
    const marginY = (canvas.height - actualQrSize) / 2;

    // Draw data modules
    ctx.fillStyle = primaryColor;
    for (let row = 0; row < qrSize; row++) {
      for (let col = 0; col < qrSize; col++) {
        // Skip finder pattern zones (top-left 7x7, top-right 7x7, bottom-left 7x7)
        const isTopLeftFinder = row < 7 && col < 7;
        const isTopRightFinder = row < 7 && col >= qrSize - 7;
        const isBottomLeftFinder = row >= qrSize - 7 && col < 7;
        if (isTopLeftFinder || isTopRightFinder || isBottomLeftFinder) continue;

        // Skip center emblem zone (center modules)
        const centerModule = Math.floor(qrSize / 2);
        if (row >= centerModule - 3 && row <= centerModule + 3 && col >= centerModule - 3 && col <= centerModule + 3) {
          continue;
        }

        const idx = row * qrSize + col;
        if (qrData[idx]) {
          const x = marginX + col * cellSize;
          const y = marginY + row * cellSize;
          if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, y, cellSize * 0.92, cellSize * 0.92, 1);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, cellSize * 0.92, cellSize * 0.92);
          }
        }
      }
    }

    // Draw stylized finder patterns (Top-Left, Top-Right, Bottom-Left)
    const drawFinderPattern = (startX: number, startY: number) => {
      const boxSize = 7 * cellSize;
      ctx.fillStyle = primaryColor;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(startX, startY, boxSize, boxSize, 6);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(startX + cellSize * 1.2, startY + cellSize * 1.2, boxSize - cellSize * 2.4, boxSize - cellSize * 2.4, 4);
        ctx.fill();

        ctx.fillStyle = primaryColor;
        ctx.beginPath();
        ctx.roundRect(startX + cellSize * 2.2, startY + cellSize * 2.2, boxSize - cellSize * 4.4, boxSize - cellSize * 4.4, 2);
        ctx.fill();
      } else {
        ctx.fillRect(startX, startY, boxSize, boxSize);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(startX + cellSize * 1.2, startY + cellSize * 1.2, boxSize - cellSize * 2.4, boxSize - cellSize * 2.4);
        ctx.fillStyle = primaryColor;
        ctx.fillRect(startX + cellSize * 2.2, startY + cellSize * 2.2, boxSize - cellSize * 4.4, boxSize - cellSize * 4.4);
      }
    };

    drawFinderPattern(marginX, marginY);
    drawFinderPattern(marginX + (qrSize - 7) * cellSize, marginY);
    drawFinderPattern(marginX, marginY + (qrSize - 7) * cellSize);

    // Center Web Logo / Emblem - Terletak presisi di titik tengah kanvas (90, 90)
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const logoRadius = 20;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(centerX, centerY, logoRadius + 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, logoRadius + 2, 0, Math.PI * 2);
    ctx.stroke();

    let logoDrawn = false;
    try {
      const appSettings = dataStorage.getAppSettings();
      const appLogo = appSettings?.appLogo;
      if (appLogo && (appLogo.startsWith('data:image/') || appLogo.startsWith('http'))) {
        let cachedImg = cachedLogoImages.get(appLogo);
        if (!cachedImg) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = appLogo;
          cachedLogoImages.set(appLogo, img);
          cachedImg = img;
        }
        if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(centerX, centerY, logoRadius, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(cachedImg, centerX - logoRadius, centerY - logoRadius, logoRadius * 2, logoRadius * 2);
          ctx.restore();
          logoDrawn = true;
        }
      }
    } catch (e) {
      // ignore
    }

    if (!logoDrawn) {
      ctx.fillStyle = primaryColor;
      ctx.beginPath();
      ctx.arc(centerX, centerY, logoRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fef08a'; // gold inner seal
      ctx.beginPath();
      ctx.arc(centerX, centerY, logoRadius - 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0f172a'; // dark core
      ctx.beginPath();
      ctx.arc(centerX, centerY, logoRadius - 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    return canvas.toDataURL('image/png');
  } catch (e) {
    return '';
  }
}

/**
 * Memastikan tanda tangan memiliki warna tinta hitam pekat (#0f172a atau #000000)
 * dengan transparansi latar belakang yang rapi saat disematkan ke dalam berkas PDF.
 */
export function ensureBlackSignatureDataUrl(signatureDataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    if (!signatureDataUrl || !signatureDataUrl.startsWith('data:image/')) {
      resolve(signatureDataUrl);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || img.width || 360;
        c.height = img.naturalHeight || img.height || 160;
        const ctx = c.getContext('2d');
        if (!ctx) {
          resolve(signatureDataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, c.width, c.height);
        const data = imgData.data;
        // Ubah semua goresan/tinta menjadi hitam (#0f172a) dengan mempertahankan kehalusan transparansi (alpha channel)
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha > 15) {
            data[i] = 15;     // R
            data[i + 1] = 23; // G
            data[i + 2] = 42; // B
          }
        }
        ctx.putImageData(imgData, 0, 0);
        resolve(c.toDataURL('image/png'));
      } catch (e) {
        resolve(signatureDataUrl);
      }
    };
    img.onerror = () => resolve(signatureDataUrl);
    img.src = signatureDataUrl;
  });
}

/**
 * Memperbarui nomor kamar secara otomatis ketika nomor lantai ("Lantai Ke-") diubah/diisi.
 * Mengikuti konvensi baku UPT Asrama Haji Jakarta:
 * Nomor lantai berada pada digit awal nomor unit kamar setelah pemisah/kode gedung (misal Gedung D5 Lantai 3 -> D5-301, Gedung A Lantai 2 -> A-201).
 */
export function updateRoomNumberWithFloor(currentRoomNumber: string, newFloor: number, bldCode?: string): string {
  const safeFloor = Math.max(1, Math.min(20, newFloor || 1));
  const trimmed = (currentRoomNumber || '').trim();

  // Jika string nomor kamar memiliki tanda pemisah '-' (contoh: "D5-201", "A-101", "SG-1")
  if (trimmed.includes('-')) {
    const lastHyphenIndex = trimmed.lastIndexOf('-');
    const prefix = trimmed.slice(0, lastHyphenIndex + 1); // contoh "D5-" atau "A-"
    const roomPart = trimmed.slice(lastHyphenIndex + 1).trim(); // contoh "201"

    const matchDigits = roomPart.match(/^(\d+)(.*)$/);
    if (matchDigits) {
      const digits = matchDigits[1];
      const suffix = matchDigits[2] || '';
      let newDigits = '';
      if (digits.length >= 3) {
        // Ganti digit lantai (angka pertama untuk 3 digit misal 201 -> 301, atau 2 digit awal untuk 4 digit misal 1001)
        if (digits.length === 3) {
          newDigits = `${safeFloor}${digits.slice(1)}`;
        } else {
          newDigits = `${safeFloor}${digits.slice(-2)}`;
        }
      } else {
        newDigits = `${safeFloor}01`;
      }
      return `${prefix}${newDigits}${suffix}`;
    }
    return `${prefix}${safeFloor}01`;
  }

  // Jika belum ada tanda pemisah '-', cek apakah diawali prefix gedung atau langsung angka
  const pfx = bldCode ? `${bldCode.trim().toUpperCase()}-` : '';
  if (!trimmed) {
    return `${pfx}${safeFloor}01`;
  }

  const matchLettersDigits = trimmed.match(/^([A-Za-z]+)(\d*)$/);
  if (matchLettersDigits) {
    const letters = matchLettersDigits[1];
    return `${letters}-${safeFloor}01`;
  }

  const pureDigitsMatch = trimmed.match(/^(\d+)$/);
  if (pureDigitsMatch) {
    const digits = pureDigitsMatch[1];
    if (digits.length >= 2) {
      return `${pfx}${safeFloor}${digits.slice(1)}`;
    }
    return `${pfx}${safeFloor}01`;
  }

  return `${pfx}${safeFloor}01`;
}

/**
 * Mendeteksi lantai dari digit nomor unit kamar (bukan dari digit kode gedung).
 * Contoh:
 * - "D5-301" -> 3 (lantai 3, bukan 5)
 * - "A-205"  -> 2
 * - "101"    -> 1
 * - "B-1205" -> 12
 */
export function extractFloorFromRoomNumber(roomNum: string): number | null {
  if (!roomNum) return null;
  const trimmed = roomNum.trim();

  // Jika terdapat hyphen '-', ambil bagian kamar setelah hyphen terakhir
  let targetNumStr = trimmed;
  if (trimmed.includes('-')) {
    const lastHyphenIndex = trimmed.lastIndexOf('-');
    targetNumStr = trimmed.slice(lastHyphenIndex + 1).trim();
  }

  const match = targetNumStr.match(/\d+/);
  if (match && match[0].length > 0) {
    const numStr = match[0];
    if (numStr.length === 3) {
      const flr = parseInt(numStr[0], 10);
      if (!isNaN(flr) && flr >= 1 && flr <= 20) return flr;
    } else if (numStr.length >= 4) {
      const flr = parseInt(numStr.slice(0, numStr.length - 2), 10);
      if (!isNaN(flr) && flr >= 1 && flr <= 20) return flr;
    } else if (numStr.length >= 1) {
      const flr = parseInt(numStr[0], 10);
      if (!isNaN(flr) && flr >= 1 && flr <= 20) return flr;
    }
  }
  return null;
}

/**
 * Menghitung nomor kamar berikutnya secara otomatis berdasarkan kamar terakhir yang terdaftar
 * pada gedung dan lantai yang dipilih.
 * Contoh:
 * - Gedung D5 Lantai 3 -> D5-301 (atau D5-302 jika D5-301 sudah ada).
 * - Gedung A Lantai 2 -> A-201 (atau A-202 jika A-201 sudah ada).
 */
export function getNextRoomNumber(
  allRooms: Room[] = [],
  buildingName: string = '',
  floor: number = 1,
  buildingCode?: string
): string {
  const safeFloor = Math.max(1, Math.min(20, floor || 1));
  const bNameClean = (buildingName || '').trim().toLowerCase();

  // Filter kamar yang berada di gedung yang sama
  const buildingRooms = (allRooms || []).filter(r => 
    (r.building || '').trim().toLowerCase() === bNameClean
  );

  // Tentukan prefix gedung (misal "D5-", "A-", "B-", "SG-")
  let prefix = '';
  if (buildingCode && buildingCode.trim()) {
    const cleanCode = buildingCode.trim().toUpperCase();
    prefix = cleanCode.endsWith('-') ? cleanCode : `${cleanCode}-`;
  } else if (buildingRooms.length > 0) {
    const sample = buildingRooms.find(r => r.roomNumber && r.roomNumber.includes('-'));
    if (sample) {
      const lastHyphen = sample.roomNumber.lastIndexOf('-');
      prefix = sample.roomNumber.slice(0, lastHyphen + 1).toUpperCase();
    }
  }

  if (!prefix && buildingName) {
    // Tangkap kode gedung misal "Gedung D5 (Madinah)" -> "D5-", "Gedung A (Arafah)" -> "A-"
    const matchGedung = buildingName.match(/Gedung\s+([A-Za-z0-9]+)/i);
    if (matchGedung) {
      prefix = `${matchGedung[1].toUpperCase()}-`;
    }
  }

  // Filter kamar yang berada di lantai yang sama
  const floorRooms = buildingRooms.filter(r => {
    if (Number(r.floor) === safeFloor) return true;
    const detected = extractFloorFromRoomNumber(r.roomNumber);
    return detected === safeFloor;
  });

  if (floorRooms.length === 0) {
    return `${prefix}${safeFloor}01`;
  }

  // Cari nomor urut kamar terbesar di lantai ini
  let maxSeqNumber = 0;
  let detectedFloorPrefix = prefix;

  floorRooms.forEach(r => {
    const raw = (r.roomNumber || '').trim();
    if (raw.includes('-')) {
      const lastHyphenIndex = raw.lastIndexOf('-');
      detectedFloorPrefix = raw.slice(0, lastHyphenIndex + 1);
      const roomPart = raw.slice(lastHyphenIndex + 1).trim();
      const match = roomPart.match(/^(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeqNumber) {
          maxSeqNumber = num;
        }
      }
    } else {
      const match = raw.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeqNumber) {
          maxSeqNumber = num;
        }
      }
    }
  });

  if (maxSeqNumber > 0) {
    // Misal maxSeqNumber adalah 301 -> kamar berikutnya 302
    // Pastikan angka lantai tetap sesuai safeFloor
    const nextNumber = maxSeqNumber + 1;
    return `${detectedFloorPrefix || prefix}${nextNumber}`;
  }

  return `${prefix}${safeFloor}01`;
}

/**
 * Deduplikasi daftar konfigurasi tarif kapasitas kamar berdasarkan ID dan kombinasi roomType::bedType
 */
export function deduplicateRoomCapacityRates(rates: RoomCapacityRate[]): RoomCapacityRate[] {
  if (!Array.isArray(rates)) return [];
  const seenIds = new Set<string>();
  const seenCombos = new Set<string>();
  return rates.filter(r => {
    if (!r) return false;
    const idKey = String(r.id || '').trim();
    const comboKey = `${String(r.roomType || '').trim().toLowerCase()}::${String(r.bedType || '').trim().toLowerCase()}`;
    
    // Cegah duplikasi ID ataupun duplikasi kombinasi roomType dan bedType
    if (idKey && seenIds.has(idKey)) return false;
    if (comboKey !== '::' && seenCombos.has(comboKey)) return false;

    if (idKey) seenIds.add(idKey);
    if (comboKey !== '::') seenCombos.add(comboKey);
    return true;
  });
}

/**
 * Normalisasi nama gedung untuk mencegah inkonsistensi (misal: "Gedung A" vs "Gedung A (Arafah)")
 */
export function normalizeBuildingName(name: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  // Gedung spesifik D2, D3, D4, D5 harus dicek terlebih dahulu sebelum umum Gedung D / Madinah
  if (lower === 'gedung d2' || lower === 'd2' || lower.startsWith('gedung d2')) return 'Gedung D2';
  if (lower === 'gedung d3' || lower === 'd3' || lower.startsWith('gedung d3')) return 'Gedung D3';
  if (lower === 'gedung d4' || lower === 'd4' || lower.startsWith('gedung d4')) return 'Gedung D4';
  if (lower === 'gedung d5' || lower === 'd5' || lower.startsWith('gedung d5')) return 'Gedung D5';

  if (lower === 'gedung a' || lower === 'arafah' || lower.includes('arafah')) return 'Gedung A (Arafah)';
  if (lower === 'gedung b' || lower === 'muzdalifah' || lower.includes('muzdalifah')) return 'Gedung B (Muzdalifah)';
  if (lower === 'gedung c' || lower === 'mina' || lower.includes('mina')) return 'Gedung C (Mina)';
  if (lower === 'gedung d' || lower === 'gedung d1' || lower === 'madinah' || lower.includes('madinah')) return 'Gedung D (Madinah)';
  if (lower === 'gedung e' || lower === 'e') return 'Gedung E';
  if (lower === 'gedung g' || lower === 'g') return 'Gedung G';
  if (lower === 'gedung h' || lower === 'h') return 'Gedung H';
  if (lower === 'gedung utama' || lower === 'utama') return 'Gedung Utama';
  if (lower === 'gedung serbaguna' || lower === 'gedung serbaguna (sg)' || lower === 'sg' || lower.includes('serbaguna')) return 'Gedung Serbaguna (SG)';
  if (lower === 'ruang pertemuan' || lower === 'ruang pertemuan / aula' || lower === 'aula' || lower.includes('ruang pertemuan')) return 'Ruang Pertemuan / Aula';
  return trimmed;
}

/**
 * Helper terpadu dan akurat untuk menentukan nama gedung pengelompokan kamar/ruangan
 * Menghubungkan secara sinkron: Katalog Gedung & Fasilitas, Denah Penyewaan, dan Halaman QC
 */
export function getRoomBuildingKey(r: Room, meetingRooms?: MeetingRoom[]): string {
  if (!r) return '';

  // 1. Cek dari master meetingRooms jika terdaftar
  if (meetingRooms && meetingRooms.length > 0) {
    const matchingMr = meetingRooms.find(m => m.id === r.id || m.name.toLowerCase() === (r.roomNumber || '').toLowerCase());
    if (matchingMr) {
      if (matchingMr.category === 'SERBAGUNA') {
        return 'Gedung Serbaguna (SG)';
      }
      if (matchingMr.category === 'AULA' || matchingMr.category === 'RUANG_PERTEMUAN') {
        return 'Ruang Pertemuan / Aula';
      }
      if (matchingMr.building && matchingMr.building !== 'Ruang Pertemuan' && matchingMr.building !== 'Ruang Pertemuan / Aula' && matchingMr.building !== 'Gedung Serbaguna' && matchingMr.building !== 'Gedung Serbaguna (SG)') {
        return normalizeBuildingName(matchingMr.building);
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
  }

  // 2. Evaluasi tipe/kategori ruang serbaguna & aula
  if (r.building === 'Gedung Serbaguna (SG)' || r.building === 'Gedung Serbaguna' || r.type === 'Gedung Serbaguna (SG)') {
    return 'Gedung Serbaguna (SG)';
  }
  if (r.building === 'Ruang Pertemuan' || r.building === 'Ruang Pertemuan / Aula' || r.type === 'Ruang Pertemuan / Aula' || isMeetingFacility(r.building) || isMeetingFacility(r.type || '')) {
    return 'Ruang Pertemuan / Aula';
  }

  // 3. Evaluasi prefix nomor kamar untuk gedung khusus seperti D2, D3, D4, D5, D, A, B, C, E, G, H, Utama
  const rNum = (r.roomNumber || '').trim().toUpperCase();
  if (rNum.startsWith('D2-') || rNum.startsWith('D2 ')) return 'Gedung D2';
  if (rNum.startsWith('D3-') || rNum.startsWith('D3 ')) return 'Gedung D3';
  if (rNum.startsWith('D4-') || rNum.startsWith('D4 ')) return 'Gedung D4';
  if (rNum.startsWith('D5-') || rNum.startsWith('D5 ')) return 'Gedung D5';
  if (rNum.startsWith('D1-') || rNum.startsWith('D-')) return 'Gedung D (Madinah)';
  if (rNum.startsWith('A-')) return 'Gedung A (Arafah)';
  if (rNum.startsWith('B-')) return 'Gedung B (Muzdalifah)';
  if (rNum.startsWith('C-')) return 'Gedung C (Mina)';
  if (rNum.startsWith('E-')) return 'Gedung E';
  if (rNum.startsWith('G-')) return 'Gedung G';
  if (rNum.startsWith('H-')) return 'Gedung H';
  if (rNum.startsWith('GU-')) return 'Gedung Utama';

  return normalizeBuildingName(r.building);
}


