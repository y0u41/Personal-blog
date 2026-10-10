import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '@blog/shared';
import { PrismaService } from '../prisma/prisma.service';
import { slugify, uniqueSlug } from '../common/utils/slugify';
import { parseId } from '../common/utils/parse-id';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.tag.findMany({
      orderBy: { name: 'asc' },
      // 只统计「已发布」文章数：否则标签云会把草稿数量暴露给游客
      include: {
        _count: { select: { postTags: { where: { post: { status: 'published' } } } } },
      },
    });
  }

  /** 按 slug 取单个标签（标签归档页用；slug 比自增 id 更适合出现在 URL 上）。 */
  async findBySlug(slug: string) {
    const tag = await this.prisma.tag.findUnique({
      where: { slug },
      include: {
        _count: { select: { postTags: { where: { post: { status: 'published' } } } } },
      },
    });
    if (!tag) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: '标签不存在',
      });
    }
    return tag;
  }

  async create(dto: CreateTagDto) {
    const slug = dto.slug
      ? await this.ensureSlugAvailable(dto.slug)
      : await this.generateUniqueSlug(dto.name);
    return this.prisma.tag.create({ data: { name: dto.name, slug } });
  }

  async update(id: string, dto: UpdateTagDto) {
    const current = await this.prisma.tag.findUnique({
      where: { id: parseId(id, '标签 id') },
    });
    if (!current) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: '标签不存在',
      });
    }
    let slug = dto.slug;
    if (slug && slug !== current.slug) {
      slug = await this.ensureSlugAvailable(slug);
    }
    return this.prisma.tag.update({
      where: { id: parseId(id, '标签 id') },
      data: { name: dto.name, slug },
    });
  }

  async remove(id: string) {
    const current = await this.prisma.tag.findUnique({
      where: { id: parseId(id, '标签 id') },
    });
    if (!current) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: '标签不存在',
      });
    }
    // post_tags 关联由外键 ON DELETE CASCADE 清除
    await this.prisma.tag.delete({ where: { id: parseId(id, '标签 id') } });
    return { message: '已删除' };
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    for (let attempt = 1; ; attempt += 1) {
      const candidate = uniqueSlug(base, attempt);
      const exists = await this.prisma.tag.findUnique({
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
    const exists = await this.prisma.tag.findUnique({ where: { slug } });
    if (exists) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: '标签 slug 已存在',
      });
    }
    return slug;
  }
}
