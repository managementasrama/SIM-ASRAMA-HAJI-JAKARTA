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