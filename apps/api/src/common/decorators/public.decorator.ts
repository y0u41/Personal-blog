import { SetMetadata } from '@nestjs/common';

// 标记接口为公开（无需 JWT）。M2 的 JwtAuthGuard 会读取此元数据放行。
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
