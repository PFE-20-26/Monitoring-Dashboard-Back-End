require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    console.log('Connected to DB');

    const [rows] = await conn.execute(
        "SELECT id, `Jour` AS day, `Debut` AS startTime, `Fin` AS stopTime, `Duree` AS durationSec, cause_id " +
        "FROM stops ORDER BY `Jour` DESC, `Debut` DESC LIMIT 10"
    );

    console.log('Latest 10 stops:');
    rows.forEach(r => {
        console.log(`ID: ${r.id}, Day: ${r.day}, Start: ${r.startTime}, Stop: ${r.stopTime}, Durée: ${r.durationSec}`);
    });

    const [summaryRows] = await conn.execute(
        "SELECT `Jour` AS day, COUNT(*) AS cnt FROM stops GROUP BY `Jour` ORDER BY day DESC"
    );
    console.log('Summary Group By Results:', summaryRows);

    await conn.end();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
