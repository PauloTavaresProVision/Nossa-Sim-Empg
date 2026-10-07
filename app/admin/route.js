/**
 * GET /admin — página de login do backoffice.
 */

import { sessaoValida, ADMIN_CONFIGURADO } from '../../lib/admin';

export async function GET(request) {
  if (sessaoValida(request)) {
    return Response.redirect(new URL('/admin/relatorio', request.url), 303);
  }

  const erro = new URL(request.url).searchParams.get('erro');
  const aviso = !ADMIN_CONFIGURADO
    ? '<p class="erro">Backoffice não configurado no servidor (ADMIN_USER/ADMIN_PASS).</p>'
    : (erro ? '<p class="erro">Credenciais inválidas.</p>' : '');

  const html = `<!DOCTYPE html>
<html lang="pt-AO">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Backoffice | Simulador NOSSA Seguros</title>
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial, sans-serif;
    background: #F5F7FA; color: #1A2238;
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 1.25rem;
  }
  .caixa {
    background: #fff; border: 1px solid #D6DBE6; border-radius: 10px;
    padding: 2rem; width: 100%; max-width: 22rem;
  }
  .caixa img { height: 40px; display: block; margin: 0 auto 1.2rem; }
  h1 {
    font-size: .85rem; font-weight: 700; color: #0A1D3F;
    text-transform: uppercase; letter-spacing: .07em;
    border-left: 4px solid #7FBE3D; padding-left: .7rem;
    margin-bottom: 1.2rem;
  }
  label { font-size: .8rem; font-weight: 600; color: #3D4660; display: block; margin-bottom: .3rem; }
  input {
    width: 100%; height: 2.65rem; padding: 0 .8rem;
    border: 1px solid #D6DBE6; border-radius: 4px;
    font-size: .92rem; font-family: inherit; margin-bottom: 1rem;
  }
  input:focus { outline: none; border-color: #102E60; box-shadow: 0 0 0 3px rgba(16,46,96,.12); }
  button {
    width: 100%; height: 2.9rem; border: none; border-radius: 4px;
    background: #7FBE3D; color: #fff; cursor: pointer;
    font-size: .82rem; font-weight: 700; font-family: inherit;
    text-transform: uppercase; letter-spacing: .06em;
  }
  button:hover { background: #689E2F; }
  .erro {
    font-size: .8rem; color: #922B21; background: #FDF1F0;
    border: 1px solid #EFC4BE; border-radius: 4px;
    padding: .6rem .8rem; margin-bottom: 1rem;
  }
</style>
</head>
<body>
  <form class="caixa" method="POST" action="/api/admin/login">
    <img src="/logo-nossa.png" alt="NOSSA Seguros">
    <h1>Backoffice do Simulador</h1>
    ${aviso}
    <label for="user">Utilizador</label>
    <input type="text" id="user" name="user" autocomplete="username" required>
    <label for="pass">Password</label>
    <input type="password" id="pass" name="pass" autocomplete="current-password" required>
    <button type="submit">Entrar</button>
  </form>
</body>
</html>`;

  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
