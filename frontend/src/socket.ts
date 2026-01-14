import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function createSocket(token: string) {
  if (socket) return socket;

  socket = io("http://localhost:5000", {
    transports: ["websocket"],
    auth: { token }, // ✅ important
  });

  return socket;
}
