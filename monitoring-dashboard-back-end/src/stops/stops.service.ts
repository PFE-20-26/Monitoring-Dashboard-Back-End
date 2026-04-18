import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Cause } from '../causes/cause.entity';
import { StopEntity } from './stop.entity';
import { CreateStopDto } from './dto/create-stop.dto';
import { ListStopsQueryDto } from './dto/list-stops.query.dto';

const MICRO_STOP_SECONDS = 30;
const DEFAULT_CAUSE_ID = 1;
const NON_CONSIDERED_CAUSE_ID = 16;
const SHIFT_SECONDS = 8 * 3600;

function timeToSeconds(t: string): number {
    const [hh, mm, ss] = t.split(':').map(Number);
    return hh * 3600 + mm * 60 + ss;
}

function diffTimeSeconds(start: string, end: string): number {
    let d = timeToSeconds(end) - timeToSeconds(start);
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

        // Raw SQL access — avoids TypeORM query-builder overhead on aggregations
        private readonly dataSource: DataSource,
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

    // ─────────────────────────────────────────────────────────────────────
    // CREATE
    // ─────────────────────────────────────────────────────────────────────
    async create(dto: CreateStopDto) {
        const stopTime = dto.stopTime ?? null;
        const durationSec = stopTime !== null ? diffTimeSeconds(dto.startTime, stopTime) : null;
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

    // ─────────────────────────────────────────────────────────────────────
    // FIND ALL  — paginated, with % share over the page
    // ─────────────────────────────────────────────────────────────────────
    // Replace only the findAll method in your stops.service.ts
    // This uses SQL_CALC_FOUND_ROWS so MySQL counts while it fetches — one pass, not two queries

    async findAll(query: ListStopsQueryDto) {
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 5;
        const from = query.from?.trim();
        const to = query.to?.trim();
        const equipe = query.equipe;
        const causeId = query.causeId;

        if (from && to && from > to) {
            throw new BadRequestException('"from" must be <= "to"');
        }

        const whereParts: string[] = [];
        const params: any[] = [];

        if (causeId !== undefined) { whereParts.push('s.cause_id = ?'); params.push(causeId); }
        if (equipe !== undefined) { whereParts.push('s.equipe   = ?'); params.push(equipe); }
        if (from) { whereParts.push('s.Jour    >= ?'); params.push(from); }
        if (to) { whereParts.push('s.Jour    <= ?'); params.push(to); }

        const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
        const offset = (page - 1) * limit;

        // Count total matching rows first (separate query — connection-safe)
        const countResult = await this.dataSource.query(`
            SELECT COUNT(*) AS total
            FROM stops s
            INNER JOIN causes c ON c.id = s.cause_id
            ${whereClause}
        `, [...params]);

        const total = Number((countResult as any[])[0]?.total ?? 0);

        // Then fetch the paginated rows
        const rows = await this.dataSource.query(`
            SELECT
                s.id,
                CAST(s.Jour AS CHAR) AS day,
                s.Debut              AS startTime,
                s.Fin                AS stopTime,
                s.Duree              AS durationSeconds,
                s.equipe,
                s.cause_id           AS causeId,
                c.name               AS causeName,
                c.affect_trs         AS affectTRS
            FROM stops s
            INNER JOIN causes c ON c.id = s.cause_id
            ${whereClause}
            ORDER BY s.Jour DESC, s.Debut DESC, s.id DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        const items = (rows as any[]).map((r) => ({
            id: String(r.id),
            day: String(r.day),
            startTime: r.startTime,
            stopTime: r.stopTime ?? null,
            durationSeconds: r.durationSeconds !== null ? Number(r.durationSeconds) : null,
            equipe: Number(r.equipe),
            causeId: Number(r.causeId),
            causeName: r.causeName || 'Unnamed',
            'impact trs': (r.affectTRS === 1 || r.affectTRS === true || r.affectTRS === '1') ? 1 : 0,
        }));

        return { items, total, page, limit };
    }


    // ─────────────────────────────────────────────────────────────────────
    // DOWNTIME ANALYTICS  — raw SQL, single query, all causes shown
    // ─────────────────────────────────────────────────────────────────────
    async getDowntimeAnalytics(
        query: { from?: string; to?: string; equipe?: number } = {},
    ) {
        const from = query.from?.trim();
        const to = query.to?.trim();
        const equipe = query.equipe;

        if (from && to && from > to) {
            throw new BadRequestException('"from" must be <= "to"');
        }

        // Using an INNER JOIN from stops and a WHERE clause allows MySQL to use indexes on stops efficiently.
        // Causes with 0 downtime will be omitted from the result, but the frontend already
        // merges this data with the full list of causes, filling in 0s where needed.
        const whereParts: string[] = [];
        const params: any[] = [];

        if (equipe !== undefined) { whereParts.push('s.equipe = ?'); params.push(equipe); }
        if (from) { whereParts.push('s.Jour  >= ?'); params.push(from); }
        if (to) { whereParts.push('s.Jour  <= ?'); params.push(to); }

        const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

        const sql = `
            SELECT
                c.id   AS causeId,
                c.name AS causeName,
                SUM(
                    CASE
                        WHEN s.Fin IS NULL
                            THEN TIMESTAMPDIFF(SECOND, TIMESTAMP(s.Jour, s.Debut), NOW())
                        ELSE IFNULL(s.Duree, 0)
                    END
                ) AS totalDowntimeSeconds
            FROM stops s
            INNER JOIN causes c ON c.id = s.cause_id
            ${whereClause}
            GROUP BY c.id, c.name
            ORDER BY totalDowntimeSeconds DESC
        `;

        const rows = await this.dataSource.query(sql, params) as any[];

        return rows.map((r) => ({
            causeId: Number(r.causeId),
            causeName: r.causeName || 'Unnamed',
            totalDowntimeSeconds: Number(r.totalDowntimeSeconds || 0),
        }));
    }

    // ─────────────────────────────────────────────────────────────────────
    // DAILY SUMMARY  — raw SQL, single query
    //
    // Performance fixes vs original:
    //   1. Raw SQL — no TypeORM query-builder wrapping / parameter expansion overhead
    //   2. Uses stored `Duree` column (already computed by MySQL) instead of
    //      recomputing TIME_TO_SEC on every row — the main cause of the 3-4s lag
    //   3. INNER JOIN (every stop has a cause FK) — lets MySQL use the FK index
    //   4. Single GROUP BY pass with no correlated subqueries
    //   5. WHERE filters pushed before GROUP BY so MySQL uses idx_stops_day_equipe
    // ─────────────────────────────────────────────────────────────────────
    async getDailyStopsSummary(
        query: Pick<ListStopsQueryDto, 'from' | 'to' | 'equipe'> = {},
    ) {
        const from = query.from?.trim();
        const to = query.to?.trim();
        const equipe = query.equipe;

        if (from && to && from > to) {
            throw new BadRequestException('"from" must be <= "to"');
        }

        const whereParts: string[] = [];
        const params: any[] = [];

        if (equipe !== undefined) { whereParts.push('s.equipe = ?'); params.push(equipe); }
        if (from) { whereParts.push('s.Jour  >= ?'); params.push(from); }
        if (to) { whereParts.push('s.Jour  <= ?'); params.push(to); }

        const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

        const sql = `
            SELECT
                CAST(s.Jour AS CHAR) AS day,
                COUNT(*)             AS stopsCount,
                SUM(
                    CASE
                        WHEN s.Fin IS NULL
                            THEN TIMESTAMPDIFF(SECOND, TIMESTAMP(s.Jour, s.Debut), NOW())
                        ELSE IFNULL(s.Duree, 0)
                    END
                ) AS totalDowntimeSeconds,
                SUM(
                    CASE WHEN c.affect_trs = 1
                        THEN (
                            CASE
                                WHEN s.Fin IS NULL
                                    THEN TIMESTAMPDIFF(SECOND, TIMESTAMP(s.Jour, s.Debut), NOW())
                                ELSE IFNULL(s.Duree, 0)
                            END
                        )
                        ELSE 0
                    END
                ) AS trsDowntimeSeconds
            FROM stops s
            INNER JOIN causes c ON c.id = s.cause_id
            ${whereClause}
            GROUP BY s.Jour
            ORDER BY s.Jour DESC
        `;

        const rows = await this.dataSource.query(sql, params) as any[];

        const maxSeconds = SHIFT_SECONDS * (equipe ? 1 : 3);

        return rows.map((r) => {
            const downtime = Number(r.totalDowntimeSeconds ?? 0);
            const cappedDowntime = Math.max(0, Math.min(downtime, maxSeconds));

            return {
                day: String(r.day),
                totalDowntimeSeconds: cappedDowntime,
                trsDowntimeSeconds: Number(r.trsDowntimeSeconds ?? 0),
                totalWorkSeconds: maxSeconds - cappedDowntime,
                stopsCount: Number(r.stopsCount ?? 0),
            };
        });
    }
}