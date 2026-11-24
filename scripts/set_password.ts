/**
 * Sets the dashboard login password without it ever being shown or saved in plain text.
 *   npm run set-password            -> prints nothing secret; tells you the hash was made
 *   npm run set-password -- --vercel -> also saves the hash to the linked Vercel project (Production)
 */
import { spawnSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { hashPassword } from '../src/auth';

function askHidden(question: string): Promise<string> {
  // Raw-mode reader: shows one dot per character so you can see that typing works.
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    let value = '';
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (raw: string) => {
      // Drop terminal escape codes (e.g. the [200~ ... [201~ markers a paste adds), keep only typed text.
      const chunk = raw.replace(/\u001b\[[0-9;]*[~A-Za-z]/g, '').replace(/\u001b./g, '');
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          process.stdout.write('\nCancelled.\n');
          process.exit(1);
        }
        if (ch === '\u007f' || ch === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (ch >= ' ') {
          value += ch;
          process.stdout.write('\u2022');
        }
      }
    };
    stdin.on('data', onData);
  });
}

function vercelBin(): string {
  if (process.env.VERCEL_BIN) return process.env.VERCEL_BIN;
  const cache = path.join(os.homedir(), '.npm/_npx');
  for (const dir of fs.existsSync(cache) ? fs.readdirSync(cache) : []) {
    const bin = path.join(cache, dir, 'node_modules/.bin/vercel');
    if (fs.existsSync(bin)) return bin;
  }
  return 'vercel';
}

(async () => {
  const pw = await askHidden('New dashboard password (min 12 characters): ');
  if (pw.length < 12) {
    console.error('Too short. Use at least 12 characters.');
    process.exit(1);
  }
  const again = await askHidden('Type it again: ');
  if (again !== pw) {
    console.error('The two passwords did not match. Nothing was changed.');
    process.exit(1);
  }
  const hash = hashPassword(pw);

  if (!process.argv.includes('--vercel')) {
    console.log('Hash created. Run with --vercel to save it to the hosted dashboard.');
    return;
  }

  const bin = vercelBin();
  spawnSync(bin, ['env', 'rm', 'DASHBOARD_PASSWORD_HASH', 'production', '--yes'], { stdio: 'ignore' });
  const add = spawnSync(bin, ['env', 'add', 'DASHBOARD_PASSWORD_HASH', 'production'], {
    input: hash,
    stdio: ['pipe', 'ignore', 'inherit'],
  });
  if (add.status !== 0) {
    console.error('Could not save to Vercel. Is this folder linked (vercel link)?');
    process.exit(1);
  }
  console.log('Password saved to Vercel. It takes effect after the next deploy.');
})();
