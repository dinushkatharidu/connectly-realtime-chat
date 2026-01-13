import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import { setOnline, setOffline, getOnlineUsers } from "./presence";
import { MessageModel } from "../models/Message";

type JwtPayload = { userId: string };

type TypingPayload = {
  chatId: string;
  isTyping: boolean;
};

type SeenPayload = {
  chatId: string;
};

function getTokenFromSocket(socket: Socket): string | null {
  const token = socket.handshake.auth?.token;
  if (typeof token === "string" && token.length > 0) return token;
  return null;
}

function toObjectId(id: string) {
  return new mongoose.Types.ObjectId(id);
}

export function setupSocket(io: Server) {
  io.on("connection", async (socket) => {
    console.log("✅ socket connected:", socket.id);

    // ---------- Auth via JWT ----------
    const token = getTokenFromSocket(socket);
    if (!token) {
      socket.disconnect();
      return;
    }

    let userId: string;

    try {
      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET as string
      ) as JwtPayload;
      userId = payload.userId;
      socket.data.userId = userId;
    } catch {
      socket.disconnect();
      return;
    }

    // ---------- Presence: set online ----------
    setOnline(userId);
    socket.join(userId); // private user room

    // Broadcast online list to everyone
    io.emit("presence:list", getOnlineUsers());

    // ---------- Join chat room ----------
    socket.on("join_chat", (chatId: string) => {
      if (typeof chatId === "string" && chatId.trim().length > 0) {
        socket.join(chatId);
      }
    });

    // ---------- Typing ----------
    socket.on("typing", (data: TypingPayload) => {
      if (!data || typeof data.chatId !== "string") return;
      socket
        .to(data.chatId)
        .emit("typing", { userId, isTyping: !!data.isTyping });
    });

    // ---------- Seen ----------
    // When user opens a chat, mark all messages in that chat (not sent by user) as seenBy user
    socket.on("chat:seen", async (data: SeenPayload) => {
      const chatId = data?.chatId;
      if (!chatId || typeof chatId !== "string") return;

      try {
        await MessageModel.updateMany(
          {
            chatId: toObjectId(chatId),
            senderId: { $ne: toObjectId(userId) },
            seenBy: { $ne: toObjectId(userId) },
          },
          { $addToSet: { seenBy: toObjectId(userId) } }
        );

        io.to(chatId).emit("chat:seen", { chatId, userId });
      } catch (e) {
        console.error("chat:seen error:", e);
      }
    });

    socket.on("disconnect", () => {
      setOffline(userId);
      io.emit("presence:list", getOnlineUsers());
      console.log("❌ socket disconnected:", socket.id);
    });
  });
}
