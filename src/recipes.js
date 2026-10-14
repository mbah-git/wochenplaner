// Rezepte eines Haushalts laden und speichern
const { parseLines, formatLine } = require('./ingredients');
const { tagList } = require('./format');

async function findRecipe(db, householdId, id) {
  const [rows] = await db.query('SELECT * FROM recipes WHERE id = ? AND household_id = ?', [Number(id) || 0, householdId]);
  if (!rows[0]) return null;
  const [ingredients] = await db.query(
    'SELECT quantity, unit, name FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position, id', [rows[0].id]);
  return { ...rows[0], ingredients: ingredients.map((i) => ({ ...i, quantity: i.quantity === null ? null : Number(i.quantity) })) };
}

// Formular -> { values, ingredients, error }
function validateRecipe(body) {
  const values = {
    name: String(body.name || '').trim(),
    servings: Number(body.servings),
    tags: tagList(body.tags).map((t) => t.slice(0, 30)).filter((t, i, all) => all.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i).join(', '),
    source_url: String(body.source_url || '').trim(),
    instructions: String(body.instructions || '').replace(/\r\n/g, '\n').trim(),
    ingredients_text: String(body.ingredients || '').replace(/\r\n/g, '\n'),
  };
  const ingredients = parseLines(values.ingredients_text);

  let error = null;
  if (!values.name || values.name.length > 150) error = 'Bitte gib einen Namen an (max. 150 Zeichen).';
  else if (!Number.isInteger(values.servings) || values.servings < 1 || values.servings > 50) error = 'Portionen: bitte eine Zahl zwischen 1 und 50.';
  else if (values.tags.length > 255) error = 'Zu viele Tags (max. 255 Zeichen).';
  else if (values.source_url && (!/^https?:\/\/[^\s]+$/i.test(values.source_url) || values.source_url.length > 500)) error = 'Der Link zur Quelle muss mit http:// oder https:// beginnen.';
  else if (values.instructions.length > 20000) error = 'Die Zubereitung ist zu lang (max. 20 000 Zeichen).';
  return { values, ingredients, error };
}

// Speichert Rezept und Zutaten (neu: id = null). db sollte eine Transaktion sein.
async function saveRecipe(db, { householdId, userId, id, values, ingredients }) {
  const fields = [values.name, values.servings, values.tags || null, values.source_url || null, values.instructions || null];
  let recipeId = id;
  if (id) {
    await db.query('UPDATE recipes SET name = ?, servings = ?, tags = ?, source_url = ?, instructions = ? WHERE id = ? AND household_id = ?',
      [...fields, id, householdId]);
    await db.query('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [id]);
  } else {
    const [res] = await db.query(
      'INSERT INTO recipes (household_id, created_by, name, servings, tags, source_url, instructions) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [householdId, userId, ...fields]);
    recipeId = res.insertId;
  }
  for (const [position, ing] of ingredients.entries()) {
    await db.query('INSERT INTO recipe_ingredients (recipe_id, position, quantity, unit, name) VALUES (?, ?, ?, ?, ?)',
      [recipeId, position, ing.quantity, ing.unit, ing.name]);
  }
  return recipeId;
}

function ingredientsText(ingredients) {
  return ingredients.map(formatLine).join('\n');
}

module.exports = { findRecipe, validateRecipe, saveRecipe, ingredientsText };
