import { useMemo } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { filtroDeTipo, tipoPorNf, type PassaNf } from './entregasDash';
import { TRANSPORTADORAS, useEntregas, type EntregasState, type TransportadoraId } from './entregasImport';
import { integrationService } from './integrationService';
import { useTiposOcultos } from './tiposOcultos';
import { memoUltimo } from '../utils/memoUltimo';

/** NF entregue na planilha da transportadora e ainda pendente nas Transações da Intelipost. */
export interface NfDesatualizada {
  nf: string;
  transportadora: TransportadoraId;
  transportadoraLabel: string;
  statusIntelipost: string;
  /** Entrega na transportadora (YYYY-MM-DD). */
  entregueEm: string;
  previsao: string;
  destinatario: string;
  cidade: string;
  uf: string;
}

export interface ResultadoGap {
  lista: NfDesatualizada[];
  /** NFs da transportadora que também estão nas Transações, base da comparação. */
  comparadas: number;
  /** Transportadoras com planilha carregada e as Transações presentes. */
  comparadasPor: TransportadoraId[];
  temTransacoes: boolean;
}

export const montarGap = memoUltimo((_entregas: EntregasState, _passa: PassaNf): ResultadoGap => {
  return { lista: [], comparadas: 0, comparadasPor: [], temTransacoes: false };
});

const diasEntre = (de: string, ate: string) =>
  de ? Math.max(0, Math.round((Date.parse(`${ate}T12:00:00`) - Date.parse(`${de}T12:00:00`)) / 86_400_000)) : '';
const dataBr = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');

/** Excel com uma aba "Todas" e uma por transportadora, as entregues há mais tempo primeiro. */
export function exportarGap(lista: NfDesatualizada[], hoje: string) {
  const linhas = (de: NfDesatualizada[]) =>
    de.map((n) => ({
      'Nota fiscal': Number(n.nf),
      Transportadora: n.transportadoraLabel,
      'Entregue na transportadora em': dataBr(n.entregueEm),
      'Dias sem atualizar': diasEntre(n.entregueEm, hoje),
      'Status na Intelipost': n.statusIntelipost,
      Destinatário: n.destinatario,
      Cidade: n.cidade,
      UF: n.uf,
    }));
  const livro = XLSX.utils.book_new();
  const aba = (nome: string, de: NfDesatualizada[]) => {
    const planilha = XLSX.utils.json_to_sheet(linhas(de));
    planilha['!autofilter'] = { ref: planilha['!ref'] ?? 'A1' };
    planilha['!cols'] = [12, 14, 16, 10, 34, 40, 22, 5].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(livro, planilha, nome);
  };
  aba('Todas', lista);
  for (const { id, label } of TRANSPORTADORAS) {
    const daCarrier = lista.filter((n) => n.transportadora === id);
    if (daCarrier.length) aba(label, daCarrier);
  }
  XLSX.writeFile(livro, `gaps_intelipost_${hoje}.xlsx`);
}

/** Mesmo recorte do painel de Entregas: tipos de nota ocultos no topo ficam de fora. */
export function useGapIntelipost(): ResultadoGap {
  const entregas = useEntregas();
  const { integrations } = useApp();
  const ocultos = useTiposOcultos();
  const passa = useMemo(() => filtroDeTipo(tipoPorNf(integrationService.todasDoDia()), ocultos, ''), [integrations, ocultos]);
  return useMemo(() => montarGap(entregas, passa), [entregas, passa]);
}
