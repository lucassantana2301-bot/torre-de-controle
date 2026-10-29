import { useSyncExternalStore } from 'react';
import * as XLSX from 'xlsx';

export interface LinhaConferencia {
  ticket: string;
  nfs: string[];
  organizacao: string;
  /** "Tp. Previsao" da Alloca (Sustentação, Implantação, Remanejamento…). */
  tipo?: string;
  /** yyyy-mm-dd */
  emissao?: string;
  /** Destino da NF ("Mun. Destino" / "UF Destino" da Alloca). */
  cidade?: string;
  uf?: string;
}

export interface ListaConferencia {
  fileName: string;
  importadoEm: string;
  linhas: LinhaConferencia[];
  /** Linhas com ticket mas sem nenhuma NF preenchida. */
  semNf: number;
  temTicket: boolean;
  temTipo?: boolean;
  temEmissao?: boolean;
}

const normalizar = (valor: unknown) =>
  String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();

const COLUNA_NF = /^(nota fiscal|notas fiscais|nf|nfs|nfe|numero (da )?(nf|nota)|n(o|º)? nf)$/;
const COLUNA_TICKET = /zendesk|ticket|chamado/;
const COLUNA_ORGANIZACAO = /organiza|cliente|destinatario/;
const COLUNA_TIPO = /^(tp|tipo)\.? (de )?previsao$/;
const COLUNA_EMISSAO = /^(dt|data)\.? (de )?emissao( nf)?$/;
const COLUNA_CIDADE = /^(mun\.?|municipio|cidade)( (de )?destino)?$/;
const COLUNA_UF = /^(uf|estado)( (de )?destino)?$/;

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Aceita serial do Excel, dd/mm/aaaa e aaaa-mm-dd. */
function dataDaCelula(valor: unknown): string {
  if (typeof valor === 'number' && valor > 0) return new Date(EXCEL_EPOCH + Math.floor(valor) * 86_400_000).toISOString().slice(0, 10);
  const texto = String(valor ?? '').trim();
  const br = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${ano}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }
  return /^\d{4}-\d{2}-\d{2}/.test(texto) ? texto.slice(0, 10) : '';
}

/** Uma célula pode ter várias NFs ("123 / 456", "123,456"); zeros à esquerda são ignorados. */
const nfsDaCelula = (valor: unknown): string[] => [
  ...new Set(
    String(valor ?? '')
      .split(/[^\d]+/)
      .filter((parte) => parte.length >= 3)
      .map((parte) => String(Number(parte))),
  ),
];

const ticketDaCelula = (valor: unknown) => String(valor ?? '').replace(/\D/g, '').replace(/^0+/, '');

export async function importListaConferencia(file: File): Promise<ListaConferencia> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true });
  for (const nomeAba of workbook.SheetNames) {
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[nomeAba], { header: 1, raw: true, defval: '' });
    const inicio = matriz.slice(0, 30).findIndex((linha) => linha.some((celula) => COLUNA_NF.test(normalizar(celula))));
    if (inicio < 0) continue;

    const cabecalho = matriz[inicio].map(normalizar);
    const colNf = cabecalho.findIndex((c) => COLUNA_NF.test(c));
    const colTicket = cabecalho.findIndex((c) => COLUNA_TICKET.test(c));
    const colOrganizacao = cabecalho.findIndex((c) => COLUNA_ORGANIZACAO.test(c));
    const colTipo = cabecalho.findIndex((c) => COLUNA_TIPO.test(c));
    const colEmissao = cabecalho.findIndex((c) => COLUNA_EMISSAO.test(c));
    const colCidade = cabecalho.findIndex((c) => COLUNA_CIDADE.test(c));
    const colUf = cabecalho.findIndex((c) => COLUNA_UF.test(c));

    const linhas: LinhaConferencia[] = [];
    let semNf = 0;
    for (const linha of matriz.slice(inicio + 1)) {
      const nfs = nfsDaCelula(linha[colNf]);
      const ticket = colTicket >= 0 ? ticketDaCelula(linha[colTicket]) : '';
      if (!nfs.length) {
        if (ticket) semNf++;
        continue;
      }
      linhas.push({
        ticket,
        nfs,
        organizacao: colOrganizacao >= 0 ? String(linha[colOrganizacao] ?? '').trim() : '',
        ...(colTipo >= 0 && { tipo: String(linha[colTipo] ?? '').trim() }),
        ...(colEmissao >= 0 && { emissao: dataDaCelula(linha[colEmissao]) }),
        ...(colCidade >= 0 && { cidade: String(linha[colCidade] ?? '').trim() }),
        ...(colUf >= 0 && { uf: String(linha[colUf] ?? '').trim().toUpperCase() }),
      });
    }
    if (!linhas.length) throw new Error(`A coluna de nota fiscal de "${file.name}" está vazia.`);
    return {
      fileName: file.name,
      importadoEm: new Date().toISOString(),
      linhas,
      semNf,
      temTicket: colTicket >= 0,
      temTipo: colTipo >= 0,
      temEmissao: colEmissao >= 0,
    };
  }
  throw new Error(`Não encontrei uma coluna de nota fiscal em "${file.name}" (ex.: "nota_fiscal", "Nota Fiscal" ou "NF").`);
}

const STORAGE_KEY = 'arklok_entregas_base_v1';

function carregar(): ListaConferencia | null {
  try {
    const salvo = localStorage.getItem(STORAGE_KEY);
    return salvo ? (JSON.parse(salvo) as ListaConferencia) : null;
  } catch {
    return null;
  }
}

let atual: ListaConferencia | null = carregar();
const ouvintes = new Set<() => void>();

export const conferenciaStore = {
  atual(): ListaConferencia | null {
    return atual;
  },
  /** Retorna false se não coube no armazenamento (a planilha continua valendo até recarregar a página). */
  set(proxima: ListaConferencia | null): boolean {
    atual = proxima;
    ouvintes.forEach((ouvinte) => ouvinte());
    try {
      if (proxima) localStorage.setItem(STORAGE_KEY, JSON.stringify(proxima));
      else localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  },
};

export function useListaConferencia(): ListaConferencia | null {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    () => atual,
  );
}
