import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CreateVitesseDto } from './dto/create-vitesse.dto';
import { ListVitesseQueryDto } from './dto/list-vitesse.query.dto';
import { VitesseRangeQueryDto } from './dto/vitesse-range.query.dto';
import { VitesseService } from './vitesse.service';

@Controller('vitesse')
export class VitesseController {
    constructor(private readonly service: VitesseService) { }

    @Post()
    create(@Body() dto: CreateVitesseDto) {
        return this.service.create(dto);
    }

    @Get()
    list(@Query() query: ListVitesseQueryDto) {
        return this.service.list(query);
    }

    @Get('daily')
    daily(@Query() query: VitesseRangeQueryDto) {
        return this.service.getDailySeries(query);
    }

    @Get('summary')
    summary(@Query() query: VitesseRangeQueryDto) {
        return this.service.getSummary(query);
    }
}
