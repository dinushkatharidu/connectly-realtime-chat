import { io, Socket } from "socket.io-client";

export function createSocket(token: string): Socket {
  return io("http://localhost:5000", {
    auth: { token },
    withCredentials: true,
  });
}
