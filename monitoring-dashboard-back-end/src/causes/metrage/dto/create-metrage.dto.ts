import { Transform, Type } from 'class-transformer';
import { IsDate, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateMetrageDto {
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    recordedAt?: Date;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    meters!: number;

    @IsOptional()
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @MaxLength(40)
    note?: string;
}
