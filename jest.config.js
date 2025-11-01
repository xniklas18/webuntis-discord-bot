module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/tests/integration/**/*.test.ts'],
  collectCoverageFrom: [
    'src/index.ts'
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    '/src/utils/'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
};
