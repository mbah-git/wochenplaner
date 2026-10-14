// Zutaten: Zeilen wie "200 g Mehl" einlesen, Mengen formatieren und fuer die Einkaufsliste zusammenzaehlen.

// Einheit -> Schreibweisen (klein geschrieben, ohne Punkt am Ende)
const UNITS = {
  g: ['g', 'gr', 'gramm'],
  kg: ['kg', 'kilo', 'kilogramm'],
  ml: ['ml', 'milliliter'],
  cl: ['cl', 'zentiliter'],
  dl: ['dl', 'deziliter'],
  l: ['l', 'liter'],
  EL: ['el', 'essl', 'esslöffel', 'esslöffeln'],
  TL: ['tl', 'teel', 'teelöffel', 'teelöffeln'],
  'Msp.': ['msp', 'messerspitze', 'messerspitzen'],
  Prise: ['prise', 'prisen'],
  Bund: ['bund', 'bunde', 'bd'],
  Dose: ['dose', 'dosen', 'ds'],
  'Pck.': ['pck', 'pkg', 'packung', 'packungen', 'päckchen', 'pack', 'beutel'],
  'Stk.': ['stk', 'st', 'stück', 'stücke'],
  Zehe: ['zehe', 'zehen'],
  Scheibe: ['scheibe', 'scheiben'],
  Becher: ['becher'],
  Tasse: ['tasse', 'tassen'],
  Glas: ['glas', 'gläser'],
  Zweig: ['zweig', 'zweige'],
  Stange: ['stange', 'stangen'],
  Kopf: ['kopf', 'köpfe'],
  Handvoll: ['handvoll', 'hand voll'],
  Würfel: ['würfel'],
  Blatt: ['blatt', 'blätter'],
  Tube: ['tube', 'tuben'],
  Flasche: ['flasche', 'flaschen'],
};
const UNIT_LOOKUP = new Map();
for (const [unit, aliases] of Object.entries(UNITS)) {
  for (const a of aliases) UNIT_LOOKUP.set(a, unit);
}
const UNIT_NAMES = Object.keys(UNITS);

// Gewicht und Volumen werden fuer die Summe in g bzw. ml umgerechnet
const BASE = { g: ['g', 1], kg: ['g', 1000], ml: ['ml', 1], cl: ['ml', 10], dl: ['ml', 100], l: ['ml', 1000] };

const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const NUMBER = '(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d*[½¼¾⅓⅔⅛]|\\d+(?:[.,]\\d+)?)';
const QUANTITY_RE = new RegExp(`^(${NUMBER})(?:\\s*(?:-|–|bis)\\s*(${NUMBER}))?`);

function parseNumber(text) {
  let s = String(text).trim();
  let total = 0;
  const frac = s.match(/[½¼¾⅓⅔⅛]$/);
  if (frac) {
    total += FRACTIONS[frac[0]];
    s = s.slice(0, -1).trim();
    if (!s) return total;
  }
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return total + Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = s.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[2]) ? total + Number(fraction[1]) / Number(fraction[2]) : null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? total + n : null;
}

function normalizeUnit(text) {
  if (!text) return null;
  return UNIT_LOOKUP.get(String(text).toLowerCase().replace(/\.$/, '').trim()) || null;
}

// "200 g Mehl" -> { quantity: 200, unit: 'g', name: 'Mehl' }; "Salz" -> { quantity: null, unit: null, name: 'Salz' }
function parseLine(line) {
  let rest = String(line || '').replace(/\s+/g, ' ').replace(/^[-*•]\s*/, '').trim();
  if (!rest) return null;

  let quantity = null;
  const q = QUANTITY_RE.exec(rest);
  if (q) {
    // Bei Spannen ("2-3 Tomaten") fuer den Einkauf die groessere Zahl nehmen
    quantity = parseNumber(q[2] || q[1]);
    rest = rest.slice(q[0].length).trim();
  }

  let unit = null;
  if (quantity !== null) {
    // Einheit direkt an der Zahl ("200g") oder als naechstes Wort ("2 EL", "1 Pck.")
    const m = /^([A-Za-zäöüÄÖÜ]+\.?)(?:\s+|$)(.*)$/.exec(rest);
    const twoWords = /^(hand voll)\s+(.*)$/i.exec(rest);
    if (twoWords) {
      unit = normalizeUnit(twoWords[1]);
      rest = twoWords[2];
    } else if (m && normalizeUnit(m[1]) && (m[2] || !/^[A-ZÄÖÜ]/.test(m[1]) || m[1].length <= 3)) {
      unit = normalizeUnit(m[1]);
      rest = m[2];
    }
  }

  const name = rest.replace(/^(?:von\s+)/i, '').trim().slice(0, 120);
  if (!name) return null;
  if (quantity !== null && !(quantity > 0 && quantity < 1e6)) quantity = null;
  return { quantity: quantity === null ? null : Math.round(quantity * 1000) / 1000, unit, name };
}

function parseLines(text) {
  return String(text || '').split(/\r?\n/).map(parseLine).filter(Boolean).slice(0, 80);
}

// Zahl schoen formatieren: 0.5 -> "½", 1.5 -> "1½", 2.25 -> "2¼", 0.333 -> "⅓", 12.5 -> "12.5"
function formatNumber(n, { fractions = true } = {}) {
  if (n === null || n === undefined || n === '') return '';
  const value = Number(n);
  if (fractions && value < 10) {
    const whole = Math.floor(value + 1e-9);
    const rest = value - whole;
    for (const [char, frac] of Object.entries(FRACTIONS)) {
      if (Math.abs(rest - frac) < 0.02) return `${whole || ''}${char}`;
    }
    if (rest < 0.02) return String(whole);
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return String(Math.round(value * 10 ** digits) / 10 ** digits);
}

// Mehrzahl fuer die Anzeige ("3 Zehen Knoblauch"); gespeichert wird immer die Einzahl
const PLURAL = {
  Prise: 'Prisen', Dose: 'Dosen', Zehe: 'Zehen', Scheibe: 'Scheiben', Tasse: 'Tassen', Zweig: 'Zweige',
  Stange: 'Stangen', Kopf: 'Köpfe', Blatt: 'Blätter', Tube: 'Tuben', Flasche: 'Flaschen', Glas: 'Gläser',
};

function formatAmount(quantity, unit) {
  if (quantity === null || quantity === undefined) return unit || '';
  const metric = unit && BASE[unit];
  const number = formatNumber(quantity, { fractions: !metric });
  if (!unit) return number;
  return `${number} ${Number(quantity) > 1 && PLURAL[unit] ? PLURAL[unit] : unit}`;
}

// Fuer das Bearbeiten-Formular: Zutaten wieder als Textzeilen
function formatLine(ing) {
  const amount = formatAmount(ing.quantity === null ? null : Number(ing.quantity), ing.unit);
  return amount ? `${amount} ${ing.name}` : ing.name;
}

// Anzeigename ohne Zusaetze: "Zwiebel, fein gehackt" -> "Zwiebel", "Tomaten (reif)" -> "Tomaten"
function cleanName(name) {
  return String(name).replace(/\([^)]*\)/g, ' ').split(',')[0].replace(/\s+/g, ' ').trim() || String(name).trim();
}

const SPECIAL_KEYS = { eier: 'ei', äpfel: 'apfel', nüsse: 'nuss', kartoffeln: 'kartoffel' };

// Schluessel zum Zusammenfassen: klein, ohne Zusaetze, einfache Pluralformen ("Tomaten" = "Tomate")
function itemKey(name) {
  const words = cleanName(name).toLowerCase().split(' ');
  let last = words.pop();
  if (SPECIAL_KEYS[last]) last = SPECIAL_KEYS[last];
  else if (last.length > 4 && /[elr]n$/.test(last)) last = last.slice(0, -1);
  return [...words, last].join(' ').slice(0, 120);
}

// Zutaten nicht auf die Einkaufsliste setzen
const SKIP_KEYS = new Set(['wasser', 'leitungswasser', 'heisses wasser', 'warmes wasser', 'kaltes wasser']);

// Fasst Zutaten mehrerer Mahlzeiten zusammen.
// rows: [{ name, quantity, unit, factor, source }] -> [{ key, name, amount, sources }]
function mergeIngredients(rows) {
  const items = new Map();
  for (const row of rows) {
    const key = itemKey(row.name);
    if (!key || SKIP_KEYS.has(key)) continue;
    let item = items.get(key);
    if (!item) {
      item = { key, name: cleanName(row.name), totals: new Map(), sources: [] };
      items.set(key, item);
    }
    if (row.source && !item.sources.includes(row.source)) item.sources.push(row.source);
    if (row.quantity === null || row.quantity === undefined) continue;

    const qty = Number(row.quantity) * (row.factor || 1);
    let unit = row.unit && row.unit !== 'Stk.' ? row.unit : '';
    let value = qty;
    if (BASE[unit]) {
      value = qty * BASE[unit][1];
      unit = BASE[unit][0];
    }
    item.totals.set(unit, (item.totals.get(unit) || 0) + value);
  }

  return [...items.values()].map((item) => {
    const parts = [...item.totals.entries()].map(([unit, value]) => {
      if (unit === 'g' && value >= 1000) return formatAmount(value / 1000, 'kg');
      if (unit === 'ml' && value >= 1000) return formatAmount(value / 1000, 'l');
      if (unit === 'g' || unit === 'ml') return formatAmount(Math.ceil(value - 1e-9), unit);
      return formatAmount(value, unit || null);
    });
    return { key: item.key, name: item.name, amount: parts.join(' + '), sources: item.sources };
  });
}

module.exports = {
  UNIT_NAMES, parseLine, parseLines, parseNumber, formatNumber, formatAmount, formatLine, cleanName, itemKey, mergeIngredients,
};
