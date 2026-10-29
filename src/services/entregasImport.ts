import { useSyncExternalStore } from 'react';
import * as XLSX from 'xlsx';
import { normalizeHeader, usedRange } from '../parse';
import { resumoNf, ticketKey, type ZendeskState } from './zendeskImport';
import type { Integration } from '../types';
import { bloquearSeHistorico, diaHistorico, subscribeDiaAtivo } from './diaAtivo';
import { ENTREGAS_CONFIRMADAS } from './entregasConfirmadas';
import type { RomaneioImport, RomaneioNota } from './romaneioImport';

export type TransportadoraId = 'spfly' | 'jamef' | 'certex';

export const TRANSPORTADORAS: { id: TransportadoraId; label: string }[] = [
  { id: 'spfly', label: 'SPfly' },
  { id: 'jamef', label: 'Jamef' },
  { id: 'certex', label: 'Certex' },
];

export interface RotaTicket {
  id: string;
  notas: string[];
  atualizadoEm: string;
  criadoEm: string;
}

export interface RotaImport {
  fileName: string;
  importadoEm: string;
  tickets: RotaTicket[];
}

export interface EventoTransportadora {
  ultimoStatus: string;
  dataStatus: string;
  previsao: string;
  dataEntrega: string;
  recebedor: string;
  destinatario: string;
  cidade: string;
  uf: string;
  /** Transportadora da linha; só existe nas transações da Intelipost, que trazem todas juntas. */
  transportadora?: string;
  /** Base de onde o envio saiu ("Hub (Agência)" das transações, ex.: RJ, CE, GO). */
  base?: string;
  /** Número do CT-e da linha; só nas planilhas das transportadoras importadas depois que ele passou a ser lido. */
  cte?: string;
  /** Emissão do CT-e (YYYY-MM-DD). */
  dataCte?: string;
  /** Valor cobrado de reentrega (coluna REENTREGA da Jamef). */
  valorReentrega?: number;
}

/** Retorno ao CD de Itapevi: não é entrega ao cliente. Filiais Arklok continuam no SLA. */
export const isRetornoCd = (evento: Pick<EventoTransportadora, 'destinatario' | 'cidade'>) =>
  /arklok/i.test(evento.destinatario) && /itapevi/i.test(evento.cidade);

/** Exportação de transações da Intelipost: status de entrega de todas as transportadoras numa planilha só. */
export interface TransacoesImport {
  fileName: string;
  importadoEm: string;
  totalLinhas: number;
  entregues: number;
  canceladas: number;
  /** Datas de criação dos pedidos na Intelipost. */
  periodo?: { de: string; ate: string };
  porNf: Record<string, EventoTransportadora[]>;
}

export interface TransportadoraImport {
  fileName: string;
  importadoEm: string;
  totalLinhas: number;
  /** Datas de emissão (NF ou CT-e) presentes na planilha; ausente em importações antigas. */
  periodo?: { de: string; ate: string };
  /** "entrega" no relatório de entregas, que não traz a emissão da NF e é filtrado pela data de entrega. */
  periodoTipo?: 'emissao' | 'entrega';
  /** Linhas descartadas por serem reversa ou retorno ao CD de Itapevi. */
  ignoradas?: number;
  /** Linhas sem número de NF; ausente em importações antigas. */
  semNf?: number;
  porNf: Record<string, EventoTransportadora[]>;
  /** NFs com CT-e de reversa: sem entrega ao cliente, são devolução e saem do relatório de entregas. */
  reversas?: Record<string, true>;
}

export type EntregaNfSituacao = 'entregue' | 'mesmo_dia' | 'devolvida' | 'em_transito' | 'sem_rastreio';

export interface EntregaNf {
  nf: string;
  situacao: EntregaNfSituacao;
  transportadora: TransportadoraId | null;
  evento: EventoTransportadora | null;
  /** Frota interna, Lalamove e "O próprio": entregam no mesmo dia, salvo se a planilha de uma transportadora disser outra coisa. */
  modal?: ModalProprio;
  /** Entregue pela outra NF do par remessa × triangular (Alloca07). */
  viaNf?: string;
}

export type ModalProprio = 'frota' | 'lalamove' | 'proprio';

export const MODAIS_PROPRIOS: { id: ModalProprio; label: string; situacao: EntregaSituacao }[] = [
  { id: 'frota', label: 'Frota interna', situacao: 'frota_interna' },
  { id: 'lalamove', label: 'Lalamove', situacao: 'lalamove' },
  { id: 'proprio', label: 'O próprio', situacao: 'entregue' },
];

const ehModalProprio = (grupo: EntregaGrupo): grupo is ModalProprio => MODAIS_PROPRIOS.some((m) => m.id === grupo);

export type EntregaSituacao = 'entregue' | 'nao_entregue' | 'frota_interna' | 'lalamove' | 'sem_rastreio';

export const ENTREGA_SITUACOES: { id: EntregaSituacao; label: string }[] = [
  { id: 'entregue', label: 'Entregues' },
  { id: 'nao_entregue', label: 'Não entregues' },
  { id: 'frota_interna', label: 'Frota interna' },
  { id: 'lalamove', label: 'Lalamove' },
  { id: 'sem_rastreio', label: 'Sem rastreio' },
];

export type EntregaGrupo = TransportadoraId | ModalProprio | 'outras' | 'nenhuma';

/** Uma nota integrada (Alloca07 × Intelipost) com a situação de entrega (transações da Intelipost ou planilhas antigas). */
export interface EntregaNota {
  id: string;
  nf: string;
  nfTriangular: string;
  /** Data de emissão da NF na Alloca07 (YYYY-MM-DD). */
  emissao: string;
  cliente: string;
  cidade: string;
  uf: string;
  transportadoraIntelipost: string;
  rastreio: string;
  grupo: EntregaGrupo;
  situacao: EntregaSituacao;
  entrega: EntregaNf;
  tickets: string[];
}

const ROTA_KEY = 'arklok_entregas_rota_v1';
/** Confirmações manuais de entrega (descontinuadas): apagadas ao carregar. */
const CHAVES_MANUAIS_ANTIGAS = ['arklok_entregas_manuais_v1', 'arklok_entregas_manuais_seed_20261009'];
const transportadoraKey = (id: TransportadoraId) => `arklok_entregas_${id}_v1`;
const TRANSACOES_KEY = 'arklok_entregas_transacoes_v1';

const nfKey = (value: unknown): string => ticketKey(value);

/** Datas das planilhas vêm como texto dia/mês/ano (ex.: "14/09/2026") ou formato ISO (ex.: "2026-10-14"). */
export function parseBrDate(value: unknown): string {
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const matchIso = text.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2}))?/);
    if (matchIso) {
      const [, day, hh, mm] = matchIso;
      return hh ? `${day}T${hh.padStart(2, '0')}:${mm}` : day;
    }
  }
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return '';
  const [, d, m, y, hh, mm] = match;
  const year = y.length === 2 ? `20${y}` : y;
  const day = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return hh ? `${day}T${hh.padStart(2, '0')}:${mm}` : day;
}

/**
 * Nas listas das transportadoras, datas com dia ≤ 12 vêm como data do Excel com dia e mês trocados
 * e gravadas às 23:59:32 do dia anterior (ex.: 08/10/2026 chega como 09/08/2026 23:59:32).
 * As demais datas vêm como texto dia/mês/ano e não precisam de ajuste.
 */
function corrigirDatasInvertidas(sheet: XLSX.WorkSheet) {
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith('!') || cell.t !== 'n' || !/[dmy]/i.test(String(cell.z ?? ''))) continue;
    const parsed = XLSX.SSF.parse_date_code(Math.round(cell.v as number));
    if (!parsed) continue;
    // Datas escritas como ano-mês-dia (ex.: DATA CTE do relatório de entregas) já vêm certas.
    const iso = /^\d{4}-\d{2}-\d{2}/.test(String(cell.w ?? ''));
    const [dia, mes] = parsed.d <= 12 && !iso ? [parsed.m, parsed.d] : [parsed.d, parsed.m];
    const text = `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${parsed.y}`;
    sheet[address] = { t: 's', v: text, w: text };
  }
}

function readMatrix(workbook: XLSX.WorkBook, datasInvertidas = false): string[][] {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const range = usedRange(sheet);
    if (!range) continue;
    sheet['!ref'] = XLSX.utils.encode_range(range);
    if (datasInvertidas) corrigirDatasInvertidas(sheet);
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false, blankrows: false });
    if (matrix.length > 1) return matrix.map((row) => row.map((cell) => String(cell ?? '').trim()));
  }
  return [];
}

export async function importTransportadoraFile(file: File): Promise<TransportadoraImport> {
  const matrix = readMatrix(XLSX.read(await file.arrayBuffer(), { type: 'array' }), true);
  const headerIndex = matrix
    .slice(0, 15)
    .findIndex((row) => {
      const headers = row.map(normalizeHeader);
      return (
        headers.some((h) => h === 'nf' || h === 'nota fiscal') &&
        headers.some((h) => ['data entrega', 'data de entrega', 'data realizacao'].includes(h))
      );
    });
  if (headerIndex < 0) {
    throw new Error(
      `Não reconheci as colunas de ${file.name}. Preciso de "NF" e "DATA ENTREGA" (ou "NOTA_FISCAL" e "DATA_REALIZACAO" da Jamef). Me envie esse modelo para configurarmos.`,
    );
  }
  const headers = matrix[headerIndex].map(normalizeHeader);
  const col = (...names: string[]) => headers.findIndex((h) => names.includes(h));
  const destinatario = col('destinatario', 'nome destinatario');
  const servico = col('servico', 'tipo de servico');
  // CIDADE/UF aparecem duas vezes (remetente e destinatário); as do destinatário vêm depois dele.
  const after = (name: string) => {
    const index = headers.findIndex((h, i) => h === name && i > destinatario);
    return index >= 0 ? index : headers.indexOf(name);
  };
  // Relatório de CT-e da Jamef: DATA_REALIZACAO também é preenchida em reentregas, então só vale com status de entrega.
  const entregaPeloStatus = !headers.includes('data entrega') && headers.includes('data realizacao');
  const c = {
    nf: col('nf', 'nota fiscal'),
    status: col('ultimo status', 'status'),
    dataStatus: col('data status', 'data ultima atualizacao'),
    horaStatus: col('hora status'),
    previsao: col('prev entrega', 'previsao entrega', 'previsao de entrega', 'data previsao'),
    dataEntrega: col(
      'data entrega',
      'data de entrega',
      'data realizacao',
      'data da entrega',
      'dt entrega',
      'dt. entrega',
      'data/hora entrega',
      'data de realizacao',
      'dt realizacao',
      'data baixa',
      'data finalizacao',
    ),
    horaEntrega: col('hora entrega'),
    recebedor: col('recebedor'),
    cidade: col('municipio entrega', 'cidade destino') >= 0 ? col('municipio entrega', 'cidade destino') : after('cidade'),
    uf: col('uf entrega', 'estado destino') >= 0 ? col('uf entrega', 'estado destino') : after('uf'),
    emissao: col('data emissao nf', 'data emissao cte', 'data emissao'),
    cte: col('cte'),
    dataCte: col('data cte', 'data emissao cte'),
    reentrega: col('reentrega'),
  };
  const periodoTipo = c.emissao >= 0 ? 'emissao' : 'entrega';
  const emissoes: string[] = [];
  let ignoradas = 0;
  const cell = (row: string[], index: number) => (index >= 0 ? row[index] ?? '' : '');
  const comHora = (data: string, hora: string) => {
    const day = parseBrDate(data);
    return day && /^\d{1,2}:\d{2}$/.test(hora) && !day.includes('T') ? `${day}T${hora.padStart(5, '0')}` : day;
  };

  const porNf: Record<string, EventoTransportadora[]> = {};
  const reversas: Record<string, true> = {};
  let totalLinhas = 0;
  let semNf = 0;
  for (const row of matrix.slice(headerIndex + 1)) {
    const key = nfKey(cell(row, c.nf));
    if (!key) {
      semNf += 1;
      continue;
    }
    // Reversa não é entrega ao cliente. Retorno ao CD de Itapevi entra para fechar a NF, sem contar como entrega.
    if (/reversa/i.test(cell(row, servico))) {
      ignoradas += 1;
      reversas[key] = true;
      continue;
    }
    totalLinhas += 1;
    const entregue =
      !entregaPeloStatus ||
      /entrega realizada|entregue|entrega efetuada|mercadoria entregue|comprovante de entrega|finalizado|baixado/i.test(
        cell(row, c.status),
      );
    const dataEntrega = entregue ? comHora(cell(row, c.dataEntrega), cell(row, c.horaEntrega)) : '';
    const emissao = periodoTipo === 'emissao' ? parseBrDate(cell(row, c.emissao)).slice(0, 10) : dataEntrega.slice(0, 10);
    if (emissao) emissoes.push(emissao);
    const cte = nfKey(cell(row, c.cte));
    const textoReentrega = cell(row, c.reentrega);
    const valorReentrega = Number(
      textoReentrega.includes(',') ? textoReentrega.replace(/\./g, '').replace(',', '.') : textoReentrega,
    );
    (porNf[key] ??= []).push({
      ultimoStatus: c.status >= 0 ? cell(row, c.status) : dataEntrega ? 'ENTREGA REALIZADA' : '',
      dataStatus: comHora(cell(row, c.dataStatus), cell(row, c.horaStatus)) || dataEntrega,
      previsao: parseBrDate(cell(row, c.previsao)),
      dataEntrega,
      recebedor: cell(row, c.recebedor),
      destinatario: cell(row, destinatario),
      cidade: cell(row, c.cidade),
      uf: cell(row, c.uf),
      ...(cte ? { cte, dataCte: parseBrDate(cell(row, c.dataCte)).slice(0, 10) } : {}),
      ...(valorReentrega > 0 ? { valorReentrega } : {}),
    });
  }
  emissoes.sort();
  const periodo = emissoes.length ? { de: emissoes[0], ate: emissoes[emissoes.length - 1] } : undefined;
  return { fileName: file.name, importadoEm: new Date().toISOString(), totalLinhas, periodo, periodoTipo, ignoradas, semNf, porNf, reversas };
}

/**
 * Os portais das transportadoras só exportam ~30 dias por vez: várias planilhas viram uma só.
 * Eventos idênticos (períodos que se sobrepõem) entram uma vez.
 */
export function juntarTransportadora(atual: TransportadoraImport, nova: TransportadoraImport): TransportadoraImport {
  const porNf: Record<string, EventoTransportadora[]> = {};
  const chave = (e: EventoTransportadora) => [e.cte, e.ultimoStatus, e.dataStatus, e.previsao, e.dataEntrega, e.recebedor].join('|');
  for (const fonte of [atual.porNf, nova.porNf]) {
    for (const [nf, eventos] of Object.entries(fonte)) {
      const lista = (porNf[nf] ??= []);
      for (const evento of eventos) if (!lista.some((e) => chave(e) === chave(evento))) lista.push(evento);
    }
  }
  const datas = [atual.periodo?.de, atual.periodo?.ate, nova.periodo?.de, nova.periodo?.ate].filter((d): d is string => !!d).sort();
  const repetida = atual.fileName.split(' + ').includes(nova.fileName);
  return {
    fileName: repetida ? atual.fileName : `${atual.fileName} + ${nova.fileName}`,
    importadoEm: nova.importadoEm,
    totalLinhas: Object.values(porNf).reduce((soma, eventos) => soma + eventos.length, 0),
    periodo: datas.length ? { de: datas[0], ate: datas[datas.length - 1] } : undefined,
    periodoTipo: atual.periodoTipo === nova.periodoTipo ? nova.periodoTipo : 'emissao',
    ignoradas: (atual.ignoradas ?? 0) + (repetida ? 0 : nova.ignoradas ?? 0),
    porNf,
    reversas: { ...atual.reversas, ...nova.reversas },
  };
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** As transações trazem datas do Excel já no dia certo; texto dia/mês/ano também é aceito. */
function dataDaTransacao(value: unknown): string {
  if (typeof value === 'number') {
    const p = XLSX.SSF.parse_date_code(value);
    if (!p) return '';
    const dia = `${p.y}-${doisDigitos(p.m)}-${doisDigitos(p.d)}`;
    return p.H || p.M ? `${dia}T${doisDigitos(p.H)}:${doisDigitos(p.M)}` : dia;
  }
  return parseBrDate(value);
}

export async function importTransacoesFile(file: File): Promise<TransacoesImport> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const range = usedRange(sheet);
    if (!range) continue;
    sheet['!ref'] = XLSX.utils.encode_range(range);
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true, blankrows: false });
    const headerIndex = matrix.slice(0, 10).findIndex((row) => {
      const headers = row.map(normalizeHeader);
      return headers.includes('nota fiscal') && headers.includes('status transportador');
    });
    if (headerIndex < 0) continue;

    const headers = matrix[headerIndex].map(normalizeHeader);
    const col = (...names: string[]) => headers.findIndex((h) => names.includes(h));
    const c = {
      nf: col('nota fiscal'),
      transportadora: col('transportadora'),
      status: col('status transportador'),
      micro: col('microstatus'),
      dataStatus: col('data do ultimo status'),
      dataEntrega: col('data entrega'),
      previsaoCliente: col('previsao entrega cliente'),
      previsaoTransp: col('previsao entrega transp'),
      destinatario: col('nome do destinatario'),
      cidade: col('cidade do destinatario'),
      uf: col('uf'),
      criacao: col('data criacao'),
      base: col('hub agencia'),
    };
    const texto = (row: unknown[], index: number) => (index >= 0 ? String(row[index] ?? '').trim() : '');
    const data = (row: unknown[], index: number) => (index >= 0 ? dataDaTransacao(row[index]) : '');

    const porNf: Record<string, EventoTransportadora[]> = {};
    const criacoes: string[] = [];
    let totalLinhas = 0;
    let entregues = 0;
    let canceladas = 0;
    for (const row of matrix.slice(headerIndex + 1)) {
      const key = nfKey(texto(row, c.nf));
      if (!key) continue;
      totalLinhas += 1;
      const status = texto(row, c.status);
      const micro = texto(row, c.micro);
      const entregue = /^entregue/i.test(status);
      const dataEntrega = entregue ? data(row, c.dataEntrega) : '';
      if (dataEntrega) entregues += 1;
      if (/cancelad/i.test(status)) canceladas += 1;
      const criacao = data(row, c.criacao).slice(0, 10);
      if (criacao) criacoes.push(criacao);
      (porNf[key] ??= []).push({
        ultimoStatus: micro && micro.toLowerCase() !== status.toLowerCase() ? `${status} · ${micro}` : status,
        dataStatus: data(row, c.dataStatus) || dataEntrega,
        previsao: (data(row, c.previsaoCliente) || data(row, c.previsaoTransp)).slice(0, 10),
        dataEntrega,
        recebedor: '',
        destinatario: texto(row, c.destinatario),
        cidade: texto(row, c.cidade),
        uf: texto(row, c.uf),
        transportadora: texto(row, c.transportadora),
        base: texto(row, c.base),
      });
    }
    criacoes.sort();
    return {
      fileName: file.name,
      importadoEm: new Date().toISOString(),
      totalLinhas,
      entregues,
      canceladas,
      periodo: criacoes.length ? { de: criacoes[0], ate: criacoes[criacoes.length - 1] } : undefined,
      porNf,
    };
  }
  throw new Error(
    `Não reconheci ${file.name} como transações da Intelipost. Preciso das colunas "Nota Fiscal" e "Status Transportador".`,
  );
}

const isDevolucao = (evento: EventoTransportadora) => /devolu/i.test(evento.ultimoStatus);

/**
 * Ordem do evento mais antigo para o mais recente. Sem data de status (a SPfly não manda),
 * vale o CT-e mais novo e depois a previsão: uma NF reenviada ganha CT-e e previsão novos.
 */
export function compararEventos(a: EventoTransportadora, b: EventoTransportadora): number {
  return (
    a.dataStatus.localeCompare(b.dataStatus) ||
    (a.dataCte ?? '').localeCompare(b.dataCte ?? '') ||
    a.previsao.localeCompare(b.previsao)
  );
}

function entregaPelasPlanilhas(nf: string, transportadoras: EntregasState['transportadoras']): EntregaNf {
  let pendente: EntregaNf | null = null;
  let retorno: EntregaNf | null = null;
  for (const { id, label } of TRANSPORTADORAS) {
    const eventos = transportadoras[id]?.porNf[nf] ?? [];
    const reversa = !!transportadoras[id]?.reversas?.[nf];
    if (!eventos.length && !reversa) continue;
    const comNome = (evento: EventoTransportadora) => ({ ...evento, transportadora: evento.transportadora || label });
    const cliente = eventos.filter((e) => !isRetornoCd(e));
    const voltou = eventos.find((e) => isRetornoCd(e) && e.dataEntrega);
    if (voltou) retorno ??= { nf, situacao: 'devolvida', transportadora: id, evento: comNome(voltou) };
    const entregue = cliente.find(
      (e) => (e.dataEntrega || /entrega realizada|entregue|entrega efetuada|mercadoria entregue/i.test(e.ultimoStatus)) && !isDevolucao(e),
    );
    if (entregue) return { nf, situacao: 'entregue', transportadora: id, evento: comNome(entregue) };
    const devolucao = cliente.find(isDevolucao);
    const ultimo = [...cliente].sort(compararEventos).at(-1);
    if (reversa) {
      retorno ??= { nf, situacao: 'devolvida', transportadora: id, evento: ultimo ? comNome({ ...ultimo, ultimoStatus: 'REVERSA' }) : null };
      continue;
    }
    if (!ultimo && !devolucao) continue;
    pendente ??= devolucao
      ? { nf, situacao: 'devolvida', transportadora: id, evento: comNome(devolucao) }
      : { nf, situacao: 'em_transito', transportadora: id, evento: comNome(ultimo!) };
  }
  return pendente?.situacao === 'em_transito' && retorno ? retorno : pendente ?? retorno ?? { nf, situacao: 'sem_rastreio', transportadora: null, evento: null };
}

/** A entrega vem só das planilhas SPfly, Jamef e Certex (data de entrega). */
function entregaDaNf(nf: string, entregas: EntregasState): EntregaNf {
  return entregaPelasPlanilhas(nf, entregas.transportadoras);
}

/** NF que não está entre as integradas (ex.: NF de um ticket do Zendesk), procurada direto nas planilhas. */
export function entregaDeNfAvulsa(nf: string, entregas: EntregasState): EntregaNf {
  return entregaDaNf(nf, entregas);
}

/** Transportadora da Intelipost → grupo usado nos filtros. */
export function grupoTransportadora(nome: string | undefined): EntregaGrupo {
  const texto = (nome ?? '').toLowerCase();
  if (!texto.trim()) return 'nenhuma';
  if (/sp\s*fly/.test(texto)) return 'spfly';
  if (/jamef/.test(texto)) return 'jamef';
  if (/certex/.test(texto)) return 'certex';
  if (/frota/.test(texto)) return 'frota';
  if (/lalamove/.test(texto)) return 'lalamove';
  return 'outras';
}

/** Entre a NF principal e a triangular (a mesma carga), vale a que estiver mais avançada. */
const PRIORIDADE: Record<EntregaNfSituacao, number> = {
  entregue: 0,
  mesmo_dia: 1,
  devolvida: 2,
  em_transito: 3,
  sem_rastreio: 4,
};

const adicionar = (mapa: Map<string, Set<string>>, chave: string, valor: string) => {
  if (!chave || !valor) return;
  let conjunto = mapa.get(chave);
  if (!conjunto) mapa.set(chave, (conjunto = new Set()));
  conjunto.add(valor);
};

const GRUPO_DO_ROMANEIO: Record<RomaneioNota['transportadora'], EntregaGrupo> = {
  spfly: 'spfly',
  jamef: 'jamef',
  certex: 'certex',
  frota: 'frota',
  lalamove: 'lalamove',
  proprio: 'proprio',
  outra: 'outras',
};

/** Frota interna, Lalamove e "O próprio" entregam no mesmo dia: a NF conta como entregue na data da emissão. */
function entregueNoMesmoDia(entrega: EntregaNf, modal: (typeof MODAIS_PROPRIOS)[number], emissao: string, meta: Record<string, string | undefined>): EntregaNf {
  return {
    ...entrega,
    situacao: 'mesmo_dia',
    modal: modal.id,
    evento: {
      ultimoStatus: `ENTREGA NO MESMO DIA (${modal.label})`,
      dataStatus: emissao,
      previsao: emissao,
      dataEntrega: emissao,
      recebedor: '',
      destinatario: meta.clienteDestino ?? '',
      cidade: meta.cidade ?? '',
      uf: meta.uf ?? '',
      transportadora: modal.label,
    },
  };
}

/**
 * Base: as notas integradas. Cada NF (ou a NF triangular, se a principal não aparecer) é procurada nas
 * planilhas das transportadoras. Tickets do Zendesk só entram se estiverem abertos na planilha de tickets.
 * Quem levou a nota vem do romaneio; sem ele, da transportadora informada no cruzamento.
 * Devoluções e retornos ao CD ficam de fora: são do módulo de reversa.
 */
export function cruzarEntregasNotas(
  integrations: Integration[],
  entregas: EntregasState,
  zendesk: ZendeskState,
  romaneio?: RomaneioImport | null,
): EntregaNota[] {
  const nfParaTickets = new Map<string, Set<string>>();
  if (zendesk.tickets && zendesk.nf) {
    for (const ticket of zendesk.tickets.tickets) {
      for (const registro of resumoNf(zendesk.nf, ticket.id).registros) {
        if (registro.nf) adicionar(nfParaTickets, registro.nf, ticketKey(ticket.id));
      }
    }
  }

  return integrations
    .filter((item) => item.status !== 'intelipost_only')
    .map((item) => {
      const meta = item.metadata ?? {};
      const nf = ticketKey(meta.notaFiscal ?? item.id);
      const nfTriangular = ticketKey(meta.nfTriangular);
      let entrega = entregaDaNf(nf, entregas);
      if (nfTriangular && entrega.situacao !== 'entregue') {
        const pelaTriangular = entregaDaNf(nfTriangular, entregas);
        if (PRIORIDADE[pelaTriangular.situacao] < PRIORIDADE[entrega.situacao]) entrega = pelaTriangular;
      }
      const saida = romaneio?.porNf[nf] ?? (nfTriangular ? romaneio?.porNf[nfTriangular] : undefined);
      const grupo =
        entrega.transportadora ??
        (saida ? GRUPO_DO_ROMANEIO[saida.transportadora] : grupoTransportadora(entrega.evento?.transportadora || meta.transportadora));
      const modal = ehModalProprio(grupo) ? MODAIS_PROPRIOS.find((m) => m.id === grupo)! : null;
      const emissao = (meta.dataEmissao ?? item.createdAt ?? '').slice(0, 10);
      if (modal) {
        entrega =
          entrega.situacao === 'entregue' || entrega.situacao === 'devolvida'
            ? { ...entrega, modal: modal.id }
            : entregueNoMesmoDia(entrega, modal, emissao, meta);
      }
      const situacao: EntregaSituacao =
        entrega.situacao === 'entregue' || entrega.situacao === 'mesmo_dia'
          ? 'entregue'
          : modal
            ? modal.situacao
            : entrega.situacao === 'sem_rastreio'
              ? 'sem_rastreio'
              : 'nao_entregue';
      const tickets = new Set([...(nfParaTickets.get(nf) ?? []), ...(nfParaTickets.get(nfTriangular) ?? [])]);
      return {
        id: item.id,
        nf,
        nfTriangular,
        emissao,
        cliente: meta.clienteDestino || item.name.replace(/^NF\s+\S+\s*(·\s*)?/, ''),
        cidade: meta.cidade ?? '',
        uf: meta.uf ?? '',
        transportadoraIntelipost: meta.transportadora ?? '',
        rastreio: meta.rastreio ?? '',
        grupo,
        situacao,
        entrega,
        tickets: [...tickets],
      };
    })
    .filter((nota) => nota.entrega.situacao !== 'devolvida');
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (value) localStorage.setItem(key, JSON.stringify(value));
  else localStorage.removeItem(key);
}

export interface EntregasState {
  rota: RotaImport | null;
  transportadoras: Partial<Record<TransportadoraId, TransportadoraImport>>;
  /** Transações da Intelipost; valem junto com as planilhas das transportadoras. */
  transacoes?: TransacoesImport | null;
}

function loadState(): EntregasState {
  for (const chave of CHAVES_MANUAIS_ANTIGAS) localStorage.removeItem(chave);
  const transportadoras: EntregasState['transportadoras'] = {};
  for (const { id } of TRANSPORTADORAS) {
    const data = readJson<TransportadoraImport>(transportadoraKey(id));
    if (data) transportadoras[id] = data;
  }
  return { rota: readJson<RotaImport>(ROTA_KEY), transportadoras, transacoes: readJson<TransacoesImport>(TRANSACOES_KEY) };
}

let state: EntregasState = loadState();
const listeners = new Set<() => void>();

function commit(next: EntregasState) {
  state = next;
  listeners.forEach((listener) => listener());
}

/** Recarrega as planilhas salvas do localStorage e notifica todos os componentes para recalcular. */
export function recarregarEntregas() {
  commit({ ...loadState() });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const offDia = subscribeDiaAtivo(listener);
  return () => {
    listeners.delete(listener);
    offDia();
  };
}

const comConfirmadas = new WeakMap<EntregasState, EntregasState>();

/** Soma às planilhas as entregas confirmadas pela equipe (ver entregasConfirmadas.ts). */
function aplicarEntregasConfirmadas(base: EntregasState): EntregasState {
  const pronto = comConfirmadas.get(base);
  if (pronto) return pronto;
  const transportadoras = { ...base.transportadoras };
  for (const confirmada of ENTREGAS_CONFIRMADAS) {
    const importacao = transportadoras[confirmada.transportadora];
    if (!importacao) continue;
    const eventos = importacao.porNf[confirmada.nf] ?? [];
    const ultimo = eventos.length ? [...eventos].sort(compararEventos).at(-1)! : null;
    const entregue: EventoTransportadora = {
      ultimoStatus: 'ENTREGA REALIZADA (confirmada pela equipe)',
      dataStatus: confirmada.dataEntrega,
      previsao: ultimo?.previsao ?? confirmada.dataEntrega.slice(0, 10),
      dataEntrega: confirmada.dataEntrega,
      recebedor: ultimo?.recebedor || 'Confirmada pela equipe',
      destinatario: ultimo?.destinatario ?? '',
      cidade: ultimo?.cidade ?? '',
      uf: ultimo?.uf ?? '',
      cte: ultimo?.cte,
      dataCte: ultimo?.dataCte,
    };
    transportadoras[confirmada.transportadora] = {
      ...importacao,
      porNf: {
        ...importacao.porNf,
        [confirmada.nf]: [...eventos.filter((e) => !e.dataEntrega || isDevolucao(e)), entregue],
      },
    };
  }
  const resultado = { ...base, transportadoras };
  comConfirmadas.set(base, resultado);
  return resultado;
}

const visivel = (): EntregasState => aplicarEntregasConfirmadas(diaHistorico()?.estado.entregas ?? state);

export const entregasStore = {
  /** Dados de hoje, mesmo com um dia salvo aberto (usado para gravar o banco diário). */
  atual(): EntregasState {
    return state;
  },

  setRota(data: RotaImport | null) {
    bloquearSeHistorico();
    writeJson(ROTA_KEY, data);
    commit({ ...state, rota: data });
  },

  setTransportadora(id: TransportadoraId, data: TransportadoraImport | null) {
    bloquearSeHistorico();
    try {
      writeJson(transportadoraKey(id), data);
    } catch {
      throw new Error('Não coube no armazenamento do navegador. Use "Verificar banco" para liberar espaço e envie de novo.');
    }
    const transportadoras = { ...state.transportadoras };
    if (data) transportadoras[id] = data;
    else delete transportadoras[id];
    commit({ ...state, transportadoras });
  },

  /** Soma uma planilha de outro período à que já está carregada. */
  adicionarTransportadora(id: TransportadoraId, data: TransportadoraImport) {
    const atual = state.transportadoras[id];
    entregasStore.setTransportadora(id, atual ? juntarTransportadora(atual, data) : data);
  },

  setTransacoes(data: TransacoesImport | null) {
    bloquearSeHistorico();
    try {
      writeJson(TRANSACOES_KEY, data);
    } catch {
      throw new Error('Não coube no armazenamento do navegador. Use "Verificar banco" para liberar espaço e envie de novo.');
    }
    commit({ ...state, transacoes: data });
  },
};

export function useEntregas(): EntregasState {
  return useSyncExternalStore(subscribe, visivel);
}

export function contarEntregas(lista: EntregaNota[]): Record<EntregaSituacao, number> {
  const contagem: Record<EntregaSituacao, number> = {
    entregue: 0,
    nao_entregue: 0,
    frota_interna: 0,
    lalamove: 0,
    sem_rastreio: 0,
  };
  for (const item of lista) contagem[item.situacao] += 1;
  return contagem;
}

export function formatBrDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!match) return value || '—';
  const [, y, m, d, hh, mm] = match;
  return hh ? `${d}/${m}/${y} ${hh}:${mm}` : `${d}/${m}/${y}`;
}
