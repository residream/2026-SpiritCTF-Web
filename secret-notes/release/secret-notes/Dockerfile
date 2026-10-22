FROM node:20-bookworm-slim

# 生产环境：本地完全仿真线上部署（FLAG 必须注入，admin 密码由 provision.sh 随机生成）
ENV NODE_ENV=production \
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
COPY provision.sh /usr/local/bin/provision
RUN chmod 0755 /usr/local/bin/provision

USER 10001:10001
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/provision"]
CMD ["node", "src/app.js"]
