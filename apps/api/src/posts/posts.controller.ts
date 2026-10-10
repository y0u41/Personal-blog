import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@blog/shared';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostsDto } from './dto/query-posts.dto';
import { QueryHotPostsDto } from './dto/query-hot-posts.dto';
import { QueryRankDto } from './dto/query-rank.dto';
import { QueryArchiveDaysDto } from './dto/query-archive-days.dto';
import { UpdatePostPinDto } from './dto/update-post-pin.dto';

@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  // 写文章：作者/管理员
  @Post()
  @Roles('author', 'admin')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async create(@Req() req: Request, @Body() dto: CreatePostDto) {
    const user = req.user as { id: string; role: UserRole };
    return this.posts.create(dto, user.id);
  }

  // 列表：公开
  @Public()
  @Get()
  async findAll(@Query() query: QueryPostsDto) {
    return this.posts.findAll(query);
  }

  // 热门文章：公开。
  // 必须声明在 ':idOrSlug' 之前，否则 /posts/hot 会被当成 slug='hot' 的详情请求。
  @Public()
  @Get('hot')
  async hot(@Query() query: QueryHotPostsDto) {
    return this.posts.findHot(query.limit);
  }

  // 归档总览（年月篇数）与年度热力图：公开。
  // 同样必须声明在 ':idOrSlug' 之前，否则会被当成 slug='archive' 的详情请求。
  @Public()
  @Get('archive')
  async archive() {
    return this.posts.findArchive();
  }

  @Public()
  @Get('archive/days')
  async archiveDays(@Query() query: QueryArchiveDaysDto) {
    return this.posts.findArchiveDays(query.year);
  }

  // 排行榜（阅读 / 评论 / 推荐 总榜）：公开。
  @Public()
  @Get('rank')
  async rank(@Query() query: QueryRankDto) {
    return this.posts.findRank(query);
  }

  // 详情：公开（浏览量 +1、非公开文章需作者/管理员）
  @Public()
  @Get(':idOrSlug')
  async findOne(
    @Req() req: Request,
    @Param('idOrSlug') idOrSlug: string,
  ) {
    const user = req.user as { id: string; role: UserRole } | undefined;
    const ip = req.ip;
    return this.posts.findOne(idOrSlug, user?.id, user?.role, ip);
  }

  // ---------------- 互动：需登录（读者也可以点赞/收藏） ----------------
  // 点赞与收藏都用「POST 建立 / DELETE 解除」表达，语义明确且可重放。

  @Post(':id/like')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async like(@Req() req: Request, @Param('id') id: string) {
    return this.posts.like(id, (req.user as { id: string }).id);
  }

  @Delete(':id/like')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async unlike(@Req() req: Request, @Param('id') id: string) {
    return this.posts.unlike(id, (req.user as { id: string }).id);
  }

  @Post(':id/favorite')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async favorite(@Req() req: Request, @Param('id') id: string) {
    return this.posts.favorite(id, (req.user as { id: string }).id);
  }

  @Delete(':id/favorite')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async unfavorite(@Req() req: Request, @Param('id') id: string) {
    return this.posts.unfavorite(id, (req.user as { id: string }).id);
  }

  // 置顶 / 取消置顶：作者或管理员（资源归属在服务层二次校验）
  @Patch(':id/pin')
  @Roles('author', 'admin')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async pin(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdatePostPinDto,
  ) {
    const user = req.user as { id: string; role: UserRole };
    return this.posts.setPinned(id, dto.pinned, user.id, user.role);
  }

  @Patch(':id')
  @Roles('author', 'admin')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
  ) {
    const user = req.user as { id: string; role: UserRole };
    return this.posts.update(id, dto, user.id, user.role);
  }

  @Delete(':id')
  @Roles('author', 'admin')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async remove(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as { id: string; role: UserRole };
    return this.posts.remove(id, user.role, user.id);
  }
}
