import { IsOptional, IsString, Matches } from 'class-validator';

export class MetrageRangeQueryDto {
    @IsOptional()
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    from?: string; // YYYY-MM-DD

    @IsOptional()
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    to?: string; // YYYY-MM-DD
}
