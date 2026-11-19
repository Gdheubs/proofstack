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
          // git clone <site>/<owner>/<repo>.git (see proxy.ts GIT_PATH).
          ...["info/refs", "git-upload-pack", "git-receive-pack"].map(
            (service) => ({
              source: `/:owner/:repo([^/]+)\\.git/${service}`,
              destination: `${internalApiOrigin}/api/gitn/:owner/:repo/${service}`,
            }),
          ),
        ]
      : [];
  },
  poweredByHeader: false,
  agentRules: false,
  devIndicators: false,
  transpilePackages: ["@workspace/api-client-react"],
  allowedDevOrigins: ["localhost", "127.0.0.1"],
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
      // The exam pages are the only ones that may use the camera and
      // microphone, and only for this site itself (never an embedded frame).
      // A later entry replaces the same header of an earlier one and leaves
      // the earlier entry's other headers in force. The value must match
      // EXAM_PERMISSIONS_POLICY in lib/chrome.ts; a test compares the two.
      ...["/assessments/take/:path*", "/assessments/device-check"].map(
        (source) => ({
          source,
          headers: [
            {
              key: "Permissions-Policy",
              value:
                "camera=(self), microphone=(self), fullscreen=(self), geolocation=(), payment=(), display-capture=()",
            },
          ],
        }),
      ),
    ];
  },
};

export default config;
