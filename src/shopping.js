// Einkaufsliste einer Woche: Zutaten aus dem Wochenplan (zusammengezaehlt) plus eigene Eintraege,
// gruppiert nach Kategorie.
const { mergeIngredients, itemKey } = require('./ingredients');
const { CATEGORIES, guessCategory, isCategory } = require('./categories');
const { formatISO, addDays, DAY_SHORT, weekdayIndex, parseISO } = require('./week');

async function categoryOverrides(db, householdId) {
  const [rows] = await db.query('SELECT item_key, category FROM ingredient_categories WHERE household_id = ?', [householdId]);
  return new Map(rows.map((r) => [r.item_key, r.category]));
}

// Kategorie fuer einen neuen eigenen Eintrag: gemerkte Zuordnung des Haushalts, sonst automatisch
async function categoryFor(db, householdId, name) {
  const [rows] = await db.query('SELECT category FROM ingredient_categories WHERE household_id = ? AND item_key = ?',
    [householdId, itemKey(name)]);
  return rows[0] && isCategory(rows[0].category) ? rows[0].category : guessCategory(name);
}

async function buildList(db, householdId, monday, { fromDate = null } = {}) {
  const weekStart = formatISO(monday);
  const start = fromDate && fromDate > weekStart ? fromDate : weekStart;
  const end = formatISO(addDays(monday, 6));

  const [rows] = await db.query(`
    SELECT mp.plan_date, mp.slot, COALESCE(mp.servings, r.servings) AS servings, r.servings AS recipe_servings,
           r.name AS recipe_name, ri.quantity, ri.unit, ri.name
    FROM meal_plan mp
    JOIN recipes r ON r.id = mp.recipe_id
    JOIN recipe_ingredients ri ON ri.recipe_id = r.id
    WHERE mp.household_id = ? AND mp.plan_date BETWEEN ? AND ?
    ORDER BY mp.plan_date, mp.slot = 'dinner', ri.position, ri.id`, [householdId, start, end]);

  const merged = mergeIngredients(rows.map((r) => ({
    name: r.name,
    quantity: r.quantity === null ? null : Number(r.quantity),
    unit: r.unit,
    factor: Number(r.servings) / Number(r.recipe_servings || r.servings || 1),
    source: `${r.recipe_name} (${DAY_SHORT[weekdayIndex(parseISO(r.plan_date))]})`,
  })));

  const overrides = await categoryOverrides(db, householdId);
  const [checks] = await db.query('SELECT item_key FROM shopping_checks WHERE household_id = ? AND week_start = ?', [householdId, weekStart]);
  const checked = new Set(checks.map((c) => c.item_key));
  const [custom] = await db.query(
    'SELECT id, name, amount, category, checked FROM shopping_items WHERE household_id = ? AND week_start = ? ORDER BY id',
    [householdId, weekStart]);

  const items = [
    ...merged.map((m) => ({
      type: 'auto',
      key: m.key,
      name: m.name,
      amount: m.amount,
      sources: m.sources,
      checked: checked.has(m.key),
      category: isCategory(overrides.get(m.key)) ? overrides.get(m.key) : guessCategory(m.name),
    })),
    ...custom.map((c) => ({
      type: 'custom',
      id: c.id,
      key: itemKey(c.name),
      name: c.name,
      amount: c.amount || '',
      sources: [],
      checked: Boolean(c.checked),
      category: isCategory(c.category) ? c.category : 'sonstiges',
    })),
  ];

  const groups = CATEGORIES.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category === cat.key)
      .sort((a, b) => a.checked - b.checked || a.name.localeCompare(b.name, 'de')),
  })).filter((g) => g.items.length);

  return {
    groups,
    total: items.length,
    open: items.filter((i) => !i.checked).length,
    mealCount: new Set(rows.map((r) => `${r.plan_date}|${r.slot}`)).size,
  };
}

module.exports = { buildList, categoryFor };
