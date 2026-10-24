const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'medishare-dev-secret-change-me';

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '7d' });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required.' });
  try {
    const payload = jwt.verify(token, SECRET);
    req.userId = payload.id;
    req.userRole = payload.role;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admins only.' });
  next();
}

module.exports = { sign, requireAuth, requireAdmin, SECRET };
