import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL ?? 'http://api:3001';
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'host',
  // Node fetch auto-decompresses responses but the original encoding/length
  // headers stick around in apiRes.headers — forwarding them to the browser
  // makes it try to decompress an already-decoded body.
  'content-encoding',
  'content-length',
]);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${API_BASE}/api/${path.join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
  }

  const apiRes = await fetch(target, init);
  const resHeaders = new Headers();
  apiRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return;
    if (!HOP_BY_HOP.has(key.toLowerCase())) resHeaders.set(key, value);
  });
  for (const cookie of apiRes.headers.getSetCookie()) {
    resHeaders.append('set-cookie', cookie);
  }

  const body = apiRes.status === 204 ? null : await apiRes.arrayBuffer();
  return new NextResponse(body, { status: apiRes.status, headers: resHeaders });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
  proxy as OPTIONS,
};
