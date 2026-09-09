/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript-built ESM; Next must compile them rather
  // than treat them as prebuilt node modules.
  transpilePackages: [
    "@arkbridge/sdk",
    "@arkbridge/bridge-core",
    "@arkbridge/types",
    "@arkbridge/chain-registry",
    "@arkbridge/token-registry",
    "@arkbridge/config",
    "@arkbridge/indexer",
    "@arkbridge/ui",
  ],
};

export default nextConfig;
