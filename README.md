# Distributed Job Scheduling Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)
[![Node: >=20](https://img.shields.io/badge/Node->=%2020-blue.svg)](https://nodejs.org/)
[![Database: PostgreSQL 16](https://img.shields.io/badge/Database-PostgreSQL%2016-blue.svg)](https://www.postgresql.org/)
[![Queue Engine: Redis 7](https://img.shields.io/badge/Queue%20Engine-Redis%207-red.svg)](https://redis.io/)

A production-inspired, highly available, distributed job scheduling platform built in TypeScript that reliably executes asynchronous background jobs across multiple worker processes. It is supported by a real-time web dashboard, PostgreSQL state tracking, Redis concurrency checks, and raw SQL transactional locking.

Repository Link: [https://github.com/Sameer01-01/Codility-Assignment.git](https://github.com/Sameer01-01/Codility-Assignment.git)

---

## 🏗️ Architecture

```
   ┌────────────────────────────────────────────────────────┐
   │                  React Nginx Web UI                    │
   │                (Vite + Tailwind + WS)                  │
   └───────────▲────────────────────────────────┬───────────┘
               │ WebSockets (Socket.IO)         │ HTTP REST
               │ (Job / Worker state)           │ API Calls
   ┌───────────┴────────────────────────────────▼───────────┐
   │                   Express API Node                     │
   │               (Socket.IO Server + JWT)                 │
   └───────────▲────────────────────────────────┬───────────┘
               │ Redis Pub/Sub                  │
               │ (Cross-Process Updates)        │ Prisma Query
   ┌───────────┴──────────┐           ┌─────────▼───────────┐
   │     Redis 7 Cache    │           │    PostgreSQL 16    │
   │  (Concurrency/Event  │           │ (Jobs, Logs, States)│
   │     Broker Engine)   │           └─────────▲───────────┘
   └───────────▲──────────┘                     │
               │ Redis Pub/Sub                  │ SQL Transact
               │ (Worker heartbeats/jobs)       │ (Claim / Lock)
   ┌───────────┴────────────────────────────────┴───────────┐
   │                Distributed Worker Cluster              │
   │              (Concurrency Polling Engine)              │
   └────────────────────────────────────────────────────────┘
```

The platform consists of five core layers:
1. **Database (`database`):** Holds state records. Shared utilities compile down to ES Modules (`/dist`) for common access.
2. **REST API & WebSockets (`backend/api`):** Serves REST routes, validates data with Zod, checks user authentication (JWT), and coordinates real-time state broadcasts using Redis Pub/Sub.
3. **Worker Cluster (`backend/worker`):** Independent polling nodes that atomically lock eligible jobs, check concurrency limits in Redis, compile thread load metrics, and run task executors.
4. **Cache & Concurrency Engine (`redis`):** Limits queue overflows (INCR/DECR counters per queue ID) and acts as an event broker between worker processes and the API.
5. **Dashboard (`frontend`):** Vite React SPA containing live graphs (Recharts), workers tracking monitor, dead-letter triage table, queue configuration sliders, and real-time execution logs.

---

## 🚀 Key Features

*   **5 Advanced Job Types:**
    *   **Immediate:** Runs immediately upon submission.
    *   **Delayed:** Deferred runs based on custom delay offsets (`runAt = now + delayMs`).
    *   **Scheduled:** Runs at a specific, designated ISO timestamp.
    *   **Recurring (Cron):** reschedules a fresh job task automatically after each successful completion using `cron-parser` expressions (e.g. `*/5 * * * *`).
    *   **Batch:** Submits multiple job specifications under a shared `batchId` and returns aggregate progress indices (`% complete`).
*   **Atomic Claiming Transaction:** Employs raw SQL transaction locking (`SELECT ... FOR UPDATE SKIP LOCKED`) inside Postgres, ensuring that no two workers can claim the same job, preventing race conditions.
*   **Redis Concurrency Checking:** Enforces queue concurrency limits across the entire cluster using Redis counters, suspending claims once limits are reached.
*   **Robust Fault Tolerance & Retries:** Custom retry configurations supporting `FIXED`, `LINEAR`, and `EXPONENTIAL` delays, and pushes exhausted jobs into the **Dead Letter Queue (DLQ)** with failure telemetry.
*   **Stuck-Worker Recovery (Reaper):** Periodic checker recovering orphaned jobs (`CLAIMED`/`RUNNING`) belonging to crashed workers (based on stale heartbeats) and requeues them.
*   **Real-time synchronization:** Socket.IO pushes state updates and worker load status directly to the UI dynamically.

---

## 🛠️ Monorepo Workspace Structure

```
job-scheduler/
├── docker-compose.yml              # Cluster config (Postgres, Redis, API, Worker, UI)
├── package.json                    # Workspace definitions
├── .env.example / .env             # Connection credentials
├── database/                       # Database package (Shared)
│   ├── prisma/
│   │   ├── schema.prisma           # Prisma database schema definition
│   │   └── migrations/             # SQL migrations history
│   └── src/
│       ├── types.ts                # Shared TypeScript types
│       ├── retryPolicy.ts          # Delay calculations logic
│       ├── logger.ts               # Structured Pino logger
│       ├── prismaClient.ts         # Shared database client instance
│       └── seed.ts                 # Sample demo seeder script
├── backend/
│   ├── api/                        # Express API Package
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── server.ts           # Binds Websockets & Redis Pub/Sub
│   │       ├── app.ts              # Route mappings
│   │       ├── middleware/         # JWT Auth, validation, errors handlers
│   │       └── modules/            # Auth, Orgs, Projects, Queues, Jobs controllers
│   └── worker/                     # Worker Cluster Package
│       ├── Dockerfile
│       └── src/
│           ├── index.ts            # Orchestrates polling, heartbeats, and reapers
│           ├── claim.ts            # Atomic SELECT FOR UPDATE transaction
│           ├── executor.ts         # Task runner & retry calculations
│           ├── reaper.ts           # Crashed worker watchdog
│           ├── heartbeat.ts        # Regular worker checkins
│           └── handlers/           # Simulators (Emails, Images, Reports)
└── frontend/                       # Vite React Dashboard Package
    ├── Dockerfile                  # Builds code and serves via Nginx on port 80
    ├── tailwind.config.js          # Premium styling configuration
    └── src/
        ├── App.tsx                 # Core layout and routers
        ├── api/                    # Axios clients & WS Socket.io connections
        ├── store/                  # React state provider
        └── pages/                  # Login, Projects, Queues, Workers, Jobs, DLQ, Metrics
```

---

## 📦 Prerequisites

Make sure you have the following installed:
*   [Node.js](https://nodejs.org/) (Version >= 20.0.0)
*   [Docker Desktop](https://www.docker.com/products/docker-desktop/) (For cluster containerization)

---

## 🐳 Quick Start: Running with Docker Compose (Recommended)

This is the easiest way to launch the entire stack (Postgres, Redis, API, Worker, and Nginx Frontend) with database initialization, migrations, and seeding completed automatically.

### 1. Stop local PostgreSQL (Important)
If you have a local PostgreSQL server running on Windows, it occupies port `5432` and will block Docker. Stop it by opening **PowerShell as Administrator** and running:
```powershell
Stop-Service -Name postgresql*
```

### 2. Run the Stack
Run the following command at the root directory to build and launch all containers:
```bash
# Wipe previous volumes to clear conflicting DB records
docker compose down -v

# Build and start all services in the background
docker compose up -d --build
```

### 3. Check Logs (Verification)
You can verify the database migration and seeding status by checking the API logs:
```bash
docker logs -f scheduler-api
```
*You should see `Database seeded successfully` followed by `API Server is running on port 3000`.*

### 4. Scale Workers (Optional)
To verify distributed workload claiming, you can spin up multiple worker processes:
```bash
docker compose up -d --scale worker=3
```
*Check the **Active Workers** panel on the dashboard in the browser to see the new nodes register and divide tasks.*

---

## 💻 Running Locally (Development Mode)

If you prefer to run the services outside Docker, follow these steps:

### 1. Database & Cache Services
Ensure you have local instances of PostgreSQL and Redis running. Update your root **`.env`** file with your database credentials:
```env
DATABASE_URL="postgresql://root:root@localhost:5432/jobscheduler?schema=public"
REDIS_URL="redis://localhost:6379"
```

### 2. Setup Database State
Run the following commands to install dependencies, push schemas, and seed the demo data:
```bash
# 1. Install dependencies
npm install

# 2. Push schemas and generate local clients
npm run generate -w database
npm run migrate -w database

# 3. Populate database with initial tasks
npm run seed
```

### 3. Launch Services
Open separate terminal instances and launch the respective services:
```bash
# Start API Server (Runs on port 3000)
npm run dev:api

# Start Background Worker Process
npm run dev:worker

# Start Vite React Dashboard (Runs on port 5173)
npm run dev:frontend
```

---

## 🧪 Running Automated Tests

The workspace features a full Vitest test suite verifying Auth flows, job types, retry delay logic, DLQ boundaries, and concurrency race conditions. Run them directly from the root workspace:

```bash
# Runs tests in all workspaces
npm test
```

*Results:*
```bash
> api@1.0.0 test
✓ tests/jobs.test.ts (3 tests)
✓ tests/auth.test.ts (2 tests)

> worker@1.0.0 test
✓ tests/claim.test.ts (3 tests)
✓ tests/retryPolicy.test.ts (5 tests)
```

---

## 🔑 Demo Login Credentials

Once the dashboard launches (at [http://localhost:5173](http://localhost:5173)), log in using the pre-seeded admin user:

*   **Email:** `admin@example.com`
*   **Password:** `admin123`

*(You can also use the **"Create account"** link at the bottom of the screen to sign up with a new email/password).*
