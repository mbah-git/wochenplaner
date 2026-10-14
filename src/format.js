// Formatierungs-Helfer fuer die Views (Schweizer Format)
const { formatAmount, formatNumber } = require('./ingredients');

const dateFmt = new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });

function toDate(value) {
  if (value instanceof Date) return value;
  // "YYYY-MM-DD" oder "YYYY-MM-DD HH:MM:SS" aus MySQL (dateStrings)
  const [d, t = '00:00:00'] = String(value).split(' ');
  const [y, m, day] = d.split('-').map(Number);
  const [h, min, s] = t.split(':').map(Number);
  return new Date(y, m - 1, day, h, min, s);
}

// "Vegi, schnell" -> ['Vegi', 'schnell']
function tagList(tags) {
  return String(tags || '').split(',').map((t) => t.trim()).filter(Boolean);
}

// Nur http(s)-Links anzeigen; Domain als Linktext
function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

module.exports = {
  date: (value) => (value ? dateFmt.format(toDate(value)) : '–'),
  amount: formatAmount,
  number: formatNumber,
  tagList,
  hostOf,
};
