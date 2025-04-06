const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const passport = require('passport');
const uploadAvatar = require('../middleware/uploadMiddleware');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();
const saltRounds = 10;

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const sql = "SELECT id, email, password_hash, name, avatar_url FROM users WHERE email = ?";
    const [users] = await pool.query(sql, [email]);

    if (users.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ message: "Incorrect password." });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ message: "JWT secret missing." });
    }

    const payload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: '1h' });

    res.status(200).json({
      message: "Login successful!",
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url
      }
    });

  } catch (error) {
    res.status(500).json({ message: "Login error", error: error.message });
  }
});

router.post('/register', uploadAvatar, async (req, res) => {
  const { email, password, name } = req.body;
  const avatarFile = req.file;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters long." });
  }

  try {
    const checkUserSql = "SELECT id FROM users WHERE email = ?";
    const [existingUsers] = await pool.query(checkUserSql, [email]);

    if (existingUsers.length > 0) {
      return res.status(409).json({ message: "This email is already registered." });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const avatarUrlPath = avatarFile ? `/uploads/avatars/${avatarFile.filename}` : null;

    const insertSql = "INSERT INTO users (email, password_hash, name, avatar_url) VALUES (?, ?, ?, ?)";
    const values = [email, hashedPassword, name || null, avatarUrlPath];
    const [results] = await pool.query(insertSql, values);

    res.status(201).json({
      message: "User registered successfully!",
      userId: results.insertId
    });

  } catch (error) {
    res.status(500).json({ message: "Registration error", error: error.message });
  }
});

router.get('/me', protect, async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const userId = req.user.id;
    const sql = "SELECT id, email, name, avatar_url, created_at FROM users WHERE id = ?";
    const [users] = await pool.query(sql, [userId]);

    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(users[0]);

  } catch (error) {
    res.status(500).json({ message: 'Error fetching user data', error: error.message });
  }
});

router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: 'http://localhost:5173/login?error=google-auth-failed',
    session: false
  }),
  (req, res) => {
    if (!req.user || !req.user.token) {
      return res.redirect('http://localhost:5173/login?error=token-generation-failed');
    }

    const token = req.user.token;
    res.redirect(`http://localhost:5173/auth/callback?token=${token}`);
  }
);

module.exports = router;
