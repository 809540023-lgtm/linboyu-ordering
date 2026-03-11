// Authentication routes
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const crypto = require('crypto');

// Simple password hashing
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'linboyu-salt').digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  try {
    const { name, phone, email, password } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ error: '缺少必填欄位' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: '密碼至少4碼' });
    }

    // Check if phone exists
    const existing = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone);
    if (existing) {
      // Check if already has password
      const hasPass = db.prepare("SELECT value FROM settings WHERE key = ?").get(`user_pass_${phone}`);
      if (hasPass) {
        return res.status(400).json({ error: '此手機號碼已註冊，請直接登入' });
      }
    }

    // Create or update customer
    if (!existing) {
      db.prepare('INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)').run(name, phone, email || null);
    } else {
      db.prepare('UPDATE customers SET name = ?, email = ? WHERE phone = ?').run(name, email || null, phone);
    }

    // Store hashed password
    const hashed = hashPassword(password);
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").run(`user_pass_${phone}`, hashed);

    const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
    const token = generateToken();
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").run(`token_${token}`, phone);

    res.json({
      success: true,
      data: {
        token,
        user: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email }
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: '請輸入手機號碼和密碼' });
    }

    const storedHash = db.prepare("SELECT value FROM settings WHERE key = ?").get(`user_pass_${phone}`);
    if (!storedHash) {
      return res.status(401).json({ error: '帳號不存在，請先註冊' });
    }

    if (storedHash.value !== hashPassword(password)) {
      return res.status(401).json({ error: '密碼錯誤' });
    }

    const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
    if (!customer) {
      return res.status(401).json({ error: '帳號資料異常' });
    }

    const token = generateToken();
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").run(`token_${token}`, phone);

    res.json({
      success: true,
      data: {
        token,
        user: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email }
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Decode Google ID Token JWT (without external library)
function decodeGoogleIdToken(credential) {
  try {
    // JWT format: header.payload.signature
    const parts = credential.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT format');

    // Decode the payload (base64url -> base64 -> JSON)
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const decoded = Buffer.from(payload, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (err) {
    console.error('JWT decode error:', err);
    return null;
  }
}

// POST /api/auth/google
router.post('/google', (req, res) => {
  try {
    let { name, email, google_id, credential } = req.body;

    // If credential (JWT) is provided, decode it to extract user info
    if (credential && !email) {
      const decoded = decodeGoogleIdToken(credential);
      if (decoded) {
        email = decoded.email;
        name = decoded.name || decoded.given_name || email.split('@')[0];
        google_id = decoded.sub; // Google's unique user ID
        console.log('Google login decoded:', { email, name, google_id: google_id?.substring(0, 8) + '...' });
      } else {
        return res.status(400).json({ error: 'Google token 解碼失敗' });
      }
    }

    if (!email) {
      return res.status(400).json({ error: '缺少 Google 帳號資訊' });
    }

    // Find or create customer by email
    let customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
    if (!customer) {
      db.prepare('INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)').run(name || email.split('@')[0], google_id || '', email);
      customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
    }

    const token = generateToken();
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").run(`token_${token}`, customer.phone || customer.email);

    res.json({
      success: true,
      data: {
        token,
        user: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email }
      }
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
