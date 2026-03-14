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
        const [rows] = await conn.execute('SELECT COUNT(*) as count FROM causes');
        console.log('Count:', rows[0].count);
        await conn.end();
    } catch (err) {
        console.error(err);
    }
})();
