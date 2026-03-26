/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@deepgram/sdk'],
  },
};

module.exports = nextConfig;
