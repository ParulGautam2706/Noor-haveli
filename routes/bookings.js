const express = require('express');
const db = require('../db');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nightsBetween(checkin, checkout) {
  const ms = new Date(checkout) - new Date(checkin);
  return Math.round(ms / 86400000);
}

function validateStay(room, checkin, checkout) {
  const errors = [];
  if (!checkin || !checkout) {
    errors.push('Check-in and check-out dates are required.');
    return errors;
  }
  const ci = new Date(checkin);
  const co = new Date(checkout);
  if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())) {
    errors.push('Dates must be valid calendar dates.');
    return errors;
  }
  if (checkin < todayISO()) {
    errors.push('Check-in date cannot be in the past.');
  }
  if (co <= ci) {
    errors.push('Check-out must be after check-in.');
  }
  return errors;
}

// Units of a given room type already committed for any night that
// overlaps [checkin, checkout). Cancelled bookings don't count.
function unitsBooked(roomId, checkin, checkout, excludeBookingId = null) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM bookings
       WHERE room_id = ?
         AND status != 'cancelled'
         AND checkin < ?
         AND checkout > ?
         AND (? IS NULL OR id != ?)`
    )
    .get(roomId, checkout, checkin, excludeBookingId, excludeBookingId);
  return row.c;
}

// GET /api/bookings/availability?roomId=&checkin=&checkout=
router.get('/availability', (req, res) => {
  const { roomId, checkin, checkout } = req.query;
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
  if (!room) return res.status(404).json({ error: 'Room type not found.' });

  const errors = validateStay(room, checkin, checkout);
  if (errors.length) return res.status(400).json({ errors });

  const booked = unitsBooked(roomId, checkin, checkout);
  const unitsLeft = room.total_units - booked;
  res.json({
    roomId,
    checkin,
    checkout,
    nights: nightsBetween(checkin, checkout),
    unitsLeft,
    available: unitsLeft > 0
  });
});

// GET /api/bookings/lookup?id=&email= - public status check for a guest.
// Requires both the booking id AND the email used at booking time, so a
// guest can't page through other people's booking references.
router.get('/lookup', (req, res) => {
  const { id, email } = req.query;
  if (!id || !email) {
    return res.status(400).json({ error: 'Booking reference and email are both required.' });
  }

  const booking = db
    .prepare(
      `SELECT bookings.*, rooms.name AS room_name FROM bookings
       JOIN rooms ON rooms.id = bookings.room_id
       WHERE bookings.id = ?`
    )
    .get(id);

  // Same generic message whether the id doesn't exist or the email doesn't
  // match, so this endpoint can't be used to confirm someone else's email.
  if (!booking || booking.email.toLowerCase() !== String(email).trim().toLowerCase()) {
    return res.status(404).json({ error: 'No booking found with that reference number and email.' });
  }

  res.json({
    id: booking.id,
    status: booking.status,
    room: booking.room_name,
    checkin: booking.checkin,
    checkout: booking.checkout,
    nights: booking.nights,
    totalPrice: booking.total_price,
    guests: booking.guests,
    createdAt: booking.created_at
  });
});

// POST /api/bookings - create a new booking request
router.post('/', (req, res) => {
  const { name, email, phone, guests, checkin, checkout, roomId, notes } = req.body || {};

  const fieldErrors = [];
  if (!name || !name.trim()) fieldErrors.push('Full name is required.');
  if (!email || !EMAIL_RE.test(email)) fieldErrors.push('A valid email is required.');
  if (!phone || !phone.trim()) fieldErrors.push('Phone number is required.');
  if (!roomId) fieldErrors.push('Room type is required.');

  const room = roomId ? db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) : null;
  if (roomId && !room) fieldErrors.push('Selected room type does not exist.');

  if (room) {
    fieldErrors.push(...validateStay(room, checkin, checkout));
  }

  if (fieldErrors.length) {
    return res.status(400).json({ errors: fieldErrors });
  }

  const booked = unitsBooked(roomId, checkin, checkout);
  if (booked >= room.total_units) {
    return res.status(409).json({
      errors: [`Sorry, ${room.name} is fully booked for those dates. Try different dates or another room type.`]
    });
  }

  const nights = nightsBetween(checkin, checkout);
  const totalPrice = nights * room.price;

  const result = db
    .prepare(
      `INSERT INTO bookings (room_id, name, email, phone, guests, checkin, checkout, nights, total_price, notes, status)
       VALUES (@room_id, @name, @email, @phone, @guests, @checkin, @checkout, @nights, @total_price, @notes, 'pending')`
    )
    .run({
      room_id: roomId,
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      guests: guests || '2',
      checkin,
      checkout,
      nights,
      total_price: totalPrice,
      notes: notes ? notes.trim() : null
    });

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(result.lastInsertRowid);

  res.status(201).json({
    id: booking.id,
    status: booking.status,
    room: { id: room.id, name: room.name },
    checkin: booking.checkin,
    checkout: booking.checkout,
    nights: booking.nights,
    totalPrice: booking.total_price,
    message: `Request received — booking reference #${booking.id}. We'll confirm your stay by phone or email shortly. You can check your booking status anytime at /lookup.html using this reference number and your email.`
  });
});

// --- Admin endpoints, protected by a shared token ---
function requireAdmin(req, res, next) {
  const token = req.get('x-admin-token');
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized. Provide a valid x-admin-token header.' });
  }
  next();
}

// GET /api/bookings - list all bookings (admin only)
router.get('/', requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT bookings.*, rooms.name AS room_name FROM bookings
       JOIN rooms ON rooms.id = bookings.room_id
       ORDER BY bookings.created_at DESC`
    )
    .all();
  res.json(rows);
});

// PATCH /api/bookings/:id - update status (admin only)
router.patch('/:id', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  const valid = ['pending', 'confirmed', 'cancelled'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${valid.join(', ')}` });
  }
  const existing = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Booking not found.' });

  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ id: Number(req.params.id), status });
});

module.exports = router;
