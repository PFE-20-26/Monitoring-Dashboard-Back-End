import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cause } from './cause.entity';
import { CausesController } from './causes.controller';
import { CausesService } from './causes.service';

@Module({
    imports: [TypeOrmModule.forFeature([Cause])],
    controllers: [CausesController],
    providers: [CausesService],
})
export class CausesModule { }
