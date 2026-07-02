# Sistema de Chat Distribuído
**CEFET-MG | Sistemas Distribuídos | 2026/1 | Professora: Michelle Hanne**

## Arquitetura

```text
+--------------------------------------------------+
|                   FRONTEND                       |
|           React + Vite (porta 5173)              |
|     WebSocket (Socket.IO) + REST (Axios)         |
+--------------------+-----------------------------+
                     |
                     v
            +-----------------+
            |    nginx-lb     |   (porta 8080)
            | Load Balancer   |   round-robin entre replicas
            +----+--------+---+
                 |        |
        +--------+        +--------+
        v                          v
+------------------+     +----------------------+
|  auth-service    |     |  message-service     |
|  (N replicas)    |     |  (N replicas)        |
|  Express.js      |     |  Express + Socket.IO |
+--------+---------+     +-------+----------+----+
         |                       |          |
         |                       |          v
         |                       |     +---------+
         |                       |     |  Redis  |
         |                       |     +---------+
         +-----------+-----------+
                     v
            +------------------+
            |   PostgreSQL 16  |
            |   banco: chatdb  |
            +------------------+
```

### Stack tecnológica
- **Backend:** Node.js + Express.js
- **Banco de dados:** PostgreSQL 16
- **Tempo real:** Socket.IO + @socket.io/redis-adapter
- **Cache/coordenação entre réplicas:** Redis 7
- **Autenticação:** JWT (access token 15min + refresh token rotativo 7 dias)
- **Frontend:** React 18 + Vite + CSS Modules
- **Load balancing:** Nginx (nginx-lb), round-robin via DNS interno do Docker
- **Deploy:** Docker + Docker Compose

---

## Pré-requisitos

- Node.js 20+
- Docker e Docker Compose

---

## Como rodar

### Modo básico (1 réplica de cada serviço)

```bash
docker-compose up --build
```
Acesse: http://localhost:5173

### Modo escalável (múltiplas réplicas - recomendado para apresentação)

```bash
docker-compose up --build --scale auth-service=2 --scale message-service=3
```
O `nginx-lb` distribui as requisições entre as réplicas automaticamente. 
O Redis garante que mensagens e usuários online sejam sincronizados entre todas as réplicas do `message-service`.

---

## Verificar o load balancing

Com a stack rodando com múltiplas réplicas, abra outro terminal e rode:

**Windows (PowerShell)**
```powershell
for ($i=1; $i -le 9; $i++) { (curl -UseBasicParsing http://localhost:8080/health-msg).Content | ConvertFrom-Json | Select-Object instanceId }
```

**Linux/Mac**
```bash
for i in $(seq 1 9); do curl -s http://localhost:8080/health-msg | grep instanceId; done
```

O campo `instanceId` muda a cada chamada, alternando entre as réplicas.

---

## Testes

### Pré-requisito: criar o banco de teste (só na primeira vez)

```bash
docker exec -it chat-postgres psql -U chat -d chatdb -c "CREATE DATABASE chatdb_test;"
```

### Auth Service

**Windows**
```powershell
cd auth-service
$env:TEST_DATABASE_URL="postgresql://chat:chat_pass@localhost:5433/chatdb_test"
npm test
```

**Linux/Mac**
```bash
cd auth-service
TEST_DATABASE_URL=postgresql://chat:chat_pass@localhost:5433/chatdb_test npm test
```

### Message Service

**Windows**
```powershell
cd message-service
$env:TEST_DATABASE_URL="postgresql://chat:chat_pass@localhost:5433/chatdb_test"
$env:REDIS_URL="redis://localhost:6379"
$env:JWT_SECRET="chat_access_secret_2026_cefet"
npm test
```

**Linux/Mac**
```bash
cd message-service
TEST_DATABASE_URL=postgresql://chat:chat_pass@localhost:5433/chatdb_test \
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=chat_access_secret_2026_cefet \
npm test
```

O `message-service` roda 3 suítes de teste:
- `message.test.js` - testes de integração REST (salas, mensagens, autenticação)
- `cluster.test.js` - prova de escalabilidade horizontal: duas instâncias reais do Socket.IO via Redis adapter, confirma que mensagens atravessam réplicas

### Teste de integração Auth <-> Mensagens (via load balancer)

Com a stack rodando:

```bash
node integration-test.js
```

Valida o fluxo completo (registro, login, criar sala 1:1 e grupo, enviar mensagem, ler histórico) passando sempre pelo load balancer, e confirma que múltiplas réplicas do `message-service` respondem.

### Teste de carga (12 usuários simultâneos)

```bash
node load-test.js
```

Simula 12 usuários fazendo registro e enviando mensagens ao mesmo tempo. Reporta throughput e quantas réplicas distintas atenderam as requisições.

---

## Estrutura do projeto

```text
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
```

---

## Conectando no banco (DBeaver)

1. **New Connection** -> PostgreSQL
2. **Host:** `localhost` | **Port:** `5433`
3. **Database:** `chatdb` | **User:** `chat` | **Password:** `chat_pass`
4. **Test Connection** -> Finish

A porta `5433` é a porta publicada no host. Dentro da rede Docker os serviços usam `postgres:5432` (porta interna).

---

## Decisões de projeto

**Por que JWT compartilhado em vez de chamada HTTP entre serviços?**
O `message-service` valida o token JWT localmente usando o mesmo `JWT_SECRET` do `auth-service` (configurado via variável de ambiente no `docker-compose`). Isso evita acoplamento síncrono e ponto único de falha: o `message-service` não depende do `auth-service` estar no ar para validar cada mensagem.

**Por que Redis adapter no Socket.IO?**
Sem o adapter, cada réplica do `message-service` só conhece os sockets conectados a ela própria. Com o adapter, `io.to(sala).emit()` propaga via Redis pub/sub para todas as réplicas, entregando a mensagem independente de qual réplica o destinatário está conectado.

**Por que DNS dinâmico no Nginx em vez de upstream fixo?**
Com `docker-compose --scale`, o Docker cria N containers sob o mesmo nome de serviço e o DNS interno (`127.0.0.11`) faz round-robin entre os IPs. Usando resolver + variável no `proxy_pass`, o Nginx re-resolve o nome a cada requisição, distribuindo a carga entre todas as réplicas ativas.
