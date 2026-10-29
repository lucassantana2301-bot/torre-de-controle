/** Célula de CSV segura: escapa aspas/separador e neutraliza fórmulas (=, +, -, @) para o Excel não executá-las. */
export const csvCell = (value: string | number | null | undefined, separador = ';'): string => {
  let text = String(value ?? '');
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return text.includes(separador) || /["\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
