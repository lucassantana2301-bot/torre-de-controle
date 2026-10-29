import { useSyncExternalStore } from 'react';
import * as XLSX from 'xlsx';
import { normalizeHeader, usedRange } from '../parse';
import { bloquearSeHistorico, diaHistorico, subscribeDiaAtivo } from './diaAtivo';

export type ZendeskAba = 'em_rota' | 'aguardando_expedicao';

export interface ZendeskTicket {
  id: string;
  status: string;
  aba: ZendeskAba;
  grupo: string;
  organizacao: string;
  grupoEconomico: string;
  uf: string;
  localidade: string;
  prioridade: string;
  criadoEm: string;
  atualizadoEm: string;
  idadeDias: number | null;
  diasSemAtualizacao: number | null;
}

export interface ZendeskImport {
  fileName: string;
  importadoEm: string;
  totalPlanilha: number;
  tickets: ZendeskTicket[];
}

export const ZENDESK_ABAS: { id: ZendeskAba; label: string }[] = [
  { id: 'em_rota', label: 'Em rota de entrega' },
  { id: 'aguardando_expedicao', label: 'Aguardando expedição' },
];

const STATUS_POR_ABA: Record<string, ZendeskAba> = {
  'em rota de entrega': 'em_rota',
  'aguardando expedicao': 'aguardando_expedicao',
};

const STORAGE_KEY = 'arklok_zendesk_tickets_v1';

type Row = Record<string, unknown>;

function text(row: Row, key: string): string {
  const value = row[key];
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function number(row: Row, key: string): number | null {
  const value = Number(String(row[key] ?? '').replace(',', '.'));
  return Number.isFinite(value) && String(row[key] ?? '').trim() !== '' ? value : null;
}

function dateValue(row: Row, key: string): string {
  const value = row[key];
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const day = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    const hasTime = value.getHours() + value.getMinutes() > 0;
    return hasTime ? `${day}T${pad(value.getHours())}:${pad(value.getMinutes())}` : day;
  }
  return text(row, key);
}

export function formatZendeskDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!match) return value || '—';
  const [, y, m, d, hh, mm] = match;
  return hh ? `${d}/${m}/${y} ${hh}:${mm}` : `${d}/${m}/${y}`;
}

/** O mesmo relatório "Aging" sai com cabeçalhos em inglês ou em português, conforme o idioma de quem exporta. */
const CABECALHO_PT: Record<string, string> = {
  'id do ticket': 'ticket id',
  'grupo de tickets': 'ticket group',
  'nome do status personalizado do ticket': 'ticket custom status name',
  'nome da organizacao do ticket': 'ticket organization name',
  'criacao do ticket data': 'ticket created date',
  'atualizacao do ticket carimbo de data hora': 'ticket updated timestamp',
  'idade dos tickets sem resolucao dias': 'unsolved tickets age days',
  'tempo desde a atualizacao dos tickets sem resolucao dias': 'unsolved tickets time since update days',
};

const cabecalho = (value: unknown) => {
  const nome = normalizeHeader(value);
  return CABECALHO_PT[nome] ?? nome;
};

function readRows(sheet: XLSX.WorkSheet): Row[] {
  const range = usedRange(sheet);
  if (!range) return [];
  sheet['!ref'] = XLSX.utils.encode_range(range);
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true, blankrows: false });
  const headerIndex = matrix.slice(0, 15).findIndex((row) => row.map(cabecalho).includes('ticket id'));
  if (headerIndex < 0) return [];
  const headers = matrix[headerIndex].map(cabecalho);
  return matrix.slice(headerIndex + 1).map((cells) => {
    const row: Row = {};
    headers.forEach((header, index) => {
      if (header && !(header in row && row[header] !== '')) row[header] = cells[index];
    });
    return row;
  });
}

export async function importZendeskFile(file: File): Promise<ZendeskImport> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const rows = workbook.SheetNames.map((name) => readRows(workbook.Sheets[name])).find((r) => r.length > 0);
  if (!rows) {
    throw new Error(`Não encontrei a coluna "Ticket ID" (ou "ID do ticket") em ${file.name}. Use a exportação de tickets do Zendesk.`);
  }
  if (!('ticket custom status name' in rows[0])) {
    throw new Error(
      'Não encontrei a coluna "Ticket custom status name" (ou "Nome do status personalizado do ticket") na planilha do Zendesk.',
    );
  }

  const validRows = rows.filter((row) => text(row, 'ticket id'));
  const tickets: ZendeskTicket[] = [];
  for (const row of validRows) {
    const status = text(row, 'ticket custom status name');
    const aba = STATUS_POR_ABA[normalizeHeader(status)];
    if (!aba) continue;
    tickets.push({
      id: text(row, 'ticket id'),
      status,
      aba,
      grupo: text(row, 'ticket group'),
      organizacao: text(row, 'ticket organization name'),
      grupoEconomico: text(row, 'grupo economico name'),
      uf: text(row, 'estado uf'),
      localidade: text(row, 'localidade'),
      prioridade: text(row, 'prioridade padrao do cliente'),
      criadoEm: dateValue(row, 'ticket created date'),
      atualizadoEm: dateValue(row, 'ticket updated timestamp'),
      idadeDias: number(row, 'unsolved tickets age days'),
      diasSemAtualizacao: number(row, 'unsolved tickets time since update days'),
    });
  }

  return { fileName: file.name, importadoEm: new Date().toISOString(), totalPlanilha: validRows.length, tickets };
}

export interface NfRegistro {
  romaneio: string;
  dataRomaneio: string;
  nf: string | null;
  etapa: string;
}

export interface NfImport {
  fileName: string;
  importadoEm: string;
  totalLinhas: number;
  /** true quando só os tickets da planilha do Zendesk couberam no armazenamento local. */
  filtrado: boolean;
  porTicket: Record<string, NfRegistro[]>;
}

export type NfSituacao = 'com_nf' | 'sem_nf' | 'fora';

export const NF_SITUACOES: { id: NfSituacao; label: string }[] = [
  { id: 'com_nf', label: 'Com NF' },
  { id: 'sem_nf', label: 'Sem NF' },
  { id: 'fora', label: 'Fora da planilha' },
];

export interface NfResumo {
  situacao: NfSituacao;
  registros: NfRegistro[];
  comNf: number;
}

const NF_STORAGE_KEY = 'arklok_zendesk_nf_v1';

export function ticketKey(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

function nfNumber(value: unknown): string | null {
  const digits = String(value ?? '').trim();
  return /^\d+$/.test(digits) ? String(Number(digits)) : null;
}

function serialDate(value: unknown): string {
  if (typeof value === 'number' && value > 0) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`;
    }
  }
  return dateValue({ value }, 'value');
}

interface NfColumns {
  ticket: number;
  nf: number;
  romaneio: number;
  data: number;
  etapa: number;
}

function findNfColumns(headers: string[]): NfColumns | null {
  const ticket = headers.findIndex((h) => h.startsWith('chamado') || h.startsWith('ticket'));
  const nf = headers.findIndex((h) => h === 'nf' || h === 'nota fiscal');
  if (ticket < 0 || nf < 0) return null;
  return {
    ticket,
    nf,
    romaneio: headers.indexOf('romaneio'),
    data: headers.findIndex((h) => h.startsWith('data romaneio')),
    etapa: headers.findIndex((h) => h.startsWith('etapa')),
  };
}

export async function importNfFile(file: File): Promise<NfImport> {
  const buffer = await file.arrayBuffer();
  const { SheetNames } = XLSX.read(buffer, { type: 'array', bookSheets: true });
  // A planilha de NF tem abas enormes (estornos, notas); lemos uma aba por vez, priorizando a "Base_Dados".
  const ordered = [...SheetNames].sort(
    (a, b) => Number(normalizeHeader(b).includes('base')) - Number(normalizeHeader(a).includes('base')),
  );

  for (const name of ordered) {
    const sheet = XLSX.read(buffer, { type: 'array', sheets: name }).Sheets[name];
    const range = sheet && usedRange(sheet);
    if (!range) continue;
    sheet['!ref'] = XLSX.utils.encode_range(range);
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true, blankrows: false });
    const headerIndex = matrix.slice(0, 15).findIndex((row) => findNfColumns(row.map(normalizeHeader)));
    if (headerIndex < 0) continue;
    const columns = findNfColumns(matrix[headerIndex].map(normalizeHeader))!;
    const cell = (row: unknown[], index: number) => (index >= 0 ? row[index] : '');

    const porTicket: Record<string, NfRegistro[]> = {};
    let totalLinhas = 0;
    for (const row of matrix.slice(headerIndex + 1)) {
      const key = ticketKey(cell(row, columns.ticket));
      if (!key) continue;
      totalLinhas += 1;
      (porTicket[key] ??= []).push({
        romaneio: String(cell(row, columns.romaneio) ?? '').trim(),
        dataRomaneio: serialDate(cell(row, columns.data)),
        nf: nfNumber(cell(row, columns.nf)),
        etapa: String(cell(row, columns.etapa) ?? '').trim(),
      });
    }
    return { fileName: file.name, importadoEm: new Date().toISOString(), totalLinhas, filtrado: false, porTicket };
  }

  throw new Error(`Não encontrei as colunas de chamado/ticket e NF em ${file.name}. Confira a aba "Base_Dados".`);
}

export function resumoNf(nf: NfImport, ticketId: string): NfResumo {
  const registros = nf.porTicket[ticketKey(ticketId)] ?? [];
  const comNf = registros.filter((r) => r.nf).length;
  const situacao: NfSituacao = registros.length === 0 ? 'fora' : comNf === registros.length ? 'com_nf' : 'sem_nf';
  return { situacao, registros, comNf };
}

type CompactNf = Omit<NfImport, 'porTicket'> & { porTicket: Record<string, [string, string, string | null, string][]> };

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function loadNf(): NfImport | null {
  const compact = readJson<CompactNf>(NF_STORAGE_KEY);
  if (!compact) return null;
  const porTicket: Record<string, NfRegistro[]> = {};
  for (const [key, rows] of Object.entries(compact.porTicket)) {
    porTicket[key] = rows.map(([romaneio, dataRomaneio, nf, etapa]) => ({ romaneio, dataRomaneio, nf, etapa }));
  }
  return { ...compact, porTicket };
}

function saveNf(data: NfImport, tickets: ZendeskImport | null): NfImport {
  const write = (value: NfImport) => {
    const porTicket: CompactNf['porTicket'] = {};
    for (const [key, rows] of Object.entries(value.porTicket)) {
      porTicket[key] = rows.map((r) => [r.romaneio, r.dataRomaneio, r.nf, r.etapa]);
    }
    localStorage.setItem(NF_STORAGE_KEY, JSON.stringify({ ...value, porTicket }));
  };
  try {
    write(data);
    return data;
  } catch {
    const keys = new Set((tickets?.tickets ?? []).map((t) => ticketKey(t.id)));
    const reduced: NfImport = {
      ...data,
      filtrado: true,
      porTicket: Object.fromEntries(Object.entries(data.porTicket).filter(([key]) => keys.has(key))),
    };
    write(reduced);
    return reduced;
  }
}

/** NFs informadas à mão para tickets que não estão no romaneio (ou estão nele sem NF). */
export interface NfManual {
  fileName: string;
  importadoEm: string;
  porTicket: Record<string, string[]>;
  /** NF informada → NF triangular informada junto (opcional); a entrega de qualquer uma vale para as duas. */
  triangular?: Record<string, string>;
}

const NF_MANUAL_KEY = 'arklok_zendesk_nf_manual_v1';
export const ETAPA_MANUAL = 'Informada manualmente';
const VINCULO_NA_TELA = 'Vinculadas na tela';

export interface VinculoNf {
  nf: string;
  triangular?: string;
}

export const numeroNf = (value: string): string => {
  const digitos = value.replace(/\D/g, '');
  return digitos ? String(Number(digitos)) : '';
};

/** Planilha com o ticket (id_zendesk, ticket ou chamado) e a NF; várias NFs na mesma célula podem vir separadas por vírgula. */
export async function importNfManualFile(file: File): Promise<NfManual> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  for (const name of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: '', raw: false, blankrows: false });
    const headerIndex = matrix.slice(0, 15).findIndex((row) => {
      const headers = row.map(normalizeHeader);
      return headers.some((h) => /^(id zendesk|ticket|chamado)/.test(h)) && headers.some((h) => /^(nf|nota fiscal)$/.test(h));
    });
    if (headerIndex < 0) continue;
    const headers = matrix[headerIndex].map(normalizeHeader);
    const colTicket = headers.findIndex((h) => /^(id zendesk|ticket|chamado)/.test(h));
    const colNf = headers.findIndex((h) => /^(nf|nota fiscal)$/.test(h));
    const colTriangular = headers.findIndex((h) => /^(nf |nota fiscal )?triangular$/.test(h));
    const porTicket: Record<string, string[]> = {};
    const triangular: Record<string, string> = {};
    for (const row of matrix.slice(headerIndex + 1)) {
      const ticket = ticketKey(row[colTicket]);
      const nfs = (String(row[colNf] ?? '').match(/\d{3,}/g) ?? []).map((n) => String(Number(n)));
      if (!ticket || !nfs.length) continue;
      porTicket[ticket] = [...new Set([...(porTicket[ticket] ?? []), ...nfs])];
      const par = colTriangular >= 0 ? numeroNf(String(row[colTriangular] ?? '')) : '';
      if (par && nfs.length === 1 && par !== nfs[0]) triangular[nfs[0]] = par;
    }
    if (Object.keys(porTicket).length === 0) break;
    return { fileName: file.name, importadoEm: new Date().toISOString(), porTicket, triangular };
  }
  throw new Error(`Não encontrei as colunas do ticket (id_zendesk) e da NF com valores em ${file.name}.`);
}

export interface ZendeskState {
  tickets: ZendeskImport | null;
  nf: NfImport | null;
  manual?: NfManual | null;
}

let state: ZendeskState = { tickets: readJson<ZendeskImport>(STORAGE_KEY), nf: loadNf(), manual: readJson<NfManual>(NF_MANUAL_KEY) };

/**
 * Ticket listado na planilha manual vale pelas NFs dela, no lugar das do romaneio
 * (ex.: a remessa que substituiu a NF original). Os demais seguem o romaneio.
 */
const comManualCache = new WeakMap<ZendeskState, ZendeskState>();
function comManual(base: ZendeskState): ZendeskState {
  if (!base.manual || !base.nf) return base;
  const pronto = comManualCache.get(base);
  if (pronto) return pronto;
  const porTicket = { ...base.nf.porTicket };
  for (const [ticket, nfs] of Object.entries(base.manual.porTicket)) {
    porTicket[ticket] = nfs.map((nf) => ({ romaneio: 'Manual', dataRomaneio: '', nf, etapa: ETAPA_MANUAL }));
  }
  const unido = { ...base, nf: { ...base.nf, porTicket } };
  comManualCache.set(base, unido);
  return unido;
}
const listeners = new Set<() => void>();

function commit(next: Partial<ZendeskState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const offDia = subscribeDiaAtivo(listener);
  return () => {
    listeners.delete(listener);
    offDia();
  };
}

const visivel = (): ZendeskState => comManual(diaHistorico()?.estado.zendesk ?? state);

export const zendeskStore = {
  /** Dados de hoje, mesmo com um dia salvo aberto (usado para gravar o banco diário). */
  atual(): ZendeskState {
    return state;
  },

  setTickets(data: ZendeskImport | null) {
    bloquearSeHistorico();
    if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    else localStorage.removeItem(STORAGE_KEY);
    commit({ tickets: data });
  },

  setNf(data: NfImport | null) {
    bloquearSeHistorico();
    if (!data) {
      localStorage.removeItem(NF_STORAGE_KEY);
      commit({ nf: null });
      return;
    }
    commit({ nf: saveNf(data, state.tickets) });
  },

  setManual(data: NfManual | null) {
    bloquearSeHistorico();
    if (data) localStorage.setItem(NF_MANUAL_KEY, JSON.stringify(data));
    else localStorage.removeItem(NF_MANUAL_KEY);
    commit({ manual: data });
  },

  /** Soma uma lista manual à carregada; para o mesmo ticket, vale a lista nova. */
  adicionarManual(data: NfManual) {
    const atual = state.manual;
    if (!atual) return zendeskStore.setManual(data);
    const repetida = atual.fileName.split(' + ').includes(data.fileName);
    zendeskStore.setManual({
      fileName: repetida ? atual.fileName : `${atual.fileName} + ${data.fileName}`,
      importadoEm: data.importadoEm,
      porTicket: { ...atual.porTicket, ...data.porTicket },
      triangular: { ...atual.triangular, ...data.triangular },
    });
  },

  /** Vincula à mão as NFs de um ticket (substitui as anteriores dele); lista vazia remove o vínculo. */
  vincularNfs(ticket: string, vinculos: VinculoNf[]) {
    const chave = ticketKey(ticket);
    const atual = state.manual;
    const porTicket = { ...atual?.porTicket };
    const triangular = { ...atual?.triangular };
    for (const nf of porTicket[chave] ?? []) delete triangular[nf];
    if (vinculos.length) porTicket[chave] = [...new Set(vinculos.map((v) => v.nf))];
    else delete porTicket[chave];
    for (const v of vinculos) if (v.triangular && v.triangular !== v.nf) triangular[v.nf] = v.triangular;
    if (Object.keys(porTicket).length === 0) return zendeskStore.setManual(null);
    const nomes = atual?.fileName.split(' + ') ?? [];
    zendeskStore.setManual({
      fileName: (nomes.includes(VINCULO_NA_TELA) ? nomes : [...nomes, VINCULO_NA_TELA]).join(' + '),
      importadoEm: new Date().toISOString(),
      porTicket,
      triangular,
    });
  },
};

export function useZendesk(): ZendeskState {
  return useSyncExternalStore(subscribe, visivel);
}

export interface ZendeskContagem {
  total: number;
  porSituacao: Record<NfSituacao, number> | null;
}

export function contarZendesk({ tickets, nf }: ZendeskState): ZendeskContagem {
  const lista = tickets?.tickets ?? [];
  if (!nf) return { total: lista.length, porSituacao: null };
  const porSituacao: Record<NfSituacao, number> = { com_nf: 0, sem_nf: 0, fora: 0 };
  for (const ticket of lista) porSituacao[resumoNf(nf, ticket.id).situacao] += 1;
  return { total: lista.length, porSituacao };
}
