/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.BREMEN_NEXT_DIST_DIR || ".next"
};

export default nextConfig;
