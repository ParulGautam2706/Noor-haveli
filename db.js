const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'noorhaveli.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    size_sqft INTEGER NOT NULL,
    sleeps INTEGER NOT NULL,
    total_units INTEGER NOT NULL,
    tags TEXT NOT NULL,
    image TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    guests TEXT NOT NULL,
    checkin TEXT NOT NULL,
    checkout TEXT NOT NULL,
    nights INTEGER NOT NULL,
    total_price INTEGER NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  );
`);

// Seed rooms only if the table is empty, so re-running the server never
// duplicates or resets data that's already there.
const roomCount = db.prepare('SELECT COUNT(*) AS c FROM rooms').get().c;
if (roomCount === 0) {
  const insert = db.prepare(`
    INSERT INTO rooms (id, name, price, size_sqft, sleeps, total_units, tags, image)
    VALUES (@id, @name, @price, @size_sqft, @sleeps, @total_units, @tags, @image)
  `);
  const rooms = [
    {
      id: 'river-view',
      name: 'River View Room',
      price: 6500,
      size_sqft: 320,
      sleeps: 2,
      total_units: 8,
      tags: JSON.stringify(['River-facing balcony', 'Free WiFi', 'AC']),
      image: 'https://picsum.photos/id/164/700/440'
    },
    {
      id: 'haveli-heritage',
      name: 'Haveli Heritage Room',
      price: 8000,
      size_sqft: 380,
      sleeps: 2,
      total_units: 6,
      tags: JSON.stringify(['Original stone walls', 'Courtyard view', 'AC']),
      image: 'https://picsum.photos/id/1029/700/440'
    },
    {
      id: 'deluxe-balcony',
      name: 'Deluxe Balcony Suite',
      price: 9200,
      size_sqft: 420,
      sleeps: 3,
      total_units: 5,
      tags: JSON.stringify(['Private balcony', 'Soaking tub', 'Minibar']),
      image: 'https://picsum.photos/id/1040/700/440'
    },
    {
      id: 'family-suite',
      name: 'Family Suite',
      price: 12500,
      size_sqft: 560,
      sleeps: 4,
      total_units: 3,
      tags: JSON.stringify(['Two rooms', 'River view', 'Living area']),
      image: 'https://picsum.photos/id/1039/700/440'
    }
  ];
  db.exec('BEGIN');
  try {
    for (const r of rooms) insert.run(r);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  console.log(`Seeded ${rooms.length} room types.`);
}

module.exports = db;
