import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length } from 'class-validator';

export class CreateCommentDto {
  @IsString({ message: '评论内容格式不正确' })
  @Length(1, 1000, { message: '评论内容长度需在 1-1000 字之间' })
  content!: string;

  // 游客评论必填（由 Service 二次校验）；登录用户忽略此字段，使用其账号昵称
  @IsOptional()
  @IsString({ message: '昵称格式不正确' })
  @Length(2, 30, { message: '昵称长度需在 2-30 字之间' })
  authorName?: string;

  // 回复某条评论时传父评论 id
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'parentId 必须为整数' })
  parentId?: number;
}
