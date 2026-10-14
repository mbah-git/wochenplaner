// Datums- und Wochen-Helfer. Wochen beginnen am Montag, gerechnet wird in Schweizer Zeit (siehe config.js).

const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const SLOTS = [
  { key: 'lunch', label: 'Mittagessen', short: 'Mittag' },
  { key: 'dinner', label: 'Abendessen', short: 'Abend' },
];

const pad = (n) => String(n).padStart(2, '0');

function formatISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "YYYY-MM-DD" -> Date (lokale Mitternacht) oder null bei ungueltigen Werten
function parseISO(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return formatISO(d) === m[0] ? d : null;
}

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d, days) {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

// 0 = Montag ... 6 = Sonntag
const weekdayIndex = (d) => (d.getDay() + 6) % 7;

function mondayOf(d) {
  return addDays(d, -weekdayIndex(d));
}

// Montag der Woche zu einem beliebigen Datum im Parameter, sonst die aktuelle Woche
function resolveWeek(param) {
  return mondayOf(parseISO(param) || today());
}

// ISO-Kalenderwoche
function isoWeek(d) {
  const thursday = addDays(mondayOf(d), 3);
  const firstThursday = addDays(mondayOf(new Date(thursday.getFullYear(), 0, 4)), 3);
  return 1 + Math.round((thursday - firstThursday) / (7 * 86400000));
}

function weekDays(monday) {
  const now = formatISO(today());
  return DAY_NAMES.map((name, i) => {
    const date = addDays(monday, i);
    const iso = formatISO(date);
    return {
      iso,
      name,
      short: DAY_SHORT[i],
      dayMonth: `${date.getDate()}.${date.getMonth() + 1}.`,
      isToday: iso === now,
      isPast: iso < now,
    };
  });
}

// z. B. "13.–19. Oktober 2026" oder "29. September – 5. Oktober 2026"
function weekRangeLabel(monday) {
  const sunday = addDays(monday, 6);
  const end = `${sunday.getDate()}. ${MONTHS[sunday.getMonth()]} ${sunday.getFullYear()}`;
  if (monday.getMonth() === sunday.getMonth()) return `${monday.getDate()}.–${end}`;
  const startYear = monday.getFullYear() !== sunday.getFullYear() ? ` ${monday.getFullYear()}` : '';
  return `${monday.getDate()}. ${MONTHS[monday.getMonth()]}${startYear} – ${end}`;
}

// Navigation fuer Wochenplan und Einkaufsliste
function weekNav(monday) {
  const current = formatISO(mondayOf(today()));
  const iso = formatISO(monday);
  return {
    start: iso,
    end: formatISO(addDays(monday, 6)),
    number: isoWeek(monday),
    label: weekRangeLabel(monday),
    prev: formatISO(addDays(monday, -7)),
    next: formatISO(addDays(monday, 7)),
    isCurrent: iso === current,
    relative: iso === current ? 'Diese Woche'
      : iso === formatISO(addDays(mondayOf(today()), 7)) ? 'Nächste Woche'
        : iso === formatISO(addDays(mondayOf(today()), -7)) ? 'Letzte Woche' : null,
  };
}

// "Mittwoch, 15. Oktober"
function longDate(d) {
  return `${DAY_NAMES[weekdayIndex(d)]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

module.exports = {
  DAY_NAMES, DAY_SHORT, SLOTS,
  formatISO, parseISO, today, addDays, mondayOf, resolveWeek, isoWeek, weekDays, weekNav, longDate, weekdayIndex,
};
