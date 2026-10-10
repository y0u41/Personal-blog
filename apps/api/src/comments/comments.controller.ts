import { Body, Controller, Delete, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CommentsService, Viewer } from './comments.service';
import { QueryCommentsDto } from './dto/query-comments.dto';
import { UpdateCommentStatusDto } from './dto/update-comment-status.dto';

// 评论审核与管理（列表/审核仅 admin；删除允许评论作者本人）
@Controller('comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Roles('admin')
  @Get()
  async list(@Query() query: QueryCommentsDto) {
    return this.comments.adminList(query);
  }

  @Roles('admin')
  @Patch(':id')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCommentStatusDto,
  ) {
    return this.comments.updateStatus(id, dto.status);
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    return this.comments.remove(id, req.user as Viewer);
  }
}
