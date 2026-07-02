const { verifySocketToken } = require('../middleware/auth.middleware');
const messageModel = require('../models/message.model');
const { dataClient } = require('../redis');

const ONLINE_USERS_KEY = 'chat:online_users';
const INSTANCE_ID = process.env.HOSTNAME || `pid-${process.pid}`;

// Guard: evita chamar o Redis quando o cliente ja foi fechado (ex: durante
// o teardown dos testes). Sem isso, o evento 'disconnect' do socket dispara
// de forma assincrona apos o afterAll fechar os clientes, causando
// "The client is closed".
function isRedisReady() {
  return dataClient.isOpen;
}

async function setUserOnline(userId, username) {
  if (!isRedisReady()) return;
  try {
    await dataClient.hSet(ONLINE_USERS_KEY, userId, JSON.stringify({ username, instanceId: INSTANCE_ID }));
  } catch {}
}

async function setUserOffline(userId) {
  if (!isRedisReady()) return;
  try {
    await dataClient.hDel(ONLINE_USERS_KEY, userId);
  } catch {}
}

async function getOnlineUsersList() {
  if (!isRedisReady()) return [];
  try {
    const raw = await dataClient.hGetAll(ONLINE_USERS_KEY);
    return Object.entries(raw).map(([userId, value]) => {
      const parsed = JSON.parse(value);
      return { userId, username: parsed.username };
    });
  } catch {
    return [];
  }
}

async function broadcastOnlineUsers(io) {
  if (!isRedisReady()) return;
  try {
    const users = await getOnlineUsersList();
    io.emit('users:online', users);
  } catch {}
}

async function getOnlineUsersCount() {
  if (!isRedisReady()) return 0;
  try {
    return await dataClient.hLen(ONLINE_USERS_KEY);
  } catch {
    return 0;
  }
}

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
    console.log(`[Socket] Connected: ${username} (${socket.id}) on instance ${INSTANCE_ID}`);

    await setUserOnline(userId, username);

    try {
      const userRooms = await messageModel.getUserRooms(userId);
      for (const room of userRooms) {
        socket.join(`room:${room.id}`);
      }
    } catch (err) {
      console.error('[Socket] Failed to load rooms on connect:', err);
    }

    await broadcastOnlineUsers(io);

    socket.on('room:join', async ({ roomId }) => {
      try {
        const isMember = await messageModel.isRoomMember(roomId, userId);
        if (isMember) socket.join(`room:${roomId}`);
      } catch {}
    });

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

    socket.on('typing:start', ({ roomId }) => {
      socket.to(`room:${roomId}`).emit('typing:update', { userId, username, roomId, isTyping: true });
    });

    socket.on('typing:stop', ({ roomId }) => {
      socket.to(`room:${roomId}`).emit('typing:update', { userId, username, roomId, isTyping: false });
    });

    socket.on('disconnect', async () => {
      console.log(`[Socket] Disconnected: ${username} (${socket.id})`);
      await setUserOffline(userId);
      await broadcastOnlineUsers(io);
    });
  });
}

module.exports = { setupSocketHandlers, getOnlineUsersCount };