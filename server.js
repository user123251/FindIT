'use strict';
// FindIt server: zero dependencies. Needs Node 22.13+ (built-in SQLite).
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const PORT = process.env.PORT || 3000;
const DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || '').toLowerCase().replace(/^@/, ''); // e.g. university.edu
const CATEGORIES = ['Electronics', 'Wallets', 'Keys', 'IDs & Cards', 'Bags', 'Clothing', 'Books', 'Other'];
const LOCATIONS = ['Main Library', 'Student Canteen', 'Sports Complex', 'Science Block', 'Engineering Block', 'Hostel Area', 'Lecture Hall Complex', 'Bus Stop / Parking', 'Auditorium'];
const PUB = path.join(__dirname, 'public'), DATA = path.join(__dirname, 'data'), UP = path.join(DATA, 'uploads');
for (const f of ['index.html', 'css/style.css', 'js/app.js']) if (!fs.existsSync(path.join(PUB, f))) {
  console.error(`\nMissing file: public/${f}\nKeep the folder structure: server.js must sit next to a "public" folder holding index.html, css/ and js/.\nSee README.md for the layout.\n`); process.exit(1) }
fs.mkdirSync(UP, { recursive: true });
const db = new DatabaseSync(path.join(DATA, 'findit.db'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, type TEXT NOT NULL CHECK(type IN('lost','found')), title TEXT NOT NULL, category TEXT NOT NULL, location TEXT NOT NULL, date TEXT NOT NULL, description TEXT NOT NULL, photo TEXT, done INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE, from_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, reply TEXT NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_items_date ON items(date);`);
const Q = s => db.prepare(s);
const err = (code, message) => Object.assign(new Error(message), { code });
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const str = (v, min, max, label) => { v = typeof v === 'string' ? v.trim() : ''; if (v.length < min || v.length > max) throw err(400, `${label} must be ${min}–${max} characters.`); return v };

const hits = new Map(); // simple rate limiter: key -> timestamps
function limit(key, max, ms) { const now = Date.now(), a = (hits.get(key) || []).filter(t => now - t < ms); if (a.length >= max) throw err(429, 'Too many attempts. Please wait a minute and try again.'); a.push(now); hits.set(key, a) }
setInterval(() => { const n = Date.now(); for (const [k, a] of hits) if (!a.some(t => n - t < 36e5)) hits.delete(k); Q('DELETE FROM sessions WHERE expires<?').run(n) }, 6e5).unref();

function userOf(req) { const m = /(?:^|;\s*)fi_sid=([a-f0-9]{64})/.exec(req.headers.cookie || ''); if (!m) return null;
  return Q('SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').get(sha(m[1]), Date.now()) || null }
function startSession(res, uid) { const t = crypto.randomBytes(32).toString('hex'), life = 14 * 864e5;
  Q('INSERT INTO sessions VALUES(?,?,?)').run(sha(t), uid, Date.now() + life);
  res.setHeader('Set-Cookie', `fi_sid=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${life / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`) }
const need = u => { if (!u) throw err(401, 'Please sign in to continue.'); return u };
const pub = (r, uid) => ({ id: r.id, type: r.type, title: r.title, category: r.category, location: r.location, date: r.date, desc: r.description, photo: r.photo, done: !!r.done, poster: r.poster.split(' ')[0], mine: r.user_id === uid });
const SEL = 'SELECT i.*,u.name AS poster FROM items i JOIN users u ON u.id=i.user_id';

const routes = [
  ['GET', /^\/meta$/, () => ({ categories: CATEGORIES, locations: LOCATIONS, domain: DOMAIN })],
  ['GET', /^\/me$/, (c) => ({ user: c.user })],
  ['GET', /^\/stats$/, () => ({ lost: Q("SELECT COUNT(*) n FROM items WHERE type='lost' AND done=0").get().n, found: Q("SELECT COUNT(*) n FROM items WHERE type='found' AND done=0").get().n, reunited: Q('SELECT COUNT(*) n FROM items WHERE done=1').get().n })],
  ['POST', /^\/register$/, (c) => {
    limit('auth' + c.ip, 10, 6e4);
    const name = str(c.b.name, 2, 60, 'Name'), email = str(c.b.email, 5, 120, 'Email').toLowerCase(), pw = str(c.b.password, 8, 100, 'Password');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err(400, 'Enter a valid email address.');
    if (DOMAIN && !email.endsWith('@' + DOMAIN)) throw err(400, `Use your university email (@${DOMAIN}).`);
    if (Q('SELECT 1 FROM users WHERE email=?').get(email)) throw err(409, 'An account with this email already exists. Sign in instead.');
    const salt = crypto.randomBytes(16).toString('hex'), id = Number(Q('INSERT INTO users(name,email,salt,hash,created) VALUES(?,?,?,?,?)').run(name, email, salt, hashPw(pw, salt), Date.now()).lastInsertRowid);
    startSession(c.res, id); return { user: { id, name, email } } }],
  ['POST', /^\/login$/, (c) => {
    limit('auth' + c.ip, 10, 6e4);
    const email = String(c.b.email || '').trim().toLowerCase(), u = Q('SELECT * FROM users WHERE email=?').get(email);
    const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(String(c.b.password || ''), u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
    if (!ok) throw err(401, 'Email or password is incorrect.');
    startSession(c.res, u.id); return { user: { id: u.id, name: u.name, email: u.email } } }],
  ['POST', /^\/logout$/, (c) => { const m = /fi_sid=([a-f0-9]{64})/.exec(c.req.headers.cookie || ''); if (m) Q('DELETE FROM sessions WHERE token=?').run(sha(m[1])); c.res.setHeader('Set-Cookie', 'fi_sid=; Max-Age=0; Path=/'); return { ok: true } }],
  ['GET', /^\/items$/, (c) => {
    const q = c.query, w = [], a = [];
    if (q.type === 'lost' || q.type === 'found') { w.push('i.type=?'); a.push(q.type) }
    if (CATEGORIES.includes(q.category)) { w.push('i.category=?'); a.push(q.category) }
    if (LOCATIONS.includes(q.location)) { w.push('i.location=?'); a.push(q.location) }
    if (q.q) { const l = '%' + q.q.slice(0, 60).replace(/[%_\\]/g, '\\$&') + '%'; w.push("(i.title LIKE ? ESCAPE '\\' OR i.description LIKE ? ESCAPE '\\' OR i.category LIKE ? ESCAPE '\\' OR i.location LIKE ? ESCAPE '\\')"); a.push(l, l, l, l) }
    const d = q.sort === 'old' ? 'ASC' : 'DESC';
    return { items: Q(`${SEL} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY i.date ${d}, i.id ${d} LIMIT 200`).all(...a).map(r => pub(r, c.user && c.user.id)) } }],
  ['POST', /^\/items$/, (c) => {
    const u = need(c.user), b = c.b;
    limit('post' + u.id, 20, 864e5);
    const type = b.type, title = str(b.title, 2, 60, 'Item name'), description = str(b.desc, 5, 300, 'Description');
    if (!['lost', 'found'].includes(type)) throw err(400, 'Choose lost or found.');
    if (!CATEGORIES.includes(b.category)) throw err(400, 'Choose a category.');
    if (!LOCATIONS.includes(b.location)) throw err(400, 'Choose a location.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || isNaN(Date.parse(b.date)) || b.date > new Date().toISOString().slice(0, 10)) throw err(400, 'Enter a valid date that is not in the future.');
    let photo = null;
    if (b.photo) { const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(b.photo); if (!m) throw err(400, 'Photo must be a JPEG, PNG or WebP image.');
      const buf = Buffer.from(m[2], 'base64'); if (buf.length > 1.5e6) throw err(413, 'Photo is too large.');
      const f = crypto.randomBytes(10).toString('hex') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]); fs.writeFileSync(path.join(UP, f), buf); photo = '/uploads/' + f }
    const id = Number(Q('INSERT INTO items(user_id,type,title,category,location,date,description,photo,created) VALUES(?,?,?,?,?,?,?,?,?)').run(u.id, type, title, b.category, b.location, b.date, description, photo, Date.now()).lastInsertRowid);
    return { item: pub(Q(`${SEL} WHERE i.id=?`).get(id), u.id) } }],
  ['POST', /^\/items\/(\d+)\/resolve$/, (c, id) => { const u = need(c.user); if (!Q('UPDATE items SET done=1 WHERE id=? AND user_id=?').run(id, u.id).changes) throw err(404, 'Item not found.'); return { ok: true } }],
  ['DELETE', /^\/items\/(\d+)$/, (c, id) => { const u = need(c.user), it = Q('SELECT photo FROM items WHERE id=? AND user_id=?').get(id, u.id); if (!it) throw err(404, 'Item not found.');
    Q('DELETE FROM items WHERE id=?').run(id); if (it.photo) fs.rm(path.join(UP, path.basename(it.photo)), () => {}); return { ok: true } }],
  ['POST', /^\/items\/(\d+)\/messages$/, (c, id) => {
    const u = need(c.user); limit('msg' + u.id, 30, 864e5);
    const it = Q('SELECT user_id,done FROM items WHERE id=?').get(id); if (!it) throw err(404, 'Item not found.');
    if (it.user_id === u.id) throw err(400, 'This is your own post.'); if (it.done) throw err(400, 'This item has already been resolved.');
    Q('INSERT INTO messages(item_id,from_user,reply,body,created) VALUES(?,?,?,?,?)').run(id, u.id, str(c.b.reply, 3, 100, 'Contact details'), str(c.b.text, 2, 500, 'Message'), Date.now()); return { ok: true } }],
  ['GET', /^\/my\/items$/, (c) => { const u = need(c.user); return { items: Q(`${SEL} WHERE i.user_id=? ORDER BY i.id DESC`).all(u.id).map(r => pub(r, u.id)) } }],
  ['GET', /^\/my\/messages$/, (c) => { const u = need(c.user); return { messages: Q('SELECT m.id,m.item_id,m.reply,m.body,m.created,i.title,f.name AS from_name FROM messages m JOIN items i ON i.id=m.item_id JOIN users f ON f.id=m.from_user WHERE i.user_id=? ORDER BY m.created DESC LIMIT 200').all(u.id) } }],
];

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'";
function readBody(req) { return new Promise((ok, no) => { let n = 0; const c = [];
  req.on('data', d => { n += d.length; if (n > 2.2e6) { no(err(413, 'Request too large.')); req.destroy() } else c.push(d) });
  req.on('end', () => { try { ok(c.length ? JSON.parse(Buffer.concat(c)) : {}) } catch { no(err(400, 'Invalid request.')) } }) }) }
function serveFile(res, p) {
  const up = p.startsWith('/uploads/'), base = up ? UP : PUB, f = path.join(base, up ? p.slice(9) : p);
  if (!f.startsWith(base + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found') }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': up ? 'public, max-age=31536000, immutable' : 'no-cache' });
  fs.createReadStream(f).pipe(res) }

http.createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy', CSP); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin');
  const url = new URL(req.url, 'http://x');
  try {
    let p = decodeURIComponent(url.pathname);
    if (!p.startsWith('/api/')) { if (req.method !== 'GET' && req.method !== 'HEAD') throw err(405, 'Method not allowed.'); return serveFile(res, p === '/' ? '/index.html' : p) }
    if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'fetch') throw err(403, 'Forbidden.'); // CSRF guard
    const sub = p.slice(4), ip = req.socket.remoteAddress;
    for (const [m, re, fn] of routes) { const mt = m === req.method && re.exec(sub); if (!mt) continue;
      const ctx = { req, res, ip, query: Object.fromEntries(url.searchParams), user: userOf(req), b: m === 'GET' ? {} : await readBody(req) };
      const out = JSON.stringify(fn(ctx, mt[1])); // run first so handlers can set cookies
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(out) }
    throw err(404, 'Not found.');
  } catch (e) {
    const code = e.code && Number.isInteger(e.code) ? e.code : 500; if (code === 500) console.error(e);
    if (res.headersSent) return res.end();
    res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: code === 500 ? 'Server error. Please try again.' : e.message }));
  }
}).listen(PORT, () => console.log(`FindIt running at http://localhost:${PORT}`));
