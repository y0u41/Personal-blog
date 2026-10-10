import { IsEmail, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  // 最短 2 位，与登录侧保持一致
  @IsString({ message: '用户名格式不正确' })
  @Length(2, 32, { message: '用户名长度需在 2-32 位之间' })
  username: string;

  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;

  @IsString({ message: '密码格式不正确' })
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(64, { message: '密码过长' })
  password: string;

  @IsOptional()
  @IsString({ message: '昵称格式不正确' })
  @MaxLength(50, { message: '昵称最多 50 字' })
  displayName?: string;
}
