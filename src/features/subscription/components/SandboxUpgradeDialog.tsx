'use client';

import React, { useState } from 'react';
import { ArrowRight, Loader2, X, Sparkles, CheckCircle2 } from 'lucide-react';

interface SandboxUpgradeDialogProps {
  doctorId: string;
  isSubscriber: boolean;
  monthlyInvoicesUsed?: number;
  monthlyInvoicesLimit?: number;
  onRefreshSubscription?: () => Promise<void>;
}

export function SandboxUpgradeDialog({
  doctorId,
  isSubscriber,
  monthlyInvoicesUsed = 0,
  monthlyInvoicesLimit = 200,
}: SandboxUpgradeDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [minimized, setMinimized] = useState(false);

  const handleStartCheckout = async () => {
    if (!doctorId || loading) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId }),
      });

      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Não foi possível iniciar o checkout.');
      }

      // Redireciona para o checkout oficial hospedado da Stripe
      window.location.href = data.url;
    } catch (err: any) {
      console.error('Erro ao redirecionar para a Stripe:', err);
      setError(err?.message || 'Erro ao conectar à Stripe.');
      setLoading(false);
    }
  };

  // Se o usuário já é assinante ativo:
  if (isSubscriber) {
    if (minimized) {
      return (
        <aside aria-label="Status da assinatura" className="fixed bottom-5 right-5 z-50">
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="flex items-center gap-2 bg-white/95 backdrop-blur-md border border-[#eae9ea] hover:border-[#3ecf8e]/50 px-3.5 py-2 rounded-full shadow-lg text-xs font-medium text-ds-ink transition-all cursor-pointer group"
          >
            <span className="w-2 h-2 rounded-full bg-[#3ecf8e] animate-pulse" />
            <span>Assinante Ativo</span>
            <span className="text-ds-ink-4">({monthlyInvoicesUsed}/{monthlyInvoicesLimit})</span>
          </button>
        </aside>
      );
    }

    const percentage = Math.min(100, Math.round((monthlyInvoicesUsed / monthlyInvoicesLimit) * 100));

    return (
      <aside
        aria-label="Cota da assinatura"
        className="fixed bottom-5 right-5 z-50 w-full max-w-[340px] bg-white/95 backdrop-blur-md border border-[#eae9ea] rounded-2xl shadow-xl p-4 transition-all duration-300 animate-in fade-in slide-in-from-bottom-3"
      >
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-[#3ecf8e]/15 text-[#006239] border border-[#3ecf8e]/30">
              <CheckCircle2 className="w-3 h-3 text-[#3ecf8e]" />
              Assinante Pro
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="text-ds-ink-4 hover:text-ds-ink p-1 rounded-md transition-colors cursor-pointer"
            title="Recolher"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="font-text text-xs text-ds-ink leading-relaxed mb-3">
          Emissão em produção liberada. Suas notas são transmitidas com validade jurídica.
        </p>

        <div className="space-y-1.5 bg-[#faf9f8] p-2.5 rounded-xl border border-[#f0eee9]">
          <div className="flex items-center justify-between text-[11px] font-text">
            <span className="text-ds-ink-2 font-medium">Consumo no mês</span>
            <span className="font-mono font-semibold text-ds-ink">
              {monthlyInvoicesUsed} / {monthlyInvoicesLimit} notas
            </span>
          </div>
          <div className="w-full h-1.5 bg-[#e8e6e1] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#3ecf8e] transition-all duration-500 rounded-full"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </aside>
    );
  }

  // Se estiver em modo Sandbox e minimizado
  if (minimized) {
    return (
      <aside aria-label="Aviso de modo sandbox" className="fixed bottom-5 right-5 z-50">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex items-center gap-2 bg-[#18181b] text-white hover:bg-black px-4 py-2.5 rounded-full shadow-2xl text-xs font-medium transition-all cursor-pointer border border-white/10 group animate-bounce duration-1000"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#3ecf8e]" />
          <span>Começar a emitir notas válidas</span>
        </button>
      </aside>
    );
  }

  // Diálogo padrão de chamada para ação em Modo Sandbox
  return (
    <aside
      aria-label="Aviso de modo sandbox e chamada para ação"
      className="fixed bottom-5 right-5 z-50 w-[calc(100vw-2.5rem)] sm:w-[380px] bg-white border border-[#eae9ea] rounded-2xl shadow-2xl p-5 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 selection:bg-ds-ink selection:text-white"
    >
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#f4efec] border border-[#eae9ea] text-[11px] font-mono uppercase tracking-wider text-[#585254] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[#eab308] animate-pulse" />
          Modo Sandbox
        </div>

        <button
          type="button"
          onClick={() => setMinimized(true)}
          className="text-ds-ink-4 hover:text-ds-ink p-1 rounded-md transition-colors cursor-pointer"
          title="Minimizar aviso"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1.5 mb-3 text-left">
        <h2 className="font-display font-semibold text-[15px] sm:text-[16px] text-ds-ink leading-snug tracking-tight">
          Em modo sandbox não é emitido notas reais. Comece emitir notas válidas.
        </h2>
        <p className="font-text text-xs text-ds-ink-2 leading-relaxed">
          Assine agora para emitir notas fiscais em produção com autorização da prefeitura e Receita Federal.
        </p>
      </div>

      {error && (
        <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 text-left">
          {error}
        </div>
      )}

      <div className="bg-[#faf9f8] p-3 rounded-xl border border-[#f0eee9] mb-4 text-left">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[12px] font-medium text-ds-ink">Plano Pro Mensal</span>
          <span className="text-[11px] font-mono font-semibold text-[#006239] bg-[#3ecf8e]/20 px-2 py-0.5 rounded-full">
            200 notas/mês
          </span>
        </div>
        <p className="text-[11px] text-ds-ink-4 leading-normal">
          Direito a 200 notas fiscais emitidas no mês, integração via WhatsApp e armazenamento dos XMLs e DANFSEs.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleStartCheckout}
          disabled={loading}
          className="flex-1 h-10 px-4 bg-ds-ink text-white hover:bg-ds-ink/90 active:scale-[0.98] rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Conectando à Stripe...</span>
            </>
          ) : (
            <>
              <span>Começar a emitir notas válidas</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
