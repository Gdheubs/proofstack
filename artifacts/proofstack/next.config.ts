import type { NextConfig } from "next";

const internalApiOrigin = process.env.API_INTERNAL_ORIGIN;
if (internalApiOrigin) {
  const url = new URL(internalApiOrigin);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.origin !== internalApiOrigin
  ) {
    throw new Error("API_INTERNAL_ORIGIN must be an exact HTTP(S) origin");
  }
}

const config: NextConfig = {
  async rewrites() {
    return internalApiOrigin
      ? [
          {
            source: "/api/:path*",
            destination: `${internalApiOrigin}/api/:path*`,
          },
        ]
      : [];
  },
  poweredByHeader: false,
  agentRules: false,
  devIndicators: false,
  transpilePackages: ["@workspace/api-client-react"],
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    ...(process.env.REPLIT_DEV_DOMAIN ? [process.env.REPLIT_DEV_DOMAIN] : []),
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          ...(process.env.NODE_ENV === "production"
            ? [
                { key: "Strict-Transport-Security", value: "max-age=31536000" },
                { key: "X-Frame-Options", value: "SAMEORIGIN" },
              ]
            : []),
        ],
      },
    ];
  },
};

export default config;
