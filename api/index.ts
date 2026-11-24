import type { IncomingMessage, ServerResponse } from 'http';
import { handleRequest } from '../src/webhook-server';

// Vercel entry point: every path is rewritten here (see vercel.json).
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await handleRequest(req, res);
}
