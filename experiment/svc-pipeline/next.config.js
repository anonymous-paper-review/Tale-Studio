/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
  serverExternalPackages: ['@anthropic-ai/sdk', '@google/generative-ai'],
};

module.exports = nextConfig;
