module.exports = {
  apps: [
    {
      name: "backend",
      cwd: "./packages/agent-service",
      script: "npx",
      args: "tsx watch src/index.ts",
      env: {
        NODE_ENV: "development",
        PORT: 3000,
      },
    },
    {
      name: "frontend",
      cwd: "./packages/web-client",
      script: "npx",
      args: "vite --host",
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
