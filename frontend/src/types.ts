// frontend/src/types.ts

export type Attachment = {
  url: string;
  name: string;
  type: string;
  size: number;
};

export type UserLite = {
  _id: string;
  name: string;
  email: string;
};

export type Chat = {
  _id: string;
  members: UserLite[];
  lastMessage?: {
    text: string;
  };
};

export type Message = {
  _id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: string;

  // ✅ NEW: for files/photos
  attachments?: Attachment[];
};
