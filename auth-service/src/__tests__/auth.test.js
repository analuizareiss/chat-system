/**
 * Para rodar os testes você precisa de um PostgreSQL rodando.
 * Use: DATABASE_URL=postgresql://chat:chat_pass@localhost:5432/chatdb_test npm test
 * Ou suba só o postgres com: docker-compose up postgres -d
 */
const request = require('supertest');

// Aponta para banco de teste dedicado
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  || process.env.DATABASE_URL
  || 'postgresql://chat:chat_pass@localhost:5432/chatdb_test';

const { pool, initDatabase } = require('../database');
const app = require('../index');

beforeAll(async () => {
  await initDatabase();
  // Limpa dados de testes anteriores
  await pool.query('TRUNCATE users, refresh_tokens CASCADE');
});

afterAll(async () => {
  await pool.query('TRUNCATE users, refresh_tokens CASCADE');
  await pool.end();
});

describe('Auth Service — PostgreSQL', () => {
  const ts = Date.now();
  const testUser = {
    username: `user${ts}`,
    email: `user${ts}@test.com`,
    password: 'password123',
  };

  let accessToken;
  let refreshToken;

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app).post('/auth/register').send(testUser);
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.user.username).toBe(testUser.username);
      expect(res.body.user).not.toHaveProperty('password_hash');
      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('should reject duplicate username', async () => {
      const res = await request(app).post('/auth/register').send(testUser);
      expect(res.status).toBe(409);
    });

    it('should reject invalid email', async () => {
      const res = await request(app).post('/auth/register').send({
        username: 'newuser999', email: 'not-an-email', password: 'password123',
      });
      expect(res.status).toBe(400);
    });

    it('should reject short password', async () => {
      const res = await request(app).post('/auth/register').send({
        username: 'newuser888', email: 'new@test.com', password: '123',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app).post('/auth/login').send({
        username: testUser.username, password: testUser.password,
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('should reject wrong password', async () => {
      const res = await request(app).post('/auth/login').send({
        username: testUser.username, password: 'wrongpassword',
      });
      expect(res.status).toBe(401);
    });

    it('should reject non-existent user', async () => {
      const res = await request(app).post('/auth/login').send({
        username: 'nobody_ever', password: 'password123',
      });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /auth/validate', () => {
    it('should validate a valid access token', async () => {
      const res = await request(app).get('/auth/validate')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
    });

    it('should reject invalid token', async () => {
      const res = await request(app).get('/auth/validate')
        .set('Authorization', 'Bearer invalidtoken123');
      expect(res.status).toBe(401);
    });

    it('should reject missing token', async () => {
      const res = await request(app).get('/auth/validate');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should return new tokens', async () => {
      const res = await request(app).post('/auth/refresh').send({ refreshToken });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });

    it('should reject invalid refresh token', async () => {
      const res = await request(app).post('/auth/refresh').send({ refreshToken: 'badtoken' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /health', () => {
    it('should return healthy', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });
  });
});
