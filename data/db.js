const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function ensureFile(filename, defaultContent = []) {
  const filePath = path.join(dataDir, filename);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2), 'utf-8');
  }
  return filePath;
}

const defaultPasswordHash = bcrypt.hashSync('password123', 8);

const defaultUsers = [
  {
    id: "usr-redeemer",
    name: "Redeemer Jerrey Kow Williams",
    email: "redeemer@codealpha.tech",
    password: defaultPasswordHash,
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80"
  },
  {
    id: "usr-jordan",
    name: "Jordan Lee",
    email: "jordan@codealpha.tech",
    password: defaultPasswordHash,
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80"
  }
];

class CommDatabase {
  constructor() {
    this.usersFile = ensureFile('users.json', defaultUsers);
    this.roomsFile = ensureFile('rooms.json', [
      { id: "alpha-standup", name: "Daily Standup Meeting", createdAt: "2026-10-13T09:00:00.000Z" },
      { id: "alpha-whiteboard", name: "Sprint Architecture Whiteboard", createdAt: "2026-10-13T10:00:00.000Z" }
    ]);
  }

  read(file) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8') || '[]');
    } catch {
      return [];
    }
  }

  write(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  }

  // Users
  getUsers() { return this.read(this.usersFile); }
  findUserById(id) { return this.getUsers().find(u => u.id === id); }
  findUserByEmail(email) { return this.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase()); }
  createUser(u) {
    const users = this.getUsers();
    users.push(u);
    this.write(this.usersFile, users);
    return u;
  }

  // Rooms
  getRooms() { return this.read(this.roomsFile); }
  createRoom(room) {
    const rooms = this.getRooms();
    if (!rooms.some(r => r.id === room.id)) {
      rooms.unshift(room);
      this.write(this.roomsFile, rooms);
    }
    return room;
  }
}

module.exports = new CommDatabase();

