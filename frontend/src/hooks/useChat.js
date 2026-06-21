import { useState, useEffect, useCallback, useRef } from 'react';
import { messageService } from '../services/api';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';

export function useChat() {
  const { user } = useAuth();
  const { getSocket } = useSocket();
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const [loadingRooms, setLoadingRooms] = useState(false);
  const typingTimers = useRef({});

  // Load all user rooms
  const loadRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const { data } = await messageService.getRooms();
      setRooms(data.rooms);
    } catch (err) {
      console.error('Failed to load rooms:', err);
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  // Load messages for a room
  const loadMessages = useCallback(async (roomId) => {
    if (messages[roomId]) return; // already loaded
    try {
      const { data } = await messageService.getMessages(roomId);
      setMessages((prev) => ({ ...prev, [roomId]: data.messages }));
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  }, [messages]);

  // Open or activate a room
  const openRoom = useCallback(async (room) => {
    setActiveRoom(room);
    await loadMessages(room.id);
    const socket = getSocket();
    if (socket) socket.emit('room:join', { roomId: room.id });
  }, [loadMessages, getSocket]);

  // Start a direct chat
  const startDirectChat = useCallback(async (targetUser) => {
    try {
      const { data } = await messageService.getOrCreateDirect(targetUser.id, targetUser.username);
      const room = data.room;
      // Refresh room name for display
      const enriched = { ...room, _peerUsername: targetUser.username, _peerColor: targetUser.avatar_color };
      setRooms((prev) => {
        const exists = prev.find((r) => r.id === room.id);
        if (exists) return prev.map((r) => r.id === room.id ? { ...r, ...enriched } : r);
        return [enriched, ...prev];
      });
      await openRoom(enriched);
      return enriched;
    } catch (err) {
      console.error('Failed to start direct chat:', err);
    }
  }, [openRoom]);

  // Create group
  const createGroup = useCallback(async (name, memberIds) => {
    try {
      const { data } = await messageService.createGroup(name, memberIds);
      setRooms((prev) => [data.room, ...prev]);
      await openRoom(data.room);
      return data.room;
    } catch (err) {
      console.error('Failed to create group:', err);
    }
  }, [openRoom]);

  // Send message via socket
  const sendMessage = useCallback((roomId, content) => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('message:send', { roomId, content });
  }, [getSocket]);

  // Typing indicators
  const startTyping = useCallback((roomId) => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('typing:start', { roomId });
    clearTimeout(typingTimers.current[roomId]);
    typingTimers.current[roomId] = setTimeout(() => {
      socket.emit('typing:stop', { roomId });
    }, 2500);
  }, [getSocket]);

  const stopTyping = useCallback((roomId) => {
    const socket = getSocket();
    if (!socket) return;
    clearTimeout(typingTimers.current[roomId]);
    socket.emit('typing:stop', { roomId });
  }, [getSocket]);

  // Socket event listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onNewMessage = ({ message }) => {
      setMessages((prev) => ({
        ...prev,
        [message.room_id]: [...(prev[message.room_id] || []), message],
      }));

      // Update last_message in rooms list
      setRooms((prev) =>
        prev.map((r) =>
          r.id === message.room_id
            ? { ...r, last_message: message.content, last_message_at: message.created_at, last_sender: message.sender_username }
            : r
        ).sort((a, b) => {
          const ta = a.last_message_at || a.created_at;
          const tb = b.last_message_at || b.created_at;
          return new Date(tb) - new Date(ta);
        })
      );
    };

    const onTyping = ({ userId, username, roomId, isTyping }) => {
      if (userId === user?.id) return;
      setTypingUsers((prev) => {
        const roomTyping = { ...(prev[roomId] || {}) };
        if (isTyping) roomTyping[userId] = username;
        else delete roomTyping[userId];
        return { ...prev, [roomId]: roomTyping };
      });
    };

    socket.on('message:new', onNewMessage);
    socket.on('typing:update', onTyping);

    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('typing:update', onTyping);
    };
  }, [getSocket, user]);

  return {
    rooms, activeRoom, messages, typingUsers, loadingRooms,
    loadRooms, openRoom, startDirectChat, createGroup,
    sendMessage, startTyping, stopTyping,
  };
}
