import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript sources.
  transpilePackages: ['@refinement/core', '@refinement/shared'],
  // Native module: must be required at runtime, not bundled.
  serverExternalPackages: ['better-sqlite3'],
}

export default nextConfig
