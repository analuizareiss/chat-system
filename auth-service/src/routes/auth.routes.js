const express = require('express');
const Joi = require('joi');
const userModel = require('../models/user.model');
const jwtHelper = require('../helpers/jwt.helper');

const router = express.Router();

const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).max(100).required(),
});

const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

router.post('/register', async (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const { username, email, password } = value;

  try {
    if (await userModel.findByUsername(username)) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    if (await userModel.findByEmail(email)) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = await userModel.create({ username, email, password });
    const accessToken = jwtHelper.generateAccessToken({ userId: user.id, username: user.username });
    const refreshToken = jwtHelper.generateRefreshToken({ userId: user.id });
    const expiresAt = jwtHelper.getRefreshExpiry();

    await userModel.saveRefreshToken(user.id, refreshToken, expiresAt);

    return res.status(201).json({ user, accessToken, refreshToken });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const { username, password } = value;

  try {
    const user = await userModel.findByUsername(username);
    if (!user || !userModel.verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = jwtHelper.generateAccessToken({ userId: user.id, username: user.username });
    const refreshToken = jwtHelper.generateRefreshToken({ userId: user.id });
    const expiresAt = jwtHelper.getRefreshExpiry();

    await userModel.saveRefreshToken(user.id, refreshToken, expiresAt);
    await userModel.updateStatus(user.id, 'online');

    const { password_hash, ...safeUser } = user;
    return res.json({ user: safeUser, accessToken, refreshToken });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

  try {
    const payload = jwtHelper.verifyRefreshToken(refreshToken);
    const storedToken = await userModel.findRefreshToken(refreshToken);

    if (!storedToken) return res.status(401).json({ error: 'Invalid or expired refresh token' });

    const user = await userModel.findById(payload.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    await userModel.deleteRefreshToken(refreshToken);

    const newAccessToken = jwtHelper.generateAccessToken({ userId: user.id, username: user.username });
    const newRefreshToken = jwtHelper.generateRefreshToken({ userId: user.id });
    const expiresAt = jwtHelper.getRefreshExpiry();

    await userModel.saveRefreshToken(user.id, newRefreshToken, expiresAt);

    return res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

router.post('/logout', async (req, res) => {
  const { refreshToken, userId } = req.body;
  try {
    if (refreshToken) await userModel.deleteRefreshToken(refreshToken);
    if (userId) await userModel.updateStatus(userId, 'offline');
  } catch {}
  return res.json({ message: 'Logged out successfully' });
});

router.get('/validate', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const payload = jwtHelper.verifyAccessToken(token);
    const user = await userModel.findById(payload.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    return res.json({ valid: true, user });
  } catch {
    return res.status(401).json({ valid: false, error: 'Invalid token' });
  }
});

router.get('/users', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    jwtHelper.verifyAccessToken(authHeader.split(' ')[1]);
    const users = await userModel.findAll();
    return res.json({ users });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
