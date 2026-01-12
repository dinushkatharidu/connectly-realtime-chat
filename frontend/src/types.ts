export type User = {
  id: string;
  name: string;
  email: string;
};

export type Chat = {
  _id: string;
  members: { _id: string; name: string; email: string }[];
  lastMessage?: Message;
};

export type Message = {
  _id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: string;
};
