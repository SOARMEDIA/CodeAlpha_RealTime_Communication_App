const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./data/db');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e8 // 100 MB buffer for file sharing
});

const PORT = process.env.PORT || 3003;
const JWT_SECRET = process.env.JWT_SECRET || 'codealpha_rtc_jwt_secret_2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Auth Middleware
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required' });
  }
  try {
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ---------------- AUTH ROUTES ----------------
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (db.findUserByEmail(email)) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: 'usr-' + Date.now(),
      name,
      email,
      password: hashedPassword,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80'
    };

    db.createUser(newUser);
    const token = jwt.sign({ id: newUser.id, name: newUser.name, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });
    const { password: _, ...userSafe } = newUser;
    res.status(201).json({ token, user: userSafe });
  } catch {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.findUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    const { password: _, ...userSafe } = user;
    res.json({ token, user: userSafe });
  } catch {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authenticate, (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password: _, ...userSafe } = user;
  res.json({ user: userSafe });
});

// ---------------- ROOM ROUTES ----------------
app.get('/api/rooms', (req, res) => {
  res.json({ rooms: db.getRooms() });
});

app.post('/api/rooms', (req, res) => {
  const { id, name } = req.body;
  const roomId = (id || 'room-' + Math.random().toString(36).substring(2, 8)).toLowerCase();
  const room = {
    id: roomId,
    name: name || `Meeting ${roomId}`,
    createdAt: new Date().toISOString()
  };
  db.createRoom(room);
  res.status(201).json({ room });
});

// ---------------- WEBRTC SIGNALING & COLLABORATION ----------------
const rooms = new Map(); // roomId -> Set of socket ids

io.on('connection', (socket) => {
  let currentRoomId = null;
  let userName = 'Anonymous';

  socket.on('join-room', ({ roomId, name }) => {
    currentRoomId = roomId;
    userName = name || 'Guest';

    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }

    const participants = Array.from(rooms.get(roomId));
    rooms.get(roomId).add(socket.id);

    // Notify newly connected peer of existing peers in the room
    socket.emit('all-users', { users: participants });

    // Notify others that a new peer has joined
    socket.to(roomId).emit('user-connected', {
      socketId: socket.id,
      name: userName
    });
  });

  // WebRTC SDP Offer
  socket.on('sending-signal', (payload) => {
    io.to(payload.userToSignal).emit('user-joined-signal', {
      signal: payload.signal,
      callerId: payload.callerId,
      name: userName
    });
  });

  // WebRTC SDP Answer
  socket.on('returning-signal', (payload) => {
    io.to(payload.callerId).emit('receiving-returned-signal', {
      signal: payload.signal,
      id: socket.id
    });
  });

  // WebRTC ICE Candidate
  socket.on('ice-candidate', (payload) => {
    io.to(payload.target).emit('ice-candidate', {
      candidate: payload.candidate,
      sender: socket.id
    });
  });

  // Whiteboard Real-time drawing synchronization
  socket.on('whiteboard-draw', (data) => {
    if (currentRoomId) {
      socket.to(currentRoomId).emit('whiteboard-draw', data);
    }
  });

  socket.on('whiteboard-clear', () => {
    if (currentRoomId) {
      socket.to(currentRoomId).emit('whiteboard-clear');
    }
  });

  // In-call Text Chat
  socket.on('chat-message', (data) => {
    if (currentRoomId) {
      const msg = {
        sender: userName,
        text: data.text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        socketId: socket.id
      };
      io.to(currentRoomId).emit('chat-message', msg);
    }
  });

  // File Sharing
  socket.on('file-share', (data) => {
    if (currentRoomId) {
      socket.to(currentRoomId).emit('file-received', {
        sender: userName,
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType,
        fileData: data.fileData
      });
    }
  });

  // Disconnection handler
  socket.on('disconnect', () => {
    if (currentRoomId && rooms.has(currentRoomId)) {
      rooms.get(currentRoomId).delete(socket.id);
      socket.to(currentRoomId).emit('user-disconnected', {
        socketId: socket.id,
        name: userName
      });
      if (rooms.get(currentRoomId).size === 0) {
        rooms.delete(currentRoomId);
      }
    }
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`📹 CodeAlpha Real-Time Communication Server running on http://localhost:${PORT}`);
});

