export default {
  poweredByHeader: false,
  experimental: { cpus: 2 },
  async rewrites() {
    const upstream = process.env.API_INTERNAL_URL || "http://127.0.0.1:3002";
    return [{ source: "/api/v1/:path*", destination: `${upstream}/api/v1/:path*` }];
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
    ] }];
  },
};
