import * as XLSX from 'xlsx';

/** Gera a planilha no modelo baixaMassa.xlsx: aba "Tickets" com a coluna única id_zendesk. */
export function exportarBaixaMassa(ids: string[], filtro: string) {
  const unicos = [...new Set(ids.filter(Boolean))];
  const rows = unicos.map((id) => [/^\d+$/.test(id) ? Number(id) : id]);
  const sheet = XLSX.utils.aoa_to_sheet([['id_zendesk'], ...rows]);
  sheet['!cols'] = [{ wch: 14 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Tickets');
  XLSX.writeFile(workbook, `baixaMassa_${filtro}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
