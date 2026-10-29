import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { IntegrationCategory, IntegrationStatus, IntegrationType } from '../../types';

interface NewIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewIntegrationModal: React.FC<NewIntegrationModalProps> = ({ isOpen, onClose }) => {
  const { createIntegration, addToast } = useApp();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<IntegrationCategory>('Logística');
  const [type, setType] = useState<IntegrationType>('TMS_CARRIER');
  const [status, setStatus] = useState<IntegrationStatus>('completed');
  const [responsible, setResponsible] = useState('Diogo Silva');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [carrier, setCarrier] = useState('Intelipost Gateway');
  const [trackingCode, setTrackingCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      addToast('error', 'Nome obrigatório', 'O nome da integração é obrigatório.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createIntegration({
        name,
        description: description || `Integração operacional da remessa NF ${invoiceNumber || 'Geral'}`,
        category,
        type,
        status,
        responsible,
        errorMessage: status === 'pending' ? 'Nota ainda não localizada na Intelipost.' : null,
        sourceSystem: 'ALLOCA_PROTHEUS',
        targetSystem: 'INTELIPOST',
        metadata: {
          notaFiscal: invoiceNumber || undefined,
          transportadora: carrier || undefined,
          rastreio: trackingCode || undefined,
          pedido: invoiceNumber ? `PED-${invoiceNumber}` : undefined,
        },
      });
      addToast('success', 'Integração cadastrada', 'O registro entrou no catálogo.');
      onClose();
    } catch {
      addToast('error', 'Erro ao criar', 'Não foi possível cadastrar a integração.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sheet-modal" onClick={(e) => e.stopPropagation()}>
        {/* Cabeçalho do Sheet HIG */}
        <div className="sheet-header">
          <div>
            <h2 className="sheet-title">Nova Integração</h2>
            <p className="sheet-subtitle">Cadastre uma nova rota de transmissão no ecossistema Arklok.</p>
          </div>
          <button type="button" className="sheet-close-btn" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Formulário com controles Apple HIG */}
        <form onSubmit={handleSubmit} className="sheet-form">
          <div className="form-group">
            <label className="form-label">Nome da Integração *</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ex: Sincronização Intelipost · NF 236890"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Descrição Operacional</label>
            <textarea
              className="form-textarea"
              rows={2}
              placeholder="Descreva a finalidade desta integração ou nota fiscal..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Segmented Control para Tipo HIG */}
          <div className="form-group">
            <label className="form-label">Tipo de Conexão</label>
            <div className="segmented-control">
              {(['API', 'WEBHOOK', 'BATCH_FILE', 'ERP_SYNC', 'TMS_CARRIER'] as IntegrationType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  className={`segmented-btn ${type === t ? 'active' : ''}`}
                  onClick={() => setType(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Categoria</label>
              <select
                className="form-select"
                value={category}
                onChange={(e) => setCategory(e.target.value as IntegrationCategory)}
              >
                <option value="Logística">Logística (Intelipost TMS)</option>
                <option value="ERP Totvs">ERP Totvs (Alloca07 / Protheus)</option>
                <option value="Fiscal">Fiscal (SEFAZ NF-e)</option>
                <option value="Financeiro">Financeiro (Bancário / ERP)</option>
                <option value="E-commerce">E-commerce & Portais</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Status Inicial</label>
              <select
                className="form-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as IntegrationStatus)}
              >
                <option value="completed">Concluída (Sucesso)</option>
                <option value="pending">Pendente (Fila / Espera)</option>
                <option value="processing">Em Processamento (Ao Vivo)</option>
                <option value="error">Com Erro (Falha)</option>
              </select>
            </div>
          </div>

          <div className="form-row-3">
            <div className="form-group">
              <label className="form-label">Nota Fiscal (NF)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: 236890"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Transportadora</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: SPfly, Arklok Exp"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Código Rastreio</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: TRK-9901"
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Responsável Técnico</label>
            <input
              type="text"
              className="form-input"
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
            />
          </div>

          {/* Rodapé com Ações HIG */}
          <div className="sheet-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : 'Criar Integração'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
