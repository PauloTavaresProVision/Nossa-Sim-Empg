/* Layout mínimo exigido pelo App Router. O simulador em si é a página
   estática public/index.html, servida na raiz via rewrite (next.config.mjs). */
export const metadata = {
  title: 'Simulador de Seguro de Empregados Domésticos | NOSSA Seguros',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-AO">
      <body>{children}</body>
    </html>
  );
}
