import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '@blog/shared';
import { PrismaService } from '../prisma/prisma.service';
import { slugify, uniqueSlug } from '../common/utils/slugify';
import { parseId } from '../common/utils/parse-id';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  // 一次返回全部分类（含 parentId 与 sortOrder），由前端组树
  findAll() {
    return this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { posts: true } } },
    });
  }

  async create(dto: CreateCategoryDto) {
    const slug = dto.slug
      ? await this.ensureSlugAvailable(dto.slug)
      : await this.generateUniqueSlug(dto.name);
    if (dto.parentId != null) {
      await this.assertParentExists(dto.parentId);
    }
    return this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        parentId: dto.parentId != null ? parseId(dto.parentId, '父分类 id') : null,
        description: dto.description,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const current = await this.prisma.category.findUnique({
      where: { id: parseId(id, '分类 id') },
    });
    if (!current) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: '分类不存在',
      });
    }
    if (dto.parentId != null) {
      if (dto.parentId.toString() === id) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: '父分类不能是自身',
        });
      }
      await this.assertParentExists(dto.parentId);
    }
    let slug = dto.slug;
    if (slug && slug !== current.slug) {
      slug = await this.ensureSlugAvailable(slug);
    }
    return this.prisma.category.update({
      where: { id: parseId(id, '分类 id') },
      data: {
        name: dto.name,
        slug,
        parentId: dto.parentId != null ? parseId(dto.parentId, '父分类 id') : undefined,
        description: dto.description,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async remove(id: string) {
    const current = await this.prisma.category.findUnique({
      where: { id: parseId(id, '分类 id') },
    });
    if (!current) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: '分类不存在',
      });
    }
    // 子分类 parentId、文章 categoryId 由外键 ON DELETE SET NULL 自动置空
    await this.prisma.category.delete({ where: { id: parseId(id, '分类 id') } });
    return { message: '已删除' };
  }

  private async assertParentExists(parentId: number): Promise<void> {
    const parent = await this.prisma.category.findUnique({
      where: { id: parseId(parentId, '父分类 id') },
    });
    if (!parent) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '父分类不存在',
      });
    }
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    for (let attempt = 1; ; attempt += 1) {
      const candidate = uniqueSlug(base, attempt);
      const exists = await this.prisma.category.findUnique({
        where: { slug: candidate },
      });
      if (!exists) {
        return candidate;
      }
      if (attempt > 100) {
        return `${base}-${Date.now()}`;
      }
    }
  }

  private async ensureSlugAvailable(slug: string): Promise<string> {
    const exists = await this.prisma.category.findUnique({ where: { slug } });
    if (exists) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: '分类 slug 已存在',
      });
    }
    return slug;
  }
}
