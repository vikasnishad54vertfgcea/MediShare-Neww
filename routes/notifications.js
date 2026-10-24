const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const data = db.read();
  const mine = data.notifications
    .filter((n) => n.userId === req.userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ notifications: mine });
});

router.patch('/:id/read', requireAuth, (req, res) => {
  const data = db.read();
  const n = data.notifications.find((x) => x.id === Number(req.params.id) && x.userId === req.userId);
  if (!n) return res.status(404).json({ error: 'Notification not found.' });
  n.read = true;
  db.write(data);
  res.json({ ok: true });
});

router.patch('/read-all', requireAuth, (req, res) => {
  const data = db.read();
  data.notifications.filter((n) => n.userId === req.userId).forEach((n) => (n.read = true));
  db.write(data);
  res.json({ ok: true });
});

module.exports = router;
