import { Controller, Get, Post, Body, Patch, Param, Query, ParseIntPipe } from '@nestjs/common';
import { CausesService } from './causes.service';
import { CreateCauseDto } from './dto/create-cause.dto';
import { UpdateCauseDto } from './dto/update-cause.dto';
import { ListCausesQueryDto } from './dto/list-causes.query.dto';

@Controller('causes')
export class CausesController {
    constructor(private readonly causesService: CausesService) { }

    @Post()
    create(@Body() createCauseDto: CreateCauseDto) {
        return this.causesService.create(createCauseDto);
    }

    @Get()
    findAll(@Query() query: ListCausesQueryDto) {
        return this.causesService.findAll(query);
    }

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.causesService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() updateCauseDto: UpdateCauseDto) {
        return this.causesService.update(id, updateCauseDto);
    }
}
