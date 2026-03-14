import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cause } from './cause.entity';
import { CreateCauseDto } from './dto/create-cause.dto';
import { ListCausesQueryDto } from './dto/list-causes.query.dto';
import { UpdateCauseDto } from './dto/update-cause.dto';

@Injectable()
export class CausesService {
    constructor(
        @InjectRepository(Cause)
        private readonly repo: Repository<Cause>,
    ) { }

    async create(dto: CreateCauseDto): Promise<Cause> {
        const cause = this.repo.create({
            name: dto.name.trim(),
            description: dto.description?.trim() ?? null,
            affectTRS: dto.affectTRS,
            isActive: dto.isActive,
        });

        return await this.repo.save(cause);
    }

    async findAll(query: ListCausesQueryDto) {
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 1000;

        const qb = this.repo.createQueryBuilder('c');

        if (query.isActive !== undefined) {
            qb.andWhere('c.isActive = :isActive', { isActive: query.isActive });
        }

        if (query.affectTRS !== undefined) {
            qb.andWhere('c.affectTRS = :affectTRS', { affectTRS: query.affectTRS });
        }

        if (query.search?.trim()) {
            const s = `%${query.search.trim()}%`;
            qb.andWhere('(c.name LIKE :s OR c.description LIKE :s)', { s });
        }

        qb.orderBy('c.name', 'ASC')
            .addOrderBy('c.id', 'ASC')
            .take(limit)
            .skip((page - 1) * limit);

        const [items, total] = await qb.getManyAndCount();

        return { items, total, page, limit };
    }

    async findOne(id: number): Promise<Cause> {
        const cause = await this.repo.findOne({ where: { id } });
        if (!cause) throw new NotFoundException(`Cause id=${id} not found`);
        return cause;
    }

    async update(id: number, dto: UpdateCauseDto): Promise<Cause> {
        const cause = await this.findOne(id);

        if (dto.name !== undefined) cause.name = dto.name.trim();

        if (dto.description !== undefined) {
            const d = dto.description?.trim();
            cause.description = d ? d : null;
        }

        if (dto.affectTRS !== undefined) cause.affectTRS = dto.affectTRS;
        if (dto.isActive !== undefined) cause.isActive = dto.isActive;

        return await this.repo.save(cause);
    }
}
