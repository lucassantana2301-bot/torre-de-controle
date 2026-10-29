# ArkTransp — como é o front hoje, tela por tela

> Descrição do que o usuário vê hoje em cada tela, com os textos reais da interface. Serve de base para propor um
> redesenho. Regras de negócio e dados disponíveis estão em `RESUMO_PARA_NOVOS_FRONTS.md`.

## Contexto rápido

- **O que é:** ferramenta interna da logística da Arklok. Acompanha a NF da emissão (Alloca07) até a entrega pela
  transportadora (SPfly, Jamef, Certex, Frota interna, Lalamove) e o fechamento do ticket no Zendesk.
- **Usuário:** analistas de Operações/Logística, uso diário, desktop (tem versão mobile básica).
- **Entrada de dados:** só por planilhas arrastadas para o app. Não há login nem servidor.
- **Idioma:** português do Brasil. Números em formato pt-BR (1.234; 95,3%). Datas dd/mm/aaaa.
- **Identidade:** vermelho Arklok `#da291c`, tema claro e escuro (padrão escuro). Verde = ok, amarelo = atenção,
  vermelho = problema, azul/cinza = informação.
- **Stack:** React + TypeScript, CSS próprio (sem biblioteca de componentes).

---

## 1. Estrutura geral (presente em todas as telas)

### Layout

- Menu lateral à esquerda; à direita, cabeçalho fixo, um banner opcional e o conteúdo.
- Topo do menu: faixa vermelha com o logo "Arklok" | "ArkTransp" (leva ao Início) e botão de recolher (Ctrl/⌘+B).
- Títulos das páginas em vermelho, sobre uma linha vermelha de 2px. Padrão de cabeçalho de página: **eyebrow**
  (texto pequeno acima), **título** e **subtítulo**.
- **Banner de dia antigo** (quando o usuário está vendo um dia salvo): "Você está vendo os dados de dd/mm/aaaa.
  Somente leitura: para enviar planilhas ou alterar tratativas, volte para hoje." + botão "Voltar para hoje".
- **Notificações (toasts)** no canto inferior direito: ícone por tipo, título, mensagem e "×".

### Menu lateral

Grupos e itens (cada item tem ícone e dica ao passar o mouse; contadores coloridos ao lado):

| Grupo | Item | Subitens (cor do contador) |
|---|---|---|
| Rotina | **Início** | — |
| Operação | **Integrações de NF** (contador amarelo de não integradas) | Todas (cinza), Integradas (verde), Não integradas (amarelo), Só Intelipost (vermelho) |
| Operação | **Baixa Zendesk** (contador verde de prontos para baixa) | Todos, Prontos para baixa (verde), Com NF (verde), Sem NF (amarelo), Fora da planilha (vermelho) |
| Operação | **Entregas** | Todos, Todas entregues (verde), Parte entregue, Não entregues (amarelo), Frota / Lalamove, Não encontradas (vermelho) |
| Indicadores | **Painel de SLA** | — |
| Indicadores | **Relatórios** | — |
| (separado) | **Configurações** | Geral, Como funciona |

- Itens com subitens têm seta para abrir/fechar; o estado fica salvo. O contador do pai só aparece com os subitens
  fechados.
- Sem a planilha necessária, os subitens ficam desativados mostrando "—".
- **Recolhido:** só ícones, com um ponto colorido quando há contador.
- **Celular (até 768px):** o menu desliza da esquerda (280px) sobre fundo escurecido.

### Cabeçalho (da esquerda para a direita)

1. Botão ☰ (só no celular).
2. **Breadcrumbs** separados por "/", sempre começando em "Início" (ex.: Início / Baixa Zendesk / Fora da planilha).
3. **Busca global** no centro: placeholder "Buscar NF, ticket ou cliente", atalho "Ctrl K".
   - A partir de 2 caracteres abre uma lista agrupada: **Notas** (até 5, leva ao detalhe da NF), **Tickets Zendesk**
     (até 4, leva à Baixa Zendesk filtrada) e **Buscar em** (Integrações de NF, Entregas, Baixa Zendesk).
   - Navegação por setas, Enter e Esc.
4. Botão **"Como usar esta tela"** (ícone "?"): abre a ajuda da tela atual.
5. **Seletor de período de emissão** ("Emissão: Todas as datas" / "dd/mm – dd/mm"): atalhos à esquerda (Todas as
   datas, Hoje, Ontem, Últimos 7 dias, Últimos 30 dias, Este mês, Mês passado) e calendário de dois meses para
   escolher o intervalo. Botão "Limpar". Esse filtro vale para o app inteiro.
6. Botão **"Banco de dados"**: abre o modal do banco acumulado.
7. **"Mais opções"** (engrenagem): seletor "Ver dados de" (hoje ou um dia salvo), pasta dos arquivos exportados,
   tema claro/escuro, "Recarregar dados", "Como funciona".
8. **Avatar** com as iniciais: abre o perfil.

### Modais globais

- **Perfil:** no primeiro acesso é obrigatório ("Bem-vindo ao ArkTransp", campos "Seu nome" e "Setor" com
  sugestões, botão "Começar"). Depois, "Seu perfil" com botão "Salvar".
- **Como usar esta tela:** título da tela, resumo, passos numerados, legenda "O que significa cada cor" (badges
  coloridos com explicação) e uma dica final. Botão "Entendi".
- **Enviar planilhas** (Alloca07 + Intelipost): duas abas segmentadas ("Alloca07" e "Intelipost", com ✓ quando o
  arquivo foi escolhido), área de arrastar arquivo, prévia com três cartões (Integradas, Não integradas, Só
  Intelipost) e botões "Fechar" e "Ler e carregar".
- **Banco de dados:**
  - "Banco acumulado por mês": tabela Mês (emissão) | Notas | Entregues | Não entregues | Frota interna | Lalamove |
    Sem rastreio | Atualizado em, com "Exportar" por linha; botões "Exportar banco completo" e "Atualizar banco
    agora".
  - "Verificar banco": procura registros inválidos e sobras; lista os problemas com "Limpar" e o botão "Limpar todo
    o lixo".
  - "Dados carregados agora": "Exportar dados carregados" e "Zerar para atualizar hoje".
  - "Resumo diário": tabela dos 10 últimos dias.
- **Tratativa · NF X** (aberto em Integrações de NF): status Tratado/Pendente, campos "Número do PDV", "Nota antiga",
  "Nota nova", chips de comentário rápido, caixa de comentário, botão "Salvar e marcar como tratado" e histórico de
  comentários.

---

## 2. Início (`#/dashboard`)

De cima para baixo:

1. **Saudação** em vermelho: "Bom dia, [nome]" + data por extenso e o período de emissão.
2. **Faixa de alerta** (amarela), uma mensagem por vez: dia antigo; "Envie a Alloca07 e a Intelipost para montar o
   cruzamento e liberar as outras telas." (botão "Enviar planilhas"); ou "Atualize hoje: [planilhas]".
3. **Cinco cartões de indicadores** (clicáveis, valor colorido):

| Cartão | Valor | Linha de apoio | Ao clicar |
|---|---|---|---|
| Notas no período | total | "X integradas (Y%)" | Integrações de NF |
| Pendências de integração | não integradas + só Intelipost | "X não integradas · Y só Intelipost" | Não integradas |
| Entregues | % entregues | "X de Y com transportadora rastreável" | Entregas filtradas |
| Entregas atrasadas | quantidade | "Em rota com a previsão vencida" | Entregas não entregues |
| Tickets Zendesk abertos | total | "X prontos para dar baixa" | Baixa Zendesk |

4. **Duas colunas:**
   - **"Prioridades"** ("Na ordem em que vale a pena resolver."): lista de tarefas com ícone colorido, título, texto
     e botão "Conferir". Ex.: "N tickets prontos para dar baixa", "N entregas atrasadas", "N notas não integradas",
     "N notas sem envio nas transações", "N tickets com romaneio sem NF", "N notas só na Intelipost". Vazio: "Nenhuma
     pendência no período."
   - **"Entregas por transportadora"**: tabela Transportadora | Notas | Entregues (nº + %) | Em rota | Atrasadas |
     Sem rastreio, com linhas SPfly, Jamef, Certex, Frota interna, Lalamove, Outras, Sem transportadora. Clicar na
     linha leva a Entregas filtrada.
5. **"Planilhas do dia"**: grade de blocos pequenos (Alloca07 + Intelipost, Transações Intelipost, SPfly, Jamef,
   Certex, Tickets Zendesk, NF dos romaneios, Expedição). Cada bloco tem ponto colorido, nome e situação: "Hoje
   hh:mm" (verde), "De dd/mm" (amarelo), "Falta enviar" (borda tracejada) ou "Opcional". Clicar ou arrastar o
   arquivo envia. Botão "Zerar para atualizar hoje".

---

## 3. Integrações de NF (`#/integrations`)

Cruzamento Alloca07 × Intelipost.

- **Cabeçalho:** eyebrow "Operação"; título muda com o filtro ("Todas as integrações de NF", "Notas integradas",
  "Notas não integradas", "Notas só na Intelipost"); subtítulo "Cruzamento pela nota fiscal. Integrada quando o
  número ou a NF triangular existe na Intelipost."
- **Ações:** "Exportar CSV" (contorno) e "Enviar Alloca07 e Intelipost" (primário).
- **Cartão de filtros:**
  - Abas segmentadas com contador: Todas (N), Integradas (N), Não integradas (N), Só Intelipost (N).
  - Busca ("Nota, cliente, pedido ou comentário"), Tipo da nota (multisseleção com contagem), Mês, Emissão de/até,
    Tratativa (Todas / Pendentes de tratativa / Tratadas), Ticket Zendesk (Todos / Com ticket aberto / Sem ticket),
    botão "Só anormais (N)" e "Limpar Filtros".
  - Rodapé: "Mostrando X de Y registros".
- **Tabela:** Nota fiscal | Status | Tratativa | Tipo da nota | Emissão | Integração | Ações.
  - Nota fiscal: link "NF 12345 · Cliente", descrição em cinza, etiqueta "NF · Triangular · Cliente" e link
    "Zendesk: #ticket". Ícone de alerta quando a data é anormal.
  - Status: Integrada (verde), Não integrada (amarelo), Só Intelipost (azul).
  - Tratativa: badge clicável "Pendente" (amarelo) ou "✓ Tratado" (verde) + último comentário truncado.
  - Ações: "Detalhes" e "×" (excluir).
  - Paginação de 200 em 200 ("Mostrar mais 200").
- **Vazio:** "Nenhuma planilha carregada ainda" com 3 passos e botão "Enviar Alloca07 e Intelipost".

### Detalhe da NF (`#/integrations/NF-12345`)

- Cartão principal: categoria, badge de status, ID, título "NF 12345 · Cliente", descrição e aviso de anomalia.
  Ações "Executar Novamente" e "Excluir".
- Abas: **Resumo Geral** (dados da NF: tipo, emissão, integração, triangular, pedido, transportadora, cliente,
  rastreio), **Tratativa** (o mesmo painel do modal), e **Execuções**, **Console de Logs**, **Histórico de
  Auditoria** e **Configurações**.
- Observação para o redesenho: as quatro últimas abas são sobras do modelo inicial do projeto (dados fictícios,
  endpoint de exemplo) e não têm uso real.

---

## 4. Baixa Zendesk (`#/zendesk`)

Mostra os tickets abertos e quais já podem ser fechados.

- **Cabeçalho:** eyebrow "Operação", título "Baixa Zendesk", subtítulo explicando as 6 planilhas.
- **Grade de 6 cartões de upload** (3 por linha):
  1. Zendesk (Aging), 2. Romaneio (Base_Dados), 3. SPfly, 4. Jamef, 5. Certex, 6. Transações Intelipost.
  - Vazio: área de arrastar com texto e dica. Carregado: "✓" + nome do arquivo, contagens (ex.: "X NFs · Y
    entregues") e data/hora; botões "Trocar", "Remover" e, nas transportadoras, "Adicionar" (soma outro período).
- **Painel principal** (um cartão):
  - **Abas com contador:** Em rota de entrega · Aguardando expedição · **Já entregues — dar baixa** (aba de ação) ·
    Frota interna · Lalamove.
  - **Filtros:** Busca ("Ticket, NF, romaneio, organização ou UF...") e Situação da NF (Todas / Com NF / Sem NF / Fora
    da planilha, com contagem).
  - **Barra:** "N tickets · ordenados do mais antigo para o mais novo" + botões "Copiar NFs (N)", "Copiar tickets
    (N)", "Baixa em massa (N)" (gera a planilha do Zendesk com os tickets da aba), "Exportar (N)" e "Exportar todos
    (N)" (primário).
  - **Tabela de Em rota / Aguardando:** Ticket | Situação NF | NF | Transportadora | Romaneio | Etapa atual |
    Organização | UF | Localidade | Grupo | Prioridade | Criado em | Atualizado em | Idade (dias) | Sem atualização
    (dias). Situação NF: Com NF (verde), Sem NF (amarelo), Fora da planilha (vermelho), "Parcial · X de Y".
  - **Tabela de Já entregues / Frota / Lalamove:** Ticket | Status Zendesk | NF | Transportadora | Base de saída |
    (Status Intelipost) | Data entrega | Recebedor | Organização | UF | Criado em | Atualizado em.
  - Nas tabelas, quando o ticket tem várias NFs, as colunas de NF ficam empilhadas (uma linha por NF na mesma
    célula).
- **Vazio:** "Envie a planilha 1 · Zendesk (Aging)" com os passos das 6 planilhas.

---

## 5. Entregas (`#/entregas`)

Confere uma lista de NFs contra as entregas.

- **Cabeçalho:** eyebrow "Operação", título "Entregas", subtítulo muda quando há lista carregada.
- **Cartão "Planilha base (NFs para conferir)"**: qualquer planilha com coluna de NF (ticket opcional).
- **Seção "Planilhas de entrega"**: 4 cartões de upload (Transações Intelipost, SPfly, Jamef, Certex).
- **Painel "Comparar Intelipost × {transportadora}"**:
  - Resumo "X NFs nas Transações · Y NFs na planilha · Z divergências", seletor de transportadora e botão "Exportar
    comparação".
  - Sete cartões clicáveis: Divergências (vermelho), Entregue na transportadora · pendente na Intelipost (vermelho),
    Entregue na Intelipost · sem entrega na planilha (amarelo), Entregue nas duas (verde), Pendente nas duas, Só na
    Intelipost (amarelo), Só na planilha.
  - Tabela: NF | Comparação | Intelipost | Entrega Intelipost | {Transportadora} | Entrega {Transportadora} |
    Destinatário | UF, com busca.
- **Com a planilha base:**
  - **Cinco cartões de resultado** (clicáveis, com "X% dos tickets"): Todas entregues (verde), Parte entregue, Não
    entregues (amarelo), Frota / Lalamove, Não encontradas (vermelho).
  - **"% no prazo por região"**: barras horizontais 0–100% por região (verde ≥ 95%, amarelo ≥ 85%, vermelho abaixo),
    clicáveis para filtrar.
  - **Cartão de lista:** abas por resultado; filtros Busca, Tipo, Emissão de/até, Região, SLA (Dentro/Fora do SLA e
    cada situação), "Limpar filtros"; barra "N tickets · M NFs · X% dentro do SLA"; seletor de mês; botões "Copiar
    NFs", "Baixa em massa" e "Exportar".
  - **Tabela:** Ticket | Resultado | NF | Situação da NF | Transportadora | Base de saída | Status Intelipost |
    Previsão | Data entrega | SLA | Recebedor | Tipo | Região | Emissão. Mostra 500 linhas ("O Exportar leva todos").
- **Vazio:** "Envie a lista de NFs que você quer conferir" com 3 passos.

---

## 6. Painel de SLA (`#/painel`)

Visual estilo BI. Mede entrega × previsão da transportadora.

- **Cabeçalho:** eyebrow "Indicadores", título "SLA das transportadoras", subtítulo "Entrega × previsão da
  transportadora, em dias úteis · meta 95% no prazo". À direita, chips das fontes carregadas ("✓ SPfly", "✓ Jamef",
  "✓ Certex", "✓ Expedição · N NFs") e botões "Carregar expedição (.csv)" e "Transportadoras".
- **Filtros:** chips Todas / SPfly / Jamef / Certex, Região, Mês da previsão, "Limpar filtros".
- **Seis KPIs** (os do meio filtram a tabela de detalhe ao clicar):

| KPI | Valor | Linha de apoio |
|---|---|---|
| Dentro do SLA | X,X% (verde/amarelo/vermelho) | "N notas avaliadas" |
| Notas monitoradas | total | "com previsão da transportadora" |
| Entregues no prazo | qtd (verde) | "até a data prevista" |
| Entregues com atraso | qtd (vermelho) | "atraso médio X d.u." |
| Vencidas sem entrega | qtd (laranja) | "previsão já passou" |
| Lead time médio | X d.u. (azul) | "saída → entrega · N NFs" |

- **Gráficos (grade):**
  1. **SLA geral:** velocímetro semicircular 0–100% com marcador da meta.
  2. **Situação das notas:** rosca com total no centro e legenda clicável (No prazo, Com atraso, Vencidas, Em
     trânsito, Devolução, Sem previsão).
  3. **Por transportadora:** barra 100% empilhada por transportadora com "X% no prazo · N notas"; clicável.
  4. **% no prazo por região:** barras horizontais; clicável.
  5. **Tendência semanal:** colunas de volume por semana + linha de % no prazo, com linha de meta em 95% (até 12
     semanas).
  6. **Cidades com mais problemas:** top 8 em barras vermelhas ("X vencidas · Y atrasadas").
  7. **Lead time médio por região:** barras azuis em dias úteis.
  8. **Tickets em atraso sem entrega:** tabela Ticket | NF | Transportadora | Região | Cidade / UF | Previsão |
     Atraso | Último status, com "Copiar tickets" e "Exportar".
- **"Detalhe das notas"** (seção recolhível): busca, "Exportar (N)" e tabela NF | Transportadora | Região | Cidade /
  UF | Destinatário | Saída | Previsão | Entrega | Situação | Atraso | Lead time (300 mais críticas).
- **Vazio:** "Envie as planilhas das transportadoras" com 3 passos e botões "Ir para Entregas" / "Ir para o Início".

---

## 7. Relatórios (`#/reports`)

- **Cabeçalho:** eyebrow "Indicadores", título "Relatórios", subtítulo "Planilhas prontas para baixar. Seguem o
  período de emissão escolhido no topo."
- **Três cartões:**
  1. **"Todas as integrações de NF"**: notas no cruzamento, integradas, taxa de integração; botão "Baixar todas (N)"
     (CSV).
  2. **"Pendências"**: não integradas e só na Intelipost; botão "Baixar pendências (N)" (CSV).
  3. **"Outros relatórios"**: atalhos "Abrir Entregas", "Abrir Baixa Zendesk", "Abrir Painel de SLA".
- Sem gráficos nem tabelas.

---

## 8. Configurações (`#/settings`)

- **Cabeçalho:** eyebrow "Configurações", título "Configurações", subtítulo "Preferências do app e explicação de cada
  situação usada nas telas."
- Menu vertical à esquerda ("Geral", "Como funciona") e conteúdo à direita.
- **Geral** (cartão "Preferências", linhas rótulo + descrição + controle): Seu perfil ("Editar"), Tema ("Ativar modo
  escuro/claro"), Atualização automática (Desligado / 15 s / 30 s / 60 s), Base Alloca07 × Intelipost ("Limpar
  base", vermelho).
- **Como funciona:** cinco cartões de legenda com badge colorido + explicação: Integrações de NF, Entregas, Baixa
  Zendesk, Banco de dados.
  - Observação: os textos de Entregas e Baixa Zendesk aqui estão desatualizados em relação à regra atual (hoje a
    entrega das transportadoras vale pela data na planilha delas, e Frota/Lalamove têm abas próprias).

---

## 9. Compasse (`#/compasse`)

- Não aparece no menu; só abre pelo endereço.
- Cabeçalho "Operação" / "Compasse" / "Acompanhamento Compasse." e um estado vazio "Em construção".

---

## 10. Padrões visuais repetidos

| Padrão | Onde aparece | Como é hoje |
|---|---|---|
| Cartão de upload | Baixa Zendesk, Entregas, Início | Área tracejada para arrastar; carregado vira linha com ✓, arquivo, contagens e botões Trocar/Remover/Adicionar |
| Estado vazio | Todas as telas | Ícone, título, texto, passos numerados em círculos, botões |
| Abas com contador | Integrações, Baixa Zendesk, Entregas | Botões de aba com "(N)"; aba de ação destacada |
| Cartões de resultado/KPI | Início, Entregas, Painel, comparação | Rótulo, número grande colorido, linha de apoio; clicar filtra |
| Badges de status | Tabelas | Pílula colorida: success, warning, danger, info, neutral |
| Células empilhadas | Tabelas de ticket e de entregas | Várias NFs do mesmo ticket na mesma célula, uma por linha |
| Barra de ações | Acima das tabelas | Texto "N itens" à esquerda; botões pequenos à direita (contorno) e um primário |
| Multisseleção | Tipo da nota, Tipo | Botão com resumo + popover com "Selecionar todos", "Limpar" e checkboxes com contagem |

## 11. Pontos que um redesenho pode resolver

- **Uploads espalhados:** as mesmas planilhas podem ser enviadas no Início (blocos), em Entregas e na Baixa Zendesk.
- **Indicadores dispersos:** KPIs de entrega aparecem no Início, em Entregas e no Painel com recortes diferentes.
- **Tabelas muito largas** (até 15 colunas) e células empilhadas quando o ticket tem várias NFs.
- **Muitos botões de ação** lado a lado (Copiar NFs, Copiar tickets, Baixa em massa, Exportar, Exportar todos).
- **Sobras do modelo inicial** no detalhe da NF (Execuções, Logs, Auditoria, Configurações) e telas sem conteúdo
  (Compasse).
- **Comparação Intelipost × transportadora** fica dentro de Entregas, mas é um assunto próprio.
- **Data de cada fonte:** saber se a planilha é de hoje é crítico; hoje isso está só nos blocos do Início e nos
  cartões de upload.
