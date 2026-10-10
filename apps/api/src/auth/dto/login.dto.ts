import { IsString, Length, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  // 最短 2 位：允许 yu 这类短用户名（低于 3 位在注册侧同样放开）
  @IsString({ message: '用户名格式不正确' })
  @Length(2, 32, { message: '用户名长度需在 2-32 位之间' })
  username: string;

  @IsString({ message: '密码格式不正确' })
  @MinLength(1, { message: '密码不能为空' })
  @MaxLength(64, { message: '密码过长' })
  password: string;
}
