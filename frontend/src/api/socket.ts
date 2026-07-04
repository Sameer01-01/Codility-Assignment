import { io, Socket } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, {
      autoConnect: true,
      reconnection: true,
    });
  } else if (socket.disconnected) {
    socket.connect();
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
  }
}

export function getSocket(): Socket {
  if (!socket) {
    return connectSocket();
  }
  return socket;
}

export function subscribeToProjectEvents(projectId: string) {
  const s = getSocket();
  s.emit('join:project', projectId);
}

export function unsubscribeFromProjectEvents(projectId: string) {
  const s = getSocket();
  s.emit('leave:project', projectId);
}
