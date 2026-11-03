export const cities = ['São Paulo', 'Campinas', 'Santos'] as const;
export const restaurants = [
  { id: 'r1', name: 'Brasa & Cia', city: 'São Paulo', category: 'Brasileira' },
  { id: 'r2', name: 'Nori House', city: 'São Paulo', category: 'Japonesa' },
  { id: 'r3', name: 'Verde Bowl', city: 'Campinas', category: 'Saudável' },
  { id: 'r4', name: 'Forno da Vila', city: 'Campinas', category: 'Pizza' },
  { id: 'r5', name: 'Maré Burgers', city: 'Santos', category: 'Lanches' },
  { id: 'r6', name: 'Casa do Prato', city: 'Santos', category: 'Brasileira' },
];
export type Order = { id: string; date: string; restaurantId: string; value: number; status: 'delivered' | 'cancelled'; minutes: number; reason: string | null };
export type Filters = { start: string; end: string; city: string; restaurant: string };
export const defaultFilters: Filters = { start: '2026-10-01', end: '2026-10-30', city: 'all', restaurant: 'all' };
export function generateOrders(): Order[] {
  const rows: Order[] = [];
  for (let day = 1; day <= 30; day++) for (let r = 0; r < restaurants.length; r++) {
    const count = 18 + ((day * 7 + r * 11) % 25);
    for (let i = 0; i < count; i++) {
      const n = day * 137 + r * 53 + i * 29;
      const cancelled = n % 100 < (r === 4 ? 12 : 5);
      rows.push({ id: `D${day}R${r}O${i}`, date: `2026-10-${String(day).padStart(2, '0')}`, restaurantId: restaurants[r].id, value: (2500 + n % 9000) / 100, status: cancelled ? 'cancelled' : 'delivered', minutes: 22 + n % 31 + (r === 4 ? 12 : 0), reason: cancelled ? ['Atraso', 'Indisponibilidade', 'Desistência'][n % 3] : null });
    }
  }
  return rows;
}
export const orders = generateOrders();
export function selectOrders(filters: Filters, source = orders) {
  const ids = new Set(restaurants.filter(r => (filters.city === 'all' || r.city === filters.city) && (filters.restaurant === 'all' || r.id === filters.restaurant)).map(r => r.id));
  return source.filter(o => o.date >= filters.start && o.date <= filters.end && ids.has(o.restaurantId));
}
export function summarize(rows: Order[]) {
  const delivered = rows.filter(o => o.status === 'delivered');
  const cancelled = rows.length - delivered.length;
  const gmv = delivered.reduce((s, o) => s + Math.round(o.value * 100), 0) / 100;
  return { orders: rows.length, delivered: delivered.length, cancelled, gmv, cancellationRate: rows.length ? cancelled / rows.length * 100 : 0, averageMinutes: delivered.length ? delivered.reduce((s, o) => s + o.minutes, 0) / delivered.length : 0, ticket: delivered.length ? gmv / delivered.length : 0 };
}
export function analytics(filters: Filters) {
  const rows = selectOrders(filters);
  const daily = [...new Set(rows.map(o => o.date))].sort().map(date => ({ date, ...summarize(rows.filter(o => o.date === date)) }));
  const ranking = restaurants.map(r => ({ ...r, ...summarize(rows.filter(o => o.restaurantId === r.id)) })).filter(r => r.orders > 0).sort((a,b) => b.gmv - a.gmv);
  const reasons = ['Atraso', 'Indisponibilidade', 'Desistência'].map(reason => ({ reason, count: rows.filter(o => o.reason === reason).length }));
  return { ...summarize(rows), daily, ranking, reasons };
}
export function parseFilters(value: unknown): Filters | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const f = value as Record<string, unknown>;
  const validDate = (v: unknown): v is string => typeof v === 'string' && /^2026-10-(0[1-9]|[12][0-9]|30)$/.test(v);
  if (!validDate(f.start) || !validDate(f.end) || f.start > f.end || typeof f.city !== 'string' || !['all', ...cities].includes(f.city) || typeof f.restaurant !== 'string' || !['all', ...restaurants.map(r=>r.id)].includes(f.restaurant)) return null;
  if (f.restaurant !== 'all' && f.city !== 'all' && !restaurants.some(r => r.id === f.restaurant && r.city === f.city)) return null;
  return { start: f.start, end: f.end, city: f.city, restaurant: f.restaurant };
}
