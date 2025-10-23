import { NextRequest, NextResponse } from 'next/server';

const LOCAL_BACKEND = 'http://127.0.0.1:4000/graphql';
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL
  ? `${process.env.NEXT_PUBLIC_BACKEND_URL.replace(/\/$/, '')}/graphql`
  : LOCAL_BACKEND;

function headersFrom(req: NextRequest) {
  const h: Record<string,string> = { 'Content-Type': 'application/json' };
  const a = req.headers.get('authorization'); if (a) h.authorization = a;
  const c = req.headers.get('cookie'); if (c) h.cookie = c;
  return h;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const r = await fetch(BACKEND, { method: 'POST', headers: headersFrom(req), body });
    const text = await r.text();
    return new NextResponse(text, { status: r.status, headers: { 'Content-Type': 'application/json' } });
  } catch (err:any) {
    console.error('GraphQL proxy POST error:', err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const r = await fetch(BACKEND, { method: 'POST', headers: headersFrom(req), body: JSON.stringify({ query: '{ health }' }) });
    const text = await r.text();
    return new NextResponse(text, { status: r.status, headers: { 'Content-Type': 'application/json' } });
  } catch (err:any) {
    console.error('GraphQL proxy GET error:', err);
    return NextResponse.json({ ok:false, error: String(err?.message || err) }, { status: 500 });
  }
}
