import { IsIn } from 'class-validator';
import { CommentStatus } from '@blog/shared';

export class UpdateCommentStatusDto {
  @IsIn(CommentStatus, { message: '评论状态不合法' })
  status!: (typeof CommentStatus)[number];
}
