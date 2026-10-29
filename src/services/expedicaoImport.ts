import { useSyncExternalStore } from 'react';
import * as XLSX from 'xlsx';
import { normalizeHeader } from '../parse';
import { ticketKey } from './zendeskImport';
import { parseBrDate } from './entregasImport';

/** Uma linha do Relatório de Expedição: quando e como a NF saiu da Arklok. */
export interface ExpedicaoNota {
  saida: string;
  uf: string;
  transportadora: string;
  modal: string;
  tipo: string;
  cliente: string;
}

export interface ExpedicaoImport {
  fileName: string;
  importadoEm: string;
  total: number;
  /** Linhas com NF lidas do arquivo (a mesma NF pode aparecer mais de uma vez); ausente em importações antigas. */
  linhas?: number;
  periodo: { de: string; ate: string };
  porNf: Record<string, ExpedicaoNota>;
}

/** CSV com aspas (endereços podem ter ";" e quebras de linha dentro do campo). */
function parseCsv(text: string): string[][] {
  const primeira = text.slice(0, text.search(/\r?\n/) >>> 0);
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** O relatório sai do Excel em ANSI (Windows-1252); UTF-8 fica como alternativa. */
function decodificar(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

async function lerMatriz(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  if (/\.csv$/i.test(file.name)) return parseCsv(decodificar(buffer));
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false, blankrows: false });
}

export async function importExpedicaoFile(file: File): Promise<ExpedicaoImport> {
  const matrix = await lerMatriz(file);
  const headerIndex = matrix
    .slice(0, 15)
    .findIndex((row) => {
      const headers = row.map(normalizeHeader);
      return headers.includes('nota fiscal') && headers.includes('data saida');
    });
  if (headerIndex < 0) {
    throw new Error(`Não encontrei as colunas "Nota Fiscal" e "Data Saida" em ${file.name}. Use o Relatório de Expedição.`);
  }
  const headers = matrix[headerIndex].map(normalizeHeader);
  const col = (name: string) => headers.indexOf(name);
  const c = {
    nf: col('nota fiscal'),
    saida: col('data saida'),
    uf: col('uf'),
    transportadora: col('transportadora'),
    modal: col('modal'),
    tipo: col('tipo'),
    cliente: col('cliente'),
  };
  const cell = (row: string[], index: number) => (index >= 0 ? String(row[index] ?? '').trim() : '');

  const porNf: Record<string, ExpedicaoNota> = {};
  const saidas: string[] = [];
  let linhas = 0;
  for (const row of matrix.slice(headerIndex + 1)) {
    const nf = ticketKey(cell(row, c.nf));
    if (!/^\d+$/.test(nf)) continue;
    linhas += 1;
    const uf = cell(row, c.uf).toUpperCase();
    const saida = parseBrDate(cell(row, c.saida)).slice(0, 10);
    if (saida) saidas.push(saida);
    porNf[nf] = {
      saida,
      uf: /^[A-Z]{2}$/.test(uf) ? uf : '',
      transportadora: cell(row, c.transportadora),
      modal: cell(row, c.modal),
      tipo: cell(row, c.tipo),
      cliente: cell(row, c.cliente),
    };
  }
  const total = Object.keys(porNf).length;
  if (total === 0) throw new Error(`Nenhuma nota fiscal encontrada em ${file.name}.`);
  saidas.sort();
  return {
    fileName: file.name,
    importadoEm: new Date().toISOString(),
    total,
    linhas,
    periodo: { de: saidas[0] ?? '', ate: saidas.at(-1) ?? '' },
    porNf,
  };
}

/** ~20 mil notas não cabem com folga no localStorage, por isso a base fica no IndexedDB. */
const DB_NAME = 'arklok_expedicao';
const STORE = 'base';
const CHAVE = 'atual';

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function gravar(base: ExpedicaoImport | null): Promise<void> {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    if (base) tx.objectStore(STORE).put(base, CHAVE);
    else tx.objectStore(STORE).delete(CHAVE);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function ler(): Promise<ExpedicaoImport | null> {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(CHAVE);
    request.onsuccess = () => resolve((request.result as ExpedicaoImport | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

let base: ExpedicaoImport | null = null;
const listeners = new Set<() => void>();
const commit = (proxima: ExpedicaoImport | null) => {
  base = proxima;
  listeners.forEach((listener) => listener());
};

ler()
  .then((salva) => {
    if (salva && !base) commit(salva);
  })
  .catch(() => undefined);

export const expedicaoStore = {
  atual: (): ExpedicaoImport | null => base,
  async set(proxima: ExpedicaoImport | null) {
    await gravar(proxima);
    commit(proxima);
  },
};

export function useExpedicao(): ExpedicaoImport | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => base,
  );
}
