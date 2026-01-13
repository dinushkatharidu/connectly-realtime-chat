// Simple in-memory presence store (good for single server dev)
// For production multi-server, use Redis adapter.

const onlineUsers = new Set<string>();

export function setOnline(userId: string) {
  onlineUsers.add(userId);
}

export function setOffline(userId: string) {
  onlineUsers.delete(userId);
}

export function getOnlineUsers() {
  return Array.from(onlineUsers);
}

export function isOnline(userId: string) {
  return onlineUsers.has(userId);
}
