import type { Integration, IntegrationCategory, SheetPresence } from '../types';
import { parseWorkbook, type ParsedSheet, type SourceKind } from '../parse';
import { notasEmitidas, type AllocaNota } from '../reconcile';
import { calendarKey, noonIso } from '../utils/businessDay';

export type ImportSummary = {
  notas: number;
  remanejamento: number;
  diaCorrente: number;
  allocaFile: string;
};

export type WorkbookImport = {
  integrations: Integration[];
  summary: ImportSummary;
};

function categoryFor(tipo: string, presence: SheetPresence): IntegrationCategory {
  if (tipo.toUpperCase().includes('FISCAL')) return 'Fiscal & NF';
  if (presence === 'alloca_only') return 'ERP Protheus';
  return 'Logística';
}

function baseFromAlloca(nota: AllocaNota, presence: SheetPresence, when: string): Integration {
  return {
    id: `NF-${nota.nf}`,
    name: `NF ${nota.nf}${nota.cliente ? ` · ${nota.cliente}` : ''}`,
    description: '',
    category: categoryFor(nota.tipo, presence),
    type: 'TMS_CARRIER',
    status: 'pending',
    createdAt: when,
    lastRunAt: null,
    durationMs: 0,
    responsible: 'Alloca07',
    errorMessage: null,
    retryCount: 0,
    sourceSystem: 'ALLOCA_PROTHEUS',
    targetSystem: 'INTELIPOST',
    metadata: {
      notaFiscal: nota.nf,
      nfTriangular: nota.nfTriangular || undefined,
      tipoNota: nota.tipo || undefined,
      serieNf: nota.serie || undefined,
      dataEmissao: nota.emissao ? calendarKey(nota.emissao) : undefined,
      pedido: nota.pedido || undefined,
      clienteDestino: nota.cliente || undefined,
      cidade: nota.cidade || undefined,
      uf: nota.uf || undefined,
      romaneio: nota.romaneio || undefined,
      contrato: nota.contrato || undefined,
      presenca: presence,
    },
  };
}

function fromEmitida(nota: AllocaNota): Integration {
  const when = noonIso(nota.emissao);
  const item = baseFromAlloca(nota, 'alloca_only', when);
  item.status = 'completed';
  item.lastRunAt = when;
  item.description = 'Nota emitida na Alloca07.';
  item.targetSystem = 'OPERACAO';
  return item;
}

/** Bases (Alloca07 e/ou Intelipost) encontradas no arquivo; vazio se não for nenhuma das duas. */
export async function identificarPlanilha(file: File): Promise<SourceKind[]> {
  return [...new Set(parseWorkbook(await file.arrayBuffer()).map((sheet) => sheet.kind))];
}

function bestSheet(sheets: ParsedSheet[], kind: SourceKind): ParsedSheet | null {
  const matches = sheets.filter((sheet) => sheet.kind === kind);
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.rows.length - a.rows.length)[0];
}

export async function importWorkbookFiles(files: File[]): Promise<WorkbookImport> {
  if (files.length === 0) {
    throw new Error('Selecione a planilha da Alloca07.');
  }

  const sheets: ParsedSheet[] = [];
  let allocaFile = '';

  for (const file of files) {
    const parsed = parseWorkbook(await file.arrayBuffer());
    const alloca = parsed.filter((sheet) => sheet.kind === 'alloca');
    if (alloca.length === 0) {
      throw new Error(`Não encontrei a exportação da Alloca07 em ${file.name}.`);
    }
    sheets.push(...alloca);
    if (!allocaFile) allocaFile = file.name;
  }

  const alloca = bestSheet(sheets, 'alloca');
  if (!alloca) throw new Error('Falta a planilha da Alloca07.');

  const result = notasEmitidas(alloca.rows);
  const integrations = result.notas.map(fromEmitida);

  if (integrations.length === 0) {
    throw new Error('A planilha foi lida, mas nenhuma nota fiscal entrou na base.');
  }

  return {
    integrations,
    summary: {
      notas: result.notas.length,
      remanejamento: result.remanejamento,
      diaCorrente: result.diaCorrente,
      allocaFile: allocaFile || 'Alloca07',
    },
  };
}
