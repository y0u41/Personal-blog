import {
  ArrayUnique,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PostStatus } from '@blog/shared';

export class UpdatePostDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  coverImage?: string;

  // 三态：不传=不改动，null=清空分类，数字=关联该分类
  @IsOptional()
  @IsInt()
  categoryId?: number | null;

  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;

  // ArrayUnique 提前挡掉重复标签，避免落到 DB 的唯一约束（P2002 → 500）
  @IsOptional()
  @ArrayUnique()
  @IsInt({ each: true })
  tagIds?: number[];
}
