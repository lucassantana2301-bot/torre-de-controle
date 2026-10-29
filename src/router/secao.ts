/** Query que abre a lista operacional da seção, sem filtro. */
export const LISTA = { view: 'lista' } as const;

export function temFiltro(search: URLSearchParams, chaves: readonly string[]): boolean {
  return chaves.some((chave) => Boolean(search.get(chave)));
}

export function ehListaIntegracoes(search: URLSearchParams): boolean {
  return temFiltro(search, ['status', 'view', 'q', 'tipo', 'tratativa', 'validacao', 'ticket']);
}

export function ehListaZendesk(search: URLSearchParams): boolean {
  return temFiltro(search, ['aba', 'nf', 'view', 'q']);
}

export function ehListaEntregas(search: URLSearchParams): boolean {
  return temFiltro(search, ['resultado', 'transportadora', 'situacao', 'view', 'q']);
}
