const { pool } = require('../database');
const { v4: uuidv4 } = require('uuid');

class MessageModel {
  async createRoom({ name, type, createdBy, memberIds }) {
    const id = uuidv4();
    await pool.query(
      'INSERT INTO rooms (id, name, type, created_by) VALUES ($1, $2, $3, $4)',
      [id, name || null, type, createdBy]
    );
    for (const uid of memberIds) {
      await pool.query(
        'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, uid]
      );
    }
    return this.getRoomById(id);
  }

  async getRoomById(id) {
    const { rows } = await pool.query('SELECT * FROM rooms WHERE id = $1', [id]);
    return rows[0] || null;
  }

  async findDirectRoom(userIdA, userIdB) {
    const { rows } = await pool.query(`
      SELECT r.* FROM rooms r
      JOIN room_members m1 ON m1.room_id = r.id AND m1.user_id = $1
      JOIN room_members m2 ON m2.room_id = r.id AND m2.user_id = $2
      WHERE r.type = 'direct'
        AND (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) = 2
      LIMIT 1
    `, [userIdA, userIdB]);
    return rows[0] || null;
  }

  async getUserRooms(userId) {
    const { rows } = await pool.query(`
      SELECT r.*,
        (SELECT content    FROM messages WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_message,
        (SELECT created_at FROM messages WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
        (SELECT sender_username FROM messages WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_sender
      FROM rooms r
      JOIN room_members rm ON rm.room_id = r.id
      WHERE rm.user_id = $1
      ORDER BY last_message_at DESC NULLS LAST, r.created_at DESC
    `, [userId]);
    return rows;
  }

  async getRoomMembers(roomId) {
    const { rows } = await pool.query(
      'SELECT user_id FROM room_members WHERE room_id = $1',
      [roomId]
    );
    return rows;
  }

  async isRoomMember(roomId, userId) {
    const { rows } = await pool.query(
      'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2',
      [roomId, userId]
    );
    return rows.length > 0;
  }

  async createMessage({ roomId, senderId, senderUsername, content, type = 'text' }) {
    const id = uuidv4();
    await pool.query(
      `INSERT INTO messages (id, room_id, sender_id, sender_username, content, type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, roomId, senderId, senderUsername, content, type]
    );
    return this.getMessageById(id);
  }

  async getMessageById(id) {
    const { rows } = await pool.query('SELECT * FROM messages WHERE id = $1', [id]);
    return rows[0] || null;
  }

  async getRoomMessages(roomId, limit = 50, before = null) {
    if (before) {
      const { rows } = await pool.query(
        `SELECT * FROM (
           SELECT * FROM messages WHERE room_id = $1 AND created_at < $2
           ORDER BY created_at DESC LIMIT $3
         ) sub ORDER BY created_at ASC`,
        [roomId, before, limit]
      );
      return rows;
    }
    const { rows } = await pool.query(
      `SELECT * FROM (
         SELECT * FROM messages WHERE room_id = $1
         ORDER BY created_at DESC LIMIT $2
       ) sub ORDER BY created_at ASC`,
      [roomId, limit]
    );
    return rows;
  }
}

module.exports = new MessageModel();
