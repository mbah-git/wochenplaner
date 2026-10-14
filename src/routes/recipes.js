const express = require('express');
const pool = require('../db');
const { requireLogin } = require('../middleware/auth');
const { findRecipe, validateRecipe, saveRecipe, ingredientsText } = require('../recipes');
const { UNIT_NAMES } = require('../ingredients');
const { tagList } = require('../format');
const { SLOTS, today, addDays, formatISO, longDate } = require('../week');

const router = express.Router();
router.use(requireLogin);

const SORTS = { name: 'Name', new: 'Neueste zuerst', planned: 'Zuletzt geplant' };

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const tag = String(req.query.tag || '').trim().slice(0, 30);
  const sort = SORTS[req.query.sort] ? req.query.sort : 'name';

  const [rows] = await pool.query(`
    SELECT r.id, r.name, r.servings, r.tags, r.source_url, r.created_at,
           (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.recipe_id = r.id) AS ingredient_count,
           (SELECT MAX(mp.plan_date) FROM meal_plan mp WHERE mp.recipe_id = r.id) AS last_planned
    FROM recipes r WHERE r.household_id = ?`, [req.user.household_id]);

  // Alle Tags fuer die Filter-Chips (Gross-/Kleinschreibung zusammenfassen)
  const tagCounts = new Map();
  for (const r of rows) {
    for (const t of tagList(r.tags)) {
      const key = t.toLowerCase();
      const entry = tagCounts.get(key) || { name: t, count: 0 };
      entry.count++;
      tagCounts.set(key, entry);
    }
  }
  const tags = [...tagCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'de'));

  const needle = q.toLowerCase();
  let ingredientHits = new Set();
  if (needle) {
    // Auch Zutaten durchsuchen, damit "Lauch" Rezepte mit Lauch findet
    const [hits] = await pool.query(`
      SELECT DISTINCT ri.recipe_id FROM recipe_ingredients ri JOIN recipes r ON r.id = ri.recipe_id
      WHERE r.household_id = ? AND LOWER(ri.name) LIKE ?`, [req.user.household_id, `%${needle.replace(/[\\%_]/g, '\\$&')}%`]);
    ingredientHits = new Set(hits.map((h) => h.recipe_id));
  }
  const hasTag = (r) => !tag || tagList(r.tags).some((t) => t.toLowerCase() === tag.toLowerCase());
  const recipes = rows.filter((r) => hasTag(r) &&
    (!needle || `${r.name} ${r.tags || ''}`.toLowerCase().includes(needle) || ingredientHits.has(r.id)));
  const byName = (a, b) => a.name.localeCompare(b.name, 'de');
  recipes.sort(sort === 'new' ? (a, b) => String(b.created_at).localeCompare(String(a.created_at)) || byName(a, b)
    : sort === 'planned' ? (a, b) => String(b.last_planned || '').localeCompare(String(a.last_planned || '')) || byName(a, b)
      : byName);

  res.render('recipes/index', { title: 'Rezepte', recipes, total: rows.length, tags, q, tag, sort, sorts: SORTS });
});

function renderForm(res, { recipe = null, values, error = null, status = 200 }) {
  res.status(status).render('recipes/form', {
    title: recipe ? `${recipe.name} bearbeiten` : 'Neues Rezept',
    recipe,
    values,
    units: UNIT_NAMES,
    error,
  });
}

router.get('/new', (req, res) => {
  renderForm(res, { values: { servings: 4, ingredients_text: '' } });
});

router.post('/', async (req, res) => {
  const { values, ingredients, error } = validateRecipe(req.body);
  if (error) return renderForm(res, { values, error, status: 400 });
  const id = await pool.transaction((conn) => saveRecipe(conn, {
    householdId: req.user.household_id, userId: req.user.id, id: null, values, ingredients,
  }));
  req.flash('success', `„${values.name}“ wurde gespeichert.`);
  res.redirect(`${res.locals.base}/recipes/${id}`);
});

// Naechste 14 Tage fuer "Einplanen"
function planDays() {
  const start = today();
  return Array.from({ length: 14 }, (_, i) => {
    const d = addDays(start, i);
    return { iso: formatISO(d), label: i === 0 ? `Heute (${longDate(d)})` : i === 1 ? `Morgen (${longDate(d)})` : longDate(d) };
  });
}

router.get('/:id', async (req, res) => {
  const recipe = await findRecipe(pool, req.user.household_id, req.params.id);
  if (!recipe) return res.status(404).render('error', { title: 'Nicht gefunden', message: 'Dieses Rezept gibt es nicht.' });
  const [planned] = await pool.query(
    "SELECT plan_date, slot FROM meal_plan WHERE household_id = ? AND recipe_id = ? AND plan_date >= ? ORDER BY plan_date, slot = 'dinner'",
    [req.user.household_id, recipe.id, formatISO(today())]);
  res.render('recipes/show', {
    title: recipe.name,
    recipe,
    planned: planned.map((p) => ({ ...p, slotLabel: SLOTS.find((s) => s.key === p.slot).label })),
    days: planDays(),
    slots: SLOTS,
  });
});

router.get('/:id/edit', async (req, res) => {
  const recipe = await findRecipe(pool, req.user.household_id, req.params.id);
  if (!recipe) return res.status(404).render('error', { title: 'Nicht gefunden', message: 'Dieses Rezept gibt es nicht.' });
  renderForm(res, { recipe, values: { ...recipe, ingredients_text: ingredientsText(recipe.ingredients) } });
});

router.post('/:id', async (req, res) => {
  const recipe = await findRecipe(pool, req.user.household_id, req.params.id);
  if (!recipe) return res.status(404).render('error', { title: 'Nicht gefunden', message: 'Dieses Rezept gibt es nicht.' });
  const { values, ingredients, error } = validateRecipe(req.body);
  if (error) return renderForm(res, { recipe, values, error, status: 400 });
  await pool.transaction((conn) => saveRecipe(conn, {
    householdId: req.user.household_id, userId: req.user.id, id: recipe.id, values, ingredients,
  }));
  req.flash('success', 'Änderungen gespeichert.');
  res.redirect(`${res.locals.base}/recipes/${recipe.id}`);
});

router.post('/:id/delete', async (req, res) => {
  const recipe = await findRecipe(pool, req.user.household_id, req.params.id);
  if (recipe) {
    await pool.transaction(async (conn) => {
      // Geplante Mahlzeiten bleiben als Freitext erhalten
      await conn.query(
        "UPDATE meal_plan SET note = COALESCE(note, ?), recipe_id = NULL WHERE recipe_id = ? AND household_id = ?",
        [recipe.name.slice(0, 200), recipe.id, req.user.household_id]);
      await conn.query('DELETE FROM recipes WHERE id = ? AND household_id = ?', [recipe.id, req.user.household_id]);
    });
    req.flash('success', `„${recipe.name}“ wurde gelöscht.`);
  }
  res.redirect(`${res.locals.base}/recipes`);
});

module.exports = router;
