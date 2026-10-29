# ArkTransp — brief para o redesenho no Figma

> Resumo das funcionalidades e telas como estão hoje (22/10/2026), para desenhar o novo front.
> Detalhe dos textos de cada tela: `FRONT_ATUAL_POR_TELA.md` · regras de negócio: `RESUMO_PARA_NOVOS_FRONTS.md`.

## 1. O produto em uma frase

Ferramenta interna da logística da Arklok que acompanha a **nota fiscal** da emissão (Alloca07/Protheus) até a
**entrega** pela transportadora e o **fechamento do ticket** no Zendesk.

- **Quem usa:** analistas de Operações/Logística e Atendimento, todo dia, no desktop (mobile só para consulta).
- **Como os dados entram:** planilhas que o usuário baixa dos sistemas e arrasta para o app. Não há login nem servidor
  (por enquanto).
- **Pergunta que cada tela responde:** "o que eu preciso resolver hoje?" → por isso o padrão é destaque + lista de
  ações + gráficos + tabela.

## 2. Fontes de dados (o usuário precisa ver se cada uma é de hoje)

| Fonte | De onde vem | Para quê |
|---|---|---|
| Alloca07 | Protheus | Notas emitidas, tipo, UF/cidade, pedido, NF triangular |
| Intelipost (Transações) | Portal Intelipost | Se a nota foi integrada, status do envio, Frota interna e Lalamove |
| SPfly, Jamef, Certex | Portal de cada transportadora | Data de entrega, recebedor, previsão, CT-e (reentrega) |
| Zendesk (Aging · Export) | Zendesk | Tickets abertos em "Em rota" e "Aguardando expedição" |
| Romaneio (Base_Dados) | Planilha interna | Liga ticket → NF |
| NFs manuais | Usuário (planilha ou modal) | Liga ticket → NF quando não está no romaneio |
| Extração - Romaneio | Protheus | Quem emitiu a nota (login `USR_EMISSAO`) |
| Relatório de Expedição | Planilha interna (opcional) | Data de saída → lead time |

**Estado de cada fonte:** "Hoje hh:mm" (verde) · "De dd/mm" (amarelo, desatualizada) · "Falta enviar" (tracejado) ·
"Opcional". Esse status precisa estar sempre visível — é a maior causa de número "errado".

## 3. Estrutura global

### Layout (modelo aprovado "Torre operacional")
- **Menu lateral escuro** à esquerda (recolhível, só ícones quando fechado; no celular desliza sobre o conteúdo).
- **Cabeçalho** fixo: breadcrumbs · busca global (Ctrl K) · "Como usar esta tela" · filtro de **tipo de nota**
  (esconde Regularização por padrão) · **período de emissão** (atalhos + calendário de 2 meses) · Banco de dados ·
  Mais opções (dia salvo, pasta de exportação, tema claro/escuro) · avatar.
- **Banner de dia antigo** (somente leitura) com "Voltar para hoje".
- **Toasts** no canto inferior direito.

### Menu
| Grupo | Item | Subitens (com contador) |
|---|---|---|
| Rotina | Início | — |
| Rotina | Torre de Controle | — |
| Operação | Integrações de NF | Painel · Todas · Integradas · Não integradas · Só Intelipost |
| Operação | Baixa Zendesk | Painel · Todos · Prontos para baixa · Com NF · Sem NF · Fora da planilha |
| Operação | Entregas | Painel · Reentregas · Intelipost desatualizada · Todos · Todas entregues · Parte entregue · Não entregues · Frota / Lalamove · Não encontradas |
| Indicadores | Painel de SLA · Relatórios | — |
| — | Configurações | Geral · Como funciona |

### Modais globais
Perfil (obrigatório no 1º acesso: nome + setor) · Como usar esta tela (passos + legenda de cores) · Enviar Alloca07 e
Intelipost (prévia do cruzamento antes de carregar) · Banco de dados (acumulado por mês, verificar, exportar, zerar
o dia).

## 4. Telas

### 4.1 Início
- Saudação + data e período.
- Alerta do dia (uma mensagem por vez: falta planilha, dia antigo...).
- 5 KPIs clicáveis: Notas no período · Pendências de integração · % Entregues · Entregas atrasadas · Tickets abertos
  (com "X prontos para baixa").
- **Prioridades** (lista ordenada com botão "Conferir") + **Entregas por transportadora** (tabela).
- **Planilhas do dia:** grade de blocos de upload com o estado de cada fonte.

### 4.2 Torre de Controle
- **Funil da nota:** Emitidas → Integradas → Expedidas → Em trânsito → Entregues no prazo.
- **Ocorrências** (alertas): Vencidas sem entrega · Despachadas sem rastreio · Não integradas · Entregues sem baixa na
  Intelipost.
- Matriz por transportadora e painel da remessa (linha do tempo de uma NF).

### 4.3 Integrações de NF
- **Painel:** destaque da taxa de conciliação (integradas ÷ emitidas), "O que resolver agora", barras por dia de
  emissão, idade das pendências e pendências por tipo de nota.
- **Lista:** abas Todas / Integradas / Não integradas / Só Intelipost.
  - Filtros: busca, **Tipo da nota**, **Emitido por (login)**, mês, emissão de/até, tratativa, ticket Zendesk,
    "só anormais".
  - Colunas: Nota fiscal (NF · triangular · cliente · link do ticket) · Status · Tratativa · Tipo · **UF** ·
    **Emitido por** · Emissão · Integração · Ações.
  - Na aba **Não integradas** a coluna "Integração" vira "Emitido por" e aparece **"Exportar não integradas"**
    (NF, ticket, emissor, status).
  - Ações do topo: Exportar CSV · Carregar emissores · Enviar Alloca07 e Intelipost.
- **Detalhe da NF:** dados da nota (tipo, UF de destino, emitida por, emissão, integração, triangular, pedido,
  transportadora) e aba **Tratativa** (PDV, nota antiga/nova, comentários, marcar como tratado).

### 4.4 Baixa Zendesk
- **Painel:** destaque "Prontos para dar baixa" com a divisão (prontos · entregue com linha sem NF · Lalamove ·
  nenhuma NF entregue), "O que resolver agora" (fora do romaneio, romaneio sem NF, Frota, Lalamove), idade dos tickets
  e organizações com mais tickets.
- **Lista:**
  - Cartões de upload: Aging · Romaneio · **NFs manuais** · SPfly · Jamef · Certex · Transações.
  - Abas: Em rota de entrega · Aguardando expedição · **Já entregues — dar baixa** (aba de ação) · Frota interna ·
    Lalamove. Ticket já entregue sai das abas de status.
  - Filtros: busca e Situação da NF (Com NF · Sem NF · Fora da planilha).
  - Ações: Copiar NFs · Copiar tickets · **Baixa em massa** (planilha para o Zendesk) · Exportar · Exportar todos.
  - **Clique no ticket → modal "Vincular NF":** NF (obrigatória) + NF triangular (opcional), "+ Outra NF", resultado do
    cruzamento na hora (entregue / em trânsito / não encontrada) e "Remover vínculo".

### 4.5 Entregas
- **Painel:** filtros (Transportadora · SLA · Divergência · Tipo de nota), destaque de SLA (no prazo · com atraso ·
  vencidas · em trânsito), "O que resolver agora" (vencidas, gap Intelipost, só Intelipost, só na transportadora,
  reentregas), evolução semanal (12 semanas), SLA por transportadora com marca da meta (95%), tabela por
  transportadora → **modal da transportadora** (pendentes com prazo, por SLA, Intelipost × transportadora) e
  "Exportar gaps Intelipost".
- **Reentregas:** mesma NF com 2+ CT-e para o mesmo destinatário.
- **Intelipost desatualizada:** entregue na transportadora e pendente na Intelipost, por idade (até 2 · 3–7 · +7
  dias), status e transportadora, com exportar.
- **Lista / conferência:** sobe uma planilha base de NFs e mostra resultado por linha (Todas entregues · Parte ·
  Não entregues · Frota/Lalamove · Não encontradas), % no prazo por região e tabela com SLA.

### 4.6 Painel de SLA
6 KPIs (Dentro do SLA, monitoradas, no prazo, com atraso, vencidas, lead time) · velocímetro · rosca de situação ·
barras por transportadora e por região · tendência semanal · cidades com mais problemas · lead time por região ·
tickets em atraso · detalhe das notas.

### 4.7 Relatórios e Configurações
- Relatórios: downloads prontos (todas as integrações, pendências) e atalhos.
- Configurações: perfil, tema, atualização automática, limpar base e "Como funciona" (legenda de cada status).

## 5. Status e cores (o que a UI precisa comunicar)

| Cor | Significado | Exemplos |
|---|---|---|
| Verde | Resolvido / ok | Integrada · Entregue · No prazo · Pronto para baixa · Com NF |
| Amarelo | Atenção | Não integrada · Com atraso · Sem NF · Fonte de outro dia |
| Vermelho | Problema | Vencida · Fora da planilha · Divergência · Só Intelipost |
| Azul/cinza | Informação | Em trânsito · Frota/Lalamove · Sem rastreio |

Identidade: vermelho Arklok `#da291c` para marca e ação primária; tema claro e escuro.

Regras que mudam o que aparece:
- **Pronto para baixa:** pelo menos uma NF entregue (a triangular vale pela remessa), romaneio sem linha vazia, sem
  Lalamove.
- **Frota interna conta como entregue no mesmo dia** e vai para "Já entregues".
- Entrega das transportadoras vale pela data na planilha delas; a Intelipost só complementa.
- Regularização fica escondida por padrão (filtro de tipo de nota no topo).

## 6. Componentes do kit (já existem em CSS próprio, prefixo `ui-`)

Página e cabeçalho · Botão (primário, contorno, pequeno) · Aviso · Filtros/Filtro (selects compactos) · Segmentado
(abas) · Chips · KPI · **Destaque** (número grande + barra de composição + meta + rodapé) · **Lista de ações** ("O
que resolver agora") · Barras (colunas por período, com meta opcional) · BarrasMeta (horizontal com marca da meta) ·
BarrasLista (ranking) · Painel/Seção · Tag (status) · Modal (normal e estreito) · Campo de texto · Tabela com linha
clicável e células empilhadas (várias NFs por ticket) · Cartão de upload · Estado vazio com passos · Multisseleção
com contagem.

## 7. Estados que toda tela precisa ter

Vazio (qual planilha enviar, com passos) · carregando/lendo arquivo · fonte desatualizada · dia antigo (somente
leitura) · erro de leitura de planilha · lista grande (mostra N, "Exportar leva todos").

## 8. Fluxos principais para prototipar

1. **Rotina da manhã:** abrir Início → ver fontes do dia → enviar as que faltam → seguir "Prioridades".
2. **Dar baixa:** Baixa Zendesk → aba "Já entregues" → Baixa em massa → subir no Zendesk.
3. **Ticket fora do romaneio:** filtrar "Fora da planilha" → clicar no ticket → vincular NF → ver resultado.
4. **Cobrar transportadora:** Entregas → transportadora → modal com pendentes e prazo → exportar.
5. **Intelipost desatualizada:** lista do gap → exportar por transportadora.
6. **Não integradas por emissor:** Integrações → Não integradas → filtrar login → exportar.

## 9. Oportunidades para o redesenho

- Um lugar só para **enviar planilhas** e ver a data de cada fonte (hoje está no Início, Entregas e Baixa Zendesk).
- Tabelas largas (até 15 colunas): definir colunas essenciais + detalhe sob demanda.
- Muitos botões de ação lado a lado: agrupar em "Exportar ▾" e "Copiar ▾".
- Contagem do filtro "Situação da NF" deve mostrar o número **da aba aberta** e o total.
- Remover sobras do detalhe da NF (Execuções, Logs, Auditoria, Configurações) e a tela Compasse vazia.
- Preparar para o futuro: login corporativo, dados no servidor e fontes automáticas (APIs).
