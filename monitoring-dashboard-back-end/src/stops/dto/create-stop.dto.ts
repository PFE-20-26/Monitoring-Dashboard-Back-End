import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HHMM_OR_HHMMSS = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const TIME_HHMMSS = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

function normalizeTime(value: any): any {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  if (!TIME_HHMM_OR_HHMMSS.test(v)) return v;
  // If "HH:mm" -> "HH:mm:00"
  if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v)) return `${v}:00`;
  return v; // already HH:mm:ss
}

export class CreateStopDto {
  @IsString()
  @Matches(DATE_REGEX, { message: 'day must be YYYY-MM-DD' })
  day!: string;

  @Transform(({ value }) => normalizeTime(value))
  @IsString()
  @Matches(TIME_HHMMSS, { message: 'startTime must be HH:mm or HH:mm:ss' })
  startTime!: string;

  @IsOptional()
  @Transform(({ value }) => normalizeTime(value))
  @IsString()
  @Matches(TIME_HHMMSS, { message: 'stopTime must be HH:mm or HH:mm:ss' })
  stopTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  causeId?: number;
}
