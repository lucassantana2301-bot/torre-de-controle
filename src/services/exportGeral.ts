import * as XLSX from 'xlsx';
import type { Integration, IntegrationStatus } from '../types';
import type { Tratativa } from './tratativaService';
import { gravarNaPasta } from './pastaExport';
import { NF_SITUACOES, ZENDESK_ABAS, resumoNf, ticketKey, type ZendeskState } from './zendeskImport';
import {
  ENTREGA_SITUACOES,
  TRANSPORTADORAS,
  type EntregaNfSituacao,
  type EntregaNota,
  type EntregasState,
} from './entregasImport';

export type Cell = string | number | null;

export interface Tabela {
  nome: string;
  colunas: string[];
  linhas: Cell[][];
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

const STATUS_NOTA: Record<IntegrationStatus, string> = {
  completed: 'Integrada',
  pending: 'Não integrada',
  intelipost_only: 'Só Intelipost',
  error: 'Com erro',
  processing: 'Processando',
};

const SITUACAO_NF_ENTREGA: Record<EntregaNfSituacao, string> = {
  entregue: 'Entregue',
  mesmo_dia: 'Entregue (mesmo dia)',
  devolvida: 'Devolução',
  em_transito: 'Não entregue',
  sem_rastreio: 'Sem rastreio',
};

/** Datas ISO com fuso (ex.: "...Z") viram horário local; "YYYY-MM-DD[THH:mm]" já é horário local. */
function dataExcel(value: string | null | undefined): Cell {
  if (!value) return null;
  let partes: number[];
  if (/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    partes = [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
  } else {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (!match) return value;
    partes = match.slice(1).map((p) => Number(p ?? 0));
  }
  const [y, m, d, hh, mm] = partes;
  return (Date.UTC(y, m - 1, d, hh, mm) - EXCEL_EPOCH) / 86_400_000;
}

const numero = (value: string | null | undefined): Cell =>
  !value ? null : /^\d{1,15}$/.test(value) ? Number(value) : value;

const label = <T extends string>(lista: { id: T; label: string }[], id: T | null | undefined) =>
  lista.find((item) => item.id === id)?.label ?? id ?? null;

function tabelaNotas(integrations: Integration[], tratativas: Record<string, Tratativa>): Tabela {
  return {
    nome: 'Notas',
    colunas: [
      'nota_fiscal', 'nf_triangular', 'validacao', 'status', 'cliente', 'tipo_nota', 'pedido', 'contrato',
      'transportadora', 'cidade', 'uf', 'romaneio', 'rastreio', 'chave_acesso', 'data_emissao', 'data_integracao',
      'tratado', 'tratado_em', 'pdv', 'nota_antiga', 'nota_nova', 'ultimo_comentario',
    ],
    linhas: integrations.map((item) => {
      const meta = item.metadata ?? {};
      const tratativa = tratativas[item.id];
      return [
        numero(meta.notaFiscal ?? item.id.replace(/^NF-/, '')),
        numero(meta.nfTriangular),
        meta.validacao ?? null,
        STATUS_NOTA[item.status] ?? item.status,
        meta.clienteDestino || item.name.replace(/^NF\s+\S+\s*(·\s*)?/, ''),
        meta.tipoNota ?? null,
        meta.pedido ?? null,
        meta.contrato ?? null,
        meta.transportadora ?? null,
        meta.cidade ?? null,
        meta.uf ?? null,
        meta.romaneio ?? null,
        meta.rastreio ?? null,
        meta.chaveAcesso ?? null,
        dataExcel(meta.dataEmissao),
        dataExcel(meta.dataIntegracao),
        tratativa?.tratado ? 'Sim' : 'Não',
        dataExcel(tratativa?.tratadoEm),
        tratativa?.pdv || null,
        numero(tratativa?.notaAntiga),
        numero(tratativa?.notaNova),
        tratativa?.comentarios.at(-1)?.texto ?? null,
      ];
    }),
  };
}

function tabelaComentarios(integrations: Integration[], tratativas: Record<string, Tratativa>): Tabela {
  const notaPorId = new Map(integrations.map((i) => [i.id, i.metadata?.notaFiscal ?? i.id.replace(/^NF-/, '')]));
  return {
    nome: 'Tratativas',
    colunas: ['nota_fiscal', 'comentario', 'criado_em'],
    linhas: Object.entries(tratativas).flatMap(([id, tratativa]) =>
      tratativa.comentarios.map((c) => [numero(notaPorId.get(id) ?? id.replace(/^NF-/, '')), c.texto, dataExcel(c.criadoEm)]),
    ),
  };
}

function tabelaTickets({ tickets, nf }: ZendeskState): Tabela {
  return {
    nome: 'Zendesk_Tickets',
    colunas: [
      'id_zendesk', 'status', 'aba', 'situacao_nf', 'grupo', 'organizacao', 'grupo_economico', 'uf', 'localidade',
      'prioridade', 'criado_em', 'atualizado_em', 'idade_dias', 'dias_sem_atualizacao',
    ],
    linhas: (tickets?.tickets ?? []).map((t) => [
      numero(t.id),
      t.status,
      label(ZENDESK_ABAS, t.aba),
      nf ? label(NF_SITUACOES, resumoNf(nf, t.id).situacao) : null,
      t.grupo,
      t.organizacao,
      t.grupoEconomico,
      t.uf,
      t.localidade,
      t.prioridade,
      dataExcel(t.criadoEm),
      dataExcel(t.atualizadoEm),
      t.idadeDias,
      t.diasSemAtualizacao,
    ]),
  };
}

/** Com tickets carregados, leva só as NFs deles; a planilha de NF inteira tem o histórico de todos os chamados. */
function tabelaTicketNf({ tickets, nf }: ZendeskState): Tabela {
  const ids = tickets ? new Set(tickets.tickets.map((t) => ticketKey(t.id))) : null;
  return {
    nome: 'Zendesk_NF',
    colunas: ['id_zendesk', 'nota_fiscal', 'romaneio', 'data_romaneio', 'etapa'],
    linhas: Object.entries(nf?.porTicket ?? {})
      .filter(([ticket]) => !ids || ids.has(ticket))
      .flatMap(([ticket, registros]) =>
      registros.map((r) => [numero(ticket), numero(r.nf), numero(r.romaneio), dataExcel(r.dataRomaneio), r.etapa]),
    ),
  };
}

function tabelaEntregas(cruzadas: EntregaNota[]): Tabela {
  return {
    nome: 'Entregas',
    colunas: [
      'nota_fiscal', 'nf_triangular', 'data_emissao', 'cliente', 'situacao', 'situacao_nf', 'transportadora',
      'transportadora_nota', 'rastreio', 'ultimo_status', 'data_status', 'previsao', 'data_entrega', 'recebedor',
      'cidade', 'uf', 'id_zendesk',
    ],
    linhas: cruzadas.map((n) => [
      numero(n.nf),
      numero(n.nfTriangular),
      dataExcel(n.emissao),
      n.cliente || null,
      label(ENTREGA_SITUACOES, n.situacao),
      SITUACAO_NF_ENTREGA[n.entrega.situacao],
      label(TRANSPORTADORAS, n.entrega.transportadora),
      n.transportadoraIntelipost || null,
      n.rastreio || null,
      n.entrega.evento?.ultimoStatus || null,
      dataExcel(n.entrega.evento?.dataStatus),
      dataExcel(n.entrega.evento?.previsao),
      dataExcel(n.entrega.evento?.dataEntrega),
      n.entrega.evento?.recebedor || null,
      n.cidade || n.entrega.evento?.cidade || null,
      n.uf || n.entrega.evento?.uf || null,
      n.tickets.join(' / ') || null,
    ]),
  };
}

function tabelaTransportadoras({ transportadoras }: EntregasState): Tabela {
  return {
    nome: 'Transportadoras',
    colunas: [
      'transportadora', 'nota_fiscal', 'ultimo_status', 'data_status', 'previsao', 'data_entrega', 'recebedor',
      'destinatario', 'cidade', 'uf',
    ],
    linhas: TRANSPORTADORAS.flatMap(({ id, label: nome }) =>
      Object.entries(transportadoras[id]?.porNf ?? {}).flatMap(([nf, eventos]) =>
        eventos.map((e) => [
          nome,
          numero(nf),
          e.ultimoStatus || null,
          dataExcel(e.dataStatus),
          dataExcel(e.previsao),
          dataExcel(e.dataEntrega),
          e.recebedor || null,
          e.destinatario || null,
          e.cidade || null,
          e.uf || null,
        ]),
      ),
    ),
  };
}

export function montarAba({ colunas, linhas }: Tabela): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet([colunas, ...linhas]);
  const datas = colunas.flatMap((c, i) => (/(^data_|_em$|^previsao$)/.test(c) ? [i] : []));
  linhas.forEach((linha, r) => {
    for (const c of datas) {
      const cell = sheet[XLSX.utils.encode_cell({ r: r + 1, c })];
      if (cell?.t === 'n') cell.z = Number.isInteger(linha[c]) ? 'dd/mm/yyyy' : 'dd/mm/yyyy hh:mm';
    }
  });
  sheet['!cols'] = colunas.map((c, i) => ({
    wch: Math.min(45, Math.max(c.length + 2, ...linhas.slice(0, 200).map((l) => (datas.includes(i) ? 16 : String(l[i] ?? '').length + 2)))),
  }));
  sheet['!autofilter'] = { ref: sheet['!ref'] ?? 'A1' };
  return sheet;
}

export interface FontesExportGeral {
  integrations: Integration[];
  tratativas: Record<string, Tratativa>;
  zendesk: ZendeskState;
  entregas: EntregasState;
  cruzadas: EntregaNota[];
}

export const hojeLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function montarTabelas({ integrations, tratativas, zendesk, entregas, cruzadas }: FontesExportGeral): Tabela[] {
  return [
    tabelaNotas(integrations, tratativas),
    tabelaComentarios(integrations, tratativas),
    tabelaTickets(zendesk),
    tabelaTicketNf(zendesk),
    tabelaEntregas(cruzadas),
    tabelaTransportadoras(entregas),
  ];
}

export function origensDasTabelas({ zendesk, entregas }: FontesExportGeral): Record<string, string> {
  return {
    Zendesk_Tickets: zendesk.tickets?.fileName ?? '',
    Zendesk_NF: zendesk.nf?.fileName ?? '',
    Entregas: 'Notas integradas × transportadoras',
    Transportadoras: TRANSPORTADORAS.flatMap(({ id }) => entregas.transportadoras[id]?.fileName ?? []).join(' / '),
  };
}

/** Monta o arquivo com uma aba "Resumo" + uma aba por tabela e grava na pasta escolhida (ou baixa). */
export async function salvarWorkbook(
  arquivo: string,
  resumo: Cell[][],
  tabelas: Tabela[],
): Promise<{ arquivo: string; pasta: string | null }> {
  const workbook = XLSX.utils.book_new();
  const abaResumo = XLSX.utils.aoa_to_sheet(resumo);
  abaResumo['!cols'] = resumo[0].map((c) => ({ wch: Math.max(14, String(c ?? '').length + 2) }));
  XLSX.utils.book_append_sheet(workbook, abaResumo, 'Resumo');
  for (const tabela of tabelas) XLSX.utils.book_append_sheet(workbook, montarAba(tabela), tabela.nome);

  const dados: ArrayBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const pasta = await gravarNaPasta(arquivo, dados);
  if (!pasta) XLSX.writeFile(workbook, arquivo);
  return { arquivo, pasta };
}

/** Grava o arquivo do dia na pasta escolhida; sem pasta (ou navegador sem suporte), baixa normalmente. */
export async function exportarGeral(
  fontes: FontesExportGeral,
  data = hojeLocal(),
): Promise<{ arquivo: string; pasta: string | null }> {
  const tabelas = montarTabelas(fontes);
  const origens = origensDasTabelas(fontes);
  return salvarWorkbook(
    `arktransp_base_${data}.xlsx`,
    [['aba', 'registros', 'planilha_origem'], ...tabelas.map((t) => [t.nome, t.linhas.length, origens[t.nome] ?? ''])],
    tabelas,
  );
}
