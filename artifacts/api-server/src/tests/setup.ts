// Test environment variables — must be set before any module is loaded
process.env.DATABASE_URL = "postgresql://test:test@localhost/test_carometro";
process.env.SESSION_SECRET = "test-secret-for-vitest-must-be-at-least-32-chars-long!";
process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"; // 32 hex chars = 128-bit
process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://localhost:5000";
