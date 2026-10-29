/** Datas como yyyy-mm-dd no fuso local. */
export function isoLocal(data: Date): string {
  const mm = String(data.getMonth() + 1).padStart(2, '0');
  const dd = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mm}-${dd}`;
}

export function deIso(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

/** Sem data fica fora quando há período escolhido. */
export function dentroDoPeriodo(dia: string, de: string | null, ate: string | null): boolean {
  if (!de && !ate) return true;
  if (!dia) return false;
  return (!de || dia >= de) && (!ate || dia <= ate);
}

export const dataCurta = (iso: string) => iso.split('-').reverse().join('/');

export function rotuloPeriodo(de: string | null, ate: string | null): string {
  if (!de && !ate) return 'Todas as datas';
  if (de && de === ate) return dataCurta(de);
  return `${de ? dataCurta(de) : 'início'} – ${ate ? dataCurta(ate) : 'hoje'}`;
}
