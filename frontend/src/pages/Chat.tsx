import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { createSocket } from "../socket";
import type { Chat, Message, UserLite } from "../types";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatPage() {
  const { token, logout, user } = useAuth();

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState<string>("");

  // presence
  const [onlineIds, setOnlineIds] = useState<Set<string>>(() => new Set());

  // new chat search
  const [searchEmail, setSearchEmail] = useState<string>("");
  const [searchResults, setSearchResults] = useState<UserLite[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // typing indicator
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(
    () => new Set()
  );

  const typingTimeoutRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const socket = useMemo(() => {
    if (!token) return null;
    return createSocket(token);
  }, [token]);

  const getPartner = useCallback(
    (chat: Chat) => {
      const me = user?.id;
      return chat.members.find((m) => m._id !== me) || null;
    },
    [user?.id]
  );

  const refreshChats = useCallback(async () => {
    const res = await api.get<Chat[]>("/api/chats");
    setChats(res.data);
    if (!activeChatId && res.data.length > 0) setActiveChatId(res.data[0]._id);
  }, [activeChatId]);

  const loadMessages = useCallback(async (chatId: string) => {
    const res = await api.get<Message[]>(`/api/chats/${chatId}/messages`);
    setMessages(res.data);
  }, []);

  const sendMessage = useCallback(async () => {
    if (!activeChatId || !text.trim()) return;
    await api.post("/api/chats/message", {
      chatId: activeChatId,
      text: text.trim(),
    });
    setText("");
    socket?.emit("typing", { chatId: activeChatId, isTyping: false });
  }, [activeChatId, text, socket]);

  const searchUsers = useCallback(async () => {
    setSearchError(null);
    setSearchResults([]);

    const q = searchEmail.trim();
    if (!q) {
      setSearchError("Type an email (or part of email) to search");
      return;
    }

    try {
      const res = await api.get<UserLite[]>(
        `/api/users/search?email=${encodeURIComponent(q)}`
      );
      setSearchResults(res.data);
      if (res.data.length === 0) setSearchError("No users found");
    } catch {
      setSearchError("Search failed");
    }
  }, [searchEmail]);

  const startChatWith = useCallback(
    async (otherUserId: string) => {
      const res = await api.post<Chat>("/api/chats", { otherUserId });
      const newChat = res.data;

      await refreshChats();
      setActiveChatId(newChat._id);
      await loadMessages(newChat._id);

      socket?.emit("join_chat", newChat._id);
      socket?.emit("chat:seen", { chatId: newChat._id });

      setSearchResults([]);
      setSearchEmail("");
      setSearchError(null);
    },
    [refreshChats, loadMessages, socket]
  );

  // Initial chats
  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const res = await api.get<Chat[]>("/api/chats");
        if (!active) return;
        setChats(res.data);
        if (res.data.length > 0) setActiveChatId(res.data[0]._id);
      } catch (e) {
        console.error(e);
      }
    }
    init();
    return () => {
      active = false;
    };
  }, []);

  // On active chat change: load + join + mark seen
  useEffect(() => {
    if (!activeChatId) return;

    let active = true;
    async function onChatChange() {
      if (!active) return;
      setTypingUserIds(new Set());
      await loadMessages(activeChatId);
      socket?.emit("join_chat", activeChatId);
      socket?.emit("chat:seen", { chatId: activeChatId });
    }
    onChatChange();
    return () => {
      active = false;
    };
  }, [activeChatId, loadMessages, socket]);

  // Socket listeners (presence + messages + typing + seen)
  useEffect(() => {
    if (!socket) return;

    const onPresence = (ids: string[]) => {
      setOnlineIds(new Set(ids));
    };

    const onNewMessage = (msg: Message) => {
      if (msg.chatId === activeChatId) {
        setMessages((prev) => [...prev, msg]);
        socket.emit("chat:seen", { chatId: activeChatId });
      }
      refreshChats().catch(() => {});
    };

    const onTyping = (data: { userId: string; isTyping: boolean }) => {
      if (data.userId === user?.id) return;
      setTypingUserIds((prev) => {
        const next = new Set(prev);
        if (data.isTyping) next.add(data.userId);
        else next.delete(data.userId);
        return next;
      });
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const onSeen = (_data: { chatId: string; userId: string }) => {
      // For now we just refresh chats/messages to reflect seenBy updates if needed
      // (simple approach)
      refreshChats().catch(() => {});
    };

    socket.on("presence:list", onPresence);
    socket.on("new_message", onNewMessage);
    socket.on("typing", onTyping);
    socket.on("chat:seen", onSeen);

    return () => {
      socket.off("presence:list", onPresence);
      socket.off("new_message", onNewMessage);
      socket.off("typing", onTyping);
      socket.off("chat:seen", onSeen);
      socket.disconnect();
    };
  }, [socket, activeChatId, refreshChats, user?.id]);

  // Scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleTextChange = useCallback(
    (v: string) => {
      setText(v);
      if (!socket || !activeChatId) return;

      socket.emit("typing", { chatId: activeChatId, isTyping: true });

      if (typingTimeoutRef.current)
        window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = window.setTimeout(() => {
        socket.emit("typing", { chatId: activeChatId, isTyping: false });
      }, 700);
    },
    [socket, activeChatId]
  );

  const activeChat = chats.find((c) => c._id === activeChatId);
  const partner = activeChat ? getPartner(activeChat) : null;
  const partnerOnline = partner ? onlineIds.has(partner._id) : false;

  return (
    <div style={{ padding: 16, fontFamily: "sans-serif" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div>
          <b>Logged in:</b> {user?.name} ({user?.email})
        </div>
        <button onClick={logout}>Logout</button>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16 }}
      >
        {/* Sidebar */}
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Chats</h3>

          <button onClick={() => refreshChats()} style={{ marginBottom: 10 }}>
            Refresh
          </button>

          {/* New Chat */}
          <div
            style={{
              borderTop: "1px solid #eee",
              paddingTop: 10,
              marginTop: 10,
            }}
          >
            <h4 style={{ margin: "6px 0" }}>Start New Chat</h4>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                placeholder="Search by email..."
                style={{ flex: 1, padding: 8 }}
              />
              <button onClick={() => searchUsers()}>Search</button>
            </div>

            {searchError && (
              <div style={{ color: "crimson", marginTop: 6 }}>
                {searchError}
              </div>
            )}

            {searchResults.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {searchResults.map((u) => (
                  <div
                    key={u._id}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 8,
                      padding: 10,
                      marginBottom: 8,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{u.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        {u.email}
                      </div>
                    </div>
                    <button onClick={() => startChatWith(u._id)}>Chat</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chat List */}
          <div style={{ marginTop: 14 }}>
            {chats.map((chat) => {
              const p = getPartner(chat);
              const isSelected = chat._id === activeChatId;
              const isOnline = p ? onlineIds.has(p._id) : false;

              return (
                <div
                  key={chat._id}
                  onClick={() => setActiveChatId(chat._id)}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 10,
                    cursor: "pointer",
                    background: isSelected ? "#eef" : "#fff",
                  }}
                >
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <div style={{ fontWeight: 700 }}>
                      {p?.name || "Unknown"}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: isOnline ? "green" : "#999",
                      }}
                    >
                      {isOnline ? "Online" : "Offline"}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {p?.email || ""}
                  </div>
                  <div style={{ marginTop: 6, fontStyle: "italic" }}>
                    {chat.lastMessage?.text || "No messages yet"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chat window */}
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>
                {partner ? partner.name : "Select a chat"}
              </h3>
              {partner && (
                <div
                  style={{
                    fontSize: 12,
                    color: partnerOnline ? "green" : "#999",
                  }}
                >
                  {partnerOnline ? "Online" : "Offline"}
                </div>
              )}
              {typingUserIds.size > 0 && (
                <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
                  typing...
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              marginTop: 12,
              border: "1px solid #eee",
              borderRadius: 10,
              padding: 12,
              height: 420,
              overflowY: "auto",
              background: "#fafafa",
            }}
          >
            {messages.map((m) => {
              const isMe = m.senderId === user?.id;
              return (
                <div
                  key={m._id}
                  style={{
                    display: "flex",
                    justifyContent: isMe ? "flex-end" : "flex-start",
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      maxWidth: "70%",
                      background: isMe ? "#d9fdd3" : "#fff",
                      border: "1px solid #e5e5e5",
                      borderRadius: 14,
                      padding: "10px 12px",
                    }}
                  >
                    <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.7,
                        marginTop: 6,
                        textAlign: "right",
                      }}
                    >
                      {formatTime(m.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={
                activeChatId ? "Type a message..." : "Select a chat first"
              }
              style={{ flex: 1, padding: 10 }}
              disabled={!activeChatId}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!activeChatId || !text.trim()}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
