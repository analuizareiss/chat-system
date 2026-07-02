#!/usr/bin/env node
/**
 * Teste de Integracao - Auth Service <-> Message Service
 * ---------------------------------------------------------
 * Diferente do load-test.js (foco em volume/carga), este script valida
 * CORRETUDE do fluxo entre os dois microsservicos, passando sempre pelo
 * load balancer (nginx-lb), nunca direto numa instancia:
 *
 *   1. Registra um usuario no auth-service (via LB)
 *   2. Faz login e obtem um accessToken
 *   3. Usa o token para criar uma sala 1:1 no message-service (via LB)
 *   4. Usa o token para criar uma sala em grupo (1:N) no message-service (via LB)
 *   5. Envia uma mensagem e le o historico de volta
 *   6. Repete a bateria de chamadas varias vezes e verifica, pelo campo
 *      `instanceId` do GET /health, que o load balancer esta de fato
 *      distribuindo as requisicoes entre replicas diferentes do
 *      message-service (prova de balanceamento, nao so de que "funciona
 *      com 1 container").
 *
 * Pre-requisito: stack rodando via `docker-compose up --build
 * --scale message-service=3 --scale auth-service=2`, com o nginx-lb
 * exposto em LB_PORT (default 8080).
 *
 * Execucao: node integration-test.js
 */

const http = require('http');
const assert = require('assert');

const LB_HOST = process.env.LB_HOST || 'localhost';
const LB_PORT = process.env.LB_PORT || 8080;

function request(path, method, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: LB_HOST, port: LB_PORT, path, method, headers },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

let passed = 0;
let failed = 0;

async function step(description, fn) {
  try {
    await fn();
    console.log(`   ${description}`);
    passed++;
  } catch (err) {
    console.log(`   ${description}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log(`\n Teste de Integracao Auth  Mensagens (via load balancer ${LB_HOST}:${LB_PORT})\n`);

  const ts = Date.now();
  const userA = { username: `itesta${ts}`, email: `itest_a_${ts}@test.com`, password: 'senha123' };
  const userB = { username: `itestb${ts}`, email: `itest_b_${ts}@test.com`, password: 'senha123' };

  let tokenA, userIdA, userIdB, directRoomId, groupRoomId;

  // 1. Registro de dois usuarios no auth-service
  await step('Registrar usuario A no auth-service', async () => {
    const res = await request('/auth/register', 'POST', userA);
    assert.strictEqual(res.status, 201, `esperado 201, recebido ${res.status}`);
    tokenA = res.body.accessToken;
    userIdA = res.body.user.id;
    assert.ok(tokenA, 'accessToken nao retornado');
  });

  await step('Registrar usuario B no auth-service', async () => {
    const res = await request('/auth/register', 'POST', userB);
    assert.strictEqual(res.status, 201, `esperado 201, recebido ${res.status}`);
    userIdB = res.body.user.id;
  });

  // 2. Login (garante que autenticacao funciona de forma independente do registro)
  await step('Login do usuario A no auth-service', async () => {
    const res = await request('/auth/login', 'POST', { username: userA.username, password: userA.password });
    assert.strictEqual(res.status, 200, `esperado 200, recebido ${res.status}`);
    tokenA = res.body.accessToken; // renova o token a partir do login
  });

  // 3. Usa o token emitido pelo auth-service para autenticar no message-service
  await step('Criar sala 1:1 (direct) no message-service usando token do auth-service', async () => {
    const res = await request('/api/rooms/direct', 'POST', { targetUserId: userIdB, targetUsername: userB.username }, tokenA);
    assert.strictEqual(res.status, 200, `esperado 200, recebido ${res.status}`);
    assert.strictEqual(res.body.room.type, 'direct');
    directRoomId = res.body.room.id;
  });

  // 4. Sala em grupo (1:N)
  await step('Criar sala em grupo (1:N) no message-service', async () => {
    const res = await request('/api/rooms/group', 'POST', { name: `Grupo Integracao ${ts}`, memberIds: [userIdB] }, tokenA);
    assert.strictEqual(res.status, 201, `esperado 201, recebido ${res.status}`);
    assert.strictEqual(res.body.room.type, 'group');
    groupRoomId = res.body.room.id;
  });

  // 5. Mensagem + historico, fechando o ciclo completo entre os dois servicos
  await step('Enviar mensagem na sala 1:1 e confirmar persistencia', async () => {
    const res = await request(`/api/rooms/${directRoomId}/messages`, 'POST', { content: 'Mensagem de teste de integracao' }, tokenA);
    assert.strictEqual(res.status, 201, `esperado 201, recebido ${res.status}`);
  });

  await step('Ler historico da sala 1:1 e encontrar a mensagem enviada', async () => {
    const res = await request(`/api/rooms/${directRoomId}/messages`, 'GET', null, tokenA);
    assert.strictEqual(res.status, 200, `esperado 200, recebido ${res.status}`);
    const found = res.body.messages.some((m) => m.content === 'Mensagem de teste de integracao');
    assert.ok(found, 'mensagem enviada nao encontrada no historico');
  });

  // 6. Rejeicao com token invalido (garante que a validacao JWT compartilhada
  // entre os dois servicos esta, de fato, em vigor no message-service)
  await step('Rejeitar requisicao ao message-service com token invalido', async () => {
    const res = await request(`/api/rooms/${groupRoomId}/messages`, 'POST', { content: 'nao deveria entrar' }, 'token-invalido');
    assert.strictEqual(res.status, 401, `esperado 401, recebido ${res.status}`);
  });

  // 7. Prova de balanceamento: bate repetidamente no /health do message-service
  // via LB e verifica que mais de uma replica (instanceId distinto) responde.
  await step('Confirmar que o load balancer distribui requisicoes entre replicas (instanceId variando)', async () => {
    const instanceIds = new Set();
    for (let i = 0; i < 20; i++) {
      const res = await request('/health-msg', 'GET');
      if (res.body?.instanceId) instanceIds.add(res.body.instanceId);
    }
    assert.ok(
      instanceIds.size > 1,
      `esperava respostas de mais de uma replica, mas so vi: ${[...instanceIds].join(', ')} ` +
      `(confirme que o compose foi iniciado com --scale message-service>=2)`
    );
    console.log(`     instancias observadas: ${[...instanceIds].join(', ')}`);
  });

  console.log('\n');
  console.log(`Resultado: ${passed} passaram, ${failed} falharam`);
  console.log('\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Erro fatal no teste de integracao:', err);
  process.exit(1);
});