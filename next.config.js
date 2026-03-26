/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['@deepgram/sdk'],
  },
};

module.exports = nextConfig;
