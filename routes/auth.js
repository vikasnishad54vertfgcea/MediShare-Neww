const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign, requireAuth } = require('../middleware/auth');
const { meUser, clean } = require('../utils');

const router = express.Router();

router.post('/signup', (req, res) => {
  let { name, email, mobile, password, location, userType, lat, lng } = req.body;
  name = clean(name, 100); email = clean(email, 150); mobile = clean(mobile, 20); location = clean(location, 150);
  if (!name || !email || !mobile || !password || !location || !userType) {
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  }
  if (!['donor', 'recipient', 'both'].includes(userType)) {
    return res.status(400).json({ error: 'Please choose donor, recipient or both.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const data = db.read();
  const exists = data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'An account with this email already exists.' });

  const id = db.nextId(data, 'users');
  const user = {
    id,
    name,
    email,
    mobile,
    passwordHash: bcrypt.hashSync(password, 10),
    location,
    lat: lat || null,
    lng: lng || null,
    userType, // donor | recipient | both
    role: 'user',
    rating: 0,
    ratingCount: 0,
    medicinesShared: 0,
    successfulRequests: 0,
    verified: false,
    privacy: { showMobile: false, showEmail: false },
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  db.write(data);

  const token = sign(user);
  res.status(201).json({ token, user: meUser(user) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const data = db.read();
  const user = data.users.find((u) => u.email.toLowerCase() === (email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  const token = sign(user);
  res.json({ token, user: meUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  const data = db.read();
  const user = data.users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: meUser(user) });
});

module.exports = router;
