import { useMemo } from 'react';
import {
  TRANSPORTADORAS,
  isRetornoCd,
  useEntregas,
  type EntregasState,
  type EventoTransportadora,
  type TransportadoraId,
} from './entregasImport';
import { memoUltimo } from '../utils/memoUltimo';

export interface TentativaReentrega {
  cte: string;
  dataCte: string;
  status: string;
  previsao: string;
  dataEntrega: string;
  recebedor: string;
  valorReentrega: number;
}

export interface Reentrega {
  nf: string;
  transportadora: TransportadoraId;
  transportadoraLabel: string;
  destinatario: string;
  cidade: string;
  uf: string;
  /** Uma por CT-e, da mais antiga para a mais nova. */
  tentativas: TentativaReentrega[];
  entregue: boolean;
  dataEntrega: string;
  valorReentrega: number;
}

export interface ResultadoReentregas {
  lista: Reentrega[];
  /** Transportadoras carregadas sem a coluna de CT-e (importadas antes de ela ser lida). */
  semCte: TransportadoraId[];
  /** NFs com CT-e diferente para destinatários diferentes: em geral o mesmo número de NF de outro emitente. */
  destinatarioDiferente: number;
  /** NFs desconsideradas por serem devolução ou retorno à Arklok. */
  devolucoesDesconsideradas?: number;
}

const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Devoluções e retornos à Arklok não contam como reentrega (são reversas/devoluções). */
export const isDevolucaoStatus = (status: string | undefined): boolean =>
  Boolean(status && /devolu|retorno.*remetente|retorno.*cd/i.test(status));

export const isRetornoArklok = (evento: Pick<EventoTransportadora, 'destinatario' | 'cidade'>): boolean =>
  Boolean((evento.destinatario && /arklok/i.test(evento.destinatario)) || isRetornoCd(evento));

export const isEventoDevolucaoOuRetorno = (evento: EventoTransportadora): boolean =>
  isDevolucaoStatus(evento.ultimoStatus) || isRetornoArklok(evento);

export const isStatusEntregue = (status: string | undefined): boolean =>
  Boolean(
    status &&
      /entregue|entrega realizada|entrega efetuada|mercadoria entregue|comprovante de entrega|finalizado|baixado/i.test(
        status,
      ) &&
      !/devolu/i.test(status),
  );

/** A linha que representa o CT-e: a que tem entrega ou status de entrega; senão, o último status. */
function eventoDoCte(eventos: EventoTransportadora[]): EventoTransportadora {
  return (
    eventos.find((e) => e.dataEntrega) ??
    eventos.find((e) => isStatusEntregue(e.ultimoStatus)) ??
    [...eventos].sort((a, b) => a.dataStatus.localeCompare(b.dataStatus)).at(-1)!
  );
}

/**
 * Reentrega: a mesma NF com dois ou mais CT-e para o cliente (tentativas de entrega reais).
 * Devoluções, reversas e retornos à Arklok/CD são desconsideradas.
 */
export function detectarReentregas(entregas: EntregasState): ResultadoReentregas {
  const lista: Reentrega[] = [];
  const semCte: TransportadoraId[] = [];
  let destinatarioDiferente = 0;
  let devolucoesDesconsideradas = 0;

  for (const { id, label } of TRANSPORTADORAS) {
    const planilha = entregas.transportadoras[id];
    if (!planilha) continue;
    const eventos = Object.values(planilha.porNf).flat();
    if (eventos.length && !eventos.some((e) => e.cte)) {
      semCte.push(id);
      continue;
    }

    for (const [nf, doNf] of Object.entries(planilha.porNf)) {
      // NFs com CT-e de reversa são devoluções / retornos: saem das reentregas
      if (planilha.reversas?.[nf]) {
        devolucoesDesconsideradas += 1;
        continue;
      }

      // Se houver qualquer evento com status de devolução ou destinado à Arklok, sai da reentrega
      if (doNf.some(isEventoDevolucaoOuRetorno)) {
        devolucoesDesconsideradas += 1;
        continue;
      }

      const porCte = new Map<string, EventoTransportadora[]>();
      for (const e of doNf) if (e.cte) porCte.set(e.cte, [...(porCte.get(e.cte) ?? []), e]);
      if (porCte.size < 2) continue;

      const destinatarios = new Set(doNf.filter((e) => e.cte).map((e) => normalizar(e.destinatario)).filter(Boolean));
      if (destinatarios.size > 1) {
        destinatarioDiferente += 1;
        continue;
      }

      const tentativas = [...porCte].map(([cte, evs]): TentativaReentrega => {
        const e = eventoDoCte(evs);
        const dataEntrega =
          e.dataEntrega || (isStatusEntregue(e.ultimoStatus) ? (e.dataStatus || e.dataCte || '') : '');
        return {
          cte,
          dataCte: e.dataCte ?? '',
          status: e.ultimoStatus,
          previsao: e.previsao,
          dataEntrega,
          recebedor: e.recebedor,
          valorReentrega: evs.reduce((s, x) => s + (x.valorReentrega ?? 0), 0),
        };
      });
      tentativas.sort((a, b) => a.dataCte.localeCompare(b.dataCte) || a.cte.localeCompare(b.cte, undefined, { numeric: true }));

      const entregas = tentativas.map((t) => t.dataEntrega).filter(Boolean).sort();
      const foiEntregue = entregas.length > 0 || tentativas.some((t) => isStatusEntregue(t.status));
      const referencia = eventoDoCte(doNf);
      lista.push({
        nf,
        transportadora: id,
        transportadoraLabel: label,
        destinatario: referencia.destinatario,
        cidade: referencia.cidade,
        uf: referencia.uf,
        tentativas,
        entregue: foiEntregue,
        dataEntrega: entregas.at(-1) ?? (foiEntregue ? (referencia.dataStatus || referencia.dataCte || '') : ''),
        valorReentrega: tentativas.reduce((s, t) => s + t.valorReentrega, 0),
      });
    }
  }

  lista.sort(
    (a, b) =>
      Number(a.entregue) - Number(b.entregue) ||
      b.tentativas.length - a.tentativas.length ||
      a.nf.localeCompare(b.nf, undefined, { numeric: true }),
  );
  return { lista, semCte, destinatarioDiferente, devolucoesDesconsideradas };
}

const detectar = memoUltimo(detectarReentregas);

export function useReentregas(): ResultadoReentregas {
  const entregas = useEntregas();
  return useMemo(() => detectar(entregas), [entregas]);
}
