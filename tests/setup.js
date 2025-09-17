// Global test setup
process.env.NODE_ENV = 'test';

// Mock Home Assistant supervisor environment
process.env.SUPERVISOR_HOST = 'supervisor';
process.env.SUPERVISOR_TOKEN = 'test-token';

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});
