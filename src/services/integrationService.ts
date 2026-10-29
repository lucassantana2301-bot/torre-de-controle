import {
  Integration,
  DashboardMetrics,
  GlobalFilterState,
  IntegrationExecution,
  ExecutionLog,
} from '../types';
import { INITIAL_EXECUTIONS, INITIAL_LOGS } from './mockData';
import { businessToday } from '../utils/businessDay';
import { dentroDoPeriodo } from '../utils/periodo';
import { bloquearSeHistorico, diaHistorico } from './diaAtivo';
import { chaveTipo, tiposOcultos } from './tiposOcultos';

const STORAGE_KEY_INTEGRATIONS = 'arklok_integrations_v3';
const STORAGE_KEY_REVISION = 'arklok_reconcile_revision';
const USER_DATASET_REVISION = 'user-upload-v6';
const STORAGE_KEY_EXECUTIONS = 'arklok_executions_v1';
const STORAGE_KEY_LOGS = 'arklok_logs_v1';
const STORAGE_KEY_INFO = 'arklok_cruzamento_info_v1';
const SEM_NOTAS: Integration[] = [];

/** A base do cruzamento passa de 5 MB com facilidade, então fica no IndexedDB e não no localStorage. */
const DB_NAME = 'arklok_integrations';
const DB_STORE = 'base';
const DB_CHAVE = 'atual';

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function gravarDb(lista: Integration[]): Promise<void> {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    if (lista.length) tx.objectStore(DB_STORE).put(lista, DB_CHAVE);
    else tx.objectStore(DB_STORE).delete(DB_CHAVE);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function lerDb(): Promise<Integration[] | null> {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DB_STORE).objectStore(DB_STORE).get(DB_CHAVE);
    request.onsuccess = () => resolve((request.result as Integration[] | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

/** Base antiga gravada no localStorage: lida uma vez para migrar ao IndexedDB. */
function lerLegado(): Integration[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_INTEGRATIONS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Integration[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export interface InfoCruzamento {
  arquivos: string[];
  importadoEm: string;
}

class IntegrationService {
  /** Arquivos e horário do último envio da Alloca07 e Intelipost. */
  info(): InfoCruzamento | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_INFO);
      return raw ? (JSON.parse(raw) as InfoCruzamento) : null;
    } catch {
      return null;
    }
  }

  salvarInfo(arquivos: string[]): void {
    localStorage.setItem(STORAGE_KEY_INFO, JSON.stringify({ arquivos, importadoEm: new Date().toISOString() }));
  }

  hasUserDataset(): boolean {
    return localStorage.getItem(STORAGE_KEY_REVISION) === USER_DATASET_REVISION;
  }

  /** Cópia em memória da base salva no IndexedDB; as leituras síncronas da tela usam só ela. */
  private memoria: Integration[] | null = null;
  private operacionaisMemo: {
    base: Integration[];
    dia: unknown;
    hoje: string;
    ocultos: string[];
    doDia: Integration[];
    lista: Integration[];
  } | null = null;
  private carregamento: Promise<void>;

  constructor() {
    this.carregamento = this.carregar();
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY_REVISION || event.key === null) {
        this.carregamento = this.carregar();
      }
    });
  }

  private async carregar(): Promise<void> {
    try {
      const salva = await lerDb();
      if (salva) {
        this.memoria = salva;
        return;
      }
      const legado = lerLegado();
      if (legado) {
        await gravarDb(legado);
        localStorage.removeItem(STORAGE_KEY_INTEGRATIONS);
        this.memoria = legado;
        return;
      }
      this.memoria = [];
    } catch {
      this.memoria = lerLegado() ?? [];
    }
  }

  /** Espera a base sair do IndexedDB antes da primeira leitura. */
  pronto(): Promise<void> {
    return this.carregamento;
  }

  private getStoredIntegrations(): Integration[] {
    if (!this.hasUserDataset()) return SEM_NOTAS;
    return this.memoria ?? SEM_NOTAS;
  }

  private async saveIntegrations(data: Integration[]): Promise<void> {
    bloquearSeHistorico();
    await this.carregamento;
    try {
      await gravarDb(data);
    } catch {
      throw new Error('Não foi possível salvar a base no navegador. Use "Verificar banco" para liberar espaço e envie de novo.');
    }
    localStorage.removeItem(STORAGE_KEY_INTEGRATIONS);
    this.memoria = data.slice();
  }

  private getStoredExecutions(): IntegrationExecution[] {
    const raw = localStorage.getItem(STORAGE_KEY_EXECUTIONS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_EXECUTIONS, JSON.stringify(INITIAL_EXECUTIONS));
      return INITIAL_EXECUTIONS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_EXECUTIONS;
    }
  }

  private saveExecutions(data: IntegrationExecution[]): void {
    localStorage.setItem(STORAGE_KEY_EXECUTIONS, JSON.stringify(data));
  }

  private getStoredLogs(): ExecutionLog[] {
    const raw = localStorage.getItem(STORAGE_KEY_LOGS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(INITIAL_LOGS));
      return INITIAL_LOGS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_LOGS;
    }
  }

  private saveLogs(data: ExecutionLog[]): void {
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(data));
  }

  /** Com um dia salvo aberto, as notas e o "hoje" da regra de dia útil passam a ser os daquele dia. */
  private operationalIntegrations(): Integration[] {
    const dia = diaHistorico();
    const base = dia ? dia.estado.integrations : this.getStoredIntegrations();
    const hoje = businessToday();
    const ocultos = tiposOcultos();
    const memo = this.operacionaisMemo;
    if (memo && memo.base === base && memo.dia === dia && memo.hoje === hoje && memo.ocultos === ocultos) return memo.lista;
    const corte = dia ? businessToday(new Date(`${dia.data}T12:00:00`)) : hoje;
    const doDia = base.filter((item) => !item.createdAt || item.createdAt.slice(0, 10) < corte);
    const lista = ocultos.length ? doDia.filter((item) => !ocultos.includes(chaveTipo(item.metadata?.tipoNota))) : doDia;
    this.operacionaisMemo = { base, dia, hoje, ocultos, doDia, lista };
    return lista;
  }

  /** Notas do dia visível antes do filtro de tipos (para saber o tipo de uma NF que está oculta). */
  todasDoDia(): Integration[] {
    this.operationalIntegrations();
    return this.operacionaisMemo?.doDia ?? SEM_NOTAS;
  }

  /** Tipos de nota (Tp. Previsão da Alloca07) do dia visível, com quantas notas cada um tem, antes do filtro de tipos. */
  tiposDeNota(): { tipo: string; chave: string; notas: number }[] {
    this.operationalIntegrations();
    const porTipo = new Map<string, { tipo: string; notas: number }>();
    for (const item of this.operacionaisMemo?.doDia ?? []) {
      const tipo = item.metadata?.tipoNota;
      if (!tipo) continue;
      const chave = chaveTipo(tipo);
      const atual = porTipo.get(chave) ?? { tipo, notas: 0 };
      atual.notas += 1;
      porTipo.set(chave, atual);
    }
    return [...porTipo].map(([chave, v]) => ({ chave, ...v })).sort((a, b) => b.notas - a.notas);
  }

  /** Todas as notas do cruzamento (sem os filtros da tela) do dia visível. */
  operacionais(): Integration[] {
    return this.operationalIntegrations();
  }

  /** Base de hoje como está salva, para gravar no banco diário. */
  estadoAtual(): Integration[] {
    return this.getStoredIntegrations();
  }

  // Listagem com aplicação de filtros globais
  async list(filters?: Partial<GlobalFilterState>): Promise<Integration[]> {
    let items = this.operationalIntegrations();

    if (!filters) return items;

    if (filters.search && filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.id.toLowerCase().includes(q) ||
          i.responsible.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          (i.metadata?.notaFiscal && i.metadata.notaFiscal.includes(q)) ||
          (i.metadata?.nfTriangular && i.metadata.nfTriangular.includes(q)) ||
          (i.metadata?.tipoNota && i.metadata.tipoNota.toLowerCase().includes(q)) ||
          (i.metadata?.clienteDestino && i.metadata.clienteDestino.toLowerCase().includes(q)) ||
          (i.metadata?.rastreio && i.metadata.rastreio.toLowerCase().includes(q))
      );
    }

    if (filters.status && filters.status !== 'all') {
      items = items.filter((i) => i.status === filters.status);
    }

    if (filters.category && filters.category !== 'all') {
      items = items.filter((i) => i.category === filters.category);
    }

    if (filters.type && filters.type !== 'all') {
      items = items.filter((i) => i.type === filters.type);
    }

    if (filters.responsible && filters.responsible !== 'all') {
      items = items.filter((i) => i.responsible === filters.responsible);
    }

    if (filters.startDate) {
      const start = new Date(filters.startDate).getTime();
      items = items.filter((i) => new Date(i.createdAt).getTime() >= start);
    }

    if (filters.endDate) {
      const end = new Date(filters.endDate).getTime();
      items = items.filter((i) => new Date(i.createdAt).getTime() <= end);
    }

    if (filters.emissaoDe || filters.emissaoAte) {
      items = items.filter((i) =>
        dentroDoPeriodo((i.metadata?.dataEmissao ?? i.createdAt ?? '').slice(0, 10), filters.emissaoDe ?? null, filters.emissaoAte ?? null),
      );
    }

    return items;
  }

  async getById(id: string): Promise<Integration | null> {
    const items = this.operationalIntegrations();
    return items.find((i) => i.id === id) || null;
  }

  async getMetrics(filters?: Partial<GlobalFilterState>): Promise<DashboardMetrics> {
    const list = await this.list(filters);
    const total = list.length;
    const completed = list.filter((i) => i.status === 'completed').length;
    const pending = list.filter((i) => i.status === 'pending').length;
    const intelipostOnly = list.filter((i) => i.status === 'intelipost_only').length;
    const error = list.filter((i) => i.status === 'error').length;
    const processing = list.filter((i) => i.status === 'processing').length;
    const allocaTotal = completed + pending;
    const successRate = allocaTotal > 0 ? Math.round((completed / allocaTotal) * 1000) / 10 : 0;

    const runs = list
      .map((i) => i.lastRunAt)
      .filter(Boolean)
      .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime());

    return {
      total,
      completed,
      pending,
      intelipostOnly,
      error,
      processing,
      allocaTotal,
      successRate,
      lastRunAt: runs[0] || null,
      lastSyncAt: new Date().toISOString(),
      comparisonVsPrevious: {
        totalDiffPercent: 8.4,
        completedDiffPercent: 12.1,
        errorDiffPercent: -15.3,
      },
    };
  }

  async getExecutionsByIntegration(integrationId: string): Promise<IntegrationExecution[]> {
    await new Promise((r) => setTimeout(r, 40));
    const executions = this.getStoredExecutions();
    return executions.filter((e) => e.integrationId === integrationId);
  }

  async getLogsByIntegration(integrationId: string): Promise<ExecutionLog[]> {
    await new Promise((r) => setTimeout(r, 40));
    const logs = this.getStoredLogs();
    return logs.filter((l) => l.integrationId === integrationId);
  }

  async create(payload: Omit<Integration, 'id' | 'createdAt' | 'retryCount' | 'durationMs' | 'lastRunAt'>): Promise<Integration> {
    const items = [...this.getStoredIntegrations()];
    const newIntegration: Integration = {
      ...payload,
      id: `INT-ARK-${Math.floor(100000 + Math.random() * 900000)}`,
      createdAt: new Date().toISOString(),
      lastRunAt: null,
      durationMs: 0,
      retryCount: 0,
    };
    items.unshift(newIntegration);
    await this.saveIntegrations(items);
    return newIntegration;
  }

  async update(id: string, updates: Partial<Integration>): Promise<Integration> {
    const items = [...this.getStoredIntegrations()];
    const index = items.findIndex((i) => i.id === id);
    if (index === -1) throw new Error('Integração não encontrada');

    items[index] = { ...items[index], ...updates };
    await this.saveIntegrations(items);
    return items[index];
  }

  async delete(id: string): Promise<void> {
    const items = this.getStoredIntegrations();
    const filtered = items.filter((i) => i.id !== id);
    await this.saveIntegrations(filtered);
  }

  async reprocess(id: string): Promise<Integration> {
    const current = this.getStoredIntegrations().find((item) => item.id === id);
    if (!current) throw new Error('Integração não encontrada');
    if (current.metadata?.presenca !== 'both') {
      throw new Error('A nota não está nas duas planilhas e não pode ser marcada como integrada.');
    }
    await this.update(id, {
      status: 'processing',
      errorMessage: null,
      lastRunAt: new Date().toISOString(),
    });

    // 2. Simula execução assíncrona após 1.5s com sucesso
    await new Promise((r) => setTimeout(r, 1200));

    const updated = await this.update(id, {
      status: 'completed',
      durationMs: Math.floor(650 + Math.random() * 500),
      retryCount: 0,
      errorMessage: null,
      lastRunAt: new Date().toISOString(),
    });

    // Registra log da execução concluída
    const logs = this.getStoredLogs();
    logs.unshift({
      id: `LOG-RETRY-${Date.now()}`,
      integrationId: id,
      executionId: `EXEC-AUTO-${Date.now()}`,
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Reprocessamento manual concluído com sucesso pela interface Arklok.',
      durationMs: updated.durationMs,
    });
    this.saveLogs(logs);

    return updated;
  }

  async replaceAll(items: Integration[]): Promise<void> {
    await this.saveIntegrations(items);
    localStorage.setItem(STORAGE_KEY_REVISION, USER_DATASET_REVISION);
  }

  /** Remove a base Alloca07 × Intelipost carregada, deixando o app pronto para uma nova importação. */
  async limpar(): Promise<void> {
    await this.saveIntegrations([]);
    localStorage.removeItem(STORAGE_KEY_REVISION);
    localStorage.removeItem(STORAGE_KEY_INFO);
  }

  async resetToDefault(): Promise<void> {
    await this.limpar();
    this.saveExecutions(INITIAL_EXECUTIONS);
    this.saveLogs(INITIAL_LOGS);
  }
}

export const integrationService = new IntegrationService();
