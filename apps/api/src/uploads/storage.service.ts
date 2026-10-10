import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { randomUUID } from 'crypto';

/** 允许的图片 MIME → 存储扩展名（存储扩展名只由 MIME 决定，绝不采信用户文件名） */
export const IMAGE_MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/** 允许的原始文件扩展名（用于挡掉 .php/.exe/.svg 等可执行或可脚本化后缀） */
export const ALLOWED_UPLOAD_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

export const UPLOAD_PUBLIC_PREFIX = '/uploads';

/** PNG 文件头：89 50 4E 47 0D 0A 1A 0A */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * 按文件头魔数嗅探真实图片类型，返回标准 MIME；无法识别返回 null。
 *
 * 为什么不能只信 file.mimetype：multer 的 mimetype 直接取自客户端提交的
 * Content-Type，可以随意伪造。「真身是 HTML/脚本、声明成 image/png、文件名写
 * .png」的文件能同时通过 MIME 与后缀两道白名单。以魔数为准即可彻底封死伪装上传。
 */
export function sniffImageMime(buffer: Buffer): string | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (buffer.length >= 6) {
    const head = buffer.subarray(0, 6).toString('latin1');
    if (head === 'GIF87a' || head === 'GIF89a') {
      return 'image/gif';
    }
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}


export interface StoredFile {
  url: string;
  filename: string;
}

/**
 * 本地磁盘存储实现。
 * 若日后切换对象存储，只需另写一个实现同一 save() 契约的 Provider 并在
 * UploadsModule 中替换 UPLOAD_STORAGE 的绑定，控制器无需改动。
 */
@Injectable()
export class LocalStorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly dir: string;

  constructor(config: ConfigService) {
    const configured = config.get<string>('UPLOAD_DIR') ?? 'uploads';
    this.dir = resolve(configured);
    this.logger.log(`upload dir resolved to ${this.dir}`);
  }

  get directory(): string {
    return this.dir;
  }

  async save(buffer: Buffer, mime: string): Promise<StoredFile> {
    const ext = IMAGE_MIME_EXT[mime] ?? '.bin';
    const filename = `${randomUUID()}${ext}`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, filename), buffer);
    return { url: `${UPLOAD_PUBLIC_PREFIX}/${filename}`, filename };
  }
}
