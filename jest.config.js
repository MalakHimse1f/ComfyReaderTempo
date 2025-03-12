/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: "ts-jest/presets/js-with-ts-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    // Handle module aliases (if you use them in the project)
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // Setup files to run before tests
  setupFilesAfterEnv: [],
  // Test files pattern
  testMatch: [
    "**/__tests__/**/*.test.ts",
    "**/__integration_tests__/**/*.test.ts",
    "**/__performance_tests__/**/*.test.ts",
  ],
  // Transform TypeScript files
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
        },
        useESM: true,
      },
    ],
  },
  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    "src/services/epub-processor/**/*.ts",
    "!src/services/epub-processor/__tests__/**",
    "!src/services/epub-processor/__integration_tests__/**",
    "!src/services/epub-processor/__performance_tests__/**",
  ],
  coverageDirectory: "coverage",
};
