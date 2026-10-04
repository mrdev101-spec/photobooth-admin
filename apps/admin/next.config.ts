import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source
  transpilePackages: ['@photobooth/catalog', '@photobooth/contracts', '@photobooth/error-codes'],
  // Native / Node-only modules stay out of the bundle
  serverExternalPackages: ['@node-rs/argon2', 'mysql2'],
  poweredByHeader: false,
  // Dev server only: also serve dev assets to http://127.0.0.1:3100 (Next blocks non-localhost dev origins)
  allowedDevOrigins: ['127.0.0.1'],
  experimental: {
    // Central template uploads (overlay PNG up to 8 MB). Note: Vercel caps request bodies at
    // 4.5 MB, so large overlays there need direct-to-R2 uploads (docs §18.7).
    serverActions: { bodySizeLimit: '10mb' }
  }
};

export default nextConfig;
