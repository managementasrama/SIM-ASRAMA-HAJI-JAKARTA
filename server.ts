import express from "express";
import path from "path";
import fs from "fs";

// Mock database file for backend demo
const MOCK_DB_FILE = path.join(process.cwd(), "data.json");

interface Building {
  id: string;
  name: string;
  address: string;
  totalRooms: number;
}

interface Room {
  id: string;
  buildingId: string;
  number: string;
  type: string;
  price: number;
  isOccupied: boolean;
}

interface Tenant {
  id: string;
  name: string;
  phone: string;
  roomId: string;
  checkInDate: string;
  checkOutDate: string | null;
}

interface DbData {
  buildings: Building[];
  rooms: Room[];
  tenants: Tenant[];
}

const defaultData: DbData = {
  buildings: [
    { id: "b1", name: "Gedung A (Utama)", address: "Jl. Merdeka No. 1", totalRooms: 20 },
    { id: "b2", name: "Gedung B (Selatan)", address: "Jl. Merdeka No. 2", totalRooms: 15 },
  ],
  rooms: [
    { id: "r1", buildingId: "b1", number: "101", type: "Standard", price: 1500000, isOccupied: true },
    { id: "r2", buildingId: "b1", number: "102", type: "Deluxe", price: 2000000, isOccupied: false },
    { id: "r3", buildingId: "b2", number: "201", type: "Standard", price: 1500000, isOccupied: true },
  ],
  tenants: [
    { id: "t1", name: "Budi Santoso", phone: "08123456789", roomId: "r1", checkInDate: "2026-09-01", checkOutDate: null },
    { id: "t2", name: "Siti Aminah", phone: "08987654321", roomId: "r3", checkInDate: "2026-08-15", checkOutDate: null },
  ],
};

function readDb(): DbData {
  if (fs.existsSync(MOCK_DB_FILE)) {
    const data = fs.readFileSync(MOCK_DB_FILE, "utf-8");
    return JSON.parse(data);
  }
  return defaultData;
}

function writeDb(data: DbData) {
  fs.writeFileSync(MOCK_DB_FILE, JSON.stringify(data, null, 2), "utf-8");
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "50mb" }));

  // API Routes
  app.get("/api/dashboard", (req, res) => {
    const db = readDb();
    const totalBuildings = db.buildings.length;
    const totalRooms = db.rooms.length;
    const occupiedRooms = db.rooms.filter(r => r.isOccupied).length;
    const availableRooms = totalRooms - occupiedRooms;
    const occupancyRate = totalRooms === 0 ? 0 : (occupiedRooms / totalRooms) * 100;
    
    res.json({
      totalBuildings,
      totalRooms,
      occupiedRooms,
      availableRooms,
      occupancyRate: Math.round(occupancyRate * 10) / 10,
    });
  });

  app.get("/api/buildings", (req, res) => {
    const db = readDb();
    res.json(db.buildings);
  });

  app.get("/api/buildings/:id/rooms", (req, res) => {
    const db = readDb();
    const rooms = db.rooms.filter(r => r.buildingId === req.params.id);
    res.json(rooms);
  });

  app.get("/api/rooms", (req, res) => {
    const db = readDb();
    res.json(db.rooms);
  });

  app.get("/api/tenants", (req, res) => {
    const db = readDb();
    const tenantsWithRoomInfo = db.tenants.map(t => {
      const room = db.rooms.find(r => r.id === t.roomId);
      const building = room ? db.buildings.find(b => b.id === room.buildingId) : null;
      return {
        ...t,
        roomNumber: room ? room.number : "Unknown",
        buildingName: building ? building.name : "Unknown",
      };
    });
    res.json(tenantsWithRoomInfo);
  });

  // Simple Add endpoints
  app.post("/api/buildings", (req, res) => {
    const db = readDb();
    const newBuilding = { id: `b${Date.now()}`, ...req.body };
    db.buildings.push(newBuilding);
    writeDb(db);
    res.json(newBuilding);
  });

  const distPath = path.join(process.cwd(), "dist");
  const distIndex = path.join(distPath, "index.html");

  // Use production static serving only when explicitly running 'start' or NODE_ENV=production
  // (Note: K_SERVICE is also set in Cloud Run dev containers, so do not use it to force production during 'npm run dev')
  const isDevLifecycle = process.env.npm_lifecycle_event === "dev";
  const isStartOrProd =
    !isDevLifecycle &&
    (process.env.NODE_ENV === "production" ||
      process.env.npm_lifecycle_event === "start");

  // If started in production mode but dist/index.html is missing, build it automatically
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
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (fs.existsSync(distIndex)) {
        res.sendFile(distIndex);
      } else {
        res.status(404).send("Application build not found. Please run npm run build.");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
