import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateVitesseDto } from './dto/create-vitesse.dto';
import { ListVitesseQueryDto } from './dto/list-vitesse.query.dto';
import { VitesseRangeQueryDto } from './dto/vitesse-range.query.dto';
import { VitesseEntry } from './vitesse.entity';

function startOfDay(date: string) {
    return `${date} 00:00:00`;
}
function endOfDay(date: string) {
    return `${date} 23:59:59`;
}

@Injectable()
export class VitesseService {
    constructor(
        @InjectRepository(VitesseEntry)
        private readonly repo: Repository<VitesseEntry>,
    ) { }

    private applyRange(qb: any, query: VitesseRangeQueryDto) {
        if (query.from) qb.andWhere('v.recordedAt >= :from', { from: startOfDay(query.from) });
        if (query.to) qb.andWhere('v.recordedAt <= :to', { to: endOfDay(query.to) });

        if (query.from && query.to && query.from > query.to) {
            throw new BadRequestException('from must be <= to');
        }
    }

    async create(dto: CreateVitesseDto) {
        if (dto.speed < 0) throw new BadRequestException('speed must be >= 0');

        const note = dto.note?.trim() || null;
        if (note && note.length > 40) {
            throw new BadRequestException('note must be <= 40 characters');
        }

        const entry = this.repo.create({
            recordedAt: dto.recordedAt ?? new Date(),
            speed: dto.speed,
            note,
        });

        return this.repo.save(entry);
    }

    async list(query: ListVitesseQueryDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 50;

        const qb = this.repo
            .createQueryBuilder('v')
            .orderBy('v.recordedAt', 'DESC')
            .addOrderBy('v.id', 'DESC')
            .limit(limit)
            .offset((page - 1) * limit);

        this.applyRange(qb, query);

        const [items, total] = await qb.getManyAndCount();
        return { items, total, page, limit };
    }

    async getDailySeries(query: VitesseRangeQueryDto) {
        const qb = this.repo
            .createQueryBuilder('v')
            .select('CAST(DATE(v.recordedAt) AS CHAR)', 'day')
            .addSelect('ROUND(AVG(v.speed), 3)', 'avgSpeed')
            .addSelect('ROUND(MAX(v.speed), 3)', 'maxSpeed')
            .addSelect('COUNT(*)', 'samples')
            .groupBy('day')
            .orderBy('day', 'ASC');

        this.applyRange(qb, query);

        const rows = await qb.getRawMany<{
            day: string;
            avgSpeed: string | number;
            maxSpeed: string | number;
            samples: string | number;
        }>();

        return rows.map((r) => ({
            day: r.day,
            avgSpeed: Number(r.avgSpeed ?? 0),
            maxSpeed: Number(r.maxSpeed ?? 0),
            samples: Number(r.samples ?? 0),
        }));
    }

    async getSummary(query: VitesseRangeQueryDto) {
        const qb = this.repo
            .createQueryBuilder('v')
            .select('ROUND(COALESCE(AVG(v.speed), 0), 3)', 'avgSpeed')
            .addSelect('ROUND(COALESCE(MAX(v.speed), 0), 3)', 'maxSpeed')
            .addSelect('COUNT(*)', 'samples');

        this.applyRange(qb, query);

        const row = await qb.getRawOne<{ avgSpeed: any; maxSpeed: any; samples: any }>();

        return {
            from: query.from ?? null,
            to: query.to ?? null,
            avgSpeed: Number(row?.avgSpeed ?? 0),
            maxSpeed: Number(row?.maxSpeed ?? 0),
            samples: Number(row?.samples ?? 0),
        };
    }
}
