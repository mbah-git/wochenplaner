// Legt den Admin-User (aus ADMIN_EMAIL / ADMIN_PASSWORD) mit Haushalt, 10 Testrezepten und
// einem gefuellten Wochenplan fuer die laufende Woche an.
// Idempotent: Rezepte nur, wenn der Haushalt noch keine hat; Plan nur, wenn die Woche leer ist.
// Ein erneuter Lauf setzt das Admin-Passwort neu. Aufruf: npm run seed
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const config = require('../src/config');
const { createHousehold, defaultName } = require('../src/households');
const { addRecipes, addWeekPlan } = require('../src/demoData');

async function upsertUser(conn, { email, name, password, role, householdId = null }) {
  const hash = await bcrypt.hash(password, 12);
  const [rows] = await conn.query('SELECT id, household_id FROM users WHERE email = ?', [email]);
  if (rows[0]) {
    await conn.query('UPDATE users SET name = ?, password_hash = ?, role = ?, is_active = 1 WHERE id = ?',
      [name, hash, role, rows[0].id]);
    return { id: rows[0].id, householdId: rows[0].household_id, created: false };
  }
  const household = householdId || (await createHousehold(conn, defaultName(name)));
  const [res] = await conn.query(
    'INSERT INTO users (household_id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [household, email, name, hash, role]);
  return { id: res.insertId, householdId: household, created: true };
}

async function main() {
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminEmail || adminPassword.length < 8) {
    throw new Error('ADMIN_EMAIL und ADMIN_PASSWORD (mind. 8 Zeichen) müssen gesetzt sein.');
  }

  const conn = await mysql.createConnection({ ...config.db, dateStrings: true, charset: 'utf8mb4' });
  try {
    const admin = await upsertUser(conn, {
      email: adminEmail,
      name: process.env.ADMIN_NAME || 'Administrator',
      password: adminPassword,
      role: 'admin',
    });
    console.log(`✓ Admin ${adminEmail} ${admin.created ? 'angelegt' : 'aktualisiert (Passwort neu gesetzt)'}`);

    const recipes = await addRecipes(conn, admin.householdId, admin.id);
    console.log(recipes ? `✓ ${recipes} Testrezepte angelegt` : '• Haushalt hat bereits Rezepte, Testrezepte übersprungen');
    const meals = await addWeekPlan(conn, admin.householdId);
    console.log(meals ? `✓ Wochenplan dieser Woche mit ${meals} Mahlzeiten gefüllt` : '• Diese Woche ist schon geplant, übersprungen');

    // Demo-Benutzer im selben Haushalt, damit das Teilen sichtbar ist. Zufallspasswort, Login nicht vorgesehen.
    if (process.env.SEED_DEMO_USER !== 'false') {
      const [existing] = await conn.query('SELECT id FROM users WHERE email = ?', ['demo@example.com']);
      if (!existing[0]) {
        await upsertUser(conn, {
          email: 'demo@example.com',
          name: 'Max Mustermann',
          password: crypto.randomBytes(24).toString('base64url'),
          role: 'user',
          householdId: admin.householdId,
        });
        console.log('✓ Demo-Benutzer demo@example.com im Haushalt des Admins angelegt');
      }
    }
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Seed fehlgeschlagen:', err.message);
    process.exit(1);
  });
}

module.exports = { seed: main };
