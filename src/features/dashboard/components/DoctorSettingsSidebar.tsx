'use client';

import React, { useState, useEffect } from 'react';

export interface DoctorProfileData {
  name: string;
  crm: string;
  rqr: string;
  especialidade: string;
}

interface DoctorSettingsSidebarProps {
  doctorId: string;
  initialName?: string;
  onProfileUpdated?: (updated: DoctorProfileData) => void;
}

export function DoctorSettingsSidebar({
  doctorId,
  initialName = '',
  onProfileUpdated,
}: DoctorSettingsSidebarProps) {
  const [name, setName] = useState(initialName);
  const [especialidade, setEspecialidade] = useState('');
  const [crm, setCrm] = useState('');
  const [rqr, setRqr] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Carrega os dados existentes do perfil profissional
  useEffect(() => {
    let active = true;
    async function loadProfile() {
      if (!doctorId) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/doctors/profile?doctorId=${encodeURIComponent(doctorId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (active && data?.doctor) {
          if (data.doctor.name) setName(data.doctor.name);
          if (data.doctor.especialidade) setEspecialidade(data.doctor.especialidade);
          if (data.doctor.crm) setCrm(data.doctor.crm);
          if (data.doctor.rqe || data.doctor.rqr) setRqr(data.doctor.rqe || data.doctor.rqr);
        }
      } catch (err) {
        console.warn('Erro ao carregar dados do profissional:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, [doctorId]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!doctorId || saving) return;

    setSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/doctors/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId,
          name: name.trim() || initialName,
          especialidade: especialidade.trim(),
          crm: crm.trim(),
          rqr: rqr.trim(),
          rqe: rqr.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao salvar configuração.');
      }

      setStatusMessage('Salvo com sucesso');
      onProfileUpdated?.({
        name: name.trim() || initialName,
        especialidade: especialidade.trim(),
        crm: crm.trim(),
        rqr: rqr.trim(),
      });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setStatusMessage(err.message || 'Erro ao salvar');
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="w-full md:w-64 lg:w-72 shrink-0 border-b md:border-b-0 md:border-r border-[#eae9ea] bg-white p-6 sm:p-7 flex flex-col justify-between text-left font-text">
      <div className="flex flex-col gap-6">
        {/* Cabeçalho da Sidebar apenas com texto */}
        <div className="space-y-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-ds-ink-4">
            Configurações
          </span>
          <h3 className="font-display text-[17px] font-medium text-ds-ink tracking-tight">
            Profissional
          </h3>
        </div>

        {/* Formulário com as novas configurações solicitadas */}
        <form onSubmit={handleSave} className="flex flex-col gap-4 text-left">
          {/* Tipo de especialidade */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="field-especialidade"
              className="text-[12px] font-normal text-ds-ink-3"
            >
              Tipo de especialidade
            </label>
            <input
              id="field-especialidade"
              type="text"
              placeholder="ex: Cardiologia, Psiquiatria..."
              value={especialidade}
              onChange={(e) => setEspecialidade(e.target.value)}
              className="w-full bg-[#f9f8f7] focus:bg-white text-[13px] text-ds-ink placeholder:text-[#a1a1aa] px-2.5 py-1.5 rounded-[var(--radius)] border border-transparent focus:border-[#d4d4d8] outline-none transition-all"
            />
          </div>

          {/* CRM */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="field-crm"
              className="text-[12px] font-normal text-ds-ink-3"
            >
              CRM
            </label>
            <input
              id="field-crm"
              type="text"
              placeholder="ex: 12345/SP"
              value={crm}
              onChange={(e) => setCrm(e.target.value)}
              className="w-full bg-[#f9f8f7] focus:bg-white font-mono text-[13px] text-ds-ink placeholder:text-[#a1a1aa] px-2.5 py-1.5 rounded-[var(--radius)] border border-transparent focus:border-[#d4d4d8] outline-none transition-all"
            />
          </div>

          {/* RQR */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="field-rqr"
              className="text-[12px] font-normal text-ds-ink-3"
            >
              RQR
            </label>
            <input
              id="field-rqr"
              type="text"
              placeholder="ex: 67890"
              value={rqr}
              onChange={(e) => setRqr(e.target.value)}
              className="w-full bg-[#f9f8f7] focus:bg-white font-mono text-[13px] text-ds-ink placeholder:text-[#a1a1aa] px-2.5 py-1.5 rounded-[var(--radius)] border border-transparent focus:border-[#d4d4d8] outline-none transition-all"
            />
          </div>

          {/* NOME COMPLETO DO PROFISSIONAL */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="field-nome-profissional"
              className="text-[12px] font-normal text-ds-ink-3"
            >
              Nome completo do profissional
            </label>
            <input
              id="field-nome-profissional"
              type="text"
              placeholder="Dr(a). Nome e Sobrenome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-[#f9f8f7] focus:bg-white text-[13px] text-ds-ink placeholder:text-[#a1a1aa] px-2.5 py-1.5 rounded-[var(--radius)] border border-transparent focus:border-[#d4d4d8] outline-none transition-all font-medium"
            />
          </div>

          {/* Ação simples de texto para salvar */}
          <div className="pt-2 flex items-center justify-between">
            <button
              type="submit"
              disabled={saving || loading}
              className="text-[13px] text-ds-ink hover:text-black font-medium underline underline-offset-4 cursor-pointer transition-colors disabled:opacity-40"
            >
              {saving ? 'salvando...' : 'salvar'}
            </button>

            {statusMessage && (
              <span className="text-[11px] text-[#2c544b] font-mono">
                {statusMessage}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Rodapé simples da barra lateral apenas com texto */}
      <div className="pt-6 border-t border-[#f4efec] mt-6 flex flex-col gap-1">
        <span className="text-[11px] text-[#a1a1aa]">
          {name ? `Dr(a). ${name}` : 'Profissional médico'}
        </span>
        <span className="text-[10px] font-mono text-[#a1a1aa]">
          {crm ? `CRM: ${crm}` : 'CRM não informado'}
          {rqr ? ` · RQR: ${rqr}` : ''}
        </span>
      </div>
    </aside>
  );
}
