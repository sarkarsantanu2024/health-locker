import { connect } from "node:net";

/**
 * Fails fast if the dev port is already taken, instead of letting Next quietly
 * start on 3001.
 *
 * That silent fallback is not cosmetic here: `APP_URL` defaults to
 * http://localhost:3000 and is baked into UPI deep links, the emergency card QR
 * and QStash callbacks. A server on 3001 therefore generates payment links and
 * QR codes pointing at a port nothing is listening on — which presents as a
 * broken feature rather than as a wrong port.
 *
 * This probes by CONNECTING rather than by binding. On Windows a second socket
 * may bind an already-listening port (SO_REUSEADDR behaves differently there),
 * so a bind probe reports "free" for a port that is very much in use. A
 * successful connection is unambiguous on every platform.
 */

const PORT = Number(process.env.PORT ?? 3000);
const TIMEOUT_MS = 1000;

function isPortInUse(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port: PORT, host: "127.0.0.1" });

    const finish = (inUse: boolean) => {
      socket.destroy();
      resolve(inUse);
    };

    socket.setTimeout(TIMEOUT_MS);
    // Something answered, so something is listening.
    socket.once("connect", () => finish(true));
    // Refused (nothing there) or unreachable — either way, free to take.
    socket.once("error", () => finish(false));
    // A port that accepts but never completes the handshake is not usable
    // either, but treating a timeout as "in use" would block on a slow machine.
    socket.once("timeout", () => finish(false));
  });
}

if (await isPortInUse()) {
  process.stderr.write(
    `\nPort ${PORT} is already in use.\n\n` +
      `HealthLocker pins this port because APP_URL is baked into UPI links and\n` +
      `emergency QR codes — a server on ${PORT + 1} would generate links that go\n` +
      `nowhere.\n\n` +
      `Find and stop whatever holds it:\n\n` +
      (process.platform === "win32"
        ? `  powershell "Get-NetTCPConnection -LocalPort ${PORT} -State Listen | Select OwningProcess"\n` +
          `  powershell "Stop-Process -Id <pid> -Force"\n\n`
        : `  lsof -ti :${PORT} | xargs kill\n\n`) +
      `It is usually an orphaned dev or start server from an earlier session.\n\n`,
  );

  process.exit(1);
}
