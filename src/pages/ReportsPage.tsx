import React from 'react';
import { useApp } from '../context/AppContext';
import { useRouter } from '../router/useRouter';
import { csvCell } from '../utils/csv';
import { rotuloPeriodo } from '../utils/periodo';
import type { Integration } from '../types';
import { EstadoVazio } from '../components/common/EstadoVazio';

function baixarCsv(lista: Integration[], nome: string) {
  const header = [
    'NF', 'NF triangular', 'Cliente', 'Tipo da nota', 'Emissão', 'Pedido', 'Romaneio', 'Cidade', 'UF',
  ];
  const linhas = lista.map((i) => {
    const m = i.metadata ?? {};
    return [
      m.notaFiscal ?? i.id.replace(/^NF-/, ''),
      m.nfTriangular,
      m.clienteDestino,
      m.tipoNota,
      m.dataEmissao?.split('-').reverse().join('/'),
      m.pedido,
      m.romaneio,
      m.cidade,
      m.uf,
    ];
  });
  const csv = [header, ...linhas].map((r) => r.map((c) => csvCell(c)).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nome}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const ReportsPage: React.FC = () => {
  const { integrations, metrics, filters, hasDataset, openUpload } = useApp();
  const { navigate } = useRouter();
  const periodo = rotuloPeriodo(filters.emissaoDe, filters.emissaoAte);

  return (
    <div className="page-reports">
      <div className="page-header app-cabecalho">
        <div>
          <h1 className="page-title">Relatórios</h1>
          <p className="page-subtitle">Downloads do período selecionado no topo ({periodo}).</p>
        </div>
      </div>

      {!hasDataset && (
        <EstadoVazio
          titulo="Ainda não há notas para baixar"
          texto="Os relatórios desta tela saem das notas emitidas na Alloca07. Envie a planilha para liberar os downloads."
          acoes={[{ label: 'Enviar Alloca07', onClick: openUpload }]}
        />
      )}

      <div className="reports-grid">
        <div className="panel-card">
          <h3 className="section-title">Notas emitidas</h3>
          <p className="text-muted">Cada nota da Alloca07 no período, com cliente, tipo e destino.</p>
          <ul className="stats-list">
            <li><span>Notas no período:</span> <b>{metrics?.total ?? 0}</b></li>
          </ul>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={integrations.length === 0}
            onClick={() => baixarCsv(integrations, 'notas_emitidas')}
          >
            Baixar notas ({integrations.length})
          </button>
        </div>

        <div className="panel-card">
          <h3 className="section-title">Outros relatórios</h3>
          <ul className="stats-list">
            <li>
              <span>Entregas por situação:</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/entregas')}>
                Abrir Entregas
              </button>
            </li>
            <li>
              <span>SLA das transportadoras:</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/painel')}>
                Abrir Painel de SLA
              </button>
            </li>
          </ul>
          <p className="text-muted">O banco acumulado por mês fica no botão Banco de dados, no topo.</p>
        </div>
      </div>
    </div>
  );
};
