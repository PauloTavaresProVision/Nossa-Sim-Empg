# Simulador de Seguro de Empregados Domésticos — NOSSA Seguros

Aplicação Next.js que serve o simulador (página estática em `public/index.html`)
e o endpoint `POST /api/contactar` (click to call uCall/GoContact).

## Modelo de cálculo (base: Excel de cotação NOSSA)

- Massa salarial anual = salário mensal × 13
- Prémio anual = massa salarial anual × 2% (taxa simples)
- Semestral = anual / 2 · Trimestral = anual / 4 · Mensal = anual / 12

As constantes estão no `<script>` de `public/index.html` (`TAXA_SIMPLES`, `MESES_ANO`).

## Deploy com Docker (Contabo)

```bash
# 1. copiar o projecto para o servidor e entrar na pasta
# 2. configurar a chave (nunca commitar o .env)
cp .env.example .env
nano .env            # UCALL_APIKEY=...

# 3. construir e arrancar
docker compose up -d --build

# 4. verificar
curl http://localhost:6510/
```

O serviço fica em `127.0.0.1:6510` (apenas localhost). O acesso público
faz-se através do reverse proxy (nginx/traefik/caddy) que trata o TLS e
**tem de passar o header `X-Forwarded-For`**, senão o limite de pedidos por
IP do `/api/contactar` aplica-se globalmente a todos os visitantes.
Exemplo nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:6510;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $host;
}
```

## Segurança do /api/contactar

- A apikey da uCall é lida da variável de ambiente `UCALL_APIKEY` e nunca chega ao browser.
- Validação no servidor: nome (até 100 caracteres) e telefone angolano (9 dígitos começado por 9; indicativo 244 aceite e removido).
- Limite de 5 pedidos aceites por IP a cada 10 minutos (constantes `MAX_PEDIDOS` / `JANELA_MS` em `app/api/contactar/route.js`).
- Payload enviado à uCall fixado no servidor (`dataBase_Id`, `direct_To_Hopper`, `field7`, `field11`).

## PDF da cotação (field11)

Quando o pedido de contacto inclui salários, o servidor recalcula os prémios,
gera um PDF da cotação (`lib/cotacao-pdf.js`) e envia o link no `field11` do
payload da uCall (ex.: `https://dominio/cotacoes/<uuid>`), para o operador do
call center abrir durante a chamada. Sem salários, o `field11` segue `website`.

- Os PDFs ficam em `cotacoes/` (volume Docker), servidos por `GET /cotacoes/[id]`
  com um UUID aleatório impossível de adivinhar.
- Limpeza automática: PDFs com mais de `COTACOES_TTL_DIAS` dias (por omissão 90)
  são apagados.
- Requer `PUBLIC_BASE_URL` definida no `.env`; sem ela o PDF não é gerado e o
  pedido segue na mesma.

## Desenvolvimento local

```bash
npm install
UCALL_APIKEY="..." npm run dev   # http://localhost:3000
```
