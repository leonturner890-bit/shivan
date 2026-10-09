require('dotenv').config();
const express = require('express'), http = require('http'), { Server } = require('socket.io');
const { Pool } = require('pg'), bcrypt = require('bcrypt'), jwt = require('jsonwebtoken');
const cookie = require('cookie'), cookieParser = require('cookie-parser');
const helmet = require('helmet'), rateLimit = require('express-rate-limit'), crypto = require('crypto');

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('Set JWT_SECRET in .env');
const prod = process.env.NODE_ENV === 'production';

const app = express(), server = http.createServer(app), io = new Server(server);
app.set('trust proxy', 1);
app.use(helmet());

// --- Stripe webhook (needs the raw body, so it comes before express.json) ---
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const ev = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    const o = ev.data.object;
    if (ev.type === 'checkout.session.completed')
      await db.query(`INSERT INTO subscriptions(couple_id,stripe_customer_id,stripe_sub_id) VALUES($1,$2,$3)
        ON CONFLICT(couple_id) DO UPDATE SET status='active',stripe_sub_id=$3,updated_at=now()`,
        [o.client_reference_id, o.customer, o.subscription]);
    if (ev.type === 'customer.subscription.deleted')
      await db.query(`UPDATE subscriptions SET status='canceled',updated_at=now() WHERE stripe_sub_id=$1`, [o.id]);
    res.sendStatus(200);
  } catch { res.sendStatus(400); }
});

app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
// CSRF: SameSite cookie + JSON only + same-origin check on writes
app.use((req, res, next) => {
  const o = req.headers.origin;
  if (req.method !== 'GET' && o && new URL(o).host !== req.headers.host) return res.sendStatus(403);
  next();
});
app.use(express.static('public'));

const wrap = f => (req, res) => f(req, res).catch(e => { console.error(e); res.status(500).json({ error: 'Server error' }); });
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true });
const setToken = (res, id) => res.cookie('t', jwt.sign({ id }, SECRET, { expiresIn: '30d' }),
  { httpOnly: true, sameSite: 'lax', secure: prod, maxAge: 30 * 864e5 });

async function profile(id) {
  const { rows } = await db.query(`
    SELECT u.id,u.name,u.email,u.couple_id,c.invite_code AS code,
      (SELECT p.name FROM users p WHERE p.couple_id=u.couple_id AND p.id<>u.id LIMIT 1) AS partner,
      EXISTS(SELECT 1 FROM subscriptions s WHERE s.couple_id=u.couple_id AND s.status='active') AS premium
    FROM users u LEFT JOIN couples c ON c.id=u.couple_id WHERE u.id=$1`, [id]);
  return rows[0];
}
const auth = async (req, res, next) => {
  try { const { id } = jwt.verify(req.cookies.t, SECRET); req.user = await profile(id); if (!req.user) throw 0; next(); }
  catch { res.status(401).json({ error: 'Please log in' }); }
};

// --- Auth ---
app.post('/api/register', authLimit, wrap(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '') || (password || '').length < 8)
    return res.status(400).json({ error: 'Enter your name, a valid email and a password of 8+ characters.' });
  try {
    const { rows } = await db.query('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',
      [name.trim().slice(0, 60), email.trim(), await bcrypt.hash(password, 12)]);
    setToken(res, rows[0].id); res.json(await profile(rows[0].id));
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That email already has an account. Try logging in.' });
    throw e;
  }
}));
app.post('/api/login', authLimit, wrap(async (req, res) => {
  const { rows } = await db.query('SELECT id,password_hash FROM users WHERE lower(email)=lower($1)', [String(req.body.email || '')]);
  if (!rows[0] || !(await bcrypt.compare(String(req.body.password || ''), rows[0].password_hash)))
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  setToken(res, rows[0].id); res.json(await profile(rows[0].id));
}));
app.get('/api/me', auth, (req, res) => res.json(req.user));
app.delete('/api/me', auth, wrap(async (req, res) => { // delete-my-account
  await db.query('DELETE FROM users WHERE id=$1', [req.user.id]); res.clearCookie('t').sendStatus(204);
}));

// --- Pairing ---
app.post('/api/couple/invite', auth, wrap(async (req, res) => {
  if (!req.user.couple_id) {
    const { rows } = await db.query('INSERT INTO couples(invite_code) VALUES($1) RETURNING id', [crypto.randomBytes(4).toString('hex').toUpperCase()]);
    await db.query('UPDATE users SET couple_id=$1 WHERE id=$2', [rows[0].id, req.user.id]);
  }
  res.json(await profile(req.user.id));
}));
app.post('/api/couple/join', auth, wrap(async (req, res) => {
  if (req.user.couple_id) return res.status(400).json({ error: 'You are already in a couple space.' });
  const { rows } = await db.query(`SELECT c.id,(SELECT count(*) FROM users WHERE couple_id=c.id) n FROM couples c WHERE invite_code=upper($1)`, [String(req.body.code || '')]);
  if (!rows[0] || +rows[0].n >= 2) return res.status(400).json({ error: 'That code is not valid or is already taken.' });
  await db.query('UPDATE users SET couple_id=$1 WHERE id=$2', [rows[0].id, req.user.id]);
  res.json(await profile(req.user.id));
}));

// --- Messages ---
app.get('/api/messages', auth, wrap(async (req, res) => {
  if (!req.user.couple_id) return res.json([]);
  const { rows } = await db.query('SELECT id,user_id,body,created_at FROM (SELECT * FROM messages WHERE couple_id=$1 ORDER BY id DESC LIMIT 100) m ORDER BY id', [req.user.couple_id]);
  res.json(rows);
}));
app.get('/api/stats', wrap(async (req, res) => {
  const { rows } = await db.query('SELECT count(*)::int AS today FROM messages WHERE created_at >= current_date');
  res.json(rows[0]);
}));

// --- Billing ---
app.post('/api/billing/checkout', auth, wrap(async (req, res) => {
  if (!stripe || !req.user.couple_id) return res.status(400).json({ error: 'Billing is not available yet.' });
  const s = await stripe.checkout.sessions.create({
    mode: 'subscription', line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    client_reference_id: String(req.user.couple_id), customer_email: req.user.email,
    success_url: process.env.BASE_URL + '/#app', cancel_url: process.env.BASE_URL + '/#app'
  });
  res.json({ url: s.url });
}));

// --- Real-time chat ---
io.use(async (socket, next) => {
  try {
    const { id } = jwt.verify(cookie.parse(socket.handshake.headers.cookie || '').t, SECRET);
    const u = await profile(id); if (!u?.couple_id) throw 0;
    socket.data.user = u; next();
  } catch { next(new Error('unauthorized')); }
});
io.on('connection', socket => {
  const u = socket.data.user, room = 'couple:' + u.couple_id;
  socket.join(room);
  socket.on('msg', async text => {
    text = String(text).trim().slice(0, 2000); if (!text) return;
    const { rows } = await db.query('INSERT INTO messages(couple_id,user_id,body) VALUES($1,$2,$3) RETURNING id,user_id,body,created_at', [u.couple_id, u.id, text]);
    io.to(room).emit('msg', rows[0]);
  });
});

server.listen(process.env.PORT || 3000, () => console.log('Heartline running on :' + (process.env.PORT || 3000)));
