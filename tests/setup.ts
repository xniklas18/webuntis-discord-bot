// Test setup - runs before all tests
// Mock environment variables
process.env.WEBUNTIS_SCHOOL = 'test-school';
process.env.WEBUNTIS_USERNAME = 'test-user';
process.env.WEBUNTIS_PASSWORD = 'test-pass';
process.env.WEBUNTIS_BASEURL = 'test-url';
process.env.CLIENT_TOKEN = 'test-token';
process.env.CHANNEL_ID = 'test-channel-id';

// Increase test timeout for integration tests
jest.setTimeout(10000);
