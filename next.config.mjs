/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `/wave` is the short alias for `/api/wave`. This lives here rather than in
  // vercel.json because platform rewrites do not run under `next dev` — the
  // alias would work in production and 404 locally, which makes local testing
  // lie to you. Vercel honours these just the same.
  async rewrites() {
    return [{ source: '/wave', destination: '/api/wave' }];
  },
};

export default nextConfig;
