import { useSyncExternalStore } from 'react';
import * as XLSX from 'xlsx';
import { normalizeHeader } from '../parse';

/** Uma NF da planilha de Retenção Fiscal. O atraso dela não é da transportadora. */
export interface RetencaoNota {
  cliente: string;
  cidade: string;
  uf: string;
  status: string;
  efetivada: boolean;
}

export interface RetencaoImport {
  fileName: string;
  importadoEm: string;
  total: number;
  /** Linhas com NF lidas do arquivo; ausente em importações antigas. */
  linhas?: number;
  porNf: Record<string, RetencaoNota>;
}

function matrizDaAba(sheet: XLSX.WorkSheet): string[][] {
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false, blankrows: false });
}

/**
 * Uma célula pode trazer várias NFs separadas por espaço ("228575 228744").
 * "215315.0" vindo do Excel não pode virar 2153150.
 */
function nfsDaCelula(value: string): string[] {
  const texto = value.trim();
  if (/^\d+\.0+$/.test(texto)) {
    const nf = texto.replace(/\.0+$/, '').replace(/^0+/, '');
    return nf ? [nf] : [];
  }
  return texto
    .split(/[^\d]+/)
    .map((parte) => parte.replace(/^0+/, ''))
    .filter((nf) => nf.length > 0);
}

export function importRetencaoBuffer(buffer: ArrayBuffer, fileName: string): RetencaoImport {
  const workbook = XLSX.read(buffer, { type: 'array' });
  let matriz: string[][] | null = null;
  let headerIndex = -1;
  for (const nome of workbook.SheetNames) {
    const linhas = matrizDaAba(workbook.Sheets[nome]);
    const indice = linhas.slice(0, 20).findIndex((row) => row.map(normalizeHeader).includes('nfs doc s'));
    if (indice >= 0) {
      matriz = linhas;
      headerIndex = indice;
      break;
    }
  }
  if (!matriz || headerIndex < 0) {
    throw new Error(`Não encontrei a coluna "NFS/DOC-S" em ${fileName}. Use a planilha de Retenção Fiscal.`);
  }

  const headers = matriz[headerIndex].map(normalizeHeader);
  const col = (name: string) => headers.indexOf(name);
  const c = {
    nf: col('nfs doc s'),
    cliente: col('cliente'),
    cidade: col('cidade destinatario'),
    uf: col('trecho') >= 0 ? col('trecho') : col('uf'),
    status: col('status'),
    efetivada: col('efetivada sim nao'),
  };
  const cell = (row: string[], index: number) => (index >= 0 ? String(row[index] ?? '').trim() : '');

  const porNf: Record<string, RetencaoNota> = {};
  let linhas = 0;
  for (const row of matriz.slice(headerIndex + 1)) {
    const nfs = nfsDaCelula(cell(row, c.nf));
    if (nfs.length === 0) continue;
    const uf = cell(row, c.uf).toUpperCase();
    const nota: RetencaoNota = {
      cliente: cell(row, c.cliente),
      cidade: cell(row, c.cidade),
      uf: /^[A-Z]{2}$/.test(uf) ? uf : '',
      status: cell(row, c.status),
      efetivada: /^s/i.test(cell(row, c.efetivada)),
    };
    for (const nf of nfs) {
      linhas += 1;
      porNf[nf] = nota;
    }
  }

  const total = Object.keys(porNf).length;
  if (total === 0) throw new Error(`Nenhuma nota fiscal encontrada em ${fileName}.`);
  return {
    fileName,
    importadoEm: new Date().toISOString(),
    total,
    linhas,
    porNf,
  };
}

export async function importRetencaoFile(file: File): Promise<RetencaoImport> {
  return importRetencaoBuffer(await file.arrayBuffer(), file.name);
}

const DB_NAME = 'arklok_retencao_fiscal';
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

async function gravar(base: RetencaoImport | null): Promise<void> {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    if (base) tx.objectStore(STORE).put(base, CHAVE);
    else tx.objectStore(STORE).delete(CHAVE);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function ler(): Promise<RetencaoImport | null> {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(CHAVE);
    request.onsuccess = () => resolve((request.result as RetencaoImport | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

let base: RetencaoImport | null = null;
const listeners = new Set<() => void>();
const commit = (proxima: RetencaoImport | null) => {
  base = proxima;
  listeners.forEach((listener) => listener());
};

ler()
  .then((salva) => {
    if (salva && !base) commit(salva);
  })
  .catch(() => undefined);

export const retencaoStore = {
  atual: (): RetencaoImport | null => base,
  async set(proxima: RetencaoImport | null) {
    await gravar(proxima);
    commit(proxima);
  },
};

export function useRetencaoFiscal(): RetencaoImport | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => base,
  );
}
