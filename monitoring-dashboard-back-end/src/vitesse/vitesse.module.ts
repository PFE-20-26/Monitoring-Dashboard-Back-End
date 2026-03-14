import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VitesseEntry } from './vitesse.entity';
import { VitesseController } from './vitesse.controller';
import { VitesseService } from './vitesse.service';

@Module({
    imports: [TypeOrmModule.forFeature([VitesseEntry])],
    controllers: [VitesseController],
    providers: [VitesseService],
})
export class VitesseModule { }
