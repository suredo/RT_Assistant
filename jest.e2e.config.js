module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/e2e/**/*.e2e.ts'],
  testTimeout: 60000, // real LLM calls can take several seconds
  // Run e2e tests serially — they share real API rate limits
  maxWorkers: 1,
};
