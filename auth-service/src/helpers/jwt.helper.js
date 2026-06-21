const jwt = require('jsonwebtoken');

const ACCESS_SECRET = process.env.JWT_SECRET || 'chat_access_secret_2026_cefet';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'chat_refresh_secret_2026_cefet';
const ACCESS_EXPIRES = '15m';
const REFRESH_EXPIRES = '7d';

function generateAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
}

function generateRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });
}

function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

function getRefreshExpiry() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date;
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  getRefreshExpiry,
};
