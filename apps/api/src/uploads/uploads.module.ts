import { BadRequestException, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule, MulterModuleOptions } from '@nestjs/platform-express';
import { ErrorCode } from '@blog/shared';
import { UploadsController } from './uploads.controller';
import {
  ALLOWED_UPLOAD_EXTS,
  IMAGE_MIME_EXT,
  LocalStorageService,
} from './storage.service';

const DEFAULT_MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

@Module({
  imports: [
    ConfigModule,
    // 上传限制集中在 Multer 层：大小上限 + 类型/后缀双重白名单。
    // 内存存储（multer 默认）→ 由 LocalStorageService 负责落盘，便于切换对象存储。
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): MulterModuleOptions => ({
        limits: {
          fileSize: Number(
            config.get<string>('MAX_UPLOAD_SIZE') ?? DEFAULT_MAX_UPLOAD_SIZE,
          ),
          files: 1,
        },
        fileFilter: (_req, file, cb) => {
          const mimeOk = Object.prototype.hasOwnProperty.call(
            IMAGE_MIME_EXT,
            file.mimetype,
          );
          const ext = (file.originalname.match(/\.[^.]+$/) ?? [''])[0].toLowerCase();
          const extOk = ALLOWED_UPLOAD_EXTS.includes(ext);
          if (!mimeOk || !extOk) {
            cb(
              new BadRequestException({
                code: ErrorCode.UPLOAD_TYPE_INVALID,
                message: '仅支持 jpg / png / webp / gif 图片',
              }),
              false,
            );
            return;
          }
          cb(null, true);
        },
      }),
    }),
  ],
  controllers: [UploadsController],
  providers: [LocalStorageService],
  exports: [LocalStorageService],
})
export class UploadsModule {}
