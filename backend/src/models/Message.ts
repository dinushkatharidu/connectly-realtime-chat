import mongoose, { Schema, InferSchemaType } from "mongoose";

const attachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: false }
);

const messageSchema = new Schema(
  {
    chatId: { type: Schema.Types.ObjectId, ref: "Chat", required: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, default: "" },

    // ✅ NEW
    attachments: { type: [attachmentSchema], default: [] },

    // optional seenBy (if you have it, keep it)
    seenBy: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
  },
  { timestamps: true }
);

export type MessageDoc = InferSchemaType<typeof messageSchema>;
export const MessageModel = mongoose.model("Message", messageSchema);
