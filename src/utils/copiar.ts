/** Área de transferência com reserva para quando o navegador bloqueia a API moderna. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

/** Célula para colar no Excel: tabulação e quebra de linha mudariam de coluna/linha. */
export const semTab = (valor: string) => valor.replace(/[\t\r\n]+/g, ' ').trim();
