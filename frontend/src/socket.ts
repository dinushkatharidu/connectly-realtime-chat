import { io } from "socket.io-client";

export function createSocket(token: string) {
  return io("http://localhost:5000", {
    auth: { token },
    transports: ["websocket"],
  });
}
