import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  // 缺省时由 name 自动生成
  @IsOptional()
  @IsString()
  @MaxLength(60)
  slug?: string;
}
