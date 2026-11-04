# Torre de Controle (ArkTransp) · Arklok

SPA estática que cruza planilhas da logística (Alloca07/Protheus, Intelipost, SPfly, Jamef, Certex, expedição) no navegador:
entregas, SLA, reentregas, ocorrências. Sem servidor, sem API, sem login: o usuário arrasta .xlsx/.csv e tudo fica em
localStorage/IndexedDB da máquina dele. Deploy na Vercel (`npm run build`, publica `dist/`).

## Stack
- React 19.1 + TypeScript 5.8 (strict, `noUnusedLocals`/`noUnusedParameters`) + Vite 6.3 (`@vitejs/plugin-react` 4.5)
- SheetJS `xlsx` 0.20.3, instalado do tarball em cdn.sheetjs.com (não é do registry npm)
- CSS próprio, sem framework. Únicas deps de runtime: `react`, `react-dom`, `xlsx`. Node 20+.

## Comandos
- `npm run dev`: Vite em http://localhost:5173 (só localhost)
- `npm run build`: `vite build` (NÃO checa tipos)
- `npm run typecheck`: `tsc -b` (app + vite.config.ts)
- `npm run preview`: serve `dist/`
- Não existe lint, ESLint, Prettier nem testes. Não invente `npm test`/`npm run lint`.

## Estrutura (o que não é óbvio)
- `src/App.tsx`: tabela de rotas (if/else por `path.startsWith`). `/apresentacao` roda fora do `AppLayout`.
- `src/router/useRouter.ts`: roteador próprio por hash (`#/entregas?view=lista`), com `navigate(path, search)`
  e breadcrumbs. `src/router/secao.ts` decide dashboard × lista pela query.
  Rota nova = `App.tsx` + breadcrumbs em `useRouter.ts` + item em `components/layout/MenuTopo.tsx`.
- `src/services/`: TODA a regra de negócio, importadores de planilha e stores. Telas só leem e chamam.
  - `*Import.ts`: lê arquivo com SheetJS, acha aba/cabeçalho por nome normalizado (`normalizeHeader` em `src/parse.ts`),
    grava no storage e notifica.
  - `importacoes.ts`: ponto de entrada de upload por fonte (`prepararImportacao`) e histórico de execuções.
  - `integrationService.ts`: base do cruzamento Alloca07 × Intelipost (IndexedDB). `bancoDiario.ts`: banco acumulado
    por dia/mês (IndexedDB). `diaAtivo.ts`: "Hoje" × dia histórico (somente leitura).
- `src/parse.ts`, `src/reconcile.ts`: leitura genérica de planilha e cruzamento de NFs.
- `src/types/index.ts`: tipos compartilhados. Tipos de um serviço ficam no próprio serviço (ex.: `EntregasState`).
- `src/ui/componentes.tsx` + `src/ui/ui.css`: kit novo (`Pagina`, `Cabecalho`, `Kpi`, `Painel`, `Modal`, `Botao`,
  `Filtro`, `Tag`, `Barras`...). Tela nova ou migrada usa só isso + classes `ui-*`.
- `src/styles.css` (~10k linhas): tokens (`:root`, `[data-theme="dark"]`) e CSS legado das telas não migradas.
- `src/components/{layout,common,torre,charts,entregas}`: por domínio. Hooks em `src/hooks/`, helpers puros em `src/utils/`.
- `database/schema.sql`: proposta de Postgres futura. NÃO é usada pelo app.
- `docs/`: documentação para TI/negócio. Parte está desatualizada (descreve Zendesk/Integrações).

## Convenções
- Código, nomes, comentários e textos de UI em português (`definirDiaAtivo`, `bloquearSeHistorico`, `EstadoVazio`).
  Alguns nomes legados em inglês (`Integration`, `DashboardPage`): não renomeie por conta própria.
- Só named exports (`export const X: React.FC<...>` ou `export function`). Nenhum `export default`.
- Imports relativos (`../services/...`), sem alias. Aspas simples (exceções: `main.tsx`, `parse.ts`, `reconcile.ts`).
- Estado global: `useApp()` de `src/context/AppContext.tsx` para tema, filtros, toasts, upload.
  Dados das planilhas: store módulo-level com `listeners` + `useSyncExternalStore` (modelo: `services/diaAtivo.ts`).
  Não adicione Redux/Zustand/React Query.
- Persistência: chaves `localStorage` prefixadas `arklok_` e versionadas (`_v1`). Base grande vai para IndexedDB.
  `setItem` pode estourar a cota: envolva em try/catch e relance a mensagem de "Verificar banco" (ver `entregasImport.ts`).
- Erros: serviço lança `new Error('mensagem pronta para o usuário, em PT')`; a tela captura e mostra
  `addToast('error', título, mensagem)` (helper `mensagemDeErro` em `services/importacoes.ts`).
- Escrita de dados: chame `bloquearSeHistorico()` antes de alterar algo (dia histórico é somente leitura).
- Cálculos pesados: memoize com `utils/memoUltimo.ts`.
- Datas de negócio: use `utils/businessDay.ts` e `utils/periodo.ts` (ISO local `AAAA-MM-DD`), não `toISOString()` cru.

## UI
- Antes de mudar UI, leia `.cursor/skills/torre-front/SKILL.md` (Claude Code não carrega `.cursor/skills` sozinho).
  Ela aponta para `frontend-design`, `ui-ux-pro-max`, `ui-styling` em `.cursor/skills/`. As referências a `ui-design` e
  `web-design-guidelines` não existem no repo: ignore.
- Reuse tokens (`--arklok-red`, `--bg-card`, `--text-primary`, `--status-success|warning|danger|info`, `--space-*`).
  Nada de cor hex solta em tela nova. Funcionar nos temas claro e escuro (`data-theme` no `<html>`).
- Listas de trabalho: só scroll vertical. Foco visível, `prefers-reduced-motion`. Texto em sentence case.
- `body` usa `zoom: var(--escala)` em telas ≥2200px: altura de tela é `var(--tela-altura)`, não `100vh`.

## Verificação antes de dizer "pronto"
1. `npm run typecheck` (obrigatório: o build não pega erro de tipo; variável/param não usado quebra).
2. `npm run build`.
3. Mudou tela: `npm run dev` e confira a rota no navegador, nos dois temas.
Se `node_modules` não existir, avise em vez de afirmar que passou.

## Armadilhas
- CSP em `vite.config.ts` (meta injetada): produção só permite `'self'`. Fetch externo, CDN, Google Fonts, script
  inline e `eval` são bloqueados. O app não deve chamar nenhuma rede: não adicione.
- O script inline de tema em `index.html` é bloqueado pela CSP de produção (só funciona no dev), e o padrão dele
  (`dark`) difere do `AppContext` (`light`).
- Código morto ainda compilado pelo `tsc`: `pages/Integration*`, `pages/Zendesk*`, `pages/IntelipostDesatualizadaPage`,
  `components/common/{CompararFontesPanel,ImportacaoModal,NewIntegrationModal,SpotlightModal}`,
  `utils/memoCompartilhado.ts`. Sem rota em `App.tsx`. README diz que Zendesk/Intelipost/Integrações saíram.
  Não reative nem apague sem pedido; não use como modelo.
- `Integration` (em `types/index.ts`) hoje representa uma NF do cruzamento, não uma "integração" de sistema.
- `services/mockData.ts` ainda semeia logs/execuções falsos via `integrationService`.
- Mudar formato salvo exige nova chave/versão ou migração: dados antigos já estão no navegador dos usuários.
- Watcher do Vite ignora `*.xlsx/*.xls/*.csv`, `docs/`, `database/`, `.cursor/` (Windows dá EBUSY).
- `npm install` precisa de acesso a cdn.sheetjs.com.

## Não fazer
- Não trocar/adicionar stack: nada de Next, Tailwind, shadcn CLI, Radix, Lucide, router ou lib de estado.
- Não adicionar backend, API, telemetria ou dependência de runtime sem pedido explícito.
- Não commitar planilhas reais (.xlsx/.csv com dados de clientes) nem `.env`.
- Não editar `.cursor/` nem `package-lock.json` à mão.
