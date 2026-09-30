import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Transaction, Room } from "../types"
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
  
  const idxA = BUILDING_ORDER.findIndex(o => strA.toLowerCase().includes(o.toLowerCase()) || o.toLowerCase().includes(strA.toLowerCase()));
  const idxB = BUILDING_ORDER.findIndex(o => strB.toLowerCase().includes(o.toLowerCase()) || o.toLowerCase().includes(strB.toLowerCase()));
  
  if (idxA !== -1 && idxB !== -1) return idxA - idxB;
  if (idxA !== -1) return -1;
  if (idxB !== -1) return 1;
  return strA.localeCompare(strB);
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
 * Angka pertama pada nomor kamar menunjukkan lantai tempat kamar berada (contoh: 101 -> Lantai 1, 201 -> Lantai 2, A-105 -> A-205).
 */
export function updateRoomNumberWithFloor(currentRoomNumber: string, newFloor: number, bldCode?: string): string {
  const safeFloor = Math.max(1, Math.min(20, newFloor || 1));
  const trimmed = (currentRoomNumber || '').trim();

  if (!trimmed) {
    const pfx = bldCode ? `${bldCode.trim().toUpperCase()}-` : '';
    return `${pfx}${safeFloor}01`;
  }

  // Cari kelompok angka pertama di dalam string nomor kamar
  const match = trimmed.match(/^(.*?)(\d+)(.*?)$/);
  if (match) {
    const prefix = match[1];
    const digits = match[2];
    const suffix = match[3];

    let newDigits = '';
    if (digits.length >= 2) {
      // Ganti angka pertama dengan safeFloor
      newDigits = `${safeFloor}${digits.slice(1)}`;
    } else {
      newDigits = `${safeFloor}01`;
    }
    return `${prefix}${newDigits}${suffix}`;
  }

  // Jika belum ada angka sama sekali di nomor kamar
  const separator = trimmed.endsWith('-') ? '' : '-';
  return `${trimmed}${separator}${safeFloor}01`;
}

/**
 * Mendeteksi lantai dari angka pertama pada urutan digit nomor kamar.
 * Contoh: "101" -> 1, "205" -> 2, "A-302" -> 3, "B-412" -> 4.
 */
export function extractFloorFromRoomNumber(roomNum: string): number | null {
  if (!roomNum) return null;
  const match = roomNum.match(/\d+/);
  if (match && match[0].length > 0) {
    const firstDigit = parseInt(match[0][0], 10);
    if (!isNaN(firstDigit) && firstDigit >= 1 && firstDigit <= 20) {
      return firstDigit;
    }
  }
  return null;
}

/**
 * Menghitung nomor kamar berikutnya secara otomatis berdasarkan kamar terakhir yang terdaftar
 * pada gedung dan lantai yang dipilih.
 * Contoh:
 * - Jika terdaftar di lantai 1 kamar terakhir A-101 -> otomatis A-102.
 * - Jika mengetik lantai 2 dan kamar terakhir A-210 -> otomatis A-211.
 * - Jika di lantai tersebut belum ada kamar -> otomatis <Prefix><Floor>01 (misal A-101 atau A-201).
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

  // Tentukan prefix gedung (misal "A-", "B-", "C-")
  let prefix = '';
  if (buildingCode && buildingCode.trim()) {
    prefix = `${buildingCode.trim().toUpperCase()}-`;
  } else if (buildingRooms.length > 0) {
    const sample = buildingRooms.find(r => r.roomNumber && r.roomNumber.includes('-'));
    if (sample) {
      const match = sample.roomNumber.match(/^([A-Za-z0-9]+-)/);
      if (match) prefix = match[1];
    }
  }

  if (!prefix && buildingName) {
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
  let maxNumber = 0;
  let detectedFloorPrefix = prefix;
  let targetPadLength = 3;

  floorRooms.forEach(r => {
    const raw = (r.roomNumber || '').trim();
    // Tangkap prefix dan angka terakhir, contoh: "A-101" -> prefix "A-", digits "101"
    const match = raw.match(/^(.*?)([0-9]+)$/);
    if (match) {
      const pfx = match[1];
      const numStr = match[2];
      const num = parseInt(numStr, 10);
      if (!isNaN(num) && num > maxNumber) {
        maxNumber = num;
        detectedFloorPrefix = pfx;
        targetPadLength = numStr.length;
      }
    }
  });

  if (maxNumber > 0) {
    const nextNumber = maxNumber + 1;
    const nextNumStr = String(nextNumber).padStart(targetPadLength, '0');
    return `${detectedFloorPrefix || prefix}${nextNumStr}`;
  }

  return `${prefix}${safeFloor}01`;
}

