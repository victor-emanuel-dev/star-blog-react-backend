const jwt = require('jsonwebtoken');
require('dotenv').config();

const socketAuthMiddleware = (socket, next) => {
  const token = socket.handshake.auth.token;
  const jwtSecret = process.env.JWT_SECRET;

  if (!token) return next(new Error('Authentication error: No token provided'));
  if (!jwtSecret) return next(new Error('Authentication error: Server configuration issue'));

  try {
    const decoded = jwt.verify(token, jwtSecret);

    socket.user = {
      id: decoded.userId,
      email: decoded.email,
      name: decoded.name,
      avatarUrl: decoded.avatarUrl
    };

    console.log('[Socket Auth] Authenticated user:', socket.user.id);
    next();

  } catch (err) {
    console.error('[Socket Auth] Invalid token:', err.message);
    next(new Error('Authentication error: Invalid token'));
  }
};

module.exports = { socketAuthMiddleware };
