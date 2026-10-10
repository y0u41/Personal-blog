import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { UserRole } from '@blog/shared';

// 管理端用户列表查询：分页 + 按角色筛选 + 用户名/昵称/邮箱关键字
export class QueryUsersDto {
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

  @IsOptional()
  @IsIn(UserRole, { message: '角色不合法' })
  role?: (typeof UserRole)[number];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  keyword?: string;
}
