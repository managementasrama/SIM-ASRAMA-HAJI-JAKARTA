import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createHttpServer } from "http";
import { Pool } from "pg";

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app); // Menggunakan HTTP server terikat
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.text({ type: ["text/plain", "text/*"], limit: "10mb" }));

  // CORS & Multi-Host Header Support for multi-device cross-network connections
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Requested-With, Cache-Control, Pragma");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

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

  // Cleanup stale presences older than 120 seconds
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [key, p] of Object.entries(realtimeState.presences)) {
      if (now - p.lastSeenMs > 120000) {
        delete realtimeState.presences[key];
        changed = true;
      }
    }
    if (changed) {
      broadcastRealtimeEvent("presence:sync", Object.values(realtimeState.presences));
    }
  }, 15000);

  // =========================================================================
  // Google Spreadsheet Database Configuration & Real-Time Proxy
  // Menggunakan Google Spreadsheet sebagai basis data utama aplikasi
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

  const defaultWebAppUrl = "https://script.google.com/macros/s/AKfycby9Tok8-zgcVsTuXfQBDA0prmRSpUs9kxpeyczsw9SRVjwZBEk6Y8st3tBv7LK7j_X6/exec";
  const defaultSheetDocUrl = "https://docs.google.com/spreadsheets/d/15loY6F6CMmIJ5qZaafidY6AB0vvrEpsSsE_B0XXBqP4/edit?gid=0#gid=0";

  const envSheetsConfig = parseEnvForSheets();
  let activeSheetsConfig = {
    webAppUrl: envSheetsConfig.webAppUrl || process.env.GOOGLE_SHEETS_WEBAPP_URL || process.env.VITE_SHEET_WEBAPP_URL || defaultWebAppUrl,
    sheetId: envSheetsConfig.sheetId || process.env.GOOGLE_SHEETS_ID || process.env.VITE_GOOGLE_SHEETS_ID || defaultSheetDocUrl,
    sheetDocUrl: defaultSheetDocUrl,
    apiKey: envSheetsConfig.apiKey || process.env.GOOGLE_SHEETS_API_KEY || "",
    isConfigured: true,
    updatedAt: new Date().toISOString(),
  };

  try {
    if (fs.existsSync(sheetsConfigFilePath)) {
      const rawCfg = fs.readFileSync(sheetsConfigFilePath, "utf-8");
      const parsed = JSON.parse(rawCfg);
      if (parsed) {
        const rawSheetId = parsed.sheetId || activeSheetsConfig.sheetId;
        const finalDocUrl = parsed.sheetDocUrl || rawSheetId || defaultSheetDocUrl;
        const safeDocUrl = (finalDocUrl && !finalDocUrl.includes("1AsramaHajiEmbarkasiJakartaSIM")) ? finalDocUrl : defaultSheetDocUrl;
        activeSheetsConfig = {
          webAppUrl: parsed.webAppUrl || activeSheetsConfig.webAppUrl,
          sheetId: safeDocUrl,
          sheetDocUrl: safeDocUrl,
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

  // Inisialisasi realtimeState secara authoritatif dari serverDatabaseCache agar tidak kosong saat baru start
  if (serverDatabaseCache) {
    if (Array.isArray(serverDatabaseCache.chatChannels) && serverDatabaseCache.chatChannels.length > 0 && realtimeState.chatChannels.length === 0) {
      realtimeState.chatChannels = serverDatabaseCache.chatChannels;
    }
    if (Array.isArray(serverDatabaseCache.chatMessages) && serverDatabaseCache.chatMessages.length > 0 && realtimeState.chatMessages.length === 0) {
      realtimeState.chatMessages = serverDatabaseCache.chatMessages;
    }
    if (Array.isArray(serverDatabaseCache.workSessions) && serverDatabaseCache.workSessions.length > 0 && realtimeState.workSessions.length === 0) {
      realtimeState.workSessions = serverDatabaseCache.workSessions;
    }
  }

  // File penyimpanan permanen database chat mengambang (Grup & 1-on-1 Direct Chat)
  const chatStoragePath = path.join(process.cwd(), "chat_storage_database.json");
  try {
    if (fs.existsSync(chatStoragePath)) {
      const savedChat = JSON.parse(fs.readFileSync(chatStoragePath, "utf-8"));
      if (savedChat && Array.isArray(savedChat.channels) && savedChat.channels.length > 0) {
        realtimeState.chatChannels = savedChat.channels;
      }
      if (savedChat && Array.isArray(savedChat.messages) && savedChat.messages.length > 0) {
        realtimeState.chatMessages = savedChat.messages;
      }
    } else if (realtimeState.chatChannels.length > 0 || realtimeState.chatMessages.length > 0) {
      // Buat file chat_storage_database.json pertama kali dari template
      fs.writeFileSync(
        chatStoragePath,
        JSON.stringify(
          {
            version: 1,
            updatedAt: new Date().toISOString(),
            channels: realtimeState.chatChannels,
            messages: realtimeState.chatMessages,
          },
          null,
          2
        ),
        "utf-8"
      );
    }
  } catch (err) {
    console.warn("Gagal memuat chat_storage_database.json:", err);
  }

  function saveChatStorageToDisk() {
    try {
      fs.writeFileSync(
        chatStoragePath,
        JSON.stringify(
          {
            version: 1,
            updatedAt: new Date().toISOString(),
            channels: realtimeState.chatChannels,
            messages: realtimeState.chatMessages,
          },
          null,
          2
        ),
        "utf-8"
      );
    } catch (err) {
      console.warn("Gagal menyimpan chat_storage_database.json:", err);
    }
    triggerAsyncChatSpreadsheetSync();
  }

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

    const cleanDocUrl = cleanSheetId || defaultSheetDocUrl;
    activeSheetsConfig = {
      webAppUrl: cleanUrl,
      sheetId: cleanDocUrl,
      sheetDocUrl: cleanDocUrl,
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

  // =========================================================================
  // AIVEN CLOUD DATABASE (POSTGRESQL) INTEGRATION & MANAGEMENT
  // =========================================================================
  const aivenConfigFilePath = path.join(process.cwd(), "aiven_database_config.json");

  function parseEnvForAiven(): { serviceUri?: string } {
    try {
      if (fs.existsSync(envFilePath)) {
        const raw = fs.readFileSync(envFilePath, "utf-8");
        const uriMatch = raw.match(/(?:AIVEN_DATABASE_URL|DATABASE_URL|AIVEN_SERVICE_URI)\s*=\s*["']?([^\r\n"']+)["']?/);
        if (uriMatch && uriMatch[1]) {
          return { serviceUri: uriMatch[1].trim() };
        }
      }
    } catch (_) {}
    return {};
  }

  function parseAivenUri(uriStr: string) {
    try {
      const parsed = new URL(uriStr.trim());
      return {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 5432,
        user: decodeURIComponent(parsed.username || 'avnadmin'),
        password: decodeURIComponent(parsed.password || ''),
        database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : 'defaultdb',
        ssl: true
      };
    } catch (_) {
      return null;
    }
  }

  const envAiven = parseEnvForAiven();
  const initialAivenUri = envAiven.serviceUri || process.env.AIVEN_DATABASE_URL || process.env.DATABASE_URL || "";

  let activeAivenConfig: {
    serviceUri?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    ssl?: boolean;
    isConfigured: boolean;
    lastConnectedAt?: string | null;
    lastError?: string | null;
    latencyMs?: number | null;
    pgVersion?: string | null;
    updatedAt: string;
  } = {
    serviceUri: initialAivenUri,
    host: "",
    port: 22170,
    database: "defaultdb",
    user: "avnadmin",
    password: "",
    ssl: true,
    isConfigured: true,
    lastConnectedAt: null,
    lastError: null,
    latencyMs: null,
    pgVersion: null,
    updatedAt: new Date().toISOString()
  };

  try {
    if (fs.existsSync(aivenConfigFilePath)) {
      const rawCfg = fs.readFileSync(aivenConfigFilePath, "utf-8");
      const parsed = JSON.parse(rawCfg);
      if (parsed) {
        activeAivenConfig = {
          ...activeAivenConfig,
          ...parsed,
          serviceUri: parsed.serviceUri || initialAivenUri,
          isConfigured: true
        };
      }
    }
  } catch (err) {
    console.warn("Failed to load aiven_database_config.json:", err);
  }

  // Parse URI to populate host, port, user, password, database
  const uriToParse = activeAivenConfig.serviceUri || initialAivenUri;
  const parsedUri = parseAivenUri(uriToParse);
  if (parsedUri) {
    activeAivenConfig.serviceUri = uriToParse;
    activeAivenConfig.host = parsedUri.host;
    activeAivenConfig.port = parsedUri.port;
    activeAivenConfig.user = parsedUri.user;
    activeAivenConfig.password = parsedUri.password;
    activeAivenConfig.database = parsedUri.database;
    activeAivenConfig.isConfigured = true;
  }

  let aivenPool: Pool | null = null;

  function createAivenPoolInstance(connUriOrConfig?: any): Pool | null {
    const cfg = connUriOrConfig || activeAivenConfig;
    const uri = typeof cfg === 'string' 
      ? cfg 
      : (cfg?.serviceUri || (cfg?.host ? `postgres://${encodeURIComponent(cfg.user || 'avnadmin')}:${encodeURIComponent(cfg.password || '')}@${cfg.host}:${cfg.port || 22170}/${cfg.database || 'defaultdb'}?sslmode=no-verify` : ''));

    if (!uri) return null;

    try {
      const p = new Pool({
        connectionString: uri,
        ssl: {
          rejectUnauthorized: false
        },
        connectionTimeoutMillis: 20000,
        idleTimeoutMillis: 30000,
        max: 8,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000
      });
      p.on('error', (err: any) => {
        console.info('Aiven PG Pool notice:', err?.message || err);
      });
      return p;
    } catch (e) {
      console.warn("Error creating Aiven Pool:", e);
      return null;
    }
  }

  function getActiveAivenPool(): Pool | null {
    if (aivenPool) return aivenPool;
    if (activeAivenConfig.isConfigured || activeAivenConfig.serviceUri) {
      aivenPool = createAivenPoolInstance(activeAivenConfig);
    }
    return aivenPool;
  }

  const AIVEN_TABLE_DEFS: Record<string, string> = {
    buildings: `
      CREATE TABLE IF NOT EXISTS buildings (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50),
        floors INT DEFAULT 1,
        total_rooms INT DEFAULT 0,
        capacity_desc TEXT,
        category VARCHAR(100) DEFAULT 'PENGINAPAN',
        status VARCHAR(50) DEFAULT 'AKTIF',
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        raw_data JSONB
      );
    `,
    rooms: `
      CREATE TABLE IF NOT EXISTS rooms (
        id VARCHAR(100) PRIMARY KEY,
        room_number VARCHAR(100) NOT NULL,
        building VARCHAR(255) NOT NULL,
        building_id VARCHAR(100),
        floor INT DEFAULT 1,
        type VARCHAR(100) DEFAULT 'Standar',
        bed_type VARCHAR(100) DEFAULT '4 Single Bed',
        capacity VARCHAR(100) DEFAULT '4 Orang',
        capacity_number INT DEFAULT 4,
        status VARCHAR(50) DEFAULT 'READY',
        price_per_night NUMERIC DEFAULT 0,
        facilities JSONB DEFAULT '[]',
        qc_status VARCHAR(50) DEFAULT 'LOLOS_QC',
        last_qc_date VARCHAR(100),
        last_qc_by VARCHAR(255),
        last_qc_notes TEXT,
        active_tx_id VARCHAR(100),
        active_maint_id VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        raw_data JSONB
      );
    `,
    meeting_rooms: `
      CREATE TABLE IF NOT EXISTS meeting_rooms (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50),
        building VARCHAR(255),
        capacity VARCHAR(100),
        capacity_number INT,
        category VARCHAR(100) DEFAULT 'AULA',
        daily_rate NUMERIC DEFAULT 0,
        session_rate NUMERIC DEFAULT 0,
        facilities JSONB DEFAULT '[]',
        description TEXT,
        status VARCHAR(50) DEFAULT 'TERSEDIA',
        qc_status VARCHAR(50) DEFAULT 'LOLOS_QC',
        active_tx_id VARCHAR(100),
        active_maint_id VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        raw_data JSONB
      );
    `,
    room_capacity_rates: `
      CREATE TABLE IF NOT EXISTS room_capacity_rates (
        id VARCHAR(100) PRIMARY KEY,
        room_type VARCHAR(100) NOT NULL,
        bed_type VARCHAR(100) NOT NULL,
        capacity_pax INT DEFAULT 4,
        price_per_night NUMERIC DEFAULT 0,
        description TEXT,
        facilities JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        raw_data JSONB
      );
    `,
    breakfast_menu_items: `
      CREATE TABLE IF NOT EXISTS breakfast_menu_items (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) DEFAULT 'MAKANAN_BERAT',
        price NUMERIC DEFAULT 25000,
        description TEXT,
        allergens TEXT,
        is_available BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        raw_data JSONB
      );
    `,
    transactions: `
      CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(100) PRIMARY KEY,
        room_id VARCHAR(100),
        building VARCHAR(255),
        room_number VARCHAR(100),
        category VARCHAR(100) DEFAULT 'UMUM',
        guest_name VARCHAR(255) NOT NULL,
        guest_type VARCHAR(50) DEFAULT 'INDIVIDU',
        nik_ktp VARCHAR(100),
        kloter VARCHAR(50),
        start_date VARCHAR(50) NOT NULL,
        duration INT DEFAULT 1,
        duration_unit VARCHAR(50) DEFAULT 'Malam',
        phone VARCHAR(100),
        notes TEXT,
        status VARCHAR(50) DEFAULT 'BOOKED',
        created_user VARCHAR(255),
        is_group BOOLEAN DEFAULT FALSE,
        group_type VARCHAR(100),
        group_name VARCHAR(255),
        group_id VARCHAR(100),
        total_pax INT,
        payment_status VARCHAR(50) DEFAULT 'BELUM_LUNAS',
        payment_method VARCHAR(100),
        paid_amount NUMERIC DEFAULT 0,
        total_price NUMERIC DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        raw_data JSONB
      );
    `,
    users: `
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        role VARCHAR(100) NOT NULL,
        department VARCHAR(100),
        assigned_building VARCHAR(255),
        phone VARCHAR(100),
        email VARCHAR(255),
        nip VARCHAR(100),
        status VARCHAR(50) DEFAULT 'active',
        password VARCHAR(255),
        permissions JSONB DEFAULT '{}',
        signature_url TEXT,
        qr_code_url TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        raw_data JSONB
      );
    `,
    maintenances: `
      CREATE TABLE IF NOT EXISTS maintenances (
        id VARCHAR(100) PRIMARY KEY,
        room_id VARCHAR(100),
        room_number VARCHAR(100),
        building VARCHAR(255),
        category VARCHAR(100),
        issue VARCHAR(255),
        description TEXT,
        urgency VARCHAR(50) DEFAULT 'Sedang',
        status VARCHAR(50) DEFAULT 'PROSES',
        technician VARCHAR(255),
        report_time VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        raw_data JSONB
      );
    `,
    qc_inspections: `
      CREATE TABLE IF NOT EXISTS qc_inspections (
        id VARCHAR(100) PRIMARY KEY,
        room_id VARCHAR(100),
        building VARCHAR(255),
        room_number VARCHAR(100),
        inspector_id VARCHAR(100),
        inspector_name VARCHAR(255),
        inspection_date VARCHAR(100),
        cleanliness VARCHAR(50),
        linen_bed VARCHAR(50),
        ac_electricity VARCHAR(50),
        plumbing_water VARCHAR(50),
        amenities VARCHAR(50),
        result VARCHAR(100) DEFAULT 'LOLOS_QC',
        notes TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        raw_data JSONB
      );
    `,
    breakfast_orders: `
      CREATE TABLE IF NOT EXISTS breakfast_orders (
        id VARCHAR(100) PRIMARY KEY,
        room_number VARCHAR(100),
        building VARCHAR(255),
        guest_name VARCHAR(255),
        phone VARCHAR(100),
        transaction_id VARCHAR(100),
        menu_name VARCHAR(255),
        portions INT DEFAULT 1,
        days INT DEFAULT 1,
        start_date VARCHAR(100),
        status VARCHAR(50) DEFAULT 'MENUNGGU',
        total_price NUMERIC DEFAULT 0,
        notes TEXT,
        cancel_reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        raw_data JSONB
      );
    `,
    cleaning_logs: `
      CREATE TABLE IF NOT EXISTS cleaning_logs (
        id VARCHAR(100) PRIMARY KEY,
        room_id VARCHAR(100),
        room_number VARCHAR(100),
        building VARCHAR(255),
        petugas_name VARCHAR(255),
        timestamp VARCHAR(100),
        photo_url TEXT,
        notes TEXT,
        status VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        raw_data JSONB
      );
    `,
    work_sessions: `
      CREATE TABLE IF NOT EXISTS work_sessions (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100),
        user_name VARCHAR(255),
        user_role VARCHAR(100),
        login_time VARCHAR(100),
        logout_time VARCHAR(100),
        duration_seconds INT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'AKTIF',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        raw_data JSONB
      );
    `,
    audit_logs: `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(100) PRIMARY KEY,
        timestamp VARCHAR(100),
        user_name VARCHAR(255),
        role VARCHAR(100),
        action VARCHAR(100),
        details TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        raw_data JSONB
      );
    `,
    app_settings: `
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `
  };

  async function ensureTableColumns(client: any) {
    const alterations = [
      `ALTER TABLE buildings ADD COLUMN IF NOT EXISTS name VARCHAR(255);`,
      `ALTER TABLE buildings ADD COLUMN IF NOT EXISTS code VARCHAR(50);`,
      `ALTER TABLE buildings ADD COLUMN IF NOT EXISTS floors INT DEFAULT 1;`,
      `ALTER TABLE buildings ADD COLUMN IF NOT EXISTS total_rooms INT DEFAULT 0;`,
      `ALTER TABLE buildings ADD COLUMN IF NOT EXISTS capacity_desc TEXT;`,
      `ALTER TABLE buildings ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'PENGINAPAN';`,
      `ALTER TABLE buildings ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'AKTIF';`,
      `ALTER TABLE buildings ADD COLUMN IF NOT EXISTS description TEXT;`,
      `ALTER TABLE buildings ADD COLUMN IF NOT EXISTS raw_data JSONB;`,

      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_number VARCHAR(100);`,
      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS building VARCHAR(255);`,
      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS building_id VARCHAR(100);`,
      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS floor INT DEFAULT 1;`,
      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS type VARCHAR(100);`,
      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS bed_type VARCHAR(100);`,
      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS capacity VARCHAR(100);`,
      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS capacity_number INT;`,
      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS status VARCHAR(50);`,
      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS price_per_night NUMERIC DEFAULT 0;`,
      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS facilities JSONB DEFAULT '[]';`,
      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS qc_status VARCHAR(50);`,
      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_qc_date VARCHAR(100);`,
      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_qc_by VARCHAR(255);`,
      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_qc_notes TEXT;`,
      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS active_tx_id VARCHAR(100);`,
      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS active_maint_id VARCHAR(100);`,
      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS notes TEXT;`,
      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS raw_data JSONB;`,

      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS room_id VARCHAR(100);`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS building VARCHAR(255);`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS room_number VARCHAR(100);`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'UMUM';`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS guest_name VARCHAR(255);`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS guest_type VARCHAR(50) DEFAULT 'INDIVIDU';`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS nik_ktp VARCHAR(100);`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS kloter VARCHAR(50);`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS start_date VARCHAR(50);`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS duration INT DEFAULT 1;`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS duration_unit VARCHAR(50) DEFAULT 'Malam';`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS phone VARCHAR(100);`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS notes TEXT;`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'BOOKED';`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_user VARCHAR(255);`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS group_type VARCHAR(100);`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS group_name VARCHAR(255);`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS group_id VARCHAR(100);`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS total_pax INT;`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'BELUM_LUNAS';`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(100);`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS total_price NUMERIC DEFAULT 0;`,
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS raw_data JSONB;`,

      `ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100);`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(100);`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100);`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_building VARCHAR(255);`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(100);`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS nip VARCHAR(100);`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50);`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255);`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS signature_url TEXT;`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS qr_code_url TEXT;`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS raw_data JSONB;`,

      `ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS name VARCHAR(255);`,
      `ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS code VARCHAR(50);`,
      `ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS building VARCHAR(255);`,
      `ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS capacity VARCHAR(100);`,
      `ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS capacity_number INT;`,
      `ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS category VARCHAR(100);`,
      `ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS daily_rate NUMERIC DEFAULT 0;`,
      `ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS session_rate NUMERIC DEFAULT 0;`,
      `ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS facilities JSONB DEFAULT '[]';`,
      `ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS description TEXT;`,
      `ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS status VARCHAR(50);`,
      `ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS qc_status VARCHAR(50);`,
      `ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS active_tx_id VARCHAR(100);`,
      `ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS active_maint_id VARCHAR(100);`,
      `ALTER TABLE meeting_rooms ADD COLUMN IF NOT EXISTS raw_data JSONB;`,

      `ALTER TABLE room_capacity_rates ADD COLUMN IF NOT EXISTS room_type VARCHAR(100);`,
      `ALTER TABLE room_capacity_rates ADD COLUMN IF NOT EXISTS bed_type VARCHAR(100);`,
      `ALTER TABLE room_capacity_rates ADD COLUMN IF NOT EXISTS capacity_pax INT;`,
      `ALTER TABLE room_capacity_rates ADD COLUMN IF NOT EXISTS price_per_night NUMERIC DEFAULT 0;`,
      `ALTER TABLE room_capacity_rates ADD COLUMN IF NOT EXISTS description TEXT;`,
      `ALTER TABLE room_capacity_rates ADD COLUMN IF NOT EXISTS facilities JSONB DEFAULT '[]';`,
      `ALTER TABLE room_capacity_rates ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;`,
      `ALTER TABLE room_capacity_rates ADD COLUMN IF NOT EXISTS raw_data JSONB;`,

      `ALTER TABLE breakfast_menu_items ADD COLUMN IF NOT EXISTS name VARCHAR(255);`,
      `ALTER TABLE breakfast_menu_items ADD COLUMN IF NOT EXISTS category VARCHAR(100);`,
      `ALTER TABLE breakfast_menu_items ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 25000;`,
      `ALTER TABLE breakfast_menu_items ADD COLUMN IF NOT EXISTS description TEXT;`,
      `ALTER TABLE breakfast_menu_items ADD COLUMN IF NOT EXISTS allergens TEXT;`,
      `ALTER TABLE breakfast_menu_items ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE;`,
      `ALTER TABLE breakfast_menu_items ADD COLUMN IF NOT EXISTS raw_data JSONB;`,

      `ALTER TABLE maintenances ADD COLUMN IF NOT EXISTS room_id VARCHAR(100);`,
      `ALTER TABLE maintenances ADD COLUMN IF NOT EXISTS room_number VARCHAR(100);`,
      `ALTER TABLE maintenances ADD COLUMN IF NOT EXISTS building VARCHAR(255);`,
      `ALTER TABLE maintenances ADD COLUMN IF NOT EXISTS category VARCHAR(100);`,
      `ALTER TABLE maintenances ADD COLUMN IF NOT EXISTS issue VARCHAR(255);`,
      `ALTER TABLE maintenances ADD COLUMN IF NOT EXISTS description TEXT;`,
      `ALTER TABLE maintenances ADD COLUMN IF NOT EXISTS urgency VARCHAR(50);`,
      `ALTER TABLE maintenances ADD COLUMN IF NOT EXISTS status VARCHAR(50);`,
      `ALTER TABLE maintenances ADD COLUMN IF NOT EXISTS technician VARCHAR(255);`,
      `ALTER TABLE maintenances ADD COLUMN IF NOT EXISTS report_time VARCHAR(100);`,
      `ALTER TABLE maintenances ADD COLUMN IF NOT EXISTS raw_data JSONB;`,

      `ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS room_id VARCHAR(100);`,
      `ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS building VARCHAR(255);`,
      `ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS room_number VARCHAR(100);`,
      `ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS inspector_id VARCHAR(100);`,
      `ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS inspector_name VARCHAR(255);`,
      `ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS inspection_date VARCHAR(100);`,
      `ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS cleanliness VARCHAR(50);`,
      `ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS linen_bed VARCHAR(50);`,
      `ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS ac_electricity VARCHAR(50);`,
      `ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS plumbing_water VARCHAR(50);`,
      `ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS amenities VARCHAR(50);`,
      `ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS result VARCHAR(100);`,
      `ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS notes TEXT;`,
      `ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS raw_data JSONB;`,

      `ALTER TABLE breakfast_orders ADD COLUMN IF NOT EXISTS room_number VARCHAR(100);`,
      `ALTER TABLE breakfast_orders ADD COLUMN IF NOT EXISTS building VARCHAR(255);`,
      `ALTER TABLE breakfast_orders ADD COLUMN IF NOT EXISTS guest_name VARCHAR(255);`,
      `ALTER TABLE breakfast_orders ADD COLUMN IF NOT EXISTS phone VARCHAR(100);`,
      `ALTER TABLE breakfast_orders ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100);`,
      `ALTER TABLE breakfast_orders ADD COLUMN IF NOT EXISTS menu_name VARCHAR(255);`,
      `ALTER TABLE breakfast_orders ADD COLUMN IF NOT EXISTS portions INT DEFAULT 1;`,
      `ALTER TABLE breakfast_orders ADD COLUMN IF NOT EXISTS days INT DEFAULT 1;`,
      `ALTER TABLE breakfast_orders ADD COLUMN IF NOT EXISTS start_date VARCHAR(100);`,
      `ALTER TABLE breakfast_orders ADD COLUMN IF NOT EXISTS status VARCHAR(50);`,
      `ALTER TABLE breakfast_orders ADD COLUMN IF NOT EXISTS total_price NUMERIC DEFAULT 0;`,
      `ALTER TABLE breakfast_orders ADD COLUMN IF NOT EXISTS notes TEXT;`,
      `ALTER TABLE breakfast_orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;`,
      `ALTER TABLE breakfast_orders ADD COLUMN IF NOT EXISTS raw_data JSONB;`,

      `ALTER TABLE cleaning_logs ADD COLUMN IF NOT EXISTS room_id VARCHAR(100);`,
      `ALTER TABLE cleaning_logs ADD COLUMN IF NOT EXISTS room_number VARCHAR(100);`,
      `ALTER TABLE cleaning_logs ADD COLUMN IF NOT EXISTS building VARCHAR(255);`,
      `ALTER TABLE cleaning_logs ADD COLUMN IF NOT EXISTS petugas_name VARCHAR(255);`,
      `ALTER TABLE cleaning_logs ADD COLUMN IF NOT EXISTS timestamp VARCHAR(100);`,
      `ALTER TABLE cleaning_logs ADD COLUMN IF NOT EXISTS photo_url TEXT;`,
      `ALTER TABLE cleaning_logs ADD COLUMN IF NOT EXISTS notes TEXT;`,
      `ALTER TABLE cleaning_logs ADD COLUMN IF NOT EXISTS status VARCHAR(50);`,
      `ALTER TABLE cleaning_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();`,
      `ALTER TABLE cleaning_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`,
      `ALTER TABLE cleaning_logs ADD COLUMN IF NOT EXISTS raw_data JSONB;`,

      `ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS user_id VARCHAR(100);`,
      `ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);`,
      `ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS user_role VARCHAR(100);`,
      `ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS login_time VARCHAR(100);`,
      `ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS logout_time VARCHAR(100);`,
      `ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 0;`,
      `ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS status VARCHAR(50);`,
      `ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS notes TEXT;`,
      `ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();`,
      `ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`,
      `ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS raw_data JSONB;`,

      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS timestamp VARCHAR(100);`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS role VARCHAR(100);`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action VARCHAR(100);`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details TEXT;`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS raw_data JSONB;`,

      `ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS key VARCHAR(100);`,
      `ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS value JSONB;`,
      `ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`
    ];

    for (const alt of alterations) {
      try {
        await client.query(alt);
      } catch (_) {}
    }

    const pkConstraints = [
      `ALTER TABLE buildings DROP CONSTRAINT IF EXISTS buildings_pkey; ALTER TABLE buildings ADD PRIMARY KEY (id);`,
      `ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_pkey; ALTER TABLE rooms ADD PRIMARY KEY (id);`,
      `ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_pkey; ALTER TABLE transactions ADD PRIMARY KEY (id);`,
      `ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey; ALTER TABLE users ADD PRIMARY KEY (id);`,
      `ALTER TABLE meeting_rooms DROP CONSTRAINT IF EXISTS meeting_rooms_pkey; ALTER TABLE meeting_rooms ADD PRIMARY KEY (id);`,
      `ALTER TABLE room_capacity_rates DROP CONSTRAINT IF EXISTS room_capacity_rates_pkey; ALTER TABLE room_capacity_rates ADD PRIMARY KEY (id);`,
      `ALTER TABLE breakfast_menu_items DROP CONSTRAINT IF EXISTS breakfast_menu_items_pkey; ALTER TABLE breakfast_menu_items ADD PRIMARY KEY (id);`,
      `ALTER TABLE maintenances DROP CONSTRAINT IF EXISTS maintenances_pkey; ALTER TABLE maintenances ADD PRIMARY KEY (id);`,
      `ALTER TABLE qc_inspections DROP CONSTRAINT IF EXISTS qc_inspections_pkey; ALTER TABLE qc_inspections ADD PRIMARY KEY (id);`,
      `ALTER TABLE breakfast_orders DROP CONSTRAINT IF EXISTS breakfast_orders_pkey; ALTER TABLE breakfast_orders ADD PRIMARY KEY (id);`,
      `ALTER TABLE cleaning_logs DROP CONSTRAINT IF EXISTS cleaning_logs_pkey; ALTER TABLE cleaning_logs ADD PRIMARY KEY (id);`,
      `ALTER TABLE work_sessions DROP CONSTRAINT IF EXISTS work_sessions_pkey; ALTER TABLE work_sessions ADD PRIMARY KEY (id);`,
      `ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_pkey; ALTER TABLE audit_logs ADD PRIMARY KEY (id);`,
      `ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey; ALTER TABLE app_settings ADD PRIMARY KEY (key);`
    ];

    for (const pk of pkConstraints) {
      try {
        await client.query(pk);
      } catch (_) {}
    }
  }

  // Helper untuk push dataset ke Aiven
  async function pushDatasetToAiven(dataset: any): Promise<{ ok: boolean; counts: Record<string, number>; error?: string }> {
    const pool = getActiveAivenPool();
    if (!pool) {
      return { ok: false, counts: {}, error: "Aiven Database belum dikonfigurasi." };
    }

    const counts: Record<string, number> = {};
    let client: any = null;
    let attempts = 0;
    while (attempts < 3) {
      try {
        client = await pool.connect();
        break;
      } catch (connErr: any) {
        attempts++;
        if (attempts >= 3) {
          return { ok: false, counts: {}, error: `Gagal terhubung ke Aiven setelah 3 percobaan (Timeout/Koneksi): ${connErr?.message || String(connErr)}` };
        }
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    try {
      await client.query("BEGIN");

      // 1. Ensure tables exist
      for (const [tName, ddl] of Object.entries(AIVEN_TABLE_DEFS)) {
        await client.query(ddl);
      }
      await ensureTableColumns(client);

      // 2. Batch Upsert Buildings
      const bList = Array.isArray(dataset.buildings) ? dataset.buildings : [];
      if (bList.length > 0) {
        const rows = bList.filter((b: any) => b && b.id).map((b: any) => ({
          id: String(b.id),
          name: String(b.name || ''),
          code: String(b.code || ''),
          floors: Number(b.floors || 1),
          total_rooms: Number(b.totalRooms || 0),
          capacity_desc: String(b.capacityDesc || ''),
          category: String(b.category || 'PENGINAPAN'),
          status: String(b.status || 'AKTIF'),
          description: String(b.description || ''),
          raw_data: b
        }));
        if (rows.length > 0) {
          await client.query(`
            INSERT INTO buildings (id, name, code, floors, total_rooms, capacity_desc, category, status, description, raw_data, updated_at)
            SELECT id, name, code, floors, total_rooms, capacity_desc, category, status, description, raw_data, NOW()
            FROM jsonb_to_recordset($1::jsonb) AS x(
              id VARCHAR, name VARCHAR, code VARCHAR, floors INT, total_rooms INT, capacity_desc TEXT, category VARCHAR, status VARCHAR, description TEXT, raw_data JSONB
            )
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              code = EXCLUDED.code,
              floors = EXCLUDED.floors,
              total_rooms = EXCLUDED.total_rooms,
              capacity_desc = EXCLUDED.capacity_desc,
              category = EXCLUDED.category,
              status = EXCLUDED.status,
              description = EXCLUDED.description,
              raw_data = EXCLUDED.raw_data,
              updated_at = NOW();
          `, [JSON.stringify(rows)]);
          counts.buildings = rows.length;
        }
      }

      // 3. Batch Upsert Rooms
      const rList = Array.isArray(dataset.rooms) ? dataset.rooms : [];
      if (rList.length > 0) {
        const rows = rList.filter((r: any) => r && r.id).map((r: any) => ({
          id: String(r.id),
          room_number: String(r.roomNumber || r.room_number || ''),
          building: String(r.building || ''),
          building_id: String(r.buildingId || r.building_id || ''),
          floor: Number(r.floor || 1),
          type: String(r.type || 'Standar'),
          bed_type: String(r.bedType || r.bed_type || '4 Single Bed'),
          capacity: String(r.capacity || '4 Orang'),
          capacity_number: Number(r.capacityNumber || r.capacity_number || 4),
          status: String(r.status || 'READY'),
          price_per_night: Number(r.pricePerNight || r.price_per_night || 0),
          facilities: r.facilities || [],
          qc_status: String(r.qcStatus || r.qc_status || 'LOLOS_QC'),
          last_qc_date: r.lastQcDate || null,
          last_qc_by: r.lastQcBy || null,
          last_qc_notes: r.lastQcNotes || null,
          active_tx_id: r.activeTxId || null,
          active_maint_id: r.activeMaintId || null,
          notes: r.notes || null,
          raw_data: r
        }));
        if (rows.length > 0) {
          await client.query(`
            INSERT INTO rooms (id, room_number, building, building_id, floor, type, bed_type, capacity, capacity_number, status, price_per_night, facilities, qc_status, last_qc_date, last_qc_by, last_qc_notes, active_tx_id, active_maint_id, notes, raw_data, updated_at)
            SELECT id, room_number, building, building_id, floor, type, bed_type, capacity, capacity_number, status, price_per_night, facilities, qc_status, last_qc_date, last_qc_by, last_qc_notes, active_tx_id, active_maint_id, notes, raw_data, NOW()
            FROM jsonb_to_recordset($1::jsonb) AS x(
              id VARCHAR, room_number VARCHAR, building VARCHAR, building_id VARCHAR, floor INT, type VARCHAR, bed_type VARCHAR, capacity VARCHAR, capacity_number INT, status VARCHAR, price_per_night NUMERIC, facilities JSONB, qc_status VARCHAR, last_qc_date VARCHAR, last_qc_by VARCHAR, last_qc_notes TEXT, active_tx_id VARCHAR, active_maint_id VARCHAR, notes TEXT, raw_data JSONB
            )
            ON CONFLICT (id) DO UPDATE SET
              room_number = EXCLUDED.room_number,
              building = EXCLUDED.building,
              building_id = EXCLUDED.building_id,
              floor = EXCLUDED.floor,
              type = EXCLUDED.type,
              bed_type = EXCLUDED.bed_type,
              capacity = EXCLUDED.capacity,
              capacity_number = EXCLUDED.capacity_number,
              status = EXCLUDED.status,
              price_per_night = EXCLUDED.price_per_night,
              facilities = EXCLUDED.facilities,
              qc_status = EXCLUDED.qc_status,
              last_qc_date = EXCLUDED.last_qc_date,
              last_qc_by = EXCLUDED.last_qc_by,
              last_qc_notes = EXCLUDED.last_qc_notes,
              active_tx_id = EXCLUDED.active_tx_id,
              active_maint_id = EXCLUDED.active_maint_id,
              notes = EXCLUDED.notes,
              raw_data = EXCLUDED.raw_data,
              updated_at = NOW();
          `, [JSON.stringify(rows)]);
          counts.rooms = rows.length;
        }
      }

      // 4. Batch Upsert Meeting Rooms
      const mrList = Array.isArray(dataset.meetingRooms || dataset.meeting_rooms) ? (dataset.meetingRooms || dataset.meeting_rooms) : [];
      if (mrList.length > 0) {
        const rows = mrList.filter((mr: any) => mr && mr.id).map((mr: any) => ({
          id: String(mr.id),
          name: String(mr.name || ''),
          code: String(mr.code || ''),
          building: String(mr.building || 'Ruang Pertemuan'),
          capacity: String(mr.capacity || '500 Orang'),
          capacity_number: Number(mr.capacityNumber || mr.capacity_number || 500),
          category: String(mr.category || 'AULA'),
          daily_rate: Number(mr.dailyRate || mr.daily_rate || 0),
          session_rate: Number(mr.sessionRate || mr.session_rate || 0),
          facilities: mr.facilities || [],
          description: String(mr.description || ''),
          status: String(mr.status || 'TERSEDIA'),
          qc_status: String(mr.qcStatus || mr.qc_status || 'LOLOS_QC'),
          active_tx_id: mr.activeTxId || null,
          active_maint_id: mr.activeMaintId || null,
          raw_data: mr
        }));
        if (rows.length > 0) {
          await client.query(`
            INSERT INTO meeting_rooms (id, name, code, building, capacity, capacity_number, category, daily_rate, session_rate, facilities, description, status, qc_status, active_tx_id, active_maint_id, raw_data, updated_at)
            SELECT id, name, code, building, capacity, capacity_number, category, daily_rate, session_rate, facilities, description, status, qc_status, active_tx_id, active_maint_id, raw_data, NOW()
            FROM jsonb_to_recordset($1::jsonb) AS x(
              id VARCHAR, name VARCHAR, code VARCHAR, building VARCHAR, capacity VARCHAR, capacity_number INT, category VARCHAR, daily_rate NUMERIC, session_rate NUMERIC, facilities JSONB, description TEXT, status VARCHAR, qc_status VARCHAR, active_tx_id VARCHAR, active_maint_id VARCHAR, raw_data JSONB
            )
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              code = EXCLUDED.code,
              building = EXCLUDED.building,
              capacity = EXCLUDED.capacity,
              capacity_number = EXCLUDED.capacity_number,
              category = EXCLUDED.category,
              daily_rate = EXCLUDED.daily_rate,
              session_rate = EXCLUDED.session_rate,
              facilities = EXCLUDED.facilities,
              description = EXCLUDED.description,
              status = EXCLUDED.status,
              qc_status = EXCLUDED.qc_status,
              active_tx_id = EXCLUDED.active_tx_id,
              active_maint_id = EXCLUDED.active_maint_id,
              raw_data = EXCLUDED.raw_data,
              updated_at = NOW();
          `, [JSON.stringify(rows)]);
          counts.meeting_rooms = rows.length;
        }
      }

      // 5. Batch Upsert Room Capacity Rates
      const rcrList = Array.isArray(dataset.roomCapacityRates || dataset.room_capacity_rates) ? (dataset.roomCapacityRates || dataset.room_capacity_rates) : [];
      if (rcrList.length > 0) {
        const rows = rcrList.filter((r: any) => r && r.id).map((r: any) => ({
          id: String(r.id),
          room_type: String(r.roomType || r.room_type || 'Standar'),
          bed_type: String(r.bedType || r.bed_type || '4 Single Bed'),
          capacity_pax: Number(r.capacityPax || r.capacity_pax || 4),
          price_per_night: Number(r.pricePerNight || r.price_per_night || 0),
          description: String(r.description || ''),
          facilities: r.facilities || [],
          is_active: r.isActive !== false,
          raw_data: r
        }));
        if (rows.length > 0) {
          await client.query(`
            INSERT INTO room_capacity_rates (id, room_type, bed_type, capacity_pax, price_per_night, description, facilities, is_active, raw_data, updated_at)
            SELECT id, room_type, bed_type, capacity_pax, price_per_night, description, facilities, is_active, raw_data, NOW()
            FROM jsonb_to_recordset($1::jsonb) AS x(
              id VARCHAR, room_type VARCHAR, bed_type VARCHAR, capacity_pax INT, price_per_night NUMERIC, description TEXT, facilities JSONB, is_active BOOLEAN, raw_data JSONB
            )
            ON CONFLICT (id) DO UPDATE SET
              room_type = EXCLUDED.room_type,
              bed_type = EXCLUDED.bed_type,
              capacity_pax = EXCLUDED.capacity_pax,
              price_per_night = EXCLUDED.price_per_night,
              description = EXCLUDED.description,
              facilities = EXCLUDED.facilities,
              is_active = EXCLUDED.is_active,
              raw_data = EXCLUDED.raw_data,
              updated_at = NOW();
          `, [JSON.stringify(rows)]);
          counts.room_capacity_rates = rows.length;
        }
      }

      // 6. Batch Upsert Breakfast Menu Items
      const bmiList = Array.isArray(dataset.breakfastMenuItems || dataset.breakfast_menu_items) ? (dataset.breakfastMenuItems || dataset.breakfast_menu_items) : [];
      if (bmiList.length > 0) {
        const rows = bmiList.filter((m: any) => m && m.id).map((m: any) => ({
          id: String(m.id),
          name: String(m.name || ''),
          category: String(m.category || 'MAKANAN_BERAT'),
          price: Number(m.price || 25000),
          description: String(m.description || ''),
          allergens: String(m.allergens || ''),
          is_available: m.isAvailable !== false,
          raw_data: m
        }));
        if (rows.length > 0) {
          await client.query(`
            INSERT INTO breakfast_menu_items (id, name, category, price, description, allergens, is_available, raw_data, updated_at)
            SELECT id, name, category, price, description, allergens, is_available, raw_data, NOW()
            FROM jsonb_to_recordset($1::jsonb) AS x(
              id VARCHAR, name VARCHAR, category VARCHAR, price NUMERIC, description TEXT, allergens TEXT, is_available BOOLEAN, raw_data JSONB
            )
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              category = EXCLUDED.category,
              price = EXCLUDED.price,
              description = EXCLUDED.description,
              allergens = EXCLUDED.allergens,
              is_available = EXCLUDED.is_available,
              raw_data = EXCLUDED.raw_data,
              updated_at = NOW();
          `, [JSON.stringify(rows)]);
          counts.breakfast_menu_items = rows.length;
        }
      }

      // 7. Batch Upsert Transactions
      const txList = Array.isArray(dataset.transactions) ? dataset.transactions : [];
      if (txList.length > 0) {
        const rows = txList.filter((t: any) => t && t.id).map((t: any) => ({
          id: String(t.id),
          room_id: String(t.roomId || t.room_id || ''),
          building: String(t.building || ''),
          room_number: String(t.roomNumber || t.room_number || ''),
          category: String(t.category || 'UMUM'),
          guest_name: String(t.guestName || t.guest_name || ''),
          guest_type: String(t.guestType || t.guest_type || 'INDIVIDU'),
          nik_ktp: String(t.nikKtp || t.nik_ktp || ''),
          kloter: String(t.kloter || ''),
          start_date: String(t.startDate || t.start_date || ''),
          duration: Number(t.duration || 1),
          duration_unit: String(t.durationUnit || t.duration_unit || 'Malam'),
          phone: String(t.phone || ''),
          notes: String(t.notes || ''),
          status: String(t.status || 'BOOKED'),
          created_user: String(t.createdUser || t.created_user || ''),
          is_group: Boolean(t.isGroup ?? t.is_group),
          group_type: String(t.groupType || t.group_type || ''),
          group_name: String(t.groupName || t.group_name || ''),
          group_id: String(t.groupId || t.group_id || ''),
          total_pax: Number(t.totalPax || t.total_pax || 0),
          payment_status: String(t.paymentStatus || t.payment_status || 'BELUM_LUNAS'),
          payment_method: String(t.paymentMethod || t.payment_method || ''),
          paid_amount: Number(t.paidAmount || t.paid_amount || 0),
          total_price: Number(t.totalPrice || t.total_price || 0),
          raw_data: t
        }));
        if (rows.length > 0) {
          await client.query(`
            INSERT INTO transactions (id, room_id, building, room_number, category, guest_name, guest_type, nik_ktp, kloter, start_date, duration, duration_unit, phone, notes, status, created_user, is_group, group_type, group_name, group_id, total_pax, payment_status, payment_method, paid_amount, total_price, raw_data, updated_at)
            SELECT id, room_id, building, room_number, category, guest_name, guest_type, nik_ktp, kloter, start_date, duration, duration_unit, phone, notes, status, created_user, is_group, group_type, group_name, group_id, total_pax, payment_status, payment_method, paid_amount, total_price, raw_data, NOW()
            FROM jsonb_to_recordset($1::jsonb) AS x(
              id VARCHAR, room_id VARCHAR, building VARCHAR, room_number VARCHAR, category VARCHAR, guest_name VARCHAR, guest_type VARCHAR, nik_ktp VARCHAR, kloter VARCHAR, start_date VARCHAR, duration INT, duration_unit VARCHAR, phone VARCHAR, notes TEXT, status VARCHAR, created_user VARCHAR, is_group BOOLEAN, group_type VARCHAR, group_name VARCHAR, group_id VARCHAR, total_pax INT, payment_status VARCHAR, payment_method VARCHAR, paid_amount NUMERIC, total_price NUMERIC, raw_data JSONB
            )
            ON CONFLICT (id) DO UPDATE SET
              room_id = EXCLUDED.room_id,
              building = EXCLUDED.building,
              room_number = EXCLUDED.room_number,
              category = EXCLUDED.category,
              guest_name = EXCLUDED.guest_name,
              guest_type = EXCLUDED.guest_type,
              nik_ktp = EXCLUDED.nik_ktp,
              kloter = EXCLUDED.kloter,
              start_date = EXCLUDED.start_date,
              duration = EXCLUDED.duration,
              duration_unit = EXCLUDED.duration_unit,
              phone = EXCLUDED.phone,
              notes = EXCLUDED.notes,
              status = EXCLUDED.status,
              created_user = EXCLUDED.created_user,
              is_group = EXCLUDED.is_group,
              group_type = EXCLUDED.group_type,
              group_name = EXCLUDED.group_name,
              group_id = EXCLUDED.group_id,
              total_pax = EXCLUDED.total_pax,
              payment_status = EXCLUDED.payment_status,
              payment_method = EXCLUDED.payment_method,
              paid_amount = EXCLUDED.paid_amount,
              total_price = EXCLUDED.total_price,
              raw_data = EXCLUDED.raw_data,
              updated_at = NOW();
          `, [JSON.stringify(rows)]);
          counts.transactions = rows.length;
        }
      }

      // 8. Batch Upsert Users
      const uList = Array.isArray(dataset.users) ? dataset.users : [];
      if (uList.length > 0) {
        const rows = uList.filter((u: any) => u && u.id).map((u: any) => ({
          id: String(u.id),
          username: String(u.username || ''),
          full_name: String(u.fullName || u.full_name || ''),
          role: String(u.role || 'Staff'),
          department: String(u.department || ''),
          assigned_building: String(u.assignedBuilding || u.assigned_building || ''),
          phone: String(u.phone || ''),
          email: String(u.email || ''),
          nip: String(u.nip || ''),
          status: String(u.status || 'active'),
          password: String(u.password || ''),
          permissions: u.permissions || {},
          signature_url: u.signatureUrl || null,
          qr_code_url: u.qrCodeUrl || null,
          raw_data: u
        }));
        if (rows.length > 0) {
          await client.query(`
            INSERT INTO users (id, username, full_name, role, department, assigned_building, phone, email, nip, status, password, permissions, signature_url, qr_code_url, raw_data, updated_at)
            SELECT id, username, full_name, role, department, assigned_building, phone, email, nip, status, password, permissions, signature_url, qr_code_url, raw_data, NOW()
            FROM jsonb_to_recordset($1::jsonb) AS x(
              id VARCHAR, username VARCHAR, full_name VARCHAR, role VARCHAR, department VARCHAR, assigned_building VARCHAR, phone VARCHAR, email VARCHAR, nip VARCHAR, status VARCHAR, password VARCHAR, permissions JSONB, signature_url TEXT, qr_code_url TEXT, raw_data JSONB
            )
            ON CONFLICT (id) DO UPDATE SET
              username = EXCLUDED.username,
              full_name = EXCLUDED.full_name,
              role = EXCLUDED.role,
              department = EXCLUDED.department,
              assigned_building = EXCLUDED.assigned_building,
              phone = EXCLUDED.phone,
              email = EXCLUDED.email,
              nip = EXCLUDED.nip,
              status = EXCLUDED.status,
              password = EXCLUDED.password,
              permissions = EXCLUDED.permissions,
              signature_url = EXCLUDED.signature_url,
              qr_code_url = EXCLUDED.qr_code_url,
              raw_data = EXCLUDED.raw_data,
              updated_at = NOW();
          `, [JSON.stringify(rows)]);
          counts.users = rows.length;
        }
      }

      // 9. Batch Upsert Maintenances
      const mList = Array.isArray(dataset.maintenances) ? dataset.maintenances : [];
      if (mList.length > 0) {
        const rows = mList.filter((m: any) => m && m.id).map((m: any) => ({
          id: String(m.id),
          room_id: String(m.roomId || m.room_id || ''),
          room_number: String(m.roomNumber || m.room_number || ''),
          building: String(m.building || ''),
          category: String(m.category || ''),
          issue: String(m.issue || ''),
          description: String(m.description || ''),
          urgency: String(m.urgency || 'Sedang'),
          status: String(m.status || 'PROSES'),
          technician: String(m.technician || ''),
          report_time: String(m.reportTime || m.report_time || ''),
          raw_data: m
        }));
        if (rows.length > 0) {
          await client.query(`
            INSERT INTO maintenances (id, room_id, room_number, building, category, issue, description, urgency, status, technician, report_time, raw_data, updated_at)
            SELECT id, room_id, room_number, building, category, issue, description, urgency, status, technician, report_time, raw_data, NOW()
            FROM jsonb_to_recordset($1::jsonb) AS x(
              id VARCHAR, room_id VARCHAR, room_number VARCHAR, building VARCHAR, category VARCHAR, issue VARCHAR, description TEXT, urgency VARCHAR, status VARCHAR, technician VARCHAR, report_time VARCHAR, raw_data JSONB
            )
            ON CONFLICT (id) DO UPDATE SET
              room_id = EXCLUDED.room_id,
              room_number = EXCLUDED.room_number,
              building = EXCLUDED.building,
              category = EXCLUDED.category,
              issue = EXCLUDED.issue,
              description = EXCLUDED.description,
              urgency = EXCLUDED.urgency,
              status = EXCLUDED.status,
              technician = EXCLUDED.technician,
              report_time = EXCLUDED.report_time,
              raw_data = EXCLUDED.raw_data,
              updated_at = NOW();
          `, [JSON.stringify(rows)]);
          counts.maintenances = rows.length;
        }
      }

      // 10. Batch Upsert QC Inspections
      const qcList = Array.isArray(dataset.qcInspections || dataset.qc_inspections) ? (dataset.qcInspections || dataset.qc_inspections) : [];
      if (qcList.length > 0) {
        const rows = qcList.filter((q: any) => q && q.id).map((q: any) => ({
          id: String(q.id),
          room_id: String(q.roomId || q.room_id || ''),
          building: String(q.building || ''),
          room_number: String(q.roomNumber || q.room_number || ''),
          inspector_id: String(q.inspectorId || q.inspector_id || ''),
          inspector_name: String(q.inspectorName || q.inspector_name || ''),
          inspection_date: String(q.inspectionDate || q.inspection_date || ''),
          cleanliness: String(q.cleanliness || ''),
          linen_bed: String(q.linenBed || q.linen_bed || ''),
          ac_electricity: String(q.acElectricity || q.ac_electricity || ''),
          plumbing_water: String(q.plumbingWater || q.plumbing_water || ''),
          amenities: String(q.amenities || ''),
          result: String(q.result || 'LOLOS_QC'),
          notes: String(q.notes || ''),
          raw_data: q
        }));
        if (rows.length > 0) {
          await client.query(`
            INSERT INTO qc_inspections (id, room_id, building, room_number, inspector_id, inspector_name, inspection_date, cleanliness, linen_bed, ac_electricity, plumbing_water, amenities, result, notes, raw_data, updated_at)
            SELECT id, room_id, building, room_number, inspector_id, inspector_name, inspection_date, cleanliness, linen_bed, ac_electricity, plumbing_water, amenities, result, notes, raw_data, NOW()
            FROM jsonb_to_recordset($1::jsonb) AS x(
              id VARCHAR, room_id VARCHAR, building VARCHAR, room_number VARCHAR, inspector_id VARCHAR, inspector_name VARCHAR, inspection_date VARCHAR, cleanliness VARCHAR, linen_bed VARCHAR, ac_electricity VARCHAR, plumbing_water VARCHAR, amenities VARCHAR, result VARCHAR, notes TEXT, raw_data JSONB
            )
            ON CONFLICT (id) DO UPDATE SET
              room_id = EXCLUDED.room_id,
              building = EXCLUDED.building,
              room_number = EXCLUDED.room_number,
              inspector_id = EXCLUDED.inspector_id,
              inspector_name = EXCLUDED.inspector_name,
              inspection_date = EXCLUDED.inspection_date,
              cleanliness = EXCLUDED.cleanliness,
              linen_bed = EXCLUDED.linen_bed,
              ac_electricity = EXCLUDED.ac_electricity,
              plumbing_water = EXCLUDED.plumbing_water,
              amenities = EXCLUDED.amenities,
              result = EXCLUDED.result,
              notes = EXCLUDED.notes,
              raw_data = EXCLUDED.raw_data,
              updated_at = NOW();
          `, [JSON.stringify(rows)]);
          counts.qc_inspections = rows.length;
        }
      }

      // 11. Batch Upsert Breakfast Orders
      const boList = Array.isArray(dataset.breakfastOrders || dataset.breakfast_orders) ? (dataset.breakfastOrders || dataset.breakfast_orders) : [];
      if (boList.length > 0) {
        const rows = boList.filter((o: any) => o && o.id).map((o: any) => ({
          id: String(o.id),
          room_number: String(o.roomNumber || o.room_number || ''),
          building: String(o.building || ''),
          guest_name: String(o.guestName || o.guest_name || ''),
          phone: String(o.phone || ''),
          transaction_id: String(o.transactionId || o.transaction_id || ''),
          menu_name: String(o.menuName || o.menu_name || ''),
          portions: Number(o.portions || 1),
          days: Number(o.days || 1),
          start_date: String(o.startDate || o.start_date || ''),
          status: String(o.status || 'MENUNGGU'),
          total_price: Number(o.totalPrice || o.total_price || 0),
          notes: String(o.notes || ''),
          cancel_reason: String(o.cancelReason || o.cancel_reason || ''),
          raw_data: o
        }));
        if (rows.length > 0) {
          await client.query(`
            INSERT INTO breakfast_orders (id, room_number, building, guest_name, phone, transaction_id, menu_name, portions, days, start_date, status, total_price, notes, cancel_reason, raw_data, updated_at)
            SELECT id, room_number, building, guest_name, phone, transaction_id, menu_name, portions, days, start_date, status, total_price, notes, cancel_reason, raw_data, NOW()
            FROM jsonb_to_recordset($1::jsonb) AS x(
              id VARCHAR, room_number VARCHAR, building VARCHAR, guest_name VARCHAR, phone VARCHAR, transaction_id VARCHAR, menu_name VARCHAR, portions INT, days INT, start_date VARCHAR, status VARCHAR, total_price NUMERIC, notes TEXT, cancel_reason TEXT, raw_data JSONB
            )
            ON CONFLICT (id) DO UPDATE SET
              room_number = EXCLUDED.room_number,
              building = EXCLUDED.building,
              guest_name = EXCLUDED.guest_name,
              phone = EXCLUDED.phone,
              transaction_id = EXCLUDED.transaction_id,
              menu_name = EXCLUDED.menu_name,
              portions = EXCLUDED.portions,
              days = EXCLUDED.days,
              start_date = EXCLUDED.start_date,
              status = EXCLUDED.status,
              total_price = EXCLUDED.total_price,
              notes = EXCLUDED.notes,
              cancel_reason = EXCLUDED.cancel_reason,
              raw_data = EXCLUDED.raw_data,
              updated_at = NOW();
          `, [JSON.stringify(rows)]);
          counts.breakfast_orders = rows.length;
        }
      }

      // 12. Batch Upsert Cleaning Logs
      const clList = Array.isArray(dataset.cleaningLogs || dataset.cleaning_logs) ? (dataset.cleaningLogs || dataset.cleaning_logs) : [];
      if (clList.length > 0) {
        const rows = clList.filter((c: any) => c && c.id).map((c: any) => ({
          id: String(c.id),
          room_id: String(c.roomId || c.room_id || ''),
          room_number: String(c.roomNumber || c.room_number || ''),
          building: String(c.building || ''),
          petugas_name: String(c.petugasName || c.petugas_name || ''),
          timestamp: String(c.timestamp || ''),
          photo_url: c.photoUrl || null,
          notes: String(c.notes || ''),
          status: String(c.status || ''),
          raw_data: c
        }));
        if (rows.length > 0) {
          await client.query(`
            INSERT INTO cleaning_logs (id, room_id, room_number, building, petugas_name, timestamp, photo_url, notes, status, raw_data, updated_at)
            SELECT id, room_id, room_number, building, petugas_name, timestamp, photo_url, notes, status, raw_data, NOW()
            FROM jsonb_to_recordset($1::jsonb) AS x(
              id VARCHAR, room_id VARCHAR, room_number VARCHAR, building VARCHAR, petugas_name VARCHAR, timestamp VARCHAR, photo_url TEXT, notes TEXT, status VARCHAR, raw_data JSONB
            )
            ON CONFLICT (id) DO UPDATE SET
              room_id = EXCLUDED.room_id,
              room_number = EXCLUDED.room_number,
              building = EXCLUDED.building,
              petugas_name = EXCLUDED.petugas_name,
              timestamp = EXCLUDED.timestamp,
              photo_url = EXCLUDED.photo_url,
              notes = EXCLUDED.notes,
              status = EXCLUDED.status,
              raw_data = EXCLUDED.raw_data,
              updated_at = NOW();
          `, [JSON.stringify(rows)]);
          counts.cleaning_logs = rows.length;
        }
      }

      // 13. Batch Upsert Work Sessions
      const wsList = Array.isArray(dataset.workSessions || dataset.work_sessions) ? (dataset.workSessions || dataset.work_sessions) : [];
      if (wsList.length > 0) {
        const rows = wsList.filter((s: any) => s && s.id).map((s: any) => ({
          id: String(s.id),
          user_id: String(s.userId || s.user_id || ''),
          user_name: String(s.userName || s.user_name || ''),
          user_role: String(s.userRole || s.user_role || ''),
          login_time: String(s.loginTime || s.login_time || ''),
          logout_time: s.logoutTime || s.logout_time || null,
          duration_seconds: Number(s.durationSeconds || s.duration_seconds || 0),
          status: String(s.status || 'AKTIF'),
          notes: String(s.notes || ''),
          raw_data: s
        }));
        if (rows.length > 0) {
          await client.query(`
            INSERT INTO work_sessions (id, user_id, user_name, user_role, login_time, logout_time, duration_seconds, status, notes, raw_data, updated_at)
            SELECT id, user_id, user_name, user_role, login_time, logout_time, duration_seconds, status, notes, raw_data, NOW()
            FROM jsonb_to_recordset($1::jsonb) AS x(
              id VARCHAR, user_id VARCHAR, user_name VARCHAR, user_role VARCHAR, login_time VARCHAR, logout_time VARCHAR, duration_seconds INT, status VARCHAR, notes TEXT, raw_data JSONB
            )
            ON CONFLICT (id) DO UPDATE SET
              user_id = EXCLUDED.user_id,
              user_name = EXCLUDED.user_name,
              user_role = EXCLUDED.user_role,
              login_time = EXCLUDED.login_time,
              logout_time = EXCLUDED.logout_time,
              duration_seconds = EXCLUDED.duration_seconds,
              status = EXCLUDED.status,
              notes = EXCLUDED.notes,
              raw_data = EXCLUDED.raw_data,
              updated_at = NOW();
          `, [JSON.stringify(rows)]);
          counts.work_sessions = rows.length;
        }
      }

      // 14. Batch Upsert Audit Logs
      const alList = Array.isArray(dataset.auditLogs || dataset.audit_logs) ? (dataset.auditLogs || dataset.audit_logs) : [];
      if (alList.length > 0) {
        const rows = alList.filter((l: any) => l && l.id).map((l: any) => ({
          id: String(l.id),
          timestamp: String(l.timestamp || ''),
          user_name: String(l.userName || l.user_name || l.user || ''),
          role: String(l.role || ''),
          action: String(l.action || ''),
          details: String(l.details || ''),
          raw_data: l
        }));
        if (rows.length > 0) {
          await client.query(`
            INSERT INTO audit_logs (id, timestamp, user_name, role, action, details, raw_data, updated_at)
            SELECT id, timestamp, user_name, role, action, details, raw_data, NOW()
            FROM jsonb_to_recordset($1::jsonb) AS x(
              id VARCHAR, timestamp VARCHAR, user_name VARCHAR, role VARCHAR, action VARCHAR, details TEXT, raw_data JSONB
            )
            ON CONFLICT (id) DO UPDATE SET
              timestamp = EXCLUDED.timestamp,
              user_name = EXCLUDED.user_name,
              role = EXCLUDED.role,
              action = EXCLUDED.action,
              details = EXCLUDED.details,
              raw_data = EXCLUDED.raw_data,
              updated_at = NOW();
          `, [JSON.stringify(rows)]);
          counts.audit_logs = rows.length;
        }
      }

      // 15. App Settings
      if (dataset.appSettings) {
        await client.query(`
          INSERT INTO app_settings (key, value, updated_at)
          VALUES ('general', $1, NOW())
          ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = NOW();
        `, [JSON.stringify(dataset.appSettings)]);
        counts.app_settings = 1;
      }

      await client.query("COMMIT");
      return { ok: true, counts };
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Gagal push ke Aiven PostgreSQL:", err);
      return { ok: false, counts, error: err?.message || String(err) };
    } finally {
      client.release();
    }
  }

  // Helper untuk UPSERT satu rekaman langsung ke Aiven PostgreSQL
  async function upsertSingleRecordToAiven(rawSheet: string, record: any): Promise<boolean> {
    const pool = getActiveAivenPool();
    if (!pool || !record) return false;

    const { snakeKey } = getTableKeys(rawSheet);
    let table = snakeKey;
    if (table === "system_logs") table = "audit_logs";

    let client: any = null;
    let attempts = 0;
    while (attempts < 2) {
      try {
        client = await pool.connect();
        break;
      } catch (connErr: any) {
        attempts++;
        if (attempts >= 2) {
          if (connErr?.message?.includes("timeout") || connErr?.message?.includes("Connection terminated")) {
            try { aivenPool = null; } catch (_) {}
          }
          console.info(`[Aiven Background Upsert Notice] Antrean/timeout koneksi pada ${rawSheet} (${connErr?.message || connErr}). Data aman di server cache.`);
          return false;
        }
        await new Promise(r => setTimeout(r, 600));
      }
    }

    if (!client) return false;

    let didRetry = false;
    while (true) {
      try {
        if (table === "transactions" && record.id) {
        await client.query(`
          INSERT INTO transactions (id, room_id, building, room_number, category, guest_name, guest_type, nik_ktp, kloter, start_date, duration, duration_unit, phone, notes, status, created_user, is_group, group_type, group_name, group_id, total_pax, payment_status, payment_method, paid_amount, total_price, raw_data, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, NOW())
          ON CONFLICT (id) DO UPDATE SET
            room_id = EXCLUDED.room_id,
            building = EXCLUDED.building,
            room_number = EXCLUDED.room_number,
            category = EXCLUDED.category,
            guest_name = EXCLUDED.guest_name,
            guest_type = EXCLUDED.guest_type,
            nik_ktp = EXCLUDED.nik_ktp,
            kloter = EXCLUDED.kloter,
            start_date = EXCLUDED.start_date,
            duration = EXCLUDED.duration,
            duration_unit = EXCLUDED.duration_unit,
            phone = EXCLUDED.phone,
            notes = EXCLUDED.notes,
            status = EXCLUDED.status,
            created_user = EXCLUDED.created_user,
            is_group = EXCLUDED.is_group,
            group_type = EXCLUDED.group_type,
            group_name = EXCLUDED.group_name,
            group_id = EXCLUDED.group_id,
            total_pax = EXCLUDED.total_pax,
            payment_status = EXCLUDED.payment_status,
            payment_method = EXCLUDED.payment_method,
            paid_amount = EXCLUDED.paid_amount,
            total_price = EXCLUDED.total_price,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW();
        `, [
          record.id, record.roomId || '', record.building || '', record.roomNumber || '', record.category || 'UMUM',
          record.guestName || '', record.guestType || 'INDIVIDU', record.nikKtp || '', record.kloter || '',
          record.startDate || '', record.duration || 1, record.durationUnit || 'Malam', record.phone || '',
          record.notes || '', record.status || 'BOOKED', record.createdUser || '', record.isGroup || false,
          record.groupType || '', record.groupName || '', record.groupId || '', record.totalPax || 1,
          record.paymentStatus || 'BELUM_LUNAS', record.paymentMethod || '', record.paidAmount || 0,
          record.totalPrice || 0, JSON.stringify(record)
        ]);
      } else if (table === "rooms" && record.id) {
        await client.query(`
          INSERT INTO rooms (id, room_number, building, building_id, floor, type, bed_type, capacity, capacity_number, status, price_per_night, facilities, qc_status, last_qc_date, last_qc_by, last_qc_notes, active_tx_id, active_maint_id, notes, raw_data, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW())
          ON CONFLICT (id) DO UPDATE SET
            room_number = EXCLUDED.room_number,
            building = EXCLUDED.building,
            building_id = EXCLUDED.building_id,
            floor = EXCLUDED.floor,
            type = EXCLUDED.type,
            bed_type = EXCLUDED.bed_type,
            capacity = EXCLUDED.capacity,
            capacity_number = EXCLUDED.capacity_number,
            status = EXCLUDED.status,
            price_per_night = EXCLUDED.price_per_night,
            facilities = EXCLUDED.facilities,
            qc_status = EXCLUDED.qc_status,
            last_qc_date = EXCLUDED.last_qc_date,
            last_qc_by = EXCLUDED.last_qc_by,
            last_qc_notes = EXCLUDED.last_qc_notes,
            active_tx_id = EXCLUDED.active_tx_id,
            active_maint_id = EXCLUDED.active_maint_id,
            notes = EXCLUDED.notes,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW();
        `, [
          record.id, record.roomNumber || '', record.building || '', record.buildingId || '', record.floor || 1,
          record.type || 'Standar', record.bedType || '4 Single Bed', record.capacity || '4 Orang',
          record.capacityNumber || 4, record.status || 'READY', record.pricePerNight || 0,
          JSON.stringify(record.facilities || []), record.qcStatus || 'LOLOS_QC', record.lastQcDate || null,
          record.lastQcBy || null, record.lastQcNotes || null, record.activeTxId || null,
          record.activeMaintId || null, record.notes || null, JSON.stringify(record)
        ]);
      } else if (table === "users" && record.id) {
        await client.query(`
          INSERT INTO users (id, username, full_name, role, department, assigned_building, phone, email, nip, status, password, permissions, signature_url, qr_code_url, raw_data, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
          ON CONFLICT (id) DO UPDATE SET
            username = EXCLUDED.username,
            full_name = EXCLUDED.full_name,
            role = EXCLUDED.role,
            department = EXCLUDED.department,
            assigned_building = EXCLUDED.assigned_building,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            nip = EXCLUDED.nip,
            status = EXCLUDED.status,
            password = EXCLUDED.password,
            permissions = EXCLUDED.permissions,
            signature_url = EXCLUDED.signature_url,
            qr_code_url = EXCLUDED.qr_code_url,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW();
        `, [
          record.id, record.username || '', record.fullName || record.full_name || '', record.role || 'Resepsionis',
          record.department || '', record.assignedBuilding || record.assigned_building || '',
          record.phone || '', record.email || '', record.nip || '', record.status || 'active',
          record.password || '', JSON.stringify(record.permissions || {}), record.signatureUrl || null,
          record.qrCodeUrl || null, JSON.stringify(record)
        ]);
      } else if (table === "buildings" && record.id) {
        await client.query(`
          INSERT INTO buildings (id, name, code, floors, total_rooms, capacity_desc, category, status, description, raw_data, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            code = EXCLUDED.code,
            floors = EXCLUDED.floors,
            total_rooms = EXCLUDED.total_rooms,
            capacity_desc = EXCLUDED.capacity_desc,
            category = EXCLUDED.category,
            status = EXCLUDED.status,
            description = EXCLUDED.description,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW();
        `, [
          record.id, record.name || '', record.code || '', record.floors || 1, record.totalRooms || 0,
          record.capacityDesc || '', record.category || 'PENGINAPAN', record.status || 'AKTIF',
          record.description || '', JSON.stringify(record)
        ]);
      } else if (table === "work_sessions" && record.id) {
        await client.query(`
          INSERT INTO work_sessions (id, user_id, user_name, user_role, login_time, logout_time, duration_seconds, status, notes, raw_data, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            user_name = EXCLUDED.user_name,
            user_role = EXCLUDED.user_role,
            login_time = EXCLUDED.login_time,
            logout_time = EXCLUDED.logout_time,
            duration_seconds = EXCLUDED.duration_seconds,
            status = EXCLUDED.status,
            notes = EXCLUDED.notes,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW();
        `, [
          record.id, record.userId || '', record.userName || '', record.userRole || '',
          record.loginTime || '', record.logoutTime || null, record.durationSeconds || 0,
          record.status || 'AKTIF', record.notes || '', JSON.stringify(record)
        ]);
      } else if (table === "audit_logs" && record.id) {
        await client.query(`
          INSERT INTO audit_logs (id, timestamp, user_name, role, action, details, raw_data, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (id) DO UPDATE SET
            timestamp = EXCLUDED.timestamp,
            user_name = EXCLUDED.user_name,
            role = EXCLUDED.role,
            action = EXCLUDED.action,
            details = EXCLUDED.details,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW();
        `, [
          record.id, record.timestamp || '', record.userName || '', record.role || '',
          record.action || '', record.details || '', JSON.stringify(record)
        ]);
      } else if (table === "maintenances" && record.id) {
        await client.query(`
          INSERT INTO maintenances (id, room_id, room_number, building, category, issue, description, urgency, status, technician, report_time, raw_data, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
          ON CONFLICT (id) DO UPDATE SET
            room_id = EXCLUDED.room_id,
            room_number = EXCLUDED.room_number,
            building = EXCLUDED.building,
            category = EXCLUDED.category,
            issue = EXCLUDED.issue,
            description = EXCLUDED.description,
            urgency = EXCLUDED.urgency,
            status = EXCLUDED.status,
            technician = EXCLUDED.technician,
            report_time = EXCLUDED.report_time,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW();
        `, [
          record.id, record.roomId || '', record.roomNumber || '', record.building || '', record.category || '',
          record.issue || '', record.description || '', record.urgency || 'Sedang', record.status || 'PROSES',
          record.technician || '', record.reportTime || '', JSON.stringify(record)
        ]);
      } else if (table === "qc_inspections" && record.id) {
        await client.query(`
          INSERT INTO qc_inspections (id, room_id, building, room_number, inspector_id, inspector_name, inspection_date, cleanliness, linen_bed, ac_electricity, plumbing_water, amenities, result, notes, raw_data, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
          ON CONFLICT (id) DO UPDATE SET
            room_id = EXCLUDED.room_id,
            building = EXCLUDED.building,
            room_number = EXCLUDED.room_number,
            inspector_id = EXCLUDED.inspector_id,
            inspector_name = EXCLUDED.inspector_name,
            inspection_date = EXCLUDED.inspection_date,
            cleanliness = EXCLUDED.cleanliness,
            linen_bed = EXCLUDED.linen_bed,
            ac_electricity = EXCLUDED.ac_electricity,
            plumbing_water = EXCLUDED.plumbing_water,
            amenities = EXCLUDED.amenities,
            result = EXCLUDED.result,
            notes = EXCLUDED.notes,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW();
        `, [
          record.id, record.roomId || '', record.building || '', record.roomNumber || '', record.inspectorId || '',
          record.inspectorName || '', record.inspectionDate || '', record.cleanliness || '', record.linenBed || '',
          record.acElectricity || '', record.plumbingWater || '', record.amenities || '', record.result || 'LOLOS_QC',
          record.notes || '', JSON.stringify(record)
        ]);
      } else if (table === "breakfast_orders" && record.id) {
        await client.query(`
          INSERT INTO breakfast_orders (id, room_number, building, guest_name, phone, transaction_id, menu_name, portions, days, start_date, status, total_price, notes, cancel_reason, raw_data, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
          ON CONFLICT (id) DO UPDATE SET
            room_number = EXCLUDED.room_number,
            building = EXCLUDED.building,
            guest_name = EXCLUDED.guest_name,
            phone = EXCLUDED.phone,
            transaction_id = EXCLUDED.transaction_id,
            menu_name = EXCLUDED.menu_name,
            portions = EXCLUDED.portions,
            days = EXCLUDED.days,
            start_date = EXCLUDED.start_date,
            status = EXCLUDED.status,
            total_price = EXCLUDED.total_price,
            notes = EXCLUDED.notes,
            cancel_reason = EXCLUDED.cancel_reason,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW();
        `, [
          record.id, record.roomNumber || '', record.building || '', record.guestName || '', record.phone || '',
          record.transactionId || '', record.menuName || '', record.portions || 1, record.days || 1,
          record.startDate || '', record.status || 'MENUNGGU', record.totalPrice || 0, record.notes || '',
          record.cancelReason || '', JSON.stringify(record)
        ]);
      } else if (table === "app_settings") {
        const key = record.key || 'general';
        const val = record.value || record;
        await client.query(`
          INSERT INTO app_settings (key, value, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
        `, [key, JSON.stringify(val)]);
      } else if (record.id) {
        try {
          await client.query(`
            INSERT INTO ${table} (id, raw_data, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (id) DO UPDATE SET raw_data = EXCLUDED.raw_data, updated_at = NOW();
          `, [record.id, JSON.stringify(record)]);
        } catch (_) {}
      }
      return true;
    } catch (err: any) {
      if (!didRetry && client && err?.message && (err.message.includes("does not exist") || err.message.includes("column"))) {
        didRetry = true;
        try {
          await ensureTableColumns(client);
          await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`).catch(() => {});
          await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();`).catch(() => {});
          await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS raw_data JSONB;`).catch(() => {});
          continue;
        } catch (_) {}
      }
      console.info(`[Aiven Background Upsert Notice on ${rawSheet}]:`, err?.message || err);
      return false;
    } finally {
      if (client) {
        try { client.release(); } catch (_) {}
        client = null;
      }
    }
    }
  }

  // Helper untuk DELETE satu rekaman langsung dari Aiven PostgreSQL
  async function deleteSingleRecordFromAiven(rawSheet: string, recordId: string): Promise<boolean> {
    const pool = getActiveAivenPool();
    if (!pool || !recordId) return false;

    const { snakeKey } = getTableKeys(rawSheet);
    let table = snakeKey;
    if (table === "system_logs") table = "audit_logs";

    let client: any = null;
    try {
      client = await pool.connect();
      await client.query(`DELETE FROM ${table} WHERE id = $1;`, [String(recordId).trim()]);
      return true;
    } catch (err) {
      console.info(`[Aiven Background Delete Notice on ${table}]:`, err);
      return false;
    } finally {
      if (client) client.release();
    }
  }

  // ----------------- AIVEN API ENDPOINTS -----------------
  // 1. Get Aiven Config
  app.get("/api/aiven/config", (_req, res) => {
    res.json({
      serviceUri: activeAivenConfig.serviceUri || "",
      host: activeAivenConfig.host || "",
      port: activeAivenConfig.port || 5432,
      database: activeAivenConfig.database || "defaultdb",
      user: activeAivenConfig.user || "avnadmin",
      hasPassword: Boolean(activeAivenConfig.password),
      password: activeAivenConfig.password || "",
      ssl: activeAivenConfig.ssl !== false,
      isConfigured: activeAivenConfig.isConfigured,
      lastConnectedAt: activeAivenConfig.lastConnectedAt || null,
      lastError: activeAivenConfig.lastError || null,
      latencyMs: activeAivenConfig.latencyMs || null,
      pgVersion: activeAivenConfig.pgVersion || null,
      updatedAt: activeAivenConfig.updatedAt
    });
  });

  // 2. Save Aiven Config
  app.post("/api/aiven/config", (req, res) => {
    const { serviceUri, host, port, database, user, password, ssl } = req.body || {};
    
    let cleanUri = String(serviceUri || "").trim();
    let finalHost = String(host || "").trim();
    let finalPort = Number(port) || 5432;
    let finalDatabase = String(database || "").trim() || "defaultdb";
    let finalUser = String(user || "").trim() || "avnadmin";
    let finalPassword = String(password || "").trim();

    if (cleanUri) {
      const parsed = parseAivenUri(cleanUri);
      if (parsed) {
        finalHost = parsed.host;
        finalPort = parsed.port;
        finalUser = parsed.user;
        finalPassword = parsed.password || finalPassword;
        finalDatabase = parsed.database;
      }
    } else if (finalHost && finalPassword) {
      cleanUri = `postgres://${encodeURIComponent(finalUser)}:${encodeURIComponent(finalPassword)}@${finalHost}:${finalPort}/${finalDatabase}?sslmode=require`;
    }

    activeAivenConfig = {
      serviceUri: cleanUri,
      host: finalHost,
      port: finalPort,
      database: finalDatabase,
      user: finalUser,
      password: finalPassword,
      ssl: ssl !== false,
      isConfigured: Boolean(cleanUri || (finalHost && finalPassword)),
      lastConnectedAt: activeAivenConfig.lastConnectedAt || null,
      lastError: null,
      latencyMs: activeAivenConfig.latencyMs || null,
      pgVersion: activeAivenConfig.pgVersion || null,
      updatedAt: new Date().toISOString()
    };

    // Close existing pool to reload with new credentials
    if (aivenPool) {
      aivenPool.end().catch(() => {});
      aivenPool = null;
    }

    // Save to disk
    try {
      fs.writeFileSync(aivenConfigFilePath, JSON.stringify(activeAivenConfig, null, 2), "utf-8");
      
      let envContent = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, "utf-8") : "";
      if (cleanUri) {
        process.env.AIVEN_DATABASE_URL = cleanUri;
        if (envContent.includes("AIVEN_DATABASE_URL=")) {
          envContent = envContent.replace(/AIVEN_DATABASE_URL=.*/, `AIVEN_DATABASE_URL=${cleanUri}`);
        } else {
          envContent += `\nAIVEN_DATABASE_URL=${cleanUri}`;
        }
        fs.writeFileSync(envFilePath, envContent, "utf-8");
      }
    } catch (err) {
      console.warn("Gagal menyimpan aiven_database_config.json:", err);
    }

    broadcastRealtimeEvent("config:aiven", {
      isConfigured: activeAivenConfig.isConfigured,
      host: activeAivenConfig.host,
      database: activeAivenConfig.database
    });

    res.json({ ok: true, config: activeAivenConfig });
  });

  // 3. Test Connection to Aiven
  app.post("/api/aiven/test", async (req, res) => {
    const customConfig = req.body?.serviceUri || req.body?.host ? req.body : activeAivenConfig;
    const testPool = createAivenPoolInstance(customConfig);

    if (!testPool) {
      return res.status(400).json({ ok: false, error: "Parameter koneksi Aiven tidak lengkap (Service URI atau Host & Password diperlukan)." });
    }

    const start = Date.now();
    try {
      const client = await testPool.connect();
      try {
        const queryRes = await client.query("SELECT NOW() as current_time, version() as version, current_database() as db_name, current_user as db_user;");
        const latencyMs = Date.now() - start;
        const row = queryRes.rows[0];

        activeAivenConfig.lastConnectedAt = new Date().toISOString();
        activeAivenConfig.lastError = null;
        activeAivenConfig.latencyMs = latencyMs;
        activeAivenConfig.pgVersion = row.version;

        try {
          fs.writeFileSync(aivenConfigFilePath, JSON.stringify(activeAivenConfig, null, 2), "utf-8");
        } catch (_) {}

        return res.json({
          ok: true,
          latencyMs,
          currentTime: row.current_time,
          version: row.version,
          database: row.db_name,
          user: row.db_user,
          message: `Koneksi ke Aiven Cloud PostgreSQL berhasil! Latensi: ${latencyMs}ms.`
        });
      } finally {
        client.release();
        testPool.end().catch(() => {});
      }
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      activeAivenConfig.lastError = errorMsg;
      try {
        fs.writeFileSync(aivenConfigFilePath, JSON.stringify(activeAivenConfig, null, 2), "utf-8");
      } catch (_) {}

      return res.status(500).json({
        ok: false,
        error: errorMsg,
        message: `Gagal terhubung ke Aiven: ${errorMsg}`
      });
    }
  });

  // 3.5 Reconnect / Reset Aiven Pool (Clear Connection Exhaustion / Slots)
  app.post("/api/aiven/reconnect", async (_req, res) => {
    try {
      if (aivenPool) {
        await aivenPool.end().catch(() => {});
        aivenPool = null;
      }
      const newPool = getActiveAivenPool();
      if (!newPool) {
        return res.status(400).json({ ok: false, error: "Aiven Database belum dikonfigurasi." });
      }
      const client = await newPool.connect();
      try {
        await client.query("SELECT 1;");
      } finally {
        client.release();
      }
      res.json({ ok: true, message: "Koneksi pool Aiven berhasil di-reset dan tersambung kembali." });
    } catch (err: any) {
      if (aivenPool) {
        aivenPool.end().catch(() => {});
        aivenPool = null;
      }
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  // 4. Initialize Tables in Aiven
  app.post("/api/aiven/init-tables", async (_req, res) => {
    const pool = getActiveAivenPool();
    if (!pool) {
      return res.status(400).json({ ok: false, error: "Aiven Database belum dikonfigurasi. Silakan isi Service URI terlebih dahulu." });
    }

    try {
      let client: any = null;
      let attempts = 0;
      while (attempts < 3) {
        try {
          client = await pool.connect();
          break;
        } catch (connErr: any) {
          attempts++;
          if (attempts >= 3) {
            return res.status(500).json({ ok: false, error: `Gagal terhubung ke Aiven setelah 3 percobaan: ${connErr?.message || String(connErr)}` });
          }
          await new Promise(r => setTimeout(r, 1500));
        }
      }
      const createdTables: string[] = [];
      try {
        for (const [tableName, ddl] of Object.entries(AIVEN_TABLE_DEFS)) {
          await client.query(ddl);
          createdTables.push(tableName);
        }
        await ensureTableColumns(client);
      } finally {
        client.release();
      }

      res.json({
        ok: true,
        tables: createdTables,
        total: createdTables.length,
        message: `Berhasil menginisialisasi ${createdTables.length} tabel skema di Aiven PostgreSQL!`
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  // 5. Push Local/Cache Data to Aiven
  app.post("/api/aiven/push", async (req, res) => {
    const payload = req.body && Object.keys(req.body).length > 0 ? req.body : serverDatabaseCache;
    if (!payload) {
      return res.status(400).json({ ok: false, error: "Tidak ada data lokal yang dapat dikirim ke Aiven." });
    }

    const result = await pushDatasetToAiven(payload);
    if (!result.ok) {
      return res.status(500).json({ ok: false, error: result.error });
    }

    res.json({
      ok: true,
      counts: result.counts,
      message: "Seluruh data berhasil disinkronkan dan disimpan permanen di Aiven Cloud PostgreSQL!"
    });
  });

  // 6. Pull Data from Aiven to App
  app.post("/api/aiven/pull", async (_req, res) => {
    const pool = getActiveAivenPool();
    if (!pool) {
      return res.status(400).json({ ok: false, error: "Aiven Database belum dikonfigurasi." });
    }

    try {
      const resultData: any = {};
      const tableList = [
        'buildings', 'rooms', 'meeting_rooms', 'room_capacity_rates',
        'breakfast_menu_items', 'transactions', 'users', 'maintenances',
        'qc_inspections', 'breakfast_orders', 'cleaning_logs', 'work_sessions',
        'audit_logs'
      ];

      await Promise.all([
        ...tableList.map(async (t) => {
          try {
            const qr = await pool.query(`SELECT * FROM ${t};`);
            resultData[t] = qr.rows.map((row: any) => {
              let parsedRaw: any = {};
              if (row.raw_data) {
                if (typeof row.raw_data === 'object') {
                  parsedRaw = row.raw_data;
                } else if (typeof row.raw_data === 'string') {
                  try { parsedRaw = JSON.parse(row.raw_data); } catch (_) {}
                }
              }
              const merged = { ...parsedRaw, ...row };
              if (t === 'room_capacity_rates') {
                return {
                  ...merged,
                  roomType: parsedRaw.roomType || row.room_type || row.roomType || 'Standar',
                  bedType: parsedRaw.bedType || row.bed_type || row.bedType || '4 Single Bed',
                  capacityPax: Number(parsedRaw.capacityPax ?? row.capacity_pax ?? row.capacityPax ?? 4),
                  pricePerNight: Number(parsedRaw.pricePerNight ?? row.price_per_night ?? row.pricePerNight ?? 400000),
                  isActive: parsedRaw.isActive !== undefined ? parsedRaw.isActive : (row.is_active !== undefined ? row.is_active : true)
                };
              }
              return merged;
            });
          } catch (_) {
            resultData[t] = [];
          }
        }),
        (async () => {
          try {
            const setQr = await pool.query(`SELECT value FROM app_settings WHERE key = 'general' LIMIT 1;`);
            if (setQr.rows.length > 0 && setQr.rows[0].value) {
              resultData.appSettings = setQr.rows[0].value;
            }
          } catch (_) {}
        })()
      ]);

      // Update server local cache
      if (resultData.buildings?.length > 0 || resultData.rooms?.length > 0) {
        serverDatabaseCache = {
          ...serverDatabaseCache,
          buildings: resultData.buildings || [],
          rooms: resultData.rooms || [],
          meetingRooms: resultData.meeting_rooms || [],
          roomCapacityRates: resultData.room_capacity_rates || [],
          breakfastMenuItems: resultData.breakfast_menu_items || [],
          transactions: resultData.transactions || [],
          users: resultData.users || [],
          maintenances: resultData.maintenances || [],
          qcInspections: resultData.qc_inspections || [],
          breakfastOrders: resultData.breakfast_orders || [],
          cleaningLogs: resultData.cleaning_logs || [],
          workSessions: resultData.work_sessions || [],
          auditLogs: resultData.audit_logs || [],
          appSettings: resultData.appSettings || serverDatabaseCache?.appSettings
        };
        try {
          fs.writeFileSync(serverDbCachePath, JSON.stringify(serverDatabaseCache, null, 2), "utf-8");
        } catch (_) {}

        broadcastRealtimeEvent("database:sync", { timestamp: Date.now(), db: serverDatabaseCache });
      }

      res.json({
        ok: true,
        data: resultData,
        message: "Data terbaru berhasil ditarik dari Aiven Cloud PostgreSQL!"
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  // 7. Get Table Stats & Record Counts from Aiven
  app.get("/api/aiven/tables-stats", async (_req, res) => {
    const pool = getActiveAivenPool();
    if (!pool) {
      return res.json({ ok: false, isConfigured: false, tables: [] });
    }

    try {
      const client = await pool.connect();
      const tables: Array<{ name: string; label: string; count: number; exists: boolean }> = [];
      try {
        const tableMetadata: Record<string, string> = {
          buildings: "Gedung & Properti",
          rooms: "Kamar & Unit Hunian",
          meeting_rooms: "Ruang Pertemuan & Serbaguna",
          room_capacity_rates: "Katalog Tarif & Kapasitas",
          breakfast_menu_items: "Katalog Menu & Katering",
          transactions: "Transaksi & Reservasi",
          users: "Pengguna & Petugas",
          maintenances: "Laporan Pemeliharaan",
          qc_inspections: "Inspeksi Mutu QC",
          breakfast_orders: "Pesanan Konsumsi",
          cleaning_logs: "Laporan Housekeeping",
          work_sessions: "Sesi Jam Kerja",
          audit_logs: "Log Audit Sistem",
          app_settings: "Pengaturan Instansi"
        };

        for (const [tbl, label] of Object.entries(tableMetadata)) {
          try {
            const check = await client.query(`SELECT count(*)::int as cnt FROM ${tbl};`);
            tables.push({
              name: tbl,
              label,
              count: check.rows[0].cnt || 0,
              exists: true
            });
          } catch (_) {
            tables.push({
              name: tbl,
              label,
              count: 0,
              exists: false
            });
          }
        }
      } finally {
        client.release();
      }

      res.json({ ok: true, isConfigured: true, tables });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err), tables: [] });
    }
  });

  // 8. Custom SQL Query Console (Super Admin)
  app.post("/api/aiven/query", async (req, res) => {
    const pool = getActiveAivenPool();
    if (!pool) {
      return res.status(400).json({ ok: false, error: "Aiven Database belum terhubung." });
    }

    const sql = String(req.body?.sql || "").trim();
    if (!sql) {
      return res.status(400).json({ ok: false, error: "Query SQL tidak boleh kosong." });
    }

    const start = Date.now();
    try {
      const client = await pool.connect();
      try {
        const qRes = await client.query(sql);
        const durationMs = Date.now() - start;

        res.json({
          ok: true,
          command: qRes.command,
          rowCount: qRes.rowCount,
          fields: (qRes.fields || []).map(f => ({ name: f.name, dataTypeID: f.dataTypeID })),
          rows: qRes.rows || [],
          durationMs
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err?.message || String(err) });
    }
  });

  // Skema Baku Database SIM Asrama Haji untuk Google Spreadsheet (Lengkap & Terstandarisasi)
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
      headers: [
        "id",
        "name",
        "code",
        "floors",
        "total_rooms",
        "capacity_desc",
        "category",
        "status",
        "description",
        "created_at",
        "updated_at",
      ],
      description: "Data master gedung penginapan, asrama, kantor, dan aula serbaguna",
    },
    rooms: {
      sheetName: "rooms",
      label: "Kamar & Unit Hunian",
      category: "Katalog & Master",
      headers: [
        "id",
        "room_number",
        "building",
        "building_id",
        "floor",
        "type",
        "bed_type",
        "capacity",
        "capacity_number",
        "status",
        "price_per_night",
        "facilities",
        "qc_status",
        "last_qc_date",
        "last_qc_by",
        "last_qc_notes",
        "active_tx_id",
        "active_maint_id",
        "notes",
        "created_at",
        "updated_at",
      ],
      description: "Master unit kamar hunian, nomor kamar, gedung, kapasitas, dan tarif",
    },
    meeting_rooms: {
      sheetName: "meeting_rooms",
      label: "Ruang Pertemuan / Aula",
      category: "Katalog & Master",
      headers: [
        "id",
        "name",
        "code",
        "category",
        "building",
        "floor",
        "capacity",
        "capacity_number",
        "daily_rate",
        "session_rate",
        "rate_half_day",
        "rate_full_day",
        "status",
        "qc_status",
        "facilities",
        "amenities",
        "description",
        "active_tx_id",
        "active_maint_id",
        "notes",
        "created_at",
        "updated_at",
      ],
      description: "Ruang serbaguna (SG), ballroom rapat, dan fasilitas aula",
    },
    room_capacity_rates: {
      sheetName: "room_capacity_rates",
      label: "Katalog Tipe Kamar & Tarif Kapasitas",
      category: "Katalog & Master",
      headers: [
        "id",
        "room_type",
        "bed_type",
        "capacity_pax",
        "price_per_night",
        "description",
        "facilities",
        "is_active",
        "updated_at",
      ],
      description: "Master tipe kamar (Ekonomi, Standar, Superior), varian bed (Double s/d 8 Single Bed), kapasitas pax, dan tarif per malam",
    },
    breakfast_menu_items: {
      sheetName: "breakfast_menu_items",
      label: "Katalog Menu Katering & Sarapan",
      category: "Katalog & Master",
      headers: [
        "id",
        "name",
        "category",
        "price",
        "description",
        "is_available",
        "allergens",
        "updated_at",
      ],
      description: "Katalog menu makanan berat, bubur/sayur, snack/kudapan, minuman, dan sehat lansia",
    },
    transactions: {
      sheetName: "transactions",
      label: "Reservasi & Tamu",
      category: "Operasional & Transaksi",
      headers: [
        "id",
        "room_id",
        "room_number",
        "building",
        "guest_name",
        "guest_type",
        "nik_ktp",
        "kloter",
        "phone",
        "email",
        "category",
        "status",
        "start_date",
        "duration",
        "duration_unit",
        "price_per_night",
        "total_amount",
        "payment_status",
        "payment_method",
        "payment_date",
        "payment_note",
        "kwitansi_no",
        "is_paid",
        "paid_amount",
        "dp_amount",
        "dp_date",
        "dp_method",
        "dp_note",
        "remaining_amount",
        "already_paid",
        "va_number",
        "va_account_name",
        "bank_name",
        "bank_account_number",
        "is_group",
        "group_id",
        "group_type",
        "group_name",
        "group_pic",
        "group_pic_phone",
        "total_pax",
        "agency_or_document",
        "spk_number",
        "allocated_room_numbers",
        "allocated_rooms_count",
        "include_aula",
        "rent_aula_id",
        "rent_aula_name",
        "rent_aula_duration",
        "rent_aula_duration_days",
        "rent_aula_session",
        "catering_package",
        "catering_pax_count",
        "breakfast",
        "breakfast_menu",
        "breakfast_portions",
        "breakfast_days",
        "breakfast_status",
        "rent_type",
        "extra_bed",
        "extra_bed_count",
        "extra_bed_price",
        "extra_bed_notes",
        "check_in_time",
        "check_out_time",
        "notes",
        "created_user",
        "created_at",
        "updated_at",
        "cancelled_at",
        "cancel_reason",
        "cancelled_user",
        "extended_count",
        "extend_history",
      ],
      description: "Buku tamu lengkap, registrasi individu/rombongan, check-in, check-out, rincian pembayaran DP/Lunas, dan histori perpanjangan",
    },
    users: {
      sheetName: "users",
      label: "Pengguna & Petugas",
      category: "Sistem & Pengguna",
      headers: [
        "id",
        "username",
        "full_name",
        "role",
        "department",
        "assigned_building",
        "supervisor_id",
        "phone",
        "email",
        "nip",
        "status",
        "is_owner",
        "password",
        "signature_url",
        "qr_code_url",
        "permissions",
        "updated_at",
      ],
      description: "Daftar akun staf resepsionis, keuangan/bendahara, QC, teknisi, tanda tangan digital, dan otorisasi sistem",
    },
    maintenances: {
      sheetName: "maintenances",
      label: "Perawatan Fasilitas",
      category: "Operasional & Transaksi",
      headers: [
        "id",
        "room_id",
        "room_number",
        "building",
        "category",
        "issue",
        "description",
        "urgency",
        "status",
        "technician",
        "assigned_technician_id",
        "assigned_technician_name",
        "assigned_by_manager",
        "assigned_time",
        "manager_notes",
        "technician_notes",
        "work_completed_time",
        "reporter",
        "reported_user",
        "report_time",
        "created_at",
        "resolved_time",
        "resolved_at",
        "qc_inspection_id",
        "qc_verdict",
        "facility_type",
        "notes",
        "updated_at",
      ],
      description: "Tiket kerusakan, disposisi teknisi, pelaporan, dan verifikasi perbaikan fasilitas asrama",
    },
    qc_inspections: {
      sheetName: "qc_inspections",
      label: "Inspeksi Mutu QC",
      category: "Operasional & Transaksi",
      headers: [
        "id",
        "room_id",
        "building",
        "room_number",
        "inspector_id",
        "inspector_name",
        "inspection_date",
        "cleanliness",
        "linen_bed",
        "ac_electricity",
        "plumbing_water",
        "amenities",
        "result",
        "decision_type",
        "notes",
        "maintenance_id_created",
        "facility_type",
        "updated_at",
      ],
      description: "Checklist audit mutu 5 aspek, verifikasi kelaikan kamar/aula, dan tindak lanjut perawatan",
    },
    breakfast_orders: {
      sheetName: "breakfast_orders",
      label: "Pesanan Konsumsi & Sarapan",
      category: "Operasional & Transaksi",
      headers: [
        "id",
        "room_number",
        "building",
        "guest_name",
        "phone",
        "kloter",
        "transaction_id",
        "menu_id",
        "menu_name",
        "portions",
        "days",
        "start_date",
        "order_date",
        "delivery_time",
        "status",
        "price_per_portion",
        "total_price",
        "dietary_restriction",
        "notes",
        "cancel_reason",
        "cancelled_at",
        "created_at",
        "updated_at",
      ],
      description: "Pesanan sarapan kamar, catering prasmanan aula, porsi harian, dan status pengantaran dapur",
    },
    cleaning_logs: {
      sheetName: "cleaning_logs",
      label: "Laporan Pembersihan & Foto Bukti Petugas Gedung",
      category: "Operasional & Transaksi",
      headers: [
        "id",
        "room_id",
        "meeting_room_id",
        "building",
        "room_number",
        "petugas_id",
        "petugas_name",
        "timestamp",
        "photo_url",
        "notes",
        "status",
        "created_at",
        "updated_at",
      ],
      description: "Arsip pembersihan sterilisasi ruangan/aula, bukti foto real kamera/folder ber-watermark waktu, nama petugas, dan status QC",
    },
    work_sessions: {
      sheetName: "work_sessions",
      label: "Sesi Jam Kerja Petugas",
      category: "Sistem & Pengguna",
      headers: [
        "id",
        "user_id",
        "user_name",
        "user_role",
        "department",
        "assigned_building",
        "login_time",
        "logout_time",
        "duration_seconds",
        "duration_formatted",
        "status",
        "last_heartbeat",
        "device_info",
        "notes",
      ],
      description: "Presensi digital, detak aktif (heartbeat), riwayat durasi jam kerja staf, dan perangkat login",
    },
    app_settings: {
      sheetName: "app_settings",
      label: "Pengaturan Profil Instansi",
      category: "Sistem & Pengguna",
      headers: [
        "organization_name",
        "sub_title",
        "ministry_name",
        "address",
        "phone",
        "email",
        "portal_url",
        "tag_title",
        "app_logo",
        "app_favicon",
        "updated_at",
      ],
      description: "Identitas resmi instansi UPT Asrama Haji Jakarta, logo instansi, kontak resmi, dan portal",
    },
    system_logs: {
      sheetName: "system_logs",
      label: "Audit Log Sistem",
      category: "Sistem & Pengguna",
      headers: [
        "id",
        "timestamp",
        "user",
        "role",
        "action",
        "details",
        "duration_minutes",
        "verification_code",
        "document_title",
        "target_id",
        "signatory_name",
        "signatory_role",
        "signatory_nip",
        "qr_code_hash",
        "has_qr_and_signature",
      ],
      description: "Audit trail aktivitas sistem, verifikasi tanda tangan sah ber-QR, dan riwayat operasional",
    },
    chat_channels: {
      sheetName: "chat_channels",
      label: "Saluran & Grup Chat",
      category: "Sistem & Pengguna",
      headers: [
        "id",
        "name",
        "scope",
        "type",
        "department",
        "participant_ids",
        "description",
        "icon",
        "last_message",
        "last_message_time",
        "last_sender_name",
        "created_at",
        "updated_at",
      ],
      description: "Daftar saluran chat grup divisi, forum koordinasi terpadu, dan ruang chat personal 1-on-1",
    },
    chat_messages: {
      sheetName: "chat_messages",
      label: "Riwayat Pesan Chat",
      category: "Sistem & Pengguna",
      headers: [
        "id",
        "channel_id",
        "channel_type",
        "sender_id",
        "sender_name",
        "sender_role",
        "sender_department",
        "message",
        "timestamp",
        "time_formatted",
        "priority",
        "is_instruction",
        "read_by",
        "reply_to_id",
        "reply_to_sender",
        "reply_to_text",
        "created_at",
      ],
      description: "Penyimpanan permanen riwayat pesan obrolan grup dan chat pribadi dengan timestamp ISO, status prioritas, dan tanda baca",
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

  let chatSyncTimeout: NodeJS.Timeout | null = null;
  function triggerAsyncChatSpreadsheetSync() {
    const targetUrl = (activeSheetsConfig.webAppUrl || process.env.GOOGLE_SHEETS_WEBAPP_URL || "").trim();
    if (!targetUrl) return;
    if (chatSyncTimeout) clearTimeout(chatSyncTimeout);
    chatSyncTimeout = setTimeout(async () => {
      try {
        const payload = {
          action: "BATCH_OPERATIONS",
          timestamp: new Date().toISOString(),
          operations: [
            { action: "WRITE", sheet: "chat_channels", data: realtimeState.chatChannels },
            { action: "WRITE", sheet: "chat_messages", data: realtimeState.chatMessages },
          ],
          spreadsheetId: activeSheetsConfig.sheetId || undefined,
        };
        fetchGoogleAppsScript(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload),
        }).catch(() => {});
      } catch (_) {}
    }, 1500);
  }

  let sessionSyncTimeout: NodeJS.Timeout | null = null;
  function triggerAsyncWorkSessionSpreadsheetSync() {
    const targetUrl = (activeSheetsConfig.webAppUrl || process.env.GOOGLE_SHEETS_WEBAPP_URL || "").trim();
    if (!targetUrl) return;
    if (sessionSyncTimeout) clearTimeout(sessionSyncTimeout);
    sessionSyncTimeout = setTimeout(async () => {
      try {
        // Sync to Aiven PostgreSQL as primary database
        if (Array.isArray(realtimeState.workSessions) && realtimeState.workSessions.length > 0) {
          pushDatasetToAiven({ workSessions: realtimeState.workSessions }).catch(() => {});
        }

        const payload = {
          action: "BATCH_OPERATIONS",
          timestamp: new Date().toISOString(),
          operations: [
            { action: "WRITE", sheet: "work_sessions", data: realtimeState.workSessions },
          ],
          spreadsheetId: activeSheetsConfig.sheetId || undefined,
        };
        fetchGoogleAppsScript(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload),
        }).catch(() => {});
      } catch (_) {}
    }, 1500);
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
      if (normExpected === "nikktp" && (normFound === "nik" || normFound === "ktp" || normFound === "noktp")) return true;
      if (normExpected === "totalamount" && (normFound === "totalbiaya" || normFound === "total" || normFound === "biaya")) return true;
      if (normExpected === "createdat" && (normFound === "createdtime" || normFound === "tanggalbuat")) return true;
      if (normExpected === "updatedat" && (normFound === "updatedtime" || normFound === "tanggalubah")) return true;
      if (normExpected === "startdate" && (normFound === "orderdate" || normFound === "tanggal")) return true;
      if (normExpected === "petugasname" && (normFound === "petugas" || normFound === "namapetugas")) return true;
      if (normExpected === "photourl" && (normFound === "foto" || normFound === "buktifoto" || normFound === "gambar" || normFound === "fotourl")) return true;
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

  // Helper normalisasi item data agar memiliki representasi snake_case DAN camelCase secara lengkap
  function normalizeItemsList(items: any[]): any[] {
    if (!Array.isArray(items)) return [];
    return items.map((item) => {
      if (!item || typeof item !== "object") return item;
      const norm: Record<string, any> = { ...item };
      for (const [k, v] of Object.entries(item)) {
        let formattedVal = v;
        if (v !== null && typeof v === "object") {
          if (Array.isArray(v)) {
            if (v.length > 0 && typeof v[0] === "object") {
              formattedVal = JSON.stringify(v);
            } else {
              formattedVal = v.join(", ");
            }
          } else {
            formattedVal = JSON.stringify(v);
          }
        }

        // Sanitasi ukuran sel Google Spreadsheet (Batas maksimum sel Google Sheets adalah 50.000 karakter)
        if (typeof formattedVal === "string") {
          if ((k === "appLogo" || k === "app_logo") && (formattedVal.length > 20000 || formattedVal.startsWith("data:image/"))) {
            formattedVal = "OFFICIAL_LOGO";
          } else if (formattedVal.length > 45000) {
            formattedVal = formattedVal.slice(0, 45000);
          }
        }

        const snake = k.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
        const camel = k.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        if (norm[snake] === undefined) norm[snake] = formattedVal;
        if (norm[camel] === undefined) norm[camel] = formattedVal;
      }
      return norm;
    });
  }

  function formatDatabaseForSpreadsheet(data: any): Record<string, any> {
    const rawSettings = data?.appSettings || data?.app_settings || null;
    const appSettingsList = rawSettings ? normalizeItemsList(Array.isArray(rawSettings) ? rawSettings : [rawSettings]) : [];
    const rawRooms = Array.isArray(data?.rooms) ? data.rooms : [];
    // Filter kamar hunian murni (menghindari duplikasi fasilitas Ruang Pertemuan / Aula yang memiliki sheet tersendiri)
    const pureLodgingRooms = rawRooms.filter((r: any) => {
      if (!r) return false;
      const b = (r.building || "").toLowerCase();
      const t = (r.type || "").toLowerCase();
      const id = (r.id || "").toLowerCase();
      if (id.startsWith("mr-")) return false;
      if (b.includes("pertemuan") || b.includes("aula") || b.includes("serbaguna")) return false;
      if (t.includes("pertemuan") || t.includes("aula") || t.includes("serbaguna")) return false;
      return true;
    });
    const buildingsList = normalizeItemsList(Array.isArray(data?.buildings) ? data.buildings : []);
    const roomsList = normalizeItemsList(pureLodgingRooms);
    const meetingRoomsList = normalizeItemsList(Array.isArray(data?.meetingRooms) ? data.meetingRooms : (Array.isArray(data?.meeting_rooms) ? data.meeting_rooms : []));
    const roomCapacityRatesList = normalizeItemsList(Array.isArray(data?.roomCapacityRates) ? data.roomCapacityRates : (Array.isArray(data?.room_capacity_rates) ? data.room_capacity_rates : []));
    const breakfastMenuItemsList = normalizeItemsList(Array.isArray(data?.breakfastMenuItems) ? data.breakfastMenuItems : (Array.isArray(data?.breakfast_menu_items) ? data.breakfast_menu_items : []));
    const breakfastOrdersList = normalizeItemsList(Array.isArray(data?.breakfastOrders) ? data.breakfastOrders : (Array.isArray(data?.breakfast_orders) ? data.breakfast_orders : []));
    const transactionsList = normalizeItemsList(Array.isArray(data?.transactions) ? data.transactions : []);
    const usersList = normalizeItemsList(Array.isArray(data?.users) ? data.users : []);
    const maintenancesList = normalizeItemsList(Array.isArray(data?.maintenances) ? data.maintenances : []);
    const qcInspectionsList = normalizeItemsList(Array.isArray(data?.qcInspections) ? data.qcInspections : (Array.isArray(data?.qc_inspections) ? data.qc_inspections : []));
    const workSessionsList = normalizeItemsList(Array.isArray(data?.workSessions) ? data.workSessions : (Array.isArray(data?.work_sessions) ? data.work_sessions : []));
    const cleaningLogsList = normalizeItemsList(Array.isArray(data?.cleaningLogs) ? data.cleaningLogs : (Array.isArray(data?.cleaning_logs) ? data.cleaning_logs : []));
    const auditLogsList = normalizeItemsList(Array.isArray(data?.auditLogs) ? data.auditLogs : (Array.isArray(data?.system_logs) ? data.system_logs : []));
    const chatChannelsList = normalizeItemsList(Array.isArray(data?.chatChannels) ? data.chatChannels : (Array.isArray(data?.chat_channels) ? data.chat_channels : (realtimeState.chatChannels || [])));
    const chatMessagesList = normalizeItemsList(Array.isArray(data?.chatMessages) ? data.chatMessages : (Array.isArray(data?.chat_messages) ? data.chat_messages : (realtimeState.chatMessages || [])));

    return {
      buildings: buildingsList,
      rooms: roomsList,
      meetingRooms: meetingRoomsList,
      meeting_rooms: meetingRoomsList,
      roomCapacityRates: roomCapacityRatesList,
      room_capacity_rates: roomCapacityRatesList,
      breakfastMenuItems: breakfastMenuItemsList,
      breakfast_menu_items: breakfastMenuItemsList,
      breakfastOrders: breakfastOrdersList,
      breakfast_orders: breakfastOrdersList,
      transactions: transactionsList,
      users: usersList,
      maintenances: maintenancesList,
      qcInspections: qcInspectionsList,
      qc_inspections: qcInspectionsList,
      cleaningLogs: cleaningLogsList,
      cleaning_logs: cleaningLogsList,
      workSessions: workSessionsList,
      work_sessions: workSessionsList,
      auditLogs: auditLogsList,
      system_logs: auditLogsList,
      appSettings: appSettingsList,
      app_settings: appSettingsList,
      chatChannels: chatChannelsList,
      chat_channels: chatChannelsList,
      chatMessages: chatMessagesList,
      chat_messages: chatMessagesList,
    };
  }

  // Endpoint Auto-Provisioning: Otomatis Membuat Sheet & Menyusun Header Table
  app.post("/api/sheets/auto-provision", async (req, res) => {
    const targetUrl = (req.body?.webAppUrl || activeSheetsConfig.webAppUrl || process.env.GOOGLE_SHEETS_WEBAPP_URL || "").trim();
    const populateData = Boolean(req.body?.populateData);
    const customData = req.body?.data || serverDatabaseCache || {};
    const formattedData = formatDatabaseForSpreadsheet(customData);

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
        data: populateData ? formattedData : {},
        spreadsheetId: activeSheetsConfig.sheetId || undefined,
        timestamp: new Date().toISOString(),
      };

      let response = await fetchGoogleAppsScript(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });

      // Jika gagal dan menyertakan populateData, coba sekali lagi secara ringan (hanya struktur sheet & header)
      if (!response.ok && populateData) {
        try {
          const lightweightPayload = {
            action: "AUTO_PROVISION",
            schema: APP_DATABASE_SCHEMA,
            populateData: false,
            data: {},
            spreadsheetId: activeSheetsConfig.sheetId || undefined,
            timestamp: new Date().toISOString(),
          };
          const retryResp = await fetchGoogleAppsScript(targetUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(lightweightPayload),
          });
          if (retryResp.ok) {
            response = retryResp;
          }
        } catch (_) {}
      }

      const text = await response.text().catch(() => "");

      if (!response.ok) {
        if (response.status === 403 || text.includes("accounts.google.com") || text.includes("ServiceLogin")) {
          return res.status(200).json({
            ok: false,
            isForbidden: true,
            error: "HTTP 403 Forbidden: Akses Web App ditolak. Pastikan deploy diatur ke 'Anyone' (Siapa saja).",
          });
        }

        if (response.status === 500) {
          let diagnostic = "Google Apps Script mengalami kendala saat inisialisasi tabel.";
          if (text.includes("coordinates") || text.includes("dimensions")) {
            diagnostic = "Jumlah kolom pada tabel melebihi batas default 26 kolom Google Sheets. Salin dan perbarui kode Google Apps Script Versi 3.0 dari tab Panduan & Kode Script yang telah dilengkapi fitur auto-expand dimensi kolom.";
          } else if (text.includes("Script function not found")) {
            diagnostic = "Fungsi doPost tidak ditemukan di Google Apps Script Anda. Pasang kode terbaru di Extensions > Apps Script.";
          } else {
            diagnostic = "Google Apps Script mengembalikan HTTP 500. Silakan salin kode Apps Script versi terbaru dari tab 'Panduan & Kode Script' pada menu Integrasi Spreadsheet, lalu buat New Deployment.";
          }
          return res.status(200).json({
            ok: false,
            is500: true,
            needsScriptUpdate: true,
            error: diagnostic,
            rawError: text.slice(0, 300),
          });
        }

        return res.status(200).json({
          ok: false,
          error: `HTTP ${response.status}: ${response.statusText || "Gagal menghubungi Google Apps Script"}`,
          rawError: text.slice(0, 200),
        });
      }

      let resJson: any = null;
      try {
        resJson = JSON.parse(text);
      } catch (_) {
        if (text.includes("accounts.google.com") || text.includes("ServiceLogin")) {
          return res.status(200).json({
            ok: false,
            isForbidden: true,
            error: "HTTP 403 Forbidden: Google Apps Script meminta login. Pastikan deploy diatur ke 'Anyone'.",
          });
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

  // 3. Endpoint BACA BASIS DATA UTAMA (AIVEN CLOUD POSTGRESQL / SERVER CACHE) (GET)
  app.get(["/api/sheets/database", "/api/database"], async (req, res) => {
    const forceRefresh = req.query?.refresh === "true";

    // 1. PRIORITAS UTAMA: JIKA AIVEN DATABASE TERHUBUNG, BACA LANGSUNG DARI AIVEN
    const pool = getActiveAivenPool();
    if (pool) {
      try {
        const tableList = [
          'buildings', 'rooms', 'meeting_rooms', 'room_capacity_rates',
          'breakfast_menu_items', 'transactions', 'users', 'maintenances',
          'qc_inspections', 'breakfast_orders', 'cleaning_logs', 'work_sessions',
          'audit_logs'
        ];
        const aivenData: any = {};
        await Promise.all([
          ...tableList.map(async (t) => {
            try {
              const qr = await pool.query(`SELECT * FROM ${t};`);
              aivenData[t] = qr.rows.map(row => (row.raw_data && typeof row.raw_data === 'object' ? { ...row.raw_data, ...row } : row));
            } catch (_) {
              aivenData[t] = [];
            }
          }),
          (async () => {
            try {
              const setQr = await pool.query(`SELECT value FROM app_settings WHERE key = 'general' LIMIT 1;`);
              if (setQr.rows.length > 0 && setQr.rows[0].value) {
                aivenData.appSettings = setQr.rows[0].value;
              }
            } catch (_) {}
          })()
        ]);

        if (aivenData.buildings?.length > 0 || aivenData.rooms?.length > 0) {
          serverDatabaseCache = {
            ...serverDatabaseCache,
            buildings: aivenData.buildings || [],
            rooms: aivenData.rooms || [],
            meetingRooms: aivenData.meeting_rooms || [],
            roomCapacityRates: aivenData.room_capacity_rates || [],
            breakfastMenuItems: aivenData.breakfast_menu_items || [],
            transactions: aivenData.transactions || [],
            users: aivenData.users || [],
            maintenances: aivenData.maintenances || [],
            qcInspections: aivenData.qc_inspections || [],
            breakfastOrders: aivenData.breakfast_orders || [],
            cleaningLogs: aivenData.cleaning_logs || [],
            workSessions: aivenData.work_sessions || [],
            auditLogs: aivenData.audit_logs || [],
            appSettings: aivenData.appSettings || serverDatabaseCache?.appSettings
          };
          try {
            fs.writeFileSync(serverDbCachePath, JSON.stringify(serverDatabaseCache, null, 2), "utf-8");
          } catch (_) {}

          const fullFormatted = formatDatabaseForSpreadsheet(serverDatabaseCache);
          return res.json({
            status: "success",
            message: "Data dimuat langsung dari Basis Data Utama Aiven Cloud (PostgreSQL).",
            data: fullFormatted,
            source: "aiven_cloud_postgres",
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (aivenErr: any) {
        console.warn("Gagal membaca langsung dari Aiven, fallback ke server cache:", aivenErr?.message || aivenErr);
      }
    }

    // 2. KEMBALIKAN DARI CACHE SERVER CEPAT (< 1ms)
    if (serverDatabaseCache && Array.isArray(serverDatabaseCache.buildings) && serverDatabaseCache.buildings.length > 0 && !forceRefresh) {
      const fullFormatted = formatDatabaseForSpreadsheet(serverDatabaseCache);
      return res.json({
        status: "cached",
        message: "Data dimuat instan dari cache database server.",
        data: fullFormatted,
        source: "server_cache",
        updatedAt: new Date().toISOString(),
      });
    }

    const targetUrl = activeSheetsConfig.webAppUrl || process.env.GOOGLE_SHEETS_WEBAPP_URL;
    if (!targetUrl) {
      if (serverDatabaseCache) {
        return res.json({
          status: "cached",
          message: "Aiven Cloud / Server Cache aktif. Menggunakan data tersimpan di server.",
          data: formatDatabaseForSpreadsheet(serverDatabaseCache),
        });
      }
      return res.status(200).json({
        status: "unconfigured",
        message: "Database belum terkonfigurasi.",
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

      // Pastikan tabel rooms hanya berisi kamar hunian murni (bukan fasilitas ruang pertemuan/aula yang sudah ada di meeting_rooms)
      if (Array.isArray(sheetData.rooms)) {
        sheetData.rooms = sheetData.rooms.filter((r: any) => {
          if (!r) return false;
          const b = (r.building || r.gedung || "").toLowerCase();
          const t = (r.type || r.room_type || r.roomType || "").toLowerCase();
          const id = (r.id || "").toLowerCase();
          if (id.startsWith("mr-")) return false;
          if (b.includes("pertemuan") || b.includes("aula") || b.includes("serbaguna")) return false;
          if (t.includes("pertemuan") || t.includes("aula") || t.includes("serbaguna")) return false;
          return true;
        });
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

  // Antrean eksekusi ke Google Apps Script agar berjalan single-flight (tidak saling bertabrakan / limit konkurensi)
  let isPushingToSheets = false;
  let pendingSheetPush: { targetUrl: string; formattedPayload: any } | null = null;

  async function queueSpreadsheetPush(targetUrl: string, formattedPayload: any) {
    if (isPushingToSheets) {
      // Coalesce payload: selalu simpan data paling mutakhir untuk dieksekusi setelah giliran selesai
      pendingSheetPush = { targetUrl, formattedPayload };
      return;
    }

    isPushingToSheets = true;
    try {
      const sheetRes = await fetchGoogleAppsScript(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(formattedPayload),
      });
      const text = await sheetRes.text().catch(() => "");
      console.log(`[Google Sheets Background Push] Status HTTP: ${sheetRes.status}, preview: ${text.slice(0, 80)}`);
    } catch (err: any) {
      console.warn("[Google Sheets Background Push] Peringatan koneksi:", err?.message || err);
    } finally {
      isPushingToSheets = false;
      if (pendingSheetPush) {
        const next = pendingSheetPush;
        pendingSheetPush = null;
        setTimeout(() => {
          queueSpreadsheetPush(next.targetUrl, next.formattedPayload).catch(() => {});
        }, 1200);
      }
    }
  }

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
      // Pastikan payload.rooms hanya berisi kamar hunian (bukan Ruang Pertemuan / Aula yang sudah ada di sheet meeting_rooms)
      payload.rooms = payload.rooms.filter((r: any) => {
        if (!r) return false;
        const b = (r.building || "").toLowerCase();
        const t = (r.type || "").toLowerCase();
        const id = (r.id || "").toLowerCase();
        if (id.startsWith("mr-")) return false;
        if (b.includes("pertemuan") || b.includes("aula") || b.includes("serbaguna")) return false;
        if (t.includes("pertemuan") || t.includes("aula") || t.includes("serbaguna")) return false;
        return true;
      }).map((r: any) => {
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

    // Selalu simpan ke server database cache secara instan (1ms)
    serverDatabaseCache = payload;
    try {
      fs.writeFileSync(serverDbCachePath, JSON.stringify(payload, null, 2), "utf-8");
    } catch (_) {}

    // Broadcast ke seluruh klien real-time bahwa database telah diperbarui
    broadcastRealtimeEvent("database:sync", { timestamp: Date.now(), db: serverDatabaseCache }, req.body?.clientId);

    // 1. PRIORITAS UTAMA: SIMPAN KE BASIS DATA UTAMA AIVEN CLOUD POSTGRESQL
    const pool = getActiveAivenPool();
    if (pool) {
      try {
        const resAiven = await pushDatasetToAiven(payload);
        if (resAiven.ok) {
          console.log("[Aiven Push] Data berhasil disimpan ke Aiven PostgreSQL!");
        } else {
          console.warn("[Aiven Push] Gagal push ke Aiven:", resAiven.error);
        }
        return res.json({
          ok: true,
          status: "saved_aiven",
          message: "Database berhasil disimpan ke Basis Data Utama Aiven Cloud (PostgreSQL).",
          counts: resAiven.counts,
        });
      } catch (err: any) {
        console.warn("[Aiven Push] Error:", err);
      }
    }

    if (!targetUrl) {
      return res.json({
        ok: true,
        status: "saved_server_only",
        message: "Database disimpan di server (Aiven / Cloud belum terkonfigurasi).",
      });
    }

    try {
      const formattedData = formatDatabaseForSpreadsheet(payload);

      // Bangun daftar operasi BATCH_OPERATIONS untuk eksekusi handal dan cepat di Google Apps Script
      const operations: Array<{ action: string; sheet: string; data: any[] }> = [];
      const tableMap: Record<string, string> = {
        buildings: "buildings",
        rooms: "rooms",
        meeting_rooms: "meeting_rooms",
        room_capacity_rates: "room_capacity_rates",
        breakfast_menu_items: "breakfast_menu_items",
        transactions: "transactions",
        users: "users",
        maintenances: "maintenances",
        qc_inspections: "qc_inspections",
        breakfast_orders: "breakfast_orders",
        cleaning_logs: "cleaning_logs",
        work_sessions: "work_sessions",
        app_settings: "app_settings",
        system_logs: "system_logs",
        chat_channels: "chat_channels",
        chat_messages: "chat_messages",
      };

      for (const [key, sheetName] of Object.entries(tableMap)) {
        if (formattedData[key] !== undefined || formattedData[sheetName] !== undefined) {
          const tableData = formattedData[sheetName] !== undefined ? formattedData[sheetName] : formattedData[key];
          operations.push({
            action: "WRITE",
            sheet: sheetName,
            data: Array.isArray(tableData) ? tableData : (tableData ? [tableData] : []),
          });
        }
      }

      const batchPayload = {
        action: "BATCH_OPERATIONS",
        timestamp: new Date().toISOString(),
        operations,
        spreadsheetId: activeSheetsConfig.sheetId || undefined,
      };

      const isExplicitSync = req.query?.sync === "true";
      if (!isExplicitSync) {
        // NON-BLOCKING: Jadwalkan push ke Google Spreadsheet via BATCH_OPERATIONS di antrean latar belakang
        queueSpreadsheetPush(targetUrl, batchPayload);

        return res.json({
          ok: true,
          status: "success",
          source: "server_cache",
          message: "Data berhasil disimpan instan ke server database dan dijadwalkan sinkron ke Google Spreadsheet.",
          updatedAt: new Date().toISOString(),
        });
      }

      // Jika sync=true (misal dari tombol 'Ekspor ke Spreadsheet' di menu integrasi), tunggu respons selesai
      const sheetRes = await fetchGoogleAppsScript(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(batchPayload),
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

  // 5. Endpoint BATCH OPERATIONS UNTUK SPREADSHEET (POST)
  app.post("/api/sheets/batch", async (req, res) => {
    const targetUrl = (req.body?.webAppUrl || activeSheetsConfig.webAppUrl || process.env.GOOGLE_SHEETS_WEBAPP_URL || "").trim();
    const operations = req.body?.operations;

    if (!Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json({ ok: false, error: "Daftar operasi batch (operations) tidak valid atau kosong" });
    }

    if (!targetUrl) {
      return res.status(400).json({ ok: false, error: "URL Web App Google Apps Script belum dikonfigurasi." });
    }

    // Perbarui serverDatabaseCache untuk setiap operasi WRITE agar memori server langsung sinkron
    if (serverDatabaseCache && typeof serverDatabaseCache === "object") {
      let cacheUpdated = false;
      for (const op of operations) {
        if ((op.action === "WRITE" || op.action === "SAVE") && op.sheet && Array.isArray(op.data)) {
          const sheetKey = String(op.sheet);
          const camelKey = sheetKey.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
          serverDatabaseCache[sheetKey] = op.data;
          serverDatabaseCache[camelKey] = op.data;
          cacheUpdated = true;
        }
      }
      if (cacheUpdated) {
        try {
          fs.writeFileSync(serverDbCachePath, JSON.stringify(serverDatabaseCache, null, 2), "utf-8");
        } catch (_) {}
      }
    }

    try {
      const batchPayload = {
        action: "BATCH_OPERATIONS",
        timestamp: new Date().toISOString(),
        operations,
        spreadsheetId: activeSheetsConfig.sheetId || undefined,
      };

      const resp = await fetchGoogleAppsScript(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(batchPayload),
      });

      const text = await resp.text().catch(() => "");
      let jsonRes: any = null;
      try {
        jsonRes = JSON.parse(text);
      } catch (_) {
        jsonRes = { status: resp.ok ? "success" : "error", raw: text };
      }

      res.json({
        ok: resp.ok,
        status: resp.ok ? "success" : "error",
        results: jsonRes?.results || jsonRes,
        executedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.warn("Gagal mengeksekusi batch operations ke Google Spreadsheet:", err?.message || err);
      res.status(500).json({
        ok: false,
        error: err?.message || "Kesalahan koneksi saat mengeksekusi batch operations",
      });
    }
  });

  // Helper pemetaan kunci tabel untuk camelCase dan snake_case
  function getTableKeys(rawSheet: string): { snakeKey: string; camelKey: string } {
    const norm = String(rawSheet || "").trim();
    const snake = norm.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).replace(/__+/g, "_");
    const camel = norm.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    return { snakeKey: snake, camelKey: camel };
  }

  function upsertRecordInCache(rawSheet: string, record: any): boolean {
    if (!serverDatabaseCache || typeof serverDatabaseCache !== "object") {
      serverDatabaseCache = {};
    }
    const { snakeKey, camelKey } = getTableKeys(rawSheet);
    const id = record?.id || record?.code || record?.no_kamar || record?.roomNumber;
    if (!id && !record) return false;

    let list: any[] = [];
    if (Array.isArray(serverDatabaseCache[snakeKey])) {
      list = [...serverDatabaseCache[snakeKey]];
    } else if (Array.isArray(serverDatabaseCache[camelKey])) {
      list = [...serverDatabaseCache[camelKey]];
    }

    const idStr = String(id || "").trim();
    const existingIndex = list.findIndex((item) => {
      if (!item) return false;
      const itemId = String(item.id || item.code || item.no_kamar || item.roomNumber || "").trim();
      return itemId && idStr && itemId === idStr;
    });

    const normalizedRecord = normalizeItemsList([record])[0] || record;
    if (existingIndex >= 0) {
      list[existingIndex] = { ...list[existingIndex], ...normalizedRecord };
    } else {
      list = [normalizedRecord, ...list];
    }

    serverDatabaseCache[snakeKey] = list;
    serverDatabaseCache[camelKey] = list;

    try {
      fs.writeFileSync(serverDbCachePath, JSON.stringify(serverDatabaseCache, null, 2), "utf-8");
    } catch (_) {}

    return true;
  }

  function deleteRecordInCache(rawSheet: string, recordId: string): boolean {
    if (!serverDatabaseCache || typeof serverDatabaseCache !== "object") return false;
    const { snakeKey, camelKey } = getTableKeys(rawSheet);
    const idStr = String(recordId || "").trim();
    if (!idStr) return false;

    let list: any[] = [];
    if (Array.isArray(serverDatabaseCache[snakeKey])) {
      list = [...serverDatabaseCache[snakeKey]];
    } else if (Array.isArray(serverDatabaseCache[camelKey])) {
      list = [...serverDatabaseCache[camelKey]];
    } else {
      return false;
    }

    const initialLen = list.length;
    list = list.filter((item) => {
      if (!item) return false;
      const itemId = String(item.id || item.code || item.no_kamar || item.roomNumber || "").trim();
      return itemId !== idStr;
    });

    serverDatabaseCache[snakeKey] = list;
    serverDatabaseCache[camelKey] = list;

    try {
      fs.writeFileSync(serverDbCachePath, JSON.stringify(serverDatabaseCache, null, 2), "utf-8");
    } catch (_) {}

    return list.length !== initialLen;
  }

  // 6. Endpoint UPSERT SATU REKAMAN LANGSUNG (POST /api/sheets/upsert)
  app.post("/api/sheets/upsert", async (req, res) => {
    const rawSheet = req.body?.sheet || req.body?.table || "";
    const record = req.body?.record || req.body?.data?.[0] || req.body?.data;
    const targetUrl = (req.body?.webAppUrl || activeSheetsConfig.webAppUrl || process.env.GOOGLE_SHEETS_WEBAPP_URL || "").trim();

    if (!rawSheet || !record) {
      return res.status(400).json({ ok: false, error: "Nama lembar (sheet) dan data record diperlukan" });
    }

    // 1. Simpan ke database server cache secara instan (0ms)
    upsertRecordInCache(rawSheet, record);

    // 2. Simpan seketika ke Basis Data Utama Aiven Cloud (PostgreSQL)
    upsertSingleRecordToAiven(rawSheet, record).catch((err) => {
      console.info(`[Aiven Background Notice] Simpan ke Aiven dijadwalkan ulang: ${err?.message || err}`);
    });

    // 3. Siarkan pembaruan database seketika ke seluruh perangkat & akun yang sedang login via SSE
    broadcastRealtimeEvent("database:sync", {
      action: "upsert",
      sheet: rawSheet,
      record,
      timestamp: Date.now(),
      db: serverDatabaseCache,
    }, req.body?.clientId);

    // 4. Teruskan secara asinkron ke Google Apps Script di latar belakang
    if (targetUrl) {
      const payload = {
        action: "UPSERT_RECORD",
        sheet: rawSheet,
        table: rawSheet,
        record,
        data: [record],
        timestamp: new Date().toISOString(),
      };
      fetchGoogleAppsScript(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      }).catch((err) => {
        console.warn("[Google Sheets Upsert] Latar belakang peringatan:", err?.message || err);
      });
    }

    res.json({
      ok: true,
      status: "success",
      message: "Data berhasil disimpan di Aiven PostgreSQL dan server cache",
      record,
    });
  });

  // 7. Endpoint DELETE SATU REKAMAN LANGSUNG (POST /api/sheets/delete)
  app.post("/api/sheets/delete", async (req, res) => {
    const rawSheet = req.body?.sheet || req.body?.table || "";
    const recordId = req.body?.id || req.body?.record?.id || "";
    const targetUrl = (req.body?.webAppUrl || activeSheetsConfig.webAppUrl || process.env.GOOGLE_SHEETS_WEBAPP_URL || "").trim();

    if (!rawSheet || !recordId) {
      return res.status(400).json({ ok: false, error: "Nama lembar (sheet) dan ID record diperlukan" });
    }

    // 1. Hapus dari database server cache secara instan (0ms)
    deleteRecordInCache(rawSheet, recordId);

    // 2. Hapus seketika dari Basis Data Utama Aiven Cloud (PostgreSQL)
    deleteSingleRecordFromAiven(rawSheet, recordId).catch((err) => {
      console.warn(`[Aiven Delete] Gagal menghapus dari Aiven: ${err?.message || err}`);
    });

    // 3. Siarkan penghapusan seketika ke seluruh perangkat & akun yang sedang login via SSE
    broadcastRealtimeEvent("database:sync", {
      action: "delete",
      sheet: rawSheet,
      id: recordId,
      timestamp: Date.now(),
      db: serverDatabaseCache,
    }, req.body?.clientId);

    // 4. Teruskan secara asinkron ke Google Apps Script di latar belakang
    if (targetUrl) {
      const payload = {
        action: "DELETE_RECORD",
        sheet: rawSheet,
        table: rawSheet,
        id: recordId,
        timestamp: new Date().toISOString(),
      };
      fetchGoogleAppsScript(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      }).catch((err) => {
        console.warn("[Google Sheets Delete] Latar belakang peringatan:", err?.message || err);
      });
    }

    res.json({
      ok: true,
      status: "success",
      message: "Data berhasil dihapus dari database server dan disinkronkan ke seluruh perangkat",
      id: recordId,
    });
  });

  // Server-Sent Events (SSE) Stream for instant real-time updates
  app.get("/api/realtime/stream", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform, no-store");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    sseClients.add(res);

    // Send initial authoritative state immediately upon connect
    const now = Date.now();
    for (const [key, p] of Object.entries(realtimeState.presences)) {
      if (now - p.lastSeenMs > 120000) {
        delete realtimeState.presences[key];
      }
    }

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
    }, 10000);

    req.on("close", () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  app.get("/api/realtime/state", (_req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    const now = Date.now();
    for (const [key, p] of Object.entries(realtimeState.presences)) {
      if (now - p.lastSeenMs > 120000) {
        delete realtimeState.presences[key];
      }
    }
    res.json({
      ok: true,
      presences: Object.values(realtimeState.presences),
      workSessions: realtimeState.workSessions,
      chatChannels: realtimeState.chatChannels,
      chatMessages: realtimeState.chatMessages,
      timestamp: Date.now(),
    });
  });

  app.post("/api/session/auto-checkout", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    let data = req.body;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (_) {}
    }

    const { sessionId, userId, logoutTime, durationSeconds } = data || {};
    if (!sessionId && !userId) {
      res.json({ ok: true, message: "No session or user specified" });
      return;
    }

    const now = new Date();
    const resolvedLogoutTime = logoutTime || new Date().toISOString().replace("T", " ").substring(0, 19);

    let updatedSession: any = null;

    realtimeState.workSessions = realtimeState.workSessions.map((s: any) => {
      const isMatch = (sessionId && s.id === sessionId) || (userId && s.userId === userId && s.status === "AKTIF");
      if (isMatch) {
        let diffSec = Number(durationSeconds) || 0;
        if (!diffSec && s.loginTime) {
          const startMs = new Date(s.loginTime.replace(/-/g, "/")).getTime();
          if (!isNaN(startMs)) {
            diffSec = Math.max(1, Math.floor((now.getTime() - startMs) / 1000));
          }
        }
        if (!diffSec) diffSec = s.durationSeconds || 1;

        const hours = Math.floor(diffSec / 3600);
        const minutes = Math.floor((diffSec % 3600) / 60);
        const seconds = diffSec % 60;
        const formatted = `${hours} Jam ${minutes} Menit ${seconds} Detik`;

        updatedSession = {
          ...s,
          status: "SELESAI",
          logoutTime: resolvedLogoutTime,
          durationSeconds: diffSec,
          durationFormatted: formatted,
          notes: s.notes ? `${s.notes} • Auto check-out saat tab/browser ditutup` : "Auto check-out saat tab/browser ditutup",
        };
        return updatedSession;
      }
      return s;
    });

    if (updatedSession) {
      if (serverDatabaseCache && Array.isArray(serverDatabaseCache.workSessions)) {
        const cIdx = serverDatabaseCache.workSessions.findIndex((s: any) => s.id === updatedSession.id);
        if (cIdx >= 0) {
          serverDatabaseCache.workSessions[cIdx] = updatedSession;
        } else {
          serverDatabaseCache.workSessions.unshift(updatedSession);
        }
      }

      if (userId) {
        for (const [key, p] of Object.entries(realtimeState.presences)) {
          if (p.userId === userId) {
            delete realtimeState.presences[key];
          }
        }
        broadcastRealtimeEvent("presence:sync", Object.values(realtimeState.presences));
      }

      broadcastRealtimeEvent("session:upsert", updatedSession);
      triggerAsyncWorkSessionSpreadsheetSync();
    }

    res.json({ ok: true, updated: updatedSession });
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
      // If this session is AKTIF, automatically close any older AKTIF session for the same user across all devices
      if (payload.userId && payload.status === "AKTIF") {
        realtimeState.workSessions = realtimeState.workSessions.map((s: any) => {
          if (s.userId === payload.userId && s.id !== payload.id && s.status === "AKTIF") {
            return {
              ...s,
              status: "SELESAI",
              logoutTime: payload.loginTime || new Date().toISOString().replace("T", " ").substring(0, 19),
              notes: s.notes ? `${s.notes} • Dialihkan karena login di perangkat baru` : "Dialihkan karena login di perangkat baru",
            };
          }
          return s;
        });
      }
      triggerAsyncWorkSessionSpreadsheetSync();
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
      triggerAsyncWorkSessionSpreadsheetSync();
    } else if (type === "session:clear") {
      realtimeState.workSessions = [];
      const pool = getActiveAivenPool();
      if (pool) {
        pool.query("DELETE FROM work_sessions;").catch(() => {});
      }
      triggerAsyncWorkSessionSpreadsheetSync();
      broadcastRealtimeEvent("session:clear", {}, clientId);
    } else if (type === "session:delete" && (payload?.id || payload?.ids)) {
      const idsToDelete = new Set<string>(
        Array.isArray(payload.ids) ? payload.ids : [payload.id].filter(Boolean)
      );
      realtimeState.workSessions = realtimeState.workSessions.filter((s: any) => !idsToDelete.has(s.id));
      if (serverDatabaseCache && Array.isArray(serverDatabaseCache.workSessions)) {
        serverDatabaseCache.workSessions = serverDatabaseCache.workSessions.filter((s: any) => !idsToDelete.has(s.id));
      }
      for (const delId of idsToDelete) {
        deleteSingleRecordFromAiven("work_sessions", delId).catch(() => {});
      }
      triggerAsyncWorkSessionSpreadsheetSync();
      broadcastRealtimeEvent("session:delete", payload, clientId);
    } else if (type === "chat:message" && payload?.message?.id) {
      const msg = payload.message;
      const channel = payload.channel;
      if (!realtimeState.chatMessages.some((m: any) => m.id === msg.id)) {
        realtimeState.chatMessages.push(msg);
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
            updatedAt: new Date().toISOString(),
          };
        } else {
          realtimeState.chatChannels.unshift({
            ...channel,
            lastMessage: msg.message,
            lastMessageTime: msg.timeFormatted,
            lastSenderName: msg.senderName,
            updatedAt: new Date().toISOString(),
          });
        }
      }
      saveChatStorageToDisk();
      broadcastRealtimeEvent("chat:message", { message: msg, channel }, clientId);
    } else if (type === "chat:read" && payload?.channelId && payload?.userId) {
      const { channelId, userId } = payload;
      let readChanged = false;
      realtimeState.chatMessages = realtimeState.chatMessages.map((m: any) => {
        if (m.channelId === channelId && Array.isArray(m.readBy) && !m.readBy.includes(userId)) {
          readChanged = true;
          return { ...m, readBy: [...m.readBy, userId] };
        }
        return m;
      });
      if (readChanged) {
        saveChatStorageToDisk();
      }
      broadcastRealtimeEvent("chat:read", { channelId, userId }, clientId);
    } else if (type === "chat:channel" && payload?.id) {
      const cIdx = realtimeState.chatChannels.findIndex((c: any) => c.id === payload.id);
      if (cIdx >= 0) {
        realtimeState.chatChannels[cIdx] = { ...realtimeState.chatChannels[cIdx], ...payload, updatedAt: new Date().toISOString() };
      } else {
        realtimeState.chatChannels.unshift({ ...payload, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }
      saveChatStorageToDisk();
      broadcastRealtimeEvent("chat:channel", payload, clientId);
    } else if (type === "chat:clear") {
      const channelId = payload?.channelId;
      if (channelId) {
        realtimeState.chatMessages = realtimeState.chatMessages.filter((m: any) => m.channelId !== channelId);
      } else {
        realtimeState.chatMessages = [];
      }
      saveChatStorageToDisk();
      broadcastRealtimeEvent("chat:clear", { channelId }, clientId);
    } else if (type === "chat:typing" && payload?.channelId && payload?.userId) {
      broadcastRealtimeEvent("chat:typing", payload, clientId);
    } else if (type === "database:sync") {
      if (payload?.db && typeof payload.db === "object") {
        serverDatabaseCache = payload.db;
        try {
          fs.writeFileSync(serverDbCachePath, JSON.stringify(payload.db, null, 2), "utf-8");
        } catch (_) {}
      }
      broadcastRealtimeEvent("database:sync", payload, clientId);
    }

    res.json({ ok: true });
  });

  // =========================================================================
  // REST API PERMANEN UNTUK CHAT MENGAMBANG (CHANNELS & MESSAGES)
  // =========================================================================
  app.get("/api/chat/database", (_req, res) => {
    res.json({
      ok: true,
      channels: realtimeState.chatChannels,
      messages: realtimeState.chatMessages,
      schema: {
        channels: APP_DATABASE_SCHEMA.chat_channels,
        messages: APP_DATABASE_SCHEMA.chat_messages,
      },
      count: {
        channels: realtimeState.chatChannels.length,
        messages: realtimeState.chatMessages.length,
      },
      timestamp: Date.now(),
    });
  });

  app.post("/api/chat/messages", (req, res) => {
    const { message, channel, clientId } = req.body || {};
    if (!message || !message.channelId || !message.message) {
      res.status(400).json({ ok: false, error: "Pesan tidak lengkap" });
      return;
    }

    const now = new Date();
    const finalMsg = {
      id: message.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      channelId: message.channelId,
      channelType: message.channelType || (channel?.type || 'GROUP'),
      senderId: message.senderId,
      senderName: message.senderName,
      senderRole: message.senderRole,
      senderDepartment: message.senderDepartment || 'Operasional',
      message: message.message,
      timestamp: message.timestamp || now.toISOString(),
      timeFormatted: message.timeFormatted || now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB',
      priority: message.priority || 'NORMAL',
      isInstruction: Boolean(message.isInstruction),
      readBy: Array.isArray(message.readBy) ? message.readBy : [message.senderId].filter(Boolean),
      replyToId: message.replyToId || undefined,
      replyToSender: message.replyToSender || undefined,
      replyToText: message.replyToText || undefined,
      createdAt: message.createdAt || now.toISOString(),
    };

    if (!realtimeState.chatMessages.some((m: any) => m.id === finalMsg.id)) {
      realtimeState.chatMessages.push(finalMsg);
    }

    if (channel?.id) {
      const cIdx = realtimeState.chatChannels.findIndex((c: any) => c.id === channel.id);
      const chData = {
        ...channel,
        lastMessage: finalMsg.message,
        lastMessageTime: finalMsg.timeFormatted,
        lastSenderName: finalMsg.senderName,
        updatedAt: now.toISOString(),
      };
      if (cIdx >= 0) {
        realtimeState.chatChannels[cIdx] = { ...realtimeState.chatChannels[cIdx], ...chData };
      } else {
        realtimeState.chatChannels.unshift(chData);
      }
    }

    saveChatStorageToDisk();
    broadcastRealtimeEvent("chat:message", { message: finalMsg, channel }, clientId);
    res.json({ ok: true, message: finalMsg });
  });

  app.post("/api/chat/channels", (req, res) => {
    const { channel } = req.body || {};
    if (!channel || !channel.id) {
      res.status(400).json({ ok: false, error: "Data channel tidak lengkap" });
      return;
    }
    const cIdx = realtimeState.chatChannels.findIndex((c: any) => c.id === channel.id);
    if (cIdx >= 0) {
      realtimeState.chatChannels[cIdx] = { ...realtimeState.chatChannels[cIdx], ...channel, updatedAt: new Date().toISOString() };
    } else {
      realtimeState.chatChannels.unshift({ ...channel, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    saveChatStorageToDisk();
    broadcastRealtimeEvent("chat:channel", channel);
    res.json({ ok: true, channel });
  });

  app.post("/api/chat/mark-read", (req, res) => {
    const { channelId, userId } = req.body || {};
    if (channelId && userId) {
      let readChanged = false;
      realtimeState.chatMessages = realtimeState.chatMessages.map((m: any) => {
        if (m.channelId === channelId && Array.isArray(m.readBy) && !m.readBy.includes(userId)) {
          readChanged = true;
          return { ...m, readBy: [...m.readBy, userId] };
        }
        return m;
      });
      if (readChanged) {
        saveChatStorageToDisk();
        broadcastRealtimeEvent("chat:read", { channelId, userId });
      }
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

    // Self-boot initial connection & table sync with Aiven PostgreSQL
    (async () => {
      try {
        const pool = getActiveAivenPool();
        if (!pool) return;
        const start = Date.now();
        const client = await pool.connect();
        try {
          const vQr = await client.query("SELECT NOW(), version();");
          const latency = Date.now() - start;
          activeAivenConfig.lastConnectedAt = new Date().toISOString();
          activeAivenConfig.lastError = null;
          activeAivenConfig.latencyMs = latency;
          activeAivenConfig.pgVersion = vQr.rows[0]?.version || null;

          // Ensure tables and columns exist
          for (const [tName, ddl] of Object.entries(AIVEN_TABLE_DEFS)) {
            await client.query(ddl);
          }
          await ensureTableColumns(client);

          // Check if Aiven has records
          const countQr = await client.query("SELECT COUNT(*) FROM buildings;");
          const bldCount = Number(countQr.rows[0]?.count || 0);

          if (bldCount > 0) {
            console.log(`[Aiven Init] Terhubung ke Aiven Cloud PostgreSQL (${latency}ms). Memuat ${bldCount} gedung...`);
            // Load fresh data from Aiven into serverDatabaseCache
            const tableList = [
              'buildings', 'rooms', 'meeting_rooms', 'room_capacity_rates',
              'breakfast_menu_items', 'transactions', 'users', 'maintenances',
              'qc_inspections', 'breakfast_orders', 'cleaning_logs', 'work_sessions',
              'audit_logs'
            ];
            const aivenData: any = {};
            for (const t of tableList) {
              try {
                const qr = await client.query(`SELECT * FROM ${t};`);
                aivenData[t] = qr.rows.map(row => (row.raw_data && typeof row.raw_data === 'object' ? { ...row.raw_data, ...row } : row));
              } catch (_) {
                aivenData[t] = [];
              }
            }
            try {
              const setQr = await client.query(`SELECT value FROM app_settings WHERE key = 'general' LIMIT 1;`);
              if (setQr.rows.length > 0 && setQr.rows[0].value) {
                aivenData.appSettings = setQr.rows[0].value;
              }
            } catch (_) {}

            serverDatabaseCache = {
              ...serverDatabaseCache,
              buildings: aivenData.buildings || [],
              rooms: aivenData.rooms || [],
              meetingRooms: aivenData.meeting_rooms || [],
              roomCapacityRates: aivenData.room_capacity_rates || [],
              breakfastMenuItems: aivenData.breakfast_menu_items || [],
              transactions: aivenData.transactions || [],
              users: aivenData.users || [],
              maintenances: aivenData.maintenances || [],
              qcInspections: aivenData.qc_inspections || [],
              breakfastOrders: aivenData.breakfast_orders || [],
              cleaningLogs: aivenData.cleaning_logs || [],
              workSessions: aivenData.work_sessions || [],
              auditLogs: aivenData.audit_logs || [],
              appSettings: aivenData.appSettings || serverDatabaseCache?.appSettings
            };

            try {
              fs.writeFileSync(serverDbCachePath, JSON.stringify(serverDatabaseCache, null, 2), "utf-8");
            } catch (_) {}

            if (Array.isArray(serverDatabaseCache.workSessions) && serverDatabaseCache.workSessions.length > 0 && realtimeState.workSessions.length === 0) {
              realtimeState.workSessions = serverDatabaseCache.workSessions;
            }
          } else if (serverDatabaseCache && Array.isArray(serverDatabaseCache.buildings) && serverDatabaseCache.buildings.length > 0) {
            console.log("[Aiven Init] Database Aiven baru/kosong. Menginisialisasi data awal dari server cache...");
            await pushDatasetToAiven(serverDatabaseCache);
          }

          try {
            fs.writeFileSync(aivenConfigFilePath, JSON.stringify(activeAivenConfig, null, 2), "utf-8");
          } catch (_) {}
        } finally {
          client.release();
        }
      } catch (err: any) {
        console.warn("[Aiven Init] Gagal inisialisasi awal ke Aiven PostgreSQL:", err?.message || err);
        activeAivenConfig.lastError = err?.message || String(err);
      }
    })();
  });
}

startServer();