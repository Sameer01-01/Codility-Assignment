FROM node:20-slim AS builder
WORKDIR /app

# Copy monorepo manifests
COPY package*.json tsconfig.json ./
COPY database/package*.json ./database/
COPY backend/api/package*.json ./backend/api/
COPY backend/worker/package*.json ./backend/worker/
COPY frontend/package*.json ./frontend/

# Install ALL dependencies (including devDependencies)
RUN npm ci

# Copy source folders
COPY database ./database
COPY backend/worker ./backend/worker

# Generate Prisma Client and build
RUN npx prisma generate --schema=database/prisma/schema.prisma
RUN npm run build -w database
RUN npm run build -w backend/worker

FROM node:20-slim AS runner
WORKDIR /app

# Install openssl for Prisma compatibility
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY database/package*.json ./database/
COPY backend/worker/package*.json ./backend/worker/

# Install only production dependencies
RUN npm ci --omit=dev --workspace=worker --workspace=database
COPY database/prisma ./database/prisma
RUN npx prisma generate --schema=database/prisma/schema.prisma

COPY --from=builder /app/database/dist ./database/dist
COPY --from=builder /app/backend/worker/dist ./backend/worker/dist

ENV NODE_ENV=production
CMD ["npm", "run", "start", "-w", "backend/worker"]
