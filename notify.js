const db = require('./db');

// Adds a notification directly onto an already-loaded db object.
// Caller is responsible for calling db.write(data) afterwards.
function pushNotification(data, { userId, type, message, relatedId }) {
  const id = db.nextId(data, 'notifications');
  data.notifications.push({
    id,
    userId,
    type,
    message,
    relatedId: relatedId || null,
    read: false,
    createdAt: new Date().toISOString(),
  });
}

module.exports = { pushNotification };
