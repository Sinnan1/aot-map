import type { NextConfig } from "next";

const config: NextConfig = {
  // pglite is only used for zero-setup local dev (no DATABASE_URL). Keep it out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
};

export default config;
