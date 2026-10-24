// seed.js — populates data/db.json with a believable starting dataset so the
// app doesn't look empty on first run. Safe to re-run: it wipes and rebuilds.

const bcrypt = require('bcryptjs');
const db = require('./db');

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function run() {
  const data = { users: [], medicines: [], requests: [], notifications: [], reviews: [], messages: [], _seq: { users: 0, medicines: 0, requests: 0, notifications: 0, reviews: 0, messages: 0 } };

  const hash = (pw) => bcrypt.hashSync(pw, 10);

  function addUser(u) {
    const id = db.nextId(data, 'users');
    data.users.push({
      id,
      name: u.name,
      email: u.email,
      mobile: u.mobile,
      passwordHash: hash(u.password),
      location: u.location,
      lat: u.lat,
      lng: u.lng,
      userType: u.userType,
      role: u.role || 'user',
      rating: u.rating || 0,
      ratingCount: u.ratingCount || 0,
      medicinesShared: 0,
      successfulRequests: 0,
      verified: u.verified !== undefined ? u.verified : true,
      privacy: { showMobile: false, showEmail: false },
      savedMedicineIds: [],
      createdAt: new Date().toISOString(),
    });
    return id;
  }

  const vikas = addUser({ name: 'Vikas Sharma', email: 'vikas@example.com', mobile: '9876543210', password: 'password123', location: 'Vashi, Navi Mumbai', lat: 19.0771, lng: 73.0169, userType: 'both', rating: 4.8, ratingCount: 12 });
  const anita = addUser({ name: 'Anita Deshmukh', email: 'anita@example.com', mobile: '9876500000', password: 'password123', location: 'Sanpada, Navi Mumbai', lat: 19.0674, lng: 73.0117, userType: 'recipient', rating: 4.5, ratingCount: 4 });
  const rahul = addUser({ name: 'Rahul Iyer', email: 'rahul@example.com', mobile: '9876511111', password: 'password123', location: 'Nerul, Navi Mumbai', lat: 19.0330, lng: 73.0197, userType: 'donor', rating: 4.9, ratingCount: 20 });
  addUser({ name: 'Admin', email: 'admin@medishare.app', mobile: '9999999999', password: 'admin123', location: 'HQ', lat: 19.076, lng: 72.877, userType: 'both', role: 'admin', verified: true });

  function addMedicine(m) {
    const id = db.nextId(data, 'medicines');
    data.medicines.push({
      id,
      donorId: m.donorId,
      name: m.name,
      type: m.type,
      strength: m.strength,
      quantity: m.quantity,
      unit: m.unit || 'unit',
      expiryDate: m.expiryDate,
      batchNumber: m.batchNumber,
      manufacturer: m.manufacturer,
      photo: m.photo || null,
      storageCondition: m.storageCondition,
      location: m.location,
      lat: m.lat,
      lng: m.lng,
      status: m.status || 'approved',
      verified: m.status === 'approved',
      createdAt: new Date().toISOString(),
    });
    return id;
  }

  addMedicine({ donorId: rahul, name: 'Paracetamol', type: 'Tablet', strength: '500mg', quantity: 2, unit: 'Strip', expiryDate: daysFromNow(180), batchNumber: 'PCM2025A', manufacturer: 'Cipla', storageCondition: 'Room temperature, dry place', location: 'Nerul, Navi Mumbai', lat: 19.0330, lng: 73.0197, status: 'approved' });
  addMedicine({ donorId: rahul, name: 'Azithromycin', type: 'Tablet', strength: '250mg', quantity: 6, unit: 'Tablet', expiryDate: daysFromNow(90), batchNumber: 'AZM2025B', manufacturer: 'Sun Pharma', storageCondition: 'Cool, dry place', location: 'Nerul, Navi Mumbai', lat: 19.0330, lng: 73.0197, status: 'approved' });
  addMedicine({ donorId: vikas, name: 'Insulin Glargine', type: 'Injection', strength: '100IU/ml', quantity: 1, unit: 'Vial', expiryDate: daysFromNow(45), batchNumber: 'INS2025C', manufacturer: 'Novo Nordisk', storageCondition: 'Refrigerated 2-8°C', location: 'Vashi, Navi Mumbai', lat: 19.0771, lng: 73.0169, status: 'approved' });
  addMedicine({ donorId: vikas, name: 'Cetirizine', type: 'Tablet', strength: '10mg', quantity: 3, unit: 'Strip', expiryDate: daysFromNow(300), batchNumber: 'CTZ2025D', manufacturer: 'Dr. Reddy\'s', storageCondition: 'Room temperature', location: 'Vashi, Navi Mumbai', lat: 19.0771, lng: 73.0169, status: 'pending' });
  addMedicine({ donorId: vikas, name: 'Amoxicillin', type: 'Capsule', strength: '500mg', quantity: 2, unit: 'Strip', expiryDate: daysFromNow(-10), batchNumber: 'AMX2024X', manufacturer: 'GSK', storageCondition: 'Room temperature', location: 'Vashi, Navi Mumbai', lat: 19.0771, lng: 73.0169, status: 'rejected' });
  addMedicine({ donorId: rahul, name: 'Cough Syrup', type: 'Syrup', strength: '100ml', quantity: 1, unit: 'Bottle', expiryDate: daysFromNow(120), batchNumber: 'CGH2025E', manufacturer: 'Himalaya', storageCondition: 'Room temperature', location: 'Nerul, Navi Mumbai', lat: 19.0330, lng: 73.0197, status: 'approved' });

  db.write(data);
  console.log('Seeded data/db.json with demo users, medicines.');
  console.log('Demo logins:');
  console.log('  Donor/Recipient (both): vikas@example.com / password123');
  console.log('  Recipient:              anita@example.com / password123');
  console.log('  Donor:                  rahul@example.com / password123');
  console.log('  Admin:                  admin@medishare.app / admin123');
}

run();
