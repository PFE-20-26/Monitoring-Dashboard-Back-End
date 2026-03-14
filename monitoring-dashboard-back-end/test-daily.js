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

        const durationExpr = `
      CASE
        WHEN s.\`Fin\` IS NULL THEN TIMESTAMPDIFF(
          SECOND,
          TIMESTAMP(s.\`Jour\`, s.\`Début\`),
          NOW()
        )
        ELSE IFNULL(s.\`Durée\`, 0)
      END
    `;

        const sql = `
      SELECT
        CAST(s.\`Jour\` AS CHAR) AS day,
        COUNT(*) AS stopsCount,
        SUM(${durationExpr}) AS totalDowntimeSeconds,
        SUM(
          CASE
            WHEN c.affect_trs = 1 THEN ${durationExpr}
            ELSE 0
          END
        ) AS trsDowntimeSeconds
      FROM stops s
      LEFT JOIN causes c ON c.id = s.cause_id
      GROUP BY CAST(s.\`Jour\` AS CHAR)
      ORDER BY day DESC
    `;

        const [rows] = await conn.execute(sql);
        console.log('Daily Summary Results:', JSON.stringify(rows, null, 2));

        await conn.end();
    } catch (err) {
        console.error('DATABASE_ERROR:', err.message);
    }
})();
