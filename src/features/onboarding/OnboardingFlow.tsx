'use client';

import React, { useRef, useState, useEffect } from 'react';
import Image from 'next/image';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  UploadCloud,
} from 'lucide-react';
import logoVetorNoto from '@/assets/logo-vetor-noto.svg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DEFAULT_QUICK_REPLIES } from '@/features/whatsapp/quick-replies';
import { SandboxUpgradeDialog } from '@/features/subscription/components/SandboxUpgradeDialog';
import { DashboardIntegrationsList } from '@/features/integrations/components/DashboardIntegrationsList';
import { FiscalCertificateDialog } from '@/features/integrations/components/FiscalCertificateDialog';
import { DoctorSettingsSidebar } from '@/features/dashboard/components/DoctorSettingsSidebar';



export type OnboardingViewMode =
  | 'auth'
  | 'step_1'
  | 'step_2'
  | 'step_3'
  | 'step_4'
  | 'step_5'
  | 'step_6'
  | 'invoice_success'
  | 'dashboard';

export type AuthMode = 'login' | 'register';

export function buildInstanceName(doctorId: string): string {
  const clean = doctorId.replace(/-/g, '');
  return `nw_${clean.slice(-16)}`;
}

export function DanfsePdfPreview({
  doctorId,
  numero,
  customPdfUrl,
}: {
  doctorId?: string;
  numero?: string;
  customPdfUrl?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendered, setRendered] = useState(false);
  const pdfUrl =
    customPdfUrl ||
    `/api/invoices/pdf?doctorId=${encodeURIComponent(doctorId || '')}&numero=${encodeURIComponent(numero || '25')}`;

  useEffect(() => {
    let active = true;

    async function renderPdf() {
      try {
        const win = window as any;
        if (!win.pdfjsLib) {
          await new Promise((r) => setTimeout(r, 600));
        }

        if (win.pdfjsLib && canvasRef.current) {
          win.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

          const loadingTask = win.pdfjsLib.getDocument(pdfUrl);
          const pdf = await loadingTask.promise;
          if (!active) return;

          const page = await pdf.getPage(1);
          if (!active || !canvasRef.current) return;

          const canvas = canvasRef.current;
          const context = canvas.getContext('2d');
          if (!context) return;

          const viewport = page.getViewport({ scale: 1.5 });
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          const renderContext = {
            canvasContext: context,
            viewport,
          };
          await page.render(renderContext).promise;
          if (active) setRendered(true);
        }
      } catch (err) {
        console.warn('PDF.js render fallback:', err);
      }
    }

    renderPdf();
    return () => {
      active = false;
    };
  }, [pdfUrl]);

  return (
    <div
      className="w-full select-none pointer-events-none overflow-hidden relative flex justify-center"
      style={{
        WebkitMaskImage:
          'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 35%, rgba(0,0,0,0) 82%)',
        maskImage:
          'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 35%, rgba(0,0,0,0) 82%)',
        height: '260px',
      }}
    >
      <canvas
        ref={canvasRef}
        className="w-full max-w-[440px] h-auto object-top"
        style={{ display: rendered ? 'block' : 'none' }}
      />
      {!rendered && (
        <object
          data={pdfUrl}
          type="application/pdf"
          className="w-full h-full border-0 pointer-events-none"
        >
          <iframe
            src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`}
            className="w-full h-full border-0 pointer-events-none"
          />
        </object>
      )}
    </div>
  );
}

export interface OnboardingFlowProps {
  view: OnboardingViewMode;
  authMode: AuthMode;
  loading: boolean;
  errorMsg: string;
  checkingSession: boolean;
  doctorId: string;
  email: string;
  password: string;
  phone: string;
  otpCode: string;
  otpSent: boolean;
  uploadedPdfUrl: string;
  firstName: string;
  lastName: string;
  step1Loading: boolean;
  xmlFileName: string;
  fiscalLoading: boolean;
  fiscalProfile: any;
  fiscalError: string;
  certFileName: string;
  certPassword: string;
  showCertPassword: boolean;
  certFile: File | null;
  certLoading: boolean;
  certValidated: any;
  certError: string;
  qrCode: string;
  qrLoading: boolean;
  qrError: string;
  whatsappConnected: boolean;
  firstInvoiceLoading: boolean;
  firstInvoiceError: string;
  supportedBanks: any[];
  selectedBank: string;
  bankLoading: boolean;
  bankError: string;
  connectedBank: any;
  countdown: number;
  isSubscriber: boolean;
  updatingSubscription: boolean;
  copiedShortcut: string | null;
  homologationInvoice: any;
  monthlyInvoicesUsed?: number;
  monthlyInvoicesLimit?: number;

  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  setPhone: (value: string) => void;
  setOtpCode: (value: string) => void;
  setOtpSent: (value: boolean) => void;
  setFirstName: (value: string) => void;
  setLastName: (value: string) => void;
  setAuthMode: (value: AuthMode) => void;
  setSelectedBank: (value: string) => void;
  setShowCertPassword: (value: boolean) => void;
  setCertFileName: (value: string) => void;
  setCertFile: (value: File | null) => void;
  setCertPassword: (value: string) => void;
  setInstanceName: (value: string) => void;
  setQrCode: (value: string) => void;
  setView: (value: OnboardingViewMode) => void;
  handleAuthSubmit: (e: React.FormEvent) => Promise<void>;
  handleResendOtp: () => Promise<void>;
  handleSaveStep1: (e: React.FormEvent) => Promise<void>;
  handleXmlUpload: (file: File) => Promise<void>;
  handleValidateCertificate: (e: React.FormEvent) => Promise<void>;
  handleGenerateQr: () => Promise<void>;
  handleReconnectWhatsApp: () => Promise<void>;
  handleEmitFirstInvoice: () => Promise<void>;
  handleConnectBank: (bankId: string) => Promise<void>;
  handleLogout: () => void;
  handleToggleSubscription: () => Promise<void>;
  handleGoToDashboard: () => void;
  copyToClipboard: (text: string, id: string) => void;
}

function OtpInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.padEnd(6, ' ').slice(0, 6).split('');

  const focusSlot = (index: number) => {
    inputRefs.current[Math.max(0, Math.min(index, 5))]?.focus();
  };

  const updateSlot = (index: number, nextValue: string) => {
    const cleanValue = nextValue.replace(/\D/g, '');
    if (!cleanValue) {
      const nextDigits = digits.map((digit, digitIndex) => (
        digitIndex === index ? '' : digit.trim()
      )).join('');
      onChange(nextDigits);
      return;
    }

    const nextDigits = digits.map((digit) => digit.trim());
    cleanValue.split('').forEach((digit, offset) => {
      if (index + offset < 6) nextDigits[index + offset] = digit;
    });
    onChange(nextDigits.join('').slice(0, 6));
    focusSlot(index + cleanValue.length);
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index].trim() && index > 0) {
      focusSlot(index - 1);
    }
    if (event.key === 'ArrowLeft') focusSlot(index - 1);
    if (event.key === 'ArrowRight') focusSlot(index + 1);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pastedCode = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pastedCode);
    focusSlot(pastedCode.length);
  };

  return (
    <div className="w-full">
      <label htmlFor="otp-slot-0" className="sr-only">Código de acesso</label>
      <div
        role="group"
        aria-label="Código de acesso de 6 dígitos"
        className="flex w-full items-center justify-between gap-2"
      >
        {digits.map((digit, index) => (
          <React.Fragment key={index}>
            {index === 3 && <span aria-hidden="true" className="h-px w-2 shrink-0 bg-[#d9d5d3]" />}
            <input
              id={`otp-slot-${index}`}
              ref={(element) => { inputRefs.current[index] = element; }}
              type="text"
              inputMode="numeric"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              maxLength={6}
              value={digit.trim()}
              onChange={(event) => updateSlot(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={handlePaste}
              onFocus={(event) => event.currentTarget.select()}
              aria-label={`Dígito ${index + 1}`}
              className="h-12 min-w-0 flex-1 rounded-lg border border-[#e5e5e5] bg-white text-center font-text text-[1.0625rem] text-ds-ink outline-none transition-colors focus:border-ds-ink-2 focus:bg-[#fbfaf9]"
            />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export function OnboardingFlow(props: OnboardingFlowProps) {
  const {
    view,
    authMode,
    loading,
    errorMsg,
    checkingSession,
    doctorId,
    email,
    password,
    phone,
    otpCode,
    otpSent,
    firstName,
    lastName,
    step1Loading,
    xmlFileName,
    fiscalLoading,
    fiscalProfile,
    fiscalError,
    certFileName,
    certPassword,
    showCertPassword,
    certLoading,
    certError,
    qrCode,
    qrLoading,
    qrError,
    whatsappConnected,
    firstInvoiceLoading,
    firstInvoiceError,
    supportedBanks,
    selectedBank,
    bankLoading,
    bankError,
    connectedBank,
    countdown,
    isSubscriber,
    updatingSubscription,
    copiedShortcut,
    homologationInvoice,
    setEmail,
    setPassword,
    setPhone,
    setOtpCode,
    setOtpSent,
    setFirstName,
    setLastName,
    setAuthMode,
    setSelectedBank,
    setShowCertPassword,
    setCertFile,
    setCertFileName,
    setCertPassword,
    setView,
    handleAuthSubmit,
    handleResendOtp,
    handleSaveStep1,
    handleXmlUpload,
    handleValidateCertificate,
    handleGenerateQr,
    handleReconnectWhatsApp,
    handleEmitFirstInvoice,
    handleConnectBank,
    handleLogout,
    handleToggleSubscription,
    handleGoToDashboard,
    copyToClipboard,
    uploadedPdfUrl,
  } = props;

  const [isFiscalDialogOpen, setIsFiscalDialogOpen] = useState(false);

  if (checkingSession) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white text-ds-ink">
        <Loader2 className="h-5 w-5 animate-spin text-ds-ink" />
      </div>
    );
  }

  if (view === 'dashboard') {
    return (
      <div className="fixed inset-0 w-full h-full overflow-y-auto bg-white flex flex-col selection:bg-ds-ink selection:text-white font-text">
        <header className="w-full shrink-0 border-b border-[#eae9ea] px-6 sm:px-12 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src={logoVetorNoto} alt="Noto" width={28} height={25} className="h-7 w-auto object-contain" priority />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="font-text font-medium text-sm text-ds-ink">
                {firstName && lastName
                  ? `${firstName} ${lastName}`
                  : props.fiscalProfile?.razaoSocial || (email ? email.split('@')[0] : 'Consultório Médico')}
              </span>
              <button
                type="button"
                onClick={handleToggleSubscription}
                disabled={updatingSubscription}
                className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-[var(--radius)] transition-all cursor-pointer border ${
                  isSubscriber
                    ? 'bg-[#73a89a]/15 text-[#2c544b] border-[#73a89a]/30 hover:bg-[#73a89a]/25'
                    : 'bg-[#f4efec] text-[#585254] border-[#eae9ea] hover:bg-[#ebe6e3]'
                }`}
              >
                {updatingSubscription ? '...' : isSubscriber ? 'Assinante' : 'Sandbox'}
              </button>
            </div>

            <span className="text-[#eae9ea] select-none">·</span>

            <button
              type="button"
              onClick={() => setIsFiscalDialogOpen(true)}
              className="text-xs text-ds-ink-2 hover:text-ds-ink transition-colors cursor-pointer font-text"
              title="Configurar Certificado A1 e Senha"
            >
              Certificado A1
            </button>

            <span className="text-[#eae9ea] select-none">·</span>

            <button
              type="button"
              onClick={handleLogout}
              className="text-xs text-ds-ink-2 hover:text-ds-ink transition-colors cursor-pointer font-text"
            >
              sair
            </button>
          </div>
        </header>

        <div className="flex-1 w-full flex flex-col md:flex-row min-h-0">
          {/* Sidebar simples no lado esquerdo apenas com texto */}
          <DoctorSettingsSidebar
            doctorId={doctorId}
            initialName={
              firstName && lastName
                ? `${firstName} ${lastName}`
                : props.fiscalProfile?.razaoSocial || ''
            }
            onProfileUpdated={(updated) => {
              if (updated.name) {
                const parts = updated.name.split(' ');
                setFirstName(parts[0] || '');
                setLastName(parts.slice(1).join(' ') || '');
              }
            }}
          />

          {/* Área principal do painel */}
          <main className="flex-1 overflow-y-auto px-6 sm:px-12 py-10 flex flex-col items-center animate-in fade-in duration-300">
            <div className="w-full max-w-[620px] flex flex-col items-start">
              <div className="w-full text-left mb-8 space-y-2">
                <h2 className="font-display font-medium text-[28px] sm:text-[32px] text-ds-ink tracking-tight text-left">
                  Comandos Noto
                </h2>
                <p className="font-text font-normal text-[15px] text-ds-ink-2 leading-relaxed text-left">
                  Vá em <strong>Configurações &gt; Ferramentas Comerciais &gt; Respostas Rápidas</strong> e em seguida adicione cada uma dessas respostas rápidas no WhatsApp, e use durante o atendimento conforme indicado.
                </p>
              </div>

              <div className="w-full flex flex-col gap-3.5">
                {DEFAULT_QUICK_REPLIES.map((cmd) => {
                  const isShortcutCopied = copiedShortcut === `sc-${cmd.shortcut}`;
                  const isTextCopied = copiedShortcut === `txt-${cmd.shortcut}`;
                  const copyableText = cmd.copyablePhrase || cmd.triggerPhrase;
                  const cleanShortcut = cmd.shortcut.replace(/^\//, '');

                  return (
                    <div key={cmd.shortcut} className="w-full flex flex-col text-left">
                      {/* Linha com atalho '/' + copiar + texto padrão + copiar */}
                      <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1">
                        <span className="font-mono text-[13px] font-semibold text-ds-ink bg-[#f4efec] px-2 py-0.5 rounded-[var(--radius)] shrink-0">
                          {cmd.shortcut}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(cleanShortcut, `sc-${cmd.shortcut}`)}
                          className="p-1 rounded hover:bg-[#f4efec] text-ds-ink-4 hover:text-ds-ink transition-colors cursor-pointer inline-flex items-center gap-1 text-[11px] font-text shrink-0"
                          title={`Copiar atalho ${cleanShortcut}`}
                        >
                          {isShortcutCopied ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-ds-teal" />
                              <span className="text-ds-teal text-[11px]">copiado</span>
                            </>
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <span className="text-[#d4d4d8] select-none text-xs">·</span>

                        <div className="inline-flex items-center gap-1.5 flex-1 min-w-0">
                          <span className="font-text text-[14px] sm:text-[15px] text-ds-ink font-normal">
                            {copyableText}
                          </span>
                          {cmd.completionExample && (
                            <span
                              className="text-[#a1a1aa] font-normal text-[14px] sm:text-[15px] select-none shrink-0"
                              title="Completar na hora do envio (não é copiado)"
                            >
                              {cmd.completionExample}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => copyToClipboard(copyableText, `txt-${cmd.shortcut}`)}
                            className="shrink-0 p-1 rounded hover:bg-[#f4efec] text-ds-ink-4 hover:text-ds-ink transition-colors cursor-pointer inline-flex items-center gap-1 text-[11px] font-text"
                            title="Copiar texto padrão"
                          >
                            {isTextCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-ds-teal" />
                                <span className="text-ds-teal text-[11px]">copiado</span>
                              </>
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <p className="font-text text-[13px] text-ds-ink-2 mt-0.5 leading-normal">
                        {cmd.description}
                      </p>
                    </div>
                  );
                })}
              </div>

              <DashboardIntegrationsList
                doctorId={doctorId}
                qrLoading={qrLoading}
                handleReconnectWhatsApp={handleReconnectWhatsApp}
                bankLoading={bankLoading}
                connectedBank={connectedBank}
                selectedBank={selectedBank}
                handleConnectBank={handleConnectBank}
                bankError={bankError}
                fiscalProfile={props.fiscalProfile}
              />
            </div>
          </main>
        </div>


        <SandboxUpgradeDialog
          doctorId={doctorId}
          isSubscriber={isSubscriber}
          monthlyInvoicesUsed={props.monthlyInvoicesUsed}
          monthlyInvoicesLimit={props.monthlyInvoicesLimit}
        />

        <FiscalCertificateDialog
          doctorId={doctorId}
          isOpen={isFiscalDialogOpen}
          onClose={() => setIsFiscalDialogOpen(false)}
          defaultFiscalProfile={props.fiscalProfile}
        />
      </div>
    );
  }


  return (
    <div className="fixed inset-0 w-full h-full overflow-y-auto bg-white flex flex-col items-center justify-center p-6 selection:bg-ds-ink selection:text-white">
      <div className={`w-full ${view === 'invoice_success' ? 'max-w-[480px]' : 'max-w-[340px]'} flex flex-col justify-between min-h-[360px]`}>
        <div className="flex flex-col gap-[1.8em]">
          {view === 'auth' && (
            <div className="flex w-full flex-col items-start text-left">
              <h1 className="font-display font-medium text-[2rem] leading-[1.15] tracking-[-0.7px] text-ds-ink">
                Acessar o Noto
              </h1>
              <p className="mt-3 font-text text-[0.9375rem] leading-relaxed text-ds-ink-2">
                {otpSent
                  ? 'Digite o código de 6 dígitos enviado para seu WhatsApp.'
                  : 'Vamos enviar um código para validar seu WhatsApp.'}
              </p>

              {errorMsg && <div className="text-xs text-ds-red text-left">{errorMsg}</div>}

              <form onSubmit={handleAuthSubmit} className="mt-8 flex w-full flex-col items-start gap-5 text-left">
                <div className="w-full">
                  <label htmlFor="phone" className="sr-only">Número de celular</label>
                  <div className="relative flex h-12 w-full items-center gap-2.5 rounded border border-[#e5e5e5] bg-white px-3.5 py-[9px] transition-colors focus-within:border-ds-ink-2">
                    <span className="flex shrink-0 items-center gap-1 rounded-[3px] py-[5px] pl-1.5 pr-1 text-[15px] font-medium text-ds-ink">
                      <span aria-hidden="true" className="inline-block h-3.5 w-5 overflow-hidden rounded-[2px] bg-[#009b3a]">
                        <span className="mx-auto mt-[3px] block h-2 w-2 rotate-45 bg-[#fedf00]" />
                      </span>
                      <span>+55</span>
                    </span>
                    <span aria-hidden="true" className="h-[22px] w-px shrink-0 bg-[#e5e5e5]" />
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      spellCheck={false}
                      placeholder="(51) 98193-6133"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      disabled={otpSent}
                      autoFocus
                      className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 text-[1.0625rem] text-ds-ink placeholder:text-ds-ink-4 focus:border-0 focus:outline-none focus:ring-0 focus-visible:ring-0"
                    />
                  </div>
                </div>

                {otpSent && (
                  <OtpInput
                    value={otpCode}
                    onChange={setOtpCode}
                  />
                )}

                {!otpSent && (
                  <p className="flex flex-wrap gap-x-3 gap-y-1 text-left font-text text-[0.875rem] leading-relaxed text-ds-ink-2">
                    <a href="/termos" className="underline underline-offset-2">Termos de Uso</a>
                    <a href="/privacidade" className="underline underline-offset-2">Política de Privacidade</a>
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ds-ink text-[0.9375rem] font-medium text-ds-white transition-all hover:opacity-90 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-ink/40 disabled:pointer-events-none disabled:opacity-40"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      {otpSent ? 'Entrar' : 'Enviar código'}
                      <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
                    </>
                  )}
                </Button>

                {otpSent && (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading}
                    className="w-full text-center font-text text-sm text-ds-ink-2 underline underline-offset-2 transition-colors hover:text-ds-ink disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reenviar código
                  </button>
                )}
              </form>
            </div>
          )}

          {view === 'step_1' && (
            <div className="flex w-full flex-col items-start text-left">
              <div className="space-y-1.5 text-left">
                <h1 className="font-display font-medium text-[2rem] leading-[1.15] tracking-[-0.7px] text-ds-ink">
                  Nome e sobrenome
                </h1>
                <p className="mt-3 font-text text-[0.9375rem] leading-relaxed text-ds-ink-2">
                  Informe seu nome e sobrenome para personalizarmos seu acesso.
                </p>
              </div>

              {errorMsg && <div className="mt-5 text-xs text-ds-red text-left">{errorMsg}</div>}

              <form onSubmit={handleSaveStep1} className="mt-8 flex w-full flex-col gap-5 text-left">
                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="w-full">
                    <label htmlFor="first-name" className="sr-only">Nome</label>
                    <Input
                      id="first-name"
                      type="text"
                      placeholder="Nome"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      autoFocus
                      className="h-12 w-full rounded border border-[#e5e5e5] bg-white px-3.5 text-[1.0625rem] text-ds-ink placeholder:text-ds-ink-4 focus:border-ds-ink-2 focus:outline-none focus:ring-0 focus-visible:ring-0"
                    />
                  </div>
                  <div className="w-full">
                    <label htmlFor="last-name" className="sr-only">Sobrenome</label>
                    <Input
                      id="last-name"
                      type="text"
                      placeholder="Sobrenome"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      className="h-12 w-full rounded border border-[#e5e5e5] bg-white px-3.5 text-[1.0625rem] text-ds-ink placeholder:text-ds-ink-4 focus:border-ds-ink-2 focus:outline-none focus:ring-0 focus-visible:ring-0"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={step1Loading || !firstName.trim() || !lastName.trim()}
                  className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ds-ink text-[0.9375rem] font-medium text-ds-white transition-all hover:opacity-90 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-ink/40 disabled:pointer-events-none disabled:opacity-40"
                >
                  {step1Loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Continuar <span aria-hidden="true">&rarr;</span>
                    </>
                  )}
                </Button>
              </form>
            </div>
          )}

          {view === 'step_2' && (
            <div className="flex flex-col gap-[1.8em]">
              <div className="space-y-1.5 text-left">
                <h1 className="font-display font-medium text-[2rem] leading-tight text-ds-ink tracking-tight">
                  Arraste sua última nota fiscal
                </h1>
                <p className="font-text font-normal text-[15px] text-ds-ink-2 leading-normal">
                  Anexe o XML de qualquer NFS-e emitida anteriormente pelo seu CNPJ.
                </p>
              </div>

              {fiscalError && <div className="text-xs text-ds-red text-left">{fiscalError}</div>}

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) {
                    handleXmlUpload(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => {
                  const el = document.getElementById('step2-xml-input');
                  if (el) el.click();
                }}
                className="border border-dashed border-[#d4d4d8] hover:border-[#737373] rounded-[var(--radius)] p-6 text-center cursor-pointer transition-colors"
              >
                <input
                  id="step2-xml-input"
                  type="file"
                  accept=".xml,text/xml,application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      handleXmlUpload(e.target.files[0]);
                    }
                  }}
                />

                <UploadCloud className="w-6 h-6 text-ds-ink mx-auto mb-2" />
                <p className="text-sm font-medium text-ds-ink">
                  {xmlFileName || 'Selecionar arquivo XML ou PDF (.xml, .pdf)'}
                </p>
                <p className="text-xs text-ds-ink-4 mt-0.5">
                  {fiscalProfile ? 'Dados fiscais extraídos com sucesso' : 'Arraste ou clique para enviar'}
                </p>

                {fiscalLoading && (
                  <div className="mt-3 flex items-center justify-center gap-2 text-xs text-ds-ink">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Extraindo dados...
                  </div>
                )}
              </div>

              {fiscalProfile && (
                <div className="text-left text-xs text-ds-ink-2 space-y-1 pt-1">
                  <div><strong>Prestador:</strong> {fiscalProfile.razaoSocial}</div>
                  <div><strong>CNPJ:</strong> {fiscalProfile.cnpj}</div>
                  <div><strong>Regime:</strong> {fiscalProfile.isOptanteSimples ? 'Simples Nacional' : 'Lucro Presumido'}</div>
                </div>
              )}

              <Button
                type="button"
                disabled={!fiscalProfile}
                onClick={() => setView('step_3')}
                className="w-full h-11 bg-ds-ink text-ds-white hover:bg-ds-ink/90 rounded-[var(--radius)] text-sm font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                Continuar <span aria-hidden="true">&rarr;</span>
              </Button>
            </div>
          )}

          {view === 'step_3' && (
            <div className="flex flex-col gap-[1.8em]">
              <div className="space-y-1.5 text-left">
                <h1 className="font-display font-medium text-[2rem] leading-tight text-ds-ink tracking-tight">
                  Válide seu certificado A1.
                </h1>
                <p className="font-text font-normal text-[15px] text-ds-ink-2 leading-normal">
                  Selecione o arquivo .pfx ou .p12 do seu e-CNPJ e informe a senha.
                </p>
              </div>

              {certError && <div className="text-xs text-ds-red text-left">{certError}</div>}

              <form onSubmit={handleValidateCertificate} className="flex flex-col gap-[1.8em] text-left">
                <div
                  onClick={() => {
                    const el = document.getElementById('step3-cert-input');
                    if (el) el.click();
                  }}
                  className="h-11 px-3.5 border border-[#e5e5e5] rounded-[var(--radius)] flex items-center justify-between cursor-pointer hover:border-[#737373] transition-colors"
                >
                  <input
                    id="step3-cert-input"
                    type="file"
                    accept=".pfx,.p12"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        props.setCertFile(e.target.files[0]);
                        props.setCertFileName(e.target.files[0].name);
                      }
                    }}
                  />
                  <span className="text-sm text-ds-ink truncate">{certFileName || 'Arquivo .pfx ou .p12'}</span>
                  <span className="text-xs text-ds-ink-4">Procurar</span>
                </div>

                <div className="relative">
                  <Input
                    type={showCertPassword ? 'text' : 'password'}
                    placeholder="Senha do certificado"
                    value={certPassword}
                    onChange={(e) => setCertPassword(e.target.value)}
                    required
                    className="h-11 px-3.5 bg-white border border-[#e5e5e5] rounded-[var(--radius)] text-sm text-ds-ink placeholder:text-ds-ink-4 focus:border-[#737373] focus:outline-none focus:ring-0 focus-visible:ring-0 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCertPassword(!showCertPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ds-ink-4 hover:text-ds-ink"
                  >
                    {showCertPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <Button
                  type="submit"
                  disabled={certLoading || !certPassword}
                  className="w-full h-11 bg-ds-ink text-ds-white hover:bg-ds-ink/90 rounded-[var(--radius)] text-sm font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {certLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Validar e continuar <span aria-hidden="true">&rarr;</span>
                    </>
                  )}
                </Button>
              </form>
            </div>
          )}

          {view === 'step_4' && (
            <div className="flex flex-col gap-[1.8em]">
              <div className="space-y-1.5 text-left">
                <h1 className="font-display font-medium text-[2rem] leading-tight text-ds-ink tracking-tight">
                  Conecte seu WhatsApp ao Noto
                </h1>
                <p className="font-text font-normal text-[15px] text-ds-ink-2 leading-normal">
                  Escaneie o QR Code com o WhatsApp do seu consultório.
                </p>
              </div>

              {qrError && <div className="text-xs text-ds-red text-left">{qrError}</div>}

              <div className="text-center py-2">
                {whatsappConnected ? (
                  <div className="text-sm font-medium text-ds-teal py-4 flex items-center justify-center gap-2">
                    <Check className="w-5 h-5" /> WhatsApp Conectado com sucesso!
                  </div>
                ) : qrCode ? (
                  <div className="space-y-3">
                    <img
                      src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                      alt="QR Code WhatsApp"
                      className="w-52 h-52 object-contain mx-auto border border-[#e5e5e5] rounded-[var(--radius)] p-2"
                    />
                    <p className="text-xs text-ds-ink-4">
                      WhatsApp &gt; Aparelhos conectados &gt; Conectar um aparelho
                    </p>
                  </div>
                ) : (
                  <div className="py-2">
                    <Button
                      type="button"
                      onClick={handleGenerateQr}
                      disabled={qrLoading}
                      className="w-full h-11 bg-ds-ink text-ds-white hover:bg-ds-ink/90 rounded-[var(--radius)] text-sm font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {qrLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Conectar'}
                    </Button>
                    <p className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-center font-text text-[12px] leading-relaxed text-ds-ink-4">
                      <a href="/termos" className="underline underline-offset-2 hover:text-ds-ink">
                        Termos de Uso
                      </a>
                      <a href="/privacidade" className="underline underline-offset-2 hover:text-ds-ink">
                        Política de Privacidade
                      </a>
                      <a href="/termo-consentimento" className="underline underline-offset-2 hover:text-ds-ink">
                        Dados Sensíveis
                      </a>
                    </p>
                  </div>
                )}
              </div>

              {whatsappConnected && (
                <Button
                  type="button"
                  onClick={() => setView('step_5')}
                  className="w-full h-11 bg-ds-ink text-ds-white hover:bg-ds-ink/90 rounded-[var(--radius)] text-sm font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  Continuar <span aria-hidden="true">&rarr;</span>
                </Button>
              )}
            </div>
          )}

          {view === 'step_5' && (
            <div className="flex flex-col gap-[1.8em]">
              <div className="space-y-1.5 text-left">
                <h1 className="font-display font-medium text-[2rem] leading-tight text-ds-ink tracking-tight">
                  Emitir primeira nota
                </h1>
                <p className="font-text font-normal text-[15px] text-ds-ink-2 leading-normal">
                  Apartir de agora conseguimos registrar pacientes e consultas. Vamos emitir sua primeira nota?
                </p>
              </div>

              {firstInvoiceError && <div className="text-xs text-ds-red text-left">{firstInvoiceError}</div>}

              <div className="flex flex-col gap-[1.8em] pt-2">
                <Button
                  type="button"
                  disabled={firstInvoiceLoading}
                  onClick={handleEmitFirstInvoice}
                  className="w-full h-11 bg-ds-ink text-ds-white hover:bg-ds-ink/90 rounded-[var(--radius)] text-sm font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {firstInvoiceLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Emitir nota de teste <span aria-hidden="true">&rarr;</span>
                    </>
                  )}
                </Button>

                <button
                  type="button"
                  onClick={handleGoToDashboard}
                  className="text-xs text-ds-ink-4 hover:text-ds-ink block mx-auto underline underline-offset-4 cursor-pointer pt-1"
                >
                  Ir para o painel
                </button>
              </div>
            </div>
          )}

          {view === 'invoice_success' && (
            <div className="w-full flex flex-col items-center text-center space-y-5 animate-in fade-in duration-500">
              <DanfsePdfPreview
                doctorId={doctorId}
                numero={homologationInvoice?.data?.numero || '25'}
                customPdfUrl={uploadedPdfUrl || homologationInvoice?.data?.url_danfse}
              />

              <div className="space-y-2 pt-1 text-center">
                <h1 className="font-display font-medium text-[28px] sm:text-[32px] leading-tight text-ds-ink tracking-tight">
                  Primeira nota emitida!
                </h1>
                <p className="font-text font-normal text-[15px] text-ds-ink-2 max-w-[360px] mx-auto leading-relaxed">
                  Essa nota foi emitida em sendbox. É real mas sem validação juridica.
                </p>
                <div className="pt-2 space-y-2">
                  <p className="font-text font-normal text-[13px] text-ds-ink-4">
                    Abrindo painel em {countdown} {countdown === 1 ? 'segundo' : 'segundos'}
                  </p>
                  <button
                    type="button"
                    onClick={handleGoToDashboard}
                    className="text-xs font-text text-ds-teal hover:underline cursor-pointer inline-flex items-center gap-1 font-medium pt-0.5"
                  >
                    Acessar painel agora &rarr;
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {view.startsWith('step_') && (
          <div className="pt-6 pb-2 text-center flex items-center justify-center gap-2 text-[12px] text-[#a1a1aa] font-text shrink-0">
            <span className="truncate max-w-[220px]">{email || 'email@exemplo.com'}</span>
            <span className="text-[#d4d4d8]">·</span>
            <button
              type="button"
              onClick={handleLogout}
              className="text-[#a1a1aa] hover:text-ds-ink underline underline-offset-2 transition-colors cursor-pointer"
            >
              sair
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
