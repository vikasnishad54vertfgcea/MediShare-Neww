const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { publicUser, matchScore, daysUntil, clean } = require('../utils');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `med_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG or WEBP photos are allowed.'));
    }
    cb(null, true);
  },
});

function medicineView(m, donor) {
  return {
    id: m.id,
    name: m.name,
    type: m.type,
    strength: m.strength,
    quantity: m.quantity,
    unit: m.unit,
    expiryDate: m.expiryDate,
    manufacturer: m.manufacturer,
    storageCondition: m.storageCondition,
    photo: m.photo,
    location: m.location,
    status: m.status,
    verified: m.verified,
    donor: donor ? publicUser(donor) : undefined,
    donorId: m.donorId,
    createdAt: m.createdAt,
  };
}

// Share a medicine (donor lists it). Automatically blocks expired medicine.
const VALID_UNITS = ['Strip', 'Tablet', 'Capsule', 'Bottle', 'Vial', 'Tube', 'Sachet', 'Box', 'Pack', 'ml', 'Other'];

router.post('/', requireAuth, upload.single('photo'), (req, res) => {
  const { quantity, expiryDate, lat, lng } = req.body;
  const name = clean(req.body.name, 120), type = clean(req.body.type, 30), strength = clean(req.body.strength, 40), unit = clean(req.body.unit, 20);
  const batchNumber = clean(req.body.batchNumber, 60), manufacturer = clean(req.body.manufacturer, 100), storageCondition = clean(req.body.storageCondition, 150), location = clean(req.body.location, 150);

  if (!name || !type || !strength || !quantity || !unit || !expiryDate || !batchNumber || !manufacturer || !location) {
    return res.status(400).json({ error: 'Please complete all medicine details, including quantity and its unit.' });
  }
  if (!VALID_UNITS.includes(unit)) {
    return res.status(400).json({ error: 'Please choose a valid quantity unit.' });
  }
  if (Number(quantity) < 1) {
    return res.status(400).json({ error: 'Quantity must be at least 1.' });
  }

  const runway = daysUntil(expiryDate);
  if (runway < 0) {
    return res.status(400).json({ error: 'This medicine has already expired and cannot be listed.' });
  }
  if (runway < 30) {
    return res.status(400).json({ error: 'Medicine must have at least 30 days of shelf life remaining to be shared safely.' });
  }

  const data = db.read();
  const id = db.nextId(data, 'medicines');
  const medicine = {
    id,
    donorId: req.userId,
    name: name.trim(),
    type,
    strength,
    quantity: Number(quantity),
    unit,
    expiryDate,
    batchNumber,
    manufacturer,
    photo: req.file ? `/uploads/${req.file.filename}` : null,
    storageCondition: storageCondition || '',
    location,
    lat: lat ? Number(lat) : null,
    lng: lng ? Number(lng) : null,
    status: 'pending', // pending -> approved / rejected by admin
    verified: false,
    createdAt: new Date().toISOString(),
  };
  data.medicines.push(medicine);
  db.write(data);
  res.status(201).json({ medicine: medicineView(medicine) });
});

// Search / browse with smart matching score
router.get('/', requireAuth, (req, res) => {
  const { q, type, verifiedOnly, maxDistance, lat, lng } = req.query;
  const data = db.read();
  const userLat = lat ? Number(lat) : undefined;
  const userLng = lng ? Number(lng) : undefined;

  let results = data.medicines.filter((m) => m.status === 'approved' && m.donorId !== req.userId && m.quantity > 0);

  if (type) results = results.filter((m) => m.type === type);
  if (verifiedOnly === 'true') results = results.filter((m) => m.verified);

  let scored = results.map((m) => {
    const { score, distanceKm } = matchScore({ query: q, medicine: m, userLat, userLng });
    const donor = data.users.find((u) => u.id === m.donorId);
    return { ...medicineView(m, donor), matchScore: score, distanceKm };
  });

  if (q) scored = scored.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));
  if (maxDistance) scored = scored.filter((m) => m.distanceKm === null || m.distanceKm === undefined || m.distanceKm <= Number(maxDistance));

  scored.sort((a, b) => b.matchScore - a.matchScore);
  res.json({ medicines: scored });
});

router.get('/mine', requireAuth, (req, res) => {
  const data = db.read();
  const mine = data.medicines.filter((m) => m.donorId === req.userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ medicines: mine.map((m) => medicineView(m)) });
});

router.get('/:id', requireAuth, (req, res) => {
  const data = db.read();
  const m = data.medicines.find((x) => x.id === Number(req.params.id));
  if (!m) return res.status(404).json({ error: 'Medicine not found.' });
  const donor = data.users.find((u) => u.id === m.donorId);
  res.json({ medicine: medicineView(m, donor) });
});

module.exports = router;
