const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { publicUser, clean } = require('../utils');
const { pushNotification } = require('../notify');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `rx_${Date.now()}_${Math.round(Math.random() * 1e6)}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const STATUS_FLOW = ['sent', 'accepted', 'handover_pending', 'completed'];
// Once a donor has accepted a request, coordinating a safe handover needs a
// direct line of contact — so from this point on we reveal each side's
// mobile number to the other party, regardless of their profile privacy
// toggle (which still fully applies everywhere else on the platform).
const CONTACT_VISIBLE_STATUSES = ['accepted', 'handover_pending', 'completed'];
// A recipient can back out any time before the handover is actually
// happening; once it's in progress, cancelling would leave the donor
// mid-handover, so we close that window.
const CANCELLABLE_STATUSES = ['sent', 'accepted'];

function requestView(r, data, viewerId) {
  const medicine = data.medicines.find((m) => m.id === r.medicineId);
  const recipient = data.users.find((u) => u.id === r.recipientId);
  const donor = data.users.find((u) => u.id === r.donorId);
  const contactVisible = CONTACT_VISIBLE_STATUSES.includes(r.status);
  const reviewed = !!data.reviews.find((rv) => rv.requestId === r.id);
  const unreadMessages = viewerId
    ? data.messages.filter((m) => m.requestId === r.id && m.senderId !== viewerId && !m.readBy?.includes(viewerId)).length
    : 0;
  return {
    id: r.id,
    medicine: medicine ? { id: medicine.id, name: medicine.name, strength: medicine.strength, unit: medicine.unit, photo: medicine.photo } : null,
    recipient: { ...publicUser(recipient), mobile: contactVisible ? recipient?.mobile : publicUser(recipient).mobile },
    donor: { ...publicUser(donor), mobile: contactVisible ? donor?.mobile : publicUser(donor).mobile },
    quantity: r.quantity,
    reason: r.reason,
    prescription: r.prescription,
    urgency: r.urgency,
    status: r.status,
    canCancel: CANCELLABLE_STATUSES.includes(r.status),
    contactVisible,
    reviewed,
    unreadMessages,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// Recipient creates a request for a medicine
router.post('/', requireAuth, upload.single('prescription'), (req, res) => {
  const { medicineId, quantity, reason, urgency } = req.body;
  const data = db.read();
  const medicine = data.medicines.find((m) => m.id === Number(medicineId));
  if (!medicine || medicine.status !== 'approved') {
    return res.status(404).json({ error: 'This medicine is no longer available.' });
  }
  if (medicine.donorId === req.userId) {
    return res.status(400).json({ error: "You can't request your own listed medicine." });
  }
  const reqQty = Number(quantity) || 1;
  if (reqQty < 1 || reqQty > medicine.quantity) {
    return res.status(400).json({ error: `Only ${medicine.quantity} ${medicine.unit}${medicine.quantity > 1 ? 's' : ''} available — please request ${medicine.quantity} or fewer.` });
  }

  const id = db.nextId(data, 'requests');
  const request = {
    id,
    medicineId: medicine.id,
    recipientId: req.userId,
    donorId: medicine.donorId,
    quantity: reqQty,
    reason: clean(reason, 500),
    prescription: req.file ? `/uploads/${req.file.filename}` : null,
    urgency: urgency || 'normal', // normal | soon | urgent
    status: 'sent',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  data.requests.push(request);

  pushNotification(data, {
    userId: medicine.donorId,
    type: 'new_request',
    message: `New request for ${medicine.name} ${medicine.strength}`,
    relatedId: id,
  });

  db.write(data);
  res.status(201).json({ request: requestView(request, data, req.userId) });
});

router.get('/mine', requireAuth, (req, res) => {
  const data = db.read();
  const mine = data.requests.filter((r) => r.recipientId === req.userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ requests: mine.map((r) => requestView(r, data, req.userId)) });
});

router.get('/incoming', requireAuth, (req, res) => {
  const data = db.read();
  const incoming = data.requests.filter((r) => r.donorId === req.userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ requests: incoming.map((r) => requestView(r, data, req.userId)) });
});

function updateStatus(req, res, allowedFrom, newStatus, notifyUserIdField, message, donorOnly = true) {
  const data = db.read();
  const request = data.requests.find((r) => r.id === Number(req.params.id));
  if (!request) return res.status(404).json({ error: 'Request not found.' });
  if (request.donorId !== req.userId && request.recipientId !== req.userId) {
    return res.status(403).json({ error: 'Not your request.' });
  }
  // Accepting and handing over are the donor's decisions; a recipient must never be able to approve their own request.
  if (donorOnly && request.donorId !== req.userId) {
    return res.status(403).json({ error: 'Only the donor can do this.' });
  }
  if (!allowedFrom.includes(request.status)) {
    return res.status(400).json({ error: `Cannot move from "${request.status}" to "${newStatus}".` });
  }
  request.status = newStatus;
  request.updatedAt = new Date().toISOString();

  if (newStatus === 'completed') {
    const medicine = data.medicines.find((m) => m.id === request.medicineId);
    const donor = data.users.find((u) => u.id === request.donorId);
    const recipient = data.users.find((u) => u.id === request.recipientId);
    if (donor) donor.medicinesShared = (donor.medicinesShared || 0) + 1;
    if (recipient) recipient.successfulRequests = (recipient.successfulRequests || 0) + 1;
    // Deduct the handed-over quantity from the donor's remaining stock so
    // the listing naturally disappears from search once it's used up.
    if (medicine) {
      medicine.quantity = Math.max(0, medicine.quantity - request.quantity);
    }
  }

  pushNotification(data, { userId: request[notifyUserIdField], type: 'status_update', message, relatedId: request.id });
  db.write(data);
  res.json({ request: requestView(request, data, req.userId) });
}

router.patch('/:id/accept', requireAuth, (req, res) => {
  updateStatus(req, res, ['sent'], 'accepted', 'recipientId', 'Your request was accepted by the donor.');
});

router.patch('/:id/decline', requireAuth, (req, res) => {
  const data = db.read();
  const request = data.requests.find((r) => r.id === Number(req.params.id));
  if (!request) return res.status(404).json({ error: 'Request not found.' });
  if (request.donorId !== req.userId) return res.status(403).json({ error: 'Not your request.' });
  if (request.status !== 'sent') return res.status(400).json({ error: 'Only new requests can be declined.' });
  request.status = 'declined';
  request.updatedAt = new Date().toISOString();
  pushNotification(data, { userId: request.recipientId, type: 'status_update', message: 'Your request was declined by the donor.', relatedId: request.id });
  db.write(data);
  res.json({ request: requestView(request, data, req.userId) });
});

// Recipient withdraws a request they no longer need.
router.patch('/:id/cancel', requireAuth, (req, res) => {
  const data = db.read();
  const request = data.requests.find((r) => r.id === Number(req.params.id));
  if (!request) return res.status(404).json({ error: 'Request not found.' });
  if (request.recipientId !== req.userId) return res.status(403).json({ error: 'Only the person who made this request can cancel it.' });
  if (!CANCELLABLE_STATUSES.includes(request.status)) {
    return res.status(400).json({ error: 'This request is already being handed over and can no longer be cancelled — please message the donor instead.' });
  }
  request.status = 'cancelled';
  request.updatedAt = new Date().toISOString();
  pushNotification(data, { userId: request.donorId, type: 'status_update', message: 'A recipient cancelled their request.', relatedId: request.id });
  db.write(data);
  res.json({ request: requestView(request, data, req.userId) });
});

router.patch('/:id/handover', requireAuth, (req, res) => {
  updateStatus(req, res, ['accepted'], 'handover_pending', 'recipientId', 'Handover is being arranged for your request.');
});

router.patch('/:id/complete', requireAuth, (req, res) => {
  updateStatus(req, res, ['handover_pending', 'accepted'], 'completed', 'donorId', 'Your shared medicine reached the recipient successfully!');
});

// Recipient rates the donor after completion
router.post('/:id/review', requireAuth, (req, res) => {
  const { rating, comment } = req.body;
  const data = db.read();
  const request = data.requests.find((r) => r.id === Number(req.params.id));
  if (!request) return res.status(404).json({ error: 'Request not found.' });
  if (request.recipientId !== req.userId) return res.status(403).json({ error: 'Only the recipient can review this request.' });
  if (request.status !== 'completed') return res.status(400).json({ error: 'You can only review completed requests.' });
  if (data.reviews.find((rv) => rv.requestId === request.id)) return res.status(400).json({ error: 'You already reviewed this request.' });

  const id = db.nextId(data, 'reviews');
  data.reviews.push({ id, requestId: request.id, fromUserId: req.userId, toUserId: request.donorId, rating: Number(rating), comment: comment || '', createdAt: new Date().toISOString() });

  const donor = data.users.find((u) => u.id === request.donorId);
  if (donor) {
    const total = donor.rating * donor.ratingCount + Number(rating);
    donor.ratingCount += 1;
    donor.rating = Math.round((total / donor.ratingCount) * 10) / 10;
  }
  db.write(data);
  res.status(201).json({ ok: true });
});

// ---------- In-app conversation between donor & recipient on a request ----------

function assertParticipant(req, request) {
  return request && (request.donorId === req.userId || request.recipientId === req.userId);
}

router.get('/:id/messages', requireAuth, (req, res) => {
  const data = db.read();
  const request = data.requests.find((r) => r.id === Number(req.params.id));
  if (!assertParticipant(req, request)) return res.status(404).json({ error: 'Request not found.' });

  // Mark the other side's messages as read by this viewer.
  let changed = false;
  data.messages.forEach((m) => {
    if (m.requestId === request.id && m.senderId !== req.userId) {
      m.readBy = m.readBy || [];
      if (!m.readBy.includes(req.userId)) { m.readBy.push(req.userId); changed = true; }
    }
  });
  if (changed) db.write(data);

  const thread = data.messages
    .filter((m) => m.requestId === request.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((m) => ({ id: m.id, senderId: m.senderId, text: m.text, createdAt: m.createdAt, mine: m.senderId === req.userId }));
  res.json({ messages: thread, request: requestView(request, data, req.userId) });
});

router.post('/:id/messages', requireAuth, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Message cannot be empty.' });
  const data = db.read();
  const request = data.requests.find((r) => r.id === Number(req.params.id));
  if (!assertParticipant(req, request)) return res.status(404).json({ error: 'Request not found.' });
  if (['declined', 'cancelled'].includes(request.status)) {
    return res.status(400).json({ error: 'This request is closed, so messaging is no longer available.' });
  }

  const id = db.nextId(data, 'messages');
  const otherPartyId = request.donorId === req.userId ? request.recipientId : request.donorId;
  data.messages.push({ id, requestId: request.id, senderId: req.userId, text: text.trim().slice(0, 1000), readBy: [req.userId], createdAt: new Date().toISOString() });

  const medicine = data.medicines.find((m) => m.id === request.medicineId);
  pushNotification(data, { userId: otherPartyId, type: 'message', message: `New message about ${medicine ? medicine.name : 'your request'}`, relatedId: request.id });

  db.write(data);
  res.status(201).json({ ok: true });
});

module.exports = router;
