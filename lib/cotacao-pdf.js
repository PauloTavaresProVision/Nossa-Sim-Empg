/**
 * Geração do PDF da cotação, seguindo o modelo oficial da NOSSA Seguros
 * ("Seguro de Empregados Domésticos, Cotação", form 19.03, produto 10):
 *   Página 1: cabeçalho (logo + ícone do produto), TOMADOR DO SEGURO,
 *             PESSOA(S) SEGURA(S), RISCOS COBERTOS, PRÉMIOS
 *   Página 2: DECLARAÇÕES E AUTORIZAÇÕES FINAIS, data e assinatura
 *
 * Os valores são RECALCULADOS no servidor a partir dos salários (nunca os do
 * browser). Guardado em COTACOES_DIR com ID aleatório, servido em /cotacoes/[id].
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

/* mesmos parâmetros do modelo usados no front-end */
export const TAXA_SIMPLES = 0.02;
export const MESES_ANO = 13;

export const COTACOES_DIR = process.env.COTACOES_DIR || path.join(process.cwd(), 'cotacoes');
const TTL_DIAS = Number(process.env.COTACOES_TTL_DIAS || 90);

const NAVY  = rgb(10 / 255, 29 / 255, 63 / 255);
const VERDE = rgb(127 / 255, 190 / 255, 61 / 255);
const CINZA = rgb(0.42, 0.46, 0.55);
const TEXTO = rgb(0.15, 0.18, 0.25);

function formatAOA(v) {
  const partes = v.toFixed(2).split('.');
  return partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + partes[1];
}

/* as fontes standard do PDF só codificam WinAnsi (latim ocidental):
   remove qualquer carácter fora desse alfabeto (emojis, etc.) */
function limparTexto(texto) {
  return String(texto || '').replace(/[^\x20-\x7E -ÿ€‘’“”–—…]/g, '').trim();
}

export function calcularPremios(salarios) {
  const massaMensal = salarios.reduce((soma, s) => soma + s, 0);
  const massaAnual = massaMensal * MESES_ANO;
  const premioAnual = massaAnual * TAXA_SIMPLES;
  return {
    massaMensal,
    massaAnual,
    premioAnual,
    premioSemestral: premioAnual / 2,
    premioTrimestral: premioAnual / 4,
  };
}

/* aceita o corpo do pedido com `empregados` [{nome, funcao, salario}] ou,
   por retrocompatibilidade, `salarios` [números]; devolve lista saneada */
export function normalizarEmpregados(corpo, maxItens = 50, salarioMax = 1e9) {
  let itens = [];
  if (Array.isArray(corpo.empregados)) {
    itens = corpo.empregados.map((e) => ({
      nome: String((e && e.nome) || '').trim().slice(0, 60),
      funcao: String((e && e.funcao) || '').trim().slice(0, 40),
      salario: Number(e && e.salario),
    }));
  } else if (Array.isArray(corpo.salarios)) {
    itens = corpo.salarios.map((s) => ({ nome: '', funcao: '', salario: Number(s) }));
  }
  return itens
    .filter((e) => Number.isFinite(e.salario) && e.salario > 0 && e.salario <= salarioMax)
    .slice(0, maxItens);
}

/* apaga cotações antigas para o directório não crescer indefinidamente */
async function limparAntigas() {
  try {
    const limite = Date.now() - TTL_DIAS * 24 * 60 * 60e3;
    for (const nome of await fs.readdir(COTACOES_DIR)) {
      if (!nome.endsWith('.pdf')) continue;
      const caminho = path.join(COTACOES_DIR, nome);
      const info = await fs.stat(caminho);
      if (info.mtimeMs < limite) await fs.unlink(caminho);
    }
  } catch { /* limpeza é oportunista, nunca falha o pedido */ }
}

function quebrarLinhas(texto, fonte, tamanho, larguraMax) {
  const palavras = texto.split(' ');
  const linhas = [];
  let linha = '';
  for (const palavra of palavras) {
    const tentativa = linha ? linha + ' ' + palavra : palavra;
    if (fonte.widthOfTextAtSize(tentativa, tamanho) > larguraMax && linha) {
      linhas.push(linha);
      linha = palavra;
    } else {
      linha = tentativa;
    }
  }
  if (linha) linhas.push(linha);
  return linhas;
}

/* texto das declarações finais, transcrito do modelo oficial (form 19.03) */
const DECLARACOES = [
  'O Tomador do Seguro e o Segurado autorizam que os dados recolhidos no presente documento, bem como em outros documentos que vierem a ser fornecidos posteriormente, nomeadamente aquando da participação de um sinistro, sejam processados e armazenados informaticamente para efeitos de gestão da apólice de seguro, incluindo a disponibilização dos dados a outras empresas, nomeadamente do grupo, subcontratadas e resseguradores, podendo envolver a transferência da informação para outros países, bem como para efeitos de marketing directo.',
  'Estão cientes do respectivo direito de, a todo o tempo, solicitarem e obterem, por si ou através de representante, o acesso à totalidade da informação, podendo solicitar a sua correcção, aditamento ou eliminação, mediante o contacto directo ou por escrito, junto de qualquer agência ou Sede da NOSSA Seguros, ou enviar comunicação escrita para o apoioaocliente@nossaseguros.ao.',
  'O Tomador do Seguro e o Segurado comprometem-se a manter actualizados todos os dados fornecidos, bem como a comunicar quaisquer alterações aos mesmos, durante a vigência do contrato.',
  'O Tomador do Seguro e o Segurado declaram que as respostas contidas nestes questionários correspondem em absoluto à verdade, que não foi ocultada qualquer informação que possa vir a influir na decisão que o segurador venha a tomar acerca do seguro proposto.',
  'Declaram, também, que conhecem a sua obrigação de, antes da celebração do contrato de seguro, fornecerem com exatidão todas as informações relativas a circunstâncias que conheçam e razoavelmente devam ter por significativas para apreciação do risco pelo segurador, ainda que sejam circunstâncias que não tenham sido objeto do questionário fornecido por este e, que eventuais omissões, inexatidões e falsidades no que respeita a dados de fornecimento quer obrigatório, quer facultativo, são da sua responsabilidade e poderão ter consequências previstas na lei e nas Condições Gerais, nomeadamente de anulação do contrato.',
  'Mais declaram que estão cientes da obrigação de, durante a vigência do contrato de seguro, procederem à comunicação de quaisquer alterações às circunstâncias e ao risco do contrato.',
  'O Tomador do Seguro e o Segurado declaram ainda que tomaram conhecimento e aceitam a condição segundo a qual, independentemente da data de efectividade indicada pelo Tomador do Seguro na presente proposta, e sem prejuízo do prazo legal imperativo, a produção dos efeitos do contrato de seguro ficará condicionada à sua aceitação expressa pelo segurador, não podendo este último ser responsabilizado por qualquer indemnização antes da data de produção dos efeitos, salvo disposição expressa em contrário.',
  'Documentos complementares eventualmente solicitados, deverão ser entregues à NOSSA Seguros no prazo de 30 dias. A proposta será considerada sem efeito se este prazo não for cumprido.',
  'O contrato não produzirá qualquer efeito caso não se verifique o pagamento do prémio ou fracção inicial.',
  'O Tomador do Seguro reconhece que ao subscrever a presente proposta de seguro lhe foram fornecidas todas as informações pré-contratuais legalmente previstas e que recebeu um exemplar das Condições Gerais e Especiais, assim como uma estimativa do montante dos prémios (cujo montante definitivo depende da análise da proposta).',
  'O Tomador do Seguro declara que autoriza que a documentação do presente contrato de seguro lhe seja entregue em suporte electrónico duradouro, nomeadamente por via de correio electrónico, cujo endereço se compromete a facultar à NOSSA Seguros, obrigando-se ainda a mantê-lo actualizado.',
  'Por este motivo, a falta de entrega da documentação por não actualização do endereço eletrónico ou por errada indicação do mesmo à NOSSA Seguros não poderá, em caso algum, acarretar responsabilidades para a seguradora.',
];

const RISCOS = [
  ['Riscos traumatológicos', 'no âmbito da actividade laboral e no trajecto entre a residência e o local de trabalho, e doenças profissionais (Decreto n.º 53/05, de 15 de Agosto).'],
  ['Incapacidade Temporária Absoluta:', '65% da remuneração de referência a partir do 1.º dia.'],
  ['Incapacidade Permanente Absoluta:', 'pensão mensal de 80% (todo e qualquer trabalho) ou 70% (trabalho habitual) da remuneração de referência.'],
  ['Incapacidade Permanente Parcial -', 'pensão mensal igual a 70% da redução sofrida na capacidade geral de ganho.'],
  ['Prestações por Morte -', 'cônjuge 30% (40% após idade de reforma); filhos 20%, 40% ou 60% consoante sejam um, dois ou três ou mais.'],
  ['Despesas de Funeral -', 'até dois salários; toda a assistência médica no âmbito do sinistro.'],
];

/* devolve os bytes do PDF, sem gravar nada em disco (usado no download directo)
   empregados: [{nome, funcao, salario}] */
export async function gerarPdfBytes({ nome, telefone, empregados }) {
  nome = limparTexto(nome);
  empregados = empregados.map((e) => ({ ...e, nome: limparTexto(e.nome), funcao: limparTexto(e.funcao) }));
  const calculo = calcularPremios(empregados.map((e) => e.salario));

  const doc = await PDFDocument.create();
  doc.setTitle('Seguro de Empregados Domésticos - Cotação - NOSSA Seguros');
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);

  const A4 = [595.28, 841.89];
  const margem = 40;
  const largura = A4[0];
  const larguraUtil = largura - margem * 2;

  /* imagens (opcionais: sem elas o PDF continua válido) */
  let logo = null, icone = null;
  try { logo = await doc.embedPng(await fs.readFile(path.join(process.cwd(), 'public', 'logo-nossa.png'))); } catch {}
  try { icone = await doc.embedPng(await fs.readFile(path.join(process.cwd(), 'public', 'ilustracao-empregada.png'))); } catch {}

  const totalPaginas = 2;

  /* cabeçalho conforme o original partilhado pela cliente:
     logo à esquerda; à direita ícone + "EMPREGADOS DOMÉSTICOS" com "Cotação"
     alinhado à direita por baixo, e o selo verde "10" centrado verticalmente */
  function cabecalho(pagina) {
    const topo = 800;
    if (logo) {
      const w = 105;
      pagina.drawImage(logo, { x: margem, y: topo - 6, width: w, height: w * (logo.height / logo.width) });
    }
    const eixoY = topo + 2;                       // eixo vertical do bloco direito
    const seloR = 15;
    const seloCx = largura - margem - seloR;

    const titulo = 'EMPREGADOS DOMÉSTICOS';
    const tamTitulo = 11.5;
    const wTitulo = negrito.widthOfTextAtSize(titulo, tamTitulo);
    const bordaDireitaTexto = seloCx - seloR - 9; // texto encosta à esquerda do selo
    pagina.drawText(titulo, { x: bordaDireitaTexto - wTitulo, y: eixoY + 1.5, size: tamTitulo, font: negrito, color: VERDE });

    const wCot = negrito.widthOfTextAtSize('Cotação', 9);
    pagina.drawText('Cotação', { x: bordaDireitaTexto - wCot, y: eixoY - 11, size: 9, font: negrito, color: VERDE });

    if (icone) {
      const h = 38;
      const wI = h * (icone.width / icone.height);
      pagina.drawImage(icone, { x: bordaDireitaTexto - wTitulo - wI - 10, y: eixoY - 15, width: wI, height: h });
    }

    pagina.drawCircle({ x: seloCx, y: eixoY - 2, size: seloR, color: VERDE });
    const w10 = negrito.widthOfTextAtSize('10', 13);
    pagina.drawText('10', { x: seloCx - w10 / 2, y: eixoY - 6.5, size: 13, font: negrito, color: rgb(1, 1, 1) });
    return topo - 34;
  }

  function rodape(pagina, numero) {
    pagina.drawLine({ start: { x: margem, y: 54 }, end: { x: largura - margem, y: 54 }, thickness: 0.75, color: NAVY });
    const linhas = [
      'Nova Sociedade de Seguros de Angola, S. A.  |  Av. Pedro de Castro Van-Dúnem "Loy", Academia BAI, Bloco C, 4º Andar, Morro Bento, Luanda Sul - Angola',
      'Tel. (+244) 923 190 860 |  www.nossaseguros.ao',
      'Nossa Seguros, S.A - Capital Social: KZ 5.000.000.000,00 - Reg. Cons. Reg. Com. Luanda Nº 1142 (5/11/2004) - N.I.F. 5401113420',
    ];
    let yy = 46;
    for (const l of linhas) {
      const w = fonte.widthOfTextAtSize(l, 5.8);
      pagina.drawText(l, { x: (largura - w) / 2, y: yy, size: 5.8, font: fonte, color: NAVY });
      yy -= 8;
    }
    pagina.drawText('19.03', { x: largura - margem - 20, y: 46, size: 6, font: fonte, color: CINZA });
    pagina.drawText(numero + '/' + totalPaginas, { x: largura - margem - 20, y: 38, size: 6, font: fonte, color: CINZA });
  }

  /* ================= Página 1 ================= */
  const p1 = doc.addPage(A4);
  let y = cabecalho(p1);

  function seccao(titulo) {
    y -= 10;
    p1.drawLine({ start: { x: margem, y }, end: { x: largura - margem, y }, thickness: 0.5, color: VERDE });
    y -= 13;
    const w = negrito.widthOfTextAtSize(titulo, 8.5);
    p1.drawText(titulo, { x: (largura - w) / 2, y, size: 8.5, font: negrito, color: NAVY });
    y -= 7;
    p1.drawLine({ start: { x: margem, y }, end: { x: largura - margem, y }, thickness: 0.5, color: VERDE });
    y -= 16;
  }

  /* par rótulo/valor na posição x, com folga entre ambos */
  function campo(pagina, x, yy, rotulo, valor) {
    pagina.drawText(rotulo, { x, y: yy, size: 8, font: negrito, color: TEXTO });
    const wR = negrito.widthOfTextAtSize(rotulo, 8);
    if (valor) pagina.drawText(valor, { x: x + wR + 6, y: yy, size: 8, font: fonte, color: TEXTO });
  }

  /* ---- Tomador do Seguro ---- */
  seccao('TOMADOR DO SEGURO');
  const telFormatado = telefone ? '(+244) ' + telefone.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : '';
  campo(p1, margem, y, 'Nome:', nome || '');
  campo(p1, margem + 240, y, 'Telefone/Telemóvel:', telFormatado);
  campo(p1, margem + 425, y, 'Morada:', '');
  y -= 18;

  /* ---- Pessoas Seguras ---- */
  seccao('PESSOA(S) SEGURA(S)');
  campo(p1, margem, y, 'Número de Empregados:', String(empregados.length));
  y -= 15;
  empregados.forEach((e) => {
    campo(p1, margem, y, 'Nome:', e.nome || '');
    campo(p1, margem + 190, y, 'Género:', '');
    campo(p1, margem + 265, y, 'Função:', e.funcao || '');
    campo(p1, margem + 425, y, 'Salário:', formatAOA(e.salario) + ' Kz');
    y -= 14;
  });
  y -= 4;
  campo(p1, margem, y, 'Massa salarial mensal:', formatAOA(calculo.massaMensal) + ' Kz');
  y -= 14;
  campo(p1, margem, y, 'Massa salarial anual:', formatAOA(calculo.massaAnual) + ' Kz');
  y -= 12;

  /* ---- Riscos Cobertos ---- */
  seccao('RISCOS COBERTOS');
  for (const [titulo, resto] of RISCOS) {
    /* visto desenhado (o carácter ✓ não existe em WinAnsi) */
    p1.drawLine({ start: { x: margem, y: y + 2.5 }, end: { x: margem + 2.4, y: y + 0.3 }, thickness: 1.2, color: VERDE });
    p1.drawLine({ start: { x: margem + 2.4, y: y + 0.3 }, end: { x: margem + 7, y: y + 6.5 }, thickness: 1.2, color: VERDE });
    const texto = titulo + ' ' + resto;
    const linhas = quebrarLinhas(texto, fonte, 8, larguraUtil - 16);
    let primeira = true;
    for (const l of linhas) {
      if (primeira && l.startsWith(titulo)) {
        p1.drawText(titulo, { x: margem + 14, y, size: 8, font: negrito, color: TEXTO });
        const wT = negrito.widthOfTextAtSize(titulo, 8);
        p1.drawText(l.slice(titulo.length), { x: margem + 14 + wT, y, size: 8, font: fonte, color: TEXTO });
      } else {
        p1.drawText(l, { x: margem + 14, y, size: 8, font: fonte, color: TEXTO });
      }
      primeira = false;
      y -= 11.5;
    }
    y -= 2.5;
  }

  /* ---- Prémios ---- */
  seccao('PRÉMIOS');
  campo(p1, margem, y, 'Prémio Total Anual:', formatAOA(calculo.premioAnual) + ' Kz');
  y -= 14;
  campo(p1, margem, y, 'Prémio Total Semestral:', formatAOA(calculo.premioSemestral) + ' Kz');
  y -= 14;
  campo(p1, margem, y, 'Prémio Total Trimestral:', formatAOA(calculo.premioTrimestral) + ' Kz');
  y -= 14;

  const dataTexto = new Date().toLocaleDateString('pt-PT', { timeZone: 'Africa/Luanda' });
  p1.drawText('Simulação gerada em ' + dataTexto + '. Valores meramente informativos; não constitui proposta contratual.', {
    x: margem, y: y - 6, size: 6.5, font: fonte, color: CINZA,
  });

  rodape(p1, 1);

  /* ================= Página 2 ================= */
  const p2 = doc.addPage(A4);
  let y2 = cabecalho(p2);

  y2 -= 10;
  p2.drawLine({ start: { x: margem, y: y2 }, end: { x: largura - margem, y: y2 }, thickness: 0.5, color: VERDE });
  y2 -= 13;
  const t2 = 'DECLARAÇÕES E AUTORIZAÇÕES FINAIS DO TOMADOR DO SEGURO / SEGURADO';
  const wT2 = negrito.widthOfTextAtSize(t2, 8.5);
  p2.drawText(t2, { x: (largura - wT2) / 2, y: y2, size: 8.5, font: negrito, color: NAVY });
  y2 -= 7;
  p2.drawLine({ start: { x: margem, y: y2 }, end: { x: largura - margem, y: y2 }, thickness: 0.5, color: VERDE });
  y2 -= 16;

  for (const paragrafo of DECLARACOES) {
    for (const l of quebrarLinhas(paragrafo, fonte, 7.3, larguraUtil)) {
      p2.drawText(l, { x: margem, y: y2, size: 7.3, font: fonte, color: TEXTO });
      y2 -= 9.6;
    }
    y2 -= 4.5;
  }

  /* data e assinatura */
  y2 -= 18;
  campo(p2, margem, y2, 'Data:', dataTexto);
  p2.drawText('Assinatura do Tomador do Seguro', { x: 350, y: y2, size: 8, font: fonte, color: TEXTO });
  p2.drawLine({ start: { x: 330, y: y2 - 42 }, end: { x: largura - margem, y: y2 - 42 }, thickness: 0.75, color: TEXTO });

  rodape(p2, 2);

  return await doc.save();
}

/* gera o PDF, grava-o em disco e devolve o id (usado no link do field11) */
export async function gerarPdfCotacao({ nome, telefone, empregados }) {
  const bytes = await gerarPdfBytes({ nome, telefone, empregados });
  await fs.mkdir(COTACOES_DIR, { recursive: true });
  const id = randomUUID();
  await fs.writeFile(path.join(COTACOES_DIR, id + '.pdf'), bytes);
  limparAntigas(); // sem await: corre em segundo plano
  return id;
}
