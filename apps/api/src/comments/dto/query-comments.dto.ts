import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CommentStatus } from '@blog/shared';

export class QueryCommentsDto {
  @IsOptional()
  @IsIn(CommentStatus, { message: '评论状态不合法' })
  status?: (typeof CommentStatus)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 必须为整数' })
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须为整数' })
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
