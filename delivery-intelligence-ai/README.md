# Delivery Intelligence AI

Copiloto de operações de delivery para portfólio AI Builder. Projeto independente, sem vínculo com iFood. Dados 100% sintéticos; não representam operações reais.

## Executar

Requer Node.js 20.9+ e npm (recomendado Node 24 LTS).

```sh
npm ci
cp .env.example .env.local
npm run dev
```

No PowerShell, use `Copy-Item .env.example .env.local`. Abra http://localhost:3000. O dashboard funciona sem chave. Para usar a IA, configure **apenas no servidor** `ANTHROPIC_API_KEY` em `.env.local`; não use prefixo `NEXT_PUBLIC_`. Configure `ANTHROPIC_MODEL` com um modelo disponível na sua conta (padrão `claude-sonnet-5-5`). A assinatura do aplicativo Claude não substitui os créditos da API. Não envie a chave ao GitHub.

```sh
npm test
npm run typecheck
npm run build
npm start
```

## Funcionalidades

- Dashboard responsivo em português com datas inclusivas, cidade e restaurante. Trocar cidade limpa o restaurante selecionado.
- Pedidos, GMV realizado, taxa de cancelamento, tempo de entrega e ticket; ranking, gráfico diário com tabela acessível e motivos de cancelamento.
- Exportação CSV do ranking filtrado; estados de carregamento, entrada inválida e falha de IA.
- `components/dashboard/dashboard.tsx` exporta `Dashboard`, resolvendo o caminho `@/components/dashboard/dashboard` usado por `app/page.tsx`.
- `POST /api/ai/insights` e `/api/ai/chat` usam o mesmo contrato: `{ "message": "Quais ações priorizar?", "filters": { "start": "2026-10-01", "end": "2026-10-30", "city": "all", "restaurant": "all" } }`.
- Sucesso: `{ ok: true, text, model, id, usage, filters }`. Falha: `{ ok: false, error }` com status HTTP apropriado. Não são retornadas respostas falsas quando a API falha.

## Metodologia

A base é gerada por fórmulas inteiras, sem `Math.random()` nem data atual: seis restaurantes, três cidades, 01–30/10/2026. Cada pedido tem ID único. O padrão de atrasos/cancelamentos de Maré Burgers é intencional para exploração. Isso não estabelece causalidade.

- Pedidos: todos os status.
- GMV realizado: soma em centavos do valor dos **entregues**; não é receita líquida nem lucro.
- Cancelamento: cancelados / total × 100.
- Tempo médio e ticket: somente entregues. Recortes vazios retornam zero.
- Não exibimos variações históricas, pois a base cobre apenas um mês.

Filtros são validados no servidor; o backend recalcula as métricas e não aceita números enviados pelo navegador. Claude recebe agregados sintéticos, sem dados pessoais. Interpreta evidências e recomenda ações; não executa ações. A resposta é texto renderizado pelo React, sem HTML injetado. Ao mudar o recorte, uma análise anterior é descartada.

## Segurança e limites

A integração usa a API Messages da Anthropic via `fetch`, isolada em módulo `server-only`, timeout de 45s e limite de corpo de 8 KiB / pergunta de 1.000 caracteres. Erros do provedor não expõem detalhes internos. Há validação de origem quando informada; isso não substitui autenticação.

O orçamento global é de 30 tentativas de análise por hora. Sem Redis, o contador reside em memória **por processo**: pode reiniciar e não coordena instâncias serverless. Para deploy público com IA, configure `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` (API Redis REST com suporte a pipeline) para compartilhar o limite. Falhas do Redis bloqueiam a análise. O limite global protege custos de forma básica, mas não garante disponibilidade por usuário. Configure também orçamento no provedor e proteção de acesso da Vercel se necessário. Sem credenciais Redis, o dashboard funciona, mas o limite local não é uma proteção suficiente contra abuso distribuído.

Não foi possível recuperar o repositório original: nenhum link ou checkout estava disponível. Esta entrega recria os caminhos e a integração server-side descritos na conversa; não afirma preservar código original que não foi inspecionado.

## Publicar na Vercel

1. Envie o conteúdo desta pasta a um repositório GitHub (não envie `.env.local`, `node_modules` ou `.next`).
2. Na Vercel, escolha **Add New → Project**, importe o repositório e selecione o preset Next.js. Se esta pasta estiver dentro de outro projeto, configure-a como Root Directory.
3. Em Environment Variables, adicione `ANTHROPIC_API_KEY` e `ANTHROPIC_MODEL`. Se desejar IA pública, configure também as duas variáveis Redis. Selecione os ambientes desejados.
4. Publique. O comando de build é `npm run build`; a Vercel detecta Next.js. Ao alterar variáveis, faça novo deploy.
5. Abra o dashboard, teste os filtros e gere uma análise. Uma resposta real inclui modelo, ID e tokens. Sem chave, espere 503 com mensagem de configuração; não interprete esse resultado como teste bem-sucedido do Claude.

Alternativa pela CLI autenticada: `npx vercel` para preview e `npx vercel --prod` para produção. Este projeto não depende do v0.

## Arquitetura e testes

### Orquestração de agentes (03/11/2026)

O copiloto agora chama `POST /api/ai/orchestrate`, com o mesmo corpo das outras rotas. As rotas chat/insights preservam a análise simples.

1. Coordenador Claude recebe pergunta e filtros e escolhe um ou ambos os especialistas por chamadas de ferramentas (`tool_use`).
2. Especialista em indicadores recebe métricas recalculadas do recorte. Especialista em procedimentos recebe três guias locais sintéticos, com IDs de referência.
3. O servidor devolve cada resultado no bloco `tool_result` correspondente. O coordenador sintetiza sem permissão para novas ferramentas.
4. A interface permite expandir o registro de agentes, IDs do provedor, modelos e fontes disponibilizadas. Tokens são somados para todas as chamadas.

São 3 ou 4 chamadas de modelo por análise, com prazo total de 45 segundos, máximo de dois especialistas, uma chamada por especialista e validação do plano antes da execução. Não há execução de comandos, edição de arquivos ou envio de mensagens. Falhas e respostas truncadas interrompem a análise. O limite global de 30 análises/hora equivale a até 120 chamadas/hora nesta modalidade; configure orçamento de API e Redis antes de exposição pública.

Os especialistas usam o mesmo modelo, mas têm instruções e contextos separados. São executados em sequência após a escolha dinâmica do coordenador. A base de procedimentos é fornecida integralmente por ser pequena: **não há busca vetorial/RAG implementada neste projeto**. Não confundir os guias demonstrativos com procedimentos de uma empresa real.

Para demonstrar, pergunte “Quais restaurantes têm maior taxa de cancelamento?” e depois “Como investigar e reduzir atrasos sem inventar causas?”. Expanda o rastreio e confira quais especialistas foram escolhidos. A escolha é feita pelo modelo; não há regra fixa por palavra-chave. Sem chave, a rota retorna 503, sem simular uma execução.

Validação automatizada usa respostas simuladas, inclusive para testar seleção, delegação, combinação e limites. **A execução real com Claude permanece a validar com uma chave configurada; não foi publicada nesta entrega.**

`app/` contém páginas e rotas; `components/dashboard/` contém a UI; `lib/data.ts` centraliza dados, filtros e cálculos; `lib/ai.ts` concentra integração e limite. Os testes Vitest validam conciliação de métricas, filtros combinados, erros de entrada, tratamento de erros do provedor, contrato da resposta e interação da interface. Chamadas externas nos testes são **simuladas**. Veja `VALIDACAO.md` para resultados executados nesta entrega.

## Roteiro para apresentação

1. Explique o problema: priorizar riscos em operações de delivery.
2. Filtre Santos e observe cancelamentos e tempo médio de Maré Burgers.
3. Mostre a tabela diária e exporte o ranking para verificar os cálculos.
4. Com a API configurada, peça três ações e separe evidência de hipótese.
5. Explique as decisões: dados determinísticos, cálculos fora do modelo, chave server-side e avaliação com testes. Próximas evoluções: dados reais autorizados, autenticação, avaliação de qualidade de insights e automações com aprovação humana.

## Referências oficiais

- https://nextjs.org/docs/app/getting-started/installation
- https://platform.claude.com/docs/en/models/overview
- https://platform.claude.com/docs/en/api/messages
- https://vercel.com/docs/environment-variables
- https://vercel.com/docs/projects/deploy-from-cli
