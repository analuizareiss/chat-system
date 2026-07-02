#!/usr/bin/env node
/**
 * Teste de Carga - Sistema de Chat Distribuido
 * Simula 10+ usuarios simultaneos fazendo login e trocando mensagens.
 *
 * Aponta para o load balancer (nginx-lb), nao mais para uma instancia
 * fixa de auth-service/message-service - assim o teste exercita o
 * cenario real de multiplas replicas (`docker-compose up --scale
 * auth-service=2 --scale message-service=3`).
 *
 * Execucao: node load-test.js
 */

const http = require('http');

const LB_HOST = process.env.LB_HOST || 'localhost';
const LB_PORT = process.env.LB_PORT || 8080;

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
    host: LB_HOST, port: LB_PORT,
    path, method,
    headers: { 'Content-Type': 'application/json' },
  }, body);
}

function msgRequest(path, method, token, body) {
  return request({
    host: LB_HOST, port: LB_PORT,
    path, method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  }, body);
}

// Consulta /health-msg (servido pelo nginx-lb) repetidamente para registrar
// quais replicas do message-service atenderam o trafego deste teste de
// carga - evidencia direta de que o balanceamento de carga esta ativo.
async function sampleInstanceIds(samples = 15) {
  const ids = new Set();
  for (let i = 0; i < samples; i++) {
    try {
      const res = await request({ host: LB_HOST, port: LB_PORT, path: '/health-msg', method: 'GET' });
      if (res.body?.instanceId) ids.add(res.body.instanceId);
    } catch { /* ignora falhas isoladas de amostragem */ }
  }
  return ids;
}

async function simulateUser(index) {
  const username = `lu${Date.now()}i${index}`;
  const email = `${username}@loadtest.com`;
  const password = 'testpass123';
  const start = Date.now();

  // Register
  const regRes = await authRequest('/auth/register', 'POST', { username, email, password });
  if (regRes.status !== 201) throw new Error(`Register failed for ${username}: ${regRes.status} ${JSON.stringify(regRes.body)}`);

  const { accessToken, user } = regRes.body;

  // Create a group room — memberIds deve conter pelo menos o proprio usuario
  const roomRes = await msgRequest('/api/rooms/group', 'POST', accessToken, {
    name: `loadroom${index}`,
    memberIds: [user.id],
  });

  if (!roomRes.body?.room?.id) {
    throw new Error(`Room creation failed for ${username}: ${roomRes.status} ${JSON.stringify(roomRes.body)}`);
  }

  const roomId = roomRes.body.room.id;

  // Send messages
  const msgResults = [];
  for (let m = 0; m < MESSAGES_PER_USER; m++) {
    const msgRes = await msgRequest(
      `/api/rooms/${roomId}/messages`, 'POST', accessToken,
      { content: `Mensagem ${m + 1} do usuario ${username}` }
    );
    msgResults.push(msgRes.status);
  }

  const elapsed = Date.now() - start;
  const allOk = msgResults.every((s) => s === 201);

  return { username, elapsed, msgResults, allOk };
}

async function main() {
  console.log(`\n Iniciando teste de carga com ${NUM_USERS} usuarios simultaneos...\n`);

  const overallStart = Date.now();

  const promises = Array.from({ length: NUM_USERS }, (_, i) => simulateUser(i));
  const results = await Promise.allSettled(promises);

  const totalTime = Date.now() - overallStart;
  const successful = results.filter((r) => r.status === 'fulfilled' && r.value.allOk);
  const failed = results.filter((r) => r.status === 'rejected' || !r.value?.allOk);

  // Amostra o /health-msg varias vezes para ver quantas replicas distintas
  // do message-service o load balancer usou para atender este teste.
  const instanceIds = await sampleInstanceIds();

  console.log('');
  console.log('         RESULTADO DO TESTE DE CARGA   ');
  console.log('');
  console.log(`Usuarios simulados:   ${NUM_USERS}`);
  console.log(`Mensagens por usuario: ${MESSAGES_PER_USER}`);
  console.log(`Total mensagens:      ${NUM_USERS * MESSAGES_PER_USER}`);
  console.log(`Bem-sucedidos:        ${successful.length}/${NUM_USERS}`);
  console.log(`Falhas:               ${failed.length}`);
  console.log(`Tempo total:          ${totalTime}ms`);
  console.log(`Throughput medio:     ${((NUM_USERS * MESSAGES_PER_USER) / (totalTime / 1000)).toFixed(1)} msgs/s`);
  console.log(`Replicas observadas:  ${instanceIds.size} (${[...instanceIds].join(', ') || 'n/d'})`);
  console.log('');

  results.forEach((r) => {
    if (r.status === 'fulfilled') {
      const { username, elapsed, allOk, msgResults } = r.value;
      console.log(`  ${allOk ? 'OK' : 'FAIL'} ${username.padEnd(35)} ${elapsed}ms msgs:${JSON.stringify(msgResults)}`);
    } else {
      console.log(`   Error: ${r.reason?.message}`);
    }
  });

  console.log('\n');

  if (instanceIds.size <= 1) {
    console.log(
      '  Apenas uma replica do message-service foi observada. Para provar\n' +
      '   escalabilidade horizontal, inicie a stack com, por exemplo:\n' +
      '   docker-compose up --build --scale message-service=3 --scale auth-service=2\n'
    );
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});