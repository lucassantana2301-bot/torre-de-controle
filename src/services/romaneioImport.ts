import { useSyncExternalStore } from 'react';
import * as XLSX from 'xlsx';
import { normalizeHeader } from '../parse';
import { parseBrDate, type TransportadoraId } from './entregasImport';

/**
 * Com quem a NF saiu no romaneio. "proprio" é a transportadora "O PROPRIO" (sem transportadora contratada);
 * "outra" é qualquer transportadora fora da SPfly, Jamef e Certex.
 */
export type TransportadoraRomaneio = TransportadoraId | 'frota' | 'lalamove' | 'proprio' | 'outra';

export interface RomaneioNota {
  transportadora: TransportadoraRomaneio;
  /** Razão social como veio no romaneio (ex.: "DEMMEL TRANSPORTES E LOGISTICA LTDA"). */
  razao: string;
  romaneio: string;
  /** Emissão da NF (YYYY-MM-DD). */
  emissao: string;
  cliente: string;
  cidade: string;
  uf: string;
}

export interface RomaneioImport {
  fileName: string;
  importadoEm: string;
  total: number;
  porNf: Record<string, RomaneioNota>;
}

/** Classifica pelo nome: os códigos se repetem com outra quantidade de zeros (00016 Tex Courier, 000016 Frota interna). */
export function classificarTransportadora(razao: string): TransportadoraRomaneio | null {
  const nome = razao.toUpperCase();
  if (!nome.trim()) return null;
  if (/DEMMEL|SP\s?FLY/.test(nome)) return 'spfly';
  if (/JAMEF/.test(nome)) return 'jamef';
  if (/CERTEX/.test(nome)) return 'certex';
  if (/FROTA\s+INTERNA/.test(nome)) return 'frota';
  if (/LALAMOVE/.test(nome)) return 'lalamove';
  if (/^O\s+PR[OÓ]PRIO\b/.test(nome.trim())) return 'proprio';
  return 'outra';
}

export const ROTULO_ROMANEIO: Record<TransportadoraRomaneio, string> = {
  spfly: 'SPfly',
  jamef: 'Jamef',
  certex: 'Certex',
  frota: 'Frota interna',
  lalamove: 'Lalamove',
  proprio: 'O próprio',
  outra: 'Outra transportadora',
};

/** Nome curto para listas: "RED CARGAS" fica "Red Cargas"; as três do contrato usam o nome comercial. */
export function nomeNoRomaneio(nota: RomaneioNota): string {
  if (nota.transportadora !== 'outra') return ROTULO_ROMANEIO[nota.transportadora];
  return nota.razao
    .toLowerCase()
    .replace(/\b(ltda|s\.?a\.?|eireli|me|epp)\b\.?/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|\s)\S/g, (letra) => letra.toUpperCase());
}

const nfLimpa = (valor: string) => {
  const texto = valor.trim().replace(/\.0+$/, '');
  return /^\d+$/.test(texto) ? texto.replace(/^0+/, '') : '';
};

export function importRomaneioBuffer(buffer: ArrayBuffer, fileName: string): RomaneioImport {
  const workbook = XLSX.read(buffer, { type: 'array' });
  let matriz: string[][] | null = null;
  let headerIndex = -1;
  for (const nome of workbook.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[nome], { header: 1, defval: '', raw: false, blankrows: false });
    const indice = linhas.slice(0, 20).findIndex((row) => {
      const h = row.map(normalizeHeader);
      return h.includes('nota fiscal') && h.includes('razao') && h.includes('romaneio');
    });
    if (indice >= 0) {
      matriz = linhas;
      headerIndex = indice;
      break;
    }
  }
  if (!matriz || headerIndex < 0) {
    throw new Error(`Não encontrei as colunas ROMANEIO, NOTA FISCAL e RAZAO em ${fileName}. Use a extração de romaneio.`);
  }

  const headers = matriz[headerIndex].map(normalizeHeader);
  const col = (...nomes: string[]) => headers.findIndex((h) => nomes.includes(h));
  const c = {
    romaneio: col('romaneio'),
    nf: col('nota fiscal'),
    razao: col('razao'),
    emissao: col('dt emissao'),
    cliente: col('nome dest'),
    cidade: col('mun dest', 'mun destino'),
    uf: col('uf dest', 'uf destino'),
    nfTriangular: col('nf triang'),
    razaoTriangular: col('razao triang'),
  };
  const cell = (row: string[], index: number) => (index >= 0 ? String(row[index] ?? '').trim() : '');

  const porNf: Record<string, RomaneioNota> = {};
  const guardar = (nf: string, razao: string, row: string[]) => {
    const transportadora = classificarTransportadora(razao);
    if (!nf || !transportadora) return;
    porNf[nf] = {
      transportadora,
      razao,
      romaneio: cell(row, c.romaneio).replace(/^0+/, ''),
      emissao: parseBrDate(cell(row, c.emissao)).slice(0, 10),
      cliente: cell(row, c.cliente),
      cidade: cell(row, c.cidade),
      uf: cell(row, c.uf).toUpperCase(),
    };
  };
  for (const row of matriz.slice(headerIndex + 1)) {
    guardar(nfLimpa(cell(row, c.nf)), cell(row, c.razao), row);
    guardar(nfLimpa(cell(row, c.nfTriangular)), cell(row, c.razaoTriangular), row);
  }

  const total = Object.keys(porNf).length;
  if (total === 0) throw new Error(`Nenhuma NF com transportadora encontrada em ${fileName}.`);
  return { fileName, importadoEm: new Date().toISOString(), total, porNf };
}

export async function importRomaneioFile(file: File): Promise<RomaneioImport> {
  return importRomaneioBuffer(await file.arrayBuffer(), file.name);
}

/** ~80 mil NFs não cabem no localStorage, por isso a base fica no IndexedDB. */
const DB_NAME = 'arklok_romaneio';
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

async function gravar(proxima: RomaneioImport | null): Promise<void> {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    if (proxima) tx.objectStore(STORE).put(proxima, CHAVE);
    else tx.objectStore(STORE).delete(CHAVE);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function ler(): Promise<RomaneioImport | null> {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(CHAVE);
    request.onsuccess = () => resolve((request.result as RomaneioImport | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

let base: RomaneioImport | null = null;
const listeners = new Set<() => void>();
const commit = (proxima: RomaneioImport | null) => {
  base = proxima;
  listeners.forEach((listener) => listener());
};

/** Bases salvas antes de uma regra nova de classificação passam pela regra atual ao abrir. */
function reclassificar(salva: RomaneioImport): RomaneioImport {
  const porNf: Record<string, RomaneioNota> = {};
  for (const [nf, nota] of Object.entries(salva.porNf)) {
    porNf[nf] = { ...nota, transportadora: classificarTransportadora(nota.razao) ?? nota.transportadora };
  }
  return { ...salva, porNf };
}

ler()
  .then((salva) => {
    if (salva && !base) commit(reclassificar(salva));
  })
  .catch(() => undefined);

export const romaneioStore = {
  atual: (): RomaneioImport | null => base,
  async set(proxima: RomaneioImport | null) {
    await gravar(proxima);
    commit(proxima);
  },
};

export function useRomaneio(): RomaneioImport | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => base,
  );
}
