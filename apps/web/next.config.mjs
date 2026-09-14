/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /*
   * Standalone output: Next traces exactly the files the server needs and emits
   * a self-contained directory with its own minimal `node_modules`. Without it
   * a production image has to carry the whole pnpm workspace — every dev
   * dependency, every package's source — to run a server that uses a fraction
   * of it.
   */
  output: "standalone",
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
