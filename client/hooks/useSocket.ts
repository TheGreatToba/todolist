import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';

export function useSocket() {
  const { token } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) return;

    const socket = io(window.location.origin, {
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      if (import.meta.env.DEV) {
        console.log('Socket connected:', socket.id);
      }
    });

    socket.on('disconnect', (reason) => {
      if (import.meta.env.DEV) {
        console.log('Socket disconnected:', reason);
      }
    });

    socket.on('connect_error', (err) => {
      if (import.meta.env.DEV) {
        console.warn('Socket connect error:', err.message);
      }
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const on = useCallback((event: string, callback: (...args: any[]) => void) => {
    const socket = socketRef.current;
    if (!socket) return () => {};

    const wrapped: (...args: any[]) => void = (...args) => {
      if (!socketRef.current || socketRef.current !== socket || !socket.connected) return;
      callback(...args);
    };
    socket.on(event, wrapped);

    return () => {
      socket.off(event, wrapped);
    };
  }, []);

  const emit = useCallback((event: string, data?: any) => {
    if (socketRef.current) {
      socketRef.current.emit(event, data);
    }
  }, []);

  return { socket: socketRef.current, on, emit };
}
