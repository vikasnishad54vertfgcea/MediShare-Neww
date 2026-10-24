const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { publicUser, clean } = require('../utils');
const { pushNotification } = require('../notify');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/stats', (req, res) => {
  const data = db.read();
  res.json({
    users: data.users.length,
    medicines: data.medicines.length,
    pendingVerification: data.medicines.filter((m) => m.status === 'pending').length,
    activeRequests: data.requests.filter((r) => ['sent', 'accepted', 'handover_pending'].includes(r.status)).length,
    completedShares: data.requests.filter((r) => r.status === 'completed').length,
    urgentRequests: data.requests.filter((r) => r.urgency === 'urgent' && r.status !== 'completed' && r.status !== 'declined').length,
  });
});

router.get('/medicines', (req, res) => {
  const { status } = req.query;
  const data = db.read();
  let list = data.medicines;
  if (status) list = list.filter((m) => m.status === status);
  list = list
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((m) => ({ ...m, donor: publicUser(data.users.find((u) => u.id === m.donorId)) }));
  res.json({ medicines: list });
});

router.patch('/medicines/:id/verify', (req, res) => {
  const data = db.read();
  const m = data.medicines.find((x) => x.id === Number(req.params.id));
  if (!m) return res.status(404).json({ error: 'Medicine not found.' });
  m.status = 'approved';
  m.verified = true;
  pushNotification(data, { userId: m.donorId, type: 'verification', message: `${m.name} ${m.strength} was verified and is now visible to recipients.`, relatedId: m.id });
  db.write(data);
  res.json({ medicine: m });
});

router.patch('/medicines/:id/reject', (req, res) => {
  const { reason } = req.body;
  const data = db.read();
  const m = data.medicines.find((x) => x.id === Number(req.params.id));
  if (!m) return res.status(404).json({ error: 'Medicine not found.' });
  m.status = 'rejected';
  m.verified = false;
  pushNotification(data, { userId: m.donorId, type: 'verification', message: `${m.name} ${m.strength} was rejected.${reason ? ' Reason: ' + clean(reason, 200) : ''}`, relatedId: m.id });
  db.write(data);
  res.json({ medicine: m });
});

router.get('/users', (req, res) => {
  const data = db.read();
  const list = data.users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    userType: u.userType,
    role: u.role,
    rating: u.rating,
    medicinesShared: u.medicinesShared,
    successfulRequests: u.successfulRequests,
    verified: u.verified,
    createdAt: u.createdAt,
  }));
  res.json({ users: list });
});

router.get('/requests', (req, res) => {
  const data = db.read();
  const list = data.requests
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((r) => {
      const medicine = data.medicines.find((m) => m.id === r.medicineId);
      return {
        id: r.id,
        medicineName: medicine ? `${medicine.name} ${medicine.strength}` : 'Unknown',
        donor: publicUser(data.users.find((u) => u.id === r.donorId)),
        recipient: publicUser(data.users.find((u) => u.id === r.recipientId)),
        status: r.status,
        urgency: r.urgency,
        createdAt: r.createdAt,
      };
    });
  res.json({ requests: list });
});

router.get('/analytics', (req, res) => {
  const data = db.read();

  // Monthly sharing volume for the last 6 months
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: d.toLocaleString('en-US', { month: 'short' }), year: d.getFullYear(), month: d.getMonth() });
  }
  const monthly = months.map((m) => ({
    label: m.label,
    count: data.medicines.filter((med) => {
      const c = new Date(med.createdAt);
      return c.getFullYear() === m.year && c.getMonth() === m.month;
    }).length,
  }));

  // Most requested medicine names
  const nameCounts = {};
  data.requests.forEach((r) => {
    const med = data.medicines.find((m) => m.id === r.medicineId);
    if (!med) return;
    nameCounts[med.name] = (nameCounts[med.name] || 0) + 1;
  });
  const mostRequested = Object.entries(nameCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }));

  // Successful vs rejected/declined
  const successful = data.requests.filter((r) => r.status === 'completed').length;
  const rejected = data.requests.filter((r) => r.status === 'declined').length;
  const pending = data.requests.filter((r) => ['sent', 'accepted', 'handover_pending'].includes(r.status)).length;

  // Area-wise demand (by recipient location text)
  const areaCounts = {};
  data.requests.forEach((r) => {
    const recipient = data.users.find((u) => u.id === r.recipientId);
    const area = recipient ? recipient.location : 'Unknown';
    areaCounts[area] = (areaCounts[area] || 0) + 1;
  });
  const areaDemand = Object.entries(areaCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([area, count]) => ({ area, count }));

  res.json({ monthly, mostRequested, successful, rejected, pending, areaDemand });
});

module.exports = router;
