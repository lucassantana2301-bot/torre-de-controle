import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { type LinhaConferencia, type ListaConferencia } from '../services/conferenciaImport';
import { integrationService } from '../services/integrationService';
import { entregaDeNfAvulsa, useEntregas, type EntregaNf, type EntregaNota } from '../services/entregasImport';
import { foiEntregue } from './useEntregaPorTicket';
import { useEntregasNotas } from './useEntregasNotas';

export type Resultado = 'entregue' | 'parcial' | 'nao_entregue' | 'modal' | 'nao_encontrada';

export const RESULTADOS: { id: Resultado; label: string; tom: string; dica: string }[] = [
  { id: 'entregue', label: 'Todas entregues', tom: 'success', dica: 'Todas as NFs da linha já foram entregues' },
  { id: 'parcial', label: 'Parte entregue', tom: 'info', dica: 'Algumas NFs entregues, outras ainda não' },
  { id: 'nao_entregue', label: 'Não entregues', tom: 'warning', dica: 'Em trânsito, devolvidas ou só com envio cancelado' },
  { id: 'modal', label: 'Frota / Lalamove', tom: '', dica: 'Frota interna ou Lalamove ainda sem status de entregue' },
  { id: 'nao_encontrada', label: 'Não encontradas', tom: 'danger', dica: 'A nota da Alloca07 não aparece na planilha da transportadora' },
];

export const isResultado = (valor: string | null): valor is Resultado => RESULTADOS.some((r) => r.id === valor);

export interface LinhaResultado extends LinhaConferencia {
  itens: { nf: string; entrega: EntregaNf }[];
  resultado: Resultado;
}

export interface Conferencia {
  lista: ListaConferencia | null;
  linhas: LinhaResultado[];
  contagem: Record<Resultado, number>;
}

function resultadoDaLinha(itens: LinhaResultado['itens']): Resultado {
  const entregues = itens.filter((i) => foiEntregue(i.entrega)).length;
  if (entregues === itens.length) return 'entregue';
  if (entregues > 0) return 'parcial';
  if (itens.some((i) => i.entrega.modal)) return 'modal';
  if (itens.every((i) => !i.entrega.evento)) return 'nao_encontrada';
  return 'nao_entregue';
}

function listaDaAlloca(notas: EntregaNota[], arquivo: string, importadoEm: string): ListaConferencia {
  return {
    fileName: arquivo || 'Alloca07',
    importadoEm: importadoEm || new Date().toISOString(),
    linhas: notas.map(
      (nota): LinhaConferencia => ({
        ticket: '',
        nfs: [nota.nf],
        organizacao: nota.cliente,
        emissao: nota.emissao || undefined,
        cidade: nota.cidade || undefined,
        uf: nota.uf || undefined,
      }),
    ),
    semNf: 0,
    temTicket: false,
    temEmissao: notas.some((nota) => Boolean(nota.emissao)),
  };
}

/** Notas da Alloca07 cruzadas com as planilhas das transportadoras, uma NF por linha. */
export function useConferencia(): Conferencia {
  const { integrations } = useApp();
  const info = useMemo(() => integrationService.info(), [integrations]);
  const entregasState = useEntregas();
  const notasIntegradas = useEntregasNotas();
  const lista = useMemo(
    () => (notasIntegradas.length ? listaDaAlloca(notasIntegradas, info?.arquivos[0] ?? 'Alloca07', info?.importadoEm ?? '') : null),
    [notasIntegradas, info],
  );

  const linhas = useMemo<LinhaResultado[]>(() => {
    if (!lista) return [];
    const integradas = new Map<string, EntregaNf>();
    for (const nota of notasIntegradas) {
      for (const chave of [nota.nf, nota.nfTriangular]) if (chave && !integradas.has(chave)) integradas.set(chave, nota.entrega);
    }
    return lista.linhas.map((linha) => {
      const itens = linha.nfs.map((nf) => ({ nf, entrega: integradas.get(nf) ?? entregaDeNfAvulsa(nf, entregasState) }));
      return { ...linha, itens, resultado: resultadoDaLinha(itens) };
    });
  }, [lista, notasIntegradas, entregasState]);

  const contagem = useMemo(() => {
    const porResultado = Object.fromEntries(RESULTADOS.map((r) => [r.id, 0])) as Record<Resultado, number>;
    for (const linha of linhas) porResultado[linha.resultado]++;
    return porResultado;
  }, [linhas]);

  return { lista, linhas, contagem };
}
