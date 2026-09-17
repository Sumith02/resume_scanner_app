# Multi-stage Dockerfile for Resume Scanner
# Stage 1: Build Frontend Assets
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html tsconfig*.json vite.config.ts ./
COPY src ./src
COPY public ./public
RUN npm run build

# Stage 2: Production Python Backend + Embedded SPA
FROM python:3.11-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

# Install system dependencies (curl, build-essential for any native extensions)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency installation
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy Python project definition
COPY pyproject.toml uv.lock ./

# Install python dependencies into system environment
RUN uv pip install --system --no-cache -r pyproject.toml

# Copy backend application code
COPY backend ./backend
COPY api ./api

# Copy compiled frontend from Stage 1 into /app/dist
COPY --from=frontend-builder /app/dist ./dist

# Create storage directory for local documents if using filesystem storage
RUN mkdir -p /app/storage

EXPOSE 8000

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
