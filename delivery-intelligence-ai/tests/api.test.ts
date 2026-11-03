import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultFilters } from '../lib/data';
vi.mock('server-only',()=>({}));
import { handleAI } from '../lib/ai';
function request(body: unknown = {message:'Prioridades?',filters:defaultFilters}) { return new Request('http://localhost/api/ai/insights',{method:'POST',body:JSON.stringify(body)}); }
describe('API Claude (fetch simulado)', () => {
  beforeEach(()=>{ vi.stubEnv('ANTHROPIC_API_KEY','test-secret'); vi.stubEnv('UPSTASH_REDIS_REST_URL',''); vi.stubEnv('UPSTASH_REDIS_REST_TOKEN',''); });
  afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
  it('retorna 503 sem chave sem chamar o provedor', async()=>{vi.stubEnv('ANTHROPIC_API_KEY','');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);expect((await handleAI(request())).status).toBe(503);expect(fetch).not.toHaveBeenCalled();});
  it('rejeita entrada inválida e origem externa',async()=>{expect((await handleAI(request({message:'',filters:defaultFilters}))).status).toBe(400);const req=request();req.headers.set('origin','https://evil.example');expect((await handleAI(req)).status).toBe(403);});
  it('rejeita corpo excessivo e JSON malformado',async()=>{expect((await handleAI(request({message:'x'.repeat(9000)}))).status).toBe(413);expect((await handleAI(new Request('http://localhost/api',{method:'POST',body:'{'}))).status).toBe(400);});
  it('envia métricas recalculadas e retorna texto, modelo e uso',async()=>{const fetch=vi.fn().mockResolvedValue(Response.json({id:'msg_test',model:'model_test',content:[{type:'text',text:'Análise de teste'}],usage:{input_tokens:10,output_tokens:5}}));vi.stubGlobal('fetch',fetch);const response=await handleAI(request());const data=await response.json();expect(response.status).toBe(200);expect(data.text).toBe('Análise de teste');expect(JSON.stringify(data)).not.toContain('test-secret');const sent=JSON.parse(fetch.mock.calls[0][1].body);expect(JSON.parse(sent.messages[0].content).metricas.orders).toBeGreaterThan(0);});
  it.each([401,402,404,429,500])('trata erro %i sem vazar detalhes',async status=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('sensitive provider details',{status})));const response=await handleAI(request());expect(response.status).toBe(status===429?429:502);expect(await response.text()).not.toContain('sensitive');});
  it('trata falha de rede',async()=>{vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('secret')));expect((await handleAI(request())).status).toBe(503);});
  it('aplica limite compartilhado antes de chamar Claude',async()=>{vi.stubEnv('UPSTASH_REDIS_REST_URL','https://redis.example');vi.stubEnv('UPSTASH_REDIS_REST_TOKEN','redis-secret');const fetch=vi.fn().mockResolvedValue(Response.json([{result:31},{result:1}]));vi.stubGlobal('fetch',fetch);expect((await handleAI(request())).status).toBe(429);expect(fetch).toHaveBeenCalledTimes(1);});
});
