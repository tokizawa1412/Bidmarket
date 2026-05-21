
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'db.json');
const uploadDir = path.join(__dirname, 'public', 'uploads');

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const defaultImg = 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?q=80&w=1200&auto=format&fit=crop';
const now = () => Date.now();

function createDb() {
  const hash = bcrypt.hashSync('1234', 10);
  return {
    nextIds: { user: 2, auction: 4, ad: 2, transaction: 1, payment: 1, winner: 1 },
    users: [
      {
        id: 1,
        username: 'demo',
        email: 'demo@bidmarket.local',
        password_hash: hash,
        role: 'admin',
        status: 'active',
        display_name: 'Demo Admin',
        coin: 5000000,
        credit: 50000,
        token: 20,
        vip_until: now() + 365 * 86400000,
        vip_plan: 'yearly',
        successful_credit_sales: 1,
        created_at: now(),
        last_login_at: null,
        avatar_url: '',
        bio: '',
        phone: '',
        address: ''
      }
    ],
    auctions: [
      {
        id: 1, seller_id: 1, level: 'general', method: 'forward', currency: 'coin',
        title: 'iPhone 15 Pro Max', description: 'ประมูลทั่วไปด้วย Coin', category: 'มือถือ',
        image_url: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?q=80&w=1200&auto=format&fit=crop',
        start_price: 2850000, current_bid: 2850000, winner_id: null, last_bidder_id: null, bids_count: 34,
        sealed_bids: [], participants: [], english_started: false, english_reset: 30, english_step: 0, time_left: 0,
        end_at: now() + 86400000, auction_end_at: null, status: 'active', created_at: now()
      },
      {
        id: 2, seller_id: 1, level: 'general', method: 'english', currency: 'credit',
        title: 'PlayStation 5 Slim', description: 'เคาะครั้งแรกแล้วเหลือ 30 วินาที', category: 'เกม',
        image_url: 'https://images.unsplash.com/photo-1607853202273-797f1c22a38e?q=80&w=1200&auto=format&fit=crop',
        start_price: 2600, current_bid: 2600, winner_id: null, last_bidder_id: null, bids_count: 0,
        sealed_bids: [], participants: [], english_started: false, english_reset: 30, english_step: 200, time_left: 0,
        end_at: null, auction_end_at: now() + 3600000, status: 'active', created_at: now()
      },
      {
        id: 3, seller_id: 1, level: 'vip', method: 'sealed', currency: 'credit',
        title: 'Rolex Submariner Vintage', description: 'ปิดซอง VIP', category: 'ของสะสม',
        image_url: 'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?q=80&w=1200&auto=format&fit=crop',
        start_price: 100000, current_bid: 0, winner_id: null, last_bidder_id: null, bids_count: 0,
        sealed_bids: [], participants: [], english_started: false, english_reset: 30, english_step: 0, time_left: 0,
        end_at: now() + 7200000, auction_end_at: null, status: 'active', created_at: now()
      }
    ],
    ads: [{
      id: 1, owner_id: 1, title: 'BidMarket Premium Deals', description: 'ดูดีลพิเศษสำหรับสมาชิก',
      type: 'image',
      media_url: 'https://images.unsplash.com/photo-1556745757-8d76bdb6984b?q=80&w=1200&auto=format&fit=crop',
      budget: 100, remaining_budget: 100, cost_per_click: 1, views: 0, active: true, viewed_by: [], created_at: now()
    }],
    transactions: [],
    payments: [],
    winners: [],
    favorites: [],
    messages: []
  };
}

function loadDb() {
  if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify(createDb(), null, 2), 'utf8');
  return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
}

let db = loadDb();
function saveDb() { fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf8'); }
function newId(type) { const id = db.nextIds[type] || 1; db.nextIds[type] = id + 1; return id; }
function userById(id) { return db.users.find(u => u.id === Number(id)); }
function userByName(username) { return db.users.find(u => u.username === username); }
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role || 'user',
    status: u.status || 'active',
    display_name: u.display_name || u.username,
    avatar_url: u.avatar_url || '',
    bio: u.bio || '',
    phone: u.phone || '',
    address: u.address || '',
    coin: u.coin,
    credit: u.credit,
    token: u.token,
    vip_until: u.vip_until,
    vip_plan: u.vip_plan,
    is_vip: Number(u.vip_until || 0) > now()
  };
}
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
  const u = userById(req.session.userId);
  if (!u || (u.status || 'active') !== 'active') {
    req.session.destroy(() => {});
    return res.status(403).json({ error: 'บัญชีนี้ถูกระงับหรือไม่ถูกต้อง' });
  }
  next();
}
function requireVip(req, res, next) {
  const u = userById(req.session.userId);
  if (!u || Number(u.vip_until || 0) <= now()) return res.status(403).json({ error: 'ต้องเป็นสมาชิก VIP ก่อน' });
  req.user = u;
  next();
}
function requireAdmin(req, res, next) {
  const u = userById(req.session.userId);
  if (!u || (u.role || 'user') !== 'admin') return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
  req.user = u;
  next();
}

function normalizeDbUsers() {
  let changed = false;
  db.users.forEach(u => {
    if (!u.role) { u.role = u.username === 'demo' ? 'admin' : 'user'; changed = true; }
    if (!u.status) { u.status = 'active'; changed = true; }
    if (!u.display_name) { u.display_name = u.username; changed = true; }
    if (u.last_login_at === undefined) { u.last_login_at = null; changed = true; }
    if (u.avatar_url === undefined) { u.avatar_url = ''; changed = true; }
    if (u.bio === undefined) { u.bio = ''; changed = true; }
    if (u.phone === undefined) { u.phone = ''; changed = true; }
    if (u.address === undefined) { u.address = ''; changed = true; }
  });
  if (changed) saveDb();
}
normalizeDbUsers();

function ensureActiveUser(u) {
  if (!u) throw new Error('ไม่พบผู้ใช้');
  if ((u.status || 'active') !== 'active') throw new Error('บัญชีนี้ถูกระงับ');
}
function addTx(user_id, type, amount, currency, note = '') {
  db.transactions.unshift({ id: newId('transaction'), user_id, type, amount, currency, note, created_at: now() });
}
function changeBalance(userId, currency, delta, type, note = '') {
  const u = userById(userId);
  if (!u) throw new Error('ไม่พบผู้ใช้');
  if (!['coin', 'credit', 'token'].includes(currency)) throw new Error('สกุลเงินไม่ถูกต้อง');
  if (Number(u[currency] || 0) + delta < -0.00001) throw new Error('ยอดเงินไม่พอ');
  u[currency] = Number(u[currency] || 0) + delta;
  addTx(userId, type, delta, currency, note);
}
function sellerName(a) { return userById(a.seller_id)?.username || 'unknown'; }
function winnerName(a) { return a.winner_id ? userById(a.winner_id)?.username : null; }
function auctionApi(a) { return { ...a, seller_name: sellerName(a), winner_name: winnerName(a), sealed_count: (a.sealed_bids || []).length }; }

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Auth
app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'กรอกข้อมูลให้ครบ' });
  if (userByName(username.trim())) return res.status(400).json({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
  const u = {
    id: newId('user'),
    username: username.trim(),
    email: email.trim(),
    password_hash: bcrypt.hashSync(password, 10),
    role: 'user',
    status: 'active',
    display_name: username.trim(),
    coin: 0,
    credit: 0,
    token: 0,
    vip_until: 0,
    vip_plan: null,
    successful_credit_sales: 0,
    created_at: now(),
    last_login_at: null,
    avatar_url: '',
    bio: '',
    phone: '',
    address: ''
  };
  db.users.push(u);
  req.session.userId = u.id;
  saveDb();
  res.json({ user: publicUser(u) });
});

app.post('/api/login', (req, res) => {
  const u = userByName(req.body.username);
  if (!u || !bcrypt.compareSync(req.body.password || '', u.password_hash)) {
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }
  try {
    ensureActiveUser(u);
  } catch (e) {
    return res.status(403).json({ error: e.message });
  }
  u.last_login_at = now();
  req.session.userId = u.id;
  saveDb();
  res.json({ user: publicUser(u) });
});

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => res.json({ user: req.session.userId ? publicUser(userById(req.session.userId)) : null }));

app.put('/api/me/profile', requireAuth, (req, res) => {
  const u = userById(req.session.userId);
  const displayName = String(req.body.display_name || '').trim();
  const email = String(req.body.email || '').trim();
  if (!displayName || !email) return res.status(400).json({ error: 'กรอกชื่อที่แสดงและอีเมลให้ครบ' });
  u.display_name = displayName;
  u.email = email;
  u.bio = String(req.body.bio || '').trim();
  u.phone = String(req.body.phone || '').trim();
  u.address = String(req.body.address || '').trim();
  if (req.body.avatar_url !== undefined) u.avatar_url = String(req.body.avatar_url || '').trim();
  saveDb();
  res.json({ user: publicUser(u) });
});

app.put('/api/me/password', requireAuth, (req, res) => {
  const u = userById(req.session.userId);
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'กรอกรหัสผ่านให้ครบ' });
  if (String(new_password).length < 6) return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' });
  if (!bcrypt.compareSync(current_password, u.password_hash)) return res.status(400).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
  u.password_hash = bcrypt.hashSync(new_password, 10);
  saveDb();
  res.json({ ok: true });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = db.users.map(u => ({
    ...publicUser(u),
    created_at: u.created_at,
    last_login_at: u.last_login_at,
    successful_credit_sales: u.successful_credit_sales
  }));
  res.json({ users });
});

app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
  const u = userById(req.params.id);
  if (!u) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  if (u.username === 'demo' && req.body.status === 'suspended') return res.status(400).json({ error: 'ไม่สามารถระงับบัญชี demo ได้' });

  if (req.body.status && ['active', 'suspended'].includes(req.body.status)) u.status = req.body.status;
  if (req.body.role && ['user', 'admin'].includes(req.body.role)) u.role = req.body.role;

  if (req.body.add_credit) {
    const amount = Number(req.body.add_credit);
    if (amount > 0) changeBalance(u.id, 'credit', amount, 'Admin เพิ่ม Credit', 'admin adjustment');
  }
  if (req.body.add_coin) {
    const amount = Number(req.body.add_coin);
    if (amount > 0) changeBalance(u.id, 'coin', amount, 'Admin เพิ่ม Coin', 'admin adjustment');
  }
  saveDb();
  res.json({ user: publicUser(u) });
});


// Upload
app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ไม่พบไฟล์' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// VIP
app.post('/api/vip/subscribe', requireAuth, (req, res) => {
  const plans = { monthly: { days: 30, price: 480 }, halfyear: { days: 180, price: 2400 }, yearly: { days: 365, price: 4320 } };
  const plan = plans[req.body.plan];
  if (!plan) return res.status(400).json({ error: 'แพ็กเกจไม่ถูกต้อง' });
  const u = userById(req.session.userId);
  const base = Number(u.vip_until || 0) > now() ? Number(u.vip_until) : now();
  u.vip_until = base + plan.days * 86400000;
  u.vip_plan = req.body.plan;
  addTx(u.id, 'สมัคร VIP', plan.price, 'baht', req.body.plan);
  saveDb();
  res.json({ user: publicUser(u) });
});

// Wallet & Payment mock
app.post('/api/wallet/buy-coin', requireAuth, (req, res) => {
  const baht = Number(req.body.baht);
  if (!baht || baht <= 0) return res.status(400).json({ error: 'จำนวนเงินไม่ถูกต้อง' });
  changeBalance(req.session.userId, 'coin', baht * 100, 'ซื้อ Coin', `${baht} บาท`);
  saveDb();
  res.json({ user: publicUser(userById(req.session.userId)) });
});

app.post('/api/payments/create-credit-topup', requireAuth, (req, res) => {
  const baht = Number(req.body.baht);
  if (!baht || baht < 5) return res.status(400).json({ error: 'เติมขั้นต่ำ 5 บาท' });
  const p = {
    id: uuidv4(), user_id: req.session.userId,
    baht_amount: baht, credit_amount: Math.floor(baht / 5),
    status: 'pending', provider: 'mock', provider_ref: null,
    created_at: now(), paid_at: null
  };
  db.payments.push(p);
  saveDb();
  res.json({ payment_id: p.id, baht_amount: p.baht_amount, credit_amount: p.credit_amount, status: p.status, mock_payment_url: `/mock-payment.html?id=${p.id}` });
});

app.post('/api/payments/mock-confirm', requireAuth, (req, res) => {
  const p = db.payments.find(x => x.id === req.body.payment_id && x.user_id === req.session.userId);
  if (!p) return res.status(404).json({ error: 'ไม่พบรายการชำระเงิน' });
  if (p.status !== 'paid') {
    p.status = 'paid';
    p.paid_at = now();
    changeBalance(p.user_id, 'credit', p.credit_amount, 'เติม Credit', `ชำระเงิน ${p.baht_amount} บาท`);
    saveDb();
  }
  res.json({ ok: true, user: publicUser(userById(req.session.userId)) });
});

// Future real gateway webhook
app.post('/api/payments/webhook', (req, res) => {
  const p = db.payments.find(x => x.id === req.body.payment_id);
  if (!p) return res.status(404).json({ error: 'not found' });
  if (p.status !== 'paid' && req.body.status === 'paid') {
    p.status = 'paid';
    p.paid_at = now();
    p.provider_ref = req.body.provider_ref || '';
    changeBalance(p.user_id, 'credit', p.credit_amount, 'เติม Credit', 'Webhook paid');
    saveDb();
  }
  res.json({ ok: true });
});

app.post('/api/wallet/transfer', requireAuth, (req, res) => {
  const to = userByName(req.body.to_username);
  const sender = userById(req.session.userId);
  const amount = Number(req.body.amount);
  try {
    if (!to) throw new Error('ไม่พบบัญชีผู้รับ');
    if (to.id === sender.id) throw new Error('โอนให้ตัวเองไม่ได้');
    if (req.body.currency === 'credit') {
      if (amount < 20) throw new Error('Credit โอนขั้นต่ำ 20');
      const fee = Math.ceil(amount * 0.1);
      changeBalance(sender.id, 'credit', -(amount + fee), 'โอน Credit', `ถึง ${to.username}, fee ${fee}`);
      changeBalance(to.id, 'credit', amount, 'รับ Credit', `จาก ${sender.username}`);
    } else if (req.body.currency === 'token') {
      if (amount < 1) throw new Error('Token โอนขั้นต่ำ 1');
      const fee = amount * 25;
      changeBalance(sender.id, 'token', -amount, 'โอน Token', `ถึง ${to.username}`);
      changeBalance(sender.id, 'credit', -fee, 'ค่าธรรมเนียมโอน Token', `${fee} Credit`);
      changeBalance(to.id, 'token', amount, 'รับ Token', `จาก ${sender.username}`);
    } else {
      throw new Error('สกุลเงินไม่ถูกต้อง');
    }
    saveDb();
    res.json({ user: publicUser(userById(sender.id)) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Auctions
app.get('/api/auctions', (req, res) => {
  const level = req.query.level || 'general';
  const auctions = db.auctions.filter(a => a.status === 'active' && a.level === level).sort((a, b) => b.created_at - a.created_at).map(auctionApi);
  res.json({ auctions });
});

app.post('/api/auctions', requireAuth, (req, res) => {
  const u = userById(req.session.userId);
  const { level, method, currency, title, description, category, image_url } = req.body;
  const start = Number(req.body.start_price);
  if (!title || !start) return res.status(400).json({ error: 'กรอกชื่อสินค้าและราคาเริ่มต้น' });
  if (level === 'general' && !['forward', 'english'].includes(method)) return res.status(400).json({ error: 'ทั่วไปใช้เฉพาะ Forward/English' });
  if (level === 'general' && !['coin', 'credit'].includes(currency)) return res.status(400).json({ error: 'ทั่วไปใช้ Coin หรือ Credit' });
  if (level === 'vip') {
    if (Number(u.vip_until || 0) <= now()) return res.status(403).json({ error: 'ลง VIP ต้องเป็นสมาชิก VIP' });
    if (currency === 'token' && Number(u.successful_credit_sales || 0) < 1) return res.status(400).json({ error: 'เปิดประมูล Token ต้องเคยปิด Credit สำเร็จอย่างน้อย 1 ครั้ง' });
  }
  let end_at = now() + 86400000, auction_end_at = null, eReset = 30, eStep = 0;
  if (method === 'sealed') {
    const hours = Number(req.body.sealed_hours);
    if (!hours || hours < 2 || hours > 720) return res.status(400).json({ error: 'ปิดซองต้องตั้งเวลา 2-720 ชั่วโมง' });
    end_at = now() + hours * 3600000;
  }
  if (method === 'english') {
    const hours = Number(req.body.english_duration_hours);
    eReset = Number(req.body.english_reset);
    eStep = Number(req.body.english_step);
    const minStep = Math.ceil(start * 0.05);
    if (!hours || hours < 1 || hours > 720) return res.status(400).json({ error: 'เคาะราคาต้องตั้งเวลา 1-720 ชั่วโมง' });
    if (eReset < 10 || eReset > 60) return res.status(400).json({ error: 'เวลานับถอยหลัง 10-60 วินาที' });
    if (!eStep || eStep < minStep) return res.status(400).json({ error: `ราคาเคาะขั้นต่ำ ${minStep}` });
    auction_end_at = now() + hours * 3600000;
    end_at = null;
  }
  const a = {
    id: newId('auction'), seller_id: u.id, level, method, currency, title,
    description: description || '', category: category || 'อื่นๆ', image_url: image_url || defaultImg,
    start_price: start, current_bid: method === 'sealed' ? 0 : start,
    winner_id: null, last_bidder_id: null, bids_count: 0,
    sealed_bids: [], participants: [], english_started: false, english_reset: eReset, english_step: eStep, time_left: 0,
    end_at, auction_end_at, status: 'active', created_at: now()
  };
  db.auctions.push(a);
  saveDb();
  res.json({ auction: auctionApi(a) });
});

app.post('/api/auctions/:id/bid', requireAuth, (req, res) => {
  const a = db.auctions.find(x => x.id === Number(req.params.id) && x.status === 'active');
  if (!a) return res.status(404).json({ error: 'ไม่พบการประมูล' });
  const u = userById(req.session.userId);
  if (a.seller_id === u.id) return res.status(400).json({ error: 'ผู้ขายประมูลสินค้าตัวเองไม่ได้' });
  if (a.level === 'vip' && Number(u.vip_until || 0) <= now()) return res.status(403).json({ error: 'ต้องสมัคร VIP ก่อน' });
  try {
    if (!a.participants.includes(u.id)) a.participants.push(u.id);
    if (a.method === 'english') {
      changeBalance(u.id, a.currency, -Number(a.english_step), 'เคาะราคา', a.title);
      a.current_bid += Number(a.english_step);
      a.winner_id = u.id; a.last_bidder_id = u.id; a.bids_count++;
      a.english_started = true; a.time_left = a.english_reset;
    } else if (a.method === 'sealed') {
      const amount = Number(req.body.amount);
      if (!amount || amount <= 0) throw new Error('กรุณาใส่ราคา');
      if (a.sealed_bids.some(b => b.user_id === u.id)) throw new Error('ปิดซองเสนอได้ครั้งเดียว');
      changeBalance(u.id, a.currency, -amount, 'ส่งซอง', a.title);
      a.sealed_bids.push({ user_id: u.id, amount, at: now() }); a.bids_count++;
    } else {
      const amount = Number(req.body.amount);
      if (!amount || amount <= a.current_bid) throw new Error('ต้องเสนอราคาสูงกว่าปัจจุบัน');
      const diff = amount - a.current_bid;
      changeBalance(u.id, a.currency, -diff, 'เสนอราคา', a.title);
      a.current_bid = amount; a.winner_id = u.id; a.last_bidder_id = u.id; a.bids_count++;
    }
    saveDb();
    res.json({ auction: auctionApi(a), user: publicUser(u) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

function finalizeAuction(a) {
  if (a.status !== 'active') return null;
  let winnerId = a.winner_id || a.last_bidder_id;
  let price = Number(a.current_bid || 0);
  if (a.method === 'sealed') {
    const bids = [...a.sealed_bids].sort((x, y) => y.amount - x.amount);
    if (bids[0]) { winnerId = bids[0].user_id; price = bids[0].amount; }
  }
  const winner = winnerId ? userById(winnerId) : null;
  const seller = userById(a.seller_id);
  const feeRate = a.currency === 'coin' ? 0.25 : a.currency === 'credit' ? 0.10 : 0;
  const fee = Math.round(price * feeRate);
  if (winner && seller && price > 0) {
    changeBalance(seller.id, a.currency, price - fee, 'รับเงินจากการประมูล', a.title);
    if (a.currency === 'credit' && price >= 10000) seller.successful_credit_sales++;
    if (a.currency === 'credit') {
      const tokenReward = Math.floor(price / 1000);
      if (tokenReward > 0) changeBalance(winner.id, 'token', tokenReward, 'รับ Token จากการชนะประมูล', a.title);
    }
  }
  a.status = 'closed';
  const result = {
    id: newId('winner'), auction_id: a.id, item_title: a.title,
    winner_id: winner ? winner.id : null,
    winner_name: winner ? winner.username : 'ไม่มีผู้ชนะ',
    price, currency: a.currency, method: a.method, created_at: now()
  };
  db.winners.unshift(result);
  saveDb();
  return result;
}

app.post('/api/auctions/:id/close', requireAuth, (req, res) => {
  const a = db.auctions.find(x => x.id === Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'ไม่พบการประมูล' });
  const u = userById(req.session.userId);
  if (a.seller_id !== u.id && u.username !== 'demo') return res.status(403).json({ error: 'เฉพาะผู้ขายหรือ demo เท่านั้น' });
  res.json({ result: finalizeAuction(a) });
});

app.get('/api/winners', (req, res) => res.json({ winners: db.winners.slice(0, 100) }));

// Ads
app.get('/api/ads', (req, res) => {
  const u = req.session.userId ? userById(req.session.userId) : null;
  const isVip = u && Number(u.vip_until || 0) > now();
  const ads = db.ads
    .filter(a => a.active && a.remaining_budget >= a.cost_per_click && (!u || isVip || a.budget <= 99))
    .sort((a, b) => ((b.budget > 1000) - (a.budget > 1000)) || (b.views - a.views))
    .map(a => ({ ...a, viewed: u ? a.viewed_by.includes(u.id) : false }));
  res.json({ ads });
});

app.post('/api/ads', requireVip, upload.single('file'), (req, res) => {
  const b = Number(req.body.budget), cpc = Number(req.body.cost_per_click);
  if (!req.body.title || !b || !cpc) return res.status(400).json({ error: 'กรอกข้อมูลให้ครบ' });
  if (cpc < 0.1) return res.status(400).json({ error: 'ค่าคลิกขั้นต่ำ 0.1 Credit' });
  if (cpc > b) return res.status(400).json({ error: 'ค่าคลิกต้องไม่เกินงบ' });
  try {
    changeBalance(req.user.id, 'credit', -b, 'ลงโฆษณา', req.body.title);
    const ad = {
      id: newId('ad'), owner_id: req.user.id,
      title: req.body.title, description: req.body.description || '',
      type: req.body.type || 'image',
      media_url: req.file ? `/uploads/${req.file.filename}` : (req.body.media_url || defaultImg),
      budget: b, remaining_budget: b, cost_per_click: cpc,
      views: 0, active: true, viewed_by: [], created_at: now()
    };
    db.ads.unshift(ad);
    saveDb();
    res.json({ ad });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

function todayKey() { return new Date().toISOString().slice(0, 10); }
app.post('/api/ads/:id/view', requireAuth, (req, res) => {
  const a = db.ads.find(x => x.id === Number(req.params.id) && x.active);
  if (!a) return res.status(404).json({ error: 'ไม่พบโฆษณา' });
  const u = userById(req.session.userId);
  if (a.owner_id === u.id) return res.status(400).json({ error: 'เจ้าของโฆษณารับรางวัลเองไม่ได้' });
  if (Number(u.vip_until || 0) <= now() && a.budget > 99) return res.status(403).json({ error: 'ผู้ใช้ทั่วไปดูได้เฉพาะงบไม่เกิน 99 Credit' });
  if (a.viewed_by.includes(u.id)) return res.status(400).json({ error: 'บัญชีนี้ดูโฆษณานี้แล้ว' });
  const dailyType = `ดูโฆษณา:${todayKey()}`;
  const count = db.transactions.filter(t => t.user_id === u.id && t.type === dailyType).length;
  const limit = Number(u.vip_until || 0) > now() ? 5 : 3;
  if (count >= limit) return res.status(400).json({ error: `วันนี้ดูครบ ${limit} ครั้งแล้ว` });
  if (a.remaining_budget < a.cost_per_click) return res.status(400).json({ error: 'โฆษณาหมดงบแล้ว' });
  a.remaining_budget -= a.cost_per_click; a.views++; a.viewed_by.push(u.id);
  if (a.remaining_budget < a.cost_per_click) a.active = false;
  let reward, currency;
  if (a.budget <= 99) { reward = Math.floor(a.cost_per_click * 0.5 * 500); currency = 'coin'; }
  else { reward = a.cost_per_click * 0.5; currency = 'credit'; }
  changeBalance(u.id, currency, reward, dailyType, `ดูโฆษณา ${a.title}`);
  addTx(a.owner_id, 'เสียค่าโฆษณา', -a.cost_per_click, 'credit', a.title);
  saveDb();
  res.json({ reward, currency, ad: a, user: publicUser(u) });
});


// Favorites
app.get('/api/favorites', requireAuth, (req, res) => {
  db.favorites = db.favorites || [];
  const favIds = db.favorites.filter(f => f.user_id === req.session.userId).map(f => f.auction_id);
  const auctions = db.auctions.filter(a => favIds.includes(a.id) && a.status === 'active').map(auctionApi);
  res.json({ auctions, favorite_ids: favIds });
});
app.post('/api/favorites/:auctionId', requireAuth, (req, res) => {
  db.favorites = db.favorites || [];
  const auctionId = Number(req.params.auctionId);
  const auction = db.auctions.find(a => a.id === auctionId && a.status === 'active');
  if (!auction) return res.status(404).json({ error: 'ไม่พบรายการประมูล' });
  if (!db.favorites.find(f => f.user_id === req.session.userId && f.auction_id === auctionId)) {
    db.favorites.push({ user_id: req.session.userId, auction_id: auctionId, created_at: now() });
  }
  saveDb();
  res.json({ ok: true });
});
app.delete('/api/favorites/:auctionId', requireAuth, (req, res) => {
  db.favorites = db.favorites || [];
  const auctionId = Number(req.params.auctionId);
  db.favorites = db.favorites.filter(f => !(f.user_id === req.session.userId && f.auction_id === auctionId));
  saveDb();
  res.json({ ok: true });
});

// Chat users and messages
app.get('/api/users/search', requireAuth, (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const users = db.users
    .filter(u => u.id !== req.session.userId && (u.status || 'active') === 'active')
    .filter(u => !q || u.username.toLowerCase().includes(q) || (u.display_name || '').toLowerCase().includes(q))
    .slice(0, 30)
    .map(u => ({ id: u.id, username: u.username, display_name: u.display_name || u.username, avatar_url: u.avatar_url || '' }));
  res.json({ users });
});
app.get('/api/messages/threads', requireAuth, (req, res) => {
  db.messages = db.messages || [];
  const myId = req.session.userId;
  const partnerIds = new Set();
  db.messages.forEach(m => { if (m.from_id === myId) partnerIds.add(m.to_id); if (m.to_id === myId) partnerIds.add(m.from_id); });
  const threads = [...partnerIds].map(id => {
    const u = userById(id);
    const msgs = db.messages.filter(m => (m.from_id === myId && m.to_id === id) || (m.from_id === id && m.to_id === myId));
    const last = msgs.sort((a,b)=>b.created_at-a.created_at)[0];
    return { user: u ? { id:u.id, username:u.username, display_name:u.display_name||u.username, avatar_url:u.avatar_url||'' } : null, last_message: last };
  }).filter(t => t.user);
  res.json({ threads });
});
app.get('/api/messages/:userId', requireAuth, (req, res) => {
  db.messages = db.messages || [];
  const other = Number(req.params.userId);
  const myId = req.session.userId;
  const messages = db.messages
    .filter(m => (m.from_id === myId && m.to_id === other) || (m.from_id === other && m.to_id === myId))
    .sort((a,b)=>a.created_at-b.created_at);
  res.json({ messages, other: publicUser(userById(other)) });
});
app.post('/api/messages/:userId', requireAuth, upload.single('file'), (req, res) => {
  db.messages = db.messages || [];
  const to = userById(req.params.userId);
  if (!to || (to.status || 'active') !== 'active') return res.status(404).json({ error: 'ไม่พบผู้รับ' });
  const text = String(req.body.text || '').trim();
  const image_url = req.file ? `/uploads/${req.file.filename}` : String(req.body.image_url || '').trim();
  if (!text && !image_url) return res.status(400).json({ error: 'กรุณาส่งข้อความหรือรูปภาพ' });
  const msg = { id: uuidv4(), from_id: req.session.userId, to_id: to.id, text, image_url, created_at: now(), read_at: null };
  db.messages.push(msg);
  saveDb();
  res.json({ message: msg });
});

// Withdraw request mock
app.post('/api/wallet/withdraw', requireAuth, (req, res) => {
  const currency = req.body.currency;
  const amount = Number(req.body.amount);
  if (!['credit','token'].includes(currency)) return res.status(400).json({ error: 'ถอนได้เฉพาะ Credit หรือ Token ในระบบทดสอบนี้' });
  if (!amount || amount <= 0) return res.status(400).json({ error: 'จำนวนไม่ถูกต้อง' });
  try {
    changeBalance(req.session.userId, currency, -amount, 'คำขอถอนเงิน', String(req.body.note || 'รอตรวจสอบโดย Admin'));
    saveDb();
    res.json({ ok: true, user: publicUser(userById(req.session.userId)) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});


// Misc
app.get('/api/transactions', requireAuth, (req, res) => {
  res.json({ transactions: db.transactions.filter(t => t.user_id === req.session.userId).slice(0, 100) });
});
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

setInterval(() => {
  let changed = false;
  db.auctions.filter(a => a.status === 'active' && a.method === 'english' && a.english_started && a.time_left > 0).forEach(a => {
    a.time_left--; changed = true;
    if (a.time_left <= 0) finalizeAuction(a);
  });
  if (changed) saveDb();
}, 1000);

app.listen(PORT, () => console.log(`BidMarket EasyRun: http://localhost:${PORT}`));
