const { pool } = require('../database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6',
];

class UserModel {
  async create({ username, email, password }) {
    const id = uuidv4();
    const passwordHash = bcrypt.hashSync(password, 12);
    const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    await pool.query(
      `INSERT INTO users (id, username, email, password_hash, avatar_color)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, username, email, passwordHash, avatarColor]
    );
    return this.findById(id);
  }

  async findById(id) {
    const { rows } = await pool.query(
      'SELECT id, username, email, avatar_color, status, created_at FROM users WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  }

  async findByUsername(username) {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    return rows[0] || null;
  }

  async findByEmail(email) {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return rows[0] || null;
  }

  async findAll() {
    const { rows } = await pool.query(
      'SELECT id, username, email, avatar_color, status, created_at FROM users ORDER BY username'
    );
    return rows;
  }

  async updateStatus(id, status) {
    await pool.query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, id]
    );
  }

  verifyPassword(plainPassword, hash) {
    return bcrypt.compareSync(plainPassword, hash);
  }

  async saveRefreshToken(userId, token, expiresAt) {
    const id = uuidv4();
    await pool.query(
      `INSERT INTO refresh_tokens (id, user_id, token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [id, userId, token, expiresAt.toISOString()]
    );
  }

  async findRefreshToken(token) {
    const { rows } = await pool.query(
      `SELECT rt.*, u.id as uid
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token = $1 AND rt.expires_at > NOW()`,
      [token]
    );
    return rows[0] || null;
  }

  async deleteRefreshToken(token) {
    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
  }

  async deleteAllRefreshTokens(userId) {
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
  }
}

module.exports = new UserModel();
