import { PartialType } from '@nestjs/mapped-types';
import { CreateStopDto } from './create-stop.dto';

export class UpdateStopDto extends PartialType(CreateStopDto) { }
