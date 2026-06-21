# DistChat — Sistema de Chat Distribuído
**CEFET-MG | Sistemas Distribuídos | 2026/1 | Professora: Michelle Hanne**

## Arquitetura

```
┌─────────────────────────────────────────────────┐
│                   FRONTEND                      │
│         React + Vite (porta 5173)               │
│    WebSocket (Socket.IO) + REST (Axios)         │
└───────────────┬─────────────────────────────────┘
                │ HTTP / WebSocket
        ┌───────┴────────┐
        ▼                ▼
┌──────────────┐  ┌──────────────────┐
│ auth-service │  │ message-service  │
│  porta 3001  │  │   porta 3002     │
│  Express.js  │  │ Express + WS     │
│              │  │ Socket.IO        │
└──────┬───────┘  └──────┬───────────┘
       │                 │
       └────────┬────────┘
                ▼
       ┌─────────────────┐
       │   PostgreSQL 16  │
       │    porta 5432    │
       │  banco: chatdb   │
       └─────────────────┘
```

### Stack tecnológica
- **Backend:** Node.js + Express.js
- **Banco de dados:** PostgreSQL 16 (pool de conexões via `pg`)
- **Tempo real:** Socket.IO (WebSocket com fallback polling)
- **Autenticação:** JWT (access token 15min + refresh token rotativo 7 dias)
- **Frontend:** React 18 + Vite + CSS Modules
- **Deploy:** Docker + Docker Compose + Nginx

---

## Pré-requisitos

- Node.js 20+
- Docker e Docker Compose

---

## Rodando com Docker (recomendado)

```bash
docker-compose up --build
```

Acesse: **http://localhost:5173**

O Docker sobe automaticamente: PostgreSQL → auth-service → message-service → frontend.

---

## Rodando localmente (desenvolvimento)

### 1. Subir apenas o PostgreSQL via Docker
```bash
docker-compose up postgres -d
```

### 2. Auth Service
```bash
cd auth-service
npm install
DATABASE_URL=postgresql://chat:chat_pass@localhost:5432/chatdb npm run dev
```

### 3. Message Service
```bash
cd message-service
npm install
DATABASE_URL=postgresql://chat:chat_pass@localhost:5432/chatdb npm run dev
```

### 4. Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## Testes

Necessário ter o PostgreSQL rodando com um banco de teste:

```bash
# Cria o banco de teste (uma vez só)
docker-compose up postgres -d
docker exec -it chat-postgres psql -U chat -c "CREATE DATABASE chatdb_test;"

# Roda os testes
cd auth-service
TEST_DATABASE_URL=postgresql://chat:chat_pass@localhost:5432/chatdb_test npm test

cd message-service
TEST_DATABASE_URL=postgresql://chat:chat_pass@localhost:5432/chatdb_test npm test
```

## Teste de Carga (10+ usuários simultâneos)

```bash
# Com os serviços rodando:
node load-test.js
```

---

## Conectando no DBeaver

1. New Connection → PostgreSQL
2. Host: `localhost` | Port: `5432`
3. Database: `chatdb` | User: `chat` | Password: `chat_pass`
4. Test Connection → Finish

---

## Estrutura do projeto

```
chat-system/
├── auth-service/
│   ├── src/
│   │   ├── index.js          # Entry point
│   │   ├── database.js       # Pool PostgreSQL + initDatabase()
│   │   ├── routes/           # auth.routes.js
│   │   ├── models/           # user.model.js
│   │   ├── helpers/          # jwt.helper.js
│   │   └── __tests__/
│   └── Dockerfile
│
├── message-service/
│   ├── src/
│   │   ├── index.js          # Entry point
│   │   ├── database.js       # Pool PostgreSQL + initDatabase()
│   │   ├── routes/           # message.routes.js
│   │   ├── models/           # message.model.js
│   │   ├── middleware/       # auth.middleware.js
│   │   ├── socket/           # chat.socket.js
│   │   └── __tests__/
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── contexts/         # AuthContext, SocketContext
│   │   ├── hooks/            # useChat.js
│   │   ├── pages/            # AuthPage, ChatPage
│   │   ├── components/       # Sidebar, ChatWindow
│   │   └── services/         # api.js
│   ├── Dockerfile
│   └── nginx.conf
│
├── docker-compose.yml        # postgres + auth + message + frontend
├── load-test.js
└── README.md
```
