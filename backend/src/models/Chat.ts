import mongoose, { Schema, InferSchemaType } from "mongoose";

const chatSchema = new Schema(
  {
    members: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
    lastMessage: { type: Schema.Types.ObjectId, ref: "Message" },
  },
  { timestamps: true }
);

export type Chat = InferSchemaType<typeof chatSchema>;
export const ChatModel = mongoose.model("Chat", chatSchema);
