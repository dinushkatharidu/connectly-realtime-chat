import { useEffect, useMemo, useState } from "react";
import { api, setAuthToken } from "../api";
import { createSocket } from "../socket";

/* =======================
   Types (NO any)
======================= */

type User = {
  _id: string;
  name: string;
  email: string;
};

type Chat = {
  _id: string;
  members: User[];
  lastMessage?: Message;
};

type Message = {
  _id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: string;
};

/* =======================
   Component
======================= */

export default function ChatPage() {
  const [token, setToken] = useState<string>(
    localStorage.getItem("token") || ""
  );

  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState<string>("");

  /* =======================
     Socket
  ======================= */

  const socket = useMemo(() => {
    if (!token) return null;
    return createSocket(token);
  }, [token]);

  /* =======================
     Auth token setup
  ======================= */

  useEffect(() => {
    if (!token) return;
    setAuthToken(token);
    localStorage.setItem("token", token);
  }, [token]);

  /* =======================
     API calls
  ======================= */

  async function loadChats() {
    const res = await api.get<Chat[]>("/api/chats");
    setChats(res.data);
  }

  async function loadMessages(id: string) {
    const res = await api.get<Message[]>(`/api/chats/${id}/messages`);
    setMessages(res.data);
  }

  async function sendMessage() {
    if (!chatId || !text.trim()) return;

    await api.post("/api/chats/message", {
      chatId,
      text,
    });

    setText("");
  }

  /* =======================
     Socket listeners
  ======================= */

  useEffect(() => {
    if (!socket) return;

    socket.on("connect", () => {
      console.log("✅ socket connected:", socket.id);
    });

    socket.on("new_message", (msg: Message) => {
      if (msg.chatId === chatId) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    socket.on("typing", (data: { userId: string; isTyping: boolean }) => {
      console.log("typing:", data);
    });

    return () => {
      socket.disconnect();
    };
  }, [socket, chatId]);

  /* =======================
     Join chat room
  ======================= */

  useEffect(() => {
    if (!socket || !chatId) return;
    socket.emit("join_chat", chatId);
  }, [socket, chatId]);

  /* =======================
     UI
  ======================= */

  return (
    <div style={{ padding: 16, fontFamily: "sans-serif" }}>
      <h2>Connectly – Realtime Chat</h2>

      {/* TOKEN INPUT (TEMP) */}
      <div style={{ marginBottom: 12 }}>
        <label>JWT Token</label>
        <textarea
          rows={3}
          style={{ width: "100%" }}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste JWT token here"
        />
        <button onClick={loadChats} style={{ marginTop: 8 }}>
          Load My Chats
        </button>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* CHAT LIST */}
        <div style={{ width: 320 }}>
          <h3>Chats</h3>
          {chats.map((chat) => (
            <div
              key={chat._id}
              onClick={() => {
                setChatId(chat._id);
                loadMessages(chat._id);
              }}
              style={{
                border: "1px solid #ccc",
                padding: 10,
                marginBottom: 8,
                cursor: "pointer",
                background: chatId === chat._id ? "#eef" : "#fff",
              }}
            >
              <div>
                <b>Chat ID:</b> {chat._id}
              </div>
              <div>
                <i>{chat.lastMessage?.text || "No messages yet"}</i>
              </div>
            </div>
          ))}
        </div>

        {/* MESSAGE AREA */}
        <div style={{ flex: 1 }}>
          <h3>Messages</h3>

          <div
            style={{
              border: "1px solid #ccc",
              padding: 12,
              height: 320,
              overflowY: "auto",
            }}
          >
            {messages.map((m) => (
              <div
                key={m._id}
                style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}
              >
                <b>{m.senderId}</b>: {m.text}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type message..."
              style={{ flex: 1, padding: 8 }}
              onFocus={() => socket?.emit("typing", { chatId, isTyping: true })}
              onBlur={() => socket?.emit("typing", { chatId, isTyping: false })}
            />
            <button onClick={sendMessage}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}
