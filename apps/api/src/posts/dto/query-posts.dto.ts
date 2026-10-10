import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';

// 公开文章列表查询：分页 / 分类筛选 / 标签筛选 / 关键词 / 归档年月。
// 状态固定为 published（由服务层强制），不对外暴露草稿筛选。
// 注意：query 参数均为字符串，数值字段需 @Type(() => Number) 显式转换。
export class QueryPostsDto {
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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  // 标签归档页按 slug 过滤（slug 比 id 更适合出现在 URL 里）
  @IsOptional()
  @IsString()
  @MaxLength(60)
  tagSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  // 归档页按发布年月筛选。月份必须与年份同时提供（仅给月份无法定位到唯一区间）。
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1970)
  @Max(9999)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;
}
