export type IntegrationStatus = 'completed' | 'pending' | 'intelipost_only' | 'error' | 'processing';

export type SheetPresence = 'both' | 'alloca_only' | 'intelipost_only';

export type IntegrationType = 'API' | 'WEBHOOK' | 'BATCH_FILE' | 'ERP_SYNC' | 'TMS_CARRIER';

export type IntegrationCategory =
  | 'Logística'
  | 'Fiscal & NF'
  | 'ERP Protheus'
  | 'Hardware Arklok'
  | 'Financeiro'
  | 'Segurança & Nuvem';

export interface Integration {
  id: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  type: IntegrationType;
  status: IntegrationStatus;
  createdAt: string; // ISO 8601
  lastRunAt: string | null;
  durationMs: number;
  responsible: string;
  errorMessage: string | null;
  retryCount: number;
  sourceSystem: string;
  targetSystem: string;
  endpoint?: string;
  metadata?: {
    notaFiscal?: string;
    nfTriangular?: string;
    validacao?: 'direta' | 'triangular';
    tipoNota?: string;
    serieNf?: string;
    dataEmissao?: string;
    dataIntegracao?: string;
    pedido?: string;
    transportadora?: string;
    clienteDestino?: string;
    cidade?: string;
    uf?: string;
    romaneio?: string;
    rastreio?: string;
    chaveAcesso?: string;
    contrato?: string;
    presenca?: SheetPresence;
  };
}

export interface ExecutionLog {
  id: string;
  integrationId: string;
  executionId: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
  durationMs: number;
  payloadSent?: Record<string, unknown> | null;
  payloadReceived?: Record<string, unknown> | null;
}

export interface IntegrationExecution {
  id: string;
  integrationId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: IntegrationStatus;
  triggeredBy: 'SCHEDULE' | 'MANUAL' | 'WEBHOOK' | 'RETRY';
  recordsProcessed: number;
  recordsFailed: number;
  errorMessage?: string | null;
  requestPayload?: string;
  responsePayload?: string;
}

export interface DashboardMetrics {
  total: number;
  completed: number;
  pending: number;
  intelipostOnly: number;
  error: number;
  processing: number;
  allocaTotal: number;
  successRate: number;
  lastRunAt: string | null;
  lastSyncAt: string;
  comparisonVsPrevious: {
    totalDiffPercent: number;
    completedDiffPercent: number;
    errorDiffPercent: number;
  };
}

export interface GlobalFilterState {
  search: string;
  status: IntegrationStatus | 'all';
  category: IntegrationCategory | 'all';
  type: IntegrationType | 'all';
  responsible: string | 'all';
  startDate: string | null;
  endDate: string | null;
  datePreset: 'all' | 'today' | '7d' | '30d' | 'month' | 'custom';
  /** Período de emissão da NF (yyyy-mm-dd), aplicado às notas e às entregas. */
  emissaoDe: string | null;
  emissaoAte: string | null;
}

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}
