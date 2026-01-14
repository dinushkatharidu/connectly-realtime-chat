import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { createSocket } from "../socket";
import type { Attachment, Chat, Message, UserLite } from "../types";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const same =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (same) return "Today";
  return d.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function bytesToSize(bytes: number) {
  if (!bytes) return "";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    sizes.length - 1
  );
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

export default function ChatPage() {
  const { token, logout, user } = useAuth();

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState<string>("");

  const [onlineIds, setOnlineIds] = useState<Set<string>>(() => new Set());

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchEmail, setSearchEmail] = useState("");
  const [searchResults, setSearchResults] = useState<UserLite[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(
    () => new Set()
  );
  const typingTimeoutRef = useRef<number | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  // ✅ file upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

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

  // ✅ upload helper
  const uploadSingle = useCallback(async (file: File) => {
    const form = new FormData();
    form.append("file", file);

    const res = await api.post<Attachment>("/api/upload/single", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    return res.data;
  }, []);

  // ✅ send message (text + attachment)
  const sendMessage = useCallback(async () => {
    if (!activeChatId) return;
    if (!text.trim() && !selectedFile) return;

    try {
      let attachments: Attachment[] = [];

      if (selectedFile) {
        setUploading(true);
        const uploaded = await uploadSingle(selectedFile);
        attachments = [uploaded];
        setSelectedFile(null);
        setUploading(false);
      }

      const res = await api.post<Message>("/api/chats/message", {
        chatId: activeChatId,
        text: text.trim(),
        attachments,
      });

      // ✅ optimistic add + dedupe
      setMessages((prev) => {
        const exists = prev.some((m) => m._id === res.data._id);
        return exists ? prev : [...prev, res.data];
      });

      setText("");
      refreshChats().catch(() => {});
      socket?.emit("typing", { chatId: activeChatId, isTyping: false });
    } catch (e) {
      console.error("sendMessage failed", e);
      setUploading(false);
    }
  }, [activeChatId, text, selectedFile, uploadSingle, refreshChats, socket]);

  const searchUsers = useCallback(async () => {
    setSearchError(null);
    setSearchResults([]);

    const q = searchEmail.trim();
    if (!q) {
      setSearchError("Type an email (or part of email)");
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

      setSearchEmail("");
      setSearchResults([]);
      setSearchError(null);
      setSearchOpen(false);
    },
    [refreshChats, loadMessages, socket]
  );

  // initial load
  useEffect(() => {
    let alive = true;

    async function init() {
      try {
        const res = await api.get<Chat[]>("/api/chats");
        if (!alive) return;
        setChats(res.data);
        if (res.data.length > 0) setActiveChatId(res.data[0]._id);
      } catch (e) {
        console.error(e);
      }
    }

    init();
    return () => {
      alive = false;
    };
  }, []);

  // on active chat change
  useEffect(() => {
    if (!activeChatId) return;

    let alive = true;

    async function onChatChange() {
      if (!alive) return;

      setTypingUserIds(new Set());
      await loadMessages(activeChatId);

      socket?.emit("join_chat", activeChatId);
      socket?.emit("chat:seen", { chatId: activeChatId });
    }

    onChatChange();

    return () => {
      alive = false;
    };
  }, [activeChatId, loadMessages, socket]);

  // socket listeners
  useEffect(() => {
    if (!socket) return;

    const onPresence = (ids: string[]) => setOnlineIds(new Set(ids));

    const onNewMessage = (msg: Message) => {
      if (msg.chatId === activeChatId) {
        setMessages((prev) => {
          const exists = prev.some((m) => m._id === msg._id);
          if (exists) return prev;
          return [...prev, msg];
        });
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

    socket.on("presence:list", onPresence);
    socket.on("new_message", onNewMessage);
    socket.on("typing", onTyping);

    return () => {
      socket.off("presence:list", onPresence);
      socket.off("new_message", onNewMessage);
      socket.off("typing", onTyping);
    };
  }, [socket, activeChatId, refreshChats, user?.id]);

  // scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // typing debounce
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

  // group by date
  const grouped: Array<{ label: string; items: Message[] }> = [];
  for (const m of messages) {
    const label = dayLabel(m.createdAt);
    const last = grouped[grouped.length - 1];
    if (!last || last.label !== label) grouped.push({ label, items: [m] });
    else last.items.push(m);
  }

  return (
    <div className="h-full bg-slate-100 overflow-hidden">
      <div className="mx-auto h-full max-w-6xl p-3 md:p-4">
        <div className="h-full overflow-hidden rounded-2xl bg-white shadow-lg flex flex-col">
          {/* top bar */}
          <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-600 text-white font-semibold">
                {user?.name?.slice(0, 1)?.toUpperCase() || "U"}
              </div>
              <div className="leading-tight min-w-0">
                <div className="font-semibold text-slate-900 truncate">
                  {user?.name}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {user?.email}
                </div>
              </div>
            </div>

            <button
              onClick={logout}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Logout
            </button>
          </div>

          {/* main */}
          <div className="grid grid-cols-12 flex-1 min-h-0">
            {/* sidebar */}
            <div className="col-span-12 border-r md:col-span-4 flex flex-col min-h-0">
              <div className="flex items-center justify-between px-4 py-3 shrink-0">
                <div className="text-sm font-semibold text-slate-900">
                  Chats
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => refreshChats()}
                    className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={() => setSearchOpen((v) => !v)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    New
                  </button>
                </div>
              </div>

              {searchOpen && (
                <div className="mx-4 mb-3 rounded-xl border bg-slate-50 p-3 shrink-0">
                  <div className="mb-2 text-xs font-semibold text-slate-600">
                    Start a new chat
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={searchEmail}
                      onChange={(e) => setSearchEmail(e.target.value)}
                      placeholder="Search by email…"
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={() => searchUsers()}
                      className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                    >
                      Search
                    </button>
                  </div>

                  {searchError && (
                    <div className="mt-2 text-sm text-red-600">
                      {searchError}
                    </div>
                  )}

                  {searchResults.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {searchResults.map((u) => (
                        <div
                          key={u._id}
                          className="flex items-center justify-between rounded-lg border bg-white p-3"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-900">
                              {u.name}
                            </div>
                            <div className="truncate text-xs text-slate-500">
                              {u.email}
                            </div>
                          </div>
                          <button
                            onClick={() => startChatWith(u._id)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                          >
                            Chat
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
                {chats.length === 0 && (
                  <div className="px-4 py-8 text-sm text-slate-500">
                    No chats yet. Click <b>New</b> to start.
                  </div>
                )}

                {chats.map((chat) => {
                  const p = getPartner(chat);
                  const selected = chat._id === activeChatId;
                  const isOnline = p ? onlineIds.has(p._id) : false;

                  return (
                    <button
                      key={chat._id}
                      onClick={() => setActiveChatId(chat._id)}
                      className={[
                        "mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-slate-50",
                        selected
                          ? "bg-emerald-50 ring-1 ring-emerald-200"
                          : "bg-white",
                      ].join(" ")}
                    >
                      <div className="relative">
                        <div className="grid h-11 w-11 place-items-center rounded-full bg-slate-200 text-slate-700 font-semibold">
                          {(p?.name?.[0] || "?").toUpperCase()}
                        </div>
                        <span
                          className={[
                            "absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-white",
                            isOnline ? "bg-emerald-500" : "bg-slate-400",
                          ].join(" ")}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate font-semibold text-slate-900">
                            {p?.name || "Unknown"}
                          </div>
                          <div className="text-xs text-slate-500">
                            {isOnline ? "Online" : "Offline"}
                          </div>
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {p?.email || ""}
                        </div>
                        <div className="truncate text-sm text-slate-600">
                          {chat.lastMessage?.text || "No messages yet"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* chat area */}
            <div className="col-span-12 md:col-span-8 flex flex-col min-h-0">
              <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-200 text-slate-700 font-semibold">
                    {(partner?.name?.[0] || "C").toUpperCase()}
                  </div>
                  <div className="leading-tight min-w-0">
                    <div className="font-semibold text-slate-900 truncate">
                      {partner ? partner.name : "Select a chat"}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {partner ? (partnerOnline ? "Online" : "Offline") : "—"}
                      {typingUserIds.size > 0 ? " • typing…" : ""}
                    </div>
                  </div>
                </div>
              </div>

              {/* messages */}
              <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50 p-4">
                {!activeChatId ? (
                  <div className="grid h-full place-items-center text-slate-500">
                    Select a chat from the left
                  </div>
                ) : (
                  <div className="space-y-4">
                    {grouped.map((g) => (
                      <div key={g.label}>
                        <div className="mx-auto mb-3 w-fit rounded-full bg-white px-3 py-1 text-xs text-slate-500 shadow-sm">
                          {g.label}
                        </div>

                        <div className="space-y-2">
                          {g.items.map((m) => {
                            const isMe = m.senderId === user?.id;
                            return (
                              <div
                                key={m._id}
                                className={[
                                  "flex",
                                  isMe ? "justify-end" : "justify-start",
                                ].join(" ")}
                              >
                                <div
                                  className={[
                                    "max-w-[78%] rounded-2xl px-4 py-2 shadow-sm",
                                    isMe
                                      ? "bg-emerald-600 text-white rounded-br-md"
                                      : "bg-white text-slate-900 rounded-bl-md",
                                  ].join(" ")}
                                >
                                  {m.text && (
                                    <div className="whitespace-pre-wrap text-sm">
                                      {m.text}
                                    </div>
                                  )}

                                  {/* attachments */}
                                  {m.attachments?.map((a) => {
                                    const fullUrl = `http://localhost:5000${a.url}`;
                                    const isImage = a.type.startsWith("image/");
                                    return (
                                      <div key={a.url} className="mt-2">
                                        {isImage ? (
                                          <a
                                            href={fullUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            <img
                                              src={fullUrl}
                                              alt={a.name}
                                              className="max-h-56 rounded-xl border"
                                            />
                                          </a>
                                        ) : (
                                          <a
                                            href={fullUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className={[
                                              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                                              isMe
                                                ? "border-emerald-200 bg-emerald-700/20 text-emerald-50"
                                                : "border-slate-200 bg-slate-50 text-slate-700",
                                            ].join(" ")}
                                          >
                                            <span>📄</span>
                                            <span className="truncate max-w-[220px]">
                                              {a.name}
                                            </span>
                                            <span className="text-xs opacity-70">
                                              {bytesToSize(a.size)}
                                            </span>
                                          </a>
                                        )}
                                      </div>
                                    );
                                  })}

                                  <div
                                    className={[
                                      "mt-1 text-right text-[11px]",
                                      isMe
                                        ? "text-emerald-100"
                                        : "text-slate-400",
                                    ].join(" ")}
                                  >
                                    {formatTime(m.createdAt)}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div ref={bottomRef} />
                  </div>
                )}
              </div>

              {/* composer (📎 is here) */}
              <div className="border-t bg-white p-3 shrink-0">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    id="filePicker"
                    className="hidden"
                    onChange={(e) =>
                      setSelectedFile(e.target.files?.[0] ?? null)
                    }
                  />

                  <label
                    htmlFor="filePicker"
                    className="cursor-pointer rounded-xl border px-3 py-3 text-sm hover:bg-slate-50 select-none"
                    title="Attach file"
                  >
                    📎
                  </label>

                  <input
                    value={text}
                    onChange={(e) => handleTextChange(e.target.value)}
                    disabled={!activeChatId || uploading}
                    placeholder={
                      activeChatId ? "Type a message…" : "Select a chat first"
                    }
                    className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-emerald-500 disabled:bg-slate-100"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") sendMessage();
                    }}
                  />

                  <button
                    onClick={() => sendMessage()}
                    disabled={
                      !activeChatId ||
                      uploading ||
                      (!text.trim() && !selectedFile)
                    }
                    className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {uploading ? "Uploading..." : "Send"}
                  </button>
                </div>

                {selectedFile && (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                    <div className="min-w-0 text-xs text-slate-600 truncate">
                      Attached: <b>{selectedFile.name}</b>
                    </div>
                    <button
                      onClick={() => setSelectedFile(null)}
                      className="text-xs font-semibold text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* end main */}
        </div>
      </div>
    </div>
  );
}
