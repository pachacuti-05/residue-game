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
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const JWT_SECRET = process.env.JWT_SECRET || "residue-god-secret-v2";
const GOD_USERNAME = "God";

const ROLES = ["Fading Echo","Memory Keeper","Corruptor","Preserver","Wanderer","Bound Fragment","Silent Observer","Echo Hunter"];

// 32 spaces with names + icons
const SPACES = [
  { type: "START",    name: "Origin",           icon: "🌀" },
  { type: "MEMORY",   name: "Fading Hall",      icon: "🏛️" },
  { type: "ATTACK",   name: "Broken Blade",     icon: "⚔️" },
  { type: "ABSORB",   name: "Soul Well",        icon: "💧" },
  { type: "MEMORY",   name: "Whisper Lane",     icon: "🌫️" },
  { type: "ATTACK",   name: "Scarred Path",     icon: "🗡️" },
  { type: "PRESERVE", name: "Crystal Shrine",   icon: "💎" },
  { type: "MEMORY",   name: "Echo Chamber",     icon: "🔊" },
  { type: "ATTACK",   name: "Blood Gate",       icon: "🩸" },
  { type: "ABSORB",   name: "Void Pool",        icon: "🌑" },
  { type: "MEMORY",   name: "Lost Gallery",     icon: "🖼️" },
  { type: "CORRUPT",  name: "Twisted Root",     icon: "🌳" },
  { type: "ATTACK",   name: "Iron Thorn",       icon: "🌵" },
  { type: "MEMORY",   name: "Silent Vault",     icon: "🔒" },
  { type: "ABSORB",   name: "Memory Drain",     icon: "🌀" },
  { type: "MEMORY",   name: "Faded Portrait",   icon: "👤" },
  { type: "ATTACK",   name: "War Echo",         icon: "💥" },
  { type: "PRESERVE", name: "Pure Light",       icon: "✨" },
  { type: "MEMORY",   name: "Old Letters",      icon: "📜" },
  { type: "ABSORB",   name: "Hunger Pit",       icon: "🕳️" },
  { type: "ATTACK",   name: "Razor Edge",       icon: "🔪" },
  { type: "MEMORY",   name: "Dream Corridor",   icon: "🌙" },
  { type: "CORRUPT",  name: "Black Bloom",      icon: "🥀" },
  { type: "MEMORY",   name: "Forgotten Name",   icon: "❓" },
  { type: "ATTACK",   name: "Final Strike",     icon: "⚡" },
  { type: "ABSORB",   name: "Deep Absorb",      icon: "🧿" },
  { type: "MEMORY",   name: "Mirror Hall",      icon: "🪞" },
  { type: "PRESERVE", name: "Safe Haven",       icon: "🛡️" },
  { type: "ATTACK",   name: "Chaos Point",      icon: "🔥" },
  { type: "MEMORY",   name: "Last Memory",      icon: "🧠" },
  { type: "ABSORB",   name: "Endless Well",     icon: "♾️" },
  { type: "END",      name: "The End",          icon: "☠️" }
];

const users = new Map();
const messages = [];
let game = {
  players: [],
  turnIndex: 0,
  phase: "waiting",
  lastRoll: null,
  combat: null,
  board: SPACES.map((s, i) => ({ id: i, ...s, residue: null }))
};

const COLORS = ["#ef4444","#3b82f6","#22c55e","#eab308","#a855f7","#ec4899","#14b8a6","#f97316"];

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  if (users.has(username)) return res.status(400).json({ error: "Username already taken" });

  const hashed = await bcrypt.hash(password, 10);
  const role = ROLES[Math.floor(Math.random() * ROLES.length)];
  const isGod = username === GOD_USERNAME;

  const user = { id: uuidv4(), username, password: hashed, role, life: 100, power: 10, isGod, banned: false };
  users.set(username, user);

  const token = jwt.sign({ id: user.id, username, isGod }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username, role, life: 100, power: 10, isGod } });
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

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

io.on('connection', (socket) => {
  socket.on('join', (data) => {
    try {
      const decoded = jwt.verify(data.token, JWT_SECRET);
      socket.user = decoded;
      socket.join('game');

      let p = game.players.find(pl => pl.username === decoded.username);
      if (!p) {
        p = {
          username: decoded.username,
          role: users.get(decoded.username)?.role || "Wanderer",
          life: users.get(decoded.username)?.life || 100,
          power: users.get(decoded.username)?.power || 10,
          position: 0,
          color: COLORS[game.players.length % COLORS.length],
          isGod: decoded.isGod
        };
        game.players.push(p);
      }

      socket.emit('full-state', { game, messages: messages.slice(-50) });
      io.to('game').emit('players-update', game.players);
    } catch (e) {
      socket.emit('error', 'Invalid token');
    }
  });

  socket.on('public-message', (msg) => {
    if (!socket.user) return;
    const m = { id: uuidv4(), type: 'public', from: socket.user.username, text: msg.text, timestamp: Date.now() };
    messages.push(m);
    io.to('game').emit('new-message', m);
  });

  socket.on('private-message', (msg) => {
    if (!socket.user) return;
    const m = { id: uuidv4(), type: 'private', from: socket.user.username, to: msg.to, text: msg.text, timestamp: Date.now() };
    messages.push(m);
    io.sockets.sockets.forEach(s => {
      if (s.user && (s.user.username === msg.to || s.user.username === socket.user.username || s.user.isGod)) {
        s.emit('new-message', m);
      }
    });
  });

  socket.on('roll-dice', () => {
    if (!socket.user) return;
    const current = game.players[game.turnIndex];
    if (!current || current.username !== socket.user.username) return;

    const roll = Math.floor(Math.random() * 6) + 1;
    game.lastRoll = roll;
    current.position = (current.position + roll) % 32;

    const space = game.board[current.position];
    game.phase = "action";

    io.to('game').emit('dice-rolled', { username: current.username, roll, position: current.position, space });
    io.to('game').emit('players-update', game.players);
  });

  socket.on('space-action', (data) => {
    if (!socket.user) return;
    const current = game.players[game.turnIndex];
    if (!current || current.username !== socket.user.username) return;

    const { action, target } = data;

    if (action === 'absorb' || action === 'preserve' || action === 'corrupt') {
      const space = game.board[current.position];
      space.residue = { by: current.username, type: action, at: Date.now() };
      if (action === 'absorb') current.power += 3;
      if (action === 'corrupt') current.power += 5;
      io.to('game').emit('board-update', game.board);
      io.to('game').emit('players-update', game.players);
    }

    if (action === 'attack' && target) {
      const targetPlayer = game.players.find(p => p.username === target);
      if (!targetPlayer) return;

      const roll = Math.floor(Math.random() * 20) + 1;
      game.combat = {
        attacker: current.username,
        target,
        power: current.power,
        roll,
        canBlock: !current.isGod,
        resolved: false
      };
      game.phase = "combat";
      io.to('game').emit('combat-start', game.combat);
      return;
    }

    nextTurn();
  });

  socket.on('combat-response', (data) => {
    if (!socket.user) return;
    if (!game.combat || game.combat.target !== socket.user.username) return;

    const { blocked } = data;
    const target = game.players.find(p => p.username === game.combat.target);

    if (blocked && game.combat.canBlock) {
      io.to('game').emit('combat-result', { ...game.combat, blocked: true, damage: 0 });
    } else {
      const damage = Math.max(5, Math.floor((game.combat.roll + game.combat.power) / 3));
      target.life = Math.max(0, target.life - damage);
      io.to('game').emit('combat-result', { ...game.combat, blocked: false, damage });
      io.to('game').emit('players-update', game.players);
    }

    game.combat = null;
    nextTurn();
  });

  socket.on('god-action', (data) => {
    if (!socket.user?.isGod) return;
    const { action, targetUsername, value } = data;
    const target = game.players.find(p => p.username === targetUsername);

    switch (action) {
      case 'take-life':
        if (target) target.life = Math.max(0, target.life - (value || 30));
        break;
      case 'give-life':
        if (target) target.life += (value || 20);
        break;
      case 'give-power':
        if (target) target.power += (value || 5);
        break;
      case 'skip-turn':
        nextTurn();
        return;
      case 'ban':
        const u = users.get(targetUsername);
        if (u) u.banned = true;
        game.players = game.players.filter(p => p.username !== targetUsername);
        break;
    }
    io.to('game').emit('players-update', game.players);
  });

  socket.on('god-get-all-messages', () => {
    if (socket.user?.isGod) socket.emit('all-messages', messages);
  });

  function nextTurn() {
    if (game.players.length === 0) return;
    game.turnIndex = (game.turnIndex + 1) % game.players.length;
    game.phase = "rolling";
    game.lastRoll = null;
    io.to('game').emit('turn-change', {
      current: game.players[game.turnIndex].username,
      phase: game.phase
    });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Residue v2 running on port ${PORT}`));
