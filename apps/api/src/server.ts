import { getConfig } from './config.js';
import { buildApp } from './app.js';

async function main() {
  const config = getConfig();
  const app = await buildApp({ config });

  await app.listen({
    host: '0.0.0.0',
    port: config.PORT
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
