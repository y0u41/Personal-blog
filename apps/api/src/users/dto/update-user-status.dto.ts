import { IsIn } from 'class-validator';

// 管理员启用/停用账号：1=正常，0=停用（停用后无法登录，且立即吊销 refresh token）
export class UpdateUserStatusDto {
  @IsIn([0, 1], { message: '账号状态不合法' })
  status!: 0 | 1;
}
