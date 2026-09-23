// All dates on invoices, reports and screens are shown in Indian time
process.env.TZ = process.env.TZ || "Asia/Kolkata";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};
export default nextConfig;
