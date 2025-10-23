// app/page.tsx
'use client';
import React from 'react';
import dynamic from 'next/dynamic';

// import the real page (this may import other modules)
import Page from '../src/app/page';

// Dynamically import providers module to keep errors explicit
// We use a synchronous import here because Next's bundler will still resolve it,
// but we handle both default and named exports safely.
import * as ProvidersModule from '../src/app/providers';

const Providers =
  // prefer default
  (ProvidersModule as any).default ??
  // then named Providers
  (ProvidersModule as any).Providers ??
  // then FarcasterProvider if it's exported and expected to wrap
  (ProvidersModule as any).FarcasterProvider ??
  // fallback: identity wrapper
  (({ children }: any) => <>{children}</>);

export default function RootDelegator() {
  // If Providers is actually a single provider (like FarcasterProvider), we need to render it with children.
  // If it's a provider component factory expecting props, this best-effort wrapper covers common cases.
  return (
    // @ts-ignore - runtime guard above ensures Providers is callable
    <Providers>
      <Page />
    </Providers>
  );
}
