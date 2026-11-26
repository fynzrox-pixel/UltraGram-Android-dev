const { run, all, get } = require('./db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * The first administrator password is never committed to the repository.
 * Set ULTRAGRAM_ADMIN_PASSWORD for predictable deployments; otherwise a
 * one-time random password is generated in development and printed once.
 */
function hashAdminPassword() {
  const fromEnv = (process.env.ULTRAGRAM_ADMIN_PASSWORD || '').trim();
  if (fromEnv) return bcrypt.hashSync(fromEnv, 10);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Set ULTRAGRAM_ADMIN_PASSWORD before creating the first administrator.');
  }
  const generated = crypto.randomBytes(18).toString('base64url');
  console.warn('[UltraGram] ULTRAGRAM_ADMIN_PASSWORD is not set.');
  console.warn('[UltraGram] Generated one-time administrator password: ' + generated);
  console.warn('[UltraGram] Save it now; it will not be shown again.');
  return bcrypt.hashSync(generated, 10);
}

const RARITIES = ['Common','Uncommon','Rare','Epic','Legendary','Mythic','Exclusive'];

function rarityForPrice(p) {
  if (p >= 5000000) return 'Exclusive';
  if (p >= 500000) return 'Mythic';
  if (p >= 50000) return 'Legendary';
  if (p >= 5000) return 'Epic';
  if (p >= 500) return 'Rare';
  if (p >= 100) return 'Uncommon';
  return 'Common';
}

const CATEGORIES = ['Nature','Jewelry','Animals','Magic','Royalty','Tech','Cosmic','Food','Music','Sports'];

// First 11 exact from prompt
const BASE = [
  { name: 'Искра', price: 10, desc: 'Маленькая искра света, которая начинает всё.', cat: 'Magic' },
  { name: 'Маленькое сердце', price: 25, desc: 'Тёплое маленькое сердце для близких.', cat: 'Nature' },
  { name: 'Роза', price: 50, desc: 'Красная роза с нежным ароматом.', cat: 'Nature' },
  { name: 'Корона', price: 100, desc: 'Королевская корона для избранных.', cat: 'Royalty' },
  { name: 'Кристалл', price: 250, desc: 'Сверкающий кристалл чистоты.', cat: 'Jewelry' },
  { name: 'Золотой кубок', price: 500, desc: 'Кубок победителя.', cat: 'Sports' },
  { name: 'Алмаз', price: 1000, desc: 'Несокрушимый алмаз.', cat: 'Jewelry' },
  { name: 'Огненный дракон', price: 10000, desc: 'Древний огненный дракон.', cat: 'Animals' },
  { name: 'Золотой трон', price: 100000, desc: 'Трон из чистого золота.', cat: 'Royalty' },
  { name: 'Легендарный феникс', price: 1000000, desc: 'Феникс, возрождающийся из пепла.', cat: 'Animals' },
  { name: 'Королевская империя', price: 10000000, desc: 'Целая империя в подарок.', cat: 'Royalty' },
];

const ADJ = ['Звёздный','Лунный','Солнечный','Теневой','Неоновый','Космический','Морской','Лесной','Горный','Пустынный','Снежный','Весенний','Осенний','Зимний','Летний','Магический','Мистический','Священный','Проклятый','Благословенный'];
const NOUN = ['Камень','Цветок','Зверь','Птица','Рыба','Дерево','Гора','Река','Озеро','Море','Звезда','Луна','Солнце','Облако','Ветер','Огонь','Лёд','Гром','Молния','Радуга'];

function genGifts() {
  const gifts = [];
  const usedNames = new Set();
  for (const b of BASE) {
    gifts.push({ name: b.name, price: b.price, desc: b.desc, cat: b.cat });
    usedNames.add(b.name);
  }
  // generate remaining to reach 100
  let i = 0;
  while (gifts.length < 100) {
    const adj = ADJ[i % ADJ.length];
    const noun = NOUN[Math.floor(i / ADJ.length) % NOUN.length];
    let name = `${adj} ${noun}`;
    if (usedNames.has(name)) { name = `${name} ${i}`; }
    usedNames.add(name);
    // price distribution: scale
    const idx = gifts.length;
    // produce varied prices across range
    const t = idx / 100;
    const price = Math.max(10, Math.round(10 * Math.pow(1000000, t)));
    // snap to nice values
    const nice = [10,15,20,30,40,50,75,80,90,100,120,150,200,250,300,400,500,750,1000,1500,2000,2500,3000,5000,7500,10000,15000,20000,25000,50000,75000,100000,150000,200000,250000,500000,750000,1000000,1500000,2000000,2500000,5000000,7500000,10000000];
    const priceNice = nice[Math.min(nice.length-1, Math.floor(t * nice.length))];
    const finalPrice = Math.max(10, priceNice);
    const cat = CATEGORIES[idx % CATEGORIES.length];
    const desc = `Уникальный подарок UltraGram: ${name}.`;
    gifts.push({ name, price: finalPrice, desc, cat });
    i++;
  }
  return gifts;
}

function seedGifts() {
  const count = get('SELECT COUNT(*) AS c FROM gifts');
  if (count && count.c >= 100) return;
  // clear if partial
  run('DELETE FROM gifts');
  const gifts = genGifts();
  const now = Date.now();
  for (const g of gifts) {
    run('INSERT INTO gifts (id,name,description,price,rarity,category,image,animation,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [uuidv4(), g.name, g.desc, g.price, rarityForPrice(g.price), g.cat, `gift:${g.name}`, 'sparkle', now]);
  }
  console.log('Seeded gifts:', gifts.length);
}

function seedAdminBootstrap() {
  // idempotent: only if no admin role exists
  const admins = all("SELECT user_id FROM user_roles WHERE role='ADMIN'");
  if (admins.length > 0) return;
  // find user by phone
  let user = get('SELECT * FROM users WHERE phone = ?', ['+380991868393']);
  if (!user) {
    const uid = uuidv4();
    const now = Date.now();
    run('INSERT INTO users (id,email,phone,password_hash,created_at,status) VALUES (?,?,?,?,?,?)',
      [uid, 'admin@ultragram.local', '+380991868393', hashAdminPassword(), now, 'active']);
    run('INSERT INTO user_profiles (user_id,display_name,username,bio,theme) VALUES (?,?,?,?,?)',
      [uid, 'UltraGram Admin', 'ultragram_admin', 'Главный администратор UltraGram', 'dark']);
    run('INSERT INTO verification (user_id,status) VALUES (?,?)', [uid, 'Admin']);
    run('INSERT INTO wallets (user_id,balance,updated_at) VALUES (?,?,?)', [uid, 100000000, now]);
    user = { id: uid };
  } else {
    const w = get('SELECT * FROM wallets WHERE user_id = ?', [user.id]);
    if (!w) run('INSERT INTO wallets (user_id,balance,updated_at) VALUES (?,?,?)', [user.id, 100000000, Date.now()]);
    else run('UPDATE wallets SET balance = ? WHERE user_id = ?', [100000000, user.id]);
    run('INSERT OR IGNORE INTO verification (user_id,status) VALUES (?,?)', [user.id, 'Admin']);
    run('UPDATE verification SET status=? WHERE user_id=?', ['Admin', user.id]);
    // ensure password set
    const u = get('SELECT password_hash FROM users WHERE id=?', [user.id]);
    if (!u || !u.password_hash) run('UPDATE users SET password_hash=? WHERE id=?', [hashAdminPassword(), user.id]);
  }
  run('INSERT OR IGNORE INTO user_roles (user_id,role) VALUES (?,?)', [user.id, 'ADMIN']);
  run('INSERT OR IGNORE INTO user_roles (user_id,role) VALUES (?,?)', [user.id, 'Verified UltraGram']);
  // transaction log once
  const flag = get("SELECT value FROM system_settings WHERE key='admin_seeded'");
  if (!flag) {
    run('INSERT INTO transactions (id,from_user,to_user,amount,type,note,created_at) VALUES (?,?,?,?,?,?,?)',
      [uuidv4(), null, user.id, 100000000, 'admin_grant', 'Initial admin grant 100M Ogonki', Date.now()]);
    run('INSERT INTO system_settings (key,value) VALUES (?,?)', ['admin_seeded', '1']);
  }
  console.log('Admin seeded:', user.id);
}

module.exports = { seedGifts, seedAdminBootstrap, genGifts };
