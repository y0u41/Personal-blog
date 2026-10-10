import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// 年度热力图：指定年份返回每天的发文量。不传则用当前年份。
export class QueryArchiveDaysDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1970)
  @Max(9999)
  year?: number;
}
