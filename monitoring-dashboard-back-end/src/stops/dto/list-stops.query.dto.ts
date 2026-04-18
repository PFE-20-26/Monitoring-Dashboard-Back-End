import { IsInt, IsOptional, IsString, Max, Min, Matches } from 'class-validator';
import { Type } from 'class-transformer';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class ListStopsQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    causeId?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(3)
    equipe?: number;

    @IsOptional()
    @IsString()
    @Matches(DATE_REGEX, { message: 'from must be YYYY-MM-DD' })
    from?: string;

    @IsOptional()
    @IsString()
    @Matches(DATE_REGEX, { message: 'to must be YYYY-MM-DD' })
    to?: string;
}
