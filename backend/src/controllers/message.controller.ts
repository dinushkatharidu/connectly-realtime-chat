import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/requireAuth";
import { MessageModel } from "../models/Message";
import { ChatModel } from "../models/Chat";
import { io } from "../server";

function mustString(v: unknown, fieldName: string): string {
  if (typeof v === "string" && v.trim().length > 0) return v;
  throw new Error(`Invalid ${fieldName}`);
}

function mustObjectId(id: string, fieldName: string) {
  if (!mongoose.isValidObjectId(id)) throw new Error(`Invalid ${fieldName}`);
  return new mongoose.Types.ObjectId(id);
}

// ✅ EDIT message (WhatsApp-like)
export const editMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = mustString(req.userId, "userId");
    const messageId = mustString((req.params as any).messageId, "messageId");
    const newText = mustString(req.body?.text, "text");

    const msg = await MessageModel.findById(
      mustObjectId(messageId, "messageId")
    );
    if (!msg) return res.status(404).json({ message: "Message not found" });

    if (String(msg.senderId) !== userId) {
      return res
        .status(403)
        .json({ message: "You can edit only your own messages" });
    }
    if (msg.isDeleted) {
      return res.status(400).json({ message: "Cannot edit a deleted message" });
    }

    msg.text = newText.trim();
    msg.editedAt = new Date();
    await msg.save();

    await ChatModel.updateOne(
      { _id: msg.chatId },
      { $set: { updatedAt: new Date() } }
    );

    const chatId = String(msg.chatId);

    const payload = {
      chatId,
      messageId: String(msg._id),
      text: msg.text,
      editedAt: msg.editedAt?.toISOString() ?? null,
    };

    // ✅ emit to room
    io.to(chatId).emit("message_updated", payload);

    return res.json({
      _id: String(msg._id),
      chatId,
      senderId: String(msg.senderId),
      text: msg.text,
      createdAt: msg.createdAt,
      attachments: (msg.attachments as any) || [],
      editedAt: msg.editedAt,
      isDeleted: msg.isDeleted,
      deletedAt: msg.deletedAt,
    });
  } catch (e: any) {
    return res.status(400).json({ message: e.message || "Bad request" });
  }
};

// ✅ DELETE for everyone (soft delete + caption)
export const deleteMessageForEveryone = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = mustString(req.userId, "userId");
    const messageId = mustString((req.params as any).messageId, "messageId");

    const msg = await MessageModel.findById(
      mustObjectId(messageId, "messageId")
    );
    if (!msg) return res.status(404).json({ message: "Message not found" });

    if (String(msg.senderId) !== userId) {
      return res
        .status(403)
        .json({ message: "You can delete only your own messages" });
    }

    // ✅ soft delete (IMPORTANT: do not assign [] directly to DocumentArray)
    msg.isDeleted = true;
    msg.deletedAt = new Date();
    msg.text = "";
    msg.editedAt = null;

    // clear attachments safely
    msg.set("attachments", []);

    await msg.save();

    await ChatModel.updateOne(
      { _id: msg.chatId },
      { $set: { updatedAt: new Date() } }
    );

    const chatId = String(msg.chatId);

    const payload = {
      chatId,
      messageId: String(msg._id),
      isDeleted: true,
      deletedAt: msg.deletedAt?.toISOString() ?? null,
    };

    // ✅ emit to room
    io.to(chatId).emit("message_deleted", payload);

    return res.json({ success: true, ...payload });
  } catch (e: any) {
    return res.status(400).json({ message: e.message || "Bad request" });
  }
};
