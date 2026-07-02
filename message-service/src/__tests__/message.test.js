process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  || process.env.DATABASE_URL
  || 'postgresql://chat:chat_pass@localhost:5432/chatdb_test';

const request = require('supertest');
const { pool, initDatabase } = require('../database');
const { connectRedis, disconnectRedis, dataClient } = require('../redis');
const { app } = require('../index');
const jwt = require('jsonwebtoken');

const SECRET = 'chat_access_secret_2026_cefet';
const makeToken = (userId, username) =>
  jwt.sign({ userId, username }, SECRET, { expiresIn: '1h' });

beforeAll(async () => {
  await initDatabase();
  await connectRedis();
  await pool.query('TRUNCATE messages, room_members, rooms CASCADE');
  await dataClient.del('chat:online_users');
});

afterAll(async () => {
  await pool.query('TRUNCATE messages, room_members, rooms CASCADE');
  await pool.end();
  await disconnectRedis();
});

describe('Message Service - PostgreSQL', () => {
  const user1 = { userId: 'user-pg-1', username: 'alice' };
  const user2 = { userId: 'user-pg-2', username: 'bob' };
  const token1 = makeToken(user1.userId, user1.username);
  let directRoomId;

  describe('GET /health', () => {
    it('should return healthy', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });
  });

  describe('POST /api/rooms/direct', () => {
    it('should create a direct room', async () => {
      const res = await request(app).post('/api/rooms/direct')
        .set('Authorization', `Bearer ${token1}`)
        .send({ targetUserId: user2.userId, targetUsername: user2.username });
      expect(res.status).toBe(200);
      expect(res.body.room.type).toBe('direct');
      directRoomId = res.body.room.id;
    });

    it('should return existing room on second call', async () => {
      const res = await request(app).post('/api/rooms/direct')
        .set('Authorization', `Bearer ${token1}`)
        .send({ targetUserId: user2.userId, targetUsername: user2.username });
      expect(res.status).toBe(200);
      expect(res.body.room.id).toBe(directRoomId);
    });

    it('should reject without auth', async () => {
      const res = await request(app).post('/api/rooms/direct')
        .send({ targetUserId: user2.userId });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/rooms/group', () => {
    it('should create a group', async () => {
      const res = await request(app).post('/api/rooms/group')
        .set('Authorization', `Bearer ${token1}`)
        .send({ name: 'PG Test Group', memberIds: [user2.userId] });
      expect(res.status).toBe(201);
      expect(res.body.room.type).toBe('group');
    });

    it('should reject missing name', async () => {
      const res = await request(app).post('/api/rooms/group')
        .set('Authorization', `Bearer ${token1}`)
        .send({ memberIds: [user2.userId] });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/rooms', () => {
    it('should return rooms for user', async () => {
      const res = await request(app).get('/api/rooms')
        .set('Authorization', `Bearer ${token1}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.rooms)).toBe(true);
      expect(res.body.rooms.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/rooms/:roomId/messages', () => {
    it('should persist a message', async () => {
      const res = await request(app)
        .post(`/api/rooms/${directRoomId}/messages`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ content: 'Ola Postgres!' });
      expect(res.status).toBe(201);
      expect(res.body.message.content).toBe('Ola Postgres!');
      expect(res.body.message.sender_username).toBe(user1.username);
    });

    it('should reject empty content', async () => {
      const res = await request(app)
        .post(`/api/rooms/${directRoomId}/messages`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ content: '   ' });
      expect(res.status).toBe(400);
    });

    it('should reject non-member', async () => {
      const outsider = makeToken('user-999', 'outsider');
      const res = await request(app)
        .post(`/api/rooms/${directRoomId}/messages`)
        .set('Authorization', `Bearer ${outsider}`)
        .send({ content: 'Intruso!' });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/rooms/:roomId/messages', () => {
    it('should return message history', async () => {
      const res = await request(app)
        .get(`/api/rooms/${directRoomId}/messages`)
        .set('Authorization', `Bearer ${token1}`);
      expect(res.status).toBe(200);
      expect(res.body.messages.length).toBeGreaterThan(0);
    });

    it('should reject non-member', async () => {
      const outsider = makeToken('user-999', 'outsider');
      const res = await request(app)
        .get(`/api/rooms/${directRoomId}/messages`)
        .set('Authorization', `Bearer ${outsider}`);
      expect(res.status).toBe(403);
    });
  });
});