import type { TransportadoraId } from './entregasImport';

export interface EntregaConfirmada {
  nf: string;
  transportadora: TransportadoraId;
  /** YYYY-MM-DDTHH:mm, mesmo formato das planilhas. */
  dataEntrega: string;
  motivo: string;
}

/**
 * Entregas confirmadas pela equipe que a transportadora não lançou na planilha.
 * Valem só enquanto a planilha não trouxer a data de entrega; quando trouxer, a da planilha prevalece.
 */
export const ENTREGAS_CONFIRMADAS: EntregaConfirmada[] = [
  { nf: '236195', transportadora: 'spfly', dataEntrega: '2026-10-05T20:41', motivo: 'CT-e 696447 sem data de entrega no relatório da SPfly' },
  { nf: '236271', transportadora: 'spfly', dataEntrega: '2026-10-05T20:41', motivo: 'CT-e 696447 sem data de entrega no relatório da SPfly' },
  { nf: '234919', transportadora: 'spfly', dataEntrega: '2026-09-28T10:36', motivo: 'Sem data de entrega no relatório da SPfly' },
  { nf: '234776', transportadora: 'spfly', dataEntrega: '2026-10-09T13:35', motivo: 'Sem data de entrega no relatório da SPfly' },
  { nf: '235564', transportadora: 'spfly', dataEntrega: '2026-10-08T11:23', motivo: 'Sem data de entrega no relatório da SPfly' },
  { nf: '235763', transportadora: 'spfly', dataEntrega: '2026-10-10T13:32', motivo: 'Entrega confirmada no dia 10/10' },
  { nf: '237533', transportadora: 'spfly', dataEntrega: '2026-10-16T12:33', motivo: 'Sem data de entrega no relatório da SPfly' },
  { nf: '237482', transportadora: 'spfly', dataEntrega: '2026-10-22T14:37', motivo: 'Sem data de entrega no relatório da SPfly' },
  { nf: '231747', transportadora: 'spfly', dataEntrega: '2026-09-02T11:51', motivo: 'Sem data de entrega no relatório da SPfly; entrega anterior ao CT-e atual' },
];
