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

export class CreatePostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  coverImage?: string;

  @IsOptional()
  @IsInt()
  categoryId?: number | null;

  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;

  @IsOptional()
  @ArrayUnique()
  @IsInt({ each: true })
  tagIds?: number[];
}
