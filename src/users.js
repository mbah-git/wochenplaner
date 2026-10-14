// Gemeinsame Logik fuer das Anlegen von Benutzern (Registrierung, Admin, Seed)
const bcrypt = require('bcryptjs');
const pool = require('./db');
const { createHousehold, defaultName } = require('./households');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePassword(password, confirm) {
  if (password.length < 8) return 'Das Passwort muss mindestens 8 Zeichen lang sein.';
  if (password !== confirm) return 'Die Passwörter stimmen nicht überein.';
  return null;
}

// Prueft Formulardaten fuer einen neuen Benutzer; liefert { values, password, error }
async function validateNewUser(body) {
  const values = {
    name: String(body.name || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
  };
  const password = String(body.password || '');

  let error = null;
  if (!values.name || values.name.length > 100) error = 'Bitte gib einen Namen an (max. 100 Zeichen).';
  else if (!EMAIL_RE.test(values.email) || values.email.length > 190) error = 'Bitte gib eine gültige E-Mail-Adresse an.';
  else error = validatePassword(password, String(body.password_confirm || ''));

  if (!error) {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [values.email]);
    if (existing.length) error = 'Diese E-Mail-Adresse ist bereits registriert.';
  }
  return { values, password, error };
}

// Ohne householdId bekommt der Benutzer einen eigenen, neuen Haushalt
async function createUser({ name, email, password, role = 'user', householdId = null }, db = pool) {
  const hash = await bcrypt.hash(password, 12);
  const household = householdId || (await createHousehold(db, defaultName(name)));
  const [result] = await db.query(
    'INSERT INTO users (household_id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [household, email, name, hash, role]
  );
  return result.insertId;
}

async function setPassword(userId, password) {
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(password, 12), userId]);
}

module.exports = { validatePassword, validateNewUser, createUser, setPassword };
