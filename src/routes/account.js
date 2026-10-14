const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const config = require('../config');
const { requireLogin } = require('../middleware/auth');
const { newInviteCode, findByCode, createHousehold, defaultName, moveUser, memberCount } = require('../households');

const router = express.Router();
router.use(requireLogin);

// ---- Einstellungen & Haushalt ----
router.get('/', async (req, res) => {
  const [[household]] = await pool.query('SELECT id, name, invite_code FROM households WHERE id = ?', [req.user.household_id]);
  const [members] = await pool.query(
    'SELECT id, name, email FROM users WHERE household_id = ? ORDER BY name, id', [req.user.household_id]);
  const origin = config.appUrl || `${req.protocol}://${req.get('host')}${res.locals.base}`;
  res.render('account/settings', {
    title: 'Einstellungen',
    household,
    members,
    inviteLink: config.allowRegistration ? `${origin}/register?code=${household.invite_code}` : null,
  });
});

router.post('/household/rename', async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name || name.length > 100) {
    req.flash('error', 'Bitte gib einen Namen für den Haushalt an (max. 100 Zeichen).');
  } else {
    await pool.query('UPDATE households SET name = ? WHERE id = ?', [name, req.user.household_id]);
    req.flash('success', 'Der Haushalt wurde umbenannt.');
  }
  res.redirect(`${res.locals.base}/account`);
});

router.post('/household/new-code', async (req, res) => {
  await pool.query('UPDATE households SET invite_code = ? WHERE id = ?', [newInviteCode(), req.user.household_id]);
  req.flash('success', 'Neuer Einladungscode erstellt. Der alte Code funktioniert nicht mehr.');
  res.redirect(`${res.locals.base}/account`);
});

router.post('/household/join', async (req, res) => {
  const target = await findByCode(pool, req.body.code);
  if (!target) {
    req.flash('error', 'Dieser Einladungscode ist ungültig.');
  } else if (target.id === req.user.household_id) {
    req.flash('error', 'Du bist bereits Mitglied dieses Haushalts.');
  } else {
    const { movedRecipes } = await pool.transaction((conn) => moveUser(conn, req.user.id, req.user.household_id, target.id));
    req.flash('success', `Du bist jetzt Mitglied von „${target.name}“.${movedRecipes ? ` Deine ${movedRecipes} Rezepte hast du mitgenommen.` : ''}`);
  }
  res.redirect(`${res.locals.base}/account`);
});

router.post('/household/leave', async (req, res) => {
  if ((await memberCount(pool, req.user.household_id)) <= 1) {
    req.flash('error', 'Du bist das einzige Mitglied. Ein eigener Haushalt bleibt immer bestehen.');
    return res.redirect(`${res.locals.base}/account`);
  }
  await pool.transaction(async (conn) => {
    const id = await createHousehold(conn, defaultName(req.user.name));
    await moveUser(conn, req.user.id, req.user.household_id, id);
  });
  req.flash('success', 'Du hast den Haushalt verlassen und hast jetzt einen eigenen, leeren Haushalt.');
  res.redirect(`${res.locals.base}/account`);
});

// ---- Passwort ----
router.get('/password', (req, res) => {
  res.render('account/password', { title: 'Passwort ändern', error: null });
});

router.post('/password', async (req, res) => {
  const current = String(req.body.current_password || '');
  const password = String(req.body.password || '');
  const confirm = String(req.body.password_confirm || '');

  const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  let error = null;
  if (!(await bcrypt.compare(current, rows[0].password_hash))) error = 'Das aktuelle Passwort ist falsch.';
  else if (password.length < 8) error = 'Das neue Passwort muss mindestens 8 Zeichen lang sein.';
  else if (password !== confirm) error = 'Die neuen Passwörter stimmen nicht überein.';
  else if (password === current) error = 'Das neue Passwort muss sich vom aktuellen unterscheiden.';
  if (error) {
    return res.status(400).render('account/password', { title: 'Passwort ändern', error });
  }

  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(password, 12), req.user.id]);
  req.flash('success', 'Dein Passwort wurde geändert.');
  res.redirect(`${res.locals.base}/account`);
});

module.exports = router;
