import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetrageEntry } from './metrage.entity';
import { CreateMetrageDto } from './dto/create-metrage.dto';
import { MetrageRangeQueryDto } from './dto/metrage-range.query.dto';

function startOfDay(date: string) {
    return `${date} 00:00:00`;
}
function endOfDay(date: string) {
    return `${date} 23:59:59`;
}

@Injectable()
export class MetrageService {
    constructor(
        @InjectRepository(MetrageEntry)
        private readonly repo: Repository<MetrageEntry>,
    ) { }

    async create(dto: CreateMetrageDto) {
        if (dto.meters < 0) {
            throw new BadRequestException('meters must be >= 0');
        }

        const note = dto.note?.trim() || null;
        if (note && note.length > 40) {
            throw new BadRequestException('note must be <= 40 characters');
        }

        const entry = this.repo.create({
            recordedAt: dto.recordedAt ?? new Date(),
            meters: dto.meters,
            note,
        });

        return this.repo.save(entry);
    }

    private applyRange(qb: any, query: MetrageRangeQueryDto) {
        if (query.from) qb.andWhere('m.recordedAt >= :from', { from: startOfDay(query.from) });
        if (query.to) qb.andWhere('m.recordedAt <= :to', { to: endOfDay(query.to) });

        if (query.from && query.to && query.from > query.to) {
            throw new BadRequestException('from must be <= to');
        }
    }

    async getDailySeries(query: MetrageRangeQueryDto) {
        const qb = this.repo
            .createQueryBuilder('m')
            .select('CAST(DATE(m.recordedAt) AS CHAR)', 'day')
            .addSelect('ROUND(SUM(m.meters), 3)', 'totalMeters')
            .groupBy('day')
            .orderBy('day', 'ASC');

        this.applyRange(qb, query);

        const rows = await qb.getRawMany<{ day: string; totalMeters: string | number }>();

        return rows.map((r) => ({
            day: r.day,
            totalMeters: Number(r.totalMeters ?? 0),
        }));
    }

    async getTotal(query: MetrageRangeQueryDto) {
        const qb = this.repo
            .createQueryBuilder('m')
            .select('ROUND(COALESCE(SUM(m.meters), 0), 3)', 'totalMeters');

        this.applyRange(qb, query);

        const row = await qb.getRawOne<{ totalMeters: string | number }>();

        return {
            from: query.from ?? null,
            to: query.to ?? null,
            totalMeters: Number(row?.totalMeters ?? 0),
        };
    }
}
