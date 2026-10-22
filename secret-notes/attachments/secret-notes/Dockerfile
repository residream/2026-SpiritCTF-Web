FROM node:20-bookworm-slim

# 开发环境用于本地测试，线上部署为生产环境
ENV NODE_ENV=development \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/app/data

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && groupadd --gid 10001 challenge \
    && useradd --uid 10001 --gid challenge --no-create-home challenge \
    && mkdir -p /app/data \
    && chown 10001:10001 /app/data \
    && chmod 700 /app/data

COPY src/ ./src/
COPY views/ ./views/
COPY public/ ./public/

USER 10001:10001
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/app.js"]
