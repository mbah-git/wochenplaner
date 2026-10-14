const express = require('express');
const pool = require('../db');
const { sendMail } = require('../mailer');
const { requireAdmin } = require('../middleware/auth');
const { validatePassword, validateNewUser, createUser, setPassword } = require('../users');
const { deleteIfEmpty } = require('../households');

const router = express.Router();
router.use(requireAdmin);

router.get('/users', async (req, res) => {
  const [users] = await pool.query(`
    SELECT u.id, u.email, u.name, u.role, u.is_active, u.created_at, u.last_login_at,
           u.household_id, h.name AS household_name
    FROM users u JOIN households h ON h.id = u.household_id
    ORDER BY u.created_at, u.id`);
  const [households] = await pool.query(`
    SELECT h.id, h.name,
           (SELECT COUNT(*) FROM users u WHERE u.household_id = h.id) AS member_count,
           (SELECT COUNT(*) FROM recipes r WHERE r.household_id = h.id) AS recipe_count
    FROM households h ORDER BY h.name, h.id`);

  res.render('admin/users', { title: 'Benutzerverwaltung', users, households });
});

// ---- Neuen Benutzer erstellen ----
async function renderNewUser(res, values, error, status = 200) {
  const [households] = await pool.query('SELECT id, name FROM households ORDER BY name, id');
  res.status(status).render('admin/user-new', { title: 'Neuen Benutzer erstellen', values, households, error });
}

router.get('/users/new', async (req, res) => {
  await renderNewUser(res, { role: 'user', household: '' }, null);
});

router.post('/users/new', async (req, res) => {
  const { values, password, error } = await validateNewUser(req.body);
  values.role = req.body.role === 'admin' ? 'admin' : 'user';
  values.household = Number(req.body.household) || '';
  let householdId = null;
  if (values.household) {
    const [rows] = await pool.query('SELECT id FROM households WHERE id = ?', [values.household]);
    householdId = rows[0] ? rows[0].id : null;
  }
  if (error) return renderNewUser(res, values, error, 400);

  await pool.transaction((conn) => createUser({ ...values, password, householdId }, conn));
  req.flash('success', `${values.name} wurde erstellt.`);
  res.redirect(`${res.locals.base}/admin/users`);
});

// ---- Passwort eines beliebigen Benutzers aendern ----
async function loadUserList() {
  const [rows] = await pool.query('SELECT id, name, email FROM users ORDER BY name, id');
  return rows;
}

router.get('/password', async (req, res) => {
  res.render('admin/password', {
    title: 'Passwort ändern',
    users: await loadUserList(),
    selectedId: Number(req.query.user) || null,
    error: null,
  });
});

router.post('/password', async (req, res) => {
  const users = await loadUserList();
  const selectedId = Number(req.body.user_id) || null;
  const user = users.find((u) => u.id === selectedId);

  const error = !user
    ? 'Bitte wähle einen Benutzer aus.'
    : validatePassword(String(req.body.password || ''), String(req.body.password_confirm || ''));
  if (error) {
    return res.status(400).render('admin/password', { title: 'Passwort ändern', users, selectedId, error });
  }

  await setPassword(user.id, String(req.body.password));
  req.flash('success', `Das Passwort von ${user.name} wurde geändert.`);
  res.redirect(`${res.locals.base}/admin/users`);
});

// ---- Test-E-Mail an den angemeldeten Admin (prueft die SMTP-Einstellungen) ----
router.post('/test-mail', async (req, res) => {
  try {
    await sendMail({
      to: req.user.email,
      subject: 'WochenPlaner: Test-E-Mail',
      text: `Hallo ${req.user.name}\n\nDer E-Mail-Versand des WochenPlaners funktioniert. Damit klappt auch „Passwort vergessen?“.\n\nDein WochenPlaner`,
    });
    req.flash('success', `Test-E-Mail an ${req.user.email} verschickt. Schau in dein Postfach (auch im Spam-Ordner).`);
  } catch (err) {
    req.flash('error', `Test-E-Mail fehlgeschlagen: ${err.message}`);
  }
  res.redirect(`${res.locals.base}/admin/users`);
});

// ---- Aktionen pro Benutzer ----
// Laedt den Zielbenutzer; das eigene Konto ist geschuetzt, damit sich kein Admin aussperrt.
async function targetUser(req) {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    req.flash('error', 'Du kannst dein eigenes Konto hier nicht ändern.');
    return null;
  }
  const [rows] = await pool.query('SELECT id, email, name, role, is_active, household_id FROM users WHERE id = ?', [id]);
  if (!rows[0]) req.flash('error', 'Benutzer nicht gefunden.');
  return rows[0] || null;
}

router.post('/users/:id/toggle-active', async (req, res) => {
  const user = await targetUser(req);
  if (user) {
    await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [user.is_active ? 0 : 1, user.id]);
    req.flash('success', `${user.name} wurde ${user.is_active ? 'gesperrt' : 'entsperrt'}.`);
  }
  res.redirect(`${res.locals.base}/admin/users`);
});

router.post('/users/:id/toggle-admin', async (req, res) => {
  const user = await targetUser(req);
  if (user) {
    const role = user.role === 'admin' ? 'user' : 'admin';
    await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, user.id]);
    req.flash('success', `${user.name} ist jetzt ${role === 'admin' ? 'Administrator' : 'normaler Benutzer'}.`);
  }
  res.redirect(`${res.locals.base}/admin/users`);
});

// War der Benutzer das letzte Mitglied seines Haushalts, verschwinden auch dessen Rezepte und Plaene
router.post('/users/:id/delete', async (req, res) => {
  const user = await targetUser(req);
  if (user) {
    const householdDeleted = await pool.transaction(async (conn) => {
      await conn.query('DELETE FROM users WHERE id = ?', [user.id]);
      return deleteIfEmpty(conn, user.household_id);
    });
    req.flash('success', householdDeleted
      ? `${user.name} und der zugehörige Haushalt mit allen Rezepten wurden gelöscht.`
      : `${user.name} wurde gelöscht. Der Haushalt bleibt für die anderen Mitglieder bestehen.`);
  }
  res.redirect(`${res.locals.base}/admin/users`);
});

module.exports = router;
