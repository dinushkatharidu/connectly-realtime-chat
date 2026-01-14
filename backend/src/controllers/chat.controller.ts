import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/requireAuth";
import { ChatModel } from "../models/Chat";
import { MessageModel } from "../models/Message";
import { UserModel } from "../models/User";
import { io } from "../server";

type ObjId = mongoose.Types.ObjectId;

function mustString(v: unknown, name: string): string {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  throw new Error(`Invalid ${name}`);
}

function toObjectId(id: string, name: string): ObjId {
  if (!mongoose.isValidObjectId(id)) throw new Error(`Invalid ${name}`);
  return new mongoose.Types.ObjectId(id);
}

function ensureMember(chat: { members: ObjId[] }, userId: ObjId) {
  const ok = chat.members.some((m) => String(m) === String(userId));
  if (!ok) throw new Error("Not allowed");
}

// ✅ GET /api/chats
export const getMyChats = async (req: AuthRequest, res: Response) => {
  try {
    const userIdStr = mustString(req.userId, "userId");
    const userId = toObjectId(userIdStr, "userId");

    const chats = await ChatModel.find({ members: userId })
      .populate("members", "_id name email")
      .sort({ updatedAt: -1 })
      .lean();

    const chatIds = chats.map((c: any) => c._id as ObjId);

    const lastMsgs = await MessageModel.aggregate([
      { $match: { chatId: { $in: chatIds } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$chatId", last: { $first: "$$ROOT" } } },
    ]);

    const map = new Map<string, any>();
    for (const row of lastMsgs) map.set(String(row._id), row.last);

    const result = chats.map((c: any) => {
      const last = map.get(String(c._id));
      return {
        _id: String(c._id),
        members: (c.members || []).map((m: any) => ({
          _id: String(m._id),
          name: m.name,
          email: m.email,
        })),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        lastMessage: last
          ? {
              _id: String(last._id),
              chatId: String(last.chatId),
              senderId: String(last.senderId),
              text: last.isDeleted ? "" : last.text ?? "",
              isDeleted: !!last.isDeleted,
              editedAt: last.editedAt ?? null,
              deletedAt: last.deletedAt ?? null,
              createdAt: last.createdAt,
            }
          : null,
      };
    });

    res.json(result);
  } catch (e: any) {
    res.status(400).json({ message: e.message || "Bad request" });
  }
};

// ✅ POST /api/chats  { otherUserId }
export const createChat = async (req: AuthRequest, res: Response) => {
  try {
    const userIdStr = mustString(req.userId, "userId");
    const otherUserIdStr = mustString(req.body?.otherUserId, "otherUserId");

    if (userIdStr === otherUserIdStr) {
      return res.status(400).json({ message: "Cannot chat with yourself" });
    }

    const userId = toObjectId(userIdStr, "userId");
    const otherUserId = toObjectId(otherUserIdStr, "otherUserId");

    const other = await UserModel.findById(otherUserId);
    if (!other) return res.status(404).json({ message: "User not found" });

    // ✅ Find existing 1-1 chat by exact members (no isGroup field)
    const existing = await ChatModel.findOne({
      members: { $all: [userId, otherUserId] },
    }).populate("members", "_id name email");

    if (existing) {
      const ex: any = existing;
      return res.json({
        _id: String(ex._id),
        members: (ex.members || []).map((m: any) => ({
          _id: String(m._id),
          name: m.name,
          email: m.email,
        })),
        createdAt: ex.createdAt,
        updatedAt: ex.updatedAt,
        lastMessage: null,
      });
    }

    const chat = await ChatModel.create({
      members: [userId, otherUserId],
    });

    const populated = await ChatModel.findById(chat._id).populate(
      "members",
      "_id name email"
    );
    const p: any = populated;

    res.status(201).json({
      _id: String(p._id),
      members: (p.members || []).map((m: any) => ({
        _id: String(m._id),
        name: m.name,
        email: m.email,
      })),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      lastMessage: null,
    });
  } catch (e: any) {
    res.status(400).json({ message: e.message || "Bad request" });
  }
};

// ✅ GET /api/chats/:chatId/messages
export const getMessagesByChat = async (req: AuthRequest, res: Response) => {
  try {
    const userIdStr = mustString(req.userId, "userId");
    const chatIdStr = mustString(req.params.chatId, "chatId");

    const userId = toObjectId(userIdStr, "userId");
    const chatId = toObjectId(chatIdStr, "chatId");

    const chat = await ChatModel.findById(chatId).lean();
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    ensureMember(chat as any, userId);

    const msgs = await MessageModel.find({ chatId })
      .sort({ createdAt: 1 })
      .lean();

    const result = msgs.map((m: any) => ({
      _id: String(m._id),
      chatId: String(m.chatId),
      senderId: String(m.senderId),
      text: m.isDeleted ? "" : m.text ?? "",
      attachments: m.isDeleted ? [] : m.attachments ?? [],
      createdAt: m.createdAt,
      editedAt: m.editedAt ?? null,
      isDeleted: !!m.isDeleted,
      deletedAt: m.deletedAt ?? null,
    }));

    res.json(result);
  } catch (e: any) {
    res.status(400).json({ message: e.message || "Bad request" });
  }
};

// ✅ POST /api/chats/message
export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userIdStr = mustString(req.userId, "userId");
    const chatIdStr = mustString(req.body?.chatId, "chatId");
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    const attachments = Array.isArray(req.body?.attachments)
      ? req.body.attachments
      : [];

    if (!text.trim() && attachments.length === 0) {
      return res.status(400).json({ message: "Message is empty" });
    }

    const userId = toObjectId(userIdStr, "userId");
    const chatId = toObjectId(chatIdStr, "chatId");

    const chat = await ChatModel.findById(chatId).lean();
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    ensureMember(chat as any, userId);

    const msg = await MessageModel.create({
      chatId,
      senderId: userId,
      text: text.trim(),
      attachments,
      isDeleted: false,
      editedAt: null,
      deletedAt: null,
    });

    await ChatModel.updateOne(
      { _id: chatId },
      { $set: { updatedAt: new Date() } }
    );

    const payload = {
      _id: String(msg._id),
      chatId: chatIdStr,
      senderId: userIdStr,
      text: msg.isDeleted ? "" : msg.text,
      attachments: msg.isDeleted ? [] : msg.attachments ?? [],
      createdAt: msg.createdAt,
      editedAt: msg.editedAt ?? null,
      isDeleted: !!msg.isDeleted,
      deletedAt: msg.deletedAt ?? null,
    };

    io.to(chatIdStr).emit("new_message", payload);

    res.status(201).json(payload);
  } catch (e: any) {
    res.status(400).json({ message: e.message || "Bad request" });
  }
};
