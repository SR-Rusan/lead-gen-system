/**
 * One-time: lets the dashboard save drafts inside the rusan@axiomsdigital.com mailbox.
 *   npm run connect-mailbox
 * You type the mailbox password (shown as dots). It is checked by logging in to Hostinger,
 * then saved straight to the Vercel project. It is never printed or written to disk.
 */
import { spawnSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { checkMailbox, mailboxUser } from '../src/outreach/imap-draft';

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
  const pw = await askHidden(`Password for ${mailboxUser()}: `);
  if (!pw) {
    console.error('No password typed. Nothing was changed.');
    process.exit(1);
  }
  process.stdout.write('Checking it with Hostinger... ');
  try {
    const folder = await checkMailbox(pw);
    console.log(`OK (drafts folder: ${folder}).`);
  } catch (err) {
    console.log('');
    console.error(`Could not log in: ${(err as Error).message}. Nothing was changed.`);
    process.exit(1);
  }
  const bin = vercelBin();
  spawnSync(bin, ['env', 'rm', 'MAILBOX_IMAP_PASSWORD', 'production', '--yes'], { stdio: 'ignore' });
  const add = spawnSync(bin, ['env', 'add', 'MAILBOX_IMAP_PASSWORD', 'production'], { input: pw, stdio: ['pipe', 'ignore', 'inherit'] });
  if (add.status !== 0) {
    console.error('Could not save to Vercel.');
    process.exit(1);
  }
  console.log('Saved to Vercel. Drafts will go to the rusan@ mailbox after the next deploy.');
  process.exit(0);
})();
