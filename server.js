require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const roomsRouter = require('./routes/rooms');
const bookingsRouter = require('./routes/bookings');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/rooms', roomsRouter);
app.use('/api/bookings', bookingsRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve the frontend (and the admin dashboard) as static files
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Noor Haveli server running at http://localhost:${PORT}`);
  if (!process.env.ADMIN_TOKEN) {
    console.log('Note: ADMIN_TOKEN is not set — admin endpoints will reject all requests until you set one in .env');
  }
});
