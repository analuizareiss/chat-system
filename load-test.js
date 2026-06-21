#!/usr/bin/env node
/**
 * Teste de Carga — Sistema de Chat Distribuído
 * Simula 10+ usuários simultâneos fazendo login e trocando mensagens
 * Execução: node load-test.js
 */

const http = require('http');

const AUTH_HOST = 'localhost';
const AUTH_PORT = 3001;
const MSG_HOST = 'localhost';
const MSG_PORT = 3002;

const NUM_USERS = 12;
const MESSAGES_PER_USER = 5;

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function authRequest(path, method, body) {
  return request({
    host: AUTH_HOST, port: AUTH_PORT,
    path, method,
    headers: { 'Content-Type': 'application/json' },
  }, body);
}

function msgRequest(path, method, token, body) {
  return request({
    host: MSG_HOST, port: MSG_PORT,
    path, method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  }, body);
}

async function simulateUser(index) {
  const username = `loaduser_${Date.now()}_${index}`;
  const email = `${username}@load.test`;
  const password = 'testpass123';
  const start = Date.now();

  // Register
  const regRes = await authRequest('/auth/register', 'POST', { username, email, password });
  if (regRes.status !== 201) throw new Error(`Register failed for ${username}: ${regRes.status}`);

  const { accessToken, user } = regRes.body;

  // Create/get a common group room
  const roomRes = await msgRequest('/api/rooms/group', 'POST', accessToken, {
    name: `load-test-room-${index % 3}`,
    memberIds: [],
  });

  const roomId = roomRes.body?.room?.id;

  // Send messages
  const msgResults = [];
  for (let m = 0; m < MESSAGES_PER_USER; m++) {
    const msgRes = await msgRequest(
      `/api/rooms/${roomId}/messages`, 'POST', accessToken,
      { content: `Mensagem ${m + 1} do usuário ${username}` }
    );
    msgResults.push(msgRes.status);
  }

  const elapsed = Date.now() - start;
  const allOk = msgResults.every((s) => s === 201);

  return { username, elapsed, msgResults, allOk };
}

async function main() {
  console.log(`\n🚀 Iniciando teste de carga com ${NUM_USERS} usuários simultâneos...\n`);

  const overallStart = Date.now();

  const promises = Array.from({ length: NUM_USERS }, (_, i) => simulateUser(i));
  const results = await Promise.allSettled(promises);

  const totalTime = Date.now() - overallStart;
  const successful = results.filter((r) => r.status === 'fulfilled' && r.value.allOk);
  const failed = results.filter((r) => r.status === 'rejected' || !r.value?.allOk);

  console.log('═══════════════════════════════════════');
  console.log('         RESULTADO DO TESTE DE CARGA   ');
  console.log('═══════════════════════════════════════');
  console.log(`Usuários simulados:   ${NUM_USERS}`);
  console.log(`Mensagens por usuário: ${MESSAGES_PER_USER}`);
  console.log(`Total mensagens:      ${NUM_USERS * MESSAGES_PER_USER}`);
  console.log(`Bem-sucedidos:        ${successful.length}/${NUM_USERS}`);
  console.log(`Falhas:               ${failed.length}`);
  console.log(`Tempo total:          ${totalTime}ms`);
  console.log(`Throughput médio:     ${((NUM_USERS * MESSAGES_PER_USER) / (totalTime / 1000)).toFixed(1)} msgs/s`);
  console.log('───────────────────────────────────────');

  results.forEach((r) => {
    if (r.status === 'fulfilled') {
      const { username, elapsed, allOk } = r.value;
      console.log(`  ${allOk ? '✅' : '❌'} ${username.padEnd(35)} ${elapsed}ms`);
    } else {
      console.log(`  ❌ Error: ${r.reason?.message}`);
    }
  });

  console.log('═══════════════════════════════════════\n');

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
