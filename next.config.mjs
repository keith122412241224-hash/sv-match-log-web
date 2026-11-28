/** @type {import('next').NextConfig} */
const nextConfig = {
  logging: { incomingRequests: { ignore: [/^\/auth\/confirm(?:[/?]|$)/i] } }
};

export default nextConfig;
