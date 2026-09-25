import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['fast-xml-parser', '@nfewizard/nfse', '@nfewizard/shared', 'libxmljs2', 'bindings'],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@/emissor': path.resolve(__dirname, 'src/emissor'),
      '@': path.resolve(__dirname, 'src'),
    };
    return config;
  },
};

export default nextConfig;
