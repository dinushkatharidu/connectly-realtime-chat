import { Server } from "socket.io";
import jwt from "jsonwebtoken";

type JwtPayload = { userId: string };

export function setupSocket(io: Server) {
  io.on("connection", (socket) => {
    console.log("✅ socket connected:", socket.id);

    // --- 1) Authenticate socket using JWT token ---
    const token = socket.handshake.auth?.token;
    if (!token) {
      console.log("❌ socket missing token");
      socket.disconnect();
      return;
    }

    try {
      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET as string
      ) as JwtPayload;

      // Save userId inside socket
      socket.data.userId = payload.userId;

      // Join a private room for this user (for direct notifications)
      socket.join(payload.userId);

      console.log("✅ socket authenticated user:", payload.userId);
    } catch {
      console.log("❌ socket invalid token");
      socket.disconnect();
      return;
    }

    // --- 2) Join chat rooms ---
    socket.on("join_chat", (chatId: string) => {
      if (typeof chatId === "string" && chatId.length > 0) {
        socket.join(chatId);
        console.log(`✅ user joined chat room: ${chatId}`);
      }
    });

    // --- 3) Typing indicator (optional) ---
    socket.on("typing", (data: { chatId: string; isTyping: boolean }) => {
      const userId = socket.data.userId;
      if (!userId) return;

      // Send typing status to others in the chat room
      socket
        .to(data.chatId)
        .emit("typing", { userId, isTyping: data.isTyping });
    });

    socket.on("disconnect", () => {
      console.log("❌ socket disconnected:", socket.id);
    });
  });
}
