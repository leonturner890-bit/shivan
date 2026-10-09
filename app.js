const $ = s => document.querySelector(s);
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- Floating hearts that drift up and move away from the pointer ---
const cv = $('#hearts'), cx = cv.getContext('2d');
let W, H, m = { x: -999, y: -999 };
const hearts = Array.from({ length: 36 }, () => ({ x: Math.random(), y: Math.random(), s: 12 + Math.random() * 26, v: .3 + Math.random() * .6 }));
function size() { W = cv.width = cv.offsetWidth; H = cv.height = cv.offsetHeight; }
size(); addEventListener('resize', size);
['pointermove', 'pointerdown'].forEach(e => cv.addEventListener(e, ev => {
  const r = cv.getBoundingClientRect(); m = { x: ev.clientX - r.left, y: ev.clientY - r.top };
}));
(function draw() {
  cx.clearRect(0, 0, W, H);
  for (const h of hearts) {
    if (!still) h.y -= h.v / H;
    if (h.y < -.1) { h.y = 1.1; h.x = Math.random(); }
    const px = h.x * W, py = h.y * H, dx = px - m.x, dy = py - m.y, d = Math.hypot(dx, dy);
    if (d > 0 && d < 140) h.x += (dx / d) * (140 - d) * .06 / W;
    cx.font = h.s + 'px serif';
    cx.fillStyle = `rgba(255,111,165,${.25 + h.s / 60})`;
    cx.fillText('♥', px, py);
  }
  requestAnimationFrame(draw);
})();

// --- Typing effect ---
const line = 'Where two hearts talk.', out = $('#type');
let i = 0;
if (still) out.textContent = line;
else (function type() { out.textContent = line.slice(0, ++i); if (i < line.length) setTimeout(type, 70); })();

// --- Live love counter ---
fetch('/api/stats').then(r => r.json()).then(d => $('#count').textContent = d.today).catch(() => {});

// --- API helper ---
const api = (path, body, method) => fetch('/api/' + path, {
  method: method || (body ? 'POST' : 'GET'),
  headers: { 'Content-Type': 'application/json' },
  body: body && JSON.stringify(body)
}).then(async r => {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong. Try again.');
  return d;
});
const show = id => ['#auth', '#pair', '#chat'].forEach(s => $(s).hidden = s !== id);

// --- Log in / sign up ---
let mode = 'login';
$('#swap').onclick = () => {
  mode = mode === 'login' ? 'register' : 'login';
  const login = mode === 'login';
  $('#name').hidden = login;
  $('#authBtn').textContent = login ? 'Log in' : 'Create account';
  $('#swap').textContent = login ? 'New here? Sign up' : 'Have an account? Log in';
  $('#pw').autocomplete = login ? 'current-password' : 'new-password';
};
$('#authForm').onsubmit = async e => {
  e.preventDefault();
  try { start(await api(mode, { name: $('#name').value, email: $('#email').value, password: $('#pw').value })); }
  catch (x) { $('#authErr').textContent = x.message; }
};

// --- Pairing ---
$('#invite').onclick = async () => { const me = await api('couple/invite', {}); $('#code').textContent = me.code; };
$('#again').onclick = boot;
$('#joinForm').onsubmit = async e => {
  e.preventDefault();
  try { start(await api('couple/join', { code: $('#joinCode').value.trim() })); }
  catch (x) { $('#pairErr').textContent = x.message; }
};

// --- Chat ---
let sock, me;
function start(user) {
  me = user;
  if (me.partner) return openChat();
  show('#pair'); $('#code').textContent = me.code || '';
}
async function openChat() {
  show('#chat');
  $('#who').textContent = me.partner;
  $('#premium').hidden = me.premium;
  const log = $('#log'); log.textContent = '';
  const add = msg => {
    const b = document.createElement('p');
    b.className = 'b ' + (msg.user_id === me.id ? 'me' : 'them');
    b.textContent = msg.body; // textContent keeps messages safe from XSS
    log.append(b); log.scrollTop = log.scrollHeight;
  };
  (await api('messages')).forEach(add);
  if (sock) sock.close();
  sock = io(); sock.on('msg', add);
}
$('#send').onsubmit = e => {
  e.preventDefault();
  const v = $('#text').value.trim();
  if (v && sock) { sock.emit('msg', v); $('#text').value = ''; }
};
$('#premium').onclick = async () => {
  try { location = (await api('billing/checkout', {})).url; } catch (x) { alert(x.message); }
};

async function boot() { try { start(await api('me')); } catch {} }
boot();
