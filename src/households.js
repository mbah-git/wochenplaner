// Haushalte: mehrere Benutzer teilen Rezepte, Wochenplan und Einkaufsliste.
const crypto = require('crypto');

// Ohne leicht verwechselbare Zeichen (0/O, 1/I/L)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function newInviteCode() {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

// db: Pool oder Verbindung. Liefert die ID des neuen Haushalts.
async function createHousehold(db, name) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [res] = await db.query('INSERT INTO households (name, invite_code) VALUES (?, ?)',
        [String(name).slice(0, 100), newInviteCode()]);
      return res.insertId;
    } catch (err) {
      if (err.code !== 'ER_DUP_ENTRY' || attempt === 4) throw err;
    }
  }
  return null;
}

function defaultName(userName) {
  return `Haushalt ${String(userName).split(' ')[0]}`.slice(0, 100);
}

async function findByCode(db, code) {
  const normalized = normalizeCode(code);
  if (normalized.length !== 8) return null;
  const [rows] = await db.query('SELECT id, name FROM households WHERE invite_code = ?', [normalized]);
  return rows[0] || null;
}

async function memberCount(db, householdId) {
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM users WHERE household_id = ?', [householdId]);
  return Number(n);
}

// Leere Haushalte samt Rezepten, Plan und Einkaufsliste loeschen
async function deleteIfEmpty(db, householdId) {
  if (await memberCount(db, householdId)) return false;
  await db.query('DELETE FROM households WHERE id = ?', [householdId]);
  return true;
}

// Benutzer wechselt in einen anderen Haushalt. War er das letzte Mitglied des alten,
// nimmt er seine Rezepte mit; Plan und Einkaufsliste des alten Haushalts verfallen.
async function moveUser(db, userId, fromId, toId) {
  if (fromId === toId) return { movedRecipes: 0 };
  const last = (await memberCount(db, fromId)) === 1;
  let movedRecipes = 0;
  if (last) {
    const [res] = await db.query('UPDATE recipes SET household_id = ? WHERE household_id = ?', [toId, fromId]);
    movedRecipes = res.affectedRows;
  }
  await db.query('UPDATE users SET household_id = ? WHERE id = ?', [toId, userId]);
  await deleteIfEmpty(db, fromId);
  return { movedRecipes };
}

module.exports = { newInviteCode, normalizeCode, createHousehold, defaultName, findByCode, memberCount, deleteIfEmpty, moveUser };
