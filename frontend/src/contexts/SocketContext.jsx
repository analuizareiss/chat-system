import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { refreshAccessToken } from '../services/api';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setConnected(false);
      }
      return;
    }

    const socket = io({
      auth: (cb) => cb({ token: localStorage.getItem('accessToken') }),
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('users:online', (users) => setOnlineUsers(users));

    let refreshing = false;
    const onConnectError = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        await refreshAccessToken();
        socket.connect();
      } catch {
        // refreshAccessToken ja limpa a sessao e redireciona para o login
        // quando o refreshToken tambem esta invalido/expirado.
      } finally {
        refreshing = false;
      }
    };
    socket.on('connect_error', onConnectError);

    socketRef.current = socket;

    return () => {
      socket.off('connect_error', onConnectError);
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [user]);

  const getSocket = () => socketRef.current;

  return (
    <SocketContext.Provider value={{ getSocket, connected, onlineUsers }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}