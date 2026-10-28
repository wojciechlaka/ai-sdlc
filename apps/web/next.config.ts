import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript sources.
  transpilePackages: ['@refinement/core', '@refinement/shared'],
  // Native module: must be required at runtime, not bundled.
  serverExternalPackages: ['better-sqlite3'],
  // The route indicator covers the sidebar in demos; compile and runtime errors are still shown.
  devIndicators: false,
}

export default nextConfig
