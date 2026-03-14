import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CreateMetrageDto } from './dto/create-metrage.dto';
import { MetrageRangeQueryDto } from './dto/metrage-range.query.dto';
import { MetrageService } from './metrage.service';

@Controller('metrage')
export class MetrageController {
    constructor(private readonly service: MetrageService) { }

    // Courbe journalière
    @Get('daily')
    daily(@Query() query: MetrageRangeQueryDto) {
        return this.service.getDailySeries(query);
    }

    // Total sur période (affichage en haut)
    @Get('total')
    total(@Query() query: MetrageRangeQueryDto) {
        return this.service.getTotal(query);
    }

    // Insert manuel (pour tests)
    @Post()
    create(@Body() dto: CreateMetrageDto) {
        return this.service.create(dto);
    }
}
