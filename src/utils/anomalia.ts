import type { Integration } from '../types';
import { formatNoteDate } from './businessDay';

export function isDataAnormal(item: Integration): boolean {
  const emissao = item.metadata?.dataEmissao;
  const integracao = item.metadata?.dataIntegracao;
  if (!emissao || !integracao) return false;
  return integracao.slice(0, 10) !== emissao.slice(0, 10);
}

export function anomaliaDescricao(item: Integration): string {
  return `Data de emissão (${formatNoteDate(item.metadata?.dataEmissao)}) diferente da data de integração (${formatNoteDate(
    item.metadata?.dataIntegracao,
  )}).`;
}
