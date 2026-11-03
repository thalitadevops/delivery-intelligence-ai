import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultFilters } from '../lib/data';
import { orchestrate } from '../lib/orchestration';
import { handleAI } from '../lib/ai';

const tool = (name = 'consultar_analista', id = 'tool_1', input: unknown = {foco:'Cancelamentos'}) => ({type:'tool_use',name,id,input});
const reply = (content: unknown[], stop_reason = 'end_turn', id = 'msg_1') => Response.json({id,model:'test-claude',content,stop_reason,usage:{input_tokens:10,output_tokens:5}});
const text = (value: string) => ({type:'text',text:value});
beforeEach(()=>{vi.stubEnv('ANTHROPIC_API_KEY','secret-test');vi.stubEnv('UPSTASH_REDIS_REST_URL','');vi.stubEnv('UPSTASH_REDIS_REST_TOKEN','');});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('orquestração com provedor simulado',()=>{
  it.each([
    {status:401,message:'private diagnostic',code:'INVALID_API_KEY'},
    {status:400,message:'Your credit balance is too low',code:'API_CREDITS_REQUIRED'},
    {status:404,message:'private model diagnostic',code:'MODEL_UNAVAILABLE'},
    {status:400,message:'tool_choice is not supported',code:'PROVIDER_REQUEST_REJECTED'},
  ])('identifica configuração sem vazar detalhes: $code',async({status,message,code})=>{
    vi.spyOn(console,'error').mockImplementation(()=>{});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({error:{message}},{status})));
    const response=await handleAI(new Request('http://localhost/api/ai/orchestrate',{method:'POST',body:JSON.stringify({message:'Pergunta',filters:defaultFilters})}),true);
    const body=await response.json();expect(body.code).toBe(code);expect(JSON.stringify(body)).not.toContain(message);expect(JSON.stringify(body)).not.toContain('secret-test');
  });
  it('bloqueia o endpoint sem chave antes de qualquer chamada',async()=>{
    vi.stubEnv('ANTHROPIC_API_KEY','');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const response=await handleAI(new Request('http://localhost/api/ai/orchestrate',{method:'POST',body:JSON.stringify({message:'Pergunta',filters:defaultFilters})}),true);expect(response.status).toBe(503);expect(fetch).not.toHaveBeenCalled();
  });
  it('delega aos dois especialistas, devolve tool_results e agrega uso e rastreio',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(reply([tool(),tool('consultar_procedimentos','tool_2')],'tool_use','route')).mockResolvedValueOnce(reply([text('Métricas analisadas')],'end_turn','analyst')).mockResolvedValueOnce(reply([text('Guia cancelamentos')],'end_turn','guide')).mockResolvedValueOnce(reply([text('Priorize investigação')],'end_turn','final'));
    vi.stubGlobal('fetch',fetch);
    const result=await orchestrate('Como reduzir cancelamentos?',defaultFilters);
    expect(result.calls).toBe(4);expect(result.usage).toEqual({input_tokens:40,output_tokens:20});expect(result.trace.map(t=>t.id)).toEqual(['route','analyst','guide','final']);
    const payloads=fetch.mock.calls.map(c=>JSON.parse(c[1].body));
    expect(payloads[0].tool_choice.type).toBe('auto');expect(payloads.every(p=>p.max_tokens===4096)).toBe(true);expect(payloads.every(p=>!['any','tool'].includes(p.tool_choice?.type))).toBe(true);expect(payloads[3].tool_choice.type).toBe('none');expect(payloads[1].tools).toBeUndefined();
    const evidence=JSON.parse(payloads[1].messages[0].content).evidencias;expect(evidence.orders).toBeGreaterThan(0);
    expect(JSON.parse(payloads[2].messages[0].content).evidencias[0].id).toBe('cancelamentos');
    expect(payloads[3].messages[2].content.map((r:{tool_use_id:string})=>r.tool_use_id)).toEqual(['tool_1','tool_2']);
    expect(JSON.stringify(result)).not.toContain('secret-test');
    expect(new Set(fetch.mock.calls.map(c=>c[1].signal)).size).toBe(1);
  });
  it('permite consultar apenas um especialista',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(reply([tool('consultar_procedimentos')],'tool_use')).mockResolvedValueOnce(reply([text('Procedimentos')])).mockResolvedValueOnce(reply([text('Síntese')]));vi.stubGlobal('fetch',fetch);
    const result=await orchestrate('Como investigar atrasos?',defaultFilters);expect(result.calls).toBe(3);expect(result.trace[1].agent).toContain('procedimentos');
  });
  it.each([[tool('executar_comando')],[tool(),tool()],[tool('consultar_analista','x',{foco:'ok',comando:'rm'})],[tool('consultar_analista','x',{foco:''})],[]].map(plan=>({plan})))('bloqueia plano inválido antes de executar especialistas %j',async({plan})=>{
    const fetch=vi.fn().mockResolvedValue(reply(plan,'tool_use'));vi.stubGlobal('fetch',fetch);await expect(orchestrate('Pergunta',defaultFilters)).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('bloqueia resposta truncada e não inicia síntese',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(reply([tool()],'tool_use')).mockResolvedValueOnce(reply([text('Incompleto')],'max_tokens'));vi.stubGlobal('fetch',fetch);await expect(orchestrate('Pergunta',defaultFilters)).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('retorna erro genérico quando um especialista falha',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(reply([tool()],'tool_use')).mockResolvedValueOnce(new Response('sensitive',{status:429}));vi.stubGlobal('fetch',fetch);
    const response=await handleAI(new Request('http://localhost/api/ai/orchestrate',{method:'POST',body:JSON.stringify({message:'Pergunta',filters:defaultFilters})}),true);expect(response.status).toBe(429);expect(await response.text()).not.toContain('sensitive');
  });
  it('não executa ferramentas pedidas na síntese final',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(reply([tool()],'tool_use')).mockResolvedValueOnce(reply([text('Indicadores')])).mockResolvedValueOnce(reply([tool()],'tool_use'));vi.stubGlobal('fetch',fetch);await expect(orchestrate('Pergunta',defaultFilters)).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(3);
  });
});
