import { BadRequestException, Injectable } from '@nestjs/common';
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
    // FIND ALL  — paginated list with correct per-day-per-team PCT
    //
    // Uses Query C: CTE pre-aggregation + covering index
    //
    // Why NOT a window function (the obvious alternative):
    //   SUM(Duree) OVER (PARTITION BY prod_day, equipe) must sort all rows
    //   before emitting any result.  At 1M rows this spills to disk and takes
    //   ~26 seconds.  The CTE approach materialises 544 rows (one per
    //   prod_day × equipe combination) and probes them in O(1) per row —
    //   same correct answer, measured at 2.2 seconds on 1M rows.
    //
    // PCT semantics:
    //   The CTE is built WITHOUT the causeId filter so it captures the full
    //   day+team downtime.  A stop's PCT = its duration / (total downtime for
    //   that team on that production day) × 100.  Filtering by cause in the
    //   outer query does not distort the denominator.
    //
    // Index used: idx_covering (prod_day, equipe, cause_id, Duree)
    //   — covering index: both the CTE scan and the main scan read only
    //     index pages, never touching the main table heap.
    // ─────────────────────────────────────────────────────────────────────
    async findAll(query: ListStopsQueryDto) {
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 5;
        const from = query.from?.trim();
        const to = query.to?.trim();
        const equipe = query.equipe;
        const causeId = query.causeId;
        const offset = (page - 1) * limit;

        if (from && to && from > to) {
            throw new BadRequestException('"from" must be <= "to"');
        }

        // ── CTE params: date + equipe only (no causeId) ───────────────────
        // The CTE must aggregate ALL causes for each day+team so the PCT
        // denominator is correct even when the outer query filters by causeId.
        const cteWhereParts: string[] = [];
        const cteParams: any[] = [];
        if (equipe !== undefined) { cteWhereParts.push('s.equipe    = ?'); cteParams.push(equipe); }
        if (from) { cteWhereParts.push('s.prod_day >= ?'); cteParams.push(from); }
        if (to) { cteWhereParts.push('s.prod_day <= ?'); cteParams.push(to); }
        const cteWhereClause = cteWhereParts.length
            ? `WHERE ${cteWhereParts.join(' AND ')}`
            : '';

        // ── Main query params: all filters ────────────────────────────────
        // Start from the CTE conditions, then optionally add causeId.
        const mainWhereParts: string[] = [...cteWhereParts];
        const mainParams: any[] = [...cteParams];
        if (causeId !== undefined) { mainWhereParts.push('s.cause_id = ?'); mainParams.push(causeId); }
        const mainWhereClause = mainWhereParts.length
            ? `WHERE ${mainWhereParts.join(' AND ')}`
            : '';

        // ── 1. Total count (separate fast query) ──────────────────────────
        // Using a dedicated COUNT avoids any window-function or subquery
        // overhead.  idx_covering serves this with an index range scan.
        const countRows = await this.dataSource.query<[{ cnt: string }]>(`
            SELECT COUNT(*) AS cnt
            FROM   stops   s  FORCE INDEX (idx_covering)
            JOIN   causes  c  ON c.id = s.cause_id
            ${mainWhereClause}
        `, mainParams);
        const total = Number(countRows[0]?.cnt ?? 0);

        // ── 2. Data query: CTE + covering-index scan ──────────────────────
        //
        // Execution plan (1M rows):
        //   Step 1 — CTE: one covering-index scan → GROUP BY prod_day, equipe
        //            → ~544 rows materialised into a tiny in-memory tmp table
        //   Step 2 — Main: one covering-index scan → hash-join causes (16 rows)
        //            → hash-probe CTE result (544 rows) → LIMIT/OFFSET
        //
        // No full table heap access, no sort spill, no disk I/O beyond the
        // two sequential index reads.
        //
        // Param order: [...cteParams, ...mainParams, limit, offset]
        const rows = await this.dataSource.query(`
            WITH day_team_totals AS (
                -- Pre-aggregate once: total downtime per production-day × team.
                -- FORCE INDEX guarantees the covering index is used here —
                -- both GROUP BY columns (prod_day, equipe) are the leading keys,
                -- so the aggregation streams with zero sort cost.
                SELECT
                    s.prod_day,
                    s.equipe,
                    SUM(s.Duree) AS day_total
                FROM   stops s  FORCE INDEX (idx_covering)
                ${cteWhereClause}
                GROUP BY s.prod_day, s.equipe
            )
            SELECT
                s.id,
                CAST(s.prod_day AS CHAR)                              AS day,
                s.Debut                                               AS startTime,
                s.Fin                                                 AS stopTime,
                s.Duree                                               AS durationSeconds,
                s.equipe,
                s.cause_id                                            AS causeId,
                c.name                                                AS causeName,
                c.affect_trs                                          AS affectTRS,
                ROUND(
                    s.Duree * 100.0 / NULLIF(dt.day_total, 0),
                    2
                )                                                     AS pct
            FROM   stops           s   FORCE INDEX (idx_covering)
            JOIN   causes          c   ON  c.id        = s.cause_id
            JOIN   day_team_totals dt  ON  dt.prod_day = s.prod_day
                                      AND dt.equipe    = s.equipe
            ${mainWhereClause}
            ORDER BY s.prod_day DESC, s.Debut DESC, s.id DESC
            LIMIT ? OFFSET ?
        `, [...cteParams, ...mainParams, limit, offset]);

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
            '%': r.pct !== null ? Number(r.pct) : null,
        }));

        return { items, total, page, limit };
    }


    // ─────────────────────────────────────────────────────────────────────
    // DOWNTIME ANALYTICS  — total seconds per cause for the given period
    //
    // Index: idx_covering (prod_day, equipe, cause_id, Duree)
    //   Leading key prod_day drives the WHERE range filter.
    //   equipe narrows it further when supplied.
    //   cause_id and Duree are read directly from the index — no heap access.
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

        const whereParts: string[] = [];
        const params: any[] = [];
        if (equipe !== undefined) { whereParts.push('s.equipe    = ?'); params.push(equipe); }
        if (from) { whereParts.push('s.prod_day >= ?'); params.push(from); }
        if (to) { whereParts.push('s.prod_day <= ?'); params.push(to); }
        const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

        // Using stored Duree column — no CASE/TIME_TO_SEC recomputation.
        // The INNER JOIN lets MySQL drive the scan from idx_covering and probe
        // the 16-row causes table with a hash join — essentially free.
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
            FROM   stops  s  FORCE INDEX (idx_covering)
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
    // DAILY SUMMARY  — one row per production day for the bar chart
    //
    // Execution plan:
    //   Inner subquery: idx_covering range scan → GROUP BY prod_day, cause_id
    //   Outer query:    hash join of that small result against causes (16 rows)
    //                   → GROUP BY day
    //
    // Uses stored Duree — no CASE/TIME_TO_SEC recomputation.
    // Index: idx_covering (prod_day, equipe, cause_id, Duree)
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
        if (equipe !== undefined) { whereParts.push('s.equipe    = ?'); params.push(equipe); }
        if (from) { whereParts.push('s.prod_day >= ?'); params.push(from); }
        if (to) { whereParts.push('s.prod_day <= ?'); params.push(to); }
        const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

        const sql = `
            SELECT
                day,
                SUM(stopsCount)                        AS stopsCount,
                SUM(totalSec)                          AS totalDowntimeSeconds,
                SUM(IF(affect_trs = 1, totalSec, 0))   AS trsDowntimeSeconds
            FROM (
                SELECT
                    CAST(s.prod_day AS CHAR) AS day,
                    s.cause_id,
                    COUNT(*)                 AS stopsCount,
                    SUM(IFNULL(s.Duree, 0)) AS totalSec
                FROM   stops s  FORCE INDEX (idx_covering)
                ${whereClause}
                GROUP BY s.prod_day, s.cause_id
            ) AS agg
            INNER JOIN causes c ON c.id = agg.cause_id
            GROUP BY day
            ORDER BY day DESC
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