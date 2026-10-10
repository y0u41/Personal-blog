import { IsIn, IsOptional, IsInt, Min, Max } from 'class-validator';
import { RankType as RANK_TYPES } from '@blog/shared';
import { Type } from 'class-transformer';

// 排行榜查询：维度固定为三种（阅读 / 评论 / 推荐），排序与过滤由服务层固定。
// RankType 是 const 数组，可直接交给 @IsIn（比 @IsEnum 更适合「字符串字面量联合」）。
export class QueryRankDto {
  @IsOptional()
  @IsIn(RANK_TYPES)
  type?: (typeof RANK_TYPES)[number] = 'views';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 20;
}
