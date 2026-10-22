'use strict';

const express = require('express');
const { requireLogin, verifyPassword } = require('./auth');

const USERNAME_MAX = 64;
const PASSWORD_MAX = 256;
const TITLE_MAX = 120;
const BODY_MAX = 12000;
const SORT_FIELD_MAX = 255;
const NOTE_ID_PATTERN = /^[1-9][0-9]*$/;
const PRIORITY_PATTERN = /^[0-2]$/;

const feedback = (text, kind = 'error') => ({ text, kind });
const wantsJson = (req) => req.accepts(['html', 'json']) === 'json';

function parseNoteId(raw) {
  if (!NOTE_ID_PATTERN.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

function validCredentials(username, password) {
  return typeof username === 'string' && username.length <= USERNAME_MAX
    && typeof password === 'string' && password.length <= PASSWORD_MAX;
}

function readNoteForm(input) {
  const title = typeof input.title === 'string' ? input.title : '';
  const body = typeof input.body === 'string' ? input.body : '';
  const priorityRaw = input.priority === undefined ? '0' : input.priority;
  const priority = typeof priorityRaw === 'string' ? priorityRaw : '';
  const valid = typeof input.title === 'string' && title.trim().length > 0 && title.length <= TITLE_MAX
    && typeof input.body === 'string' && body.length <= BODY_MAX
    && PRIORITY_PATTERN.test(priority);
  const values = {
    title: title.slice(0, TITLE_MAX),
    body: body.slice(0, BODY_MAX),
    priority: PRIORITY_PATTERN.test(priority) ? priority : '0'
  };
  return { valid, values };
}

function createRoutes(db) {
  const router = express.Router();

  const findOwnNote = (userId, rawId) => {
    const id = parseNoteId(rawId);
    if (id === null) return null;
    return db.prepare(
      'SELECT id, title, priority, locked, created_at FROM notes WHERE id = ? AND owner_id = ?'
    ).get(id, userId);
  };

  const noteIsUnlocked = (req, note) =>
    !note.locked || (req.session.unlockedNotes || []).includes(note.id);

  const showNote = (req, res, note, message = null, status = 200) => {
    const body = noteIsUnlocked(req, note)
      ? db.prepare('SELECT body FROM notes WHERE id = ? AND owner_id = ?').get(note.id, req.currentUser.id).body
      : null;
    res.page('note-detail', { title: note.title, nav: 'notes', note, noteBody: body, feedback: message }, status);
  };

  const takeNotice = (req) => {
    const notice = req.session.notice;
    delete req.session.notice;
    return notice ? feedback(notice, 'success') : null;
  };

  router.get('/healthz', (req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  });

  router.get('/', (req, res) => {
    res.redirect(303, req.currentUser ? '/notes' : '/login');
  });

  router.get('/login', (req, res) => {
    if (req.currentUser) return res.redirect(303, '/notes');
    res.page('login', { title: '登录', username: '' });
  });

  router.post('/login', (req, res, next) => {
    const { username, password } = req.body;
    const user = validCredentials(username, password)
      ? db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(username)
      : null;
    if (!user || !verifyPassword(password, user.password_hash)) {
      const shownName = typeof username === 'string' ? username.slice(0, USERNAME_MAX) : '';
      return res.page('login', { title: '登录', username: shownName, feedback: feedback('账号或密码不正确。') }, 401);
    }
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.userId = user.id;
      req.session.save((saveError) => saveError ? next(saveError) : res.redirect(303, '/notes'));
    });
  });

  router.post('/logout', requireLogin, (req, res, next) => {
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie('secret_notes.sid');
      res.redirect(303, '/login');
    });
  });

  router.get('/notes', requireLogin, (req, res) => {
    const { sort_field, sort_dir } = db.prepare('SELECT sort_field, sort_dir FROM users WHERE id = ?').get(req.currentUser.id);
    let list;
    try {
      list = db.prepare(
        `SELECT id, title, priority, locked, created_at
         FROM notes
         WHERE owner_id = ?
         ORDER BY ${sort_field} ${sort_dir}, id ASC`
      ).all(req.currentUser.id);
    } catch {
      if (wantsJson(req)) return res.status(400).json({ error: '排序偏好暂时不可用，请重新设置。' });
      return res.page('error', { title: '无法排列便签', nav: 'notes', code: 400, message: '排序偏好暂时不可用，请到排序设置中重新保存。', settingsLink: true }, 400);
    }
    if (wantsJson(req)) return res.json({ notes: list });
    res.page('notes', { title: '我的便签', nav: 'notes', notes: list, feedback: takeNotice(req) });
  });

  router.get('/notes/new', requireLogin, (req, res) => {
    res.page('new-note', { title: '新建便签', nav: 'new', values: { title: '', body: '', priority: '0' } });
  });

  router.post('/notes', requireLogin, (req, res) => {
    const { valid, values } = readNoteForm(req.body);
    if (!valid) {
      return res.page('new-note', { title: '新建便签', nav: 'new', values, feedback: feedback('请填写标题，并确认正文长度和优先级符合要求。') }, 400);
    }
    const created = db.prepare('INSERT INTO notes (owner_id, title, body, priority) VALUES (?, ?, ?, ?)')
      .run(req.currentUser.id, values.title.trim(), values.body, Number(values.priority));
    res.redirect(303, `/notes/${created.lastInsertRowid}`);
  });

  router.get('/notes/:id', requireLogin, (req, res) => {
    const note = findOwnNote(req.currentUser.id, req.params.id);
    if (!note) return res.page('error', { title: '便签未找到', code: 404, message: '这条便签暂时无法打开。' }, 404);
    showNote(req, res, note);
  });

  router.post('/notes/:id/unlock', requireLogin, (req, res, next) => {
    const note = findOwnNote(req.currentUser.id, req.params.id);
    if (!note) return res.page('error', { title: '便签未找到', code: 404, message: '这条便签暂时无法打开。' }, 404);
    if (!note.locked) return res.redirect(303, `/notes/${note.id}`);

    const { lock_hash } = db.prepare('SELECT lock_hash FROM notes WHERE id = ? AND owner_id = ?').get(note.id, req.currentUser.id);
    if (!verifyPassword(req.body.lock_password, lock_hash)) {
      return showNote(req, res, note, feedback('锁口令不正确，请再试一次。'), 403);
    }
    req.session.unlockedNotes = [...new Set([...(req.session.unlockedNotes || []), note.id])];
    req.session.save((error) => error ? next(error) : res.redirect(303, `/notes/${note.id}`));
  });

  router.get('/settings', requireLogin, (req, res) => {
    const { sort_field, sort_dir } = db.prepare('SELECT sort_field, sort_dir FROM users WHERE id = ?').get(req.currentUser.id);
    res.page('settings', { title: '排序偏好', nav: 'settings', sortField: sort_field, sortDir: sort_dir, feedback: takeNotice(req) });
  });

  router.post('/settings', requireLogin, (req, res) => {
    const field = typeof req.body.sort_field === 'string' ? req.body.sort_field.trim() : '';
    const dir = req.body.sort_dir === 'asc' ? 'asc' : 'desc';
    if (!field || field.length > SORT_FIELD_MAX) {
      return res.page('settings', { title: '排序偏好', nav: 'settings', sortField: 'created_at', sortDir: 'desc', feedback: feedback('请选择排序方式。') }, 400);
    }
    db.prepare('UPDATE users SET sort_field = ?, sort_dir = ? WHERE id = ?').run(field, dir, req.currentUser.id);
    req.session.notice = '排序偏好已保存。';
    res.redirect(303, '/settings');
  });

  return router;
}

module.exports = { createRoutes };
