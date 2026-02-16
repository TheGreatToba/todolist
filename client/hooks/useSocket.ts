import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';

type SocketEventMap = {
  'task:updated': {
    taskId: string;
    employeeId: string;
    isCompleted: boolean;
    taskTitle: string;
  };
  'task:assigned': {
    taskId: string;
    employeeId: string;
    employeeName: string;
    taskTitle: string;
    taskDescription?: string;
  };
};

type SocketEvent = keyof SocketEventMap;

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
      logger.debug('Socket connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      logger.debug('Socket disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      logger.warn('Socket connect error:', err.message);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const on = useCallback(
    <E extends SocketEvent>(event: E, callback: (payload: SocketEventMap[E]) => void) => {
      const socket = socketRef.current;
      if (!socket) return () => {};

      const wrapped = (payload: SocketEventMap[E]) => {
        if (!socketRef.current || socketRef.current !== socket || !socket.connected) return;
        callback(payload);
      };

      socket.on(event, wrapped as (payload: unknown) => void);

      return () => {
        socket.off(event, wrapped as (payload: unknown) => void);
      };
    },
    []
  );

  const emit = useCallback(
    <E extends SocketEvent>(event: E, data: SocketEventMap[E]) => {
      if (socketRef.current) {
        socketRef.current.emit(event, data);
      }
    },
    []
  );

  return { socket: socketRef.current, on, emit };
}
