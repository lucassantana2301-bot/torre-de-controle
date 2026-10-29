import { useSyncExternalStore } from 'react';
import {
  TRANSPORTADORAS,
  entregasStore,
  formatBrDate,
  importTransportadoraFile,
  type TransportadoraId,
} from './entregasImport';
import { expedicaoStore, importExpedicaoFile } from './expedicaoImport';
import { formatDateTimeBr } from './tratativaService';
import type { ImportSummary } from './workbookImport';
import { formatZendeskDate, importNfFile, importZendeskFile, zendeskStore } from './zendeskImport';

export type FonteId = 'cruzamento' | TransportadoraId | 'zendesk' | 'nf' | 'expedicao';
/** Fontes enviadas como um arquivo só; o cruzamento usa duas planilhas e tem modal próprio. */
export type FonteArquivo = Exclude<FonteId, 'cruzamento'>;

export const FONTES: { id: FonteId; nome: string }[] = [
  { id: 'cruzamento', nome: 'Alloca07 × Intelipost' },
  ...TRANSPORTADORAS.map(({ id, label }) => ({ id, nome: `Transportadora ${label}` })),
  { id: 'zendesk', nome: 'Tickets Zendesk' },
  { id: 'nf', nome: 'NF dos romaneios' },
  { id: 'expedicao', nome: 'Relatório de Expedição' },
];

export const nomeFonte = (id: FonteId) => FONTES.find((fonte) => fonte.id === id)?.nome ?? id;

export interface NumeroResumo {
  rotulo: string;
  valor: number;
  tom?: 'ok' | 'aviso';
  dica?: string;
}

export interface Execucao {
  id: string;
  fonte: FonteId;
  arquivo: string;
  em: string;
  status: 'sucesso' | 'erro';
  numeros?: NumeroResumo[];
  periodo?: string;
  erro?: string;
}

const CHAVE = 'arklok_importacoes_v1';
const LIMITE = 300;

function lerHistorico(): Execucao[] {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? '[]');
    return Array.isArray(salvo) ? salvo : [];
  } catch {
    return [];
  }
}

let historico = lerHistorico();
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((ouvinte) => ouvinte());

window.addEventListener('storage', (event) => {
  if (event.key !== CHAVE) return;
  historico = lerHistorico();
  avisar();
});

export function registrarExecucao(dados: Omit<Execucao, 'id' | 'em'>): void {
  const execucao: Execucao = {
    ...dados,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    em: new Date().toISOString(),
  };
  historico = [execucao, ...historico].slice(0, LIMITE);
  try {
    localStorage.setItem(CHAVE, JSON.stringify(historico));
  } catch {
    historico = historico.slice(0, 50);
    try {
      localStorage.setItem(CHAVE, JSON.stringify(historico));
    } catch {
      // Sem espaço: o histórico fica só nesta sessão.
    }
  }
  avisar();
}

export function useHistoricoImportacoes(): Execucao[] {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    () => historico,
  );
}

export const execucoesDe = (lista: Execucao[], fonte: FonteId) => lista.filter((item) => item.fonte === fonte);

export const mensagemDeErro = (causa: unknown, padrao = 'Não foi possível ler o arquivo.') =>
  causa instanceof Error && causa.message ? causa.message : padrao;

export const textoNumeros = (numeros: NumeroResumo[] = []) =>
  numeros
    .filter((numero) => numero.valor > 0 || numero.tom === 'ok')
    .map((numero) => `${fmt(numero.valor)} ${numero.rotulo.toLowerCase()}`)
    .join(' · ');

const fmt = (valor: number) => valor.toLocaleString('pt-BR');

const diaLocal = (data: Date) =>
  `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;

const diasDesde = (dia: string) => Math.round((Date.parse(diaLocal(new Date())) - Date.parse(dia.slice(0, 10))) / 86_400_000);

const periodoTexto = (periodo: { de: string; ate: string } | undefined, prefixo: string) =>
  periodo?.de ? `${prefixo} de ${formatBrDate(periodo.de)} a ${formatBrDate(periodo.ate)}` : undefined;

export function numerosCruzamento(resumo: ImportSummary): NumeroResumo[] {
  return [
    { rotulo: 'Notas emitidas', valor: resumo.notas, tom: 'ok' },
    {
      rotulo: 'Fora por remanejamento',
      valor: resumo.remanejamento,
      dica: 'Notas de remanejamento fiscal não entram na base.',
    },
    {
      rotulo: 'Dia corrente',
      valor: resumo.diaCorrente,
      dica: 'Notas do dia útil corrente ficam de fora.',
    },
  ];
}

export interface PreviaImportacao {
  fonte: FonteArquivo;
  arquivo: string;
  numeros: NumeroResumo[];
  periodo?: string;
  amostra: { colunas: string[]; linhas: string[][]; de: string };
  avisos: string[];
  /** Arquivo que será substituído, se houver. */
  atual?: string;
  aplicar: () => Promise<void>;
}

interface Anterior {
  fileName: string;
  importadoEm: string;
}

function comparar(arquivo: string, anterior: Anterior | null | undefined, aceitos: number, aceitosAntes: number, unidade: string) {
  const avisos: string[] = [];
  if (!anterior) return { avisos, atual: undefined };
  const enviadoEm = new Date(anterior.importadoEm);
  if (anterior.fileName === arquivo && diaLocal(enviadoEm) === diaLocal(new Date())) {
    avisos.push(
      `Este arquivo já foi enviado hoje, às ${enviadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Enviar de novo substitui os dados atuais, sem duplicar.`,
    );
  }
  if (aceitosAntes > 0 && aceitos < aceitosAntes / 2) {
    avisos.push(
      `O arquivo novo tem ${fmt(aceitos)} ${unidade}, menos da metade dos ${fmt(aceitosAntes)} atuais. Confira se exportou o período completo.`,
    );
  }
  return {
    avisos,
    atual: `${anterior.fileName} · ${fmt(aceitosAntes)} ${unidade} · enviado em ${formatDateTimeBr(anterior.importadoEm)}`,
  };
}

function avisoDataAntiga(ultimoDia: string | undefined, descricao: string): string[] {
  if (!ultimoDia) return [];
  const dias = diasDesde(ultimoDia);
  return dias > 7
    ? [`${descricao} mais recente do arquivo é ${formatBrDate(ultimoDia.slice(0, 10))}, há ${dias} dias. Confira se exportou o período certo.`]
    : [];
}

async function prepararTransportadora(id: TransportadoraId, file: File): Promise<PreviaImportacao> {
  const dados = await importTransportadoraFile(file);
  const label = TRANSPORTADORAS.find((item) => item.id === id)!.label;
  const nfs = Object.keys(dados.porNf);
  const ignoradas = dados.ignoradas ?? 0;
  const semNf = dados.semNf ?? 0;
  if (dados.totalLinhas === 0) {
    throw new Error(`Nenhuma linha de ${file.name} pôde ser usada: todas eram reversas, retornos ao CD ou estavam sem NF.`);
  }
  const anterior = entregasStore.atual().transportadoras[id];
  const { avisos, atual } = comparar(file.name, anterior, nfs.length, anterior ? Object.keys(anterior.porNf).length : 0, 'NFs');
  for (const outra of TRANSPORTADORAS) {
    if (outra.id !== id && new RegExp(outra.label, 'i').test(file.name)) {
      avisos.unshift(`O nome do arquivo cita a ${outra.label}. Confira se esta é mesmo a planilha da ${label}.`);
    }
  }
  avisos.push(...avisoDataAntiga(dados.periodo?.ate, dados.periodoTipo === 'entrega' ? 'A entrega' : 'A emissão'));
  const pendentes = Object.values(dados.porNf).filter((eventos) => !eventos.some((e) => e.dataEntrega)).length;
  if (pendentes === 0 && dados.totalLinhas >= 100) {
    avisos.unshift(
      anterior
        ? `Este relatório só tem notas já entregues (filtrado pela data de entrega). Ele será SOMADO à planilha atual da ${label}, sem apagar as pendentes e vencidas.`
        : `Este relatório só tem notas já entregues (filtrado pela data de entrega). Sozinho, ele deixa as pendentes da ${label} como "sem rastreio". Envie também o relatório filtrado pela data do CT-e.`,
    );
  }
  return {
    fonte: id,
    arquivo: file.name,
    numeros: [
      { rotulo: 'Linhas aceitas', valor: dados.totalLinhas, tom: 'ok' },
      {
        rotulo: 'NFs sem data de entrega',
        valor: pendentes,
        tom: pendentes === 0 && dados.totalLinhas >= 100 ? 'aviso' : undefined,
        dica: 'Pendentes e vencidas. Zero aqui indica um relatório só de entregas.',
      },
      {
        rotulo: 'Reversas e retornos descartados',
        valor: ignoradas,
        dica: 'Só entregas entram. Reversas, devoluções e retornos ao CD de Itapevi ficam de fora.',
      },
      { rotulo: 'Linhas sem NF descartadas', valor: semNf, tom: semNf ? 'aviso' : undefined },
      { rotulo: 'NFs diferentes', valor: nfs.length },
      {
        rotulo: 'NFs com mais de um evento',
        valor: nfs.filter((nf) => dados.porNf[nf].length > 1).length,
        dica: 'A mesma NF em várias linhas vira histórico de eventos, não registro duplicado.',
      },
    ],
    periodo: periodoTexto(dados.periodo, dados.periodoTipo === 'entrega' ? 'Entregas' : 'Emitidas'),
    amostra: {
      de: `${fmt(nfs.length)} NFs`,
      colunas: ['NF', 'Último status', 'Previsão', 'Entrega', 'Destino'],
      linhas: nfs.slice(0, 5).map((nf) => {
        const evento = dados.porNf[nf].at(-1)!;
        return [
          nf,
          evento.ultimoStatus || '—',
          evento.previsao ? formatBrDate(evento.previsao.slice(0, 10)) : '—',
          evento.dataEntrega ? formatBrDate(evento.dataEntrega.slice(0, 10)) : '—',
          [evento.cidade, evento.uf].filter(Boolean).join('/') || '—',
        ];
      }),
    },
    avisos,
    atual,
    aplicar: async () =>
      pendentes === 0 && anterior
        ? entregasStore.adicionarTransportadora(id, dados)
        : entregasStore.setTransportadora(id, dados),
  };
}

async function prepararZendesk(file: File): Promise<PreviaImportacao> {
  const dados = await importZendeskFile(file);
  const unicos = new Set(dados.tickets.map((ticket) => ticket.id)).size;
  const anterior = zendeskStore.atual().tickets;
  const { avisos, atual } = comparar(file.name, anterior, unicos, anterior?.tickets.length ?? 0, 'tickets');
  if (dados.tickets.length === 0) {
    avisos.unshift('Nenhum ticket está em "Em rota de entrega" ou "Aguardando expedição". Confira se exportou o relatório certo.');
  }
  return {
    fonte: 'zendesk',
    arquivo: file.name,
    numeros: [
      { rotulo: 'Tickets aceitos', valor: unicos, tom: 'ok', dica: 'Tickets em rota de entrega ou aguardando expedição.' },
      {
        rotulo: 'Em outros status, ignorados',
        valor: dados.totalPlanilha - dados.tickets.length,
        dica: 'Só os status da baixa de entrega são guardados.',
      },
      { rotulo: 'Repetidos', valor: dados.tickets.length - unicos, tom: dados.tickets.length > unicos ? 'aviso' : undefined },
    ],
    amostra: {
      de: `${fmt(dados.tickets.length)} tickets`,
      colunas: ['Ticket', 'Status', 'Organização', 'UF', 'Criado em'],
      linhas: dados.tickets
        .slice(0, 5)
        .map((ticket) => [ticket.id, ticket.status, ticket.organizacao || '—', ticket.uf || '—', formatZendeskDate(ticket.criadoEm)]),
    },
    avisos,
    atual,
    aplicar: async () => zendeskStore.setTickets(dados),
  };
}

async function prepararNf(file: File): Promise<PreviaImportacao> {
  const dados = await importNfFile(file);
  const tickets = Object.keys(dados.porTicket);
  const registros = Object.entries(dados.porTicket).flatMap(([ticket, linhas]) => linhas.map((linha) => ({ ticket, ...linha })));
  const semNf = registros.filter((registro) => !registro.nf).length;
  const anterior = zendeskStore.atual().nf;
  const { avisos, atual } = comparar(file.name, anterior, dados.totalLinhas, anterior?.totalLinhas ?? 0, 'romaneios');
  if (!zendeskStore.atual().tickets) {
    avisos.push('A planilha de tickets do Zendesk ainda não foi enviada. A NF será guardada, mas só aparece na baixa depois dela.');
  }
  return {
    fonte: 'nf',
    arquivo: file.name,
    numeros: [
      { rotulo: 'Romaneios com chamado', valor: dados.totalLinhas, tom: 'ok' },
      { rotulo: 'Tickets diferentes', valor: tickets.length },
      { rotulo: 'Romaneios ainda sem NF', valor: semNf, tom: semNf ? 'aviso' : undefined },
    ],
    amostra: {
      de: `${fmt(registros.length)} romaneios`,
      colunas: ['Ticket', 'Romaneio', 'Data', 'NF', 'Etapa'],
      linhas: registros
        .slice(0, 5)
        .map((registro) => [
          registro.ticket,
          registro.romaneio || '—',
          registro.dataRomaneio ? formatBrDate(registro.dataRomaneio.slice(0, 10)) : '—',
          registro.nf ?? '—',
          registro.etapa || '—',
        ]),
    },
    avisos,
    atual,
    aplicar: async () => zendeskStore.setNf(dados),
  };
}

async function prepararExpedicao(file: File): Promise<PreviaImportacao> {
  const dados = await importExpedicaoFile(file);
  const linhas = dados.linhas ?? dados.total;
  const anterior = expedicaoStore.atual();
  const { avisos, atual } = comparar(file.name, anterior, dados.total, anterior?.total ?? 0, 'NFs');
  avisos.push(...avisoDataAntiga(dados.periodo.ate, 'A saída'));
  const nfs = Object.keys(dados.porNf);
  return {
    fonte: 'expedicao',
    arquivo: file.name,
    numeros: [
      { rotulo: 'NFs aceitas', valor: dados.total, tom: 'ok' },
      {
        rotulo: 'Linhas repetidas',
        valor: linhas - dados.total,
        tom: linhas > dados.total ? 'aviso' : undefined,
        dica: 'Quando a mesma NF aparece mais de uma vez, vale a última linha.',
      },
    ],
    periodo: periodoTexto(dados.periodo, 'Saídas'),
    amostra: {
      de: `${fmt(dados.total)} NFs`,
      colunas: ['NF', 'Saída', 'UF', 'Transportadora', 'Cliente'],
      linhas: nfs.slice(0, 5).map((nf) => {
        const nota = dados.porNf[nf];
        return [nf, nota.saida ? formatBrDate(nota.saida) : '—', nota.uf || '—', nota.transportadora || '—', nota.cliente || '—'];
      }),
    },
    avisos,
    atual,
    aplicar: () => expedicaoStore.set(dados),
  };
}

export async function prepararImportacao(fonte: FonteArquivo, file: File): Promise<PreviaImportacao> {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    throw new Error(`"${file.name}" não é uma planilha. Envie um arquivo .xlsx, .xls ou .csv.`);
  }
  if (file.size === 0) throw new Error(`"${file.name}" está vazio.`);
  if (fonte === 'zendesk') return prepararZendesk(file);
  if (fonte === 'nf') return prepararNf(file);
  if (fonte === 'expedicao') return prepararExpedicao(file);
  return prepararTransportadora(fonte, file);
}

export type EstadoImportacao =
  | { fase: 'lendo'; fonte: FonteArquivo; arquivo: string }
  | { fase: 'previa' | 'aplicando'; fonte: FonteArquivo; arquivo: string; previa: PreviaImportacao }
  | { fase: 'erro'; fonte: FonteArquivo; arquivo: string; erro: string }
  | { fase: 'concluido'; fonte: FonteArquivo; arquivo: string; previa: PreviaImportacao };

let estado: EstadoImportacao | null = null;
let rodada = 0;
const ouvintesModal = new Set<() => void>();
const mudar = (proximo: EstadoImportacao | null) => {
  estado = proximo;
  ouvintesModal.forEach((ouvinte) => ouvinte());
};

/** Lê o arquivo e abre a prévia; nada é gravado até a confirmação. */
export function iniciarImportacao(fonte: FonteArquivo, file: File): void {
  const minha = ++rodada;
  mudar({ fase: 'lendo', fonte, arquivo: file.name });
  prepararImportacao(fonte, file).then(
    (previa) => {
      if (minha === rodada) mudar({ fase: 'previa', fonte, arquivo: file.name, previa });
    },
    (causa) => {
      const erro = mensagemDeErro(causa);
      registrarExecucao({ fonte, arquivo: file.name, status: 'erro', erro });
      if (minha === rodada) mudar({ fase: 'erro', fonte, arquivo: file.name, erro });
    },
  );
}

export async function confirmarImportacao(): Promise<void> {
  if (estado?.fase !== 'previa') return;
  const { fonte, arquivo, previa } = estado;
  const minha = rodada;
  mudar({ fase: 'aplicando', fonte, arquivo, previa });
  try {
    await previa.aplicar();
    registrarExecucao({ fonte, arquivo, status: 'sucesso', numeros: previa.numeros, periodo: previa.periodo });
    if (minha === rodada) mudar({ fase: 'concluido', fonte, arquivo, previa });
  } catch (causa) {
    const erro = mensagemDeErro(causa, 'Não foi possível gravar os dados. Nada foi alterado.');
    registrarExecucao({ fonte, arquivo, status: 'erro', erro });
    if (minha === rodada) mudar({ fase: 'erro', fonte, arquivo, erro });
  }
}

export function fecharImportacao(): void {
  if (estado?.fase === 'aplicando') return;
  rodada += 1;
  mudar(null);
}

export function useImportacao(): EstadoImportacao | null {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintesModal.add(ouvinte);
      return () => ouvintesModal.delete(ouvinte);
    },
    () => estado,
  );
}
