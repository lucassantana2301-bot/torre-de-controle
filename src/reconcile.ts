import { notaFiscal, readDate, readText, type RawRow } from "./parse";
import { isCurrentBusinessDate } from "./utils/businessDay";

export type AllocaNota = {
  nf: string;
  contrato: string;
  termo: string;
  tipo: string;
  prevEntrada: Date | null;
  romaneio: string;
  cliente: string;
  cidade: string;
  uf: string;
  pedido: string;
  serie: string;
  emissao: Date | null;
  nfTriangular: string;
  linhas: number;
};

export type IntelNota = {
  nf: string;
  destinatario: string;
  cidade: string;
  uf: string;
  pedidoVenda: string;
  pedido: string;
  rastreio: string;
  transportadora: string;
  metodo: string;
  status: string;
  situacao: string;
  performance: string;
  despacho: Date | null;
  entrega: Date | null;
  previsao: Date | null;
  criacao: Date | null;
  url: string;
  mensagem: string;
};

export type Integrada = AllocaNota & {
  validacao: string;
  validadaPor: "direta" | "triangular";
  intel: IntelNota;
};

export type Pendencia = AllocaNota & {
  motivo: "ausente";
};

export type CrossResult = {
  allocaLinhas: number;
  intelLinhas: number;
  integradas: Integrada[];
  pendencias: Pendencia[];
  remanejamento: AllocaNota[];
  soIntelipost: IntelNota[];
  semNotaAlloca: number;
  semNotaIntel: number;
};

const REMANEJAMENTO = "REMANEJAMENTO FISCAL";
function isRemanejamento(tipo: string): boolean {
  return tipo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim() === REMANEJAMENTO;
}

function fromAlloca(row: RawRow): Omit<AllocaNota, "linhas"> | null {
  const nf = notaFiscal(row["nota fiscal"]);
  if (!nf) return null;
  return {
    nf,
    contrato: readText(row, "contrato"),
    termo: readText(row, "termo"),
    tipo: readText(row, "tp previsao"),
    prevEntrada: readDate(row, "prev entr"),
    romaneio: readText(row, "romaneio"),
    cliente: readText(row, "nome dest"),
    cidade: readText(row, "mun destino"),
    uf: readText(row, "uf destino"),
    pedido: readText(row, "pedido"),
    serie: readText(row, "serie nf"),
    emissao: readDate(row, "dt emissao", "data emissao", "data de emissao"),
    nfTriangular: notaFiscal(row["nf triangula"]),
  };
}

function fromIntel(row: RawRow): IntelNota | null {
  const nf = notaFiscal(row["nota fiscal"]);
  if (!nf) return null;
  return {
    nf,
    destinatario: readText(row, "nome do destinatario"),
    cidade: readText(row, "cidade do destinatario"),
    uf: readText(row, "uf"),
    pedidoVenda: readText(row, "pedido de venda"),
    pedido: readText(row, "pedido"),
    rastreio: readText(row, "codigo de rastreio"),
    transportadora: readText(row, "transportadora"),
    metodo: readText(row, "metodo de envio"),
    status: readText(row, "status transportador"),
    situacao: readText(row, "situacao"),
    performance: readText(row, "performance"),
    despacho: readDate(row, "data despacho"),
    entrega: readDate(row, "data entrega"),
    previsao: readDate(row, "previsao entrega cliente"),
    criacao: readDate(row, "data criacao", "data de criacao"),
    url: readText(row, "pagina rastreamento"),
    mensagem: readText(row, "mensagem intelipost"),
  };
}

function groupAlloca(rows: RawRow[]): { notas: AllocaNota[]; semNota: number; linhas: number } {
  const grouped = new Map<string, AllocaNota>();
  let semNota = 0;

  for (const row of rows) {
    const nota = fromAlloca(row);
    if (!nota) {
      semNota += 1;
      continue;
    }
    const current = grouped.get(nota.nf);
    if (!current) {
      grouped.set(nota.nf, { ...nota, linhas: 1 });
      continue;
    }
    current.linhas += 1;
    if (!current.nfTriangular && nota.nfTriangular) current.nfTriangular = nota.nfTriangular;
  }

  return { notas: [...grouped.values()], semNota, linhas: rows.length };
}

export function reconcile(allocaRows: RawRow[], intelRows: RawRow[]): CrossResult {
  const alloca = groupAlloca(allocaRows);
  const intelByNf = new Map<string, IntelNota>();
  let semNotaIntel = 0;

  for (const row of intelRows) {
    const nota = fromIntel(row);
    if (!nota) {
      semNotaIntel += 1;
      continue;
    }
    if (!intelByNf.has(nota.nf)) intelByNf.set(nota.nf, nota);
  }

  const integradas: Integrada[] = [];
  const pendencias: Pendencia[] = [];
  const remanejamento: AllocaNota[] = [];
  const usadas = new Set<string>();

  for (const nota of alloca.notas) {
    if (isRemanejamento(nota.tipo)) {
      if (intelByNf.has(nota.nf)) usadas.add(nota.nf);
      if (nota.nfTriangular && intelByNf.has(nota.nfTriangular)) usadas.add(nota.nfTriangular);
      remanejamento.push(nota);
      continue;
    }

    if (isCurrentBusinessDate(nota.emissao)) {
      if (intelByNf.has(nota.nf)) usadas.add(nota.nf);
      if (nota.nfTriangular && intelByNf.has(nota.nfTriangular)) usadas.add(nota.nfTriangular);
      continue;
    }

    const direta = intelByNf.get(nota.nf);
    if (direta) {
      usadas.add(nota.nf);
      if (nota.nfTriangular && intelByNf.has(nota.nfTriangular)) usadas.add(nota.nfTriangular);
      integradas.push({
        ...nota,
        validacao: direta.transportadora || "Integrada",
        validadaPor: "direta",
        intel: direta,
      });
      continue;
    }

    const triangular = nota.nfTriangular ? intelByNf.get(nota.nfTriangular) : undefined;
    if (triangular) {
      usadas.add(nota.nfTriangular);
      integradas.push({
        ...nota,
        validacao: triangular.transportadora || "Integrada",
        validadaPor: "triangular",
        intel: triangular,
      });
      continue;
    }

    pendencias.push({ ...nota, motivo: "ausente" });
  }

  const soIntelipost = [...intelByNf.values()].filter(
    (nota) => !usadas.has(nota.nf) && !isCurrentBusinessDate(nota.criacao),
  );

  const byDate = (a: AllocaNota, b: AllocaNota) => {
    const at = a.emissao?.getTime() ?? 0;
    const bt = b.emissao?.getTime() ?? 0;
    if (at !== bt) return at - bt;
    return Number(a.nf) - Number(b.nf);
  };

  pendencias.sort(byDate);
  remanejamento.sort(byDate);
  integradas.sort(byDate);
  soIntelipost.sort((a, b) => Number(a.nf) - Number(b.nf));

  return {
    allocaLinhas: alloca.linhas,
    intelLinhas: intelRows.length,
    integradas,
    pendencias,
    remanejamento,
    soIntelipost,
    semNotaAlloca: alloca.semNota,
    semNotaIntel: semNotaIntel,
  };
}

/** Notas emitidas na Alloca07, sem remanejamento fiscal e sem o dia útil corrente. */
export function notasEmitidas(rows: RawRow[]): { notas: AllocaNota[]; remanejamento: number; diaCorrente: number } {
  const alloca = groupAlloca(rows);
  const notas: AllocaNota[] = [];
  let remanejamento = 0;
  let diaCorrente = 0;
  for (const nota of alloca.notas) {
    if (isRemanejamento(nota.tipo)) {
      remanejamento += 1;
      continue;
    }
    if (isCurrentBusinessDate(nota.emissao)) {
      diaCorrente += 1;
      continue;
    }
    notas.push(nota);
  }
  notas.sort((a, b) => {
    const at = a.emissao?.getTime() ?? 0;
    const bt = b.emissao?.getTime() ?? 0;
    if (at !== bt) return at - bt;
    return Number(a.nf) - Number(b.nf);
  });
  return { notas, remanejamento, diaCorrente };
}

export function dateKey(date: Date | null): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | null): string {
  if (!date) return "—";
  const hasTime = date.getHours() + date.getMinutes() + date.getSeconds() > 0;
  if (!hasTime) return formatDate(date);
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type DateBucket = { key: string; label: string; count: number };

export function bucketsByDate(notas: { emissao: Date | null }[]): DateBucket[] {
  const counts = new Map<string, number>();
  for (const nota of notas) {
    const key = dateKey(nota.emissao) || "sem-data";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({
      key,
      label: key === "sem-data" ? "Sem data" : formatDate(new Date(`${key}T12:00:00`)),
      count,
    }));
}
