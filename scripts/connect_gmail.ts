/**
 * One-time: lets the hosted dashboard put drafts into your Gmail.
 *   npm run connect-gmail
 * Opens Google's permission page (scope: gmail.compose = write drafts / send; it cannot read your mail),
 * then saves the resulting token straight to the linked Vercel project. Nothing secret is printed or written to disk.
 */
import * as http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync, execFileSync } from 'child_process';

const CLIENT_FILE = process.env.GOOGLE_CLIENT_FILE || path.join(os.homedir(), '.config/gdrive/client_secret.json');
const SCOPE = 'https://www.googleapis.com/auth/gmail.compose';
let redirectUri = '';

function vercelBin(): string {
  if (process.env.VERCEL_BIN) return process.env.VERCEL_BIN;
  const cache = path.join(os.homedir(), '.npm/_npx');
  for (const dir of fs.existsSync(cache) ? fs.readdirSync(cache) : []) {
    const bin = path.join(cache, dir, 'node_modules/.bin/vercel');
    if (fs.existsSync(bin)) return bin;
  }
  return 'vercel';
}

function saveEnv(name: string, value: string) {
  const bin = vercelBin();
  spawnSync(bin, ['env', 'rm', name, 'production', '--yes'], { stdio: 'ignore' });
  const r = spawnSync(bin, ['env', 'add', name, 'production'], { input: value, stdio: ['pipe', 'ignore', 'ignore'] });
  if (r.status !== 0) throw new Error(`Could not save ${name} to Vercel`);
}

(async () => {
  const client = JSON.parse(fs.readFileSync(CLIENT_FILE, 'utf8')).installed;
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  const code: string = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url || '/', 'http://localhost');
      if (u.pathname !== '/') return void res.writeHead(404).end();
      const ok = u.searchParams.get('state') === state && u.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(ok ? '<h2>Gmail connected. You can close this tab.</h2>' : '<h2>Not connected. Go back to the terminal.</h2>');
      server.close();
      ok ? resolve(u.searchParams.get('code') as string) : reject(new Error(u.searchParams.get('error') || 'No code returned'));
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      redirectUri = `http://localhost:${port}`;
      const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      auth.search = new URLSearchParams({
        client_id: client.client_id,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString();
      console.log('Opening Google in your browser. Pick the Gmail account that has rusan@axiomsdigital.com and click Allow.');
      console.log('If nothing opens, paste this link into your browser:\n' + auth.toString() + '\n');
      try { execFileSync('open', [auth.toString()]); } catch { /* link printed above */ }
    });
    setTimeout(() => reject(new Error('Timed out after 5 minutes')), 300_000).unref();
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: client.client_id,
      client_secret: client.client_secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  const tokens: any = await tokenRes.json();
  if (!tokens.refresh_token) throw new Error(`Google did not return a refresh token (${tokens.error || 'unknown'})`);

  const profile: any = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  }).then((r) => r.json());

  saveEnv('GMAIL_OAUTH_CLIENT_ID', client.client_id);
  saveEnv('GMAIL_OAUTH_CLIENT_SECRET', client.client_secret);
  saveEnv('GMAIL_OAUTH_REFRESH_TOKEN', tokens.refresh_token);
  console.log(`Connected Gmail account: ${profile.emailAddress || '(unknown)'}. Saved to Vercel.`);
})().catch((err) => {
  console.error('Not connected:', err.message);
  process.exit(1);
});

