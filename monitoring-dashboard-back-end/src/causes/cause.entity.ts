import { Column, Entity, PrimaryGeneratedColumn, ValueTransformer } from 'typeorm';

// MySQL stores BOOLEAN as TINYINT(1). This transformer guarantees
// we always expose boolean values in the app layer.
const tinyintBoolean: ValueTransformer = {
    to: (value: boolean) => (value ? 1 : 0),
    from: (value: any) => value === 1 || value === true || value === '1',
};

@Entity('causes')
export class Cause {
    @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
    id: number;

    @Column({ type: 'varchar', length: 80 })
    name: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    description: string | null;

    @Column({ name: 'affect_trs', type: 'tinyint', width: 1, transformer: tinyintBoolean })
    affectTRS: boolean;

    @Column({ name: 'is_active', type: 'tinyint', width: 1, transformer: tinyintBoolean })
    isActive: boolean;
}
