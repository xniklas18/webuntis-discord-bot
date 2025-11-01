// Test setup - runs before all tests
// Mock environment variables
process.env.WEBUNTIS_SCHOOL = 'test-school';
process.env.WEBUNTIS_USERNAME = 'test-user';
process.env.WEBUNTIS_PASSWORD = 'test-pass';
process.env.WEBUNTIS_BASEURL = 'test-url';

// Use real Discord credentials for integration testing
// These are loaded from the .env file automatically by dotenv
// process.env.CLIENT_TOKEN is already set from .env
// process.env.TESTING_CHANNEL_ID is already set from .env

// Increase test timeout for integration tests
jest.setTimeout(15000);
