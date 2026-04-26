// stop.entity.ts
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Cause } from '../causes/cause.entity';

@Entity({ name: 'stops' })
@Index('idx_stops_day_start_time', ['day', 'startTime'])
@Index('idx_stops_day_equipe_start_time', ['day', 'equipe', 'startTime'])
@Index('idx_stops_cause_id', ['causeId'])
@Index('idx_stops_stop_time', ['stopTime'])
@Index('idx_stops_Duree', ['durationSeconds'])
export class StopEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  // DB column: `Jour` DATE
  @Column({ name: 'Jour', type: 'date' })
  day!: string; // 'YYYY-MM-DD'

  // DB column: `Debut` TIME
  @Column({ name: 'Debut', type: 'time' })
  startTime!: string; // 'HH:mm:ss'

  // DB column: `Fin` TIME NULL
  @Column({ name: 'Fin', type: 'time', nullable: true })
  stopTime!: string | null; // 'HH:mm:ss' | null

  // DB column: `Durée` GENERATED STORED (seconds)
  @Column({
    name: 'Duree',
    type: 'int',
    unsigned: true,
    nullable: true,
    insert: false,
    update: false,
    // Optional: reflect the DB generated expression (helps if you use synchronize/migrations)
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

  // DB column: cause_id INT UNSIGNED NOT NULL (FK)
  @Column({ name: 'cause_id', type: 'int', unsigned: true })
  causeId!: number;

  // DB column: equipe GENERATED STORED
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
