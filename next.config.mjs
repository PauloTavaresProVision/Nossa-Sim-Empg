/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return {
      // a raiz serve directamente o simulador estático em public/index.html
      beforeFiles: [{ source: '/', destination: '/index.html' }],
    };
  },
};

export default nextConfig;
