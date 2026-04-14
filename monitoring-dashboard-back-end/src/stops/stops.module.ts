import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cause } from '../causes/cause.entity';
import { StopEntity } from './stop.entity';
import { StopsController } from './stops.controller';
import { StopsService } from './stops.service';

@Module({
    // DataSource is provided globally by TypeOrmModule.forRootAsync() in AppModule
    // — no need to import it here, NestJS DI resolves it automatically
    imports: [TypeOrmModule.forFeature([StopEntity, Cause])],
    controllers: [StopsController],
    providers: [StopsService],
})
export class StopsModule { }