import { IsBoolean } from 'class-validator';

// 置顶开关：显式传布尔值，避免 undefined 被当成「保持不变」造成语义歧义。
export class UpdatePostPinDto {
  @IsBoolean()
  pinned!: boolean;
}
