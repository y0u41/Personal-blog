import { IsIn } from 'class-validator';
import { UserRole } from '@blog/shared';

// 管理员调整他人角色：reader（读者）→ author（作者）→ admin（管理员）
export class UpdateUserRoleDto {
  @IsIn(UserRole, { message: '角色不合法' })
  role!: (typeof UserRole)[number];
}
