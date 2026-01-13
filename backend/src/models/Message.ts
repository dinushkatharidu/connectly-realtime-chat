import mongoose, { Schema, InferSchemaType, model } from "mongoose";

const messageSchema = new Schema(
  {
    chatId: { type: Schema.Types.ObjectId, ref: "Chat", required: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },

    // ✅ Phase 10
    deliveredTo: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
    seenBy: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
  },
  { timestamps: true }
);

export type MessageDoc = InferSchemaType<typeof messageSchema>;
export const MessageModel = model("Message", messageSchema);
