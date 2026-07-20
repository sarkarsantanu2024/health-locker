/**
 * CLI scripts run outside Next, which normally loads .env for us. Import this
 * first so `tsx scripts/*.ts` sees the same config the app does.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
