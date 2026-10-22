#!/bin/sh
set -eu

if [ -z "${FLAG:-}" ]; then
    printf '%s\n' 'FLAG is required' >&2
    exit 1
fi

: "${DATA_DIR:=/app/data}"

if [ -z "${ADMIN_PASSWORD:-}" ]; then
    ADMIN_PASSWORD=$(node -e "process.stdout.write(require('node:crypto').randomBytes(16).toString('hex'))")
fi
export ADMIN_PASSWORD

umask 077
mkdir -p "$DATA_DIR/archive"
printf 'User-agent: *\nDisallow: /archive/deploy-notes.txt\n' > "$DATA_DIR/robots.txt"
cat > "$DATA_DIR/archive/deploy-notes.txt" <<EOF
秘密便签 / 部署交接记录
更新时间: $(date -u '+%Y-%m-%dT%H:%M:%SZ')
登录账号: admin
临时登录密码: $ADMIN_PASSWORD
登录密码与便签锁口令分别管理。
归档仅供部署交接，搜索引擎请勿收录。
EOF

exec "$@"
