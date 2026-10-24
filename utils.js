function haversineKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v === undefined || v === null)) return null;
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Public-safe view of a user (never leak password hash or raw contact info
// unless the owner has opted to show it).
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    location: u.location,
    rating: u.rating,
    ratingCount: u.ratingCount,
    medicinesShared: u.medicinesShared,
    successfulRequests: u.successfulRequests,
    verified: u.verified,
    mobile: u.privacy && u.privacy.showMobile ? u.mobile : undefined,
    email: u.privacy && u.privacy.showEmail ? u.email : undefined,
  };
}

function meUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

// Smart matching score (0-100) combining name relevance, distance,
// expiry runway, and verification trust.
function matchScore({ query, medicine, userLat, userLng }) {
  let score = 0;
  const name = medicine.name.toLowerCase();
  const q = (query || '').toLowerCase().trim();

  if (q) {
    if (name === q) score += 45;
    else if (name.startsWith(q)) score += 38;
    else if (name.includes(q)) score += 30;
    else score += 0;
  } else {
    score += 30; // browsing without a specific search term
  }

  const dist = haversineKm(userLat, userLng, medicine.lat, medicine.lng);
  if (dist !== null) {
    if (dist <= 2) score += 25;
    else if (dist <= 5) score += 18;
    else if (dist <= 10) score += 10;
    else score += 4;
  } else {
    score += 8;
  }

  const runway = daysUntil(medicine.expiryDate);
  if (runway > 90) score += 15;
  else if (runway > 30) score += 10;
  else if (runway > 7) score += 5;

  if (medicine.verified) score += 15;

  return { score: Math.max(0, Math.min(100, Math.round(score))), distanceKm: dist };
}

// Strip characters that could break out of HTML when free text is later shown on a page.
function clean(value, max = 200) {
  return String(value === undefined || value === null ? '' : value).replace(/[<>"`\u0000-\u001f]/g, '').trim().slice(0, max);
}

module.exports = { haversineKm, publicUser, meUser, daysUntil, matchScore, clean };
