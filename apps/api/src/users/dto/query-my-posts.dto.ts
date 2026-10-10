import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PostStatus } from '@blog/shared';

export class QueryMyPostsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 10;

  // 不传则返回全部状态（含草稿与归档）
  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;
}
