import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createHttpServer } from "http";

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app); // Menggunakan HTTP server terikat
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "50mb" }));

  // Disable aggressive caching on Vercel and server proxies for all API endpoints
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });

  // =========================================================================
  // REAL-TIME MULTI-USER HUB (WORK SESSIONS, LIVE PRESENCE & 2-WAY CHAT)
  // =========================================================================
  interface RealtimePresence {
    clientId: string;
    userId: string;
    userName: string;
    userRole: string;
    department?: string;
    assignedBuilding?: string;
    sessionId?: string;
    loginTime?: string;
    activeTab?: string;
    lastSeenMs: number;
  }

  interface RealtimeState {
    presences: Record<string, RealtimePresence>;
    workSessions: any[];
    chatChannels: any[];
    chatMessages: any[];
  }

  const realtimeState: RealtimeState = {
    presences: {},
    workSessions: [],
    chatChannels: [],
    chatMessages: [],
  };

  const sseClients = new Set<express.Response>();

  function broadcastRealtimeEvent(type: string, payload: any, senderClientId?: string) {
    const message = JSON.stringify({
      type,
      payload,
      senderClientId: senderClientId || null,
      timestamp: Date.now(),
    });
    for (const client of sseClients) {
      try {
        client.write(`data: ${message}\n\n`);
      } catch (_) {
        sseClients.delete(client);
      }
    }
  }

  // Cleanup stale presences older than 45 seconds
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [key, p] of Object.entries(realtimeState.presences)) {
      if (now - p.lastSeenMs > 45000) {
        delete realtimeState.presences[key];
        changed = true;
      }
    }
    if (changed) {
      broadcastRealtimeEvent("presence:sync", Object.values(realtimeState.presences));
    }
  }, 15000);

  // =========================================================================
  // GOOGLE SPREADSHEET DATABASE CONFIGURATION & REAL-TIME PROXY
  // Menggantikan Supabase secara penuh dengan Google Spreadsheet sebagai basis data utama
  // =========================================================================
  const sheetsConfigFilePath = path.join(process.cwd(), "google_sheets_config.json");
  const envFilePath = path.join(process.cwd(), ".env");

  function parseEnvForSheets(): { webAppUrl?: string; sheetId?: string; apiKey?: string } {
    try {
      if (fs.existsSync(envFilePath)) {
        const raw = fs.readFileSync(envFilePath, "utf-8");
        let webAppUrl: string | undefined;
        let sheetId: string | undefined;
        let apiKey: string | undefined;

        const urlMatch = raw.match(/(?:GOOGLE_SHEETS_WEBAPP_URL|VITE_SHEET_WEBAPP_URL)\s*=\s*["']?([^\r\n"']+)["']?/);
        if (urlMatch && urlMatch[1]) {
          webAppUrl = urlMatch[1].trim();
        }

        const idMatch = raw.match(/(?:GOOGLE_SHEETS_ID|VITE_GOOGLE_SHEETS_ID)\s*=\s*["']?([^\r\n"']+)["']?/);
        if (idMatch && idMatch[1]) {
          sheetId = idMatch[1].trim();
        }

        const keyMatch = raw.match(/GOOGLE_SHEETS_API_KEY\s*=\s*["']?([^\r\n"']+)["']?/);
        if (keyMatch && keyMatch[1]) {
          apiKey = keyMatch[1].trim();
        }

        return { webAppUrl, sheetId, apiKey };
      }
    } catch (_) {}
    return {};
  }

  const envSheetsConfig = parseEnvForSheets();
  let activeSheetsConfig = {
    webAppUrl: envSheetsConfig.webAppUrl || process.env.GOOGLE_SHEETS_WEBAPP_URL || process.env.VITE_SHEET_WEBAPP_URL || "",
    sheetId: envSheetsConfig.sheetId || process.env.GOOGLE_SHEETS_ID || process.env.VITE_GOOGLE_SHEETS_ID || "",
    apiKey: envSheetsConfig.apiKey || process.env.GOOGLE_SHEETS_API_KEY || "",
    isConfigured: false,
    updatedAt: new Date().toISOString(),
  };

  try {
    if (fs.existsSync(sheetsConfigFilePath)) {
      const rawCfg = fs.readFileSync(sheetsConfigFilePath, "utf-8");
      const parsed = JSON.parse(rawCfg);
      if (parsed) {
        activeSheetsConfig = {
          webAppUrl: parsed.webAppUrl || activeSheetsConfig.webAppUrl,
          sheetId: parsed.sheetId || activeSheetsConfig.sheetId,
          apiKey: parsed.apiKey || activeSheetsConfig.apiKey,
          isConfigured: Boolean(parsed.webAppUrl || activeSheetsConfig.webAppUrl),
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        };
      }
    } else if (activeSheetsConfig.webAppUrl) {
      activeSheetsConfig.isConfigured = true;
      fs.writeFileSync(sheetsConfigFilePath, JSON.stringify(activeSheetsConfig, null, 2), "utf-8");
    }
  } catch (err) {
    console.warn("Failed to load google_sheets_config.json:", err);
  }

  // File cache lokal di server untuk database authoritatif saat offline / backup
  const serverDbCachePath = path.join(process.cwd(), "server_database_cache.json");
  let serverDatabaseCache: any = null;
  try {
    if (fs.existsSync(serverDbCachePath)) {
      serverDatabaseCache = JSON.parse(fs.readFileSync(serverDbCachePath, "utf-8"));
    }
  } catch (_) {}

  // 1. Endpoint status konfigurasi Google Spreadsheet
  app.get("/api/sheets-config", (_req, res) => {
    res.json(activeSheetsConfig);
  });

  // 2. Endpoint simpan konfigurasi Google Spreadsheet
  app.post("/api/sheets-config", (req, res) => {
    const { webAppUrl, sheetId, apiKey } = req.body || {};
    const cleanUrl = String(webAppUrl || "").trim();
    const cleanSheetId = String(sheetId || "").trim();
    const cleanApiKey = String(apiKey || "").trim();

    activeSheetsConfig = {
      webAppUrl: cleanUrl,
      sheetId: cleanSheetId,
      apiKey: cleanApiKey,
      isConfigured: Boolean(cleanUrl),
      updatedAt: new Date().toISOString(),
    };

    process.env.GOOGLE_SHEETS_WEBAPP_URL = cleanUrl;
    process.env.VITE_SHEET_WEBAPP_URL = cleanUrl;
    if (cleanSheetId) process.env.GOOGLE_SHEETS_ID = cleanSheetId;

    try {
      fs.writeFileSync(sheetsConfigFilePath, JSON.stringify(activeSheetsConfig, null, 2), "utf-8");
      
      // Update .env file agar dev server & command line tools membaca konfigurasi ini
      let envContent = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, "utf-8") : "";
      if (cleanUrl) {
        if (envContent.includes("GOOGLE_SHEETS_WEBAPP_URL=")) {
          envContent = envContent.replace(/GOOGLE_SHEETS_WEBAPP_URL=.*/, `GOOGLE_SHEETS_WEBAPP_URL=${cleanUrl}`);
        } else {
          envContent += `\nGOOGLE_SHEETS_WEBAPP_URL=${cleanUrl}`;
        }
      }
      fs.writeFileSync(envFilePath, envContent, "utf-8");
    } catch (err) {
      console.warn("Gagal menyimpan google_sheets_config.json:", err);
    }

    broadcastRealtimeEvent("config:sheets", activeSheetsConfig);
    res.json({ ok: true, config: activeSheetsConfig });
  });

  // Skema Baku Database SIM Asrama Haji untuk Google Spreadsheet
  const APP_DATABASE_SCHEMA: Record<string, {
    sheetName: string;
    label: string;
    category: "Katalog & Master" | "Operasional & Transaksi" | "Sistem & Pengguna";
    headers: string[];
    description: string;
  }> = {
    buildings: {
      sheetName: "buildings",
      label: "Gedung & Properti",
      category: "Katalog & Master",
      headers: ["id", "name", "code", "floors", "total_rooms", "category", "status", "description"],
      description: "Data master gedung penginapan, asrama, dan aula",
    },
    rooms: {
      sheetName: "rooms",
      label: "Kamar & Unit Hunian",
      category: "Katalog & Master",
      headers: ["id", "room_number", "building", "floor", "type", "bed_type", "capacity", "status", "price_per_night", "notes"],
      description: "Master unit kamar hunian dan tarif per malam",
    },
    meeting_rooms: {
      sheetName: "meeting_rooms",
      label: "Ruang Pertemuan / Aula",
      category: "Katalog & Master",
      headers: ["id", "name", "building", "floor", "capacity", "rate_half_day", "rate_full_day", "status", "amenities"],
      description: "Ruang serbaguna, ballroom rapat, dan fasilitas aula",
    },
    room_capacity_rates: {
      sheetName: "room_capacity_rates",
      label: "Katalog Tipe Kamar & Tarif Kapasitas",
      category: "Katalog & Master",
      headers: ["id", "room_type", "bed_type", "capacity_pax", "price_per_night", "description", "facilities", "is_active"],
      description: "Master tipe kamar (Ekonomi, Standar, Superior), varian bed (Double s/d 8 Single Bed), pax, dan tarif per malam",
    },
    breakfast_menu_items: {
      sheetName: "breakfast_menu_items",
      label: "Katalog Menu Katering & Sarapan",
      category: "Katalog & Master",
      headers: ["id", "name", "category", "price", "description", "is_available", "allergens"],
      description: "Katalog menu makanan, minuman, dan kudapan sarapan koperasi",
    },
    transactions: {
      sheetName: "transactions",
      label: "Reservasi & Tamu",
      category: "Operasional & Transaksi",
      headers: ["id", "room_number", "building", "guest_name", "category", "status", "start_date", "duration", "phone", "email", "notes", "total_amount", "payment_status"],
      description: "Buku tamu, catatan check-in/out, dan reservasi aktif",
    },
    users: {
      sheetName: "users",
      label: "Pengguna & Petugas",
      category: "Sistem & Pengguna",
      headers: ["id", "username", "full_name", "role", "department", "status", "phone", "email"],
      description: "Daftar akun staf resepsionis, bendahara, QC, dan teknisi",
    },
    maintenances: {
      sheetName: "maintenances",
      label: "Perawatan Fasilitas",
      category: "Operasional & Transaksi",
      headers: ["id", "room_number", "building", "issue", "urgency", "status", "reporter", "created_at", "resolved_at", "notes"],
      description: "Log kerusakan dan perbaikan fasilitas asrama",
    },
    qc_inspections: {
      sheetName: "qc_inspections",
      label: "Inspeksi Mutu QC",
      category: "Operasional & Transaksi",
      headers: ["id", "room_id", "building", "room_number", "inspector_name", "inspection_date", "cleanliness", "linen_bed", "ac_electricity", "plumbing_water", "amenities", "result", "notes"],
      description: "Checklist mutu dan verifikasi kelaikan kamar & aula",
    },
    breakfast_orders: {
      sheetName: "breakfast_orders",
      label: "Pesanan Konsumsi & Sarapan",
      category: "Operasional & Transaksi",
      headers: ["id", "room_number", "building", "guest_name", "menu_name", "portions", "days", "order_date", "delivery_time", "status", "total_price", "notes"],
      description: "Pesanan konsumsi sarapan dan katering koperasi",
    },
    work_sessions: {
      sheetName: "work_sessions",
      label: "Sesi Jam Kerja Petugas",
      category: "Sistem & Pengguna",
      headers: ["id", "user_id", "user_name", "user_role", "login_time", "logout_time", "duration_seconds", "duration_formatted", "status", "notes"],
      description: "Presensi dan riwayat durasi jam kerja petugas",
    },
    app_settings: {
      sheetName: "app_settings",
      label: "Pengaturan Profil Instansi",
      category: "Sistem & Pengguna",
      headers: ["organization_name", "sub_title", "ministry_name", "address", "phone", "email", "portal_url", "tag_title"],
      description: "Identitas instansi, nama asrama haji, kontak, dan alamat resmi",
    },
    system_logs: {
      sheetName: "system_logs",
      label: "Audit Log Sistem",
      category: "Sistem & Pengguna",
      headers: ["id", "timestamp", "user", "action", "details"],
      description: "Riwayat aktivitas dan audit trail aplikasi",
    },
  };

  /**
   * Helper fetch khusus untuk Google Apps Script Web App
   * Mengatasi redirect 302/307, menyertakan User-Agent agar tidak diblokir firewall Google (HTTP 403),
   * dan mendukung batas waktu (timeout).
   */
  async function fetchGoogleAppsScript(url: string, options: RequestInit = {}): Promise<Response> {
    const defaultHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SIM-Asrama-Haji-Client/2.0",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    };

    const mergedHeaders = {
      ...defaultHeaders,
      ...(options.headers as Record<string, string> || {}),
    };

    return fetch(url, {
      ...options,
      headers: mergedHeaders,
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
  }

  // Endpoint Mendapatkan Definisi Skema Tabel & Header
  app.get("/api/sheets/schema-definition", (_req, res) => {
    res.json({
      status: "success",
      schema: APP_DATABASE_SCHEMA,
      tableCount: Object.keys(APP_DATABASE_SCHEMA).length,
    });
  });

  function matchHeader(expected: string, foundHeaders: string[]): boolean {
    const normExpected = expected.toLowerCase().replace(/[^a-z0-9]/g, "");
    return foundHeaders.some((fh) => {
      const normFound = fh.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normFound === normExpected) return true;
      // Alias mappings (CamelCase vs snake_case & sinonim)
      if (normExpected === "fullname" && (normFound === "name" || normFound === "nama")) return true;
      if (normExpected === "name" && (normFound === "fullname" || normFound === "nama")) return true;
      if (normExpected === "roomnumber" && (normFound === "nokamar" || normFound === "nomorkamar")) return true;
      if (normExpected === "bedtype" && (normFound === "bed" || normFound === "tipebed")) return true;
      if (normExpected === "pricepernight" && (normFound === "tarif" || normFound === "harga" || normFound === "price")) return true;
      if (normExpected === "assignedbuilding" && (normFound === "building" || normFound === "gedung")) return true;
      if (normExpected === "building" && (normFound === "assignedbuilding" || normFound === "gedung")) return true;
      if (normExpected === "capacitypax" && (normFound === "capacity" || normFound === "capacitynumber" || normFound === "kapasitas")) return true;
      if (normExpected === "capacity" && (normFound === "capacitynumber" || normFound === "capacitypax" || normFound === "kapasitas")) return true;
      if (normExpected === "capacitynumber" && (normFound === "capacity" || normFound === "capacitypax" || normFound === "kapasitas")) return true;
      if (normExpected === "ratehalfday" && (normFound === "sessionrate" || normFound === "ratesession" || normFound === "halfday")) return true;
      if (normExpected === "ratefullday" && (normFound === "dailyrate" || normFound === "ratedaily" || normFound === "fullday")) return true;
      if (normExpected === "qcstatus" && (normFound === "statusqc" || normFound === "mutu")) return true;
      if (normExpected === "activetxid" && (normFound === "txid" || normFound === "transactionid")) return true;
      if (normExpected === "activemaintid" && (normFound === "maintid" || normFound === "maintenanceid")) return true;
      return false;
    });
  }

  // Endpoint Deteksi & Inspeksi Struktur Sheet & Header di Spreadsheet
  app.post("/api/sheets/inspect", async (req, res) => {
    const targetUrl = (req.body?.webAppUrl || activeSheetsConfig.webAppUrl || process.env.GOOGLE_SHEETS_WEBAPP_URL || "").trim();

    if (!targetUrl) {
      return res.status(400).json({
        ok: false,
        error: "URL Web App Google Apps Script belum dikonfigurasi.",
      });
    }

    try {
      // Coba kirim inspect request ke Web App
      let inspectResult: any = null;
      let rawData: any = null;
      let isForbidden = false;

      try {
        const inspectRes = await fetchGoogleAppsScript(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "INSPECT_SCHEMA" }),
        });
        if (inspectRes.status === 403) {
          isForbidden = true;
        } else if (inspectRes.ok) {
          const text = await inspectRes.text();
          try {
            inspectResult = JSON.parse(text);
          } catch (_) {}
        }
      } catch (err: any) {
        if (String(err?.message || "").includes("403")) {
          isForbidden = true;
        }
      }

      // Jika POST inspect belum didukung skrip lama, fallback ke GET untuk melihat data yang ada
      if (!isForbidden && (!inspectResult || inspectResult.status !== "success" || !Array.isArray(inspectResult.sheets))) {
        try {
          const getRes = await fetchGoogleAppsScript(targetUrl, {
            method: "GET",
          });
          if (getRes.status === 403) {
            isForbidden = true;
          } else if (getRes.ok) {
            const text = await getRes.text();
            try {
              rawData = JSON.parse(text);
            } catch (_) {}
          }
        } catch (err: any) {
          if (String(err?.message || "").includes("403")) {
            isForbidden = true;
          }
        }
      }

      if (isForbidden) {
        return res.json({
          ok: false,
          isForbidden: true,
          error: "Akses Web App ditolak oleh Google (HTTP 403 Forbidden).",
          hint: "Buka Google Apps Script > Deploy > Manage deployments > Edit > Ubah 'Who has access' (Siapa yang memiliki akses) ke 'Anyone' (Siapa Saja) > Deploy.",
          schema: APP_DATABASE_SCHEMA,
          sheetReports: Object.entries(APP_DATABASE_SCHEMA).map(([key, def]) => ({
            key,
            sheetName: def.sheetName,
            label: def.label,
            description: def.description,
            exists: false,
            expectedHeaders: def.headers,
            foundHeaders: [],
            missingHeaders: def.headers,
            status: "MISSING_SHEET" as const,
          })),
          overallStatus: "FORBIDDEN",
          totalExpected: Object.keys(APP_DATABASE_SCHEMA).length,
          totalReady: 0,
          totalMissingSheets: Object.keys(APP_DATABASE_SCHEMA).length,
        });
      }

      // Bangun laporan status per lembar kerja & kumpulkan sheet konflik jika ada
      const existingSheetsMap = new Map<string, string[]>();
      const conflictSheetsFound: string[] = [];

      if (inspectResult?.sheets && Array.isArray(inspectResult.sheets)) {
        for (const s of inspectResult.sheets) {
          if (s && s.name) {
            const sheetNameStr = String(s.name);
            if (sheetNameStr.toLowerCase().includes("conflict")) {
              conflictSheetsFound.push(sheetNameStr);
              continue; // Abaikan sheet konflik dari skema utama
            }
            existingSheetsMap.set(sheetNameStr.toLowerCase(), Array.isArray(s.headers) ? s.headers.map(String) : []);
          }
        }
      } else if (rawData?.sheets && Array.isArray(rawData.sheets)) {
        for (const s of rawData.sheets) {
          if (s && s.name) {
            const sheetNameStr = String(s.name);
            if (sheetNameStr.toLowerCase().includes("conflict")) {
              conflictSheetsFound.push(sheetNameStr);
              continue;
            }
            existingSheetsMap.set(sheetNameStr.toLowerCase(), Array.isArray(s.headers) ? s.headers.map(String) : []);
          }
        }
      } else if (rawData) {
        const d = rawData.data || rawData;
        if (d && typeof d === "object") {
          for (const key of Object.keys(d)) {
            if (key.toLowerCase().includes("conflict")) {
              conflictSheetsFound.push(key);
              continue;
            }
            const arr = d[key];
            const headers = (Array.isArray(arr) && arr[0] && typeof arr[0] === "object") ? Object.keys(arr[0]) : [];
            existingSheetsMap.set(key.toLowerCase(), headers);
          }
        }
      }

      // Pencari sheet dengan pencocokan nama fleksibel (case-insensitive & underscore-insensitive)
      const findExistingHeaders = (targetName: string): { exists: boolean; headers: string[] } => {
        const normTarget = targetName.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const [sKey, headers] of existingSheetsMap.entries()) {
          const normKey = sKey.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (normKey === normTarget) {
            return { exists: true, headers };
          }
        }
        return { exists: false, headers: [] };
      };

      const sheetReports = Object.entries(APP_DATABASE_SCHEMA).map(([key, def]) => {
        const { exists, headers: foundHeaders } = findExistingHeaders(def.sheetName);
        const missingHeaders = def.headers.filter((h) => !matchHeader(h, foundHeaders));

        let status: "READY" | "MISSING_HEADERS" | "MISSING_SHEET" = "READY";
        if (!exists) {
          status = "MISSING_SHEET";
        } else if (missingHeaders.length > 0 && foundHeaders.length > 0) {
          status = "MISSING_HEADERS";
        } else if (foundHeaders.length === 0) {
          // Sheet ada namun belum memiliki header baris 1
          status = "MISSING_HEADERS";
        }

        return {
          key,
          sheetName: def.sheetName,
          label: def.label,
          description: def.description,
          exists,
          expectedHeaders: def.headers,
          foundHeaders,
          missingHeaders,
          status,
        };
      });

      const totalExpected = sheetReports.length;
      const totalReady = sheetReports.filter((r) => r.status === "READY").length;
      const totalMissingSheets = sheetReports.filter((r) => r.status === "MISSING_SHEET").length;

      // Deteksi apakah skrip Google Apps Script masih versi lama (hanya mengekspos 4 tabel master awal)
      const isLegacyAppsScript = !inspectResult?.sheets && !rawData?.sheets && existingSheetsMap.size > 0 && existingSheetsMap.size <= 4 && totalMissingSheets >= 8;

      const overallStatus = isLegacyAppsScript ? "LEGACY_SCRIPT" : totalReady === totalExpected ? "READY" : "NEEDS_PROVISIONING";

      res.json({
        ok: true,
        overallStatus,
        isLegacyAppsScript,
        legacyNotice: isLegacyAppsScript ? "Skrip Google Apps Script di Spreadsheet Anda masih versi lama (hanya mengekspos 4 dari 13 tabel). Lembar kerja di Google Spreadsheet Anda sebenarnya sudah ada, namun perlu menyalin skrip Code.gs terbaru dan melakukan Deploy Versi Baru (New deployment)." : null,
        totalExpected,
        totalReady,
        totalMissingSheets,
        sheetReports,
        conflictSheetsFound,
        inspectedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.warn("Gagal melakukan inspeksi skema spreadsheet:", err?.message || err);
      res.json({
        ok: false,
        error: `Gagal menginspeksi Spreadsheet: ${err?.message || "Kesalahan jaringan"}`,
      });
    }
  });

  // Endpoint Pembersihan Sheet Konflik Otomatis (seperti users_conflict...)
  app.post("/api/sheets/clean-conflicts", async (req, res) => {
    const targetUrl = (req.body?.webAppUrl || activeSheetsConfig.webAppUrl || process.env.GOOGLE_SHEETS_WEBAPP_URL || "").trim();

    if (!targetUrl) {
      return res.status(400).json({
        ok: false,
        error: "URL Web App Google Apps Script belum dikonfigurasi.",
      });
    }

    try {
      const resp = await fetchGoogleAppsScript(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "CLEAN_CONFLICT_SHEETS" }),
      });

      const text = await resp.text().catch(() => "");
      let j: any = {};
      try {
        j = JSON.parse(text);
      } catch (_) {
        j = { raw: text };
      }

      res.json({
        ok: true,
        message: "Perintah pembersihan sheet konflik berhasil dikirim ke Google Spreadsheet.",
        details: j,
      });
    } catch (err: any) {
      console.warn("Gagal membersihkan sheet konflik:", err?.message || err);
      res.status(500).json({
        ok: false,
        error: err?.message || "Gagal menghubungi Apps Script",
      });
    }
  });

  // Endpoint Auto-Provisioning: Otomatis Membuat Sheet & Menyusun Header Table
  app.post("/api/sheets/auto-provision", async (req, res) => {
    const targetUrl = (req.body?.webAppUrl || activeSheetsConfig.webAppUrl || process.env.GOOGLE_SHEETS_WEBAPP_URL || "").trim();
    const populateData = Boolean(req.body?.populateData);
    const customData = req.body?.data || serverDatabaseCache || {};

    if (!targetUrl) {
      return res.status(400).json({
        ok: false,
        error: "URL Web App Google Apps Script belum dikonfigurasi.",
      });
    }

    try {
      const payload = {
        action: "AUTO_PROVISION",
        schema: APP_DATABASE_SCHEMA,
        populateData,
        data: customData,
        timestamp: new Date().toISOString(),
      };

      const response = await fetchGoogleAppsScript(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("HTTP 403 Forbidden: Akses Web App ditolak. Pastikan deploy diatur ke 'Anyone' (Siapa saja).");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      let resJson: any = null;
      try {
        resJson = JSON.parse(text);
      } catch (_) {
        if (text.includes("accounts.google.com") || text.includes("ServiceLogin")) {
          throw new Error("HTTP 403 Forbidden: Google Apps Script meminta login. Pastikan deploy diatur ke 'Anyone'.");
        }
        resJson = {
          status: "success",
          message: "Perintah auto-provisioning berhasil dikirim ke Google Apps Script.",
          raw: text,
        };
      }

      // Broadcast update ke client
      broadcastRealtimeEvent("database:sync", { action: "auto-provision", timestamp: Date.now() });

      res.json({
        ok: true,
        message: "Inisialisasi otomatis lembar kerja & header berhasil dijalankan!",
        details: resJson,
        schema: APP_DATABASE_SCHEMA,
      });
    } catch (err: any) {
      console.warn("Gagal menjalankan auto-provisioning:", err?.message || err);
      res.status(200).json({
        ok: false,
        error: `Gagal melakukan auto-provisioning: ${err?.message || "Kesalahan koneksi"}`,
      });
    }
  });

  // 3. Endpoint BACA DATABASE LANGSUNG DARI GOOGLE SPREADSHEET (GET)
  app.get(["/api/sheets/database", "/api/database"], async (_req, res) => {
    const targetUrl = activeSheetsConfig.webAppUrl || process.env.GOOGLE_SHEETS_WEBAPP_URL;

    if (!targetUrl) {
      if (serverDatabaseCache) {
        return res.json({
          status: "cached",
          message: "Google Spreadsheet belum terhubung. Menggunakan data tersimpan di server.",
          data: serverDatabaseCache,
        });
      }
      return res.status(200).json({
        status: "unconfigured",
        message: "Google Spreadsheet belum dikonfigurasi.",
        data: null,
      });
    }

    try {
      const fetchRes = await fetchGoogleAppsScript(targetUrl, {
        method: "GET",
      });

      if (!fetchRes.ok) {
        if (fetchRes.status === 403) {
          throw new Error("HTTP 403 Forbidden: Akses ditolak oleh Google Apps Script. Pastikan opsi 'Who has access' (Siapa yang memiliki akses) saat deploy Web App telah dipilih 'Anyone' (Siapa saja).");
        }
        throw new Error(`HTTP Error dari Google Spreadsheet: ${fetchRes.status} ${fetchRes.statusText}`);
      }

      const text = await fetchRes.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch (parseErr) {
        if (text.includes("accounts.google.com") || text.includes("ServiceLogin") || text.includes("403 Forbidden")) {
          throw new Error("HTTP 403 Forbidden: Google Apps Script meminta autentikasi akun Google. Pastikan Web App di-deploy dengan opsi 'Execute as: Me' dan 'Who has access: Anyone'.");
        }
        throw new Error(`Respon Google Spreadsheet tidak valid: ${text.slice(0, 100)}`);
      }

      const rawSheetData = json.data || json;

      if (json.status === "error" || (rawSheetData && rawSheetData.status === "error") || (rawSheetData && rawSheetData.message && !Array.isArray(rawSheetData.buildings))) {
        const errorMsg = rawSheetData?.message || json?.message || "Google Apps Script mengembalikan status error";
        console.warn("Peringatan Google Apps Script:", errorMsg);
        if (serverDatabaseCache && Array.isArray(serverDatabaseCache.buildings) && serverDatabaseCache.buildings.length > 0) {
          return res.json({
            status: "cached",
            message: `Menggunakan cache server (${errorMsg})`,
            data: serverDatabaseCache,
            source: "server_cache",
            updatedAt: new Date().toISOString(),
          });
        }
        throw new Error(errorMsg);
      }

      const sheetData: any = typeof rawSheetData === "object" && rawSheetData !== null ? { ...rawSheetData } : {};

      // Bersihkan seluruh sheet konflik (seperti users_conflict...) agar tidak mencemari memori & aplikasi
      for (const k of Object.keys(sheetData)) {
        if (k.toLowerCase().includes("conflict")) {
          delete sheetData[k];
        }
      }

      // Pastikan seluruh tabel terdefinisi sebagai array jika kosong/baru header saja
      const expectedArrayTables = [
        "buildings", "rooms", "meeting_rooms", "room_capacity_rates",
        "breakfast_menu_items", "transactions", "users", "maintenances",
        "qc_inspections", "breakfast_orders", "work_sessions", "system_logs"
      ];
      for (const tKey of expectedArrayTables) {
        if (!Array.isArray(sheetData[tKey])) {
          sheetData[tKey] = [];
        }
      }

      // Update cache lokal di server hanya jika data memiliki isi valid
      if (Array.isArray(sheetData.buildings) && sheetData.buildings.length > 0) {
        serverDatabaseCache = sheetData;
        try {
          fs.writeFileSync(serverDbCachePath, JSON.stringify(sheetData, null, 2), "utf-8");
        } catch (_) {}
      } else if (!serverDatabaseCache) {
        serverDatabaseCache = sheetData;
      }

      res.json({
        status: "success",
        source: "google_spreadsheet",
        data: sheetData,
        updatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      const is403 = String(err?.message || "").includes("403");
      console.warn(`[Google Sheets] ${is403 ? "Izin akses ditolak (403 Forbidden)" : "Peringatan koneksi"}:`, err?.message || err);

      const helpMessage = is403 
        ? "Google Apps Script mengembalikan HTTP 403 Forbidden. Pastikan opsi 'Who has access' (Siapa yang memiliki akses) pada Deploy Web App disetel ke 'Anyone' (Siapa saja). Menggunakan data cadangan server..."
        : `Koneksi Google Spreadsheet bermasalah: ${err?.message || "Koneksi terputus"}. Menggunakan data cadangan server...`;

      // Selalu kembalikan status 200 dengan data cache/fallback agar aplikasi tidak pernah mengalami crash atau 502
      if (serverDatabaseCache) {
        return res.status(200).json({
          status: "fallback",
          source: "server_cache",
          isForbidden: is403,
          warning: helpMessage,
          data: serverDatabaseCache,
        });
      }

      // Jika cache belum ada sama sekali di server, berikan data aman
      const fallbackData = {
        buildings: [],
        rooms: [],
        transactions: [],
        users: [],
      };

      res.status(200).json({
        status: "fallback",
        source: "empty_fallback",
        isForbidden: is403,
        warning: helpMessage,
        data: fallbackData,
      });
    }
  });

  // 4. Endpoint SIMPAN / SINKRONISASI DATABASE KE GOOGLE SPREADSHEET (POST)
  app.post(["/api/sheets/database", "/api/database"], async (req, res) => {
    const targetUrl = (req.body?.webAppUrl || activeSheetsConfig.webAppUrl || process.env.GOOGLE_SHEETS_WEBAPP_URL || "https://script.google.com/macros/s/AKfycby9Tok8-zgcVsTuXfQBDA0prmRSpUs9kxpeyczsw9SRVjwZBEk6Y8st3tBv7LK7j_X6/exec").trim();
    const payload = req.body;

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Payload database tidak valid" });
    }

    if (req.body?.webAppUrl && req.body.webAppUrl !== activeSheetsConfig.webAppUrl) {
      activeSheetsConfig.webAppUrl = req.body.webAppUrl;
      activeSheetsConfig.isConfigured = true;
      try {
        fs.writeFileSync(sheetsConfigFilePath, JSON.stringify(activeSheetsConfig, null, 2), "utf-8");
      } catch (_) {}
    }

    // Normalisasi konsistensi master gedung dan unit kamar
    if (Array.isArray(payload.buildings) && Array.isArray(payload.rooms)) {
      const lodgingBlds = payload.buildings.filter((b: any) => !b.category || b.category === 'PENGINAPAN');
      payload.rooms = payload.rooms.map((r: any) => {
        if (!r) return r;
        const matched = lodgingBlds.find((b: any) => {
          const bName = (b.name || '').toLowerCase().trim();
          const rBld = (r.building || '').toLowerCase().trim();
          if (rBld && rBld === bName) return true;
          const bCode = (b.code || '').toUpperCase().trim();
          const rNum = (r.roomNumber || '').toUpperCase().trim();
          if (bCode && (rNum.startsWith(`${bCode}-`) || rNum.startsWith(`${bCode} `))) return true;
          const getBase = (s: string) => s.replace(/\s*\([^)]*\)/g, '').toLowerCase().trim();
          if (getBase(b.name || '') === getBase(r.building || '')) return true;
          return false;
        });
        if (matched && r.building !== matched.name) {
          return { ...r, building: matched.name, buildingId: matched.id };
        }
        return r;
      });

      payload.buildings = payload.buildings.map((b: any) => {
        if (b.category === 'SERBAGUNA' || b.category === 'RUANG_PERTEMUAN') {
          return { ...b, totalRooms: 0 };
        }
        const bName = (b.name || '').toLowerCase().trim();
        const bCode = (b.code || '').toUpperCase().trim();
        const getBase = (s: string) => s.replace(/\s*\([^)]*\)/g, '').toLowerCase().trim();
        const bBase = getBase(b.name || '');

        const actualCount = payload.rooms.filter((r: any) => {
          const rBld = (r.building || '').toLowerCase().trim();
          if (rBld === bName) return true;
          const rNum = (r.roomNumber || '').toUpperCase().trim();
          if (bCode && (rNum.startsWith(`${bCode}-`) || rNum.startsWith(`${bCode} `))) return true;
          if (bBase && getBase(r.building || '') === bBase) return true;
          return false;
        }).length;

        let capDesc = b.capacityDesc || '';
        if (/^\d+\s*Kamar/i.test(capDesc.trim()) && actualCount > 0) {
          capDesc = capDesc.trim().replace(/^\d+/, String(actualCount));
        }

        return {
          ...b,
          totalRooms: actualCount > 0 ? actualCount : (b.totalRooms || 0),
          capacityDesc: capDesc
        };
      });
    }

    // Selalu simpan ke server database cache
    serverDatabaseCache = payload;
    try {
      fs.writeFileSync(serverDbCachePath, JSON.stringify(payload, null, 2), "utf-8");
    } catch (_) {}

    // Broadcast ke seluruh klien real-time bahwa database telah diperbarui
    broadcastRealtimeEvent("database:sync", { timestamp: Date.now() });

    if (!targetUrl) {
      return res.json({
        ok: true,
        status: "saved_server_only",
        message: "Database disimpan di server (Google Spreadsheet belum dikonfigurasi).",
      });
    }

    // Helper normalisasi setiap item data agar memiliki representasi snake_case DAN camelCase
    const normalizeItemsList = (items: any[]) => {
      if (!Array.isArray(items)) return [];
      return items.map((item) => {
        if (!item || typeof item !== "object") return item;
        const norm: Record<string, any> = { ...item };
        for (const [k, v] of Object.entries(item)) {
          const snake = k.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
          const camel = k.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
          if (norm[snake] === undefined) norm[snake] = v;
          if (norm[camel] === undefined) norm[camel] = v;
        }
        return norm;
      });
    };

    try {
      const buildingsList = normalizeItemsList(Array.isArray(payload.buildings) ? payload.buildings : []);
      const roomsList = normalizeItemsList(Array.isArray(payload.rooms) ? payload.rooms : []);
      const meetingRoomsList = normalizeItemsList(Array.isArray(payload.meetingRooms) ? payload.meetingRooms : (Array.isArray(payload.meeting_rooms) ? payload.meeting_rooms : []));
      const roomCapacityRatesList = normalizeItemsList(Array.isArray(payload.roomCapacityRates) ? payload.roomCapacityRates : (Array.isArray(payload.room_capacity_rates) ? payload.room_capacity_rates : []));
      const breakfastMenuItemsList = normalizeItemsList(Array.isArray(payload.breakfastMenuItems) ? payload.breakfastMenuItems : (Array.isArray(payload.breakfast_menu_items) ? payload.breakfast_menu_items : []));
      const breakfastOrdersList = normalizeItemsList(Array.isArray(payload.breakfastOrders) ? payload.breakfastOrders : (Array.isArray(payload.breakfast_orders) ? payload.breakfast_orders : []));
      const transactionsList = normalizeItemsList(Array.isArray(payload.transactions) ? payload.transactions : []);
      const usersList = normalizeItemsList(Array.isArray(payload.users) ? payload.users : []);
      const maintenancesList = normalizeItemsList(Array.isArray(payload.maintenances) ? payload.maintenances : []);
      const qcInspectionsList = normalizeItemsList(Array.isArray(payload.qcInspections) ? payload.qcInspections : (Array.isArray(payload.qc_inspections) ? payload.qc_inspections : []));
      const workSessionsList = normalizeItemsList(Array.isArray(payload.workSessions) ? payload.workSessions : (Array.isArray(payload.work_sessions) ? payload.work_sessions : []));
      const auditLogsList = normalizeItemsList(Array.isArray(payload.auditLogs) ? payload.auditLogs : (Array.isArray(payload.system_logs) ? payload.system_logs : []));
      const rawSettings = payload.appSettings || payload.app_settings || null;
      const appSettingsList = rawSettings ? normalizeItemsList(Array.isArray(rawSettings) ? rawSettings : [rawSettings]) : [];

      const formattedPayload = {
        action: "SAVE_ALL",
        timestamp: new Date().toISOString(),
        buildings: buildingsList,
        rooms: roomsList,
        meetingRooms: meetingRoomsList,
        roomCapacityRates: roomCapacityRatesList,
        breakfastMenuItems: breakfastMenuItemsList,
        breakfastOrders: breakfastOrdersList,
        transactions: transactionsList,
        users: usersList,
        maintenances: maintenancesList,
        qcInspections: qcInspectionsList,
        workSessions: workSessionsList,
        auditLogs: auditLogsList,
        appSettings: rawSettings,
        // Aliases snake_case untuk kompatibilitas penuh dengan skrip Google Spreadsheet
        meeting_rooms: meetingRoomsList,
        room_capacity_rates: roomCapacityRatesList,
        breakfast_menu_items: breakfastMenuItemsList,
        breakfast_orders: breakfastOrdersList,
        qc_inspections: qcInspectionsList,
        work_sessions: workSessionsList,
        system_logs: auditLogsList,
        app_settings: appSettingsList,
      };

      const sheetRes = await fetchGoogleAppsScript(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(formattedPayload),
      });

      const text = await sheetRes.text().catch(() => "");
      let sheetJson: any = null;
      try {
        sheetJson = JSON.parse(text);
      } catch (_) {
        sheetJson = { status: sheetRes.ok ? "success" : "warning", raw: text };
      }

      res.json({
        ok: true,
        status: sheetRes.ok ? "success" : "warning",
        source: "google_spreadsheet",
        message: sheetRes.ok 
          ? "Data seluruh 13 tabel berhasil disimpan permanen ke Google Spreadsheet!" 
          : `Tersimpan di server, tetapi Google Spreadsheet merespons status ${sheetRes.status}`,
        sheetResponse: sheetJson,
      });
    } catch (err: any) {
      console.warn("Gagal push ke Google Spreadsheet:", err?.message || err);
      res.json({
        ok: true,
        status: "warning",
        warning: `Tersimpan di server, tetapi gagal push ke Spreadsheet: ${err?.message}`,
      });
    }
  });

  // Backward-compatibility endpoints untuk legacy Supabase route agar tidak 404
  app.get("/api/supabase-config", (_req, res) => {
    res.json({
      url: "https://docs.google.com/spreadsheets",
      anonKey: "google-spreadsheet-mode",
      isCustom: true,
      mode: "google_spreadsheet",
      sheetsConfig: activeSheetsConfig,
    });
  });

  app.post("/api/supabase-config", (_req, res) => {
    res.json({ ok: true, mode: "google_spreadsheet", sheetsConfig: activeSheetsConfig });
  });

  app.delete("/api/supabase-config", (_req, res) => {
    res.json({ ok: true, mode: "google_spreadsheet" });
  });

  // Server-Sent Events (SSE) Stream for instant real-time updates
  app.get("/api/realtime/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform, no-store");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    sseClients.add(res);

    // Send initial authoritative state immediately upon connect
    const initPayload = JSON.stringify({
      type: "init",
      payload: {
        presences: Object.values(realtimeState.presences),
        workSessions: realtimeState.workSessions,
        chatChannels: realtimeState.chatChannels,
        chatMessages: realtimeState.chatMessages,
        sheetsConfig: activeSheetsConfig,
        databaseConfig: activeSheetsConfig,
      },
      timestamp: Date.now(),
    });
    res.write(`data: ${initPayload}\n\n`);

    const keepAlive = setInterval(() => {
      try {
        res.write(`: keepalive ${Date.now()}\n\n`);
      } catch (_) {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 20000);

    req.on("close", () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  app.get("/api/realtime/state", (_req, res) => {
    res.json({
      presences: Object.values(realtimeState.presences),
      workSessions: realtimeState.workSessions,
      chatChannels: realtimeState.chatChannels,
      chatMessages: realtimeState.chatMessages,
    });
  });

  app.post("/api/realtime/event", (req, res) => {
    const { type, payload, clientId } = req.body || {};
    if (!type) {
      res.status(400).json({ error: "Missing event type" });
      return;
    }

    if (type === "presence:heartbeat" && payload?.userId) {
      const key = `${payload.userId}___${clientId || "default"}`;
      realtimeState.presences[key] = {
        ...payload,
        clientId: clientId || "default",
        lastSeenMs: Date.now(),
      };
      broadcastRealtimeEvent("presence:sync", Object.values(realtimeState.presences), clientId);
    } else if (type === "presence:leave" && payload?.userId) {
      for (const [key, p] of Object.entries(realtimeState.presences)) {
        if (p.userId === payload.userId && (!clientId || p.clientId === clientId || payload.allDevices)) {
          delete realtimeState.presences[key];
        }
      }
      broadcastRealtimeEvent("presence:sync", Object.values(realtimeState.presences), clientId);
    } else if (type === "session:upsert" && payload?.id) {
      const idx = realtimeState.workSessions.findIndex((s: any) => s.id === payload.id);
      if (idx >= 0) {
        realtimeState.workSessions[idx] = { ...realtimeState.workSessions[idx], ...payload };
      } else {
        realtimeState.workSessions.unshift(payload);
      }
      // If this session is AKTIF, close any older AKTIF session for the same userId only if explicitly requested
      if (payload.closeOtherUserSessions && payload.userId) {
        realtimeState.workSessions = realtimeState.workSessions.map((s: any) => {
          if (s.userId === payload.userId && s.id !== payload.id && s.status === "AKTIF") {
            return {
              ...s,
              status: "SELESAI",
              logoutTime: payload.loginTime || new Date().toISOString().replace("T", " ").substring(0, 19),
            };
          }
          return s;
        });
      }
      broadcastRealtimeEvent("session:upsert", payload, clientId);
    } else if (type === "session:sync_bulk" && Array.isArray(payload)) {
      const byId = new Map<string, any>();
      for (const s of realtimeState.workSessions) {
        if (s?.id) byId.set(s.id, s);
      }
      for (const s of payload) {
        if (!s?.id) continue;
        const existing = byId.get(s.id);
        if (!existing) {
          byId.set(s.id, s);
        } else if (existing.status === "SELESAI" && s.status === "AKTIF") {
          // Keep SELESAI so finished sessions never revert to AKTIF
          byId.set(s.id, existing);
        } else {
          byId.set(s.id, { ...existing, ...s });
        }
      }
      realtimeState.workSessions = Array.from(byId.values());
    } else if (type === "session:clear") {
      realtimeState.workSessions = [];
      broadcastRealtimeEvent("session:clear", {}, clientId);
    } else if (type === "chat:message" && payload?.message?.id) {
      const msg = payload.message;
      const channel = payload.channel;
      if (!realtimeState.chatMessages.some((m: any) => m.id === msg.id)) {
        realtimeState.chatMessages.push(msg);
        if (realtimeState.chatMessages.length > 500) {
          realtimeState.chatMessages = realtimeState.chatMessages.slice(-500);
        }
      }
      if (channel?.id) {
        const cIdx = realtimeState.chatChannels.findIndex((c: any) => c.id === channel.id);
        if (cIdx >= 0) {
          realtimeState.chatChannels[cIdx] = {
            ...realtimeState.chatChannels[cIdx],
            ...channel,
            lastMessage: msg.message,
            lastMessageTime: msg.timeFormatted,
            lastSenderName: msg.senderName,
          };
        } else {
          realtimeState.chatChannels.unshift({
            ...channel,
            lastMessage: msg.message,
            lastMessageTime: msg.timeFormatted,
            lastSenderName: msg.senderName,
          });
        }
      }
      broadcastRealtimeEvent("chat:message", { message: msg, channel }, clientId);
    } else if (type === "chat:read" && payload?.channelId && payload?.userId) {
      const { channelId, userId } = payload;
      realtimeState.chatMessages = realtimeState.chatMessages.map((m: any) => {
        if (m.channelId === channelId && Array.isArray(m.readBy) && !m.readBy.includes(userId)) {
          return { ...m, readBy: [...m.readBy, userId] };
        }
        return m;
      });
      broadcastRealtimeEvent("chat:read", { channelId, userId }, clientId);
    } else if (type === "chat:channel" && payload?.id) {
      const cIdx = realtimeState.chatChannels.findIndex((c: any) => c.id === payload.id);
      if (cIdx >= 0) {
        realtimeState.chatChannels[cIdx] = { ...realtimeState.chatChannels[cIdx], ...payload };
      } else {
        realtimeState.chatChannels.unshift(payload);
      }
      broadcastRealtimeEvent("chat:channel", payload, clientId);
    } else if (type === "chat:clear") {
      const channelId = payload?.channelId;
      if (channelId) {
        realtimeState.chatMessages = realtimeState.chatMessages.filter((m: any) => m.channelId !== channelId);
      } else {
        realtimeState.chatMessages = [];
      }
      broadcastRealtimeEvent("chat:clear", { channelId }, clientId);
    } else if (type === "chat:typing" && payload?.channelId && payload?.userId) {
      broadcastRealtimeEvent("chat:typing", payload, clientId);
    }

    res.json({ ok: true });
  });

  const distPath = path.join(process.cwd(), "dist");
  const distIndex = path.join(distPath, "index.html");
  const rootIndex = path.join(process.cwd(), "index.html");

  const isDevLifecycle = process.env.npm_lifecycle_event === "dev";
  const isStartOrProd =
    !isDevLifecycle &&
    (process.env.NODE_ENV === "production" ||
      process.env.npm_lifecycle_event === "start");

  if (isStartOrProd && !fs.existsSync(distIndex)) {
    try {
      console.log("dist/index.html not found, running Vite build...");
      const { build } = await import("vite");
      await build();
    } catch (err) {
      console.error("Failed to auto-build dist:", err);
    }
  }

  const shouldServeStatic = isStartOrProd && fs.existsSync(distIndex);

  if (!shouldServeStatic) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer, // Menyalurkan WebSocket HMR ke Express Server
          clientPort: 443,   // Memaksa port SSL HTTPS untuk Cloud Proxy
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath, { index: false }));
    app.get("*", (req, res, next) => {
      if (fs.existsSync(distIndex)) {
        res.sendFile(distIndex, (err) => {
          if (err && !res.headersSent) {
            if (fs.existsSync(rootIndex)) {
              res.sendFile(rootIndex);
            } else {
              next(err);
            }
          }
        });
      } else if (fs.existsSync(rootIndex)) {
        res.sendFile(rootIndex);
      } else {
        res.status(404).send("Application index.html not found. Please run npm run build.");
      }
    });
  }

  // Global Express error handler to prevent crashing on missing files
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Express unhandled error:", err?.message || err);
    if (!res.headersSent) {
      res.status(err?.status || 500).json({ error: "Server Error", message: err?.message || "Internal Server Error" });
    }
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();