import { useEffect, useMemo, useRef, useState } from "react";
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

  // New chat search
  const [searchEmail, setSearchEmail] = useState<string>("");
  const [searchResults, setSearchResults] = useState<UserLite[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Typing indicator state (other users typing in this chat)
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(new Set());

  const typingTimeoutRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const socket = useMemo(() => {
    if (!token) return null;
    return createSocket(token);
  }, [token]);

  function getPartnerName(chat: Chat): string {
    const me = user?.id;
    const partner = chat.members.find((m) => m._id !== me);
    return partner ? partner.name : "Unknown";
  }

  function getPartnerEmail(chat: Chat): string {
    const me = user?.id;
    const partner = chat.members.find((m) => m._id !== me);
    return partner ? partner.email : "";
  }

  async function refreshChats() {
    const res = await api.get<Chat[]>("/api/chats");
    setChats(res.data);

    // If no active chat, auto-select first
    if (!activeChatId && res.data.length > 0) {
      setActiveChatId(res.data[0]._id);
    }
  }

  async function loadMessages(chatId: string) {
    const res = await api.get<Message[]>(`/api/chats/${chatId}/messages`);
    setMessages(res.data);
  }

  async function sendMessage() {
    if (!activeChatId || !text.trim()) return;
    await api.post("/api/chats/message", {
      chatId: activeChatId,
      text: text.trim(),
    });
    setText("");
    // stop typing after sending
    socket?.emit("typing", { chatId: activeChatId, isTyping: false });
  }

  async function searchUsers() {
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
    } catch (e: any) {
      setSearchError(e?.response?.data?.message || "Search failed");
    }
  }

  async function startChatWith(otherUserId: string) {
    const res = await api.post<Chat>("/api/chats", { otherUserId });
    const newChat = res.data;

    await refreshChats();
    setActiveChatId(newChat._id);
    await loadMessages(newChat._id);

    // Join room immediately
    socket?.emit("join_chat", newChat._id);

    // clear search UI
    setSearchResults([]);
    setSearchEmail("");
    setSearchError(null);
  }

  // Initial load chats
  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const res = await api.get<Chat[]>("/api/chats");
        if (!active) return;
        setChats(res.data);
        if (res.data.length > 0) setActiveChatId(res.data[0]._id);
      } catch (err) {
        console.error("Failed to load chats", err);
      }
    }

    init();

    return () => {
      active = false;
    };
  }, []);

  // When active chat changes: load messages + join socket room + clear typing
  useEffect(() => {
    if (!activeChatId) return;

    setTypingUserIds(new Set());
    loadMessages(activeChatId);

    if (socket) socket.emit("join_chat", activeChatId);
  }, [activeChatId, socket]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    socket.on("connect", () => {
      console.log("✅ socket connected:", socket.id);
    });

    socket.on("new_message", (msg: Message) => {
      // Only append if message belongs to current chat
      if (msg.chatId === activeChatId) {
        setMessages((prev) => [...prev, msg]);
      }

      // refresh chat list so lastMessage updates
      refreshChats().catch(() => {});
    });

    socket.on("typing", (data: { userId: string; isTyping: boolean }) => {
      // ignore my own typing
      if (data.userId === user?.id) return;

      setTypingUserIds((prev) => {
        const next = new Set(prev);
        if (data.isTyping) next.add(data.userId);
        else next.delete(data.userId);
        return next;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [socket, activeChatId, user?.id]);

  // Auto scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle typing emit (debounced)
  function handleTextChange(v: string) {
    setText(v);

    if (!socket || !activeChatId) return;

    // tell others: typing true
    socket.emit("typing", { chatId: activeChatId, isTyping: true });

    // reset timer
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      socket.emit("typing", { chatId: activeChatId, isTyping: false });
    }, 700);
  }

  const activeChat = chats.find((c) => c._id === activeChatId);

  return (
    <div style={{ padding: 16, fontFamily: "sans-serif" }}>
      {/* Top Bar */}
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
        {/* Left Sidebar */}
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Chats</h3>

          <button onClick={refreshChats} style={{ marginBottom: 10 }}>
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
              <button onClick={searchUsers}>Search</button>
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
              const selected = chat._id === activeChatId;
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
                    background: selected ? "#eef" : "#fff",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{getPartnerName(chat)}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {getPartnerEmail(chat)}
                  </div>
                  <div style={{ marginTop: 6, fontStyle: "italic" }}>
                    {chat.lastMessage?.text || "No messages yet"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chat Window */}
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
                {activeChat ? getPartnerName(activeChat) : "Select a chat"}
              </h3>
              {typingUserIds.size > 0 && (
                <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
                  typing...
                </div>
              )}
            </div>
          </div>

          {/* Messages */}
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

          {/* Composer */}
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
              onClick={sendMessage}
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
