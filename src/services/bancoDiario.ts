import { montarTabelas, salvarWorkbook, hojeLocal, type Cell, type FontesExportGeral, type Tabela } from './exportGeral';
import { zendeskStore } from './zendeskImport';
import {
  TRANSPORTADORAS,
  contarEntregas,
  cruzarEntregasNotas,
  entregasStore,
  type TransportadoraId,
  type TransportadoraImport,
} from './entregasImport';
import { integrationService } from './integrationService';
import { romaneioStore } from './romaneioImport';
import { tratativaService } from './tratativaService';
import { isCurrentBusinessDay } from '../utils/businessDay';
import { diaHistorico, type EstadoDia } from './diaAtivo';

/**
 * Banco local (IndexedDB) acumulado: cada tabela do Exportar geral guarda uma linha (ou grupo de linhas) por chave
 * — a NF, o ticket… — atualizada a cada importação. O mês de cada registro é o da emissão da nota (tickets: criação).
 * Do dia a dia fica só um resumo com as contagens. As fotos completas de dias antigos continuam podendo ser abertas.
 */

export interface DiaSalvo {
  data: string;
  salvoEm: string;
  registros: Record<string, number>;
  /** Situação das notas integradas no dia (resumo diário). */
  entregas?: Record<string, number>;
  /** Só os dias antigos (foto completa) podem ser reabertos no app. */
  temEstado?: boolean;
}

interface Snapshot {
  data: string;
  salvoEm: string;
  tabelas: Tabela[];
  estado?: EstadoDia;
}

interface RegistroBase {
  id: string;
  tabela: string;
  chave: string;
  mes: string;
  linhas: Cell[][];
  primeiraVez: string;
  ultimaAtualizacao: string;
}

interface ColunasTabela {
  nome: string;
  colunas: string[];
}

export interface ResumoMes {
  mes: string;
  notas: number;
  entregas: Record<string, number>;
  ultimaAtualizacao: string;
}

const DB_NAME = 'arklok_banco';
const DIAS = 'dias';
const SNAPSHOTS = 'snapshots';
const BASE = 'base';
const TABELAS = 'tabelas';
export const SEM_MES = 'sem_data';

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export const nomeMes = (mes: string) =>
  mes === SEM_MES ? 'Sem data' : `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;

const ouvintes = new Set<() => void>();

/** Avisa quando o banco muda (ex.: para atualizar o seletor de dia). */
export function onBancoAlterado(listener: () => void): () => void {
  ouvintes.add(listener);
  return () => ouvintes.delete(listener);
}

const avisar = () => ouvintes.forEach((listener) => listener());

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DIAS)) db.createObjectStore(DIAS, { keyPath: 'data' });
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: 'data' });
      if (!db.objectStoreNames.contains(BASE)) db.createObjectStore(BASE, { keyPath: 'id' }).createIndex('mes', 'mes');
      if (!db.objectStoreNames.contains(TABELAS)) db.createObjectStore(TABELAS, { keyPath: 'nome' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function pedir<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Serial de data do Excel → "AAAA-MM". */
function mesDoSerial(valor: Cell | undefined): string | null {
  if (typeof valor !== 'number' || valor <= 0) return null;
  const d = new Date(EXCEL_EPOCH + Math.floor(valor) * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const serialDe = (iso: string): number => {
  const d = new Date(iso);
  return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()) - EXCEL_EPOCH) / 86_400_000;
};

interface Contexto {
  mesDaNf: Map<string, string>;
  mesDoTicket: Map<string, string>;
}

interface RegraTabela {
  /** Colunas que formam a chave; linhas com a mesma chave são guardadas juntas. */
  chave: string[];
  mes: (linha: Cell[], coluna: (nome: string) => Cell, ctx: Contexto) => string | null;
}

const REGRAS: Record<string, RegraTabela> = {
  Notas: { chave: ['nota_fiscal'], mes: (_, c) => mesDoSerial(c('data_emissao')) },
  Entregas: { chave: ['nota_fiscal'], mes: (_, c) => mesDoSerial(c('data_emissao')) },
  Tratativas: {
    chave: ['nota_fiscal'],
    mes: (_, c, ctx) => ctx.mesDaNf.get(String(c('nota_fiscal'))) ?? mesDoSerial(c('criado_em')),
  },
  Zendesk_Tickets: { chave: ['id_zendesk'], mes: (_, c) => mesDoSerial(c('criado_em')) },
  Zendesk_NF: {
    chave: ['id_zendesk'],
    mes: (_, c, ctx) => ctx.mesDoTicket.get(String(c('id_zendesk'))) ?? mesDoSerial(c('data_romaneio')),
  },
  Transportadoras: {
    chave: ['transportadora', 'nota_fiscal'],
    mes: (_, c, ctx) =>
      ctx.mesDaNf.get(String(c('nota_fiscal'))) ??
      mesDoSerial(c('data_entrega')) ??
      mesDoSerial(c('data_status')) ??
      mesDoSerial(c('previsao')),
  },
};

function agrupar(tabelas: Tabela[]): Omit<RegistroBase, 'primeiraVez' | 'ultimaAtualizacao'>[] {
  const ctx: Contexto = { mesDaNf: new Map(), mesDoTicket: new Map() };
  const porNome = new Map(tabelas.map((t) => [t.nome, t]));
  const indexar = (nome: string, coluna: string, destino: Map<string, string>, dataCol: string) => {
    const t = porNome.get(nome);
    if (!t) return;
    const ic = t.colunas.indexOf(coluna);
    const id = t.colunas.indexOf(dataCol);
    for (const linha of t.linhas) {
      const mes = mesDoSerial(linha[id]);
      if (mes && linha[ic] != null) destino.set(String(linha[ic]), mes);
    }
  };
  indexar('Notas', 'nota_fiscal', ctx.mesDaNf, 'data_emissao');
  indexar('Zendesk_Tickets', 'id_zendesk', ctx.mesDoTicket, 'criado_em');

  const registros = new Map<string, Omit<RegistroBase, 'primeiraVez' | 'ultimaAtualizacao'>>();
  for (const tabela of tabelas) {
    const regra = REGRAS[tabela.nome];
    if (!regra) continue;
    const indices = regra.chave.map((c) => tabela.colunas.indexOf(c));
    for (const linha of tabela.linhas) {
      const chave = indices.map((i) => String(linha[i] ?? '')).join('|');
      if (!chave.replace(/\|/g, '')) continue;
      const id = `${tabela.nome}|${chave}`;
      const coluna = (nome: string) => linha[tabela.colunas.indexOf(nome)];
      const existente = registros.get(id);
      if (existente) existente.linhas.push(linha);
      else registros.set(id, { id, tabela: tabela.nome, chave, mes: regra.mes(linha, coluna, ctx) ?? SEM_MES, linhas: [linha] });
    }
  }
  return [...registros.values()];
}

function estadoDeHoje(): EstadoDia {
  return {
    integrations: integrationService.estadoAtual(),
    tratativas: tratativaService.atuais(),
    zendesk: zendeskStore.atual(),
    entregas: entregasStore.atual(),
  };
}

/** Mesmo recorte de notas que o app mostra (notas até o dia útil anterior a `data`). */
function fontesDoEstado(estado: EstadoDia, data: string): FontesExportGeral {
  const referencia = new Date(`${data}T12:00:00`);
  const integrations = estado.integrations.filter((item) => !isCurrentBusinessDay(item.createdAt, referencia));
  return {
    integrations,
    tratativas: estado.tratativas,
    zendesk: estado.zendesk,
    entregas: estado.entregas,
    cruzadas: cruzarEntregasNotas(integrations, estado.entregas, estado.zendesk, romaneioStore.atual()),
  };
}

/**
 * Junta os dados carregados agora no banco: insere o que é novo, atualiza o que mudou e mantém o resto.
 * Também grava o resumo de hoje. Não faz nada com um dia salvo aberto.
 */
export async function acumularHoje(): Promise<{ novos: number; atualizados: number }> {
  if (diaHistorico()) return { novos: 0, atualizados: 0 };
  const fontes = fontesDoEstado(estadoDeHoje(), hojeLocal());
  const tabelas = montarTabelas(fontes);
  if (!tabelas.some((t) => t.nome !== 'Tratativas' && t.linhas.length > 0)) return { novos: 0, atualizados: 0 };

  const db = await abrirDb();
  const existentes = new Map(
    (await pedir(db.transaction(BASE).objectStore(BASE).getAll() as IDBRequest<RegistroBase[]>)).map((r) => [r.id, r]),
  );
  const agora = new Date().toISOString();
  let novos = 0;
  let atualizados = 0;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([BASE, TABELAS, DIAS], 'readwrite');
    const base = tx.objectStore(BASE);
    for (const registro of agrupar(tabelas)) {
      const antigo = existentes.get(registro.id);
      if (antigo && antigo.mes === registro.mes && JSON.stringify(antigo.linhas) === JSON.stringify(registro.linhas)) continue;
      if (antigo) atualizados += 1;
      else novos += 1;
      base.put({ ...registro, primeiraVez: antigo?.primeiraVez ?? agora, ultimaAtualizacao: agora } satisfies RegistroBase);
    }
    for (const { nome, colunas } of tabelas) tx.objectStore(TABELAS).put({ nome, colunas } satisfies ColunasTabela);
    tx.objectStore(DIAS).put({
      data: hojeLocal(),
      salvoEm: agora,
      registros: Object.fromEntries(tabelas.map((t) => [t.nome, t.linhas.length])),
      entregas: contarEntregas(fontes.cruzadas),
    } satisfies DiaSalvo);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  if (novos || atualizados) avisar();
  return { novos, atualizados };
}

export async function listarDias(): Promise<DiaSalvo[]> {
  const db = await abrirDb();
  const dias = await pedir(db.transaction(DIAS).objectStore(DIAS).getAll() as IDBRequest<DiaSalvo[]>);
  return dias.sort((a, b) => a.data.localeCompare(b.data));
}

/** Meses do banco, com quantas notas e a situação das entregas de cada um. */
export async function resumoMeses(): Promise<ResumoMes[]> {
  const db = await abrirDb();
  const [registros, tabelas] = await Promise.all([
    pedir(db.transaction(BASE).objectStore(BASE).getAll() as IDBRequest<RegistroBase[]>),
    pedir(db.transaction(TABELAS).objectStore(TABELAS).getAll() as IDBRequest<ColunasTabela[]>),
  ]);
  const colSituacao = tabelas.find((t) => t.nome === 'Entregas')?.colunas.indexOf('situacao') ?? -1;
  const meses = new Map<string, ResumoMes>();
  for (const r of registros) {
    const mes = meses.get(r.mes) ?? { mes: r.mes, notas: 0, entregas: {}, ultimaAtualizacao: '' };
    meses.set(r.mes, mes);
    if (r.ultimaAtualizacao > mes.ultimaAtualizacao) mes.ultimaAtualizacao = r.ultimaAtualizacao;
    if (r.tabela === 'Notas') mes.notas += 1;
    if (r.tabela === 'Entregas' && colSituacao >= 0) {
      const situacao = String(r.linhas[0]?.[colSituacao] ?? '');
      mes.entregas[situacao] = (mes.entregas[situacao] ?? 0) + 1;
    }
  }
  return [...meses.values()].sort((a, b) => b.mes.localeCompare(a.mes));
}

/** Exporta um mês do banco (ou o banco inteiro): uma aba por tabela, com primeira_vez_vista e ultima_atualizacao. */
export async function exportarBanco(mes: string | null): Promise<{ arquivo: string; pasta: string | null }> {
  const db = await abrirDb();
  const store = db.transaction(BASE).objectStore(BASE);
  const registros = await pedir(
    (mes ? store.index('mes').getAll(mes) : store.getAll()) as IDBRequest<RegistroBase[]>,
  );
  if (registros.length === 0) throw new Error(mes ? `Nada no banco em ${nomeMes(mes)}.` : 'O banco ainda está vazio.');
  const colunas = new Map(
    (await pedir(db.transaction(TABELAS).objectStore(TABELAS).getAll() as IDBRequest<ColunasTabela[]>)).map((t) => [t.nome, t.colunas]),
  );
  const tabelas: Tabela[] = Object.keys(REGRAS).flatMap((nome) => {
    const doNome = registros.filter((r) => r.tabela === nome).sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR', { numeric: true }));
    if (!colunas.has(nome)) return [];
    return [{
      nome,
      colunas: [...colunas.get(nome)!, 'mes_base', 'primeira_vez_vista', 'ultima_atualizacao'],
      linhas: doNome.flatMap((r) =>
        r.linhas.map((linha): Cell[] => [...linha, r.mes === SEM_MES ? null : r.mes, serialDe(r.primeiraVez), serialDe(r.ultimaAtualizacao)]),
      ),
    }];
  });
  const sufixo = mes ?? `completo_${hojeLocal()}`;
  return salvarWorkbook(
    `arktransp_banco_${sufixo}.xlsx`,
    [['aba', 'registros', 'periodo'], ...tabelas.map((t) => [t.nome, t.linhas.length, mes ? nomeMes(mes) : 'Todos os meses'])],
    tabelas,
  );
}

/** Serial do Excel → "AAAA-MM-DD" ou "AAAA-MM-DDTHH:mm" (como as importações gravam). */
function isoDoSerial(valor: Cell | undefined): string {
  if (valor == null || valor === '') return '';
  if (typeof valor !== 'number') return String(valor);
  const d = new Date(EXCEL_EPOCH + Math.round(valor * 86_400_000));
  const dois = (n: number) => String(n).padStart(2, '0');
  const dia = `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())}`;
  return d.getUTCHours() || d.getUTCMinutes() ? `${dia}T${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}` : dia;
}

/**
 * Remonta a planilha de uma transportadora com tudo o que o banco guardou dela: as linhas de cada NF na versão
 * mais recente vista em qualquer arquivo já enviado (notas em rota de uma lista antiga continuam em rota).
 */
export async function transportadoraDoBanco(id: TransportadoraId): Promise<TransportadoraImport | null> {
  const nome = TRANSPORTADORAS.find((t) => t.id === id)?.label;
  if (!nome) return null;
  const db = await abrirDb();
  const [registros, colunas] = await Promise.all([
    pedir(db.transaction(BASE).objectStore(BASE).getAll() as IDBRequest<RegistroBase[]>),
    pedir(db.transaction(TABELAS).objectStore(TABELAS).get('Transportadoras') as IDBRequest<ColunasTabela | undefined>),
  ]);
  if (!colunas) return null;
  const i = (coluna: string) => colunas.colunas.indexOf(coluna);
  const texto = (linha: Cell[], coluna: string) => String(linha[i(coluna)] ?? '').trim();
  const porNf: TransportadoraImport['porNf'] = {};
  let totalLinhas = 0;
  for (const registro of registros) {
    if (registro.tabela !== 'Transportadoras' || !registro.chave.startsWith(`${nome}|`)) continue;
    for (const linha of registro.linhas) {
      const nf = texto(linha, 'nota_fiscal');
      if (!nf) continue;
      totalLinhas += 1;
      (porNf[nf] ??= []).push({
        ultimoStatus: texto(linha, 'ultimo_status'),
        dataStatus: isoDoSerial(linha[i('data_status')]),
        previsao: isoDoSerial(linha[i('previsao')]),
        dataEntrega: isoDoSerial(linha[i('data_entrega')]),
        recebedor: texto(linha, 'recebedor'),
        destinatario: texto(linha, 'destinatario'),
        cidade: texto(linha, 'cidade'),
        uf: texto(linha, 'uf'),
      });
    }
  }
  if (totalLinhas === 0) return null;
  return { fileName: `Banco de dados (${nome})`, importadoEm: new Date().toISOString(), totalLinhas, porNf };
}

export async function lerEstadoDoDia(data: string): Promise<EstadoDia | null> {
  const db = await abrirDb();
  const foto = await pedir(db.transaction(SNAPSHOTS).objectStore(SNAPSHOTS).get(data) as IDBRequest<Snapshot | undefined>);
  return foto?.estado ?? null;
}

export async function removerDia(data: string): Promise<void> {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([DIAS, SNAPSHOTS], 'readwrite');
    tx.objectStore(DIAS).delete(data);
    tx.objectStore(SNAPSHOTS).delete(data);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  avisar();
}

/**
 * Guarda no banco o que está carregado e tira do "hoje" as planilhas (notas, Zendesk, rota e transportadoras),
 * para começar uma nova importação. O banco e as tratativas continuam.
 */
export async function zerarHoje(): Promise<void> {
  if (diaHistorico()) throw new Error('Volte para "Hoje" para zerar os dados.');
  await acumularHoje();
  await integrationService.limpar();
  zendeskStore.setTickets(null);
  zendeskStore.setNf(null);
  entregasStore.setRota(null);
  for (const { id } of TRANSPORTADORAS) entregasStore.setTransportadora(id, null);
  entregasStore.setTransacoes(null);
}

export interface ProblemaBanco {
  id: string;
  /** "lixo" pode ser apagado sem perder nada; "atencao" precisa de uma ação sua (ex.: reenviar a planilha). */
  nivel: 'lixo' | 'atencao';
  titulo: string;
  descricao: string;
  quantidade: number;
  exemplos: string[];
  limpar?: () => Promise<void>;
}

export interface VerificacaoBanco {
  registros: number;
  porTabela: Record<string, number>;
  dias: number;
  fotos: number;
  espacoLocalKb: number;
  problemas: ProblemaBanco[];
}

const CHAVE_LOCAL_CONHECIDA =
  /^arklok_(integrations_v3|reconcile_revision|executions_v1|logs_v1|cruzamento_info_v1|sidebar_collapsed|theme|menu_abertos|tratativas_v1|importacoes_v1|zendesk_tickets_v1|zendesk_nf_v1|entregas_rota_v1|entregas_(spfly|jamef|certex|transacoes)_v1)$/;
const NUMERO_VALIDO = /^0*[1-9]\d{0,14}$/;
/** Acima disso o navegador (limite de ~5 MB) pode recusar gravar uma planilha nova. */
const LIMITE_LOCAL_KB = 4000;

/** Procura registros inválidos, duplicados ou soltos no banco e chaves velhas no armazenamento do navegador. */
export async function verificarBanco(): Promise<VerificacaoBanco> {
  const db = await abrirDb();
  const [registros, colunas, dias, fotos] = await Promise.all([
    pedir(db.transaction(BASE).objectStore(BASE).getAll() as IDBRequest<RegistroBase[]>),
    pedir(db.transaction(TABELAS).objectStore(TABELAS).getAll() as IDBRequest<ColunasTabela[]>),
    pedir(db.transaction(DIAS).objectStore(DIAS).getAll() as IDBRequest<DiaSalvo[]>),
    pedir(db.transaction(SNAPSHOTS).objectStore(SNAPSHOTS).getAllKeys() as IDBRequest<IDBValidKey[]>),
  ]);

  const ids = new Set(registros.map((r) => r.id));
  const porTabela: Record<string, number> = {};
  for (const r of registros) porTabela[r.tabela] = (porTabela[r.tabela] ?? 0) + 1;
  const colunasDe = new Map(colunas.map((t) => [t.nome, t.colunas]));
  const problemas: ProblemaBanco[] = [];

  const gravar = async (fazer: (tx: IDBTransaction) => void, stores: string[]) => {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite');
      fazer(tx);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    avisar();
  };
  const apagarRegistros = (lista: RegistroBase[]) => () =>
    gravar((tx) => lista.forEach((r) => tx.objectStore(BASE).delete(r.id)), [BASE]);
  const nomeRegistro = (r: RegistroBase) => `${r.tabela.replace('_', ' ')} ${r.chave.replace('|', ' · ')}`;
  const adicionar = (problema: Omit<ProblemaBanco, 'quantidade' | 'exemplos'>, lista: string[]) => {
    if (lista.length) problemas.push({ ...problema, quantidade: lista.length, exemplos: lista.slice(0, 6) });
  };

  const desconhecidos = registros.filter((r) => !REGRAS[r.tabela]);
  adicionar(
    {
      id: 'tabela_desconhecida',
      nivel: 'lixo',
      titulo: 'Registros de tabelas que não existem mais',
      descricao: 'Sobraram de versões antigas do sistema e não aparecem em nenhuma tela nem exportação.',
      limpar: apagarRegistros(desconhecidos),
    },
    desconhecidos.map(nomeRegistro),
  );

  const vazio = (c: Cell) => c === null || c === '';
  const vazios = registros.filter((r) => REGRAS[r.tabela] && (r.linhas.length === 0 || r.linhas.every((l) => l.every(vazio))));
  adicionar(
    {
      id: 'vazios',
      nivel: 'lixo',
      titulo: 'Registros vazios',
      descricao: 'Têm a chave, mas nenhuma informação dentro.',
      limpar: apagarRegistros(vazios),
    },
    vazios.map(nomeRegistro),
  );

  const chaveInvalida = registros.filter((r) => {
    if (!REGRAS[r.tabela] || vazios.includes(r)) return false;
    const numero = r.tabela === 'Transportadoras' ? r.chave.split('|')[1] : r.chave;
    return !NUMERO_VALIDO.test(numero ?? '');
  });
  adicionar(
    {
      id: 'chave_invalida',
      nivel: 'lixo',
      titulo: 'NF ou ticket com número inválido',
      descricao: 'A chave não é um número de NF/ticket (ex.: texto, zero ou célula de cabeçalho lida como dado).',
      limpar: apagarRegistros(chaveInvalida),
    },
    chaveInvalida.map(nomeRegistro),
  );

  const comRepetidas = registros.filter((r) => new Set(r.linhas.map((l) => JSON.stringify(l))).size < r.linhas.length);
  adicionar(
    {
      id: 'linhas_repetidas',
      nivel: 'lixo',
      titulo: 'Linhas repetidas dentro do mesmo registro',
      descricao: 'A mesma linha aparece duas ou mais vezes (ex.: NF repetida na planilha). Fica uma de cada.',
      limpar: () =>
        gravar((tx) => {
          for (const r of comRepetidas) {
            const unicas = [...new Map(r.linhas.map((l) => [JSON.stringify(l), l])).values()];
            tx.objectStore(BASE).put({ ...r, linhas: unicas } satisfies RegistroBase);
          }
        }, [BASE]),
    },
    comRepetidas.map(nomeRegistro),
  );

  const entregasSoltas = registros.filter((r) => r.tabela === 'Entregas' && !ids.has(`Notas|${r.chave}`));
  adicionar(
    {
      id: 'entregas_sem_nota',
      nivel: 'lixo',
      titulo: 'Entregas sem a nota correspondente',
      descricao: 'A situação de entrega é calculada a partir da nota; sem a nota no banco, a linha não tem origem.',
      limpar: apagarRegistros(entregasSoltas),
    },
    entregasSoltas.map(nomeRegistro),
  );

  const nfSoltas = registros.filter((r) => r.tabela === 'Zendesk_NF' && !ids.has(`Zendesk_Tickets|${r.chave}`));
  adicionar(
    {
      id: 'zendesk_nf_sem_ticket',
      nivel: 'lixo',
      titulo: 'NFs de romaneio de tickets que nunca estiveram abertos',
      descricao:
        'Vieram do histórico completo da planilha de NF, enviada antes da de tickets. Não pertencem a nenhum ticket acompanhado.',
      limpar: apagarRegistros(nfSoltas),
    },
    nfSoltas.map(nomeRegistro),
  );

  const tratativasSoltas = registros.filter((r) => r.tabela === 'Tratativas' && !ids.has(`Notas|${r.chave}`));
  adicionar(
    {
      id: 'tratativas_sem_nota',
      nivel: 'atencao',
      titulo: 'Comentários de tratativa de notas que não estão no banco',
      descricao: 'Não apaguei por serem comentários seus. Confira se a nota foi digitada errada ou é de outro período.',
    },
    tratativasSoltas.map(nomeRegistro),
  );

  const mesAtual = hojeLocal().slice(0, 7);
  const mesFuturo = registros.filter((r) => r.mes !== SEM_MES && r.mes > mesAtual);
  adicionar(
    {
      id: 'mes_futuro',
      nivel: 'atencao',
      titulo: 'Registros com mês no futuro',
      descricao: 'A data foi lida errada (dia e mês trocados). Reenvie a planilha de origem para corrigir.',
    },
    mesFuturo.map((r) => `${nomeRegistro(r)} (${nomeMes(r.mes)})`),
  );

  const colNotas = colunasDe.get('Notas') ?? [];
  const iEmissao = colNotas.indexOf('data_emissao');
  const iIntegracao = colNotas.indexOf('data_integracao');
  const datasTrocadas =
    iEmissao < 0 || iIntegracao < 0
      ? []
      : registros.filter((r) => {
          if (r.tabela !== 'Notas') return false;
          const [emissao, integracao] = [r.linhas[0]?.[iEmissao], r.linhas[0]?.[iIntegracao]];
          return typeof emissao === 'number' && typeof integracao === 'number' && emissao > integracao + 1;
        });
  adicionar(
    {
      id: 'emissao_depois_integracao',
      nivel: 'atencao',
      titulo: 'Notas emitidas depois de integradas',
      descricao:
        'Impossível na prática: sinal de data com dia e mês trocados, de antes da correção de datas. Reenvie a Alloca07 e a Intelipost para regravar.',
    },
    datasTrocadas.map(nomeRegistro),
  );

  const semMes = registros.filter((r) => r.tabela === 'Notas' && r.mes === SEM_MES);
  adicionar(
    {
      id: 'notas_sem_data',
      nivel: 'atencao',
      titulo: 'Notas sem data de emissão',
      descricao: 'Ficam no grupo "Sem data" do banco e fora dos filtros de período.',
    },
    semMes.map(nomeRegistro),
  );

  const colunasSoltas = colunas.filter((t) => !REGRAS[t.nome]);
  adicionar(
    {
      id: 'colunas_desconhecidas',
      nivel: 'lixo',
      titulo: 'Definições de tabelas que não existem mais',
      descricao: 'Cabeçalhos guardados de tabelas antigas.',
      limpar: () => gravar((tx) => colunasSoltas.forEach((t) => tx.objectStore(TABELAS).delete(t.nome)), [TABELAS]),
    },
    colunasSoltas.map((t) => t.nome),
  );

  const chavesFotos = new Set(fotos.map(String));
  const diasSemFoto = dias.filter((d) => d.temEstado && !chavesFotos.has(d.data));
  adicionar(
    {
      id: 'dia_sem_foto',
      nivel: 'lixo',
      titulo: 'Dias marcados para abrir, mas sem os dados salvos',
      descricao: 'Aparecem em "Ver dados de" e dão erro ao abrir. A marcação é removida; o resumo do dia fica.',
      limpar: () =>
        gravar((tx) => diasSemFoto.forEach((d) => tx.objectStore(DIAS).put({ ...d, temEstado: false } satisfies DiaSalvo)), [DIAS]),
    },
    diasSemFoto.map((d) => d.data.split('-').reverse().join('/')),
  );

  const datasDias = new Set(dias.map((d) => d.data));
  const fotosSoltas = [...chavesFotos].filter((data) => !datasDias.has(data));
  adicionar(
    {
      id: 'foto_sem_dia',
      nivel: 'lixo',
      titulo: 'Fotos de dias que não aparecem em lugar nenhum',
      descricao: 'Dados completos de dias já removidos da lista. Ocupam espaço e não podem ser abertos.',
      limpar: () => gravar((tx) => fotosSoltas.forEach((data) => tx.objectStore(SNAPSHOTS).delete(data)), [SNAPSHOTS]),
    },
    fotosSoltas.map((data) => data.split('-').reverse().join('/')),
  );

  let espacoLocal = 0;
  const chavesVelhas: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const chave = localStorage.key(i);
    if (!chave) continue;
    const tamanho = (chave.length + (localStorage.getItem(chave)?.length ?? 0)) * 2;
    espacoLocal += tamanho;
    if (chave.startsWith('arklok_') && !CHAVE_LOCAL_CONHECIDA.test(chave)) chavesVelhas.push(chave);
  }
  adicionar(
    {
      id: 'chaves_locais_velhas',
      nivel: 'lixo',
      titulo: 'Dados velhos guardados no navegador',
      descricao: 'Sobras de versões antigas do sistema que nenhuma tela usa mais.',
      limpar: async () => {
        chavesVelhas.forEach((chave) => localStorage.removeItem(chave));
      },
    },
    chavesVelhas,
  );

  const espacoLocalKb = Math.round(espacoLocal / 1024);
  if (espacoLocalKb > LIMITE_LOCAL_KB) {
    problemas.push({
      id: 'espaco_local',
      nivel: 'atencao',
      titulo: 'Armazenamento do navegador quase cheio',
      descricao: `As planilhas carregadas ocupam ${(espacoLocalKb / 1024).toFixed(1)} MB de ~5 MB. Uma planilha nova grande pode não caber; use "Guardar e limpar para nova importação" antes.`,
      quantidade: 1,
      exemplos: [],
    });
  }

  return { registros: registros.length, porTabela, dias: dias.length, fotos: chavesFotos.size, espacoLocalKb, problemas };
}
