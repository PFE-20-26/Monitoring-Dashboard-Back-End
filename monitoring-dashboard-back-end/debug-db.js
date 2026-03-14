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

    const day = '2026-02-13';

    // 1) Stops for a given day (new schema: Jour + Début/Fin)
    const [rows] = await conn.execute(
        "SELECT id, `Jour` AS day, `Debut` AS startTime, `Fin` AS stopTime, `Duree` AS durationSec, cause_id, equipe " +
        "FROM stops WHERE `Jour` = ? ORDER BY `Debut` ASC",
        [day]
    );

    console.log(`Found ${rows.length} stops where Jour='${day}'`);
    if (rows.length > 0) console.log('Sample row:', rows[0]);

    // 2) Equivalent "range" by day
    const [rangeRows] = await conn.execute(
        "SELECT id FROM stops WHERE `Jour` >= ? AND `Jour` <= ?",
        [day, day]
    );
    console.log(`Found ${rangeRows.length} stops via Jour range ${day}..${day}`);

    // 3) Diagnostic timezone info (optional)
    const [timeRows] = await conn.execute(
        "SELECT NOW() AS now, @@global.time_zone AS global_tz, @@session.time_zone AS session_tz"
    );
    console.log('DB Timezone info:', timeRows[0]);

    await conn.end();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
