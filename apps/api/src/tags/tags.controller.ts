import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Public()
  @Get()
  async findAll() {
    return this.tags.findAll();
  }

  // 单个标签：公开（声明在 ':id' 的写方法之前，避免路径被抢）
  @Public()
  @Get(':slug')
  async findBySlug(@Param('slug') slug: string) {
    return this.tags.findBySlug(slug);
  }

  @Post()
  @Roles('admin')
  async create(@Body() dto: CreateTagDto) {
    return this.tags.create(dto);
  }

  @Patch(':id')
  @Roles('admin')
  async update(@Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.tags.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id') id: string) {
    return this.tags.remove(id);
  }
}
