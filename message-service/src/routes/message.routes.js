const express = require('express');
const { authMiddleware } = require('../middleware/auth.middleware');
const messageModel = require('../models/message.model');

const router = express.Router();
router.use(authMiddleware);

router.get('/rooms', async (req, res) => {
  try {
    const rooms = await messageModel.getUserRooms(req.user.userId);
    res.json({ rooms });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

router.post('/rooms/direct', async (req, res) => {
  const { targetUserId, targetUsername } = req.body;
  if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });

  try {
    let room = await messageModel.findDirectRoom(req.user.userId, targetUserId);

    if (!room) {
      room = await messageModel.createRoom({
        type: 'direct',
        createdBy: req.user.userId,
        memberIds: [req.user.userId, targetUserId],
      });

      await messageModel.createMessage({
        roomId: room.id,
        senderId: 'system',
        senderUsername: 'system',
        content: `Conversa iniciada entre ${req.user.username} e ${targetUsername || targetUserId}`,
        type: 'system',
      });
    }

    const members = await messageModel.getRoomMembers(room.id);
    res.json({ room, members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create/get direct room' });
  }
});

router.post('/rooms/group', async (req, res) => {
  const { name, memberIds } = req.body;
  if (!name || !memberIds?.length) {
    return res.status(400).json({ error: 'name and memberIds required' });
  }

  try {
    const allMembers = [...new Set([req.user.userId, ...memberIds])];
    const room = await messageModel.createRoom({
      name,
      type: 'group',
      createdBy: req.user.userId,
      memberIds: allMembers,
    });

    await messageModel.createMessage({
      roomId: room.id,
      senderId: 'system',
      senderUsername: 'system',
      content: `Grupo "${name}" criado por ${req.user.username}`,
      type: 'system',
    });

    const members = await messageModel.getRoomMembers(room.id);
    res.status(201).json({ room, members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

router.get('/rooms/:roomId/messages', async (req, res) => {
  const { roomId } = req.params;
  const { limit = 50, before } = req.query;

  try {
    const isMember = await messageModel.isRoomMember(roomId, req.user.userId);
    if (!isMember) return res.status(403).json({ error: 'Not a member of this room' });

    const messages = await messageModel.getRoomMessages(roomId, parseInt(limit), before);
    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.post('/rooms/:roomId/messages', async (req, res) => {
  const { roomId } = req.params;
  const { content } = req.body;

  if (!content?.trim()) return res.status(400).json({ error: 'Content required' });

  try {
    const isMember = await messageModel.isRoomMember(roomId, req.user.userId);
    if (!isMember) return res.status(403).json({ error: 'Not a member of this room' });

    const message = await messageModel.createMessage({
      roomId,
      senderId: req.user.userId,
      senderUsername: req.user.username,
      content: content.trim(),
    });
    res.status(201).json({ message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;
