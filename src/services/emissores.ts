import { useSyncExternalStore } from 'react';
import * as XLSX from 'xlsx';
import { normalizeHeader } from '../parse';

/** Quem emitiu cada NF no Protheus, pela "Extração - Romaneio" (USR_EMISSAO = login_dd/mm/aaaa_hh:mm). */
export interface EmissoresImport {
  fileName: string;
  importadoEm: string;
  total: number;
  logins: string[];
  /** NF → [índice do login em `logins`, emitida em "AAAA-MM-DDTHH:mm" ou ""]. */
  porNf: Record<string, [number, string]>;
}

export interface Emissao {
  login: string;
  em: string;
}

const USR = /^(.*?)_(\d{2})\/(\d{2})\/(\d{4})_(\d{2}):(\d{2})$/;

function lerUsuario(valor: unknown): Emissao | null {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;
  const m = texto.match(USR);
  if (!m) return { login: texto.toLowerCase(), em: '' };
  const [, login, dd, mm, aaaa, hh, mi] = m;
  return { login: login.toLowerCase(), em: `${aaaa}-${mm}-${dd}T${hh}:${mi}` };
}

const numeroNf = (valor: unknown) => {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  return digitos ? String(Number(digitos)) : '';
};

export async function importEmissoresFile(file: File): Promise<EmissoresImport> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  for (const nome of workbook.SheetNames) {
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[nome], { header: 1, defval: '', raw: true, blankrows: false });
    const linhaCabecalho = matriz.slice(0, 15).findIndex((row) => row.map(normalizeHeader).includes('usr emissao'));
    if (linhaCabecalho < 0) continue;
    const cabecalho = matriz[linhaCabecalho].map(normalizeHeader);
    const pares: [number, number][] = [
      [cabecalho.indexOf('nota fiscal'), cabecalho.indexOf('usr emissao')],
      [cabecalho.findIndex((h) => /^nf triang/.test(h)), cabecalho.indexOf('usr emissao triang')],
    ];
    if (pares[0][0] < 0) break;
    const logins: string[] = [];
    const indice = new Map<string, number>();
    const porNf: Record<string, [number, string]> = {};
    for (const row of matriz.slice(linhaCabecalho + 1)) {
      for (const [colNf, colUsr] of pares) {
        if (colNf < 0 || colUsr < 0) continue;
        const nf = numeroNf(row[colNf]);
        const emissao = nf && !porNf[nf] ? lerUsuario(row[colUsr]) : null;
        if (!emissao) continue;
        let i = indice.get(emissao.login);
        if (i === undefined) {
          i = logins.push(emissao.login) - 1;
          indice.set(emissao.login, i);
        }
        porNf[nf] = [i, emissao.em];
      }
    }
    const total = Object.keys(porNf).length;
    if (total === 0) break;
    return { fileName: file.name, importadoEm: new Date().toISOString(), total, logins, porNf };
  }
  throw new Error(`Não encontrei as colunas NOTA FISCAL e USR_EMISSAO com valores em ${file.name}.`);
}

export function emissaoDaNf(base: EmissoresImport | null, nf: string | undefined): Emissao | null {
  const registro = base && nf ? base.porNf[numeroNf(nf)] : undefined;
  return registro ? { login: base!.logins[registro[0]], em: registro[1] } : null;
}

/** ~30 mil NFs não cabem com folga no localStorage, por isso a base fica no IndexedDB. */
const DB_NAME = 'arklok_emissores';
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

async function gravar(base: EmissoresImport | null): Promise<void> {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    if (base) tx.objectStore(STORE).put(base, CHAVE);
    else tx.objectStore(STORE).delete(CHAVE);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function ler(): Promise<EmissoresImport | null> {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(CHAVE);
    request.onsuccess = () => resolve((request.result as EmissoresImport | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

let base: EmissoresImport | null = null;
const listeners = new Set<() => void>();
const commit = (proxima: EmissoresImport | null) => {
  base = proxima;
  listeners.forEach((listener) => listener());
};

ler()
  .then((salva) => {
    if (salva && !base) commit(salva);
  })
  .catch(() => undefined);

export const emissoresStore = {
  atual: (): EmissoresImport | null => base,
  async set(proxima: EmissoresImport | null) {
    await gravar(proxima);
    commit(proxima);
  },
};

export function useEmissores(): EmissoresImport | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => base,
  );
}
