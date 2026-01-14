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

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchEmail, setSearchEmail] = useState("");
  const [searchResults, setSearchResults] = useState<UserLite[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(
    () => new Set()
  );
  const typingTimeoutRef = useRef<number | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>("");

  // ✅ WhatsApp-style menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // ✅ Close menu on outside click
  useEffect(() => {
    const close = () => setOpenMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

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
  }, []);

  const loadMessages = useCallback(async (chatId: string) => {
    const res = await api.get<Message[]>(`/api/chats/${chatId}/messages`);
    setMessages(res.data);
  }, []);

  const uploadSingle = useCallback(async (file: File) => {
    const form = new FormData();
    form.append("file", file);

    const res = await api.post<Attachment>("/api/upload/single", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    return res.data;
  }, []);

  const handleSelectChat = useCallback(
    async (chatId: string) => {
      if (!chatId) return;

      if (socket && activeChatId) socket.emit("leave_chat", activeChatId);

      setTypingUserIds(new Set());
      setEditingId(null);
      setEditingText("");
      setSelectedFile(null);
      setOpenMenuId(null);

      setActiveChatId(chatId);
      socket?.emit("join_chat", chatId);

      await loadMessages(chatId);
    },
    [socket, activeChatId, loadMessages]
  );

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

  const startEdit = useCallback((m: Message) => {
    setEditingId(m._id);
    setEditingText(m.text || "");
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    const newText = editingText.trim();
    if (!newText) return;

    const nowIso = new Date().toISOString();

    setMessages((prev) =>
      prev.map((m) =>
        m._id === editingId ? { ...m, text: newText, editedAt: nowIso } : m
      )
    );

    try {
      await api.patch(`/api/messages/${editingId}`, { text: newText });
      setEditingId(null);
      setEditingText("");
      refreshChats().catch(() => {});
    } catch (e) {
      console.error("edit failed", e);
      if (activeChatId) loadMessages(activeChatId).catch(() => {});
    }
  }, [editingId, editingText, activeChatId, loadMessages, refreshChats]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingText("");
  }, []);

  const deleteForEveryone = useCallback(
    async (messageId: string) => {
      if (!confirm("Delete this message for everyone?")) return;

      const nowIso = new Date().toISOString();

      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId
            ? {
                ...m,
                isDeleted: true,
                deletedAt: nowIso,
                editedAt: null,
                text: "",
                attachments: [],
              }
            : m
        )
      );

      try {
        await api.delete(`/api/messages/${messageId}`);
        refreshChats().catch(() => {});
      } catch (e) {
        console.error("delete failed", e);
        if (activeChatId) loadMessages(activeChatId).catch(() => {});
      }
    },
    [activeChatId, loadMessages, refreshChats]
  );

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
      await handleSelectChat(newChat._id);

      setSearchEmail("");
      setSearchResults([]);
      setSearchError(null);
      setSearchOpen(false);
    },
    [refreshChats, handleSelectChat]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get<Chat[]>("/api/chats");
        if (!alive) return;
        setChats(res.data);

        if (res.data.length > 0) {
          const first = res.data[0]._id;
          setActiveChatId(first);
          socket?.emit("join_chat", first);
          await loadMessages(first);
        }
      } catch (e) {
        console.error(e);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onNewMessage = (msg: Message) => {
      if (msg.chatId !== activeChatId) {
        refreshChats().catch(() => {});
        return;
      }
      setMessages((prev) => {
        const exists = prev.some((m) => m._id === msg._id);
        return exists ? prev : [...prev, msg];
      });
      refreshChats().catch(() => {});
    };

    const onMessageUpdated = (data: {
      chatId: string;
      messageId: string;
      text: string;
      editedAt: string | null;
    }) => {
      if (data.chatId !== activeChatId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m._id === data.messageId
            ? { ...m, text: data.text, editedAt: data.editedAt }
            : m
        )
      );
    };

    const onMessageDeleted = (data: {
      chatId: string;
      messageId: string;
      isDeleted: boolean;
      deletedAt: string | null;
    }) => {
      if (data.chatId !== activeChatId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m._id === data.messageId
            ? {
                ...m,
                isDeleted: true,
                deletedAt: data.deletedAt,
                editedAt: null,
                text: "",
                attachments: [],
              }
            : m
        )
      );
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

    socket.on("new_message", onNewMessage);
    socket.on("message_updated", onMessageUpdated);
    socket.on("message_deleted", onMessageDeleted);
    socket.on("typing", onTyping);

    return () => {
      socket.off("new_message", onNewMessage);
      socket.off("message_updated", onMessageUpdated);
      socket.off("message_deleted", onMessageDeleted);
      socket.off("typing", onTyping);
    };
  }, [socket, activeChatId, refreshChats, user?.id]);

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
          {/* Top header */}
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

          <div className="grid grid-cols-12 flex-1 min-h-0">
            {/* Left: chat list */}
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
                {chats.map((chat) => {
                  const p = getPartner(chat);
                  const selected = chat._id === activeChatId;

                  return (
                    <button
                      key={chat._id}
                      onClick={() => handleSelectChat(chat._id)}
                      className={[
                        "mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-slate-50",
                        selected
                          ? "bg-emerald-50 ring-1 ring-emerald-200"
                          : "bg-white",
                      ].join(" ")}
                    >
                      <div className="grid h-11 w-11 place-items-center rounded-full bg-slate-200 text-slate-700 font-semibold">
                        {(p?.name?.[0] || "?").toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-slate-900">
                          {p?.name || "Unknown"}
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

            {/* Right: messages */}
            <div className="col-span-12 md:col-span-8 flex flex-col min-h-0">
              <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
                <div className="font-semibold text-slate-900 truncate">
                  {partner ? partner.name : "Select a chat"}
                </div>
                <div className="text-xs text-slate-500">
                  {typingUserIds.size > 0 ? "typing…" : ""}
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50 p-4">
                <div className="space-y-4">
                  {grouped.map((g) => (
                    <div key={g.label}>
                      <div className="mx-auto mb-3 w-fit rounded-full bg-white px-3 py-1 text-xs text-slate-500 shadow-sm">
                        {g.label}
                      </div>

                      <div className="space-y-2">
                        {g.items.map((m) => {
                          const isMe = m.senderId === user?.id;
                          const deleted = !!m.isDeleted;

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
                                  "max-w-[78%] rounded-2xl px-4 py-2 shadow-sm relative",
                                  isMe
                                    ? "bg-emerald-600 text-white rounded-br-md"
                                    : "bg-white text-slate-900 rounded-bl-md",
                                ].join(" ")}
                              >
                                {/* ✅ 3-dot menu (only for my messages & not deleted) */}
                                {isMe && !deleted && (
                                  <div className="absolute top-2 right-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuId((prev) =>
                                          prev === m._id ? null : m._id
                                        );
                                      }}
                                      className="rounded-lg px-2 py-1 text-sm opacity-90 hover:bg-white/10"
                                      title="More"
                                    >
                                      ⋮
                                    </button>

                                    {openMenuId === m._id && (
                                      <div
                                        onClick={(e) => e.stopPropagation()}
                                        className="absolute right-0 mt-2 z-20 w-36 overflow-hidden rounded-xl border bg-white shadow-lg"
                                      >
                                        <button
                                          onClick={() => {
                                            setOpenMenuId(null);
                                            startEdit(m);
                                          }}
                                          className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                                        >
                                          ✏️ Edit
                                        </button>
                                        <button
                                          onClick={() => {
                                            setOpenMenuId(null);
                                            deleteForEveryone(m._id);
                                          }}
                                          className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                        >
                                          🗑 Delete
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {deleted ? (
                                  <div className="text-sm italic opacity-90">
                                    This message was deleted
                                  </div>
                                ) : (
                                  <>
                                    {m.text && (
                                      <div className="whitespace-pre-wrap text-sm pr-6">
                                        {m.text}
                                      </div>
                                    )}

                                    {m.attachments?.map((a) => {
                                      const fullUrl = `http://localhost:5000${a.url}`;
                                      const isImage =
                                        a.type.startsWith("image/");
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
                                              <span className="truncate max-w-55">
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
                                  </>
                                )}

                                <div
                                  className={[
                                    "mt-1 flex items-center justify-end gap-2 text-[11px]",
                                    isMe
                                      ? "text-emerald-100"
                                      : "text-slate-400",
                                  ].join(" ")}
                                >
                                  {!deleted && m.editedAt ? (
                                    <span className="italic opacity-90">
                                      (edited)
                                    </span>
                                  ) : null}
                                  <span>{formatTime(m.createdAt)}</span>
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
              </div>

              {editingId && (
                <div className="border-t bg-amber-50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-amber-700">
                      Editing:
                    </span>
                    <input
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                    />
                    <button
                      onClick={saveEdit}
                      className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="rounded-lg border px-3 py-2 text-sm hover:bg-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

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
                    disabled={!activeChatId || uploading || !!editingId}
                    placeholder={
                      editingId
                        ? "Finish editing first…"
                        : activeChatId
                        ? "Type a message…"
                        : "Select a chat first"
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
                      !!editingId ||
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
        </div>
      </div>
    </div>
  );
}
