/** @type {import('next').NextConfig} */
const isStandaloneBuild = process.env.NEXT_STANDALONE === "true";

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" }
        ]
      }
    ];
  },
  ...(isStandaloneBuild
    ? {
        output: "standalone",
        outputFileTracingIncludes: {
          "/*": [
            "./node_modules/.prisma/client/**/*",
            "./node_modules/@prisma/client/**/*"
          ],
          "/api/**/*": [
            "./node_modules/.prisma/client/**/*",
            "./node_modules/@prisma/client/**/*"
          ]
        }
      }
    : {})
};

export default nextConfig;
