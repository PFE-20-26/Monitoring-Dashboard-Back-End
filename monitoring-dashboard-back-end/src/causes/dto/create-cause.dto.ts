import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

function toBool(value: any): boolean | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y', 'on'].includes(v)) return true;
        if (['false', '0', 'no', 'n', 'off'].includes(v)) return false;
    }
    return undefined;
}

export class CreateCauseDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(80)
    name!: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    description?: string;

    // Required (DB columns are NOT NULL and there are no DEFAULTs)
    @Transform(({ value }) => toBool(value))
    @IsBoolean()
    affectTRS!: boolean;

    // Required (DB columns are NOT NULL and there are no DEFAULTs)
    @Transform(({ value }) => toBool(value))
    @IsBoolean()
    isActive!: boolean;
}
