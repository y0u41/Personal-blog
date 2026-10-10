/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  // 只让 ts-jest 处理 TS：共享包 dist 里的 .js 由 Jest 原生加载（否则会刷 allowJs 警告）
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  passWithNoTests: true,
};
