import { getConfig } from './config.js';
import { buildApp } from './app.js';

const config = getConfig();
const app = await buildApp({ config });

app.listen({
  host: '0.0.0.0',
  port: config.PORT
}).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
