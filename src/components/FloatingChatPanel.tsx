import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAppContext, isManagerRole, isSuperAdmin } from '../store';
import { User, ChatChannel, ChatMessage } from '../types';
import { getDirectChannelId, resolveDirectPartner } from '../chatData';
import { useBodyScrollLock } from '../lib/scrollLock';

const QUICK_OPERATIONAL_TEMPLATES = [
  'Mohon laporan kesiapan kamar di gedung Anda.',
  'Tamu rombongan sudah tiba di lobi resepsionis.',
  'Mohon tim QC segera inspeksi kamar yang baru check-out.',
  'Mohon tim Teknisi cek fasilitas kamar yang dilaporkan.',
  'Siap, instruksi diterima dan segera ditindaklanjuti.'
];

export function FloatingChatPanel() {
  const {
    currentUser,
    users = [],
    chatChannels = [],
    chatMessages = [],
    isChatOpen,
    activeChatChannelId,
    chatSoundEnabled,
    chatNotificationToast,
    unreadTotalCount,
    openChat,
    closeChat,
    setActiveChatChannelId,
    toggleChatSound,
    sendChatMessage,
    dismissChatNotification,
    clearChatHistory,
    showToast,
    workSessions = [],
    onlinePresences = [],
    typingByChannel = {},
    notifyChatTyping
  } = useAppContext();

  const [chatSubFilter, setChatSubFilter] = useState<'ALL' | 'GROUP' | 'DIRECT'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [newChatSearch, setNewChatSearch] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [isOfficialInstruction, setIsOfficialInstruction] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [showQuickTemplates, setShowQuickTemplates] = useState(false);
  const [isExpandedWidth, setIsExpandedWidth] = useState(false);

  // Modals state
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const lastTypingSentRef = useRef<number>(0);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Otomatis tutup chat saat klik di luar panel chat
  useEffect(() => {
    if (!isChatOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (isNewChatModalOpen || showGroupInfoModal || showClearConfirmModal) return;

      const target = event.target as Node;
      if (chatPanelRef.current && !chatPanelRef.current.contains(target)) {
        const launcher = document.getElementById('floating-chat-launcher');
        if (launcher && launcher.contains(target)) return;
        closeChat();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isChatOpen, isNewChatModalOpen, showGroupInfoModal, showClearConfirmModal, closeChat]);

  const isAnyChatModalOpen = isNewChatModalOpen || showGroupInfoModal || showClearConfirmModal || (isChatOpen && isMobile);
  useBodyScrollLock(isAnyChatModalOpen);

  if (!currentUser) return null;

  const isCurrentUserManager = isManagerRole(currentUser.role);

  // Real-Time Multi-Account Online Presence Engine
  const isUserOnline = (userId: string): boolean => {
    if (userId === currentUser.id) return true;
    const now = Date.now();
    // 1. Check live real-time presence heartbeats
    const hasLivePresence = onlinePresences.some(
      p => p.userId === userId && (!p.lastSeen || now - p.lastSeen < 60000)
    );
    if (hasLivePresence) return true;

    // 2. Check active work sessions
    const hasActiveShift = workSessions.some(
      s => s.userId === userId && s.status === 'AKTIF' && !s.logoutTime
    );
    if (hasActiveShift) return true;

    return false;
  };

  // Get active session info for a user
  const getUserActiveSession = (userId: string) => {
    return workSessions.find(s => s.userId === userId && s.status === 'AKTIF' && !s.logoutTime);
  };

  // Channel helpers
  const getGroupMembers = (channel: ChatChannel): User[] => {
    if (channel.type === 'DIRECT') {
      return users.filter(u => channel.participantIds.includes(u.id));
    }
    if (channel.scope === 'ALL_MANAGERS_GROUP') {
      return users.filter(u => u.status === 'Aktif');
    }
    if (channel.department) {
      const deptUsers = users.filter(
        u =>
          u.department === channel.department ||
          channel.participantIds.includes(u.id) ||
          u.role === 'Super Admin' ||
          u.role === 'Admin'
      );
      return deptUsers.length > 0 ? deptUsers : users.filter(u => u.status === 'Aktif');
    }
    const explicitMembers = users.filter(u => channel.participantIds.includes(u.id));
    return explicitMembers.length > 0 ? explicitMembers : users.filter(u => u.status === 'Aktif');
  };

  const getDirectChatPartner = (channel: ChatChannel): User | undefined => {
    const partnerFromHelper = resolveDirectPartner(channel, currentUser.id, users);
    if (partnerFromHelper) return partnerFromHelper;
    const otherId = channel.participantIds.find(id => id !== currentUser.id);
    return users.find(u => u.id === otherId);
  };

  // Dynamic channel display name (so Direct Chat always shows the OTHER person's name to each participant!)
  const getChannelDisplayName = (channel: ChatChannel): string => {
    if (channel.type === 'DIRECT') {
      const partner = getDirectChatPartner(channel);
      if (partner) return partner.fullName;
    }
    return channel.name;
  };

  const getChannelSubtitle = (channel: ChatChannel): string => {
    if (channel.type === 'DIRECT') {
      const partner = getDirectChatPartner(channel);
      if (partner) {
        return `${partner.role}${partner.department ? ` • ${partner.department}` : ''}`;
      }
      return 'Pesan Pribadi (2 Arah)';
    }
    return channel.department ? `Grup Divisi ${channel.department}` : 'Grup Koordinasi Terpadu';
  };

  // Deduplicate and filter accessible channels for current user
  const accessibleChannels = useMemo(() => {
    const seenIds = new Set<string>();
    const seenDirectPartners = new Set<string>();
    const list: ChatChannel[] = [];

    // Sort channels so ones with recent messages come first among direct chats, while keeping primary groups accessible
    const sorted = [...chatChannels].sort((a, b) => {
      if (a.id === 'channel-all-managers') return -1;
      if (b.id === 'channel-all-managers') return 1;
      if (a.type !== b.type) return a.type === 'GROUP' ? -1 : 1;
      return (b.lastMessageTime || '').localeCompare(a.lastMessageTime || '');
    });

    for (const c of sorted) {
      if (seenIds.has(c.id)) continue;

      if (c.type === 'GROUP') {
        seenIds.add(c.id);
        list.push(c);
      } else if (c.type === 'DIRECT') {
        const isParticipant =
          c.participantIds.includes(currentUser.id) ||
          c.id.includes(currentUser.id);
        if (!isParticipant) continue;

        const partner = getDirectChatPartner(c);
        const partnerKey = partner ? partner.id : c.id;
        if (seenDirectPartners.has(partnerKey)) continue;
        seenDirectPartners.add(partnerKey);

        seenIds.add(c.id);
        list.push(c);
      }
    }
    return list;
  }, [chatChannels, currentUser.id, users]);

  const getChannelUnread = (channelId: string): number => {
    return chatMessages.filter(
      m =>
        m.channelId === channelId &&
        m.senderId !== currentUser.id &&
        !(m.readBy || []).includes(currentUser.id)
    ).length;
  };

  const groupUnreadTotal = useMemo(() => {
    return accessibleChannels
      .filter(c => c.type === 'GROUP')
      .reduce((acc, c) => acc + getChannelUnread(c.id), 0);
  }, [accessibleChannels, chatMessages, currentUser.id]);

  const directUnreadTotal = useMemo(() => {
    return accessibleChannels
      .filter(c => c.type === 'DIRECT')
      .reduce((acc, c) => acc + getChannelUnread(c.id), 0);
  }, [accessibleChannels, chatMessages, currentUser.id]);

  const filteredChannels = useMemo(() => {
    return accessibleChannels.filter(c => {
      if (chatSubFilter === 'GROUP' && c.type !== 'GROUP') return false;
      if (chatSubFilter === 'DIRECT' && c.type !== 'DIRECT') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const displayName = getChannelDisplayName(c).toLowerCase();
        const subtitle = getChannelSubtitle(c).toLowerCase();
        const lastMsg = (c.lastMessage || '').toLowerCase();
        return displayName.includes(q) || subtitle.includes(q) || lastMsg.includes(q);
      }
      return true;
    });
  }, [accessibleChannels, chatSubFilter, searchQuery, users, currentUser.id]);

  // All other active accounts for quick 1-click personal chat bar
  const otherColleagues = useMemo(() => {
    return users
      .filter(u => u.id !== currentUser.id && u.status === 'Aktif')
      .sort((a, b) => {
        const aOnline = isUserOnline(a.id) ? 1 : 0;
        const bOnline = isUserOnline(b.id) ? 1 : 0;
        if (aOnline !== bOnline) return bOnline - aOnline;
        return a.fullName.localeCompare(b.fullName);
      });
  }, [users, currentUser.id, onlinePresences, workSessions]);

  const onlineColleaguesCount = useMemo(() => {
    return otherColleagues.filter(u => isUserOnline(u.id)).length;
  }, [otherColleagues, onlinePresences, workSessions]);

  const activeChannel = chatChannels.find(c => c.id === activeChatChannelId);
  const channelMessages = useMemo(() => {
    if (!activeChatChannelId) return [];
    return chatMessages.filter(m => m.channelId === activeChatChannelId);
  }, [chatMessages, activeChatChannelId]);

  const activeDirectPartner =
    activeChannel && activeChannel.type === 'DIRECT'
      ? getDirectChatPartner(activeChannel)
      : undefined;
  const activeGroupMembers = activeChannel ? getGroupMembers(activeChannel) : [];
  const activeGroupOnlineMembers = activeGroupMembers.filter(u => isUserOnline(u.id));

  const currentChannelTyping = activeChatChannelId ? typingByChannel[activeChatChannelId] : undefined;

  useEffect(() => {
    if (isChatOpen && activeChatChannelId) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [channelMessages.length, activeChatChannelId, isChatOpen, currentChannelTyping]);

  // Clear reply state when switching channels
  useEffect(() => {
    setReplyingTo(null);
    setShowQuickTemplates(false);
  }, [activeChatChannelId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    if (activeChatChannelId && e.target.value.trim()) {
      const now = Date.now();
      if (now - lastTypingSentRef.current > 2000) {
        lastTypingSentRef.current = now;
        notifyChatTyping(activeChatChannelId);
      }
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageInput.trim() || !activeChatChannelId) return;

    sendChatMessage(
      activeChatChannelId,
      messageInput.trim(),
      isUrgent ? 'URGENT' : 'NORMAL',
      isCurrentUserManager ? isOfficialInstruction : false,
      replyingTo
        ? {
            id: replyingTo.id,
            senderName: replyingTo.senderName,
            text: replyingTo.message
          }
        : undefined
    );
    setMessageInput('');
    setIsUrgent(false);
    setIsOfficialInstruction(false);
    setReplyingTo(null);
    setShowQuickTemplates(false);
  };

  const handleStartDirectChat = (targetUser: User) => {
    setIsNewChatModalOpen(false);
    setShowGroupInfoModal(false);
    const channelId = getDirectChannelId(currentUser.id, targetUser.id);
    openChat(channelId);
    showToast(`Membuka ruang chat pribadi 2 arah dengan ${targetUser.fullName}`, 'info');
  };

  return (
    <>
      {/* 1. REAL-TIME NOTIFICATION BANNER (TOAST) */}
      {chatNotificationToast && (
        <div
          id="floating-chat-toast"
          className="fixed bottom-20 right-4 sm:right-6 z-50 max-w-sm w-[92vw] sm:w-[390px] bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-gold-500/40 animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-hajj-700 text-gold-300 flex items-center justify-center font-bold text-xs shadow border border-gold-500/30 shrink-0">
                <i className={`fa-solid ${chatNotificationToast.message.isUrgent ? 'fa-triangle-exclamation text-red-400 animate-bounce' : 'fa-comments'}`}></i>
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] font-bold text-gold-400 uppercase tracking-wider">
                    {chatNotificationToast.message.isInstruction
                      ? '★ Arahan Pimpinan UPT'
                      : chatNotificationToast.message.scope === 'DIRECT'
                      ? 'Pesan Pribadi Masuk'
                      : 'Pesan Grup Operasional'}
                  </span>
                  {chatNotificationToast.message.isUrgent && (
                    <span className="px-1.5 py-0.2 bg-red-600 text-white text-[9px] font-black rounded uppercase">
                      URGENT
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-white truncate max-w-[230px]">
                  {chatNotificationToast.channelName}
                </p>
              </div>
            </div>
            <button
              onClick={dismissChatNotification}
              className="text-slate-400 hover:text-white p-1 text-xs cursor-pointer"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div className="text-xs text-slate-200 mt-2.5 bg-white/10 p-2.5 rounded-xl border border-white/10">
            <div className="flex items-center justify-between text-[10px] text-slate-300 mb-1">
              <strong className="text-gold-300">{chatNotificationToast.message.senderName}</strong>
              <span>{chatNotificationToast.message.senderRole} • {chatNotificationToast.message.timestamp}</span>
            </div>
            <p className="line-clamp-2 leading-relaxed">{chatNotificationToast.message.message}</p>
          </div>

          <div className="mt-3 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={dismissChatNotification}
              className="px-2.5 py-1 text-slate-400 hover:text-slate-200 text-xs font-medium cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={() => {
                openChat(chatNotificationToast.channelId);
                dismissChatNotification();
              }}
              className="px-3.5 py-1.5 bg-hajj-700 hover:bg-hajj-600 text-white rounded-lg text-xs font-bold shadow transition flex items-center space-x-1.5 border border-gold-500/30 cursor-pointer"
            >
              <i className="fa-solid fa-reply text-[10px]"></i>
              <span>Balas Pesan</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. COMPACT FLOATING LAUNCHER BUTTON */}
      {!isChatOpen && (
        <div
          id="floating-chat-launcher"
          className="fixed z-40 flex items-center space-x-1.5 select-none pointer-events-auto touch-manipulation"
          style={{
            right: 'calc(12px + env(safe-area-inset-right, 0px))',
            bottom: 'calc(14px + env(safe-area-inset-bottom, 0px))'
          }}
        >
          {/* Sound Toggle */}
          <button
            type="button"
            onClick={toggleChatSound}
            className={`hidden sm:flex w-8 h-8 rounded-full shadow-md border items-center justify-center text-xs transition-all hover:scale-105 active:scale-95 cursor-pointer ${
              chatSoundEnabled
                ? 'bg-white dark:bg-slate-800 text-hajj-700 dark:text-gold-400 border-hajj-300 dark:border-slate-600'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600'
            }`}
            title={chatSoundEnabled ? 'Suara Notifikasi Chat: AKTIF' : 'Suara Notifikasi Chat: SENYAP'}
          >
            <i className={`fa-solid ${chatSoundEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}`}></i>
          </button>

          {/* Main Floating Chat Launcher */}
          <button
            type="button"
            onClick={() => openChat()}
            className="bg-hajj-700 hover:bg-hajj-800 active:bg-hajj-900 text-white shadow-xl shadow-hajj-950/30 p-2.5 sm:px-3.5 sm:py-2 rounded-full flex items-center space-x-2 transition-all hover:scale-105 active:scale-95 group cursor-pointer border border-gold-500/40 text-xs"
            title="Buka Chat Operasional (Grup & Pribadi Real-Time)"
            aria-label="Buka Chat Operasional Asrama"
          >
            <div className="relative flex items-center justify-center w-6 h-6 rounded-full bg-gold-500 text-hajj-950 font-bold text-xs shadow-inner shrink-0">
              <i className="fa-solid fa-comments text-[11px]"></i>
              {unreadTotalCount > 0 ? (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 ring-1 ring-white"></span>
                </span>
              ) : (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-hajj-800"></span>
              )}
            </div>

            <div className="hidden sm:flex flex-col items-start leading-none">
              <span className="text-[11px] font-bold tracking-tight text-white whitespace-nowrap">
                Chat Operasional
              </span>
              <span className="text-[9px] text-gold-300 font-medium mt-0.5">
                {onlineColleaguesCount + 1} Akun Online
              </span>
            </div>

            {unreadTotalCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full ring-1 ring-white shrink-0 animate-pulse">
                {unreadTotalCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* 3. PROFESSIONAL 2-WAY REAL-TIME CHAT & COORDINATION PANEL */}
      {isChatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-xs lg:bg-transparent lg:inset-auto lg:p-0 lg:fixed lg:bottom-4 lg:right-6 lg:z-40">
          {/* Backdrop click to close on mobile & tablet */}
          <div className="fixed inset-0 bg-transparent lg:hidden" onClick={closeChat} />

          <div
            ref={chatPanelRef}
            id="floating-chat-modal"
            className={`relative z-10 w-full h-full sm:h-[86vh] sm:max-h-[680px] sm:max-w-lg md:max-w-xl ${
              isExpandedWidth ? 'lg:w-[540px] lg:h-[650px]' : 'lg:w-[430px] lg:h-[600px]'
            } bg-white dark:bg-slate-900 sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 transition-all`}
          >
            {/* Top Header Bar */}
            <div className="bg-hajj-800 text-white px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between shrink-0 shadow-sm border-b border-gold-500/25">
              <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 pr-2">
                <div className="w-8 h-8 rounded-xl bg-gold-500 text-hajj-950 flex items-center justify-center font-bold text-sm shadow shrink-0">
                  <i className="fa-solid fa-comments"></i>
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-xs text-white leading-tight flex items-center space-x-1.5 truncate">
                    <span className="truncate">Chat Operasional UPT</span>
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-bold border border-emerald-400/30 shrink-0 flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                      <span>2-Arah Live</span>
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-300 flex items-center space-x-1 mt-0.5 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shrink-0"></span>
                    <span className="truncate">
                      {currentUser.fullName} ({currentUser.role}) • {onlineColleaguesCount + 1} Aktif
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsNewChatModalOpen(true)}
                  className="px-2 py-1 rounded-lg bg-gold-500/20 hover:bg-gold-500/30 text-gold-300 border border-gold-500/30 text-[10px] font-bold flex items-center space-x-1 transition cursor-pointer mr-0.5"
                  title="Mulai Chat Pribadi dengan Akun Lain"
                >
                  <i className="fa-solid fa-user-plus text-[9px]"></i>
                  <span className="hidden sm:inline">Pesan Baru</span>
                </button>
                <button
                  type="button"
                  onClick={toggleChatSound}
                  className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center transition cursor-pointer ${
                    chatSoundEnabled ? 'text-gold-300 bg-white/10' : 'text-slate-400 hover:text-white'
                  }`}
                  title={chatSoundEnabled ? 'Suara Notifikasi: Aktif' : 'Suara Notifikasi: Senyap'}
                >
                  <i className={`fa-solid ${chatSoundEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}`}></i>
                </button>
                <button
                  type="button"
                  onClick={() => setIsExpandedWidth(prev => !prev)}
                  className="hidden lg:flex w-7 h-7 rounded-lg text-slate-300 hover:text-white items-center justify-center hover:bg-white/10 transition cursor-pointer"
                  title={isExpandedWidth ? 'Ukuran Standar' : 'Perlebar Panel Chat'}
                >
                  <i className={`fa-solid ${isExpandedWidth ? 'fa-compress' : 'fa-expand'} text-xs`}></i>
                </button>
                <button
                  type="button"
                  onClick={closeChat}
                  className="w-7 h-7 rounded-lg text-slate-300 hover:text-white flex items-center justify-center hover:bg-white/10 transition cursor-pointer"
                  title="Tutup Panel"
                >
                  <i className="fa-solid fa-xmark text-sm"></i>
                </button>
              </div>
            </div>

            {/* ================= TEAM CHANNELS / ACTIVE CHAT ROOM ================= */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {activeChatChannelId && activeChannel ? (
                /* ================= ACTIVE CHAT ROOM VIEW ================= */
                <div className="flex-1 flex flex-col h-full bg-slate-50">
                  {/* Chat Room Top Bar */}
                  <div className="bg-white px-3 py-2.5 border-b border-slate-200 flex items-center justify-between shrink-0 shadow-2xs">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => setActiveChatChannelId(null)}
                        className="p-1.5 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition cursor-pointer shrink-0"
                        title="Kembali ke Daftar Saluran"
                      >
                        <i className="fa-solid fa-arrow-left text-sm"></i>
                      </button>

                      <div className="relative shrink-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs border ${
                            activeChannel.type === 'DIRECT'
                              ? 'bg-blue-100 text-blue-800 border-blue-200'
                              : 'bg-hajj-100 text-hajj-800 border-hajj-200'
                          }`}
                        >
                          {activeChannel.type === 'DIRECT' ? (
                            activeDirectPartner ? (
                              activeDirectPartner.fullName.substring(0, 2).toUpperCase()
                            ) : (
                              'DM'
                            )
                          ) : (
                            <i className={`fa-solid ${activeChannel.icon || 'fa-users'}`}></i>
                          )}
                        </div>
                        {activeChannel.type === 'DIRECT' && activeDirectPartner && (
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                              isUserOnline(activeDirectPartner.id) ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                          />
                        )}
                      </div>

                      <div className="min-w-0">
                        <h4 className="font-bold text-xs text-slate-900 leading-tight truncate">
                          {getChannelDisplayName(activeChannel)}
                        </h4>
                        <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 truncate mt-0.5">
                          {activeChannel.type === 'DIRECT' ? (
                            activeDirectPartner ? (
                              <>
                                <span
                                  className={`font-bold ${
                                    isUserOnline(activeDirectPartner.id) ? 'text-emerald-600' : 'text-slate-400'
                                  }`}
                                >
                                  {isUserOnline(activeDirectPartner.id) ? '● Sedang Aktif Bertugas' : '○ Offline'}
                                </span>
                                <span>•</span>
                                <span className="truncate">{activeDirectPartner.role}</span>
                              </>
                            ) : (
                              <span>Percakapan Pribadi 2 Arah</span>
                            )
                          ) : (
                            <>
                              <span className="text-emerald-700 font-bold">
                                ● {activeGroupOnlineMembers.length} Online
                              </span>
                              <span>dari {activeGroupMembers.length} Petugas</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowGroupInfoModal(true)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-hajj-50 text-slate-700 hover:text-hajj-800 rounded-lg text-[10px] font-bold transition flex items-center space-x-1 border border-slate-200 cursor-pointer"
                        title={
                          activeChannel.type === 'DIRECT'
                            ? 'Informasi lawan bicara'
                            : 'Lihat daftar anggota grup & mulai chat pribadi'
                        }
                      >
                        <i className={`fa-solid ${activeChannel.type === 'DIRECT' ? 'fa-id-badge' : 'fa-users'}`}></i>
                        <span>{activeChannel.type === 'DIRECT' ? 'Profil' : `${activeGroupMembers.length} Anggota`}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowClearConfirmModal(true)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg text-xs cursor-pointer"
                        title="Bersihkan Riwayat Pesan di Saluran Ini"
                      >
                        <i className="fa-solid fa-trash-can"></i>
                      </button>
                    </div>
                  </div>

                  {/* Message History List */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2.5">
                    {channelMessages.length === 0 ? (
                      <div className="text-center py-12 px-4 text-slate-400 space-y-2.5">
                        <div className="w-12 h-12 rounded-2xl bg-slate-200/70 text-slate-400 flex items-center justify-center mx-auto text-xl">
                          <i className="fa-solid fa-comments"></i>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-600">
                            Ruang Komunikasi {getChannelDisplayName(activeChannel)}
                          </p>
                          <p className="text-[11px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                            {activeChannel.type === 'DIRECT'
                              ? 'Pesan yang Anda kirimkan di sini bersifat pribadi (2 arah) dan diterima langsung secara real-time.'
                              : 'Seluruh anggota dalam grup ini dapat mengirim dan menerima pesan koordinasi secara real-time.'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      channelMessages.map(msg => {
                        const isMe = msg.senderId === currentUser.id;
                        const readCount = (msg.readBy || []).filter(id => id !== msg.senderId).length;
                        const senderUser = users.find(u => u.id === msg.senderId);

                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group`}
                          >
                            {/* Sender Meta Header */}
                            <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 mb-1 px-1">
                              {!isMe && senderUser ? (
                                <button
                                  type="button"
                                  onClick={() => handleStartDirectChat(senderUser)}
                                  className="font-bold text-slate-800 hover:text-hajj-700 hover:underline cursor-pointer flex items-center space-x-1"
                                  title={`Klik untuk chat pribadi dengan ${msg.senderName}`}
                                >
                                  <span>{msg.senderName}</span>
                                  <span className="text-[9px] font-semibold px-1.5 py-0.1 bg-slate-200 text-slate-700 rounded">
                                    {msg.senderRole}
                                  </span>
                                </button>
                              ) : (
                                <span className="font-bold text-hajj-800">Anda ({msg.senderName})</span>
                              )}
                              <span>•</span>
                              <span className="font-mono text-[9px]">{msg.timestamp}</span>
                              {msg.isUrgent && (
                                <span className="px-1.5 py-0.2 bg-red-100 text-red-700 font-bold rounded text-[9px]">
                                  URGENT
                                </span>
                              )}
                              {msg.isInstruction && (
                                <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 font-bold rounded text-[9px]">
                                  ★ Arahan Pimpinan
                                </span>
                              )}
                            </div>

                            {/* Message Bubble + Action Buttons */}
                            <div className={`flex items-end gap-1.5 max-w-[88%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                              <div
                                className={`p-3 rounded-2xl text-xs shadow-2xs relative ${
                                  isMe
                                    ? 'bg-hajj-700 text-white rounded-tr-none'
                                    : msg.isInstruction
                                    ? 'bg-amber-50 text-slate-900 border border-amber-300 rounded-tl-none font-medium'
                                    : msg.isUrgent
                                    ? 'bg-red-50 text-slate-900 border border-red-300 rounded-tl-none font-medium'
                                    : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                                }`}
                              >
                                {/* Quoted Reply Preview if any */}
                                {msg.replyToText && (
                                  <div
                                    className={`mb-2 p-2 rounded-lg text-[10px] border-l-2 ${
                                      isMe
                                        ? 'bg-hajj-800/80 border-gold-400 text-slate-100'
                                        : 'bg-slate-100 border-hajj-600 text-slate-600'
                                    }`}
                                  >
                                    <p className="font-bold text-[9px] opacity-90">
                                      Membalas {msg.replyToSender || 'Pesan'}:
                                    </p>
                                    <p className="truncate opacity-80">{msg.replyToText}</p>
                                  </div>
                                )}

                                <p className="whitespace-pre-wrap leading-relaxed break-words">{msg.message}</p>

                                {/* Read Receipt & Delivery Indicator */}
                                {isMe && (
                                  <div className="mt-1 flex items-center justify-end space-x-1 text-[9px] text-emerald-200/90">
                                    <i className={`fa-solid ${readCount > 0 ? 'fa-check-double text-gold-300' : 'fa-check'}`}></i>
                                    <span>
                                      {activeChannel.type === 'DIRECT'
                                        ? readCount > 0
                                          ? 'Dibaca'
                                          : 'Terkirim'
                                        : readCount > 0
                                        ? `Dibaca ${readCount}`
                                        : 'Terkirim'}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Reply Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  setReplyingTo(msg);
                                  inputRef.current?.focus();
                                }}
                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 text-slate-400 hover:text-hajj-700 hover:bg-slate-200/60 rounded-lg text-[10px] transition cursor-pointer shrink-0"
                                title="Balas pesan ini"
                              >
                                <i className="fa-solid fa-reply"></i>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}

                    {/* Real-Time Typing Indicator */}
                    {currentChannelTyping && currentChannelTyping.userId !== currentUser.id && (
                      <div className="flex items-center space-x-2 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl w-fit animate-pulse">
                        <span className="flex space-x-1">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"></span>
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce delay-75"></span>
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce delay-150"></span>
                        </span>
                        <span className="font-semibold">
                          {currentChannelTyping.userName} sedang mengetik pesan...
                        </span>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>

                  {/* Quick Operational Templates Bar */}
                  {showQuickTemplates && (
                    <div className="px-3 py-2 bg-slate-100 border-t border-slate-200 space-y-1.5 max-h-36 overflow-y-auto">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
                        <span>Template Pesan Cepat Operasional:</span>
                        <button
                          type="button"
                          onClick={() => setShowQuickTemplates(false)}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_OPERATIONAL_TEMPLATES.map((tpl, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setMessageInput(tpl);
                              setShowQuickTemplates(false);
                              inputRef.current?.focus();
                            }}
                            className="text-left text-[10px] bg-white hover:bg-hajj-50 text-slate-700 hover:text-hajj-800 border border-slate-200 hover:border-hajj-300 px-2.5 py-1 rounded-lg transition cursor-pointer"
                          >
                            {tpl}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Replying To Banner */}
                  {replyingTo && (
                    <div className="px-3 py-2 bg-hajj-50 border-t border-hajj-200 flex items-center justify-between text-xs">
                      <div className="min-w-0 flex-1 pr-2 border-l-2 border-hajj-700 pl-2">
                        <p className="text-[10px] font-bold text-hajj-800">
                          Membalas {replyingTo.senderName} ({replyingTo.senderRole})
                        </p>
                        <p className="text-[11px] text-slate-600 truncate">{replyingTo.message}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReplyingTo(null)}
                        className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                        title="Batalkan balasan"
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                  )}

                  {/* Message Input Form */}
                  <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-200 space-y-2 shrink-0">
                    <div className="flex items-center justify-between text-[11px] px-0.5">
                      <div className="flex items-center space-x-3">
                        {isCurrentUserManager && (
                          <label className="flex items-center space-x-1.5 text-slate-700 font-medium cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isOfficialInstruction}
                              onChange={e => setIsOfficialInstruction(e.target.checked)}
                              className="rounded text-hajj-700 focus:ring-hajj-600"
                            />
                            <span>Arahan Pimpinan</span>
                          </label>
                        )}
                        <label className="flex items-center space-x-1.5 text-red-700 font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isUrgent}
                            onChange={e => setIsUrgent(e.target.checked)}
                            className="rounded text-red-600 focus:ring-red-500"
                          />
                          <span>Penting / Urgent</span>
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowQuickTemplates(prev => !prev)}
                        className="text-[10px] font-bold text-hajj-700 hover:text-hajj-800 flex items-center space-x-1 cursor-pointer"
                      >
                        <i className="fa-solid fa-bolt text-amber-500"></i>
                        <span>Pesan Cepat</span>
                      </button>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        ref={inputRef}
                        type="text"
                        placeholder={
                          activeChannel.type === 'DIRECT'
                            ? `Kirim pesan pribadi ke ${getChannelDisplayName(activeChannel)}...`
                            : `Kirim pesan ke ${getChannelDisplayName(activeChannel)}...`
                        }
                        value={messageInput}
                        onChange={handleInputChange}
                        className="flex-1 px-3.5 py-2 bg-slate-100 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-hajj-600 focus:bg-white focus:outline-none text-slate-900"
                      />
                      <button
                        type="submit"
                        disabled={!messageInput.trim()}
                        className="px-4 py-2 bg-hajj-700 hover:bg-hajj-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow transition flex items-center justify-center cursor-pointer"
                        title="Kirim Pesan (Enter)"
                      >
                        <i className="fa-solid fa-paper-plane"></i>
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                /* ================= CHANNEL LIST & ONLINE COLLEAGUES VIEW ================= */
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                  {/* Active Officers Horizontal Quick-Chat Strip */}
                  <div className="px-3 pt-2.5 pb-2 bg-white border-b border-slate-200 shrink-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>Klik Akun untuk Chat Pribadi 2 Arah ({onlineColleaguesCount} Aktif)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsNewChatModalOpen(true)}
                        className="text-[10px] font-bold text-hajj-700 hover:underline cursor-pointer"
                      >
                        Lihat Semua ({otherColleagues.length})
                      </button>
                    </div>
                    <div className="flex items-center space-x-2 overflow-x-auto pb-1 custom-scrollbar">
                      {otherColleagues.map(colleague => {
                        const online = isUserOnline(colleague.id);
                        const dmChannelId = getDirectChannelId(currentUser.id, colleague.id);
                        const unreadDm = getChannelUnread(dmChannelId);

                        return (
                          <button
                            key={colleague.id}
                            type="button"
                            onClick={() => handleStartDirectChat(colleague)}
                            className="flex flex-col items-center min-w-[58px] max-w-[64px] p-1 rounded-xl hover:bg-hajj-50 transition cursor-pointer group shrink-0 relative"
                            title={`Chat Pribadi dengan ${colleague.fullName} (${colleague.role}) - ${online ? 'Sedang Aktif' : 'Offline'}`}
                          >
                            <div className="relative">
                              <div
                                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs border shadow-2xs transition group-hover:scale-105 ${
                                  online
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {colleague.fullName.substring(0, 2).toUpperCase()}
                              </div>
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                                  online ? 'bg-emerald-500' : 'bg-slate-300'
                                }`}
                              />
                              {unreadDm > 0 && (
                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black px-1.5 rounded-full ring-1 ring-white">
                                  {unreadDm}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-semibold text-slate-700 group-hover:text-hajj-800 truncate w-full text-center mt-1">
                              {colleague.fullName.split(' ')[0]}
                            </span>
                            <span className="text-[8px] text-slate-400 truncate w-full text-center">
                              {colleague.role}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Search & Filter Tabs */}
                  <div className="p-3 bg-white border-b border-slate-200 space-y-2 shrink-0">
                    <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setChatSubFilter('ALL')}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center justify-center space-x-1 ${
                          chatSubFilter === 'ALL'
                            ? 'bg-white text-hajj-800 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span>Semua</span>
                        {unreadTotalCount > 0 && (
                          <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.1 rounded-full">
                            {unreadTotalCount}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatSubFilter('GROUP')}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center justify-center space-x-1 ${
                          chatSubFilter === 'GROUP'
                            ? 'bg-white text-hajj-800 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <i className="fa-solid fa-users text-[10px]"></i>
                        <span>Grup ({accessibleChannels.filter(c => c.type === 'GROUP').length})</span>
                        {groupUnreadTotal > 0 && (
                          <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.1 rounded-full">
                            {groupUnreadTotal}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatSubFilter('DIRECT')}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center justify-center space-x-1 ${
                          chatSubFilter === 'DIRECT'
                            ? 'bg-white text-hajj-800 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <i className="fa-solid fa-user-group text-[10px]"></i>
                        <span>Pribadi ({accessibleChannels.filter(c => c.type === 'DIRECT').length})</span>
                        {directUnreadTotal > 0 && (
                          <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.1 rounded-full">
                            {directUnreadTotal}
                          </span>
                        )}
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Cari grup divisi, nama rekan, atau isi pesan..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-100 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-hajj-600 focus:bg-white focus:outline-none text-slate-800"
                      />
                      <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-2.5 text-slate-400 text-xs"></i>
                    </div>
                  </div>

                  {/* Channels List */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                    {filteredChannels.length === 0 ? (
                      <div className="text-center py-8 px-4 text-slate-400 space-y-2">
                        <p className="text-xs">Belum ada percakapan pada kategori ini.</p>
                        <button
                          type="button"
                          onClick={() => setIsNewChatModalOpen(true)}
                          className="px-3 py-1.5 bg-hajj-700 text-white rounded-lg text-xs font-bold shadow-2xs cursor-pointer"
                        >
                          + Mulai Chat Pribadi Baru
                        </button>
                      </div>
                    ) : (
                      filteredChannels.map(channel => {
                        const unread = getChannelUnread(channel.id);
                        const partner =
                          channel.type === 'DIRECT' ? getDirectChatPartner(channel) : undefined;
                        const online = partner ? isUserOnline(partner.id) : false;
                        const groupMembers =
                          channel.type === 'GROUP' ? getGroupMembers(channel) : [];
                        const groupOnlineCount =
                          channel.type === 'GROUP'
                            ? groupMembers.filter(u => isUserOnline(u.id)).length
                            : 0;
                        const displayName = getChannelDisplayName(channel);
                        const subtitle = getChannelSubtitle(channel);

                        return (
                          <button
                            key={channel.id}
                            type="button"
                            onClick={() => openChat(channel.id)}
                            className={`w-full text-left p-3 bg-white hover:bg-hajj-50/60 border rounded-xl transition flex items-center justify-between group cursor-pointer shadow-2xs ${
                              unread > 0
                                ? 'border-hajj-400 bg-hajj-50/30'
                                : 'border-slate-200'
                            }`}
                          >
                            <div className="flex items-center space-x-3 min-w-0 flex-1">
                              <div className="relative shrink-0">
                                <div
                                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm border ${
                                    channel.type === 'DIRECT'
                                      ? 'bg-blue-100 text-blue-800 border-blue-200'
                                      : 'bg-hajj-100 text-hajj-800 border-hajj-200'
                                  }`}
                                >
                                  {channel.type === 'DIRECT' ? (
                                    partner ? (
                                      partner.fullName.substring(0, 2).toUpperCase()
                                    ) : (
                                      'DM'
                                    )
                                  ) : (
                                    <i className={`fa-solid ${channel.icon || 'fa-users'}`}></i>
                                  )}
                                </div>
                                {channel.type === 'DIRECT' && (
                                  <span
                                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white ${
                                      online ? 'bg-emerald-500' : 'bg-slate-300'
                                    }`}
                                  />
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center space-x-1.5 min-w-0">
                                    <span className="font-bold text-slate-900 text-xs group-hover:text-hajj-700 truncate">
                                      {displayName}
                                    </span>
                                    <span
                                      className={`text-[9px] font-bold px-1.5 py-0.1 rounded shrink-0 ${
                                        channel.type === 'DIRECT'
                                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      }`}
                                    >
                                      {channel.type === 'DIRECT' ? 'Pribadi' : `${groupOnlineCount} Aktif`}
                                    </span>
                                  </div>
                                  {channel.lastMessageTime && (
                                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                                      {channel.lastMessageTime}
                                    </span>
                                  )}
                                </div>

                                <p className="text-[10px] text-slate-400 truncate">{subtitle}</p>
                                <p
                                  className={`text-[11px] truncate mt-0.5 ${
                                    unread > 0 ? 'font-bold text-slate-900' : 'text-slate-500'
                                  }`}
                                >
                                  {channel.lastMessage || 'Belum ada pesan — klik untuk mulai percakapan'}
                                </p>
                              </div>
                            </div>

                            {unread > 0 && (
                              <span className="ml-2 bg-red-500 text-white font-black px-2 py-0.5 rounded-full text-[10px] shrink-0 shadow-2xs">
                                {unread}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Mobile & Tablet Bottom Close Action Bar */}
                  <div className="lg:hidden p-2.5 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 shrink-0">
                    <button
                      type="button"
                      onClick={closeChat}
                      className="w-full py-2 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-bold rounded-lg text-xs transition flex items-center justify-center space-x-2 shadow-2xs border border-slate-200 dark:border-slate-600 cursor-pointer"
                    >
                      <i className="fa-solid fa-arrow-left text-xs"></i>
                      <span>Tutup Panel Chat</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: NEW DIRECT CHAT (PILIH AKUN REKAN KERJA) ================= */}
      {isNewChatModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 flex flex-col max-h-[82vh]">
            <div className="p-3.5 bg-hajj-800 text-white flex items-center justify-between border-b border-gold-500/25">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-gold-500 text-hajj-950 flex items-center justify-center font-bold text-xs">
                  <i className="fa-solid fa-user-plus"></i>
                </div>
                <div>
                  <h4 className="font-bold text-xs text-white">Mulai Chat Pribadi (2 Arah)</h4>
                  <p className="text-[10px] text-slate-300">
                    Pilih akun petugas untuk berkomunikasi langsung secara personal
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsNewChatModalOpen(false)}
                className="text-slate-300 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="p-3 border-b border-slate-200 bg-slate-50">
              <div className="relative">
                <input
                  type="text"
                  value={newChatSearch}
                  onChange={e => setNewChatSearch(e.target.value)}
                  placeholder="Cari nama petugas, jabatan, atau divisi..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-hajj-600 text-slate-800"
                />
                <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-2.5 text-slate-400 text-xs"></i>
              </div>
            </div>

            <div className="p-3 overflow-y-auto custom-scrollbar flex-1 space-y-1.5">
              {otherColleagues
                .filter(u => {
                  if (!newChatSearch.trim()) return true;
                  const q = newChatSearch.toLowerCase();
                  return (
                    u.fullName.toLowerCase().includes(q) ||
                    u.role.toLowerCase().includes(q) ||
                    (u.department || '').toLowerCase().includes(q)
                  );
                })
                .map(u => {
                  const online = isUserOnline(u.id);
                  const activeSess = getUserActiveSession(u.id);

                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleStartDirectChat(u)}
                      className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:bg-hajj-50 hover:border-hajj-300 transition flex items-center justify-between text-xs cursor-pointer group"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="relative shrink-0">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
                              online
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-slate-100 text-slate-800 border border-slate-200'
                            }`}
                          >
                            {u.fullName.substring(0, 2).toUpperCase()}
                          </div>
                          <span
                            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                              online ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 block group-hover:text-hajj-700 truncate">
                            {u.fullName}
                          </span>
                          <span className="text-[10px] text-slate-500 block truncate">
                            {u.role} • {u.department || 'Operasional'}
                            {u.assignedBuilding ? ` (${u.assignedBuilding})` : ''}
                          </span>
                          {activeSess && (
                            <span className="text-[9px] text-emerald-700 font-semibold block">
                              Masuk shift: {activeSess.loginTime.split(' ')[1] || activeSess.loginTime} WIB
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0 ml-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            online
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {online ? '● Aktif' : 'Offline'}
                        </span>
                        <span className="text-[9px] text-hajj-700 font-bold mt-1 group-hover:underline">
                          Kirim Pesan →
                        </span>
                      </div>
                    </button>
                  );
                })}
            </div>

            <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-right">
              <button
                type="button"
                onClick={() => setIsNewChatModalOpen(false)}
                className="px-3.5 py-1.5 text-slate-600 hover:text-slate-900 text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: GROUP / PARTNER INFO & MEMBER DIRECTORY ================= */}
      {showGroupInfoModal && activeChannel && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 flex flex-col max-h-[80vh]">
            <div className="p-3.5 bg-hajj-800 text-white flex items-center justify-between border-b border-gold-500/25">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-gold-500 text-hajj-950 flex items-center justify-center font-bold text-xs shrink-0">
                  <i className={`fa-solid ${activeChannel.type === 'DIRECT' ? 'fa-user' : 'fa-users'}`}></i>
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-xs text-white truncate">
                    {getChannelDisplayName(activeChannel)}
                  </h4>
                  <p className="text-[10px] text-slate-300 truncate">
                    {activeChannel.type === 'DIRECT'
                      ? 'Informasi Akun Lawan Bicara'
                      : `${activeGroupOnlineMembers.length} Aktif dari ${activeGroupMembers.length} Anggota Grup`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowGroupInfoModal(false)}
                className="text-slate-300 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="p-3 overflow-y-auto custom-scrollbar flex-1 space-y-2">
              {activeGroupMembers.map(member => {
                const online = isUserOnline(member.id);
                const isSelf = member.id === currentUser.id;
                const activeSess = getUserActiveSession(member.id);

                return (
                  <div
                    key={member.id}
                    className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
                            online
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {member.fullName.substring(0, 2).toUpperCase()}
                        </div>
                        <span
                          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                            online ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">
                          {member.fullName} {isSelf && <span className="text-hajj-700">(Anda)</span>}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {member.role} • {member.department || 'Operasional'}
                        </p>
                        {activeSess && (
                          <p className="text-[9px] text-emerald-700 font-semibold">
                            Sedang bertugas sejak {activeSess.loginTime.split(' ')[1] || activeSess.loginTime} WIB
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0 ml-2">
                      {!isSelf && activeChannel.type === 'GROUP' && (
                        <button
                          type="button"
                          onClick={() => handleStartDirectChat(member)}
                          className="px-2.5 py-1 bg-hajj-700 hover:bg-hajj-800 text-white rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center space-x-1"
                        >
                          <i className="fa-solid fa-comment-dots text-[9px]"></i>
                          <span>Chat Pribadi</span>
                        </button>
                      )}
                      {isSelf && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          ● Online
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-right">
              <button
                type="button"
                onClick={() => setShowGroupInfoModal(false)}
                className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CLEAR HISTORY ================= */}
      {showClearConfirmModal && activeChannel && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-4 border border-slate-200 space-y-3">
            <div className="flex items-center space-x-2 text-amber-600">
              <i className="fa-solid fa-triangle-exclamation text-lg"></i>
              <h4 className="font-bold text-sm text-slate-900">Bersihkan Riwayat Obrolan?</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Semua pesan dalam saluran <strong>"{getChannelDisplayName(activeChannel)}"</strong> akan dihapus secara real-time.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowClearConfirmModal(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  clearChatHistory(activeChannel.id);
                  setShowClearConfirmModal(false);
                  showToast('Riwayat obrolan berhasil dibersihkan.', 'info');
                }}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
              >
                Bersihkan
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
