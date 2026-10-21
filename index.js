const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());

// Serve the game frontend
app.use(express.static(path.join(__dirname, '../client/public')));

// ============ IN-MEMORY DATA (will be replaced with DB later) ============
const users = new Map();
const messages = [];
const boardState = {
  tiles: generateInitialBoard(),
  residueHistory: []
};

const JWT_SECRET = process.env.JWT_SECRET || "residue-god-secret-change-this-later";
const GOD_USERNAME = "God";

const ROLES = [
  "Fading Echo",
  "Memory Keeper",
  "Corruptor",
  "Preserver",
  "Wanderer",
  "Bound Fragment",
  "Silent Observer",
  "Echo Hunter"
];

function generateInitialBoard() {
  const tiles = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      tiles.push({
        id: `${x}-${y}`,
        x, y,
        type: "memory",
        state: "neutral",
        label: `Memory Fragment ${x},${y}`,
        residue: null
      });
    }
  }
  return tiles;
}

// ============ AUTH ============
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  if (users.has(username)) return res.status(400).json({ error: "Username already taken" });

  const hashed = await bcrypt.hash(password, 10);
  const role = ROLES[Math.floor(Math.random() * ROLES.length)];

  const user = {
    id: uuidv4(),
    username,
    password: hashed,
    role,
    life: 100,
    power: 10,
    skills: [],
    isGod: username === GOD_USERNAME,
    blocked: [],
    banned: false,
    createdAt: Date.now()
  };

  users.set(username, user);

  const token = jwt.sign({ id: user.id, username, isGod: user.isGod }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username, role, life: user.life, power: user.power, isGod: user.isGod } });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = users.get(username);
  if (!user) return res.status(400).json({ error: "Invalid credentials" });
  if (user.banned) return res.status(403).json({ error: "You have been banned" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ error: "Invalid credentials" });

  const token = jwt.sign({ id: user.id, username, isGod: user.isGod }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username, role: user.role, life: user.life, power: user.power, isGod: user.isGod } });
});

// Catch-all: send the game page
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/index.html'));
});

// ============ SOCKET.IO ============
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('join', (data) => {
    const { token } = data;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.user = decoded;
      socket.join('main-room');

      socket.emit('board-update', boardState);
      io.to('main-room').emit('player-joined', {
        username: decoded.username,
        role: users.get(decoded.username)?.role
      });
    } catch (e) {
      socket.emit('error', 'Invalid token');
    }
  });

  socket.on('public-message', (msg) => {
    if (!socket.user) return;
    const message = {
      id: uuidv4(),
      type: 'public',
      from: socket.user.username,
      text: msg.text,
      timestamp: Date.now()
    };
    messages.push(message);
    io.to('main-room').emit('new-message', message);
  });

  socket.on('private-message', (msg) => {
    if (!socket.user) return;
    const message = {
      id: uuidv4(),
      type: 'private',
      from: socket.user.username,
      to: msg.to,
      text: msg.text,
      timestamp: Date.now()
    };
    messages.push(message);

    io.sockets.sockets.forEach(s => {
      if (s.user && (s.user.username === msg.to || s.user.username === socket.user.username || s.user.isGod)) {
        s.emit('new-message', message);
      }
    });
  });

  socket.on('god-get-all-messages', () => {
    if (socket.user?.isGod) {
      socket.emit('all-messages', messages);
    }
  });

  socket.on('combat-action', (data) => {
    if (!socket.user) return;
    const { target, powerName, isCommonEnemy } = data;
    const roll = Math.floor(Math.random() * 20) + 1;
    const attacker = users.get(socket.user.username);

    const result = {
      attacker: socket.user.username,
      target: isCommonEnemy ? "Common Enemy" : target,
      power: powerName,
      roll,
      powerValue: attacker?.power || 10,
      timestamp: Date.now()
    };

    io.to('main-room').emit('combat-result', result);
  });

  socket.on('god-action', (data) => {
    if (!socket.user?.isGod) return;

    const { action, targetUsername, value } = data;
    const target = users.get(targetUsername);

    if (!target && action !== 'skip-turn') return;

    switch (action) {
      case 'take-life':
        target.life = Math.max(0, target.life - (value || 100));
        break;
      case 'give-life':
        target.life += (value || 20);
        break;
      case 'give-power':
        target.power += (value || 5);
        break;
      case 'skip-turn':
        io.to('main-room').emit('turn-skipped', { username: targetUsername });
        break;
      case 'modify-attack':
        io.to('main-room').emit('attack-modified', { target: targetUsername, modifier: value });
        break;
      case 'ban':
        target.banned = true;
        break;
    }

    io.to('main-room').emit('player-update', {
      username: targetUsername,
      life: target?.life,
      power: target?.power,
      banned: target?.banned
    });
  });

  socket.on('leave-residue', (data) => {
    if (!socket.user) return;
    const { tileId, type } = data;
    const tile = boardState.tiles.find(t => t.id === tileId);
    if (!tile) return;

    tile.state = type === 'preserve' ? 'preserved' : type === 'absorb' ? 'absorbed' : 'corrupted';
    tile.residue = {
      by: socket.user.username,
      type,
      at: Date.now()
    };

    boardState.residueHistory.push({
      tileId,
      by: socket.user.username,
      type,
      at: Date.now()
    });

    io.to('main-room').emit('board-update', boardState);
  });

  socket.on('disconnect', () => {
    if (socket.user) {
      io.to('main-room').emit('player-left', { username: socket.user.username });
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Residue server running on port ${PORT}`);
});
