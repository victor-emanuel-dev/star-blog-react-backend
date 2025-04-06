const express = require('express');
const cors = require('cors');
require('dotenv').config();
const passport = require('passport');
require('./config/passport-setup');
const postsRouter = require('./routes/posts');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const commentsRouter = require('./routes/comments');
const session = require('express-session');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { socketAuthMiddleware } = require('./middleware/socketAuthMiddleware');

const app = express();
const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  }
});

app.set('socketio', io);
io.use(socketAuthMiddleware);

io.on('connection', (socket) => {
  if (!socket.user) {
    console.error('Unauthenticated socket connection attempt');
    return socket.disconnect(true);
  }

  const userId = socket.user.id.toString();
  socket.join(userId);

  console.log(`User ${userId} connected via WebSocket: ${socket.id}`);

  socket.on('disconnect', (reason) => {
    console.log(`User ${userId} disconnected: ${reason}`);
  });
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_session_secret',
  resave: false,
  saveUninitialized: false,
}));

app.use(passport.initialize());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.json({ message: 'Hello from Star Blog Backend!' });
});

app.use('/api/posts', postsRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/comments', commentsRouter);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
