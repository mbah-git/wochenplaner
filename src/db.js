const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 5,
  dateStrings: true,
  charset: 'utf8mb4',
});

// Fuehrt fn(conn) in einer Transaktion aus; bei einem Fehler wird alles zurueckgerollt
pool.transaction = async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = pool;
