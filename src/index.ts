import { loadConfig } from './config.js';
import { buildAppContext, startServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const ctx = buildAppContext({ config });
  const { app } = await startServer(ctx);

  const shutdown = async (signal: string) => {
    ctx.logger.info({ signal }, 'shutting down');
    await app.close();
    ctx.db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('fatal:', err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
