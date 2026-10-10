import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

// 全局 JWT 守卫：默认拦截所有接口，@Public() 标记的接口放行。
//
// 关键：@Public() 走「可选鉴权」——携带合法 token 时仍然填充 req.user，无 token 或
// token 失效时不阻断请求。这样公开接口也能识别访问者身份，例如：
//   - GET /posts/:idOrSlug：作者/管理员可查看自己的草稿
//   - POST /posts/:slug/comments：登录用户用其昵称、管理员/作者评论自动过审
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      try {
        await (super.canActivate(context) as Promise<boolean>);
      } catch {
        // 公开接口不因鉴权失败而拒绝；此处仅用于「尽力」填充 req.user
      }
      return true;
    }
    return super.canActivate(context) as Promise<boolean>;
  }
}
