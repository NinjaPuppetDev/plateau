import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/graphql',
        destination: 'http://127.0.0.1:4000/graphql', // local backend
      },
    ];
  },
  // Allow ngrok origin to avoid dev CORS warnings
  allowedDevOrigins: [
    'https://madilyn-occludent-nonsegmentally.ngrok-free.dev',
  ],
};

export default nextConfig;
