import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  slug?: string;
}
