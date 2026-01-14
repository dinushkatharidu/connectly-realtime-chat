import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import http from "http";
import { Server } from "socket.io";

import uploadRoutes from "./routes/upload.routes";
import chatRoutes from "./routes/chat.routes"; // your existing chat routes
import authRoutes from "./routes/auth.routes"; // your existing auth routes
import userRoutes from "./routes/user.routes"; // your existing user routes

import { setupSocket } from "./config/socket"; // your socket setup

dotenv.config();

const app = express(); // ✅ app declared FIRST

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

// ✅ serve uploaded files
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ✅ routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/upload", uploadRoutes);

// ✅ create http server + socket
const server = http.createServer(app);

export const io = new Server(server, {
  cors: { origin: "http://localhost:5173", credentials: true },
});

setupSocket(io);

// ✅ connect DB + start server
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI as string;

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    server.listen(PORT, () =>
      console.log(`✅ Server running on http://localhost:${PORT}`)
    );
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });
