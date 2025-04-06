const jwt = require('jsonwebtoken');
require('dotenv').config();

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer')) {
    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET;

    try {
      if (!jwtSecret) throw new Error('JWT_SECRET not configured');

      const decoded = jwt.verify(token, jwtSecret);
      req.user = {
        id: decoded.userId,
        email: decoded.email,
        name: decoded.name,
        avatarUrl: decoded.avatarUrl
      };

      return next();

    } catch (err) {
      console.error('Token verification failed:', err.message);
      return res.status(401).json({ message: 'Not authorized, token invalid.' });
    }
  }

  return res.status(401).json({ message: 'Not authorized, no token provided.' });
};

const tryAttachUser = async (req, res, next) => {
  req.user = null;
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer')) {
    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET;

    try {
      if (jwtSecret) {
        const decoded = jwt.verify(token, jwtSecret);
        req.user = {
          id: decoded.userId,
          email: decoded.email,
          name: decoded.name,
          avatarUrl: decoded.avatarUrl
        };
        console.log('[tryAttachUser] User attached:', req.user.id);
      }
    } catch {
      console.log('[tryAttachUser] Invalid token, continuing unauthenticated.');
    }
  }

  next();
};

module.exports = { protect, tryAttachUser };
