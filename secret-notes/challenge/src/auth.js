'use strict';

const crypto = require('node:crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${digest}`;
}

function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 256 || !stored) return false;
  const [salt, digest] = stored.split(':');
  const expected = Buffer.from(digest, 'hex');
  const actual = crypto.scryptSync(password, salt, 32);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function requireLogin(req, res, next) {
  if (!req.currentUser) return res.redirect(303, '/login');
  next();
}

module.exports = { hashPassword, verifyPassword, requireLogin };
