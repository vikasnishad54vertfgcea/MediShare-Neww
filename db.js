// db.js — lightweight file-backed data store.
// Uses a single JSON file on disk as the "database" so the whole app runs
// with zero external services (no MySQL server required to demo/run).
// The shape mirrors the relational tables described in the project spec:
// users, medicines, medicine_requests, notifications, reviews.

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

function emptyDb() {
  return {
    users: [],
    medicines: [],
    requests: [],
    notifications: [],
    reviews: [],
    messages: [],
    _seq: { users: 0, medicines: 0, requests: 0, notifications: 0, reviews: 0, messages: 0 },
  };
}

function load() {
  if (!fs.existsSync(DB_PATH)) {
    const fresh = emptyDb();
    save(fresh);
    return fresh;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    // Backfill fields added after this file may have first been created.
    if (!parsed.messages) parsed.messages = [];
    if (!parsed._seq) parsed._seq = {};
    if (!parsed._seq.messages) parsed._seq.messages = 0;
    parsed.users.forEach((u) => { if (!u.savedMedicineIds) u.savedMedicineIds = []; });
    parsed.medicines.forEach((m) => { if (!m.unit) m.unit = 'unit'; });
    return parsed;
  } catch (e) {
    console.error('Failed to read db.json, starting fresh:', e.message);
    const fresh = emptyDb();
    save(fresh);
    return fresh;
  }
}

function save(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function nextId(db, table) {
  db._seq[table] = (db._seq[table] || 0) + 1;
  return db._seq[table];
}

// A tiny convenience wrapper so route files don't juggle load/save manually.
const store = {
  read() {
    return load();
  },
  write(db) {
    save(db);
  },
  nextId,
};

module.exports = store;
