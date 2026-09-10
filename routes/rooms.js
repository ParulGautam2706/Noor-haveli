const express = require('express');
const db = require('../db');

const router = express.Router();

function serializeRoom(row) {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    sizeSqft: row.size_sqft,
    sleeps: row.sleeps,
    totalUnits: row.total_units,
    tags: JSON.parse(row.tags),
    image: row.image
  };
}

// GET /api/rooms - list all room types
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM rooms ORDER BY price ASC').all();
  res.json(rows.map(serializeRoom));
});

// GET /api/rooms/:id - single room type
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Room type not found.' });
  res.json(serializeRoom(row));
});

module.exports = router;
