import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAppContext, isManagerRole, isSuperAdmin } from '../store';
import { User, ChatChannel } from '../types';
import { useBodyScrollLock } from '../lib/scrollLock';

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
    workSessions = []
  } = useAppContext();

  const [chatSubFilter, setChatSubFilter] = useState<'ALL' | 'GROUP' | 'DIRECT'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [isOfficialInstruction, setIsOfficialInstruction] = useState(false);

  // Modals state
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);

  // Simulated presence overrides
  const [presenceOverrides] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);

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
      // Jika modal sub-dialog chat sedang terbuka, jangan tutup panel
      if (isNewChatModalOpen || showGroupInfoModal || showClearConfirmModal) return;

      const target = event.target as Node;
      if (chatPanelRef.current && !chatPanelRef.current.contains(target)) {
        // Abaikan jika klik terjadi pada tombol floating launcher
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

  // Online Presence Engine
  const isUserOnline = (userId: string): boolean => {
    if (userId === currentUser.id) return true;
    if (presenceOverrides[userId] !== undefined) return presenceOverrides[userId];
    const hasActiveShift = workSessions.some(s => s.userId === userId && s.status === 'AKTIF' && !s.logoutTime);
    if (hasActiveShift) return true;
    const targetUser = users.find(u => u.id === userId);
    if (targetUser && targetUser.status === 'Aktif') {
      if (targetUser.role === 'Admin' || targetUser.role === 'Super Admin') return true;
    }
    return false;
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
      const deptUsers = users.filter(u => u.department === channel.department || channel.participantIds.includes(u.id));
      return deptUsers.length > 0 ? deptUsers : users.filter(u => u.status === 'Aktif');
    }
    const explicitMembers = users.filter(u => channel.participantIds.includes(u.id));
    return explicitMembers.length > 0 ? explicitMembers : users.filter(u => u.status === 'Aktif');
  };

  const getDirectChatPartner = (channel: ChatChannel): User | undefined => {
    const otherId = channel.participantIds.find(id => id !== currentUser.id);
    return users.find(u => u.id === otherId);
  };

  const accessibleChannels = chatChannels.filter(c => {
    if (isSuperAdmin(currentUser.role)) return true;
    if (c.type === 'GROUP') return true;
    return c.participantIds.includes(currentUser.id);
  });

  const getChannelUnread = (channelId: string): number => {
    return chatMessages.filter(m => m.channelId === channelId && m.senderId !== currentUser.id && !m.readBy.includes(currentUser.id)).length;
  };

  const filteredChannels = useMemo(() => {
    return accessibleChannels.filter(c => {
      if (chatSubFilter === 'GROUP' && c.type !== 'GROUP') return false;
      if (chatSubFilter === 'DIRECT' && c.type !== 'DIRECT') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return c.name.toLowerCase().includes(q) || (c.department || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [accessibleChannels, chatSubFilter, searchQuery]);

  const activeChannel = chatChannels.find(c => c.id === activeChatChannelId);
  const channelMessages = chatMessages.filter(m => m.channelId === activeChatChannelId);
  const activeDirectPartner = activeChannel && activeChannel.type === 'DIRECT' ? getDirectChatPartner(activeChannel) : undefined;
  const activeGroupMembers = activeChannel ? getGroupMembers(activeChannel) : [];
  const activeGroupOnlineMembers = activeGroupMembers.filter(u => isUserOnline(u.id));

  useEffect(() => {
    if (isChatOpen && activeChatChannelId) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [channelMessages.length, activeChatChannelId, isChatOpen]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageInput.trim() || !activeChatChannelId) return;
    sendChatMessage(activeChatChannelId, messageInput.trim(), isUrgent ? 'URGENT' : 'NORMAL', isCurrentUserManager ? isOfficialInstruction : false);
    setMessageInput('');
    setIsUrgent(false);
    setIsOfficialInstruction(false);
  };

  const handleStartDirectChat = (targetUser: User) => {
    setIsNewChatModalOpen(false);
    const channelId = `dm-${currentUser.id}-${targetUser.id}`;
    openChat(channelId);
    showToast(`Membuka diskusi dengan ${targetUser.fullName}`, 'info');
  };

  return (
    <>
      {/* 1. NOTIFICATION BANNER (TOAST) */}
      {chatNotificationToast && (
        <div 
          id="floating-chat-toast"
          className="fixed bottom-20 right-4 sm:right-6 z-50 max-w-sm w-[90vw] sm:w-[380px] bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-gold-500/40 animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-full bg-hajj-700 text-gold-300 flex items-center justify-center font-bold text-xs shadow border border-gold-500/30">
                <i className="fa-solid fa-bell"></i>
              </div>
              <div>
                <span className="text-[10px] font-bold text-gold-400 uppercase tracking-wider block">
                  {chatNotificationToast.message.isInstruction ? '★ Arahan Pimpinan UPT' : 'Pemberitahuan Operasional'}
                </span>
                <p className="text-xs font-bold text-white truncate max-w-[200px]">
                  {chatNotificationToast.channelName}
                </p>
              </div>
            </div>
            <button
              onClick={dismissChatNotification}
              className="text-slate-400 hover:text-white p-1 text-xs"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>

          <p className="text-xs text-slate-200 mt-2 bg-white/10 p-2.5 rounded-xl line-clamp-2">
            <strong className="text-gold-300">{chatNotificationToast.message.senderName}: </strong>
            {chatNotificationToast.message.message}
          </p>

          <div className="mt-3 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={dismissChatNotification}
              className="px-2.5 py-1 text-slate-400 hover:text-slate-200 text-xs font-medium"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={() => {
                openChat(chatNotificationToast.channelId);
                dismissChatNotification();
              }}
              className="px-3 py-1.5 bg-hajj-700 hover:bg-hajj-800 text-white rounded-lg text-xs font-bold shadow transition flex items-center space-x-1 border border-gold-500/30"
            >
              <span>Buka Koordinasi</span>
              <i className="fa-solid fa-arrow-right text-[10px]"></i>
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
          {/* Sound Toggle - shown on tablet/desktop */}
          <button
            type="button"
            onClick={toggleChatSound}
            className={`hidden sm:flex w-7 h-7 rounded-full shadow-xs border items-center justify-center text-[10px] transition-all hover:scale-105 active:scale-95 cursor-pointer ${
              chatSoundEnabled 
                ? 'bg-white dark:bg-slate-800 text-hajj-700 dark:text-gold-400 border-hajj-300 dark:border-slate-600' 
                : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600'
            }`}
            title={chatSoundEnabled ? 'Suara Notifikasi: AKTIF' : 'Suara Notifikasi: SENYAP'}
          >
            <i className={`fa-solid ${chatSoundEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}`}></i>
          </button>

          {/* Main Floating Concierge Button - Sleek, Compact on mobile, Neat on tablet */}
          <button
            type="button"
            onClick={() => openChat()}
            className="bg-hajj-700 hover:bg-hajj-800 active:bg-hajj-900 text-white shadow-lg shadow-hajj-950/25 p-2 sm:px-3 sm:py-1.5 rounded-full flex items-center space-x-1.5 transition-all hover:scale-105 active:scale-95 group cursor-pointer border border-gold-500/40 text-[11px]"
            title="Buka Chat Operasional Asrama"
            aria-label="Buka Chat Operasional Asrama"
          >
            <div className="relative flex items-center justify-center w-5 h-5 rounded-full bg-gold-500 text-hajj-950 font-bold text-[10px] shadow-inner shrink-0">
              <i className="fa-solid fa-headset text-[10px]"></i>
              {unreadTotalCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 ring-1 ring-white"></span>
                </span>
              )}
            </div>

            <span className="hidden sm:inline text-[11px] font-semibold tracking-tight text-white whitespace-nowrap">
              Chat Operasional
            </span>

            {unreadTotalCount > 0 && (
              <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full ring-1 ring-white shrink-0">
                {unreadTotalCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* 3. PROFESSIONAL TEAM CHAT & COORDINATION PANEL */}
      {isChatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-xs lg:bg-transparent lg:inset-auto lg:p-0 lg:fixed lg:bottom-4 lg:right-6 lg:z-40">
          {/* Backdrop click to close on mobile & tablet */}
          <div 
            className="fixed inset-0 bg-transparent lg:hidden" 
            onClick={closeChat} 
          />

          <div 
            ref={chatPanelRef}
            id="floating-chat-modal"
            className="relative z-10 w-full h-full sm:h-[86vh] sm:max-h-[660px] sm:max-w-lg md:max-w-xl lg:w-[410px] lg:h-[580px] bg-white dark:bg-slate-900 sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Header Bar */}
            <div className="bg-hajj-800 text-white px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between shrink-0 shadow-sm border-b border-gold-500/25">
              <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 pr-2">
                <div className="w-8 h-8 rounded-xl bg-gold-500 text-hajj-950 flex items-center justify-center font-bold text-sm shadow shrink-0">
                  <i className="fa-solid fa-comments"></i>
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-xs text-white leading-tight flex items-center space-x-1.5 truncate">
                    <span className="truncate">Chat Operasional UPT</span>
                    <span className="text-[9px] bg-gold-500/20 text-gold-300 px-1.5 py-0.2 rounded font-semibold border border-gold-500/30 shrink-0">
                      Live
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-300 flex items-center space-x-1 mt-0.5 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shrink-0"></span>
                    <span className="truncate">{currentUser.fullName} ({currentUser.role})</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-1 shrink-0">
                <button
                  type="button"
                  onClick={toggleChatSound}
                  className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center transition cursor-pointer ${chatSoundEnabled ? 'text-gold-300 bg-white/10' : 'text-slate-400 hover:text-white'}`}
                  title={chatSoundEnabled ? 'Suara Aktif' : 'Suara Senyap'}
                >
                  <i className={`fa-solid ${chatSoundEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}`}></i>
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

          {/* ================= TEAM CHANNELS / CHAT ================= */}
          <div className="flex-1 flex flex-col overflow-hidden">
              {activeChatChannelId ? (
                /* Active Chat Room View */
                <div className="flex-1 flex flex-col h-full bg-slate-50">
                  {/* Chat Room Top Bar */}
                  <div className="bg-white px-3 py-2 border-b border-slate-200 flex items-center justify-between shrink-0 shadow-2xs">
                    <div className="flex items-center space-x-2.5">
                      <button
                        type="button"
                        onClick={() => setActiveChatChannelId(null)}
                        className="p-1 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition"
                        title="Kembali ke Daftar Saluran"
                      >
                        <i className="fa-solid fa-arrow-left text-sm"></i>
                      </button>

                      <div className="w-8 h-8 rounded-full bg-hajj-100 text-hajj-800 flex items-center justify-center font-bold text-xs border border-hajj-200">
                        {activeChannel?.type === 'DIRECT' ? (
                          activeDirectPartner ? activeDirectPartner.fullName.charAt(0).toUpperCase() : 'U'
                        ) : (
                          <i className={`fa-solid ${activeChannel?.icon || 'fa-users'}`}></i>
                        )}
                      </div>

                      <div>
                        <h4 className="font-bold text-xs text-slate-900 leading-tight">
                          {activeChannel?.name}
                        </h4>
                        <span className="text-[10px] text-slate-500">
                          {activeChannel?.type === 'DIRECT' 
                            ? (activeDirectPartner && isUserOnline(activeDirectPartner.id) ? '● Online' : 'Offline') 
                            : `${activeGroupMembers.length} Anggota`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1">
                      {activeChannel?.type === 'GROUP' && (
                        <button
                          type="button"
                          onClick={() => setShowGroupInfoModal(true)}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition flex items-center space-x-1"
                        >
                          <i className="fa-solid fa-users"></i>
                          <span>{activeGroupOnlineMembers.length} Online</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowClearConfirmModal(true)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg text-xs"
                        title="Bersihkan Riwayat Pesan"
                      >
                        <i className="fa-solid fa-trash-can"></i>
                      </button>
                    </div>
                  </div>

                  {/* Message History List */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
                    {channelMessages.length === 0 ? (
                      <div className="text-center py-12 text-slate-400 space-y-2">
                        <i className="fa-solid fa-comments text-3xl text-slate-300"></i>
                        <p className="text-xs">Belum ada pesan dalam saluran ini. Mulai koordinasi sekarang.</p>
                      </div>
                    ) : (
                      channelMessages.map(msg => {
                        const isMe = msg.senderId === currentUser.id;

                        return (
                          <div 
                            key={msg.id}
                            className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                          >
                            <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 mb-0.5 px-1">
                              <span className="font-bold text-slate-700">{msg.senderName}</span>
                              <span>•</span>
                              <span>{msg.timestamp}</span>
                              {msg.isUrgent && (
                                <span className="px-1.5 py-0.2 bg-red-100 text-red-700 font-bold rounded">
                                  URGENT
                                </span>
                              )}
                              {msg.isInstruction && (
                                <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 font-bold rounded">
                                  ★ Arahan Pimpinan
                                </span>
                              )}
                            </div>

                            <div className={`p-3 rounded-2xl max-w-[85%] text-xs shadow-2xs ${
                              isMe 
                                ? 'bg-hajj-700 text-white rounded-tr-none' 
                                : msg.isInstruction 
                                ? 'bg-amber-50 text-slate-900 border border-amber-300 rounded-tl-none font-medium'
                                : msg.isUrgent 
                                ? 'bg-red-50 text-slate-900 border border-red-300 rounded-tl-none font-medium'
                                : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                            }`}>
                              <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Message Input Form */}
                  <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-200 space-y-2 shrink-0">
                    {isCurrentUserManager && (
                      <div className="flex items-center space-x-3 text-[11px] px-1">
                        <label className="flex items-center space-x-1.5 text-slate-700 font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isOfficialInstruction}
                            onChange={(e) => setIsOfficialInstruction(e.target.checked)}
                            className="rounded text-hajj-700 focus:ring-hajj-600"
                          />
                          <span>Jadikan Arahan Resmi Pimpinan</span>
                        </label>
                        <label className="flex items-center space-x-1.5 text-red-700 font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isUrgent}
                            onChange={(e) => setIsUrgent(e.target.checked)}
                            className="rounded text-red-600 focus:ring-red-500"
                          />
                          <span>Tandai Darurat (Urgent)</span>
                        </label>
                      </div>
                    )}

                    <div className="flex items-center space-x-2">
                      <input
                        ref={inputRef}
                        type="text"
                        placeholder="Ketik pesan atau instruksi operasional..."
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        className="flex-1 px-3.5 py-2 bg-slate-100 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-hajj-600 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={!messageInput.trim()}
                        className="px-4 py-2 bg-hajj-700 hover:bg-hajj-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow transition flex items-center justify-center cursor-pointer"
                      >
                        <i className="fa-solid fa-paper-plane"></i>
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                /* Channel List View */
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                  <div className="p-3 bg-white border-b border-slate-200 space-y-2.5 shrink-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-xs">Saluran Koordinasi Petugas</span>
                      <button
                        type="button"
                        onClick={() => setIsNewChatModalOpen(true)}
                        className="px-2.5 py-1 bg-hajj-700 hover:bg-hajj-800 text-white text-[11px] font-bold rounded-lg shadow-2xs transition flex items-center space-x-1 cursor-pointer"
                      >
                        <i className="fa-solid fa-plus text-[10px]"></i>
                        <span>Chat Pribadi</span>
                      </button>
                    </div>

                    <div className="flex items-center space-x-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          placeholder="Cari saluran atau rekan..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 bg-slate-100 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-hajj-600 focus:outline-none"
                        />
                        <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-2.5 text-slate-400 text-xs"></i>
                      </div>

                      <select
                        value={chatSubFilter}
                        onChange={(e: any) => setChatSubFilter(e.target.value)}
                        aria-label="Filter jenis saluran"
                        className="px-2 py-1.5 bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
                      >
                        <option value="ALL">Semua</option>
                        <option value="GROUP">Grup Divisi</option>
                        <option value="DIRECT">Pribadi</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                    {filteredChannels.length === 0 ? (
                      <div className="text-center py-10 text-slate-400 text-xs">
                        Tidak ada saluran yang ditemukan.
                      </div>
                    ) : (
                      filteredChannels.map(channel => {
                        const unread = getChannelUnread(channel.id);
                        const partner = channel.type === 'DIRECT' ? getDirectChatPartner(channel) : undefined;
                        const online = partner ? isUserOnline(partner.id) : false;

                        return (
                          <button
                            key={channel.id}
                            type="button"
                            onClick={() => openChat(channel.id)}
                            className="w-full text-left p-3 bg-white hover:bg-hajj-50/50 border border-slate-200 rounded-xl transition flex items-center justify-between group cursor-pointer shadow-2xs"
                          >
                            <div className="flex items-center space-x-3 min-w-0">
                              <div className="relative shrink-0">
                                <div className="w-10 h-10 rounded-xl bg-hajj-100 text-hajj-800 flex items-center justify-center font-bold text-sm border border-hajj-200">
                                  {channel.type === 'DIRECT' ? (
                                    partner ? partner.fullName.charAt(0).toUpperCase() : 'U'
                                  ) : (
                                    <i className={`fa-solid ${channel.icon || 'fa-users'}`}></i>
                                  )}
                                </div>
                                {channel.type === 'DIRECT' && (
                                  <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white ${online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-900 text-xs group-hover:text-hajj-700 truncate">
                                    {channel.name}
                                  </span>
                                  {channel.lastMessageTime && (
                                    <span className="text-[10px] text-slate-400">{channel.lastMessageTime}</span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                  {channel.lastMessage || 'Belum ada pesan'}
                                </p>
                              </div>
                            </div>

                            {unread > 0 && (
                              <span className="ml-2 bg-red-500 text-white font-bold px-2 py-0.5 rounded-full text-[10px] shrink-0">
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

      {/* ================= MODAL: NEW DIRECT CHAT ================= */}
      {isNewChatModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 flex flex-col max-h-[80vh]">
            <div className="p-3.5 bg-hajj-800 text-white flex items-center justify-between border-b border-gold-500/25">
              <div className="flex items-center space-x-2">
                <i className="fa-solid fa-comments text-gold-400 text-base"></i>
                <div>
                  <h4 className="font-bold text-xs text-white">Mulai Diskusi Pribadi</h4>
                  <p className="text-[10px] text-slate-300">Pilih rekan kerja untuk dikoordinasikan</p>
                </div>
              </div>
              <button onClick={() => setIsNewChatModalOpen(false)} className="text-slate-300 hover:text-white p-1 rounded-lg">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="p-3 overflow-y-auto custom-scrollbar flex-1 space-y-1.5">
              {users
                .filter(u => u.id !== currentUser.id)
                .map(u => {
                  const online = isUserOnline(u.id);

                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleStartDirectChat(u)}
                      className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:bg-hajj-50 hover:border-hajj-300 transition flex items-center justify-between text-xs cursor-pointer group"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="relative shrink-0">
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-800 flex items-center justify-center font-bold text-xs">
                            {u.fullName.charAt(0).toUpperCase()}
                          </div>
                          <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white ${online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 block group-hover:text-hajj-700 truncate">{u.fullName}</span>
                          <span className="text-[10px] text-slate-500 block truncate">{u.role} • {u.department || 'Operasional'}</span>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold ${online ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {online ? '● Online' : 'Offline'}
                      </span>
                    </button>
                  );
                })}
            </div>

            <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-right">
              <button
                type="button"
                onClick={() => setIsNewChatModalOpen(false)}
                className="px-3 py-1 text-slate-600 hover:text-slate-900 text-xs font-bold"
              >
                Batal
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
              Semua pesan dalam saluran <strong>"{activeChannel.name}"</strong> akan dihapus dari riwayat sesi lokal.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowClearConfirmModal(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold"
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
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs"
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
