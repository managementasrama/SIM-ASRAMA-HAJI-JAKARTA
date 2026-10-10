import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';
import { ChatChannel, ChatMessage, WorkSession } from '../types';

export interface OnlinePresenceInfo {
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

export type RealtimeEventType =
  | 'init'
  | 'presence:sync'
  | 'presence:heartbeat'
  | 'presence:leave'
  | 'session:upsert'
  | 'session:clear'
  | 'chat:message'
  | 'chat:read'
  | 'chat:channel'
  | 'chat:clear'
  | 'chat:typing';

export interface RealtimeEventPayload {
  type: RealtimeEventType;
  payload: any;
  senderClientId?: string | null;
  timestamp: number;
}

type RealtimeEventListener = (event: RealtimeEventPayload) => void;

class RealtimeService {
  private clientId: string;
  private listeners: Set<RealtimeEventListener> = new Set();
  private broadcastChannel: BroadcastChannel | null = null;
  private supabaseChannel: any = null;
  private eventSource: EventSource | null = null;
  private reconnectTimer: any = null;
  private isInitialized = false;
  private presencesMap: Map<string, OnlinePresenceInfo> = new Map();

  constructor() {
    this.clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  public getClientId(): string {
    return this.clientId;
  }

  public init() {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    // 1. Cross-Tab Instant BroadcastChannel (0ms latency in same browser)
    try {
      if ('BroadcastChannel' in window) {
        this.broadcastChannel = new BroadcastChannel('sim_haji_realtime_bus_v2');
        this.broadcastChannel.onmessage = (ev) => {
          const data = ev.data as RealtimeEventPayload;
          if (!data || data.senderClientId === this.clientId) return;
          this.handleIncomingEvent(data);
        };
      }
    } catch (e) {
      console.warn('BroadcastChannel warning:', e);
    }

    // 2. Supabase Realtime Broadcast & Presence Channel (cross-device / cloud)
    try {
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        this.supabaseChannel = supabase.channel('sim-haji-realtime-v2', {
          config: {
            broadcast: { self: false },
            presence: { key: this.clientId },
          },
        });

        this.supabaseChannel
          .on('broadcast', { event: 'realtime_event' }, ({ payload }: { payload: RealtimeEventPayload }) => {
            if (!payload || payload.senderClientId === this.clientId) return;
            this.handleIncomingEvent(payload);
          })
          .on('presence', { event: 'sync' }, () => {
            try {
              const state = this.supabaseChannel.presenceState();
              const now = Date.now();
              Object.values(state).forEach((list: any) => {
                if (Array.isArray(list)) {
                  list.forEach((p: any) => {
                    if (p && p.userId) {
                      const key = `${p.userId}___${p.clientId || 'sb'}`;
                      this.presencesMap.set(key, {
                        ...p,
                        lastSeenMs: now,
                      });
                    }
                  });
                }
              });
              this.notifyListeners({
                type: 'presence:sync',
                payload: this.getActivePresences(),
                timestamp: now,
              });
            } catch (_) {}
          })
          .subscribe();
      }
    } catch (e) {
      console.warn('Supabase Realtime channel warning:', e);
    }

    // 3. Server-Sent Events (SSE) Stream to Express Server (/api/realtime/stream)
    this.connectSSE();
  }

  private connectSSE() {
    if (typeof window === 'undefined' || !('EventSource' in window)) return;
    try {
      if (this.eventSource) {
        this.eventSource.close();
      }
      const es = new EventSource('/api/realtime/stream');
      this.eventSource = es;

      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as RealtimeEventPayload;
          if (!parsed || parsed.senderClientId === this.clientId) return;
          this.handleIncomingEvent(parsed);
        } catch (_) {}
      };

      es.onerror = () => {
        es.close();
        this.eventSource = null;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connectSSE(), 4000);
      };
    } catch (_) {}
  }

  private handleIncomingEvent(event: RealtimeEventPayload) {
    const now = Date.now();
    if (event.type === 'init' && event.payload) {
      if (Array.isArray(event.payload.presences)) {
        event.payload.presences.forEach((p: OnlinePresenceInfo) => {
          if (p && p.userId) {
            this.presencesMap.set(`${p.userId}___${p.clientId || 'srv'}`, {
              ...p,
              lastSeenMs: p.lastSeenMs || now,
            });
          }
        });
      }
    } else if (event.type === 'presence:sync' && Array.isArray(event.payload)) {
      event.payload.forEach((p: OnlinePresenceInfo) => {
        if (p && p.userId) {
          this.presencesMap.set(`${p.userId}___${p.clientId || 'srv'}`, {
            ...p,
            lastSeenMs: p.lastSeenMs || now,
          });
        }
      });
    } else if (event.type === 'presence:heartbeat' && event.payload?.userId) {
      const p = event.payload as OnlinePresenceInfo;
      this.presencesMap.set(`${p.userId}___${p.clientId || event.senderClientId || 'peer'}`, {
        ...p,
        lastSeenMs: now,
      });
    } else if (event.type === 'presence:leave' && event.payload?.userId) {
      for (const [key, val] of this.presencesMap.entries()) {
        if (
          val.userId === event.payload.userId &&
          (event.payload.allDevices || !event.senderClientId || val.clientId === event.senderClientId)
        ) {
          this.presencesMap.delete(key);
        }
      }
    }

    this.notifyListeners(event);
  }

  public getActivePresences(): OnlinePresenceInfo[] {
    const now = Date.now();
    const byUser = new Map<string, OnlinePresenceInfo>();
    for (const [key, p] of this.presencesMap.entries()) {
      if (now - p.lastSeenMs > 50000) {
        this.presencesMap.delete(key);
        continue;
      }
      const existing = byUser.get(p.userId);
      if (!existing || p.lastSeenMs > existing.lastSeenMs) {
        byUser.set(p.userId, p);
      }
    }
    return Array.from(byUser.values());
  }

  public subscribe(listener: RealtimeEventListener): () => void {
    this.init();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(event: RealtimeEventPayload) {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.warn('Realtime listener error:', err);
      }
    });
  }

  public emit(type: RealtimeEventType, payload: any) {
    this.init();
    const eventObj: RealtimeEventPayload = {
      type,
      payload,
      senderClientId: this.clientId,
      timestamp: Date.now(),
    };

    // 1. Update local presence cache if heartbeat/leave
    if (type === 'presence:heartbeat' && payload?.userId) {
      this.presencesMap.set(`${payload.userId}___${this.clientId}`, {
        ...payload,
        clientId: this.clientId,
        lastSeenMs: Date.now(),
      });
    } else if (type === 'presence:leave' && payload?.userId) {
      for (const [key, val] of this.presencesMap.entries()) {
        if (val.userId === payload.userId && (payload.allDevices || val.clientId === this.clientId)) {
          this.presencesMap.delete(key);
        }
      }
    }

    // 2. Broadcast to same-browser tabs immediately
    try {
      this.broadcastChannel?.postMessage(eventObj);
    } catch (_) {}

    // 3. Broadcast via Supabase Realtime
    try {
      if (this.supabaseChannel) {
        this.supabaseChannel.send({
          type: 'broadcast',
          event: 'realtime_event',
          payload: eventObj,
        });
        if (type === 'presence:heartbeat' && payload?.userId) {
          this.supabaseChannel.track({
            ...payload,
            clientId: this.clientId,
            lastSeenMs: Date.now(),
          });
        } else if (type === 'presence:leave') {
          this.supabaseChannel.untrack();
        }
      }
    } catch (_) {}

    // 4. Send to Express Server SSE Hub
    try {
      fetch('/api/realtime/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          payload,
          clientId: this.clientId,
        }),
      }).catch(() => {});
    } catch (_) {}
  }

  public sendHeartbeat(info: Omit<OnlinePresenceInfo, 'clientId' | 'lastSeenMs'>) {
    this.emit('presence:heartbeat', {
      ...info,
      clientId: this.clientId,
      lastSeenMs: Date.now(),
    });
  }

  public sendLeave(userId: string, allDevices: boolean = false) {
    this.emit('presence:leave', { userId, allDevices });
  }

  public broadcastWorkSession(session: WorkSession, closeOtherUserSessions: boolean = false) {
    this.emit('session:upsert', { ...session, closeOtherUserSessions });
  }

  public broadcastClearWorkSessions() {
    this.emit('session:clear', {});
  }

  public broadcastChatMessage(message: ChatMessage, channel?: ChatChannel) {
    this.emit('chat:message', { message, channel });
  }

  public broadcastChatRead(channelId: string, userId: string) {
    this.emit('chat:read', { channelId, userId });
  }

  public broadcastChatChannel(channel: ChatChannel) {
    this.emit('chat:channel', channel);
  }

  public broadcastChatClear(channelId?: string) {
    this.emit('chat:clear', { channelId });
  }

  public broadcastChatTyping(channelId: string, userId: string, userName: string) {
    this.emit('chat:typing', { channelId, userId, userName });
  }
}

export const realtimeService = new RealtimeService();
