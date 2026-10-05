// Vitest sets NODE_ENV to "test"; these are the extras the services need.
process.env.LOG_LEVEL = "silent";
process.env.BETTER_AUTH_SECRET ??= "test-secret-at-least-32-characters-long";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
