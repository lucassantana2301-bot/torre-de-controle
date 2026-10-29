import React, { useEffect } from 'react';

type Tom = 'success' | 'warning' | 'danger' | 'info' | '';

interface Ajuda {
  titulo: string;
  resumo: string;
  passos: string[];
  cores?: { rotulo: string; tom: Tom; texto: string }[];
  dica?: string;
}

const AJUDAS: { prefixo: string; ajuda: Ajuda }[] = [
  {
    prefixo: '/entregas',
    ajuda: {
      titulo: 'Entregas',
      resumo: 'Cruza cada nota da Alloca07 com a entrega na SPfly, Jamef ou Certex.',
      passos: [
        'A lista nasce da Alloca07. A entrega vem da data na planilha da transportadora.',
        'A evolução agrupa a foto atual pela data de entrega ou pela previsão — não é um histórico diário.',
        'Filtre por transportadora e SLA. O período do calendário vale quando a Alloca07 está carregada.',
      ],
      cores: [
        { rotulo: 'Todas entregues', tom: 'success', texto: 'Todas as NFs da linha já foram entregues.' },
        { rotulo: 'Parte entregue', tom: 'info', texto: 'Algumas NFs entregues, outras ainda não.' },
        { rotulo: 'Não entregues', tom: 'warning', texto: 'Em trânsito, devolvidas ou só com envio cancelado.' },
        { rotulo: 'Frota / Lalamove', tom: '', texto: 'Lalamove ainda sem status de entregue (Frota interna já conta como pronta).' },
        { rotulo: 'Não encontradas', tom: 'danger', texto: 'Nenhuma NF da linha aparece nas entregas.' },
      ],
      dica: 'A Jamef só exporta 30 dias por vez: use "Adicionar" para somar vários arquivos.',
    },
  },
  {
    prefixo: '/conferir',
    ajuda: {
      titulo: 'Entregas',
      resumo: 'Cruza as notas da Alloca07 com as entregas das transportadoras.',
      passos: [
        'Envie a Alloca07 no Início.',
        'Envie os relatórios da SPfly, Jamef e Certex.',
        'Veja, linha a linha, se foi entregue e quando.',
      ],
    },
  },
  {
    prefixo: '/painel',
    ajuda: {
      titulo: 'Painel de SLA',
      resumo: 'Mede se as transportadoras estão entregando até a data prevista que elas mesmas informaram.',
      passos: [
        'Escolha a transportadora, a região e o mês nos filtros do topo do painel.',
        'Clique num indicador ou numa fatia do gráfico para ver as notas daquela situação.',
        'Use a lista de tickets em atraso para cobrar a transportadora e exporte o detalhe em Excel.',
      ],
      cores: [
        { rotulo: 'No prazo', tom: 'success', texto: 'Entregue até a data prevista.' },
        { rotulo: 'Em trânsito no prazo', tom: 'info', texto: 'Ainda não entregue, mas a previsão não chegou.' },
        { rotulo: 'Com atraso', tom: 'danger', texto: 'Entregue depois da previsão.' },
        { rotulo: 'Vencida', tom: 'danger', texto: 'A previsão passou e não houve entrega.' },
      ],
      dica: 'Meta: 95% dentro do SLA. Verde a partir de 95%, amarelo de 85% a 95%, vermelho abaixo de 85%. Os atrasos contam dias úteis (segunda a sexta). Notas da planilha de Retenção Fiscal ficam fora dessa conta.',
    },
  },
  {
    prefixo: '/reports',
    ajuda: {
      titulo: 'Relatórios',
      resumo: 'Planilhas prontas para baixar com as notas emitidas na Alloca07.',
      passos: [
        'Escolha o período de emissão no calendário do topo.',
        'Baixe as notas do período.',
        'Para o histórico por mês, use o botão Banco de dados no topo.',
      ],
    },
  },
  {
    prefixo: '/torre',
    ajuda: {
      titulo: 'Torre de Controle',
      resumo: 'No topo: como está a operação, o que saiu do esperado e onde agir. A tabela e o detalhe ficam embaixo.',
      passos: [
        'Os quatro indicadores do topo e o funil em linha abrem a lista daquela etapa.',
        'Atenção operacional separa previsão vencida em trânsito, retenção fiscal e fonte atrasada.',
        'O ranking mostra as transportadoras abaixo da meta. A matriz completa continua mais abaixo.',
        'A central de ocorrências mantém busca, filtro e a próxima ação de cada NF.',
      ],
      cores: [
        { rotulo: 'Em dia', tom: 'success', texto: 'Sem alerta, ou SLA a partir de 95%.' },
        { rotulo: 'Atenção', tom: 'warning', texto: 'Pendências recentes, ou SLA entre 85% e 95%.' },
        { rotulo: 'Crítico', tom: 'danger', texto: 'Mais de 3 dias úteis parado ou vencido, ou SLA abaixo de 85%.' },
      ],
      dica: 'Tudo segue o período de emissão escolhido no topo. "Sem rastreio" é nota da Alloca07 que não aparece na SPfly, Jamef ou Certex.',
    },
  },
  {
    prefixo: '/settings',
    ajuda: {
      titulo: 'Configurações',
      resumo: 'Preferências do sistema, seu perfil e a explicação de cada situação usada nas telas.',
      passos: [
        'Em Geral, troque o tema, edite seu nome e setor e ajuste a atualização automática.',
        'Em Como funciona, veja o significado de cada status.',
        '"Limpar base" apaga só as notas da Alloca07 carregadas.',
      ],
    },
  },
  {
    prefixo: '/',
    ajuda: {
      titulo: 'Início',
      resumo: 'A tela mostra o que está errado, o que resolver primeiro e o que fazer em cada nota.',
      passos: [
        'Os indicadores abrem a lista daquele número, sem mudar de tela. Ocorrências abertas são só as que ainda não têm tratativa.',
        'Resolver agora vem por prioridade: críticos, urgentes e o que vence hoje.',
        'Em cada pendência, Tratar registra o que foi feito e volta para a fila.',
        'Nas planilhas, o horário é a última leitura e a linha de baixo é quantas NFs entraram.',
      ],
      cores: [
        { rotulo: 'Enviada hoje', tom: 'success', texto: 'A planilha foi atualizada hoje.' },
        { rotulo: 'Desatualizada', tom: 'warning', texto: 'Foi enviada em outro dia. Envie a de hoje.' },
        { rotulo: 'Falta enviar', tom: 'warning', texto: 'Bloco com borda tracejada: ainda não foi enviada. Os números dependem dela.' },
      ],
      dica: 'Busque NF, pedido, rastreio ou cliente com Ctrl + K.',
    },
  },
];

function ajudaDa(path: string): Ajuda | null {
  return AJUDAS.find((a) => path.startsWith(a.prefixo))?.ajuda ?? null;
}

export const temAjuda = (path: string) => ajudaDa(path) !== null;

export const AjudaTelaModal: React.FC<{ path: string; onClose: () => void }> = ({ path, onClose }) => {
  const ajuda = ajudaDa(path);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!ajuda) return null;

  return (
    <div className="sheet-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="ajuda-title">
      <div className="sheet-modal ajuda-modal" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-header">
          <div>
            <span className="ajuda-rotulo">Como usar esta tela</span>
            <h2 className="sheet-title" id="ajuda-title">{ajuda.titulo}</h2>
            <p className="sheet-subtitle">{ajuda.resumo}</p>
          </div>
          <button type="button" className="sheet-close-btn" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <ol className="ajuda-passos">
          {ajuda.passos.map((passo, i) => (
            <li key={i}>
              <span className="ajuda-numero">{i + 1}</span>
              <span>{passo}</span>
            </li>
          ))}
        </ol>

        {ajuda.cores && (
          <>
            <h3 className="ajuda-subtitulo">O que significa cada cor</h3>
            <dl className="ajuda-cores">
              {ajuda.cores.map((cor) => (
                <div key={cor.rotulo}>
                  <dt>
                    <span className={`status-badge ${cor.tom}`}>{cor.rotulo}</span>
                  </dt>
                  <dd>{cor.texto}</dd>
                </div>
              ))}
            </dl>
          </>
        )}

        {ajuda.dica && <p className="ajuda-dica">{ajuda.dica}</p>}

        <div className="sheet-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
};
