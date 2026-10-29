import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { integrationService } from '../services/integrationService';
import { cruzarEntregasNotas, useEntregas, type EntregaNota } from '../services/entregasImport';
import { useZendesk } from '../services/zendeskImport';
import { useDiaAtivo } from '../services/diaAtivo';
import { useRomaneio } from '../services/romaneioImport';
import { memoUltimo } from '../utils/memoUltimo';

const cruzar = memoUltimo(cruzarEntregasNotas);

/** Notas integradas do dia visível cruzadas com as planilhas das transportadoras. */
export function useEntregasNotas(): EntregaNota[] {
  const { integrations } = useApp();
  const entregas = useEntregas();
  const zendesk = useZendesk();
  const romaneio = useRomaneio();
  const diaAtivo = useDiaAtivo();
  return useMemo(
    () => cruzar(integrationService.operacionais(), entregas, zendesk, romaneio),
    [integrations, entregas, zendesk, romaneio, diaAtivo],
  );
}
