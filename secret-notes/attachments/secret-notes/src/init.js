'use strict';

const crypto = require('node:crypto');
const { hashPassword } = require('./auth');

const DEV_ADMIN_PASSWORD = 'local-dev-password';

function initialize(db, flag) {
  const adminPassword = process.env.ADMIN_PASSWORD
    || (process.env.NODE_ENV === 'production' ? null : DEV_ADMIN_PASSWORD);
  if (!adminPassword) throw new Error('ADMIN_PASSWORD is required');
  const lockHash = hashPassword(crypto.randomBytes(16).toString('hex'));

  db.transaction(() => {
    const admin = db.prepare('SELECT id FROM users WHERE id = ?').get(1);
    if (admin) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .run(hashPassword(adminPassword), 1);
    } else {
      db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)')
        .run(1, 'admin', hashPassword(adminPassword));
      const insert = db.prepare('INSERT INTO notes (owner_id, title, body, priority, created_at) VALUES (?, ?, ?, ?, ?)');
      insert.run(1, '欢迎使用秘密便签', '在这里记录你的想法和计划。\n可以在「排序偏好」里调整便签的排列方式。', 1, '2026-09-02T09:12:00.000Z');
      insert.run(1, '本周清单', '整理书桌\n读完手边的书\n记下一个新的想法', 0, '2026-09-21T20:35:00.000Z');
    }

    const secretNote = db.prepare('SELECT id FROM notes WHERE owner_id = ? AND system_note = ?').get(1, 1);
    if (secretNote) {
      db.prepare('UPDATE notes SET body = ?, locked = ?, lock_hash = ? WHERE id = ?')
        .run(flag, 1, lockHash, secretNote.id);
    } else {
      db.prepare(`INSERT INTO notes (owner_id, title, body, priority, locked, lock_hash, system_note, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(1, '私密记录', flag, 2, 1, lockHash, 1, '2026-10-06T14:48:00.000Z');
    }
  })();
}

module.exports = { initialize };
