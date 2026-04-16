import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCauseDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(80)
    name!: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    description?: string;

    @IsBoolean()
    @IsNotEmpty()
    affectTRS!: boolean;

    @IsBoolean()
    @IsNotEmpty()
    isActive!: boolean;
}