import { describe, expect, it } from 'vitest';
import { analytics, defaultFilters, generateOrders, orders, parseFilters, selectOrders, summarize, Order } from '../lib/data';
describe('métricas e recortes', () => {
  it('reproduz exatamente a base e os identificadores', () => { expect(generateOrders()).toEqual(orders); expect(new Set(orders.map(o=>o.id)).size).toBe(orders.length); });
  it('exclui cancelados do GMV, ticket e tempo', () => {
    const base: Order[] = [{id:'a',date:'2026-10-01',restaurantId:'r1',value:10.1,status:'delivered',minutes:20,reason:null},{id:'b',date:'2026-10-01',restaurantId:'r1',value:20.2,status:'delivered',minutes:40,reason:null},{id:'c',date:'2026-10-01',restaurantId:'r1',value:100,status:'cancelled',minutes:99,reason:'Atraso'}];
    const result = summarize(base);
    expect(result).toMatchObject({orders:3,delivered:2,cancelled:1,gmv:30.3,averageMinutes:30,ticket:15.15});
    expect(result.cancellationRate).toBeCloseTo(33.333333, 5);
  });
  it('lida com recorte vazio sem NaN', () => { expect(summarize([])).toEqual({orders:0,delivered:0,cancelled:0,gmv:0,cancellationRate:0,averageMinutes:0,ticket:0}); });
  it('aplica datas inclusivas, cidade e restaurante juntos', () => { const f = {...defaultFilters,start:'2026-10-02',end:'2026-10-02',city:'Santos',restaurant:'r5'}; const rows=selectOrders(f); expect(rows.length).toBeGreaterThan(0); expect(rows.every(o=>o.date==='2026-10-02'&&o.restaurantId==='r5')).toBe(true); });
  it('concilia totais diários, restaurantes e motivos', () => { const a=analytics(defaultFilters); expect(a.daily.reduce((s,d)=>s+d.orders,0)).toBe(a.orders); expect(a.ranking.reduce((s,d)=>s+d.cancelled,0)).toBe(a.cancelled); expect(a.reasons.reduce((s,d)=>s+d.count,0)).toBe(a.cancelled); });
  it.each([{...defaultFilters,start:'2026-10-31'},{...defaultFilters,start:'2026-10-20',end:'2026-10-01'},{...defaultFilters,city:'Recife'},{...defaultFilters,city:'Santos',restaurant:'r1'},null])('rejeita filtro inválido %j', f => expect(parseFilters(f)).toBeNull());
});
