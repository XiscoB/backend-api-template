# ─────────────────────────────────────────────────────────────────
# Dockerfile for NestJS Backend (Development)
# ─────────────────────────────────────────────────────────────────
# This Dockerfile is intended for local development with Docker Compose.
# It is NOT optimized for production (no multi-stage build, no minimization).

FROM node:22-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./

# Copy prisma schema and config BEFORE npm install
COPY prisma ./prisma
COPY prisma.config.ts ./

# Install dependencies, skipping postinstall (prisma generate needs DATABASE_URL)
RUN npm install --ignore-scripts

# Generate Prisma client with dummy DATABASE_URL (only needed for client generation)
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate

# Copy the rest of the application
COPY . .

# Expose the application port
EXPOSE 3000

# Start the application in development mode
CMD ["npm", "run", "start:dev"]
