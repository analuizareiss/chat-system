const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';


const pubClient = createClient({ url: REDIS_URL });
const subClient = pubClient.duplicate();
const dataClient = pubClient.duplicate();

pubClient.on('error', (err) => console.error('[Redis pub] error:', err));
subClient.on('error', (err) => console.error('[Redis sub] error:', err));
dataClient.on('error', (err) => console.error('[Redis data] error:', err));

let connected = false;

async function connectRedis() {
  if (connected) return;
  await Promise.all([pubClient.connect(), subClient.connect(), dataClient.connect()]);
  connected = true;
  console.log('Redis conectado (pub/sub/data)');
}


async function disconnectRedis() {
  if (!connected) return;
  await Promise.all([
    pubClient.quit().catch(() => {}),
    subClient.quit().catch(() => {}),
    dataClient.quit().catch(() => {}),
  ]);
  connected = false;
}

module.exports = { pubClient, subClient, dataClient, connectRedis, disconnectRedis, REDIS_URL };