# Noor Haveli — hotel website with a real backend

Your original static site, now wired up to an actual Node.js + Express +
SQLite backend. Bookings are validated, checked against real room
inventory, and stored in a database — nothing is faked with a
`setTimeout` anymore.

## What's in here

```
noor-haveli/
├── server.js            Express app entry point
├── db.js                SQLite setup + seed data for the 4 room types
├── routes/
│   ├── rooms.js          GET /api/rooms, GET /api/rooms/:id
│   └── bookings.js       booking creation, availability checks, admin endpoints
├── public/
│   ├── index.html        the hotel site (now calling the API instead of faking it)
│   └── admin.html        a small dashboard to view/manage booking requests
├── data/                 SQLite database file lives here (created on first run)
├── .env.example          copy to .env and edit
└── package.json
```

## What changed vs. the original file

- **Room prices/inventory are now server-side data**, not hardcoded in the
  `<select>`. The booking form fetches `/api/rooms` on load and builds its
  dropdown from that, so the price shown always matches what the server
  will actually charge.
- **The booking form really submits** to `POST /api/bookings`. It's
  validated (name, phone, valid email, valid date range, check-in not in
  the past) and checked against how many rooms of that type are already
  booked for overlapping nights — each room type has a fixed number of
  physical units (see `db.js`), so it can't be overbooked.
- **A live availability check** runs whenever the guest changes dates or
  room type, so they see "no units free for those dates" before they even
  submit.
- **A booking reference number** comes back from the server and is shown
  in the confirmation message.
- **An admin dashboard** (`/admin.html`) lists every booking and lets you
  mark it pending / confirmed / cancelled. It's protected by a token you
  set yourself (see below) — there's no user login system, just a shared
  secret, which is enough for a single small property to keep the
  booking list private.

## Running it

You need Node.js 18+ installed.

```bash
cd noor-haveli
npm install
cp .env.example .env      # then edit .env and set your own ADMIN_TOKEN
npm start
```

Then open:
- **http://localhost:3000/** — the hotel website
- **http://localhost:3000/admin.html** — the booking dashboard (enter the
  `ADMIN_TOKEN` from your `.env` file to log in)

The database file is created automatically at `data/noorhaveli.db` the
first time you run the server, seeded with the four room types from the
original page (River View, Haveli Heritage, Deluxe Balcony Suite, Family
Suite), each with a set number of physical rooms.

## API reference

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/rooms` | List all room types with live prices/inventory |
| GET | `/api/rooms/:id` | Get one room type |
| GET | `/api/bookings/availability?roomId=&checkin=&checkout=` | Check if a room type has a free unit for those dates |
| POST | `/api/bookings` | Submit a booking request |
| GET | `/api/bookings` | List all bookings *(requires `x-admin-token` header)* |
| PATCH | `/api/bookings/:id` | Update a booking's status *(requires `x-admin-token` header)* |

## Things worth knowing before you take this live

- **No email/SMS is actually sent.** The site tells guests you'll confirm
  "by phone or email shortly," and the admin dashboard is where you'd
  action that manually. If you want automatic confirmation emails, the
  natural next step is adding [Nodemailer](https://nodemailer.com/) (or a
  transactional email API) inside the `POST /api/bookings` handler in
  `routes/bookings.js`.
- **No payment processing.** This is a "request to book" flow, matching
  the original design's copy ("Request received — we'll confirm..."). If
  you want to actually charge cards, you'd integrate something like
  Razorpay or Stripe at that point.
- **The admin token is a shared secret, not a login system.** Fine for
  one or two staff members; if you need multiple admin accounts with
  different permissions, that's a bigger addition (proper auth + a users
  table).
- **SQLite is a single file** (`data/noorhaveli.db`) — great for a small
  property's booking volume and dead simple to back up (just copy the
  file), but if you ever need multiple servers writing at once, you'd
  want to move to Postgres.
- **Room counts are illustrative** (8 River View, 6 Haveli Heritage, 5
  Deluxe Balcony, 3 Family Suite — 22 total, matching "a 22-room haveli"
  from the copy). Edit the `rooms` array in `db.js` before first run to
  match your real inventory, or update the `rooms` table directly
  afterward.
