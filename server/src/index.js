import { getConfig, ConfigError } from './config.js';
import { logger } from './lib/logger.js';

let config;
try {
  config = getConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

const { createApp } = await import('./app.js');
const app = createApp({ config });

app.listen(config.PORT, () => {
  logger.info('iRent API listening', {
    port: config.PORT,
    env: config.NODE_ENV,
    emailTransport: config.EMAIL_TRANSPORT,
    clockOverride: config.ALLOW_CLOCK_OVERRIDE ? config.CLOCK_OVERRIDE ?? 'allowed' : 'off',
  });
});
