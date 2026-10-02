const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'users.db');

// ---------- SQLite Database Setup ----------
const db = new Database(DB_FILE);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    password_hash TEXT,
    balance REAL DEFAULT 0.0,
    created_at TEXT
  )
`);

// Optional migration from users.json if users.db is empty
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
const jsonDbFile = path.join(__dirname, 'users.json');
if (userCount === 0 && fs.existsSync(jsonDbFile)) {
  try {
    const rawData = fs.readFileSync(jsonDbFile, 'utf8');
    const oldUsers = JSON.parse(rawData);
    const insert = db.prepare(`
      INSERT OR IGNORE INTO users (id, username, password, password_hash, balance, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((users) => {
      for (const u of users) {
        insert.run(
          u.id || null,
          u.username,
          u.password || null,
          u.password_hash || u.password_plain || null,
          u.balance || 0.0,
          u.created_at || new Date().toISOString().replace('T', ' ').substring(0, 19)
        );
      }
    });
    insertMany(oldUsers);
    console.log('Migrated existing users from users.json to users.db');
  } catch (err) {
    console.error('Error migrating from users.json:', err);
  }
}

// ---------- Middleware ----------
app.use(express.json());
app.use(express.static(__dirname));

app.use(session({
  secret: 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 2 // 2 hours
  }
}));

// ---------- Auth routes ----------
app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  if (username.length < 3 || password.length < 6) {
    return res.status(400).json({ error: 'Username must be 3+ chars and password 6+ chars.' });
  }

  try {
    const createdAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const stmt = db.prepare('INSERT INTO users (username, password, balance, created_at) VALUES (?, ?, ?, ?)');
    stmt.run(username, password, 0.0, createdAt);
    res.status(201).json({ message: 'Account created. You can now log in.' });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }
    return res.status(500).json({ error: 'Database error.' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  const passwordMatch = user && (user.password === password || user.password_hash === password);

  if (!user || !passwordMatch) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;

  res.json({ message: `Welcome back, ${user.username}!` });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out.' }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ loggedIn: false });
  res.json({ loggedIn: true, username: req.session.username });
});

// ---------- Root route ----------
app.get('/', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------- Admin data & delete routes ----------
app.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY id DESC').all();
  const sanitized = users.map(u => ({
    id: u.id,
    username: u.username,
    password: u.password || u.password_hash || 'N/A',
    balance: u.balance || 0.0,
    created_at: u.created_at
  }));
  res.json(sanitized);
});

app.delete('/api/users/:id', (req, res) => {
  const targetId = req.params.id;
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
  
  if (result.changes === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ message: 'User deleted successfully.' });
});

// ---------- Balance routes ----------
app.get('/api/balance', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.session.userId);
  res.json({ balance: user ? (user.balance || 0.0) : 0.0 });
});

app.post('/api/balance/update', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const { delta } = req.body || {};
  const amount = parseFloat(delta);
  if (isNaN(amount)) return res.status(400).json({ error: 'Invalid amount' });

  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const newBalance = (user.balance || 0) + amount;
  if (newBalance < 0) return res.status(400).json({ error: 'Insufficient funds' });

  db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(newBalance, req.session.userId);

  res.json({ balance: newBalance });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
