'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { OnboardingFlow, buildInstanceName, type OnboardingViewMode } from '@/features/onboarding/OnboardingFlow';

type AuthMode = 'login' | 'register';

async function readApiResponse(response: Response): Promise<Record<string, any>> {
  const responseText = await response.text();
  if (!responseText) return {};

  try {
    return JSON.parse(responseText);
  } catch {
    const serverMessage = responseText.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)?.[1]
      ?.replace(/<[^>]+>/g, '')
      .trim();
    throw new Error(
      serverMessage || `O servidor retornou uma resposta inválida (HTTP ${response.status}).`
    );
  }
}

export default function App() {
  const [view, setView] = useState<OnboardingViewMode>('auth');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);

  const [doctorId, setDoctorId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState<string>('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [step1Loading, setStep1Loading] = useState(false);

  const [xmlContent, setXmlContent] = useState('');
  const [xmlFileName, setXmlFileName] = useState('');
  const [fiscalLoading, setFiscalLoading] = useState(false);
  const [fiscalProfile, setFiscalProfile] = useState<any>(null);
  const [fiscalError, setFiscalError] = useState('');

  const [certFileName, setCertFileName] = useState('');
  const [certPassword, setCertPassword] = useState('');
  const [showCertPassword, setShowCertPassword] = useState(false);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certLoading, setCertLoading] = useState(false);
  const [certValidated, setCertValidated] = useState<any>(null);
  const [certError, setCertError] = useState('');

  const [instanceName, setInstanceName] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const qrPollingRef = useRef<NodeJS.Timeout | null>(null);

  const [firstInvoiceLoading, setFirstInvoiceLoading] = useState(false);
  const [firstInvoiceResult, setFirstInvoiceResult] = useState<any>(null);
  const [firstInvoiceError, setFirstInvoiceError] = useState('');

  const [supportedBanks, setSupportedBanks] = useState<any[]>([]);
  const [selectedBank, setSelectedBank] = useState<string>('itau');
  const [bankLoading, setBankLoading] = useState(false);
  const [bankError, setBankError] = useState('');
  const [connectToken, setConnectToken] = useState('');
  const [connectedBank, setConnectedBank] = useState<any>(null);

  const [dashboardTab, setDashboardTab] = useState<'shortcuts' | 'consultas' | 'fiscal' | 'homologacao'>('homologacao');
  const [copiedShortcut, setCopiedShortcut] = useState<string | null>(null);

  const [homologationLoading, setHomologationLoading] = useState(false);
  const [homologationInvoice, setHomologationInvoice] = useState<any>(null);
  const [homologationError, setHomologationError] = useState('');

  const [countdown, setCountdown] = useState(15);

  const [isSubscriber, setIsSubscriber] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState<any>(null);
  const [updatingSubscription, setUpdatingSubscription] = useState(false);

  const checkSubscription = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/subscription?doctorId=${encodeURIComponent(id)}`);
      const data = await readApiResponse(res);
      if (data?.subscription) {
        setIsSubscriber(data.subscription.isPaying);
        setSubscriptionInfo(data.subscription);
      }
    } catch (err) {
      console.warn('Erro ao consultar assinatura:', err);
    }
  }, []);

  useEffect(() => {
    if (doctorId) {
      checkSubscription(doctorId);
    }
  }, [doctorId, view, checkSubscription]);

  // Intercepta retorno bem-sucedido do checkout Stripe (?checkout=success&session_id=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const checkoutStatus = url.searchParams.get('checkout');
    const sessionId = url.searchParams.get('session_id');

    if (checkoutStatus === 'success' && sessionId) {
      const activeId = doctorId || (() => {
        try {
          return JSON.parse(localStorage.getItem('notowhats_session') || '{}')?.doctorId || '';
        } catch {
          return '';
        }
      })();

      fetch(`/api/stripe/verify-session?session_id=${encodeURIComponent(sessionId)}${activeId ? `&doctorId=${encodeURIComponent(activeId)}` : ''}`)
        .then(async (res) => {
          const data = await readApiResponse(res);
          if (data?.verified && data?.subscription) {
            setIsSubscriber(true);
            setSubscriptionInfo(data.subscription);
            setView('dashboard');
            persistSession({ view: 'dashboard' });
          }
        })
        .catch((err) => console.warn('Erro ao verificar checkout da Stripe:', err))
        .finally(() => {
          url.searchParams.delete('checkout');
          url.searchParams.delete('session_id');
          window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
        });
    }
  }, [doctorId]);


  const handleToggleSubscription = async () => {
    if (!doctorId || updatingSubscription) return;
    setUpdatingSubscription(true);
    try {
      const nextState = !isSubscriber;
      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId, isSubscriber: nextState }),
      });
      const data = await readApiResponse(res);
      if (data?.subscription) {
        setIsSubscriber(data.subscription.isPaying);
        setSubscriptionInfo(data.subscription);
      }
    } catch (err) {
      console.warn('Erro ao alternar plano:', err);
    } finally {
      setUpdatingSubscription(false);
    }
  };

  useEffect(() => {
    if (view !== 'invoice_success') return;

    if (countdown <= 0) {
      setView('dashboard');
      persistSession({ view: 'dashboard' });
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [view, countdown]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (qrPollingRef.current) clearInterval(qrPollingRef.current);
    };
  }, []);

  useEffect(() => {
    async function restoreSession() {
      try {
        const saved = localStorage.getItem('notowhats_session');
        if (!saved) {
          setCheckingSession(false);
          return;
        }

        const session = JSON.parse(saved);
        let activeId = session.doctorId || '';

        if (session.email) {
          setEmail(session.email);
          if (!activeId) {
            try {
              const profileRes = await fetch(`/api/doctors/profile?email=${encodeURIComponent(session.email)}`);
              const pData = await readApiResponse(profileRes);
              if (pData?.doctorId) {
                activeId = pData.doctorId;
                persistSession({ doctorId: activeId });
              }
            } catch {}
          }
        }

        if (activeId) {
          setDoctorId(activeId);
          if (session.firstName) setFirstName(session.firstName);
          if (session.lastName) setLastName(session.lastName);
          if (session.fiscalProfile) setFiscalProfile(session.fiscalProfile);
          if (session.certValidated) setCertValidated(session.certValidated);
          if (session.connectedBank) setConnectedBank(session.connectedBank);
          if (session.homologationInvoice) setHomologationInvoice(session.homologationInvoice);
        }
        if (session.instanceName) setInstanceName(session.instanceName);

        if (session.view) {
          setView(session.view === 'step_6' ? 'dashboard' : session.view as OnboardingViewMode);
        } else if (activeId) {
          setView('step_1');
        }
      } catch {
        setView('auth');
      } finally {
        setCheckingSession(false);
      }
    }
    restoreSession();
  }, []);

  useEffect(() => {
    async function fetchBanks() {
      try {
        const res = await fetch('/api/banking/pluggy');
        const data = await readApiResponse(res);
        if (data.banks) setSupportedBanks(data.banks);
      } catch {
        setSupportedBanks([
          { id: 'itau', name: 'Banco Itaú', code: '341' },
          { id: 'bradesco', name: 'Banco Bradesco', code: '237' },
          { id: 'santander', name: 'Banco Santander', code: '033' },
          { id: 'nubank', name: 'Nubank (PJ)', code: '260' },
          { id: 'inter', name: 'Banco Inter', code: '077' },
          { id: 'bb', name: 'Banco do Brasil', code: '001' },
        ]);
      }
    }
    fetchBanks();
  }, []);

  useEffect(() => {
    if (view === 'dashboard' && doctorId) {
      fetch('/api/banking/pluggy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_token', doctorId }),
      })
        .then((res) => readApiResponse(res))
        .then((data) => {
          if (data.connectToken) setConnectToken(data.connectToken);
        })
        .catch((err) => console.warn('Aviso Pluggy Connect token:', err));
    }
  }, [view, doctorId]);

  const persistSession = (updates: Record<string, any>) => {
    try {
      const current = JSON.parse(localStorage.getItem('notowhats_session') || '{}');
      const updated = { ...current, ...updates };
      localStorage.setItem('notowhats_session', JSON.stringify(updated));
    } catch {}
  };

  const handleLogout = () => {
    localStorage.removeItem('notowhats_session');
    setDoctorId('');
    setEmail('');
    setPassword('');
    setPhone('');
    setOtpCode('');
    setOtpSent(false);
    setFirstName('');
    setLastName('');
    setFiscalProfile(null);
    setCertValidated(null);
    setConnectedBank(null);
    setWhatsappConnected(false);
    setView('auth');
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: otpSent ? 'verify_whatsapp_otp' : 'request_whatsapp_otp',
          phone: phone.trim(),
          code: otpCode.trim(),
        }),
      });

      const data = await readApiResponse(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao autenticar.');

      const activeDoctorId = data.doctorId || data.doctor?.id || '';
      setDoctorId(activeDoctorId);
      if (!otpSent) {
        setOtpSent(true);
        setOtpCode('');
        return;
      }
      if (data.email) {
        setEmail(data.email);
      }

      const inst =
        data.integration?.evolution_instance_name ||
        (activeDoctorId ? buildInstanceName(activeDoctorId) : 'nw_default');
      setInstanceName(inst);

      persistSession({
        doctorId: activeDoctorId,
        email: data.email || '',
        instanceName: inst,
        view: 'step_1',
      });

      setView('step_1');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao processar solicitação.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setErrorMsg('');
    setLoading(true);

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_whatsapp_otp',
          phone: phone.trim(),
        }),
      });
      const data = await readApiResponse(res);
      if (!res.ok) throw new Error(data.error || 'Não foi possível reenviar o código.');
      setOtpCode('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Não foi possível reenviar o código.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setErrorMsg('Informe seu nome e sobrenome.');
      return;
    }

    setStep1Loading(true);
    setErrorMsg('');

    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      const res = await fetch('/api/doctors/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId, email, name: fullName }),
      });

      const data = await readApiResponse(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar dados.');

      const resolvedDoctorId = data.doctorId || data.doctor?.id || doctorId;
      if (resolvedDoctorId) {
        setDoctorId(resolvedDoctorId);
      }

      persistSession({
        doctorId: resolvedDoctorId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: fullName,
        view: 'step_2',
      });

      setView('step_2');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar.');
    } finally {
      setStep1Loading(false);
    }
  };

  const handleXmlUpload = async (file: File) => {
    setFiscalLoading(true);
    setFiscalError('');
    setXmlFileName(file.name);

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      try {
        const url = URL.createObjectURL(file);
        setUploadedPdfUrl(url);
      } catch {}
      setFiscalLoading(false);
      return;
    }

    try {
      const text = await file.text();
      setXmlContent(text);

      const res = await fetch('/api/fiscal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'parse_xml',
          doctorId,
          xmlContent: text,
        }),
      });

      const data = await readApiResponse(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao processar o XML.');

      setFiscalProfile(data.extracted);
      persistSession({ fiscalProfile: data.extracted, view: 'step_2' });
    } catch (err: any) {
      setFiscalError(err.message || 'Não foi possível ler os dados fiscais deste XML.');
    } finally {
      setFiscalLoading(false);
    }
  };

  const handleValidateCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certPassword) {
      setCertError('Informe a senha do certificado.');
      return;
    }

    setCertLoading(true);
    setCertError('');

    try {
      const formData = new FormData();
      if (certFile) formData.append('certificate', certFile);
      formData.append('doctorId', doctorId);
      formData.append('password', certPassword);
      if (fiscalProfile?.cnpj) formData.append('cnpj', fiscalProfile.cnpj);
      if (fiscalProfile?.razaoSocial) formData.append('razaoSocial', fiscalProfile.razaoSocial);
      if (fiscalProfile?.inscricaoMunicipal) formData.append('inscricaoMunicipal', fiscalProfile.inscricaoMunicipal);
      if (fiscalProfile?.cidade) formData.append('cidade', fiscalProfile.cidade);
      if (fiscalProfile?.uf) formData.append('uf', fiscalProfile.uf);
      if (fiscalProfile?.cnae) formData.append('cnae', fiscalProfile.cnae);

      const res = await fetch('/api/fiscal/certificate', { method: 'POST', body: formData });

      const data = await readApiResponse(res);
      if (!res.ok) throw new Error(data.error || 'Falha ao validar o certificado.');

      setCertValidated(data.certificate);
      persistSession({ certValidated: data.certificate, view: 'step_4' });
      setView('step_4');
    } catch (err: any) {
      setCertError(err.message || 'Senha incorreta ou certificado inválido.');
    } finally {
      setCertLoading(false);
    }
  };

  const startConnectionPolling = useCallback((inst: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/integrations/whatsapp?instance=${encodeURIComponent(inst)}`);
        const data = await readApiResponse(res);

        if (data.status === 'open') {
          clearInterval(pollingRef.current!);
          if (qrPollingRef.current) clearInterval(qrPollingRef.current);
          setWhatsappConnected(true);
          persistSession({ instanceName: inst, whatsappConnected: true, view: 'step_5' });
          setView('step_5');
        }
      } catch {}
    }, 3000);
  }, []);

  const handleGenerateQr = async () => {
    setQrError('');
    setQrLoading(true);

    try {
      const targetInst = instanceName || buildInstanceName(doctorId || 'default');
      setInstanceName(targetInst);

      const res = await fetch('/api/integrations/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_instance',
          instanceName: targetInst,
          doctorId,
        }),
      });

      const data = await readApiResponse(res);
      if (data.status === 'open') {
        setWhatsappConnected(true);
        setView('step_5');
        return;
      }

      if (data.qrcode) {
        setQrCode(data.qrcode);
        startConnectionPolling(targetInst);
      } else {
        throw new Error('Não foi possível obter o QR Code.');
      }
    } catch (err: any) {
      setQrError(err.message || 'Erro ao conectar ao WhatsApp.');
    } finally {
      setQrLoading(false);
    }
  };

  const handleReconnectWhatsApp = async () => {
    setQrCode('');
    setWhatsappConnected(false);
    setQrError('');
    setView('step_4');
    persistSession({ whatsappConnected: false, view: 'step_4' });
    await handleGenerateQr();
  };

  const handleEmitFirstInvoice = async () => {
    setFirstInvoiceLoading(true);
    setFirstInvoiceError('');

    try {
      fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId,
          amount: 1.0,
          appointmentDate: new Date().toISOString().slice(0, 10),
          patient: {
            name: `${firstName} ${lastName}`.trim() || fiscalProfile?.razaoSocial || 'Paciente Demonstração',
            cpf: (fiscalProfile?.cnpj || '').replace(/\D/g, '').slice(0, 11).padEnd(11, '0'),
            phone: '',
            email: email || '',
          },
        }),
      })
        .then(async (res) => {
          const data = await readApiResponse(res).catch(() => ({}));
          if (res.ok) {
            setFirstInvoiceResult(data);
            persistSession({ firstInvoiceResult: data });
          } else {
            console.warn('Emissão teste Focus NFe:', data);
          }
        })
        .catch((err) => {
          console.warn('Emissão teste em background:', err);
        });
    } catch (err) {
      console.warn('Erro ao acionar emissão:', err);
    }

    persistSession({ view: 'dashboard' });
    setView('dashboard');
    setFirstInvoiceLoading(false);
  };

  const triggerHomologationInvoice = async (activeDocId: string) => {
    if (!activeDocId) return;
    setHomologationLoading(true);
    setHomologationError('');

    try {
      const res = await fetch('/api/invoices/homologation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: activeDocId,
          cnpj: fiscalProfile?.cnpj,
          inscricaoMunicipal: fiscalProfile?.inscricaoMunicipal,
          doctorName: fiscalProfile?.razaoSocial || `${firstName} ${lastName}`.trim(),
          email,
        }),
      });
      const data = await readApiResponse(res);
      if (res.ok && data.success) {
        setHomologationInvoice(data);
        persistSession({ homologationInvoice: data });
      } else {
        setHomologationError(data.error || 'Falha ao emitir NFS-e de teste na Focus NFe.');
      }
    } catch (err: any) {
      setHomologationError(err.message || 'Erro ao conectar à Focus NFe.');
    } finally {
      setHomologationLoading(false);
    }
  };

  const completeDirectConnect = async (bankId: string, itemId?: string) => {
    const res = await fetch('/api/banking/pluggy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'connect_account',
        doctorId,
        bankId,
        itemId,
      }),
    });

    const data = await readApiResponse(res);
    if (!res.ok) throw new Error(data.error || 'Erro ao conectar ao banco via Pluggy.');

    setConnectedBank(data.account);
    setCountdown(15);
    persistSession({ connectedBank: data.account, view: 'invoice_success' });
    setView('invoice_success');

    triggerHomologationInvoice(doctorId);
  };

  const handleGoToDashboard = () => {
    setView('dashboard');
    persistSession({ view: 'dashboard' });
  };

  const handleConnectBank = async (bankId: string) => {
    setBankLoading(true);
    setBankError('');

    try {
      if (typeof window !== 'undefined' && (window as any).PluggyConnect && connectToken) {
        const pluggy = new (window as any).PluggyConnect({
          connectToken,
          includeSandbox: true,
          onSuccess: async (itemData: any) => {
            try {
              const matchedBank = itemData?.item?.connector?.name?.toLowerCase().includes('nubank')
                ? 'nubank'
                : itemData?.item?.connector?.name?.toLowerCase().includes('bradesco')
                ? 'bradesco'
                : itemData?.item?.connector?.name?.toLowerCase().includes('santander')
                ? 'santander'
                : itemData?.item?.connector?.name?.toLowerCase().includes('inter')
                ? 'inter'
                : itemData?.item?.connector?.name?.toLowerCase().includes('brasil')
                ? 'bb'
                : bankId;

              await completeDirectConnect(matchedBank, itemData?.item?.id);
            } catch (err: any) {
              setBankError(err.message || 'Erro ao salvar conexão bancária.');
              setBankLoading(false);
            }
          },
          onError: (error: any) => {
            console.warn('Pluggy Connect Widget erro:', error);
            completeDirectConnect(bankId).catch((fallbackErr: any) => {
              setBankError(fallbackErr.message || 'Erro ao conectar via Pluggy.');
              setBankLoading(false);
            });
          },
          onClose: () => {
            setBankLoading(false);
          },
        });
        pluggy.init();
        return;
      }

      await completeDirectConnect(bankId);
    } catch (err: any) {
      console.warn('Erro ao conectar banco:', err);
      setBankError(err.message || 'Erro ao conectar via Pluggy.');
      setBankLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedShortcut(id);
    setTimeout(() => setCopiedShortcut(null), 2000);
  };

  return (
    <OnboardingFlow
      view={view}
      authMode={authMode}
      loading={loading}
      errorMsg={errorMsg}
      checkingSession={checkingSession}
      doctorId={doctorId}
      email={email}
      password={password}
      phone={phone}
      otpCode={otpCode}
      otpSent={otpSent}
      uploadedPdfUrl={uploadedPdfUrl}
      firstName={firstName}
      lastName={lastName}
      step1Loading={step1Loading}
      xmlFileName={xmlFileName}
      fiscalLoading={fiscalLoading}
      fiscalProfile={fiscalProfile}
      fiscalError={fiscalError}
      certFileName={certFileName}
      certPassword={certPassword}
      showCertPassword={showCertPassword}
      certFile={certFile}
      certLoading={certLoading}
      certValidated={certValidated}
      certError={certError}
      qrCode={qrCode}
      qrLoading={qrLoading}
      qrError={qrError}
      whatsappConnected={whatsappConnected}
      firstInvoiceLoading={firstInvoiceLoading}
      firstInvoiceError={firstInvoiceError}
      supportedBanks={supportedBanks}
      selectedBank={selectedBank}
      bankLoading={bankLoading}
      bankError={bankError}
      connectedBank={connectedBank}
      countdown={countdown}
      isSubscriber={isSubscriber}
      updatingSubscription={updatingSubscription}
      monthlyInvoicesUsed={subscriptionInfo?.monthlyInvoicesUsed || 0}
      monthlyInvoicesLimit={subscriptionInfo?.monthlyInvoicesLimit || 200}
      copiedShortcut={copiedShortcut}
      homologationInvoice={homologationInvoice}

      setEmail={setEmail}
      setPassword={setPassword}
      setPhone={setPhone}
      setOtpCode={setOtpCode}
      setOtpSent={setOtpSent}
      setFirstName={setFirstName}
      setLastName={setLastName}
      setAuthMode={setAuthMode}
      setSelectedBank={setSelectedBank}
      setShowCertPassword={setShowCertPassword}
      setCertFileName={setCertFileName}
      setCertFile={setCertFile}
      setCertPassword={setCertPassword}
      setInstanceName={setInstanceName}
      setQrCode={setQrCode}
      setView={setView}
      handleAuthSubmit={handleAuthSubmit}
      handleResendOtp={handleResendOtp}
      handleSaveStep1={handleSaveStep1}
      handleXmlUpload={handleXmlUpload}
      handleValidateCertificate={handleValidateCertificate}
      handleGenerateQr={handleGenerateQr}
      handleReconnectWhatsApp={handleReconnectWhatsApp}
      handleEmitFirstInvoice={handleEmitFirstInvoice}
      handleConnectBank={handleConnectBank}
      handleLogout={handleLogout}
      handleToggleSubscription={handleToggleSubscription}
      handleGoToDashboard={handleGoToDashboard}
      copyToClipboard={copyToClipboard}
    />
  );
}
