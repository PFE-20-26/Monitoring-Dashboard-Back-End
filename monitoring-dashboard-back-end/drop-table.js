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

connection.query('DROP TABLE IF EXISTS causes', function (error, results, fields) {
    if (error) throw error;
    console.log('Table causes dropped successfully.');
});

connection.end();
