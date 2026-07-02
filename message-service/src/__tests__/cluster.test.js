/**
 * Teste de cluster / escalabilidade horizontal
 * -----------------------------------------------
 * Sobe DUAS instancias reais de http.Server + Socket.IO (representando duas
 * replicas do message-service atras do nginx-lb), cada uma com seu proprio
 * @socket.io/redis-adapter apontando para o MESMO Redis.
 *
 * Isso prova exatamente o cenario que o load-test/docker-compose --scale
 * exercita em producao: dois clientes conectados a replicas diferentes,
 * sem nenhuma rede entre as duas instancias alem do Redis compartilhado,
 * ainda conseguem trocar mensagens em tempo real.
 *
 * Sem o adapter Redis, este teste falha por timeout (o evento nunca
 * atravessaria de uma instancia para a outra).
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  || process.env.DATABASE_URL
  || 'postgresql://chat:chat_pass@localhost:5432/chatdb_test';

const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { io: ioClient } = require('socket.io-client');
const jwt = require('jsonwebtoken');

const { pool, initDatabase } = require('../database');
const { connectRedis, pubClient, subClient, dataClient } = require('../redis');
const { setupSocketHandlers } = require('../socket/chat.socket');
const messageModel = require('../models/message.model');

const SECRET = process.env.JWT_SECRET || 'chat_access_secret_2026_cefet';
const makeToken = (userId, username) => jwt.sign({ userId, username }, SECRET, { expiresIn: '1h' });

function startInstance(redisAdapterFactory) {
  const httpServer = http.createServer();
  const io = new Server(httpServer, { transports: ['websocket'] });
  io.adapter(redisAdapterFactory());
  setupSocketHandlers(io);
  return new Promise((resolve) => {
    httpServer.listen(0, () => {
      const port = httpServer.address().port;
      resolve({ httpServer, io, port });
    });
  });
}

describe('Cluster - multiplas replicas do message-service via Redis adapter', () => {
  const userA = { userId: 'cluster-user-a', username: 'alice-cluster' };
  const userB = { userId: 'cluster-user-b', username: 'bob-cluster' };
  let roomId;
  let instanceA, instanceB;
  let clientA, clientB;

  beforeAll(async () => {
    await initDatabase();
    await connectRedis();
    await pool.query('TRUNCATE messages, room_members, rooms CASCADE');
    await dataClient.del('chat:online_users');

    const room = await messageModel.createRoom({
      name: 'Cluster Test Room',
      type: 'group',
      createdBy: userA.userId,
      memberIds: [userA.userId, userB.userId],
    });
    roomId = room.id;

    instanceA = await startInstance(() => createAdapter(pubClient, subClient));


    const pubClientB = pubClient.duplicate();
    const subClientB = pubClient.duplicate();
    await Promise.all([pubClientB.connect(), subClientB.connect()]);
    instanceB = await startInstance(() => createAdapter(pubClientB, subClientB));
    instanceB._pubClientB = pubClientB;
    instanceB._subClientB = subClientB;
  });

  afterAll(async () => {

    await Promise.all([
      clientA && new Promise((resolve) => { clientA.on('disconnect', resolve); clientA.disconnect(); }),
      clientB && new Promise((resolve) => { clientB.on('disconnect', resolve); clientB.disconnect(); }),
    ].filter(Boolean));


    await new Promise((resolve) => setTimeout(resolve, 300));

    await new Promise((resolve) => instanceA.httpServer.close(resolve));
    await new Promise((resolve) => instanceB.httpServer.close(resolve));
    await instanceB._pubClientB.quit();
    await instanceB._subClientB.quit();
    await pool.query('TRUNCATE messages, room_members, rooms CASCADE');

  });

  it('entrega uma mensagem enviada na replica A para um socket conectado na replica B', (done) => {
    const tokenA = makeToken(userA.userId, userA.username);
    const tokenB = makeToken(userB.userId, userB.username);

    clientA = ioClient(`http://localhost:${instanceA.port}`, { auth: { token: tokenA }, transports: ['websocket'] });
    clientB = ioClient(`http://localhost:${instanceB.port}`, { auth: { token: tokenB }, transports: ['websocket'] });

    let bJoined = false;
    let aReady = false;

    function trySend() {
      if (aReady && bJoined) {
        clientA.emit('message:send', { roomId, content: 'Ola da replica A!' });
      }
    }

    clientB.on('connect', () => {
      clientB.emit('room:join', { roomId });
      setTimeout(() => { bJoined = true; trySend(); }, 200);
    });

    clientA.on('connect', () => {
      aReady = true;
      trySend();
    });


    clientB.on('message:new', ({ message }) => {
      expect(message.content).toBe('Ola da replica A!');
      expect(message.sender_username).toBe(userA.username);
      done();
    });

    clientA.on('connect_error', (err) => done(err));
    clientB.on('connect_error', (err) => done(err));
  }, 10000);

  it('reflete usuarios online de ambas as replicas no estado compartilhado (Redis)', async () => {
    await new Promise((r) => setTimeout(r, 100));
    const raw = await dataClient.hGetAll('chat:online_users');
    const onlineIds = Object.keys(raw);
    expect(onlineIds).toContain(userA.userId);
    expect(onlineIds).toContain(userB.userId);
  });
});