import * as XLSX from "xlsx";

export type SourceKind = "alloca" | "intelipost";

export type CellValue = string | number | boolean | Date | null;

export type RawRow = Record<string, CellValue>;

export type ParsedSheet = {
  kind: SourceKind;
  sheetName: string;
  rows: RawRow[];
};

const ALLOCA_MARKERS = ["tp previsao", "nome dest", "dt emissao", "romaneio"];
const INTEL_MARKERS = [
  "transportadora",
  "status transportador",
  "codigo de rastreio",
  "nome do destinatario",
];

export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cellValue(cell: XLSX.CellObject | undefined): CellValue {
  if (!cell || cell.v == null || cell.v === "") return null;
  if (cell.t === "d" && cell.v instanceof Date) return cell.v;
  if (cell.t === "n" && typeof cell.v === "number") {
    if (cell.w && /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(cell.w)) {
      const parsed = XLSX.SSF.parse_date_code(cell.v);
      if (parsed) {
        return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S);
      }
    }
    return cell.v;
  }
  if (typeof cell.v === "string") return cell.v.trim() || null;
  if (typeof cell.v === "boolean") return cell.v;
  if (cell.v instanceof Date) return cell.v;
  return String(cell.v);
}

function scoreHeaders(headers: string[], kind: SourceKind): number {
  const markers = kind === "alloca" ? ALLOCA_MARKERS : INTEL_MARKERS;
  const hasNf = headers.includes("nota fiscal");
  if (!hasNf) return 0;
  return 2 + markers.filter((marker) => headers.includes(marker)).length;
}

// Exportações de ERP às vezes gravam uma dimensão menor que a área preenchida; o intervalo real vem das células.
export function usedRange(sheet: XLSX.WorkSheet): XLSX.Range | null {
  let range: XLSX.Range | null = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
  for (const key of Object.keys(sheet)) {
    if (key.startsWith("!")) continue;
    const { r, c } = XLSX.utils.decode_cell(key);
    if (!range) {
      range = { s: { r, c }, e: { r, c } };
      continue;
    }
    if (r < range.s.r) range.s.r = r;
    if (c < range.s.c) range.s.c = c;
    if (r > range.e.r) range.e.r = r;
    if (c > range.e.c) range.e.c = c;
  }
  return range;
}

function sheetRows(sheet: XLSX.WorkSheet): { headerIndex: number; headers: string[]; rows: RawRow[] } | null {
  const range = usedRange(sheet);
  if (!range) return null;
  const scanUntil = Math.min(range.e.r, range.s.r + 12);
  let best: { index: number; headers: string[]; score: number } | null = null;

  for (let r = range.s.r; r <= scanUntil; r += 1) {
    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      headers.push(normalizeHeader(cell?.v));
    }
    const score = Math.max(scoreHeaders(headers, "alloca"), scoreHeaders(headers, "intelipost"));
    if (score > (best?.score ?? 0)) best = { index: r, headers, score };
  }

  if (!best || best.score < 3) return null;

  const rows: RawRow[] = [];
  for (let r = best.index + 1; r <= range.e.r; r += 1) {
    const row: RawRow = {};
    let filled = 0;
    best.headers.forEach((header, offset) => {
      if (!header) return;
      const cell = sheet[XLSX.utils.encode_cell({ r, c: range.s.c + offset })];
      const value = cellValue(cell);
      if (value != null) filled += 1;
      if (value != null || !(header in row)) row[header] = value;
    });
    if (filled > 0) rows.push(row);
  }

  return { headerIndex: best.index, headers: best.headers, rows };
}

export function detectKind(headers: string[]): SourceKind | null {
  const alloca = scoreHeaders(headers, "alloca");
  const intel = scoreHeaders(headers, "intelipost");
  if (alloca === 0 && intel === 0) return null;
  if (alloca === intel) {
    return headers.includes("tp previsao") ? "alloca" : "intelipost";
  }
  return alloca > intel ? "alloca" : "intelipost";
}

export function parseWorkbook(buffer: ArrayBuffer): ParsedSheet[] {
  // Em CSV e .xls em HTML o SheetJS leria "01/10/2026" como mês/dia; raw mantém o texto para o readDate (dia/mês).
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: true });
  const found: ParsedSheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const parsed = sheetRows(sheet);
    if (!parsed) continue;
    const kind = detectKind(parsed.headers);
    if (!kind) continue;
    found.push({ kind, sheetName, rows: parsed.rows });
  }

  return found;
}

export function pickSheet(sheets: ParsedSheet[], preferred: SourceKind): ParsedSheet | null {
  return (
    sheets.find((sheet) => sheet.kind === preferred) ??
    (sheets.length === 1 ? sheets[0] : null)
  );
}

export function readText(row: RawRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value == null || value === "") continue;
    if (value instanceof Date) continue;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) continue;
      return Number.isInteger(value) ? String(value) : String(value);
    }
    return String(value).trim();
  }
  return "";
}

export function readDate(row: RawRow, ...keys: string[]): Date | null {
  for (const key of keys) {
    const value = row[key];
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "number" && value > 20000 && value < 80000) {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
    }
    if (typeof value === "string" && value.trim()) {
      const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
      if (match) {
        const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
        const [hora, minuto, segundo] = [match[4], match[5], match[6]].map((v) => Number(v ?? 0));
        return new Date(year, Number(match[2]) - 1, Number(match[1]), hora, minuto, segundo);
      }
      const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
      if (iso) {
        const [, y, m, d, hh, mm, ss] = iso.map((v) => Number(v ?? 0));
        return new Date(y, m - 1, d, hh, mm, ss);
      }
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return null;
}

export function notaFiscal(value: CellValue): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) return "";
  const raw = typeof value === "number" ? String(Math.trunc(value)) : String(value).trim();
  if (!raw || raw.toLowerCase() === "nan") return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  const trimmed = digits.replace(/^0+/, "");
  return trimmed || "0";
}
