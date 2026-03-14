import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cause } from '../causes/cause.entity';
import { StopEntity } from './stop.entity';
import { CreateStopDto } from './dto/create-stop.dto';
import { ListStopsQueryDto } from './dto/list-stops.query.dto';
import { UpdateStopDto } from './dto/update-stop.dto';

const MICRO_STOP_SECONDS = 30;      // < 30s => micro-stop
const DEFAULT_CAUSE_ID = 1;         // default (for now)
const NON_CONSIDERED_CAUSE_ID = 16; // Arrêt non considéré

const SHIFT_SECONDS = 8 * 3600;

function timeToSeconds(t: string): number {
    // expects HH:mm:ss
    const [hh, mm, ss] = t.split(':').map((x) => Number(x));
    return hh * 3600 + mm * 60 + ss;
}

function diffTimeSeconds(start: string, end: string): number {
    // supports crossing midnight: if end < start => +86400
    const s = timeToSeconds(start);
    const e = timeToSeconds(end);
    let d = e - s;
    if (d < 0) d += 86400;
    return d;
}

@Injectable()
export class StopsService {
    constructor(
        @InjectRepository(StopEntity)
        private readonly stopRepo: Repository<StopEntity>,

        @InjectRepository(Cause)
        private readonly causeRepo: Repository<Cause>,
    ) { }

    private async assertCauseExists(causeId: number) {
        const cause = await this.causeRepo.findOne({ where: { id: causeId } });
        if (!cause) {
            throw new BadRequestException(
                `Unknown causeId "${causeId}". Insert it first in causes table.`,
            );
        }
        return cause;
    }

    async create(dto: CreateStopDto) {
        const stopTime = dto.stopTime ?? null;

        const durationSec =
            stopTime !== null ? diffTimeSeconds(dto.startTime, stopTime) : null;

        const isMicro = durationSec !== null && durationSec < MICRO_STOP_SECONDS;

        const effectiveCauseId = isMicro
            ? NON_CONSIDERED_CAUSE_ID
            : (dto.causeId ?? DEFAULT_CAUSE_ID);

        await this.assertCauseExists(effectiveCauseId);

        const stop = this.stopRepo.create({
            day: dto.day,
            startTime: dto.startTime,
            stopTime,
            causeId: effectiveCauseId,
        });

        return this.stopRepo.save(stop);
    }

    async findAll(query: ListStopsQueryDto) {
        const page = Number(query.page) || 1;
        const limit = Math.min(Number(query.limit) || 5, 100);

        const from = query.from?.trim();
        const to = query.to?.trim();
        const equipe = query.equipe;
        const causeId = query.causeId;

        if (from && to && from > to) {
            throw new BadRequestException('"from" must be <= "to"');
        }

        // Subquery pour le total de la durée du même jour
        const percentageSubquery = `
        ROUND(
            s.\`Duree\` * 100.0 / NULLIF(
                (SELECT SUM(s2.\`Duree\`) FROM stops s2 WHERE s2.\`Jour\` = s.\`Jour\`),
            0),
        2)
    `;

        const qb = this.stopRepo
            .createQueryBuilder('s')
            .leftJoinAndSelect('s.cause', 'c')
            .addSelect(percentageSubquery, 'pourcentage')
            .orderBy('s.day', 'DESC')
            .addOrderBy('s.startTime', 'DESC')
            .addOrderBy('s.id', 'DESC')
            .take(limit)
            .skip((page - 1) * limit);

        if (causeId) qb.andWhere('s.causeId = :causeId', { causeId });
        if (equipe) qb.andWhere('s.equipe = :equipe', { equipe });
        if (from) qb.andWhere('s.day >= :from', { from });
        if (to) qb.andWhere('s.day <= :to', { to });

        const { raw, entities } = await qb.getRawAndEntities();
        const total = await qb.getCount();

        const items = entities.map((s, i) => ({
            id: s.id,
            day: s.day,
            startTime: s.startTime,
            stopTime: s.stopTime,
            durationSeconds: s.durationSeconds,
            equipe: s.equipe,
            causeId: s.causeId,
            causeName: s.cause?.name ?? 'Unnamed',
            'impact trs': s.cause?.affectTRS ? 1 : 0,
            '%': raw[i]?.pourcentage !== undefined
                ? Number(raw[i].pourcentage)
                : null,
        }));

        return { items, total, page, limit };
    }

    async findOne(id: string) {
        const stop = await this.stopRepo
            .createQueryBuilder('s')
            .leftJoinAndSelect('s.cause', 'c')
            .where('s.id = :id', { id })
            .getOne();

        if (!stop) throw new NotFoundException(`Stop id=${id} not found`);
        return stop;
    }

    async update(id: string, dto: UpdateStopDto) {
        const stop = await this.stopRepo.findOne({ where: { id } });
        if (!stop) throw new NotFoundException(`Stop id=${id} not found`);

        if (dto.day !== undefined) stop.day = dto.day;
        if (dto.startTime !== undefined) stop.startTime = dto.startTime;
        if (dto.stopTime !== undefined) stop.stopTime = dto.stopTime ?? null;

        // Decide cause logic AFTER applying time updates
        const durationSec =
            stop.stopTime !== null ? diffTimeSeconds(stop.startTime, stop.stopTime) : null;

        const isMicro = durationSec !== null && durationSec < MICRO_STOP_SECONDS;

        if (isMicro) {
            // Always override
            stop.causeId = NON_CONSIDERED_CAUSE_ID;
            await this.assertCauseExists(stop.causeId);
        } else {
            // Non micro-stop: apply provided causeId if present, otherwise keep existing
            if (dto.causeId !== undefined) {
                const cid = dto.causeId || DEFAULT_CAUSE_ID;
                await this.assertCauseExists(cid);
                stop.causeId = cid;
            }
            // If somehow causeId is invalid/empty, enforce default
            if (!stop.causeId || stop.causeId <= 0) {
                stop.causeId = DEFAULT_CAUSE_ID;
                await this.assertCauseExists(stop.causeId);
            }
        }

        return this.stopRepo.save(stop);
    }

    // ✅ Downtime per cause (period + equipe filter)
    // stops.service.ts (nouvelle version downtime qui retourne TOUTES les causes)
    async getDowntimeAnalytics(query: { from?: string; to?: string; equipe?: number } = {}) {
        const from = query.from?.trim();
        const to = query.to?.trim();
        const equipe = query.equipe;

        if (from && to && from > to) {
            throw new BadRequestException('"from" must be <= "to"');
        }

        // Durée d'une ligne stop (gère "Fin" NULL => arrêt en cours)
        const durationExpr = `
    CASE
      WHEN s.\`Fin\` IS NULL THEN TIMESTAMPDIFF(
        SECOND,
        TIMESTAMP(s.\`Jour\`, s.\`Debut\`),
        NOW()
      )
      ELSE IFNULL(s.\`Duree\`, 0)
    END
  `;

        // LEFT JOIN condition (filtrage dans le ON pour garder toutes les causes)
        let joinCond = 's.cause_id = c.id';
        const params: Record<string, any> = {};

        if (equipe) {
            joinCond += ' AND s.equipe = :equipe';
            params.equipe = equipe;
        }
        if (from) {
            joinCond += ' AND s.`Jour` >= :from';
            params.from = from;
        }
        if (to) {
            joinCond += ' AND s.`Jour` <= :to';
            params.to = to;
        }

        const rows = await this.causeRepo
            .createQueryBuilder('c')
            .leftJoin(StopEntity, 's', joinCond, params)
            .select('c.id', 'causeId')
            .addSelect('c.name', 'causeName')
            .addSelect(`COALESCE(SUM(${durationExpr}), 0)`, 'totalDowntimeSeconds')
            .groupBy('c.id')
            .addGroupBy('c.name')
            .orderBy('totalDowntimeSeconds', 'DESC')
            .getRawMany();

        return rows.map((r) => ({
            causeId: Number(r.causeId),
            causeName: r.causeName || 'Unnamed',
            totalDowntimeSeconds: Number(r.totalDowntimeSeconds || 0),
        }));
    }

    // ✅ Daily summary
    async getDailyStopsSummary(
        query: Pick<ListStopsQueryDto, 'from' | 'to' | 'equipe'> = {},
    ) {
        const from = query.from?.trim();
        const to = query.to?.trim();
        const equipe = query.equipe;

        if (from && to && from > to) {
            throw new BadRequestException('"from" must be <= "to"');
        }

        const durationValueExpr = `
      CASE
        WHEN s.\`Fin\` IS NULL THEN TIMESTAMPDIFF(SECOND, TIMESTAMP(s.\`Jour\`, s.\`Debut\`), NOW())
        ELSE IFNULL(s.\`Duree\`, 0)
      END
    `;

        const qb = this.stopRepo
            .createQueryBuilder('s')
            .leftJoin('s.cause', 'c')
            .select('s.day', 'day')
            .addSelect('COUNT(*)', 'stopsCount')
            .addSelect(`SUM(${durationValueExpr})`, 'totalDowntimeSeconds')
            .addSelect(
                `SUM(CASE WHEN c.affect_trs = 1 THEN ${durationValueExpr} ELSE 0 END)`,
                'trsDowntimeSeconds',
            )
            .where('1=1')
            .groupBy('s.day')
            .orderBy('day', 'DESC');

        if (equipe) qb.andWhere('s.equipe = :equipe', { equipe });
        if (from) qb.andWhere('s.day >= :from', { from });
        if (to) qb.andWhere('s.day <= :to', { to });

        const rows = await qb.getRawMany<{
            day: string;
            stopsCount: string | number;
            totalDowntimeSeconds: string | number;
            trsDowntimeSeconds: string | number;
        }>();

        const maxSeconds = SHIFT_SECONDS * (equipe ? 1 : 3);

        return rows.map((r) => {
            const downtime = Number(r.totalDowntimeSeconds ?? 0);
            const cappedDowntime = Math.max(0, Math.min(downtime, maxSeconds));
            const workSeconds = maxSeconds - cappedDowntime;

            const dayStr = typeof r.day === 'string'
                ? r.day
                : new Date(r.day).toISOString().slice(0, 10);

            return {
                day: dayStr,
                totalDowntimeSeconds: cappedDowntime,
                trsDowntimeSeconds: Number(r.trsDowntimeSeconds ?? 0),
                totalWorkSeconds: workSeconds,
                stopsCount: Number(r.stopsCount ?? 0),
            };
        });
    }
}
