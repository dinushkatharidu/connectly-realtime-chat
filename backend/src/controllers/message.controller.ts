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

export const deleteMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = mustString(req.userId, "userId");
    const messageId = mustString((req.params as any).messageId, "messageId");

    const messageObjectId = mustObjectId(messageId, "messageId");

    const msg = await MessageModel.findById(messageObjectId);
    if (!msg) return res.status(404).json({ message: "Message not found" });

    // only sender can delete
    if (String(msg.senderId) !== userId) {
      return res
        .status(403)
        .json({ message: "You can delete only your own messages" });
    }

    const chatId = String(msg.chatId);

    // delete message
    await MessageModel.deleteOne({ _id: messageObjectId });

    // update chat.updatedAt
    await ChatModel.updateOne(
      { _id: msg.chatId },
      { $set: { updatedAt: new Date() } }
    );

    // realtime notify chat room
    io.to(chatId).emit("message_deleted", { chatId, messageId });

    return res.json({ success: true, chatId, messageId });
  } catch (e: any) {
    return res.status(400).json({ message: e.message || "Bad request" });
  }
};
