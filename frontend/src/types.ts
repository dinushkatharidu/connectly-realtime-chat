export type User = {
  id: string;
  name: string;
  email: string;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

export type UserLite = {
  _id: string;
  name: string;
  email: string;
};

export type Message = {
  _id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: string;
};

export type Chat = {
  _id: string;
  members: UserLite[];
  lastMessage?: Message;
};
