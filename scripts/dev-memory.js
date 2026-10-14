// Lokaler Testbetrieb ohne MySQL/Docker: startet die echte App mit einer In-Memory-SQLite-Datenbank.
// MySQL-Befehle werden dafuer passend uebersetzt, Sessions liegen im Speicher, E-Mails landen in der Konsole.
//   npm run dev:memory          (benoetigt Node.js 22.5 oder neuer)
// Anmeldung: Zugangsdaten unten bei DEV_ADMIN. Alle Daten sind nach dem Beenden weg.
const path = require('path');
const fs = require('fs');
const Module = require('module');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || '3000';
const DEV_ADMIN = { email: 'admin@example.com', password: 'wochenplaner-dev' };

// Feste Werte, damit die (Server-)Werte aus .env hier nicht greifen
Object.assign(process.env, {
  NODE_ENV: 'development',
  PORT,
  DB_HOST: 'memory', DB_NAME: 'memory', DB_USER: 'memory', DB_PASSWORD: 'memory',
  SESSION_SECRET: 'dev-memory-secret',
  ADMIN_EMAIL: process.env.DEV_ADMIN_EMAIL || DEV_ADMIN.email,
  ADMIN_PASSWORD: process.env.DEV_ADMIN_PASSWORD || DEV_ADMIN.password,
  ADMIN_NAME: 'Administrator',
  APP_URL: `http://localhost:${PORT}`,
  SMTP_HOST: 'dev.invalid', SMTP_USER: 'dev', SMTP_PASSWORD: 'dev', MAIL_FROM: 'WochenPlaner <noreply@example.com>',
  BASE_PATH: process.env.BASE_PATH || '',
});

// ---------------- SQLite mit MySQL-Dialekt ----------------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys = ON');
sqlite.exec('CREATE TABLE sessions (session_id TEXT PRIMARY KEY, expires INTEGER, data TEXT)');

function translateDDL(sql) {
  return sql
    .replace(/\)\s*ENGINE=[^;]*$/i, ')')
    .replace(/(\w+)\s+INT UNSIGNED NOT NULL AUTO_INCREMENT/gi, '$1 INTEGER PRIMARY KEY AUTOINCREMENT')
    .replace(/^\s*PRIMARY KEY \(id\),?\s*$/gim, '')
    .replace(/UNIQUE KEY \w+ \(/gi, 'UNIQUE (')
    .replace(/^\s*KEY \w+ \([^)]*\),?\s*$/gim, '')
    .replace(/ENUM\([^)]*\)/gi, 'TEXT')
    .replace(/\bUNSIGNED\b/gi, '')
    .replace(/ON UPDATE CURRENT_TIMESTAMP/gi, '')
    .replace(/DEFAULT CURRENT_TIMESTAMP/gi, "DEFAULT (datetime('now','localtime'))")
    .replace(/,\s*\)\s*$/, '\n)');
}

function translate(sql) {
  let s = sql.trim();
  if (/^CREATE TABLE/i.test(s)) return translateDDL(s);
  s = s
    .replace(/DATE_ADD\(NOW\(\), INTERVAL \? MINUTE\)/gi, "datetime('now','localtime', '+' || ? || ' minutes')")
    .replace(/DATE_SUB\(NOW\(\), INTERVAL \? MINUTE\)/gi, "datetime('now','localtime', '-' || ? || ' minutes')")
    .replace(/NOW\(\)/gi, "datetime('now','localtime')")
    .replace(/^INSERT IGNORE/i, 'INSERT OR IGNORE')
    .replace(/LIKE \?/g, "LIKE ? ESCAPE '\\'");
  const dup = s.search(/ON DUPLICATE KEY UPDATE/i);
  if (dup >= 0) {
    s = s.slice(0, dup) + s.slice(dup)
      .replace(/ON DUPLICATE KEY UPDATE/i, 'ON CONFLICT DO UPDATE SET')
      .replace(/VALUES\((\w+)\)/gi, 'excluded.$1');
  }
  return s;
}

// mysql2 setzt Arrays in "IN (?)" als Liste ein
function expandParams(sql, params) {
  let i = 0;
  const flat = [];
  const out = sql.replace(/\?/g, () => {
    const p = params[i++];
    if (Array.isArray(p)) {
      flat.push(...p);
      return p.map(() => '?').join(', ') || 'NULL';
    }
    flat.push(p);
    return '?';
  });
  return { sql: out, params: flat.map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p)) };
}

async function query(sql, params = []) {
  if (/information_schema\.COLUMNS/i.test(sql)) return [[{ n: 1 }], []];
  const { sql: expanded, params: values } = expandParams(translate(sql), params);
  try {
    const stmt = sqlite.prepare(expanded);
    if (/^\s*(SELECT|WITH|PRAGMA)/i.test(expanded)) return [stmt.all(...values), []];
    const r = stmt.run(...values);
    return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }, []];
  } catch (err) {
    if (/UNIQUE constraint failed|PRIMARY KEY/i.test(err.message)) err.code = 'ER_DUP_ENTRY';
    err.message = `${err.message}\n  SQL: ${expanded.replace(/\s+/g, ' ')}`;
    throw err;
  }
}

const connection = {
  query,
  execute: query,
  escape: (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`),
  beginTransaction: async () => sqlite.exec('BEGIN'),
  commit: async () => sqlite.exec('COMMIT'),
  rollback: async () => sqlite.exec('ROLLBACK'),
  release: () => {},
  end: async () => {},
};
const pool = { ...connection, getConnection: async () => connection };
const fakeMysql = { createPool: () => pool, createConnection: async () => connection };

// ---------------- Module austauschen ----------------
const mailFile = process.env.DEV_MAIL_FILE;
const origLoad = Module._load;
Module._load = function load(request, parent, ...rest) {
  if (request === 'mysql2/promise') return fakeMysql;
  if (request === 'express-mysql-session') {
    return (session) => class MemoryStore extends session.MemoryStore {};
  }
  if (request === 'nodemailer') {
    return {
      createTransport: () => ({
        sendMail: async (mail) => {
          console.log(`\n--- E-Mail an ${mail.to}: ${mail.subject} ---\n${mail.text}\n---`);
          if (mailFile) fs.writeFileSync(mailFile, JSON.stringify(mail, null, 2));
          return { messageId: 'dev' };
        },
      }),
    };
  }
  return origLoad.call(this, request, parent, ...rest);
};

(async () => {
  const { migrate } = require(path.join(ROOT, 'src', 'migrations'));
  await migrate(pool);
  await require(path.join(ROOT, 'scripts', 'seed')).seed();
  require(path.join(ROOT, 'app.js'));
  console.log(`In-Memory-Modus: http://localhost:${PORT}${process.env.BASE_PATH} · Login ${process.env.ADMIN_EMAIL} / ${process.env.ADMIN_PASSWORD}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
