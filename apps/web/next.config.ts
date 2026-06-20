import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@enpal/db"],
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
