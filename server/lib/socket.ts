/**
 * Socket.IO instance accessor - avoids relying on global.app
 */
import type { Server as SocketIOServer } from "socket.io";

let ioInstance: SocketIOServer | null = null;

export function setIO(io: SocketIOServer): void {
  ioInstance = io;
}

export function getIO(): SocketIOServer | null {
  return ioInstance;
}
