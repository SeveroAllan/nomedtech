'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink, Send, Check, FileKey } from 'lucide-react';
import logoWhatsApp from '@/assets/WhatsApp_logo-color-vertical.svg';
import logoPluggy from '@/assets/logo-pluggy.svg';
import logoGmail from '@/assets/Gmail_icon_(2020).svg';
import logoDrive from '@/assets/Google_Drive_icon_(2020).svg';
import logoCalendar from '@/assets/Google_Calendar_icon_(2026).svg';
import { FiscalCertificateDialog } from '@/features/integrations/components/FiscalCertificateDialog';

interface DashboardIntegrationsListProps {
  doctorId: string;
  qrLoading: boolean;
  handleReconnectWhatsApp: () => Promise<void>;
  bankLoading: boolean;
  connectedBank: any;
  selectedBank: string;
  handleConnectBank: (bankId: string) => Promise<void>;
  bankError: string;
  fiscalProfile?: any;
}

export function DashboardIntegrationsList({
  doctorId,
  qrLoading,
  handleReconnectWhatsApp,
  bankLoading,
  connectedBank,
  selectedBank,
  handleConnectBank,
  bankError,
  fiscalProfile,
}: DashboardIntegrationsListProps) {
  const [googleStatus, setGoogleStatus] = useState<any>(null);
  const [googleLoading, setGoogleLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; type: 'success' | 'error'; text: string } | null>(null);

  const [showGmailTest, setShowGmailTest] = useState(false);
  const [testEmail, setTestEmail] = useState('');

  // Estados do Certificado A1
  const [isFiscalModalOpen, setIsFiscalModalOpen] = useState(false);
  const [certStatus, setCertStatus] = useState<any>(null);
  const [certStatusLoading, setCertStatusLoading] = useState(true);

  const fetchCertificateStatus = async () => {
    if (!doctorId) return;
    try {
      setCertStatusLoading(true);
      const res = await fetch(`/api/fiscal/certificate?doctorId=${encodeURIComponent(doctorId)}`);
      const data = await res.json();
      if (res.ok && data.certificate) {
        setCertStatus(data.certificate);
      }
    } catch {
      // Ignora erro de fetch
    } finally {
      setCertStatusLoading(false);
    }
  };

  const fetchGoogleStatus = async () => {
    if (!doctorId) return;
    try {
      setGoogleLoading(true);
      const res = await fetch(`/api/integrations/google/status?doctorId=${encodeURIComponent(doctorId)}`);
      const data = await res.json();
      setGoogleStatus(data);
    } catch {
      // Ignora erro de fetch em dev
    } finally {
      setGoogleLoading(false);
    }
  };

  useEffect(() => {
    fetchGoogleStatus();
    fetchCertificateStatus();
  }, [doctorId]);

  const handleConnectGoogle = () => {
    if (!doctorId) return;
    window.location.href = `/api/integrations/google/auth?doctorId=${encodeURIComponent(doctorId)}`;
  };

  const handleImportCalendar = async () => {
    try {
      setActionLoading('calendar');
      setFeedback(null);
      const res = await fetch('/api/integrations/google/calendar/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          id: 'calendar',
          type: 'success',
          text: data.message || `${data.importedCount} consultas importadas com sucesso!`,
        });
      } else {
        throw new Error(data.error || 'Falha ao importar consultas.');
      }
    } catch (err: any) {
      setFeedback({ id: 'calendar', type: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail) return;

    try {
      setActionLoading('gmail');
      setFeedback(null);
      const res = await fetch('/api/integrations/google/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId,
          recipientEmail: testEmail,
          patientName: 'Paciente Demonstração',
          invoiceNumber: '999',
          amount: 400,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          id: 'gmail',
          type: 'success',
          text: `E-mail de teste enviado para ${testEmail}!`,
        });
        setShowGmailTest(false);
        setTestEmail('');
      } else {
        throw new Error(data.error || 'Erro ao enviar e-mail.');
      }
    } catch (err: any) {
      setFeedback({ id: 'gmail', type: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const isGoogleConnected = Boolean(googleStatus?.isConnected);
  const integration = googleStatus?.integration;

  return (
    <div className="mt-8 w-full border-t border-[#eae9ea] pt-6 flex flex-col divide-y divide-[#eae9ea]">
      {/* 0. CERTIFICADO DIGITAL A1 & NFS-E */}
      <div className="py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between first:pt-0">
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg bg-[#faf9f8] border border-[#eae9ea] flex items-center justify-center text-ds-ink shrink-0 mt-0.5">
            <FileKey className="w-4 h-4 text-ds-ink" />
          </div>
          <div className="min-w-0 text-left">
            <div className="flex items-center gap-2">
              <p className="font-text text-[15px] font-medium leading-snug text-ds-ink">
                Certificado Digital A1 & NFS-e
              </p>
              {certStatusLoading ? (
                <Loader2 className="w-3 h-3 animate-spin text-ds-ink-4" />
              ) : certStatus ? (
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#006239] bg-[#3ecf8e]/15 border border-[#3ecf8e]/30 px-1.5 py-0.5 rounded-full font-semibold">
                  Ativo (Homologação)
                </span>
              ) : (
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#854d0e] bg-[#fef9c3] border border-[#fef08a] px-1.5 py-0.5 rounded-full font-semibold">
                  Não configurado
                </span>
              )}
            </div>
            <p className="mt-0.5 font-text text-[13px] leading-relaxed text-ds-ink-2">
              {certStatus?.cnpj
                ? `Vínculo com CNPJ ${certStatus.cnpj} no Convênio Nacional SEFIN. Atualize seu arquivo .pfx/.p12 ou teste a emissão.`
                : 'Envie ou atualize seu certificado A1 (.p12/.pfx) e senha para emissão direta de notas fiscais.'}
            </p>
          </div>
        </div>

        <Button
          type="button"
          onClick={() => setIsFiscalModalOpen(true)}
          className="h-9 shrink-0 rounded-[var(--radius)] bg-ds-ink px-4 text-xs font-medium text-ds-white hover:bg-ds-ink/90 sm:self-center cursor-pointer"
        >
          {certStatus ? 'Gerenciar Certificado A1' : 'Configurar Certificado A1'}
        </Button>
      </div>

      {/* 1. WHATSAPP */}
      <div className="py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <Image
            src={logoWhatsApp}
            alt="WhatsApp"
            width={28}
            height={28}
            className="w-7 h-7 object-contain shrink-0 mt-0.5"
            priority
          />
          <div className="min-w-0 text-left">
            <p className="font-text text-[15px] font-medium leading-snug text-ds-ink">WhatsApp</p>
            <p className="mt-0.5 font-text text-[13px] leading-relaxed text-ds-ink-2">
              Desconectou o aparelho? Gere uma nova conexão sem perder o vínculo com seu cadastro.
            </p>
          </div>
        </div>

        <Button
          type="button"
          onClick={handleReconnectWhatsApp}
          disabled={qrLoading}
          className="h-9 shrink-0 rounded-[var(--radius)] bg-ds-ink px-4 text-xs font-medium text-ds-white hover:bg-ds-ink/90 sm:self-center cursor-pointer"
        >
          {qrLoading ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Preparando
            </span>
          ) : (
            'Reconectar WhatsApp'
          )}
        </Button>
      </div>

      {/* 2. PLUGGY OPEN FINANCE */}
      <div className="py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <Image
            src={logoPluggy}
            alt="Pluggy Open Finance"
            width={28}
            height={28}
            className="w-7 h-7 object-contain shrink-0 mt-0.5"
            priority
          />
          <div className="min-w-0 text-left">
            <p className="font-text text-[15px] font-medium leading-snug text-ds-ink">
              Conecte seu banco via Open Finance
            </p>
            <p className="mt-0.5 font-text text-[13px] leading-relaxed text-ds-ink-2">
              Conecte seu banco de recebimento e seu paciente receberá a nota assim que pagar.
            </p>
            {bankError && <p className="mt-1 text-xs text-ds-red">{bankError}</p>}
          </div>
        </div>

        <Button
          type="button"
          disabled={bankLoading}
          onClick={() => handleConnectBank(selectedBank || 'itau')}
          className="h-9 shrink-0 rounded-[var(--radius)] bg-ds-ink px-4 text-xs font-medium text-ds-white hover:bg-ds-ink/90 sm:self-center cursor-pointer"
        >
          {bankLoading ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Conectando
            </span>
          ) : connectedBank ? (
            'Banco conectado'
          ) : (
            'Conectar'
          )}
        </Button>
      </div>

      {/* 3. GMAIL */}
      <div className="py-4 flex flex-col gap-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            <Image
              src={logoGmail}
              alt="Gmail"
              width={28}
              height={22}
              className="w-7 h-auto object-contain shrink-0 mt-1"
            />
            <div className="min-w-0 text-left">
              <div className="flex items-center gap-2">
                <p className="font-text text-[15px] font-medium leading-snug text-ds-ink">Gmail</p>
                {isGoogleConnected && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#006239] bg-[#3ecf8e]/15 border border-[#3ecf8e]/30 px-1.5 py-0.5 rounded-full font-semibold">
                    Conectado
                  </span>
                )}
              </div>
              <p className="mt-0.5 font-text text-[13px] leading-relaxed text-ds-ink-2">
                Envia a nota gerada pelo seu próprio e-mail diretamente para o paciente.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 sm:self-center">
            {googleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-ds-ink-4" />
            ) : isGoogleConnected ? (
              <button
                type="button"
                onClick={() => setShowGmailTest(!showGmailTest)}
                className="h-9 px-3 rounded-[var(--radius)] border border-[#eae9ea] hover:border-ds-ink text-xs font-medium text-ds-ink transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Send className="w-3 h-3" />
                {showGmailTest ? 'Fechar teste' : 'Testar envio'}
              </button>
            ) : (
              <Button
                type="button"
                onClick={handleConnectGoogle}
                className="h-9 shrink-0 rounded-[var(--radius)] bg-ds-ink px-4 text-xs font-medium text-ds-white hover:bg-ds-ink/90 cursor-pointer"
              >
                Conectar
              </Button>
            )}
          </div>
        </div>

        {/* Feedback ou formulário de teste do Gmail */}
        {feedback?.id === 'gmail' && (
          <p className={`text-xs text-left ${feedback.type === 'success' ? 'text-[#006239]' : 'text-ds-red'}`}>
            {feedback.text}
          </p>
        )}

        {showGmailTest && isGoogleConnected && (
          <form
            onSubmit={handleSendTestEmail}
            className="flex items-center gap-2 bg-[#faf9f8] p-2.5 rounded-xl border border-[#eae9ea] max-w-md"
          >
            <input
              type="email"
              placeholder="Digite seu e-mail para testar"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              required
              className="flex-1 h-8 px-2.5 bg-white border border-[#eae9ea] rounded-lg text-xs text-ds-ink focus:outline-none focus:border-ds-ink"
            />
            <Button
              type="submit"
              disabled={actionLoading === 'gmail' || !testEmail}
              className="h-8 px-3 rounded-lg bg-ds-ink text-white text-xs font-medium hover:bg-ds-ink/90 cursor-pointer disabled:opacity-50"
            >
              {actionLoading === 'gmail' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Enviar teste'}
            </Button>
          </form>
        )}
      </div>

      {/* 4. GOOGLE DRIVE */}
      <div className="py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <Image
            src={logoDrive}
            alt="Google Drive"
            width={28}
            height={25}
            className="w-7 h-auto object-contain shrink-0 mt-0.5"
          />
          <div className="min-w-0 text-left">
            <div className="flex items-center gap-2">
              <p className="font-text text-[15px] font-medium leading-snug text-ds-ink">Google Drive</p>
              {isGoogleConnected && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#006239] bg-[#3ecf8e]/15 border border-[#3ecf8e]/30 px-1.5 py-0.5 rounded-full font-semibold">
                  Conectado
                </span>
              )}
            </div>
            <p className="mt-0.5 font-text text-[13px] leading-relaxed text-ds-ink-2">
              Armazena automaticamente as notas fiscais (PDFs e XMLs) em pasta dedicada.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 sm:self-center">
          {googleLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-ds-ink-4" />
          ) : isGoogleConnected ? (
            integration?.driveFolderId ? (
              <a
                href={`https://drive.google.com/drive/folders/${integration.driveFolderId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-3 rounded-[var(--radius)] border border-[#eae9ea] hover:border-ds-ink text-xs font-medium text-ds-ink transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                Abrir pasta <ExternalLink className="w-3 h-3 text-ds-ink-4" />
              </a>
            ) : (
              <span className="text-xs text-[#006239] font-medium flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-[#3ecf8e]" /> Backup ativo
              </span>
            )
          ) : (
            <Button
              type="button"
              onClick={handleConnectGoogle}
              className="h-9 shrink-0 rounded-[var(--radius)] bg-ds-ink px-4 text-xs font-medium text-ds-white hover:bg-ds-ink/90 cursor-pointer"
            >
              Conectar
            </Button>
          )}
        </div>
      </div>

      {/* 5. GOOGLE AGENDA */}
      <div className="py-4 flex flex-col gap-3 last:pb-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            <Image
              src={logoCalendar}
              alt="Google Agenda"
              width={28}
              height={28}
              className="w-7 h-7 object-contain shrink-0 mt-0.5"
            />
            <div className="min-w-0 text-left">
              <div className="flex items-center gap-2">
                <p className="font-text text-[15px] font-medium leading-snug text-ds-ink">Google Agenda</p>
                {isGoogleConnected && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#006239] bg-[#3ecf8e]/15 border border-[#3ecf8e]/30 px-1.5 py-0.5 rounded-full font-semibold">
                    Conectado
                  </span>
                )}
              </div>
              <p className="mt-0.5 font-text text-[13px] leading-relaxed text-ds-ink-2">
                Importa dados e datas das consultas diretamente da sua agenda do Google.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 sm:self-center">
            {googleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-ds-ink-4" />
            ) : isGoogleConnected ? (
              <Button
                type="button"
                onClick={handleImportCalendar}
                disabled={actionLoading === 'calendar'}
                className="h-9 shrink-0 rounded-[var(--radius)] bg-ds-ink px-4 text-xs font-medium text-ds-white hover:bg-ds-ink/90 cursor-pointer disabled:opacity-50"
              >
                {actionLoading === 'calendar' ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Importando...
                  </span>
                ) : (
                  'Importar consultas'
                )}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleConnectGoogle}
                className="h-9 shrink-0 rounded-[var(--radius)] bg-ds-ink px-4 text-xs font-medium text-ds-white hover:bg-ds-ink/90 cursor-pointer"
              >
                Conectar
              </Button>
            )}
          </div>
        </div>

        {feedback?.id === 'calendar' && (
          <p className={`text-xs text-left ${feedback.type === 'success' ? 'text-[#006239]' : 'text-ds-red'}`}>
            {feedback.text}
          </p>
        )}
      </div>

      <FiscalCertificateDialog
        doctorId={doctorId}
        isOpen={isFiscalModalOpen}
        onClose={() => {
          setIsFiscalModalOpen(false);
          fetchCertificateStatus();
        }}
        defaultFiscalProfile={fiscalProfile}
        onCertificateUpdated={(updated) => {
          setCertStatus(updated);
        }}
      />
    </div>
  );
}
