import { Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import { AuthRequest } from "../middleware/auth.middleware";
import { ChatModel } from "../models/Chat";
import { MessageModel } from "../models/Message";
import { getIO } from "../config/io";

/* =====================================================
   Helpers
===================================================== */

const toObjectId = (id: string) => new mongoose.Types.ObjectId(id);
const isValidObjectId = (id: string) => mongoose.Types.ObjectId.isValid(id);

function getParamString(
  value: unknown
): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof value === "string" && value.trim().length > 0) {
    return { ok: true, value };
  }
  if (
    Array.isArray(value) &&
    typeof value[0] === "string" &&
    value[0].trim().length > 0
  ) {
    return { ok: true, value: value[0] };
  }
  return { ok: false, message: "Invalid or missing route parameter" };
}

/* =====================================================
   Zod Schemas
===================================================== */

const createChatSchema = z.object({
  otherUserId: z.string().min(1, "otherUserId is required"),
});

const sendMessageSchema = z.object({
  chatId: z.string().min(1, "chatId is required"),
  text: z.string().min(1, "text is required"),
});

/* =====================================================
   Controllers
===================================================== */

export async function createChat(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Unauthorized" });

    const parsed = createChatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const myIdStr = req.userId;
    const otherIdStr = parsed.data.otherUserId;

    if (myIdStr === otherIdStr) {
      return res.status(400).json({ message: "Cannot chat with yourself" });
    }

    if (!isValidObjectId(myIdStr) || !isValidObjectId(otherIdStr)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const myId = toObjectId(myIdStr);
    const otherId = toObjectId(otherIdStr);

    const existingChat = await ChatModel.findOne({
      members: { $all: [myId, otherId] },
      $expr: { $eq: [{ $size: "$members" }, 2] },
    });

    if (existingChat) return res.json(existingChat);

    const chat = await ChatModel.create({ members: [myId, otherId] });
    return res.status(201).json(chat);
  } catch (error) {
    console.error("createChat error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

export async function listMyChats(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Unauthorized" });

    const myIdStr = req.userId;
    if (!isValidObjectId(myIdStr)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const chats = await ChatModel.find({ members: toObjectId(myIdStr) })
      .populate("members", "name email")
      .populate("lastMessage", "text senderId createdAt")
      .sort({ updatedAt: -1 });

    return res.json(chats);
  } catch (error) {
    console.error("listMyChats error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

export async function getMessages(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Unauthorized" });

    const myIdStr = req.userId;

    const chatIdParam = getParamString((req.params as any).chatId);
    if (!chatIdParam.ok) {
      return res.status(400).json({ message: chatIdParam.message });
    }
    const chatIdStr = chatIdParam.value;

    if (!isValidObjectId(myIdStr) || !isValidObjectId(chatIdStr)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const chat = await ChatModel.findById(chatIdStr);
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    const isMember = chat.members.some((m) => m.toString() === myIdStr);
    if (!isMember) return res.status(403).json({ message: "Access denied" });

    const messages = await MessageModel.find({
      chatId: toObjectId(chatIdStr),
    }).sort({
      createdAt: 1,
    });

    return res.json(messages);
  } catch (error) {
    console.error("getMessages error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

/**
 * POST /api/chats/message
 * 1) Save message to DB
 * 2) Emit new message to chat room in real-time
 */
export async function sendMessage(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Unauthorized" });

    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten(),
      });
    }

    const myIdStr = req.userId;
    const { chatId: chatIdStr, text } = parsed.data;

    if (!isValidObjectId(myIdStr) || !isValidObjectId(chatIdStr)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const chat = await ChatModel.findById(chatIdStr);
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    const isMember = chat.members.some((m) => m.toString() === myIdStr);
    if (!isMember) return res.status(403).json({ message: "Access denied" });

    // receiver userId (1-to-1 chat)
    const receiverIdStr =
      chat.members.map((m) => m.toString()).find((id) => id !== myIdStr) ||
      null;

    const message = await MessageModel.create({
      chatId: toObjectId(chatIdStr),
      senderId: toObjectId(myIdStr),
      text,
      deliveredTo: receiverIdStr ? [toObjectId(receiverIdStr)] : [],
      // seenBy is empty initially
    });

    chat.lastMessage = message._id;
    await chat.save();

    // Emit real-time
    const io = getIO();
    io.to(chatIdStr).emit("new_message", message);

    return res.status(201).json(message);
  } catch (error) {
    console.error("sendMessage error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}
