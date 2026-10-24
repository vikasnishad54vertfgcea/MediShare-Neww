const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { meUser, clean } = require('../utils');

const router = express.Router();

// ---------- Saved / bookmarked medicines ----------

router.get('/saved', requireAuth, (req, res) => {
  const data = db.read();
  const user = data.users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const ids = user.savedMedicineIds || [];
  const medicines = data.medicines
    .filter((m) => ids.includes(m.id))
    .map((m) => {
      const donor = data.users.find((u) => u.id === m.donorId);
      return { id: m.id, name: m.name, strength: m.strength, quantity: m.quantity, unit: m.unit, photo: m.photo, location: m.location, status: m.status, verified: m.verified, donor: donor ? { name: donor.name, rating: donor.rating } : undefined };
    });
  res.json({ medicines });
});

router.post('/saved/:medicineId', requireAuth, (req, res) => {
  const data = db.read();
  const user = data.users.find((u) => u.id === req.userId);
  const medicineId = Number(req.params.medicineId);
  if (!data.medicines.find((m) => m.id === medicineId)) return res.status(404).json({ error: 'Medicine not found.' });
  user.savedMedicineIds = user.savedMedicineIds || [];
  if (!user.savedMedicineIds.includes(medicineId)) user.savedMedicineIds.push(medicineId);
  db.write(data);
  res.json({ saved: true });
});

router.delete('/saved/:medicineId', requireAuth, (req, res) => {
  const data = db.read();
  const user = data.users.find((u) => u.id === req.userId);
  const medicineId = Number(req.params.medicineId);
  user.savedMedicineIds = (user.savedMedicineIds || []).filter((id) => id !== medicineId);
  db.write(data);
  res.json({ saved: false });
});

router.patch('/profile', requireAuth, (req, res) => {
  const { name, location, lat, lng, privacy } = req.body;
  const data = db.read();
  const user = data.users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (clean(name, 100)) user.name = clean(name, 100);
  if (clean(location, 150)) user.location = clean(location, 150);
  if (lat !== undefined) user.lat = lat;
  if (lng !== undefined) user.lng = lng;
  if (privacy) user.privacy = { ...user.privacy, ...privacy };
  db.write(data);
  res.json({ user: meUser(user) });
});

module.exports = router;
