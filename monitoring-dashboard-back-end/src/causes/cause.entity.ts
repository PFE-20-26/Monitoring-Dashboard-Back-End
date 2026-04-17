import { Column, Entity, PrimaryGeneratedColumn, ValueTransformer } from 'typeorm';


const tinyintBoolean: ValueTransformer = {
    to: (value: boolean) => (value ? 1 : 0),
    from: (value: any) => value === 1 || value === true || value === '1',
};// bch ytransferi les boolean 

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
