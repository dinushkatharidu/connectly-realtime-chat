import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/requireAuth";
import { ChatModel } from "../models/Chat";
import { MessageModel } from "../models/Message";
import { io } from "../server";

function mustString(v: unknown, fieldName: string): string {
  if (typeof v === "string" && v.trim().length > 0) return v;
  throw new Error(`Invalid ${fieldName}`);
}

function mustObjectId(id: string, fieldName: string) {
  if (!mongoose.isValidObjectId(id)) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return new mongoose.Types.ObjectId(id);
}

export const getMyChats = async (req: AuthRequest, res: Response) => {
  try {
    const userId = mustString(req.userId, "userId");

    const chats = await ChatModel.find({
      members: mustObjectId(userId, "userId"),
    })
      .sort({ updatedAt: -1 })
      .populate("members", "_id name email")
      .lean();

    // last message preview
    const chatIds = chats.map((c: any) => c._id);
    const lastMessages = await MessageModel.aggregate([
      { $match: { chatId: { $in: chatIds } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$chatId", lastText: { $first: "$text" } } },
    ]);

    const lastMap = new Map(
      lastMessages.map((m) => [String(m._id), m.lastText])
    );

    const result = chats.map((c: any) => ({
      ...c,
      lastMessage: { text: lastMap.get(String(c._id)) || "" },
    }));

    return res.json(result);
  } catch (e: any) {
    return res.status(400).json({ message: e.message || "Bad request" });
  }
};

export const getMessagesByChat = async (req: AuthRequest, res: Response) => {
  try {
    const userId = mustString(req.userId, "userId");

    // ✅ FIX: params typing safe
    const chatId = mustString((req.params as any).chatId, "chatId");
    const chatObjectId = mustObjectId(chatId, "chatId");

    const chat = await ChatModel.findById(chatObjectId);
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    const isMember = chat.members.map(String).includes(userId);
    if (!isMember) return res.status(403).json({ message: "Not allowed" });

    const msgs = await MessageModel.find({ chatId: chatObjectId })
      .sort({ createdAt: 1 })
      .lean();

    const normalized = msgs.map((m: any) => ({
      _id: String(m._id),
      chatId: String(m.chatId),
      senderId: String(m.senderId),
      text: m.text || "",
      createdAt: m.createdAt,
      attachments: m.attachments || [],
    }));

    return res.json(normalized);
  } catch (e: any) {
    return res.status(400).json({ message: e.message || "Bad request" });
  }
};

export const createChat = async (req: AuthRequest, res: Response) => {
  try {
    const userId = mustString(req.userId, "userId");
    const otherUserId = mustString(req.body?.otherUserId, "otherUserId");

    const a = mustObjectId(userId, "userId");
    const b = mustObjectId(otherUserId, "otherUserId");

    const existing = await ChatModel.findOne({ members: { $all: [a, b] } })
      .populate("members", "_id name email")
      .lean();

    if (existing) return res.json(existing);

    const chat = await ChatModel.create({ members: [a, b] });
    const populated = await ChatModel.findById(chat._id).populate(
      "members",
      "_id name email"
    );

    return res.status(201).json(populated);
  } catch (e: any) {
    return res.status(400).json({ message: e.message || "Bad request" });
  }
};

export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = mustString(req.userId, "userId");
    const chatId = mustString(req.body?.chatId, "chatId");

    const text = typeof req.body?.text === "string" ? req.body.text : "";
    const attachments = Array.isArray(req.body?.attachments)
      ? req.body.attachments
      : [];

    if (!text.trim() && attachments.length === 0) {
      return res.status(400).json({ message: "text or attachments required" });
    }

    const chatObjectId = mustObjectId(chatId, "chatId");
    const userObjectId = mustObjectId(userId, "userId");

    const chat = await ChatModel.findById(chatObjectId);
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    const isMember = chat.members.map(String).includes(userId);
    if (!isMember) return res.status(403).json({ message: "Not allowed" });

    const msg = await MessageModel.create({
      chatId: chatObjectId,
      senderId: userObjectId,
      text: text.trim(),
      attachments,
    });

    // keep chat updated
    chat.updatedAt = new Date();
    await chat.save();

    const payload = {
      _id: String(msg._id),
      chatId: String(msg.chatId),
      senderId: String(msg.senderId),
      text: msg.text || "",
      createdAt: msg.createdAt,
      attachments: msg.attachments || [],
    };

    io.to(chatId).emit("new_message", payload);
    return res.status(201).json(payload);
  } catch (e: any) {
    return res.status(400).json({ message: e.message || "Bad request" });
  }
};
