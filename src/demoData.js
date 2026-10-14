// Testdaten fuer "npm run seed": 10 Rezepte und ein gefuellter Wochenplan fuer die laufende Woche
const { parseLines } = require('./ingredients');
const { formatISO, addDays, mondayOf, today } = require('./week');

const RECIPES = [
  {
    name: 'Spaghetti Bolognese', servings: 4, tags: 'Pasta, Klassiker',
    ingredients: `400 g Spaghetti
400 g Rindshackfleisch
1 Zwiebel
2 Zehen Knoblauch
1 Karotte
1 Dose gehackte Tomaten
2 EL Tomatenmark
1 dl Rotwein
2 EL Olivenöl
Salz
Pfeffer
50 g Parmesan`,
    instructions: `Zwiebel, Knoblauch und Karotte fein hacken.
Hackfleisch im Olivenöl krümelig anbraten, Gemüse dazugeben und kurz mitdünsten.
Tomatenmark kurz mitrösten, mit Rotwein ablöschen.
Tomaten dazugeben, würzen und 30 Minuten köcheln lassen.
Spaghetti al dente kochen und mit der Sauce und Parmesan servieren.`,
  },
  {
    name: 'Gemüsecurry mit Kichererbsen', servings: 4, tags: 'Vegi, Vegan, Schnell',
    ingredients: `1 Zwiebel
2 Zehen Knoblauch
1 Stück Ingwer
2 EL rote Currypaste
1 Dose Kokosmilch
1 Dose Kichererbsen
1 Süsskartoffel
200 g Spinat
1 EL Rapsöl
300 g Basmatireis
1 Limette`,
    instructions: `Reis nach Packungsanleitung kochen.
Zwiebel, Knoblauch und Ingwer im Öl andünsten, Currypaste kurz mitrösten.
Süsskartoffel würfeln, mit Kokosmilch dazugeben und 15 Minuten köcheln.
Kichererbsen und Spinat untermischen, mit Limettensaft abschmecken.`,
  },
  {
    name: 'Älplermagronen', servings: 4, tags: 'Schweiz, Klassiker',
    ingredients: `300 g Hörnli
400 g Kartoffeln
2 Zwiebeln
2 dl Halbrahm
1 dl Milch
150 g Gruyère
20 g Butter
Muskat
Salz
Apfelmus`,
    instructions: `Kartoffeln schälen, würfeln und mit den Hörnli im Salzwasser weich kochen.
Zwiebeln in Ringe schneiden und in Butter goldbraun braten.
Rahm und Milch aufkochen, mit Muskat würzen.
Hörnli und Kartoffeln abgiessen, mit Rahm und Käse mischen, Zwiebeln darüber geben.
Mit Apfelmus servieren.`,
    source_url: 'https://de.wikipedia.org/wiki/%C3%84lplermagronen',
  },
  {
    name: 'Ofengemüse mit Feta', servings: 2, tags: 'Vegi, Ofen',
    ingredients: `2 Peperoni
1 Zucchetti
1 rote Zwiebel
300 g Kartoffeln
200 g Feta
3 EL Olivenöl
1 TL Oregano
Salz
Pfeffer`,
    instructions: `Ofen auf 200 °C vorheizen.
Gemüse und Kartoffeln in Stücke schneiden, mit Öl und Gewürzen mischen.
30 Minuten backen, Feta zerbröckeln und weitere 10 Minuten backen.`,
  },
  {
    name: 'Poulet-Geschnetzeltes mit Reis', servings: 4, tags: 'Fleisch, Schnell',
    ingredients: `600 g Pouletbrust
250 g Champignons
1 Zwiebel
2 dl Saucenhalbrahm
1 dl Gemüsebrühe
1 EL Rapsöl
1 Bund Petersilie
300 g Langkornreis
Salz
Pfeffer`,
    instructions: `Reis kochen.
Poulet in Streifen schneiden und portionenweise scharf anbraten, herausnehmen.
Zwiebel und Champignons andünsten, mit Brühe und Rahm ablöschen.
Fleisch zurück in die Sauce geben, kurz ziehen lassen, mit Petersilie bestreuen.`,
  },
  {
    name: 'Lachs mit Ofenkartoffeln', servings: 2, tags: 'Fisch, Ofen',
    ingredients: `2 Lachsfilets
500 g Kartoffeln
1 Zitrone
1 Bund Dill
150 g Sauerrahm
2 EL Olivenöl
Salz
Pfeffer`,
    instructions: `Kartoffeln halbieren, mit Öl und Salz bei 200 °C 25 Minuten backen.
Lachs würzen, zu den Kartoffeln legen und 12 Minuten mitbacken.
Sauerrahm mit Dill und Zitronensaft verrühren und dazu servieren.`,
  },
  {
    name: 'Tomatensuppe', servings: 4, tags: 'Vegi, Suppe, Schnell',
    ingredients: `2 Dosen gehackte Tomaten
1 Zwiebel
1 Zehe Knoblauch
5 dl Gemüsebrühe
1 dl Halbrahm
1 TL Zucker
1 EL Olivenöl
Basilikum
4 Scheiben Brot`,
    instructions: `Zwiebel und Knoblauch im Öl andünsten.
Tomaten und Brühe dazugeben, 15 Minuten köcheln, dann pürieren.
Rahm einrühren, mit Zucker, Salz und Pfeffer abschmecken.
Mit Basilikum und geröstetem Brot servieren.`,
  },
  {
    name: 'Rösti mit Spiegelei', servings: 2, tags: 'Schweiz, Vegi',
    ingredients: `600 g Kartoffeln
2 EL Bratbutter
4 Eier
Salz
1 Kopf Salat`,
    instructions: `Kartoffeln am Vortag kochen, schälen und grob reiben.
In Bratbutter goldbraun braten, wenden und fertig braten.
Spiegeleier braten und mit Salat servieren.`,
  },
  {
    name: 'Chili con Carne', servings: 6, tags: 'Fleisch, Scharf',
    ingredients: `500 g Rindshackfleisch
2 Zwiebeln
2 Zehen Knoblauch
2 Peperoni
1 Dose Kidneybohnen
1 Dose Mais
2 Dosen gehackte Tomaten
2 EL Tomatenmark
1 TL Kreuzkümmel
1 TL Paprikapulver
1 Chili
2 EL Rapsöl
6 Tortillas`,
    instructions: `Hackfleisch im Öl anbraten, Zwiebeln, Knoblauch und Peperoni dazugeben.
Tomatenmark und Gewürze kurz mitrösten.
Tomaten, Bohnen und Mais dazugeben und 40 Minuten köcheln lassen.
Mit warmen Tortillas servieren.`,
  },
  {
    name: 'Birchermüesli', servings: 2, tags: 'Frühstück, Schweiz, Vegi',
    ingredients: `100 g Haferflocken
2 dl Milch
180 g Naturejoghurt
2 Äpfel
1 Banane
1 EL Honig
30 g Haselnüsse
100 g Beeren`,
    instructions: `Haferflocken mit Milch mischen und mindestens 30 Minuten quellen lassen.
Äpfel grob reiben, Banane in Scheiben schneiden.
Alles mit Joghurt und Honig mischen, mit Nüssen und Beeren garnieren.`,
  },
];

// Wochenplan: [Wochentag 0-6, Mahlzeit, Rezeptname oder null, Freitext, Portionen]
const WEEK_PLAN = [
  [0, 'dinner', 'Spaghetti Bolognese', null, null],
  [1, 'dinner', 'Gemüsecurry mit Kichererbsen', null, null],
  [2, 'lunch', null, 'Resten vom Curry', null],
  [2, 'dinner', 'Ofengemüse mit Feta', null, 4],
  [3, 'dinner', 'Poulet-Geschnetzeltes mit Reis', null, null],
  [4, 'dinner', null, 'Pizza bestellen', null],
  [5, 'lunch', 'Rösti mit Spiegelei', null, 3],
  [5, 'dinner', 'Lachs mit Ofenkartoffeln', null, null],
  [6, 'lunch', 'Birchermüesli', null, 4],
  [6, 'dinner', 'Älplermagronen', 'Mit Apfelmus', null],
];

const CUSTOM_ITEMS = [
  ['Kaffee', null, 'getraenke'],
  ['Toilettenpapier', null, 'haushalt'],
  ['Mineralwasser', '6 Flaschen', 'getraenke'],
];

// db: Verbindung oder Pool. Legt Rezepte an, falls der Haushalt noch keine hat. Liefert Anzahl.
async function addRecipes(db, householdId, userId) {
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM recipes WHERE household_id = ?', [householdId]);
  if (Number(n)) return 0;
  for (const r of RECIPES) {
    const [res] = await db.query(
      'INSERT INTO recipes (household_id, created_by, name, servings, tags, source_url, instructions) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [householdId, userId, r.name, r.servings, r.tags, r.source_url || null, r.instructions]);
    for (const [position, ing] of parseLines(r.ingredients).entries()) {
      await db.query('INSERT INTO recipe_ingredients (recipe_id, position, quantity, unit, name) VALUES (?, ?, ?, ?, ?)',
        [res.insertId, position, ing.quantity, ing.unit, ing.name]);
    }
  }
  return RECIPES.length;
}

// Fuellt die laufende Woche, falls dort noch nichts geplant ist. Liefert Anzahl Mahlzeiten.
async function addWeekPlan(db, householdId) {
  const monday = mondayOf(today());
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM meal_plan WHERE household_id = ? AND plan_date BETWEEN ? AND ?',
    [householdId, formatISO(monday), formatISO(addDays(monday, 6))]);
  if (Number(n)) return 0;

  const [recipes] = await db.query('SELECT id, name FROM recipes WHERE household_id = ?', [householdId]);
  const idOf = new Map(recipes.map((r) => [r.name, r.id]));
  let count = 0;
  for (const [day, slot, recipeName, note, servings] of WEEK_PLAN) {
    const recipeId = recipeName ? idOf.get(recipeName) || null : null;
    if (recipeName && !recipeId) continue;
    await db.query('INSERT INTO meal_plan (household_id, plan_date, slot, recipe_id, note, servings) VALUES (?, ?, ?, ?, ?, ?)',
      [householdId, formatISO(addDays(monday, day)), slot, recipeId, note, servings]);
    count++;
  }
  for (const [name, amount, category] of CUSTOM_ITEMS) {
    await db.query('INSERT INTO shopping_items (household_id, week_start, name, amount, category) VALUES (?, ?, ?, ?, ?)',
      [householdId, formatISO(monday), name, amount, category]);
  }
  return count;
}

module.exports = { RECIPES, addRecipes, addWeekPlan };
