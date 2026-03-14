import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

const decimalToNumber = {
    to: (v: number) => v,
    from: (v: string | number) => Number(v),
};

@Entity({ name: 'vitesse_entries' })
@Index('idx_vitesse_recorded_at', ['recordedAt'])
@Index('idx_vitesse_recorded_at_id', ['recordedAt', 'id'])
export class VitesseEntry {
    @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
    id!: string; // BIGINT => string côté Node (safe)

    @Column({ name: 'recorded_at', type: 'datetime' })
    recordedAt!: Date;

    @Column({
        name: 'speed',
        type: 'decimal',
        precision: 10,
        scale: 3,
        transformer: decimalToNumber,
    })
    speed!: number;

    // ✅ new schema: VARCHAR(40)
    @Column({ name: 'note', type: 'varchar', length: 40, nullable: true })
    note!: string | null;
}
