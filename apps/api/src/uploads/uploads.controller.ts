import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ErrorCode } from '@blog/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { LocalStorageService, sniffImageMime } from './storage.service';

// 图片上传：仅 author/admin。类型与大小在 Multer 层拦截（见 UploadsModule 配置），
// 落盘前还会按文件头魔数复检一次，防止伪造 Content-Type 的伪装文件。
@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: LocalStorageService) {}

  @Post()
  @Roles('author', 'admin')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException({
        code: ErrorCode.UPLOAD_TYPE_INVALID,
        message: '未接收到文件，请以 form-data 的 file 字段上传',
      });
    }
    // 以魔数为准：客户端声明的 mimetype 不可信
    const actualMime = sniffImageMime(file.buffer);
    if (!actualMime) {
      throw new BadRequestException({
        code: ErrorCode.UPLOAD_TYPE_INVALID,
        message: '文件内容不是有效图片，仅支持真实的 jpg / png / webp / gif',
      });
    }
    const { url, filename } = await this.storage.save(file.buffer, actualMime);
    return { url, filename, size: file.size, mime: actualMime };
  }
}
