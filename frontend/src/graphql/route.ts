// app/api/graphql/route.ts
import { NextRequest, NextResponse } from "next/server";

const LOCAL_BACKEND = 'http://127.0.0.1:4000/graphql';
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ? `${process.env.NEXT_PUBLIC_BACKEND_URL.replace(/\/$/, '')}/graphql` : LOCAL_BACKEND;

function buildForwardHeaders(req: NextRequest) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = req.headers.get('authorization');
  if (auth) headers['authorization'] = auth;
  const cookie = req.headers.get('cookie');
  if (cookie) headers['cookie'] = cookie;
  return headers;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const res = await fetch(BACKEND, { method: 'POST', headers: buildForwardHeaders(request), body });
    const text = await res.text();
    return new NextResponse(text, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  } catch (err:any) {
    console.error('GraphQL proxy error:', err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(BACKEND, { method: 'POST', headers: buildForwardHeaders(request), body: JSON.stringify({ query: '{ health }' }) });
    const text = await res.text();
    return new NextResponse(text, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  } catch (err:any) {
    console.error('GraphQL proxy GET error:', err);
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
