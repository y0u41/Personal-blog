import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// 热门文章查询：仅暴露条数，排序规则（浏览量倒序）由服务层固定。
export class QueryHotPostsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 5;
}
