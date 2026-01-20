/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  experimental: {
    instrumentationHook: true, // Enable instrumentation hook for cron initialization
  },
};

export default nextConfig;
