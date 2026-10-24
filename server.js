const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const medicineRoutes = require('./routes/medicines');
const requestRoutes = require('./routes/requests');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure data + uploads directories exist before anything reads/writes them
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'public', 'uploads'), { recursive: true });

const db = require('./db');
app.get('/api/public/stats', (req, res) => {
  const data = db.read();
  res.json({
    medicinesShared: data.medicines.filter((m) => m.status === 'approved').length,
    successfulRequests: data.requests.filter((r) => r.status === 'completed').length,
    peopleHelped: new Set(data.requests.filter((r) => r.status === 'completed').map((r) => r.recipientId)).size,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);

app.use(express.static(path.join(__dirname, 'public')));

// Fallback: any unknown non-API route serves the SPA-ish index (for direct links)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  const filePath = path.join(__dirname, 'public', req.path.endsWith('.html') ? req.path : req.path + '.html');
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Central error handler (e.g. multer file errors)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
});

app.listen(PORT, () => {
  console.log(`\n💊 MediShare running at http://localhost:${PORT}\n`);
});
