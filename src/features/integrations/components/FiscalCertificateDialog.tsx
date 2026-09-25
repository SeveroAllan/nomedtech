'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileKey,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Eye,
  EyeOff,
  Send,
  UploadCloud,
  FileCheck2,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CertificateInfo {
  status: string;
  ambiente: string;
  ambienteCodigo?: number;
  cnpj: string;
  razaoSocial?: string;
  inscricaoMunicipal?: string;
  uf?: string;
  tipo?: string;
}

interface FiscalCertificateDialogProps {
  doctorId: string;
  isOpen: boolean;
  onClose: () => void;
  defaultFiscalProfile?: {
    cnpj?: string;
    razaoSocial?: string;
    inscricaoMunicipal?: string;
    cidade?: string;
    uf?: string;
    cnae?: string;
  } | null;
  onCertificateUpdated?: (certInfo: CertificateInfo) => void;
}

export function FiscalCertificateDialog({
  doctorId,
  isOpen,
  onClose,
  defaultFiscalProfile,
  onCertificateUpdated,
}: FiscalCertificateDialogProps) {
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [certInfo, setCertInfo] = useState<CertificateInfo | null>(null);

  // Form states
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [cnpj, setCnpj] = useState('');
  const [im, setIm] = useState('');

  // Submission & feedback states
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Test invoice states
  const [testingInvoice, setTestingInvoice] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState('');

  const fetchCertificateStatus = useCallback(async () => {
    if (!doctorId) return;
    setLoadingStatus(true);
    try {
      const res = await fetch(`/api/fiscal/certificate?doctorId=${encodeURIComponent(doctorId)}`);
      const data = await res.json();
      if (res.ok && data.certificate) {
        setCertInfo(data.certificate);
        if (data.certificate.cnpj && !cnpj) setCnpj(data.certificate.cnpj);
        if (data.certificate.inscricaoMunicipal && !im) setIm(data.certificate.inscricaoMunicipal);
      }
    } catch (err: any) {
      console.warn('Erro ao consultar status do certificado:', err);
    } finally {
      setLoadingStatus(false);
    }
  }, [doctorId, cnpj, im]);

  useEffect(() => {
    if (isOpen) {
      setSaveSuccess(false);
      setErrorMessage('');
      setTestResult(null);
      setTestError('');
      if (defaultFiscalProfile?.cnpj && !cnpj) {
        setCnpj(defaultFiscalProfile.cnpj);
      }
      if (defaultFiscalProfile?.inscricaoMunicipal && !im) {
        setIm(defaultFiscalProfile.inscricaoMunicipal);
      }
      fetchCertificateStatus();
    }
  }, [isOpen, fetchCertificateStatus, defaultFiscalProfile, cnpj, im]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setErrorMessage('');
    }
  };

  const handleSaveCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file && !certInfo) {
      setErrorMessage('Selecione o arquivo do certificado (.pfx ou .p12).');
      return;
    }
    if (!password) {
      setErrorMessage('Informe a senha do certificado.');
      return;
    }

    setSaving(true);
    setErrorMessage('');
    setSaveSuccess(false);

    try {
      const formData = new FormData();
      if (file) formData.append('certificate', file);
      formData.append('doctorId', doctorId);
      formData.append('password', password);
      formData.append('cnpj', cnpj || defaultFiscalProfile?.cnpj || '');
      formData.append('razaoSocial', defaultFiscalProfile?.razaoSocial || '');
      formData.append('inscricaoMunicipal', im || defaultFiscalProfile?.inscricaoMunicipal || '');
      formData.append('cidade', defaultFiscalProfile?.cidade || '');
      formData.append('uf', defaultFiscalProfile?.uf || '');
      formData.append('cnae', defaultFiscalProfile?.cnae || '');

      const res = await fetch('/api/fiscal/certificate', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao salvar certificado.');
      }

      setSaveSuccess(true);
      setPassword('');
      setFile(null);
      setFileName('');
      await fetchCertificateStatus();
      if (onCertificateUpdated && data.certificate) {
        onCertificateUpdated(data.certificate);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao processar certificado A1.');
    } finally {
      setSaving(false);
    }
  };

  const handleEmitTestInvoice = async () => {
    setTestingInvoice(true);
    setTestError('');
    setTestResult(null);

    try {
      const res = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId,
          amount: 1.0,
          appointmentDate: new Date().toISOString().slice(0, 10),
          patient: {
            name: 'Paciente Demonstração Homologação',
            cpf: (cnpj || defaultFiscalProfile?.cnpj || '00000000000').replace(/\D/g, '').slice(0, 11).padEnd(11, '0'),
            email: 'teste@noto.app',
            phone: '11999999999',
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao processar nota fiscal de teste.');
      }

      setTestResult(data);
    } catch (err: any) {
      setTestError(err.message || 'Não foi possível emitir a NFS-e de teste.');
    } finally {
      setTestingInvoice(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fiscal-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-[500px] bg-white rounded-2xl border border-[#eae9ea] shadow-2xl p-6 relative flex flex-col gap-5 max-h-[90vh] overflow-y-auto font-text">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#eae9ea] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#faf9f8] border border-[#eae9ea] flex items-center justify-center text-ds-ink">
              <FileKey className="w-5 h-5" />
            </div>
            <div>
              <h2 id="fiscal-dialog-title" className="font-display font-medium text-lg text-ds-ink leading-tight">
                Configurações Fiscais & Certificado A1
              </h2>
              <p className="font-text text-xs text-ds-ink-2">
                Convênio Nacional SEFIN / Homologação NFS-e
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="p-1.5 rounded-lg text-ds-ink-4 hover:text-ds-ink hover:bg-[#faf9f8] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current status card */}
        <div className="p-3.5 bg-[#faf9f8] border border-[#eae9ea] rounded-xl text-left space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ds-ink-2">Status do Certificado:</span>
            {loadingStatus ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-ds-ink-4" />
            ) : certInfo ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#006239] bg-[#3ecf8e]/15 border border-[#3ecf8e]/30 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-[#006239]" />
                Ativo em Homologação
              </span>
            ) : (
              <span className="text-[11px] font-medium text-[#854d0e] bg-[#fef9c3] border border-[#fef08a] px-2 py-0.5 rounded-full">
                Não configurado
              </span>
            )}
          </div>

          {certInfo && (
            <div className="text-xs text-ds-ink space-y-1 pt-1 border-t border-[#eae9ea]">
              {certInfo.cnpj && (
                <p>
                  <span className="text-ds-ink-4">CNPJ:</span> <strong>{certInfo.cnpj}</strong>
                </p>
              )}
              {certInfo.inscricaoMunicipal && (
                <p>
                  <span className="text-ds-ink-4">Inscrição Municipal:</span>{' '}
                  <strong>{certInfo.inscricaoMunicipal}</strong>
                </p>
              )}
              <p>
                <span className="text-ds-ink-4">Ambiente:</span>{' '}
                <span className="text-[#006239] font-medium">{certInfo.ambiente}</span>
              </p>
            </div>
          )}
        </div>

        {/* Upload form */}
        <form onSubmit={handleSaveCertificate} className="flex flex-col gap-3.5 text-left">
          <div className="space-y-1">
            <label className="text-xs font-medium text-ds-ink">Arquivo do Certificado (.pfx ou .p12)</label>
            <div
              onClick={() => {
                const el = document.getElementById('cert-upload-input');
                if (el) el.click();
              }}
              className="h-11 px-3.5 border border-[#e5e5e5] rounded-[var(--radius)] flex items-center justify-between cursor-pointer hover:border-[#737373] transition-colors bg-white"
            >
              <input
                id="cert-upload-input"
                type="file"
                accept=".pfx,.p12"
                className="hidden"
                onChange={handleFileChange}
              />
              <span className="text-xs text-ds-ink truncate">
                {fileName || (certInfo ? 'Substituir certificado atual (.p12/.pfx)' : 'Selecionar arquivo .p12 ou .pfx')}
              </span>
              <span className="text-xs text-ds-ink-4 font-medium flex items-center gap-1 shrink-0">
                <UploadCloud className="w-3.5 h-3.5" /> Procurar
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-ds-ink">Senha do Certificado</label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Digite a senha do arquivo .pfx / .p12"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 px-3.5 bg-white border border-[#e5e5e5] rounded-[var(--radius)] text-xs text-ds-ink placeholder:text-ds-ink-4 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ds-ink-4 hover:text-ds-ink"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-ds-ink">CNPJ do Prestador</label>
              <Input
                type="text"
                placeholder="00.000.000/0000-00"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                className="h-10 px-3 bg-white border border-[#e5e5e5] rounded-[var(--radius)] text-xs text-ds-ink"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-ds-ink">Inscrição Municipal</label>
              <Input
                type="text"
                placeholder="Inscrição Municipal"
                value={im}
                onChange={(e) => setIm(e.target.value)}
                className="h-10 px-3 bg-white border border-[#e5e5e5] rounded-[var(--radius)] text-xs text-ds-ink"
              />
            </div>
          </div>

          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-ds-red flex items-start gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="p-2.5 rounded-lg bg-green-50 border border-green-200 text-xs text-[#006239] flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Certificado A1 e credenciais salvos com sucesso!</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={saving || !password}
            className="w-full h-10 bg-ds-ink text-ds-white hover:bg-ds-ink/90 rounded-[var(--radius)] text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando e validando...
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" /> Salvar e Atualizar Certificado A1
              </>
            )}
          </Button>
        </form>

        {/* Section: Test NFS-e in Homologation */}
        <div className="border-t border-[#eae9ea] pt-4 text-left space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-ds-ink">Testar Emissão NFS-e em Homologação</p>
              <p className="text-[11px] text-ds-ink-2">
                Emite uma nota de teste de R$ 1,00 diretamente pelo Convênio Nacional SEFIN.
              </p>
            </div>
          </div>

          <Button
            type="button"
            onClick={handleEmitTestInvoice}
            disabled={testingInvoice || (!certInfo && !saveSuccess)}
            className="w-full h-9 bg-white border border-[#eae9ea] hover:border-ds-ink text-ds-ink rounded-[var(--radius)] text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {testingInvoice ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Transmitindo DPS para o Convênio Nacional...
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" /> Emitir NFS-e de Teste (Homologação)
              </>
            )}
          </Button>

          {testError && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-ds-red flex items-start gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{testError}</span>
            </div>
          )}

          {testResult && (
            <div className="p-3 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl text-left space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#15803d]">
                <FileCheck2 className="w-4 h-4 text-[#15803d]" />
                <span>NFS-e de Teste Processada com Sucesso!</span>
              </div>
              <p className="text-[11px] text-ds-ink leading-relaxed">
                {testResult.message || 'DPS assinada digitalmente e enviada ao Convênio Nacional.'}
              </p>
              {testResult.numero && (
                <p className="text-[11px] text-ds-ink">
                  Número da NFS-e: <strong>{testResult.numero}</strong>
                </p>
              )}
              {testResult.urlDanfse && (
                <a
                  href={testResult.urlDanfse}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-ds-teal underline font-medium block pt-1"
                >
                  Visualizar DANFSE &rarr;
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
