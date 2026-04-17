import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export function toBool(value: unknown): boolean | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    const s = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(s)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(s)) return false;
    return undefined;
}

export class ListCausesQueryDto {
    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @Transform(({ value }) => toBool(value))
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @Transform(({ value }) => toBool(value))
    @IsBoolean()
    affectTRS?: boolean;

}
