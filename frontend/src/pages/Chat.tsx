import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { createSocket } from "../socket";
import type { Chat, Message } from "../types";

export default function ChatPage() {
  const { token, logout, user } = useAuth();

  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState<string>("");

  /* =======================
     Socket instance
  ======================= */
  const socket = useMemo(() => {
    if (!token) return null;
    return createSocket(token);
  }, [token]);

  /* =======================
     Load chats (SAFE)
  ======================= */
  useEffect(() => {
    let active = true;

    async function fetchChats() {
      try {
        const res = await api.get<Chat[]>("/api/chats");
        if (active) setChats(res.data);
      } catch (err) {
        console.error("Failed to load chats", err);
      }
    }

    fetchChats();

    return () => {
      active = false;
    };
  }, []);

  /* =======================
     Load messages
  ======================= */
  async function loadMessages(id: string) {
    try {
      const res = await api.get<Message[]>(`/api/chats/${id}/messages`);
      setMessages(res.data);
    } catch (err) {
      console.error("Failed to load messages", err);
    }
  }

  /* =======================
     Send message
  ======================= */
  async function sendMessage() {
    if (!chatId || !text.trim()) return;

    try {
      await api.post("/api/chats/message", {
        chatId,
        text,
      });
      setText("");
    } catch (err) {
      console.error("Failed to send message", err);
    }
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

      <div style={{ display: "flex", gap: 16 }}>
        {/* Chat list */}
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
                <b>{chat._id}</b>
              </div>
              <div>
                <i>{chat.lastMessage?.text || "No messages yet"}</i>
              </div>
            </div>
          ))}
        </div>

        {/* Messages */}
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
            />
            <button onClick={sendMessage}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}
