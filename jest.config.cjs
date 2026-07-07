/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^(.+)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': '@swc/jest',
  },
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts'],
};