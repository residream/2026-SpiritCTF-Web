'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { openDatabase } = require('./db');
const { initialize } = require('./init');
const { createRoutes } = require('./routes');

function createApp() {
  const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '../data'));
  const flag = process.env.FLAG
    ?? (process.env.NODE_ENV === 'production' ? null : 'flag{fake_for_local_test}');
  if (typeof flag !== 'string' || flag.length === 0) throw new Error('FLAG is required in production');
  const secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  if (secret.length < 32) throw new Error('SESSION_SECRET must have at least 32 characters');
  const db = openDatabase(dataDir);
  try {
    initialize(db, flag);
  } catch (error) {
    db.close();
    throw error;
  }

  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../views'));
  app.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
    });
    next();
  });
  app.use('/assets', express.static(path.join(__dirname, '../public'), { dotfiles: 'deny', index: false }));
  app.get('/robots.txt', (req, res, next) => res.sendFile(path.join(dataDir, 'robots.txt'), (error) => { if (error) next(); }));
  app.use('/archive', express.static(path.join(dataDir, 'archive'), { dotfiles: 'deny', index: false }));
  app.use(express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 20 }));
  const store = new session.MemoryStore();
  app.use(session({
    name: 'secret_notes.sid',
    secret,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.SESSION_COOKIE_SECURE === '1', maxAge: 2 * 60 * 60 * 1000 }
  }));
  app.use((req, res, next) => {
    req.currentUser = req.session.userId
      ? db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.session.userId)
      : null;
    res.locals.currentUser = req.currentUser;
    res.locals.nav = '';
    res.locals.feedback = null;
    res.locals.dateLabel = (value) => new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(value));
    res.page = (view, data = {}, status = 200) => {
      const locals = { ...res.locals, title: '秘密便签', ...data };
      app.render(view, locals, (error, body) => {
        if (error) return next(error);
        res.status(status).render('layout', { ...locals, body });
      });
    };
    next();
  });
  app.use(createRoutes(db));
  app.use((req, res) => res.page('error', { title: '页面未找到', code: 404, message: '页面不存在。' }, 404));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500;
    res.page('error', { title: '暂时无法打开', code: status, message: status === 500 ? '暂时无法完成操作，请稍后重试。' : '提交内容不符合要求，请检查后重试。' }, status);
  });
  return { app, db, close: () => { store.clear(); db.close(); } };
}

if (require.main === module) {
  let instance;
  try {
    instance = createApp();
    const port = Number(process.env.PORT || 3000);
    const server = instance.app.listen(port, process.env.HOST || '0.0.0.0', () => {
      console.log(`秘密便签已启动，端口 ${port}`);
    });
    server.on('error', () => {
      console.error('服务无法启动，请检查监听地址和端口。');
      instance.close();
      process.exitCode = 1;
    });
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      server.close(() => { instance.close(); });
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  } catch {
    console.error('初始化失败，请检查数据目录、FLAG 和会话配置。');
    process.exitCode = 1;
  }
}

module.exports = { createApp };
