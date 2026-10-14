const express = require('express');
const pool = require('../db');
const { requireLogin } = require('../middleware/auth');
const { buildList, categoryFor } = require('../shopping');
const { CATEGORIES, isCategory } = require('../categories');
const { parseLine, formatAmount, itemKey } = require('../ingredients');
const { resolveWeek, weekNav, formatISO, today } = require('../week');

const router = express.Router();
router.use(requireLogin);

// Abhaken per fetch() auf dem Handy: JSON statt Redirect
const wantsJson = (req) => req.get('X-Requested-With') === 'fetch';

function done(req, res, week, data = {}) {
  if (wantsJson(req)) return res.json({ ok: true, ...data });
  res.redirect(`${res.locals.base}/shopping?week=${week}${req.body.from === 'today' ? '&from=today' : ''}`);
}

router.get('/', async (req, res) => {
  const monday = resolveWeek(req.query.week);
  const week = weekNav(monday);
  const todayIso = formatISO(today());
  // "Ab heute": bereits vergangene Tage der Woche weglassen (nur sinnvoll in der laufenden Woche)
  const fromToday = req.query.from === 'today' && todayIso > week.start && todayIso <= week.end;
  const list = await buildList(pool, req.user.household_id, monday, { fromDate: fromToday ? todayIso : null });
  res.render('shopping/list', {
    title: 'Einkaufsliste',
    week,
    list,
    fromToday,
    canFilterToday: todayIso > week.start && todayIso <= week.end,
    categories: CATEGORIES,
    editMode: req.query.edit === '1',
  });
});

router.post('/check', async (req, res) => {
  const week = formatISO(resolveWeek(req.body.week));
  const key = String(req.body.key || '').slice(0, 120);
  const checked = req.body.checked === '1';
  if (key) {
    if (checked) {
      await pool.query('INSERT IGNORE INTO shopping_checks (household_id, week_start, item_key) VALUES (?, ?, ?)',
        [req.user.household_id, week, key]);
    } else {
      await pool.query('DELETE FROM shopping_checks WHERE household_id = ? AND week_start = ? AND item_key = ?',
        [req.user.household_id, week, key]);
    }
  }
  done(req, res, week, { checked });
});

router.post('/items', async (req, res) => {
  const week = formatISO(resolveWeek(req.body.week));
  let name = String(req.body.name || '').trim();
  let amount = String(req.body.amount || '').trim();
  // "2 l Milch" in Menge und Name aufteilen, wenn keine Menge separat angegeben ist
  if (name && !amount) {
    const parsed = parseLine(name);
    if (parsed && parsed.quantity !== null) {
      name = parsed.name;
      amount = formatAmount(parsed.quantity, parsed.unit);
    }
  }
  if (!name || name.length > 120 || amount.length > 40) {
    req.flash('error', 'Bitte gib einen Eintrag an (max. 120 Zeichen, Menge max. 40 Zeichen).');
  } else {
    const category = await categoryFor(pool, req.user.household_id, name);
    await pool.query('INSERT INTO shopping_items (household_id, week_start, name, amount, category) VALUES (?, ?, ?, ?, ?)',
      [req.user.household_id, week, name, amount || null, category]);
  }
  done(req, res, week);
});

async function findItem(req, id = req.params.id) {
  const [rows] = await pool.query('SELECT id, name, week_start FROM shopping_items WHERE id = ? AND household_id = ?',
    [Number(id) || 0, req.user.household_id]);
  return rows[0] || null;
}

router.post('/items/:id/toggle', async (req, res) => {
  const item = await findItem(req);
  const checked = req.body.checked === '1';
  if (item) await pool.query('UPDATE shopping_items SET checked = ? WHERE id = ?', [checked ? 1 : 0, item.id]);
  done(req, res, item ? item.week_start : formatISO(resolveWeek(req.body.week)), { checked });
});

router.post('/items/:id/delete', async (req, res) => {
  const item = await findItem(req);
  if (item) await pool.query('DELETE FROM shopping_items WHERE id = ?', [item.id]);
  done(req, res, item ? item.week_start : formatISO(resolveWeek(req.body.week)));
});

// Kategorie aendern; der Haushalt merkt sich die Zuordnung fuer kuenftige Listen
router.post('/category', async (req, res) => {
  const week = formatISO(resolveWeek(req.body.week));
  const category = String(req.body.category || '');
  const key = req.body.item_id ? null : String(req.body.key || '').slice(0, 120);
  if (isCategory(category)) {
    let itemKeyToSave = key;
    if (req.body.item_id) {
      const item = await findItem(req, req.body.item_id);
      if (item) {
        await pool.query('UPDATE shopping_items SET category = ? WHERE id = ?', [category, item.id]);
        itemKeyToSave = itemKey(item.name);
      }
    }
    if (itemKeyToSave) {
      await pool.query(
        `INSERT INTO ingredient_categories (household_id, item_key, category) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE category = VALUES(category)`,
        [req.user.household_id, itemKeyToSave, category]);
    }
  }
  if (wantsJson(req)) return res.json({ ok: true });
  res.redirect(`${res.locals.base}/shopping?week=${week}&edit=1`);
});

// Alle Haken der Woche entfernen
router.post('/reset', async (req, res) => {
  const week = formatISO(resolveWeek(req.body.week));
  await pool.query('DELETE FROM shopping_checks WHERE household_id = ? AND week_start = ?', [req.user.household_id, week]);
  await pool.query('UPDATE shopping_items SET checked = 0 WHERE household_id = ? AND week_start = ?', [req.user.household_id, week]);
  req.flash('success', 'Alle Haken entfernt.');
  done(req, res, week);
});

// Abgehakte eigene Eintraege loeschen
router.post('/clear-checked', async (req, res) => {
  const week = formatISO(resolveWeek(req.body.week));
  const [result] = await pool.query('DELETE FROM shopping_items WHERE household_id = ? AND week_start = ? AND checked = 1',
    [req.user.household_id, week]);
  req.flash('success', `${result.affectedRows} abgehakte eigene Einträge gelöscht.`);
  done(req, res, week);
});

module.exports = router;
