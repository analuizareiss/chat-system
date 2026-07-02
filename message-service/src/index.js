const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { initDatabase } = require('./database');
const { connectRedis, pubClient, subClient } = require('./redis');
const messageRoutes = require('./routes/message.routes');
const { setupSocketHandlers, getOnlineUsersCount } = require('./socket/chat.socket');

const app = express();
const server = http.createServer(app);
const PORT = process.env.MSG_PORT || 3002;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const INSTANCE_ID = process.env.HOSTNAME || `pid-${process.pid}`;

const io = new Server(server, {
  cors: { origin: FRONTEND_URL, methods: ['GET', 'POST'], credentials: true },
  transports: ['websocket', 'polling'],
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(morgan('combined'));
app.use(express.json());

app.get('/health', async (req, res) => {
  res.json({
    service: 'message-service',
    instanceId: INSTANCE_ID,
    status: 'healthy',
    onlineUsers: await getOnlineUsersCount(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', messageRoutes);
setupSocketHandlers(io);

async function start() {
  await initDatabase();
  await connectRedis();

  io.adapter(createAdapter(pubClient, subClient));

  server.listen(PORT, () => {
    console.log(`✅ Message Service running on port ${PORT} (instance: ${INSTANCE_ID})`);
    console.log(`📡 WebSocket ready (Redis adapter ativo)`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start message-service:', err);
    process.exit(1);
  });
}

module.exports = { app, server, io };