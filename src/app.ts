import type { Config } from './config.js';
import type { DB } from './db/index.js';
import type { PrimaryIdentity } from './identity/service.js';
import type { Logger } from './logger.js';
import type { Outbox } from './messages/outbox.js';

export interface AppContext {
  config: Config;
  db: DB;
  logger: Logger;
  identity: PrimaryIdentity;
  outbox: Outbox;
}
