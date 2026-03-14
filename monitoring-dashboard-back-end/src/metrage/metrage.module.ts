import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetrageEntry } from './metrage.entity';
import { MetrageController } from './metrage.controller';
import { MetrageService } from './metrage.service';

@Module({
    imports: [TypeOrmModule.forFeature([MetrageEntry])],
    controllers: [MetrageController],
    providers: [MetrageService],
})
export class MetrageModule { }
