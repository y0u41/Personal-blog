import { Body, Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { toPublicUser } from '../common/mappers/user.mapper';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryMyPostsDto } from './dto/query-my-posts.dto';
import { QueryFavoritesDto } from './dto/query-favorites.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UsersService } from './users.service';

type ReqUser = { id: string; role: string };

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // ---------------- 当前用户（静态路径必须在 ':id' 之前声明） ----------------

  // 我的文章（含草稿/归档），需登录
  @Get('me/posts')
  async myPosts(@Req() req: Request, @Query() query: QueryMyPostsDto) {
    return this.users.findMyPosts((req.user as ReqUser).id, query);
  }

  // 我的收藏，需登录
  @Get('me/favorites')
  async myFavorites(@Req() req: Request, @Query() query: QueryFavoritesDto) {
    return this.users.findMyFavorites((req.user as ReqUser).id, query);
  }

  @Get('me')
  async me(@Req() req: Request) {
    return this.users.findMe((req.user as ReqUser).id);
  }

  @Patch('me')
  async updateMe(@Req() req: Request, @Body() dto: UpdateUserDto) {
    const user = await this.users.updateProfile((req.user as ReqUser).id, dto);
    return toPublicUser(user);
  }

  // ---------------- 管理端（仅 admin） ----------------

  // 用户列表：分页 + 按角色筛选 + 关键字
  @Roles('admin')
  @Get()
  async list(@Query() query: QueryUsersDto) {
    return this.users.adminList(query);
  }

  // 提升作者 / 调整角色
  @Roles('admin')
  @Patch(':id/role')
  async updateRole(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.users.updateRole((req.user as ReqUser).id, id, dto.role);
  }

  // 启用 / 停用账号
  @Roles('admin')
  @Patch(':id/status')
  async updateStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.users.updateStatus((req.user as ReqUser).id, id, dto.status);
  }
}
