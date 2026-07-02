# Sistema de Chat Distribuido
**CEFET-MG | Sistemas Distribuidos | 2026/1 | Professora: Michelle Hanne**

## Arquitetura

+--------------------------------------------------+
|                   FRONTEND                        |
|         React + Vite (porta 5173)                 |
|    WebSocket (Socket.IO) + REST (Axios)           |
+--------------------+-----------------------------+
                     |
                     v
            +-----------------+
            |    nginx-lb      |   (porta 8080)
            | Load Balancer    |   round-robin entre replicas
            +----+--------+---+
                 |        |
        +--------+        +--------+
        v                          v
+------------------+     +----------------------+
|  auth-service    |     |  message-service      |
|  (N replicas)    |     |  (N replicas)         |
|  Express.js      |     |  Express + Socket.IO  |
+--------+---------+     +-------+----------+----+
         |                       |          |
         |                       |          v
         |                       |     +---------+
         |                       |     |  Redis   |
         |                       |     +---------+
         |                       |
         +-----------+-----------+
                     v
            +------------------+
            |   PostgreSQL 16   |
            |   banco: chatdb   |
            +------------------+

### Stack tecnologica
- **Backend:** Node.js + Express.js
- **Banco de dados:** PostgreSQL 16
- **Tempo real:** Socket.IO + @socket.io/redis-adapter
- **Cache/coordenacao entre replicas:** Redis 7
- **Autenticacao:** JWT (access token 15min + refresh token rotativo 7 dias)
- **Frontend:** React 18 + Vite + CSS Modules
- **Load balancing:** Nginx (nginx-lb), round-robin via DNS interno do Docker
- **Deploy:** Docker + Docker Compose

---

## Pre-requisitos

- Node.js 20+
- Docker e Docker Compose

---

## Como rodar

### Modo basico (1 replica de cada servico)

docker-compose up --build

Acesse: http://localhost:5173

### Modo escalavel (multiplas replicas - recomendado para apresentacao)

docker-compose up --build --scale auth-service=2 --scale message-service=3

O nginx-lb distribui as requisicoes entre as replicas automaticamente.
O Redis garante que mensagens e usuarios online sejam sincronizados entre
todas as replicas do message-service.

---

## Verificar o load balancing

Com a stack rodando com multiplas replicas, abra outro terminal e rode:

# Windows (PowerShell)
for ($i=1; $i -le 9; $i++) { (curl -UseBasicParsing http://localhost:8080/health-msg).Content | ConvertFrom-Json | Select-Object instanceId }

# Linux/Mac
for i in $(seq 1 9); do curl -s http://localhost:8080/health-msg | grep instanceId; done

O campo instanceId muda a cada chamada, alternando entre as replicas.

---

## Testes

### Pre-requisito: criar o banco de teste (so na primeira vez)

docker exec -it chat-postgres psql -U chat -d chatdb -c "CREATE DATABASE chatdb_test;"

### Auth Service

# Windows
cd auth-service
$env:TEST_DATABASE_URL="postgresql://chat:chat_pass@localhost:5433/chatdb_test"
npm test

# Linux/Mac
cd auth-service
TEST_DATABASE_URL=postgresql://chat:chat_pass@localhost:5433/chatdb_test npm test

### Message Service

# Windows
cd message-service
$env:TEST_DATABASE_URL="postgresql://chat:chat_pass@localhost:5433/chatdb_test"
$env:REDIS_URL="redis://localhost:6379"
$env:JWT_SECRET="chat_access_secret_2026_cefet"
npm test

# Linux/Mac
cd message-service
TEST_DATABASE_URL=postgresql://chat:chat_pass@localhost:5433/chatdb_test \
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=chat_access_secret_2026_cefet \
npm test

O message-service roda 3 suites de teste:
- message.test.js  - testes de integracao REST (salas, mensagens, autenticacao)
- cluster.test.js  - prova de escalabilidade horizontal: duas instancias reais
  do Socket.IO via Redis adapter, confirma que mensagens atravessam replicas

### Teste de integracao Auth <-> Mensagens (via load balancer)

Com a stack rodando:

node integration-test.js

Valida o fluxo completo (registro, login, criar sala 1:1 e grupo, enviar mensagem,
ler historico) passando sempre pelo load balancer, e confirma que multiplas
replicas do message-service respondem.

### Teste de carga (12 usuarios simultaneos)

node load-test.js

Simula 12 usuarios fazendo registro e enviando mensagens ao mesmo tempo.
Reporta throughput e quantas replicas distintas atenderam as requisicoes.

---

## Estrutura do projeto

chat-system/
|-- auth-service/
|   |-- src/
|   |   |-- index.js           Entry point (Express)
|   |   |-- database.js        Pool PostgreSQL + initDatabase()
|   |   |-- routes/            auth.routes.js
|   |   |-- models/            user.model.js
|   |   |-- helpers/           jwt.helper.js
|   |   +-- __tests__/         auth.test.js
|   +-- Dockerfile
|
|-- message-service/
|   |-- src/
|   |   |-- index.js           Entry point (Express + Socket.IO + Redis adapter)
|   |   |-- database.js        Pool PostgreSQL + initDatabase()
|   |   |-- redis.js           Cliente Redis (pub/sub/data + connect/disconnect)
|   |   |-- routes/            message.routes.js
|   |   |-- models/            message.model.js
|   |   |-- middleware/        auth.middleware.js
|   |   |-- socket/            chat.socket.js
|   |   +-- __tests__/         message.test.js + cluster.test.js
|   +-- Dockerfile
|
|-- nginx-lb/
|   |-- nginx.conf             Load balancer entre replicas (DNS dinamico Docker)
|   +-- Dockerfile
|
|-- frontend/
|   |-- src/
|   |   |-- App.jsx
|   |   |-- contexts/          AuthContext, SocketContext
|   |   |-- hooks/             useChat.js
|   |   |-- pages/             AuthPage, ChatPage
|   |   |-- components/        Sidebar, ChatWindow
|   |   +-- services/          api.js (Axios + refresh automatico de token)
|   |-- Dockerfile
|   +-- nginx.conf             Proxy para o nginx-lb
|
|-- docker-compose.yml         postgres + redis + auth + message + nginx-lb + frontend
|-- load-test.js               Teste de carga (12 usuarios, via load balancer)
|-- integration-test.js        Teste de integracao Auth<->Mensagens (via load balancer)
+-- README.md

---

## Conectando no banco (DBeaver)

1. New Connection -> PostgreSQL
2. Host: localhost | Port: 5433
3. Database: chatdb | User: chat | Password: chat_pass
4. Test Connection -> Finish

A porta 5433 e a porta publicada no host. Dentro da rede Docker os
servicos usam postgres:5432 (porta interna).

---

## Decisoes de projeto

**Por que JWT compartilhado em vez de chamada HTTP entre servicos?**
O message-service valida o token JWT localmente usando o mesmo JWT_SECRET
do auth-service (configurado via variavel de ambiente no docker-compose).
Isso evita acoplamento sincrono e ponto unico de falha: o message-service
nao depende do auth-service estar no ar para validar cada mensagem.

**Por que Redis adapter no Socket.IO?**
Sem o adapter, cada replica do message-service so conhece os sockets
conectados a ela propria. Com o adapter, io.to(sala).emit() propaga via
Redis pub/sub para todas as replicas, entregando a mensagem independente
de qual replica o destinatario esta conectado.

**Por que DNS dinamico no Nginx em vez de upstream fixo?**
Com docker-compose --scale, o Docker cria N containers sob o mesmo nome
de servico e o DNS interno (127.0.0.11) faz round-robin entre os IPs.
Usando resolver + variavel no proxy_pass, o Nginx re-resolve o nome a
cada requisicao, distribuindo a carga entre todas as replicas ativas.