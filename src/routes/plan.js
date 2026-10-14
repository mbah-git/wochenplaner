const express = require('express');
const pool = require('../db');
const { requireLogin } = require('../middleware/auth');
const { SLOTS, parseISO, resolveWeek, weekDays, weekNav, formatISO, addDays, mondayOf, longDate } = require('../week');

const router = express.Router();
router.use(requireLogin);

const slotOf = (key) => SLOTS.find((s) => s.key === key) || null;
const planUrl = (base, date) => `${base}/plan?week=${formatISO(mondayOf(date))}`;

async function loadWeek(householdId, monday) {
  const [rows] = await pool.query(`
    SELECT mp.plan_date, mp.slot, mp.recipe_id, mp.note, mp.servings, r.name AS recipe_name, r.servings AS recipe_servings
    FROM meal_plan mp LEFT JOIN recipes r ON r.id = mp.recipe_id
    WHERE mp.household_id = ? AND mp.plan_date BETWEEN ? AND ?`,
  [householdId, formatISO(monday), formatISO(addDays(monday, 6))]);
  return rows;
}

router.get('/', async (req, res) => {
  const monday = resolveWeek(req.query.week);
  const rows = await loadWeek(req.user.household_id, monday);
  const days = weekDays(monday).map((day) => ({
    ...day,
    meals: SLOTS.map((slot) => ({ slot, entry: rows.find((r) => r.plan_date === day.iso && r.slot === slot.key) || null })),
  }));
  res.render('plan/week', { title: 'Wochenplan', week: weekNav(monday), days, planned: rows.length });
});

// Leere Plaetze dieser Woche mit der Vorwoche fuellen
router.post('/copy-previous', async (req, res) => {
  const monday = resolveWeek(req.body.week);
  const previous = await loadWeek(req.user.household_id, addDays(monday, -7));
  let copied = 0;
  for (const entry of previous) {
    const date = formatISO(addDays(parseISO(entry.plan_date), 7));
    const [result] = await pool.query(
      'INSERT IGNORE INTO meal_plan (household_id, plan_date, slot, recipe_id, note, servings) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.household_id, date, entry.slot, entry.recipe_id, entry.note, entry.servings]);
    copied += result.affectedRows;
  }
  req.flash(copied ? 'success' : 'error', copied
    ? `${copied} Mahlzeit${copied === 1 ? '' : 'en'} aus der Vorwoche übernommen.`
    : 'Nichts übernommen: Die Vorwoche ist leer oder alle Plätze sind schon belegt.');
  res.redirect(`${res.locals.base}/plan?week=${formatISO(monday)}`);
});

// Von der Rezeptseite aus einplanen
router.post('/assign', async (req, res) => {
  const date = parseISO(req.body.date);
  const slot = slotOf(req.body.slot);
  const [rows] = await pool.query('SELECT id, name FROM recipes WHERE id = ? AND household_id = ?',
    [Number(req.body.recipe_id) || 0, req.user.household_id]);
  const recipe = rows[0];
  if (!date || !slot || !recipe) {
    req.flash('error', 'Bitte wähle Tag und Mahlzeit aus.');
    return res.redirect(`${res.locals.base}/${recipe ? `recipes/${recipe.id}` : 'plan'}`);
  }
  await pool.query(
    `INSERT INTO meal_plan (household_id, plan_date, slot, recipe_id, note, servings) VALUES (?, ?, ?, ?, NULL, NULL)
     ON DUPLICATE KEY UPDATE recipe_id = VALUES(recipe_id), note = VALUES(note), servings = VALUES(servings)`,
    [req.user.household_id, formatISO(date), slot.key, recipe.id]);
  req.flash('success', `„${recipe.name}“ ist eingeplant: ${longDate(date)}, ${slot.label}.`);
  res.redirect(planUrl(res.locals.base, date));
});

// ---- Einzelne Mahlzeit bearbeiten ----
async function loadSlot(req, res) {
  const date = parseISO(req.params.date);
  const slot = slotOf(req.params.slot);
  if (!date || !slot) {
    res.status(404).render('error', { title: 'Nicht gefunden', message: 'Diese Mahlzeit gibt es nicht.' });
    return null;
  }
  return { date, slot, iso: formatISO(date) };
}

async function renderSlot(req, res, target, { values = null, error = null, status = 200 } = {}) {
  const [[entry]] = await pool.query(
    'SELECT recipe_id, note, servings FROM meal_plan WHERE household_id = ? AND plan_date = ? AND slot = ?',
    [req.user.household_id, target.iso, target.slot.key]);
  const [recipes] = await pool.query(
    'SELECT id, name, servings, tags FROM recipes WHERE household_id = ? ORDER BY name', [req.user.household_id]);
  recipes.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  res.status(status).render('plan/slot', {
    title: `${target.slot.label} bearbeiten`,
    dateLabel: longDate(target.date),
    target,
    entry: entry || null,
    values: values || entry || { recipe_id: Number(req.query.recipe) || null, note: '', servings: null },
    recipes,
    backUrl: planUrl(res.locals.base, target.date),
    error,
  });
}

router.get('/:date/:slot', async (req, res) => {
  const target = await loadSlot(req, res);
  if (target) await renderSlot(req, res, target);
});

router.post('/:date/:slot', async (req, res) => {
  const target = await loadSlot(req, res);
  if (!target) return;
  const recipeId = Number(req.body.recipe_id) || null;
  const note = String(req.body.note || '').trim();
  const servingsText = String(req.body.servings || '').trim();
  const servings = servingsText ? Number(servingsText) : null;
  const values = { recipe_id: recipeId, note, servings: servingsText };

  let error = null;
  if (recipeId) {
    const [rows] = await pool.query('SELECT id FROM recipes WHERE id = ? AND household_id = ?', [recipeId, req.user.household_id]);
    if (!rows[0]) error = 'Dieses Rezept gibt es nicht.';
  }
  if (!error && note.length > 200) error = 'Der Freitext ist zu lang (max. 200 Zeichen).';
  if (!error && servings !== null && !(Number.isInteger(servings) && servings >= 1 && servings <= 50)) error = 'Portionen: bitte eine Zahl zwischen 1 und 50.';
  if (error) return renderSlot(req, res, target, { values, error, status: 400 });

  if (!recipeId && !note) {
    await pool.query('DELETE FROM meal_plan WHERE household_id = ? AND plan_date = ? AND slot = ?',
      [req.user.household_id, target.iso, target.slot.key]);
  } else {
    await pool.query(
      `INSERT INTO meal_plan (household_id, plan_date, slot, recipe_id, note, servings) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE recipe_id = VALUES(recipe_id), note = VALUES(note), servings = VALUES(servings)`,
      [req.user.household_id, target.iso, target.slot.key, recipeId, note || null, recipeId ? servings : null]);
  }
  res.redirect(planUrl(res.locals.base, target.date));
});

router.post('/:date/:slot/delete', async (req, res) => {
  const target = await loadSlot(req, res);
  if (!target) return;
  await pool.query('DELETE FROM meal_plan WHERE household_id = ? AND plan_date = ? AND slot = ?',
    [req.user.household_id, target.iso, target.slot.key]);
  req.flash('success', `${target.slot.label} am ${longDate(target.date)} entfernt.`);
  res.redirect(planUrl(res.locals.base, target.date));
});

module.exports = router;
