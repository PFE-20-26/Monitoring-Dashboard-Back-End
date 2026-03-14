require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        const fromDay = '2026-02-13';
        const toDay = '2026-02-13';

        const sql = `
      SELECT
        c.id AS causeId,
        c.name AS causeName,
        SUM(
          CASE
            WHEN s.id IS NULL THEN 0
            WHEN s.\`Fin\` IS NULL THEN TIMESTAMPDIFF(
              SECOND,
              TIMESTAMP(s.\`Jour\`, s.\`Début\`),
              NOW()
            )
            ELSE IFNULL(s.\`Durée\`, 0)
          END
        ) AS totalDowntimeSeconds
      FROM causes c
      LEFT JOIN stops s
        ON s.cause_id = c.id
       AND s.\`Jour\` >= ?
       AND s.\`Jour\` <= ?
      GROUP BY c.id, c.name
      ORDER BY totalDowntimeSeconds DESC
    `;

        const [rows] = await conn.execute(sql, [fromDay, toDay]);
        console.log('Results:', rows);

        await conn.end();
    } catch (err) {
        console.error(err);
    }
})();
