import type { NextConfig } from 'next';

// Every page: no framing by other sites (clickjacking), no MIME sniffing, HTTPS only, and a CSP
// limited to what does not need nonces (script-src stays default: Next inlines its bootstrap).
const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }] : [])
];

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source
  transpilePackages: ['@photobooth/catalog', '@photobooth/contracts', '@photobooth/error-codes'],
  // Native / Node-only modules stay out of the bundle
  serverExternalPackages: ['@node-rs/argon2', 'mysql2'],
  poweredByHeader: false,
  headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  // Dev server only: also serve dev assets to http://127.0.0.1:3100 (Next blocks non-localhost dev origins)
  // DEV_LAN_HOST (e.g. 192.168.1.20): a phone on the same network can open the dev server too
  allowedDevOrigins: ['127.0.0.1', ...(process.env.DEV_LAN_HOST ? [process.env.DEV_LAN_HOST] : [])],
  experimental: {
    // Central template uploads (overlay PNG up to 8 MB). Note: Vercel caps request bodies at
    // 4.5 MB, so large overlays there need direct-to-R2 uploads (docs §18.7).
    serverActions: { bodySizeLimit: '10mb' }
  }
};

export default nextConfig;
