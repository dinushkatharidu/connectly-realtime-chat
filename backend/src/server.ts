import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";

import authRoutes from "./routes/auth.routes";
import chatRoutes from "./routes/chat.routes";

import { setupSocket } from "./config/socket";
import { setIO } from "./config/io";
import userRoutes from "./routes/user.routes";


dotenv.config();

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

app.use("/api/users", userRoutes);


app.get("/", (_req, res) => {
  res.send("Connectly API is running ✅");
});

app.use("/api/auth", authRoutes);
app.use("/api/chats", chatRoutes);

// ---- Create HTTP server (Socket.IO attaches here) ----
const server = http.createServer(app);

// ---- Socket.IO server ----
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true,
  },
});

setIO(io); // ✅ make io accessible from controllers
setupSocket(io); // ✅ define socket events

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log("✅ MongoDB connected");

    server.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Startup error:", err);
    process.exit(1);
  }
}

start();
