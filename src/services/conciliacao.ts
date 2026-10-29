import type { Integration } from '../types';
import type { Tratativa } from './tratativaService';
import { isoLocal, deIso, dentroDoPeriodo } from '../utils/periodo';

export type RecorteConciliacao = 'dia' | 'semana' | 'mes';

export interface Faixa {
  chave: string;
  label: string;
  valor: number;
}

export interface PontoConciliacao {
  chave: string;
  label: string;
  emitidas: number;
  integradas: number;
  naoIntegradas: number;
  percentual: number | null;
}

export interface CampoQualidade {
  campo: string;
  universo: string;
  presentes: number;
  total: number;
}

export interface VsAnterior {
  de: string;
  ate: string;
  emitidas: number;
  integradas: number;
  naoIntegradas: number;
  taxa: number | null;
}

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const ehAlloca = (item: Integration) => item.status === 'completed' || item.status === 'pending';

export const emissaoIso = (item: Integration) => (item.metadata?.dataEmissao ?? '').slice(0, 10);

export const pct = (parte: number, total: number): number | null =>
  total ? Math.round((parte / total) * 1000) / 10 : null;

const inicioSemana = (data: string): string => {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

export function recorteSugerido(dias: string[]): RecorteConciliacao {
  const ordenados = [...new Set(dias.filter(Boolean))].sort();
  if (ordenados.length < 2) return 'dia';
  const span = Math.round((deIso(ordenados.at(-1)!).getTime() - deIso(ordenados[0]).getTime()) / 86_400_000);
  if (span <= 14) return 'dia';
  if (span <= 90) return 'semana';
  return 'mes';
}

export function chaveRecorte(dia: string, recorte: RecorteConciliacao): string {
  if (!dia) return '';
  if (recorte === 'mes') return dia.slice(0, 7);
  if (recorte === 'semana') return inicioSemana(dia);
  return dia;
}

export const JANELA_RECORTE: Record<RecorteConciliacao, { qtd: number; rotulo: string }> = {
  dia: { qtd: 14, rotulo: 'Últimos 14 dias' },
  semana: { qtd: 12, rotulo: 'Últimas 12 semanas' },
  mes: { qtd: 12, rotulo: 'Últimos 12 meses' },
};

/** Primeira chave da janela que termina em `ultima` (dia, semana ou mês). */
export function inicioDaJanela(ultima: string, recorte: RecorteConciliacao): string {
  const { qtd } = JANELA_RECORTE[recorte];
  if (recorte === 'mes') {
    const [ano, mes] = ultima.split('-').map(Number);
    return isoLocal(new Date(ano, mes - qtd, 1)).slice(0, 7);
  }
  const d = deIso(ultima);
  d.setDate(d.getDate() - (recorte === 'semana' ? 7 : 1) * (qtd - 1));
  return isoLocal(d);
}

export function labelRecorte(chave: string, recorte: RecorteConciliacao): string {
  if (!chave) return 'Sem data';
  if (recorte === 'mes') {
    const [ano, m] = chave.split('-');
    return `${MES_CURTO[Number(m) - 1]}/${ano.slice(2)}`;
  }
  const [, mes, dia] = chave.split('-');
  return `${dia}/${mes}`;
}

/** Dias de calendário entre emissão e criação na Intelipost. Não é um erro: os dois eventos acontecem em momentos diferentes. */
export function lagCalendario(item: Integration): number | null {
  const emissao = emissaoIso(item);
  const integracao = (item.metadata?.dataIntegracao ?? '').slice(0, 10);
  if (!emissao || !integracao) return null;
  return Math.round((deIso(integracao).getTime() - deIso(emissao).getTime()) / 86_400_000);
}

export function janelaAnterior(de: string, ate: string): { de: string; ate: string } {
  const dias = Math.round((deIso(ate).getTime() - deIso(de).getTime()) / 86_400_000) + 1;
  const ateAnt = deIso(de);
  ateAnt.setDate(ateAnt.getDate() - 1);
  const deAnt = new Date(ateAnt);
  deAnt.setDate(deAnt.getDate() - (dias - 1));
  return { de: isoLocal(deAnt), ate: isoLocal(ateAnt) };
}

function contarMapa(itens: Integration[], chave: (item: Integration) => string): Faixa[] {
  const mapa = new Map<string, number>();
  for (const item of itens) {
    const k = chave(item) || '(sem valor)';
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .map(([label, valor]) => ({ chave: label, label, valor }));
}

function idadePendente(emissao: string, hoje: string): string {
  if (!emissao) return 'sem_emissao';
  const dias = Math.round((deIso(hoje).getTime() - deIso(emissao).getTime()) / 86_400_000);
  if (dias <= 1) return '0_1';
  if (dias <= 3) return '2_3';
  if (dias <= 7) return '4_7';
  if (dias <= 15) return '8_15';
  return '16';
}

const IDADE: { chave: string; label: string }[] = [
  { chave: '0_1', label: '0–1 dia' },
  { chave: '2_3', label: '2–3 dias' },
  { chave: '4_7', label: '4–7 dias' },
  { chave: '8_15', label: '8–15 dias' },
  { chave: '16', label: '16 dias ou mais' },
  { chave: 'sem_emissao', label: 'Sem data de emissão' },
];

const LAG: { chave: string; label: string; testa: (n: number) => boolean }[] = [
  { chave: '0', label: 'Mesmo dia', testa: (n) => n === 0 },
  { chave: '1', label: '1 dia', testa: (n) => n === 1 },
  { chave: '2_7', label: '2–7 dias', testa: (n) => n >= 2 && n <= 7 },
  { chave: '8_15', label: '8–15 dias', testa: (n) => n >= 8 && n <= 15 },
  { chave: '16', label: '16 dias ou mais', testa: (n) => n >= 16 },
  { chave: 'neg', label: 'Integração antes da emissão', testa: (n) => n < 0 },
];

function qualidade(campo: string, universo: string, itens: Integration[], ok: (item: Integration) => boolean): CampoQualidade {
  return { campo, universo, presentes: itens.filter(ok).length, total: itens.length };
}

export function resumirConciliacao(
  notas: Integration[],
  opcoes: {
    recorte: RecorteConciliacao;
    hoje: string;
    tratativas: Record<string, Tratativa>;
    ticketsPorNf: Map<string, string[]> | null;
    ticketsDe: (item: Integration) => string[];
    periodo: { de: string | null; ate: string | null };
    todasOperacionais: Integration[];
  },
) {
  const alloca = notas.filter(ehAlloca);
  const integradas = notas.filter((i) => i.status === 'completed');
  const naoIntegradas = notas.filter((i) => i.status === 'pending');
  const soIntelipost = notas.filter((i) => i.status === 'intelipost_only');
  const emitidas = alloca.length;
  const taxa = pct(integradas.length, emitidas);
  const triangulares = integradas.filter((i) => i.metadata?.validacao === 'triangular');

  const pendentesSemTratativa = naoIntegradas.filter((i) => !opcoes.tratativas[i.id]?.tratado).length;
  const pendentesComTratativa = naoIntegradas.filter((i) => opcoes.tratativas[i.id]?.tratado).length;
  const tratadas = notas.filter((i) => opcoes.tratativas[i.id]?.tratado).length;

  const comTicket = opcoes.ticketsPorNf
    ? naoIntegradas.filter((i) => opcoes.ticketsDe(i).length > 0).length
    : null;
  const semTicket = opcoes.ticketsPorNf && comTicket !== null ? naoIntegradas.length - comTicket : null;

  const idade = IDADE.map((faixa) => ({
    ...faixa,
    valor: naoIntegradas.filter((i) => idadePendente(emissaoIso(i), opcoes.hoje) === faixa.chave).length,
  })).filter((f) => f.valor > 0);

  const lags = integradas.map(lagCalendario).filter((n): n is number => n !== null);
  const porLag = LAG.map((faixa) => ({
    chave: faixa.chave,
    label: faixa.label,
    valor: lags.filter(faixa.testa).length,
  }));

  const porDia = new Map<string, PontoConciliacao>();
  for (const item of alloca) {
    const dia = emissaoIso(item);
    const chave = chaveRecorte(dia, opcoes.recorte) || 'sem_data';
    const ponto =
      porDia.get(chave) ??
      ({
        chave,
        label: chave === 'sem_data' ? 'Sem emissão' : labelRecorte(chave, opcoes.recorte),
        emitidas: 0,
        integradas: 0,
        naoIntegradas: 0,
        percentual: null,
      } satisfies PontoConciliacao);
    ponto.emitidas += 1;
    if (item.status === 'completed') ponto.integradas += 1;
    else ponto.naoIntegradas += 1;
    porDia.set(chave, ponto);
  }
  const tendencia = [...porDia.values()]
    .sort((a, b) => a.chave.localeCompare(b.chave))
    .map((p) => ({ ...p, percentual: pct(p.integradas, p.emitidas) }));

  let vsAnterior: VsAnterior | null = null;
  if (opcoes.periodo.de && opcoes.periodo.ate) {
    const janela = janelaAnterior(opcoes.periodo.de, opcoes.periodo.ate);
    const anteriores = opcoes.todasOperacionais.filter(
      (i) => ehAlloca(i) && dentroDoPeriodo(emissaoIso(i), janela.de, janela.ate),
    );
    if (anteriores.length > 0) {
      const int = anteriores.filter((i) => i.status === 'completed').length;
      vsAnterior = {
        ...janela,
        emitidas: anteriores.length,
        integradas: int,
        naoIntegradas: anteriores.length - int,
        taxa: pct(int, anteriores.length),
      };
    }
  }

  const allocaCompleto = (campo: (i: Integration) => string | undefined) => (i: Integration) => Boolean(campo(i)?.trim());

  return {
    emitidas,
    integradas: integradas.length,
    naoIntegradas: naoIntegradas.length,
    soIntelipost: soIntelipost.length,
    taxa,
    triangulares: triangulares.length,
    pendentesSemTratativa,
    pendentesComTratativa,
    tratadas,
    comTicket,
    semTicket,
    idade,
    porLag,
    lagsMedidos: lags.length,
    tendencia,
    porTipoPendente: contarMapa(naoIntegradas, (i) => i.metadata?.tipoNota ?? ''),
    porTipoEmitida: contarMapa(alloca, (i) => i.metadata?.tipoNota ?? ''),
    porUfPendente: contarMapa(naoIntegradas, (i) => i.metadata?.uf ?? ''),
    porTransportadora: contarMapa(integradas, (i) => i.metadata?.transportadora ?? ''),
    vsAnterior,
    qualidade: [
      qualidade('Data de emissão', 'Notas da Alloca07', alloca, allocaCompleto((i) => i.metadata?.dataEmissao)),
      qualidade('Tipo da nota', 'Notas da Alloca07', alloca, allocaCompleto((i) => i.metadata?.tipoNota)),
      qualidade('Série da NF', 'Notas da Alloca07', alloca, allocaCompleto((i) => i.metadata?.serieNf)),
      qualidade('UF de destino', 'Notas da Alloca07', alloca, allocaCompleto((i) => i.metadata?.uf)),
      qualidade('Cliente', 'Notas da Alloca07', alloca, allocaCompleto((i) => i.metadata?.clienteDestino)),
      qualidade('Rastreio', 'Integradas', integradas, allocaCompleto((i) => i.metadata?.rastreio)),
      qualidade('Transportadora', 'Integradas', integradas, allocaCompleto((i) => i.metadata?.transportadora)),
      qualidade('Data na Intelipost', 'Integradas', integradas, allocaCompleto((i) => i.metadata?.dataIntegracao)),
    ],
  };
}

export type ResumoConciliacao = ReturnType<typeof resumirConciliacao>;
