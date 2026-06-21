const { verifySocketToken } = require('../middleware/auth.middleware');
const messageModel = require('../models/message.model');

const onlineUsers = new Map();

function setupSocketHandlers(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));
    const payload = verifySocketToken(token);
    if (!payload) return next(new Error('Invalid token'));
    socket.user = payload;
    next();
  });

  io.on('connection', async (socket) => {
    const { userId, username } = socket.user;
    console.log(`[Socket] Connected: ${username} (${socket.id})`);

    onlineUsers.set(userId, { socketId: socket.id, username, rooms: [] });

    // Join all existing rooms
    try {
      const userRooms = await messageModel.getUserRooms(userId);
      for (const room of userRooms) {
        socket.join(`room:${room.id}`);
        onlineUsers.get(userId)?.rooms.push(room.id);
      }
    } catch (err) {
      console.error('[Socket] Failed to load rooms on connect:', err);
    }

    broadcastOnlineUsers(io);

    // ---- room:join ----
    socket.on('room:join', async ({ roomId }) => {
      try {
        const isMember = await messageModel.isRoomMember(roomId, userId);
        if (isMember) socket.join(`room:${roomId}`);
      } catch {}
    });

    // ---- message:send ----
    socket.on('message:send', async ({ roomId, content }, ack) => {
      if (!content?.trim()) return;

      try {
        const isMember = await messageModel.isRoomMember(roomId, userId);
        if (!isMember) {
          if (ack) ack({ error: 'Not a room member' });
          return;
        }

        const message = await messageModel.createMessage({
          roomId,
          senderId: userId,
          senderUsername: username,
          content: content.trim(),
        });

        io.to(`room:${roomId}`).emit('message:new', { message });
        if (ack) ack({ success: true, message });
      } catch (err) {
        console.error('[Socket] message:send error:', err);
        if (ack) ack({ error: 'Failed to send message' });
      }
    });

    // ---- typing ----
    socket.on('typing:start', ({ roomId }) => {
      socket.to(`room:${roomId}`).emit('typing:update', { userId, username, roomId, isTyping: true });
    });

    socket.on('typing:stop', ({ roomId }) => {
      socket.to(`room:${roomId}`).emit('typing:update', { userId, username, roomId, isTyping: false });
    });

    // ---- disconnect ----
    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${username} (${socket.id})`);
      onlineUsers.delete(userId);
      broadcastOnlineUsers(io);
    });
  });
}

function broadcastOnlineUsers(io) {
  const users = Array.from(onlineUsers.entries()).map(([uid, data]) => ({
    userId: uid,
    username: data.username,
  }));
  io.emit('users:online', users);
}

function getOnlineUsers() {
  return onlineUsers;
}

module.exports = { setupSocketHandlers, getOnlineUsers };
