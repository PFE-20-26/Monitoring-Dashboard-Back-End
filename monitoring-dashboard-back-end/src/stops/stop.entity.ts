// stop.entity.ts
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Cause } from '../causes/cause.entity';

/**
 * NOTE: app.module.ts uses synchronize: false.
 * The indexes declared here are for documentation and type-safety only.
 * You must create them manually in MySQL — run the DDL block below once:
 *
 *   -- The covering index the optimised query depends on:
 *   CREATE INDEX idx_covering
 *       ON stops (prod_day, equipe, cause_id, Duree);
 *
 *   -- Drop the old idx_summary_covering reference if it existed:
 *   -- DROP INDEX idx_summary_covering ON stops;
 *
 * The four columns (prod_day, equipe, cause_id, Duree) are all stored
 * generated columns, so MySQL builds the index from already-computed values —
 * no runtime expression cost.
 *
 * Column order rationale:
 *   prod_day  — leading column, used in WHERE range filters and GROUP BY
 *   equipe    — second, used in WHERE and GROUP BY partition
 *   cause_id  — third, used in the JOIN to causes and optional WHERE filter
 *   Duree     — fourth, included so SUM(Duree) is served without touching
 *               the main table rows (covering index = zero heap access)
 */

@Entity({ name: 'stops' })

// ── Covering index — the primary performance index for all analytical queries ──
// Covers: WHERE prod_day / equipe / cause_id range; GROUP BY prod_day, equipe;
// JOIN causes ON cause_id; SUM(Duree).  No heap access needed for any query
// that only reads these four columns.
@Index('idx_covering', ['prodDay', 'equipe', 'causeId', 'durationSeconds'])

// ── Supporting indexes ─────────────────────────────────────────────────────────
// Used for ORDER BY Debut on the per-day detail view and for ad-hoc lookups.
@Index('idx_stops_day_equipe_start_time', ['day', 'equipe', 'startTime'])
@Index('idx_stops_cause_id', ['causeId'])

export class StopEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  // DB column: `Jour` DATE — the raw calendar date entered by the machine controller
  @Column({ name: 'Jour', type: 'date' })
  day!: string; // 'YYYY-MM-DD'

  // DB column: `Debut` TIME — start of the stop event
  @Column({ name: 'Debut', type: 'time' })
  startTime!: string; // 'HH:mm:ss'

  // DB column: `Fin` TIME NULL — end of the stop event (null = ongoing)
  @Column({ name: 'Fin', type: 'time', nullable: true })
  stopTime!: string | null; // 'HH:mm:ss' | null

  /**
   * DB column: `Duree` INT GENERATED ALWAYS AS (...) STORED
   *
   * Computed once at INSERT time.  No runtime CASE/TIME_TO_SEC overhead at
   * query time — this is the Write-Once-Read-Many principle applied at the
   * schema level.
   *
   * Expression:
   *   NULL          when Fin IS NULL (ongoing stop)
   *   Fin - Debut   when Fin >= Debut (same-day stop)
   *   Fin + 86400 - Debut  when Fin < Debut (overnight stop crossing midnight)
   */
  @Column({
    name: 'Duree',
    type: 'int',
    unsigned: true,
    nullable: true,
    insert: false,
    update: false,
    asExpression: `(
      CASE
        WHEN \`Fin\` IS NULL THEN NULL
        WHEN \`Fin\` >= \`Debut\` THEN TIME_TO_SEC(\`Fin\`) - TIME_TO_SEC(\`Debut\`)
        ELSE TIME_TO_SEC(\`Fin\`) + 86400 - TIME_TO_SEC(\`Debut\`)
      END
    )`,
    generatedType: 'STORED',
  })
  durationSeconds!: number | null;

  // DB column: cause_id INT UNSIGNED NOT NULL (FK → causes.id)
  @Column({ name: 'cause_id', type: 'int', unsigned: true })
  causeId!: number;

  /**
   * DB column: `equipe` TINYINT GENERATED ALWAYS AS (...) STORED
   *
   * Shift assignment — computed at INSERT time from Debut:
   *   1 → 06:00–14:00 (Team 1)
   *   2 → 14:00–22:00 (Team 2)
   *   3 → 22:00–06:00 (Team 3, overnight)
   */
  @Column({
    name: 'equipe',
    type: 'tinyint',
    unsigned: true,
    insert: false,
    update: false,
    asExpression: `(
      CASE
        WHEN \`Debut\` >= '06:00:00' AND \`Debut\` < '14:00:00' THEN 1
        WHEN \`Debut\` >= '14:00:00' AND \`Debut\` < '22:00:00' THEN 2
        ELSE 3
      END
    )`,
    generatedType: 'STORED',
  })
  equipe!: number;

  /**
   * DB column: `prod_day` DATE GENERATED ALWAYS AS (...) STORED
   *
   * The "production day" — differs from `Jour` for Team 3 stops that begin
   * before 06:00: those belong to the previous calendar day's Team 3 shift.
   *
   * Expression:
   *   IF(Debut < '06:00:00', Jour - 1 day, Jour)
   *
   * This column is the leading key of idx_covering, so all date-range
   * WHERE filters are fully sargable — no DATE_FORMAT() or function wrapping.
   */
  @Column({
    name: 'prod_day',
    type: 'date',
    insert: false,
    update: false,
    asExpression: `(IF(\`Debut\` < '06:00:00', DATE_SUB(\`Jour\`, INTERVAL 1 DAY), \`Jour\`))`,
    generatedType: 'STORED',
  })
  prodDay!: string;

  @ManyToOne(() => Cause, { eager: false })
  @JoinColumn({ name: 'cause_id', referencedColumnName: 'id' })
  cause?: Cause;
}