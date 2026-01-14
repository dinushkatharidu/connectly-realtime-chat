import type { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";

type JwtPayload = { userId: string };

export const setupSocket = (io: Server) => {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("No token"));

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET as string
      ) as JwtPayload;
      (socket.data as any).userId = decoded.userId;
      next();
    } catch (e) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = String((socket.data as any).userId || "");
    console.log("✅ socket connected:", socket.id, "user:", userId);

    // join personal room (optional)
    socket.join(`user:${userId}`);

    socket.on("join_chat", (chatId: string) => {
      if (typeof chatId !== "string" || !chatId.trim()) return;
      socket.join(chatId);
      // console.log("joined chat:", chatId, socket.id);
    });

    socket.on("leave_chat", (chatId: string) => {
      if (typeof chatId !== "string" || !chatId.trim()) return;
      socket.leave(chatId);
    });

    socket.on("typing", (data: { chatId: string; isTyping: boolean }) => {
      if (!data?.chatId) return;
      socket
        .to(data.chatId)
        .emit("typing", { userId, isTyping: !!data.isTyping });
    });

    socket.on("disconnect", () => {
      console.log("❌ socket disconnected:", socket.id);
    });
  });
};
