import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CommentsService, Viewer } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';

// 文章下的评论（游客与登录用户共用）。
// 两条路由均 @Public()：JwtAuthGuard 走「可选鉴权」，带 token 时会填充 req.user。
@Controller('posts/:slug/comments')
export class PostCommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Public()
  @Get()
  async list(@Req() req: Request, @Param('slug') slug: string) {
    return this.comments.listByPostSlug(slug, req.user as Viewer | undefined);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  async create(
    @Req() req: Request,
    @Param('slug') slug: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.comments.createByPostSlug(
      slug,
      dto,
      req.user as Viewer | undefined,
    );
  }
}
