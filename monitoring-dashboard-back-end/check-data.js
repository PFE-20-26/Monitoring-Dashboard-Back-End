require('dotenv').config();
const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

connection.connect();

connection.query(
    "SELECT id, name, description, " +
    "CAST(affect_trs AS SIGNED) AS raw_trs, " +
    "CAST(is_active AS SIGNED) AS raw_active " +
    "FROM causes ORDER BY id",
    function (error, results) {
        if (error) throw error;
        console.log(JSON.stringify(results, null, 2));
        connection.end();
    }
);
