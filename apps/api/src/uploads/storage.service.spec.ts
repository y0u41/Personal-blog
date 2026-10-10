import { sniffImageMime } from './storage.service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF = Buffer.from('GIF89a', 'latin1');
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from([0x20, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'latin1'),
]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');

describe('sniffImageMime', () => {
  it.each([
    ['image/png', PNG],
    ['image/jpeg', JPEG],
    ['image/gif', GIF],
    ['image/webp', WEBP],
  ])('识别真实 %s', (mime, buf) => {
    expect(sniffImageMime(buf)).toBe(mime);
  });

  it('拒绝伪装成图片的 HTML（客户端 Content-Type 不可信）', () => {
    expect(sniffImageMime(HTML)).toBeNull();
  });

  it('拒绝空内容与过短内容', () => {
    expect(sniffImageMime(Buffer.alloc(0))).toBeNull();
    expect(sniffImageMime(Buffer.from([0xff]))).toBeNull();
  });

  it('拒绝「RIFF 但不是 WEBP」的其它容器格式（如 WAV）', () => {
    const wav = Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from('WAVE', 'latin1'),
    ]);
    expect(sniffImageMime(wav)).toBeNull();
  });
});
