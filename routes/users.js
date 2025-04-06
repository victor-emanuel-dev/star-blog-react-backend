// backend/routes/users.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const fs = require('fs').promises;
const path = require('path');
const { protect } = require('../middleware/authMiddleware');
const uploadAvatar = require('../middleware/uploadMiddleware');
const bcrypt = require('bcrypt');

router.put('/profile', protect, uploadAvatar, async (req, res) => {
  const userId = req.user.id;
  const { name } = req.body;
  const avatarFile = req.file;

  const fieldsToUpdate = {};
  const values = [];

  if (name) {
    fieldsToUpdate.name = name;
    values.push(name);
  }

  let oldAvatarPath = null;
  let newAvatarPath = null;

  try {
    if (avatarFile) {
      newAvatarPath = `/uploads/avatars/${avatarFile.filename}`;
      fieldsToUpdate.avatar_url = newAvatarPath;
      values.push(newAvatarPath);

      const [userData] = await pool.query("SELECT avatar_url FROM users WHERE id = ?", [userId]);
      if (userData.length > 0 && userData[0].avatar_url) {
        oldAvatarPath = userData[0].avatar_url;
      }
    }

    if (values.length === 0) {
      return res.status(400).json({ message: "No update data provided." });
    }

    const setClause = Object.keys(fieldsToUpdate).map(key => `${key} = ?`).join(', ');
    const sql = `UPDATE users SET ${setClause} WHERE id = ?`;
    values.push(userId);

    const [result] = await pool.query(sql, values);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    if (newAvatarPath && oldAvatarPath?.startsWith('/uploads/')) {
      const oldFilePath = path.join(__dirname, '..', oldAvatarPath);
      try {
        await fs.unlink(oldFilePath);
      } catch (_) {}
    }

    const [updatedUser] = await pool.query(
      "SELECT id, email, name, avatar_url, created_at FROM users WHERE id = ?",
      [userId]
    );

    if (updatedUser.length === 0) {
      return res.status(404).json({ message: "User not found after update." });
    }

    res.status(200).json({
      message: "Profile updated successfully.",
      user: updatedUser[0],
    });

  } catch (error) {
    if (avatarFile) {
      try {
        await fs.unlink(avatarFile.path);
      } catch (_) {}
    }
    res.status(500).json({ message: "Internal server error.", error: error.message });
  }
});

router.put('/password', protect, async (req, res) => {
  const userId = req.user.id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current and new passwords are required.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters.' });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ message: 'New password must be different from the current one.' });
  }

  try {
    const [users] = await pool.query("SELECT password_hash FROM users WHERE id = ?", [userId]);

    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const storedHash = users[0].password_hash;

    if (!storedHash) {
      return res.status(400).json({ message: 'Cannot change password for social login accounts.' });
    }

    const match = await bcrypt.compare(currentPassword, storedHash);
    if (!match) {
      return res.status(401).json({ message: 'Incorrect current password.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [hashedPassword, userId]);

    res.status(200).json({ message: 'Password updated successfully.' });

  } catch (error) {
    res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
});

module.exports = router;
