/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  // 只让 ts-jest 处理 TS：共享包 dist 里的 .js 由 Jest 原生加载（否则会刷 allowJs 警告）
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  passWithNoTests: true,

  // 覆盖率分母覆盖**全部源码**，而不是只统计「已经被测到的文件」。
  // 后者会让完全没写测试的模块压根不进分母，得出 85% 这种虚高数字。
  // 例外只有三类，都是声明式或进程入口，不承载可测逻辑：
  //   *.spec.ts  测试自身
  //   *.module.ts NestJS 依赖注入声明
  //   main.ts     进程启动入口（由端到端脚本覆盖）
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.spec.ts',
    '!**/*.module.ts',
    '!main.ts',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['text-summary', 'text', 'lcov'],

  // 覆盖率门禁：取当前实测值略下方作为底线，用于防止后续改动把覆盖率悄悄拉低。
  // 低于阈值时 CI 直接失败，而不是等到代码腐化之后才发现。
  // 注意分母是全部源码，控制器与 DTO 属声明/薄委托层，由端到端脚本覆盖。
  coverageThreshold: {
    global: {
      statements: 50,
      branches: 70,
      functions: 45,
      lines: 50,
    },
  },
};
