'use client';

import React, { useState, useEffect } from 'react';
import {
  Mail,
  HardDrive,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  LogOut,
  ChevronDown,
  ChevronUp,
  Send,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GoogleIntegrationsCardProps {
  doctorId: string;
}

export function GoogleIntegrationsCard({ doctorId }: GoogleIntegrationsCardProps) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Estados de modal/ação
  const [showTestEmail, setShowTestEmail] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [expandedSection, setExpandedSection] = useState<'gmail' | 'drive' | 'calendar' | null>(null);

  const fetchStatus = async () => {
    if (!doctorId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/integrations/google/status?doctorId=${encodeURIComponent(doctorId)}`);
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.warn('Erro ao consultar status Google:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [doctorId]);

  const handleConnectGoogle = () => {
    if (!doctorId) return;
    window.location.href = `/api/integrations/google/auth?doctorId=${encodeURIComponent(doctorId)}`;
  };

  const handleDisconnect = async () => {
    if (!confirm('Deseja realmente desconectar sua conta Google?')) return;
    try {
      setActionLoading('disconnect');
      const res = await fetch('/api/integrations/google/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId }),
      });
      if (res.ok) {
        setFeedbackMsg({ type: 'success', text: 'Conta Google desconectada com sucesso.' });
        fetchStatus();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao desconectar.');
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleSetting = async (key: 'autoSendGmail' | 'autoUploadDrive', currentValue: boolean) => {
    try {
      const res = await fetch('/api/integrations/google/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId,
          [key]: !currentValue,
        }),
      });
      if (res.ok) {
        fetchStatus();
      }
    } catch (err) {
      console.warn('Erro ao atualizar configuração:', err);
    }
  };

  const handleImportCalendar = async () => {
    try {
      setActionLoading('calendar-import');
      setFeedbackMsg(null);
      const res = await fetch('/api/integrations/google/calendar/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedbackMsg({
          type: 'success',
          text: data.message || `${data.importedCount} consultas importadas com sucesso!`,
        });
        fetchStatus();
      } else {
        throw new Error(data.error || 'Falha ao importar consultas da Google Agenda.');
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailAddress) return;

    try {
      setActionLoading('gmail-test');
      setFeedbackMsg(null);
      const res = await fetch('/api/integrations/google/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId,
          recipientEmail: testEmailAddress,
          patientName: 'Paciente Teste',
          invoiceNumber: '999',
          amount: 500,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedbackMsg({ type: 'success', text: `E-mail de demonstração enviado para ${testEmailAddress}!` });
        setShowTestEmail(false);
        setTestEmailAddress('');
      } else {
        throw new Error(data.error || 'Falha ao enviar e-mail de teste.');
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const isConnected = Boolean(status?.isConnected);
  const integration = status?.integration;

  return (
    <section aria-label="Integrações Google" className="w-full text-left mt-8 border-t border-[#eae9ea] pt-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="font-display font-medium text-[20px] text-ds-ink tracking-tight flex items-center gap-2">
            Integrações Google
            {isConnected && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-[#006239] bg-[#3ecf8e]/15 border border-[#3ecf8e]/30 px-2 py-0.5 rounded-full font-semibold">
                <CheckCircle2 className="w-3 h-3 text-[#3ecf8e]" /> Conectado
              </span>
            )}
          </h2>
          <p className="font-text text-[13px] text-ds-ink-2 mt-0.5">
            Gmail para envio de notas pelo seu e-mail, Google Drive para armazenamento seguro e Agenda para importação de consultas.
          </p>
        </div>

        {isConnected ? (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={actionLoading === 'disconnect'}
            className="self-start sm:self-center text-xs text-ds-ink-4 hover:text-ds-red flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#eae9ea] hover:border-ds-red/30 transition-colors cursor-pointer"
          >
            {actionLoading === 'disconnect' ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <LogOut className="w-3 h-3" />
            )}
            Desconectar
          </button>
        ) : (
          <Button
            type="button"
            onClick={handleConnectGoogle}
            className="self-start sm:self-center h-9 px-4 rounded-[var(--radius)] bg-ds-ink text-white hover:bg-ds-ink/90 text-xs font-medium flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Conectar Conta Google
          </Button>
        )}
      </div>

      {feedbackMsg && (
        <div
          className={`mb-4 p-3 rounded-xl border text-xs flex items-center justify-between ${
            feedbackMsg.type === 'success'
              ? 'bg-[#3ecf8e]/10 border-[#3ecf8e]/30 text-[#006239]'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <span>{feedbackMsg.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-xs opacity-60 hover:opacity-100 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-6 flex items-center justify-center gap-2 text-xs text-ds-ink-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando integrações Google...
        </div>
      ) : !isConnected ? (
        <div className="bg-[#faf9f8] border border-[#f0eee9] rounded-2xl p-5 text-left space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-white border border-[#eae9ea] text-ds-ink shadow-xs">
              <Mail className="w-4 h-4 text-ds-ink" />
            </div>
            <div>
              <h3 className="font-text font-semibold text-sm text-ds-ink">3 Recursos em 1 única conexão</h3>
              <p className="font-text text-xs text-ds-ink-2 mt-1 leading-relaxed">
                Ao conectar sua conta Google, você autoriza o envio de notas pelo seu <strong>Gmail</strong>, o arquivamento automático dos XMLs e PDFs no seu <strong>Google Drive</strong> e a importação de consultas e pacientes da sua <strong>Google Agenda</strong>.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Card Resumo do Perfil */}
          <div className="flex items-center justify-between bg-[#faf9f8] border border-[#f0eee9] rounded-2xl px-4 py-3">
            <div className="flex items-center gap-3">
              {integration?.avatarUrl ? (
                <img
                  src={integration.avatarUrl}
                  alt={integration.name || 'Google'}
                  className="w-8 h-8 rounded-full border border-white shadow-xs"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-ds-ink text-white flex items-center justify-center text-xs font-semibold">
                  {integration?.email?.slice(0, 2).toUpperCase() || 'GO'}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-text font-medium text-xs text-ds-ink truncate">
                  {integration?.name || 'Médico Google'}
                </p>
                <p className="font-text text-[11px] text-ds-ink-4 truncate">{integration?.email}</p>
              </div>
            </div>
            <span className="text-[11px] font-mono text-[#006239] font-medium">Conta ativa</span>
          </div>

          {/* Grid dos 3 Serviços */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 1. Gmail */}
            <div className="bg-white border border-[#eae9ea] rounded-xl p-4 flex flex-col justify-between space-y-3 shadow-xs hover:border-[#d4d4d8] transition-colors">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-7 h-7 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                    <Mail className="w-3.5 h-3.5" />
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={Boolean(integration?.autoSendGmail)}
                      onChange={() => handleToggleSetting('autoSendGmail', Boolean(integration?.autoSendGmail))}
                    />
                    <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#3ecf8e]"></div>
                  </label>
                </div>
                <h4 className="font-text font-semibold text-xs text-ds-ink">Gmail</h4>
                <p className="font-text text-[11px] text-ds-ink-4 mt-0.5 leading-snug">
                  Envia a NFS-e direto pelo seu e-mail para o paciente.
                </p>
              </div>

              <div className="pt-1 border-t border-[#f4efec]">
                <button
                  type="button"
                  onClick={() => setShowTestEmail(!showTestEmail)}
                  className="text-[11px] font-medium text-ds-ink hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Send className="w-3 h-3" /> Testar envio
                </button>
              </div>
            </div>

            {/* 2. Google Drive */}
            <div className="bg-white border border-[#eae9ea] rounded-xl p-4 flex flex-col justify-between space-y-3 shadow-xs hover:border-[#d4d4d8] transition-colors">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <HardDrive className="w-3.5 h-3.5" />
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={Boolean(integration?.autoUploadDrive)}
                      onChange={() => handleToggleSetting('autoUploadDrive', Boolean(integration?.autoUploadDrive))}
                    />
                    <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#3ecf8e]"></div>
                  </label>
                </div>
                <h4 className="font-text font-semibold text-xs text-ds-ink">Google Drive</h4>
                <p className="font-text text-[11px] text-ds-ink-4 mt-0.5 leading-snug">
                  Salva cópias dos XMLs e DANFSEs na sua pasta do Drive.
                </p>
              </div>

              <div className="pt-1 border-t border-[#f4efec] flex items-center justify-between text-[11px]">
                {integration?.driveFolderId ? (
                  <a
                    href={`https://drive.google.com/drive/folders/${integration.driveFolderId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-ds-ink hover:underline inline-flex items-center gap-1"
                  >
                    Abrir pasta <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                ) : (
                  <span className="text-ds-ink-4">Pasta automática</span>
                )}
              </div>
            </div>

            {/* 3. Google Agenda */}
            <div className="bg-white border border-[#eae9ea] rounded-xl p-4 flex flex-col justify-between space-y-3 shadow-xs hover:border-[#d4d4d8] transition-colors">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Calendar className="w-3.5 h-3.5" />
                  </div>
                  {integration?.lastCalendarSync && (
                    <span className="text-[9px] font-mono text-ds-ink-4">Sincronizado</span>
                  )}
                </div>
                <h4 className="font-text font-semibold text-xs text-ds-ink">Google Agenda</h4>
                <p className="font-text text-[11px] text-ds-ink-4 mt-0.5 leading-snug">
                  Importa dados de consultas e pacientes da sua agenda.
                </p>
              </div>

              <div className="pt-1 border-t border-[#f4efec]">
                <button
                  type="button"
                  onClick={handleImportCalendar}
                  disabled={actionLoading === 'calendar-import'}
                  className="text-[11px] font-medium text-ds-ink hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {actionLoading === 'calendar-import' ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" /> Importando...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3 h-3" /> Importar consultas
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Painel expansível de teste de envio de e-mail */}
          {showTestEmail && (
            <form onSubmit={handleSendTestEmail} className="bg-[#faf9f8] p-3.5 rounded-xl border border-[#eae9ea] space-y-2 mt-2">
              <p className="text-xs font-medium text-ds-ink">Enviar e-mail teste com nota de demonstração:</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="destinatario@exemplo.com"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  required
                  className="flex-1 h-9 px-3 bg-white border border-[#eae9ea] rounded-lg text-xs text-ds-ink focus:outline-none focus:border-ds-ink"
                />
                <button
                  type="submit"
                  disabled={actionLoading === 'gmail-test' || !testEmailAddress}
                  className="h-9 px-3 bg-ds-ink text-white rounded-lg text-xs font-medium hover:bg-ds-ink/90 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {actionLoading === 'gmail-test' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Enviar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowTestEmail(false)}
                  className="h-9 px-2 text-xs text-ds-ink-4 hover:text-ds-ink cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
