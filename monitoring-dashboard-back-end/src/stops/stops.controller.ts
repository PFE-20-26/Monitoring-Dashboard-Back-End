// stops.controller.ts
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { StopsService } from './stops.service';
import { CreateStopDto } from './dto/create-stop.dto';
import { ListStopsQueryDto } from './dto/list-stops.query.dto';

@Controller('stops')
export class StopsController {
    constructor(private readonly stopsService: StopsService) { }

    @Get()
    findAll(@Query() query: ListStopsQueryDto) {
        return this.stopsService.findAll(query);
    }

    @Get('analytics/downtime')
    getDowntimeAnalytics(@Query() query: ListStopsQueryDto) {
        return this.stopsService.getDowntimeAnalytics(query);
    }

    @Get('analytics/daily')
    getDailyStops(@Query() query: ListStopsQueryDto) {
        return this.stopsService.getDailyStopsSummary(query);
    }

    @Post()
    create(@Body() dto: CreateStopDto) {
        return this.stopsService.create(dto);
    }
}
