const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';

const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function businessToday(now = new Date()): string {
  return formatoDia.format(now);
}

export function isCurrentBusinessDay(iso: string | null | undefined, now = new Date()): boolean {
  if (!iso) return false;
  return iso.slice(0, 10) >= businessToday(now);
}

export function calendarKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isCurrentBusinessDate(date: Date | null | undefined, now = new Date()): boolean {
  if (!date || Number.isNaN(date.getTime())) return false;
  return calendarKey(date) >= businessToday(now);
}

export function localDateTimeKey(date: Date | null | undefined): string | undefined {
  if (!date || Number.isNaN(date.getTime())) return undefined;
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${calendarKey(date)}T${hours}:${minutes}`;
}

export function formatNoteDate(value: string | null | undefined): string {
  if (!value) return '—';
  const [day, time] = value.split('T');
  const [year, month, dayOfMonth] = day.split('-');
  if (!year || !month || !dayOfMonth) return value;
  const date = `${dayOfMonth}/${month}/${year}`;
  return time && time !== '00:00' ? `${date} ${time}` : date;
}

export function noonIso(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '2026-01-01T12:00:00.000Z';
  return `${calendarKey(date)}T12:00:00.000Z`;
}
