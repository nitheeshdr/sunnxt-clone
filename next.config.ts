import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "sund-images.sunnxt.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "s3-ap-southeast-1.amazonaws.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "img-profile.sunnxt.in",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "img-profile.sunnxt.in",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "d2hdl36b3yoqpz.cloudfront.net",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
