/**
 * migrate-stops-schema.js
 *
 * Safe, idempotent migration for the `stops` table.
 * Run with:  node migrate-stops-schema.js
 *
 * What it does (checks before each step — safe to re-run):
 *   1. Adds `Duree`    STORED generated column  (INT UNSIGNED)
 *   2. Adds `equipe`   STORED generated column  (TINYINT UNSIGNED)
 *   3. Adds `prod_day` STORED generated column  (DATE)
 *   4. Drops stale index `idx_summary_covering`  if it exists
 *   5. Creates `idx_covering`                   (prod_day, equipe, cause_id, Duree)
 *   6. Creates `idx_stops_day_equipe_start_time` (Jour, equipe, Debut)
 *   7. Creates `idx_stops_cause_id`              (cause_id)
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const cfg = {
    host:     process.env.DB_HOST     || 'localhost',
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'Dashboard',
    multipleStatements: false,
};

// ── helpers ──────────────────────────────────────────────────────────────────

async function columnExists(conn, table, column) {
    const [rows] = await conn.query(
        `SELECT COUNT(*) AS cnt
         FROM   information_schema.COLUMNS
         WHERE  TABLE_SCHEMA = DATABASE()
           AND  TABLE_NAME   = ?
           AND  COLUMN_NAME  = ?`,
        [table, column]
    );
    return rows[0].cnt > 0;
}

async function indexExists(conn, table, indexName) {
    const [rows] = await conn.query(
        `SELECT COUNT(*) AS cnt
         FROM   information_schema.STATISTICS
         WHERE  TABLE_SCHEMA = DATABASE()
           AND  TABLE_NAME   = ?
           AND  INDEX_NAME   = ?`,
        [table, indexName]
    );
    return rows[0].cnt > 0;
}

async function run(conn, label, sql) {
    process.stdout.write(`  → ${label} ... `);
    try {
        await conn.query(sql);
        console.log('✅ done');
    } catch (e) {
        console.log(`❌ FAILED\n     ${e.message}`);
        throw e;
    }
}

// ── main ─────────────────────────────────────────────────────────────────────

(async () => {
    const conn = await mysql.createConnection(cfg);
    console.log(`\n🔌 Connected to ${cfg.database}@${cfg.host}:${cfg.port}\n`);

    try {

        // ── 1. Duree (stored generated: midnight-crossing-safe duration in seconds) ──
        if (await columnExists(conn, 'stops', 'Duree')) {
            console.log('  ✓ Column `Duree` already exists — skipping');
        } else {
            await run(conn, 'ADD COLUMN `Duree` (stored generated)',
                `ALTER TABLE stops
                 ADD COLUMN \`Duree\` INT UNSIGNED GENERATED ALWAYS AS (
                     CASE
                         WHEN \`Fin\` IS NULL THEN NULL
                         WHEN \`Fin\` >= \`Debut\` THEN TIME_TO_SEC(\`Fin\`) - TIME_TO_SEC(\`Debut\`)
                         ELSE TIME_TO_SEC(\`Fin\`) + 86400 - TIME_TO_SEC(\`Debut\`)
                     END
                 ) STORED`
            );
        }

        // ── 2. equipe (stored generated: shift number 1/2/3 from Debut time) ────────
        if (await columnExists(conn, 'stops', 'equipe')) {
            console.log('  ✓ Column `equipe` already exists — skipping');
        } else {
            await run(conn, 'ADD COLUMN `equipe` (stored generated)',
                `ALTER TABLE stops
                 ADD COLUMN \`equipe\` TINYINT UNSIGNED GENERATED ALWAYS AS (
                     CASE
                         WHEN \`Debut\` >= '06:00:00' AND \`Debut\` < '14:00:00' THEN 1
                         WHEN \`Debut\` >= '14:00:00' AND \`Debut\` < '22:00:00' THEN 2
                         ELSE 3
                     END
                 ) STORED`
            );
        }

        // ── 3. prod_day (stored generated: production-day, Team3 rolls back 1 day) ──
        if (await columnExists(conn, 'stops', 'prod_day')) {
            console.log('  ✓ Column `prod_day` already exists — skipping');
        } else {
            await run(conn, 'ADD COLUMN `prod_day` (stored generated)',
                `ALTER TABLE stops
                 ADD COLUMN \`prod_day\` DATE GENERATED ALWAYS AS (
                     IF(\`Debut\` < '06:00:00', DATE_SUB(\`Jour\`, INTERVAL 1 DAY), \`Jour\`)
                 ) STORED`
            );
        }

        // ── 4. Drop stale index if it exists ─────────────────────────────────────────
        if (await indexExists(conn, 'stops', 'idx_summary_covering')) {
            await run(conn, 'DROP stale index `idx_summary_covering`',
                `ALTER TABLE stops DROP INDEX idx_summary_covering`
            );
        } else {
            console.log('  ✓ Stale index `idx_summary_covering` not present — skipping');
        }

        // ── 5. idx_covering — the primary performance index ───────────────────────────
        if (await indexExists(conn, 'stops', 'idx_covering')) {
            console.log('  ✓ Index `idx_covering` already exists — skipping');
        } else {
            await run(conn, 'CREATE INDEX `idx_covering` (prod_day, equipe, cause_id, Duree)',
                `ALTER TABLE stops
                 ADD INDEX idx_covering (prod_day, equipe, cause_id, Duree)`
            );
        }

        // ── 6. idx_stops_day_equipe_start_time — supports ORDER BY Debut detail view ─
        if (await indexExists(conn, 'stops', 'idx_stops_day_equipe_start_time')) {
            console.log('  ✓ Index `idx_stops_day_equipe_start_time` already exists — skipping');
        } else {
            await run(conn, 'CREATE INDEX `idx_stops_day_equipe_start_time` (Jour, equipe, Debut)',
                `ALTER TABLE stops
                 ADD INDEX idx_stops_day_equipe_start_time (Jour, equipe, Debut)`
            );
        }

        // ── 7. idx_stops_cause_id — supports FK lookups ───────────────────────────────
        if (await indexExists(conn, 'stops', 'idx_stops_cause_id')) {
            console.log('  ✓ Index `idx_stops_cause_id` already exists — skipping');
        } else {
            await run(conn, 'CREATE INDEX `idx_stops_cause_id` (cause_id)',
                `ALTER TABLE stops
                 ADD INDEX idx_stops_cause_id (cause_id)`
            );
        }

        // ── Verification: show final schema ──────────────────────────────────────────
        console.log('\n📋 Final column list for `stops`:');
        const [cols] = await conn.query(
            `SELECT COLUMN_NAME, COLUMN_TYPE, EXTRA
             FROM   information_schema.COLUMNS
             WHERE  TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stops'
             ORDER  BY ORDINAL_POSITION`
        );
        cols.forEach(c => console.log(`     ${c.COLUMN_NAME.padEnd(12)} ${c.COLUMN_TYPE.padEnd(20)} ${c.EXTRA}`));

        console.log('\n📋 Final indexes for `stops`:');
        const [idxs] = await conn.query(
            `SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
             FROM   information_schema.STATISTICS
             WHERE  TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stops'
             GROUP  BY INDEX_NAME`
        );
        idxs.forEach(i => console.log(`     ${i.INDEX_NAME.padEnd(35)} (${i.cols})`));

        console.log('\n✅ Migration complete — restart your NestJS server now.\n');

    } finally {
        await conn.end();
    }
})().catch(err => {
    console.error('\n💥 Migration failed:', err.message);
    process.exit(1);
});
