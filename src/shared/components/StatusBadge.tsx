import React from 'react';
import { Badge } from '@/components/ui/badge';
import type { InvoiceStatus, OnboardingStatus, AppointmentStatus } from '@/types/database.types';

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  switch (status) {
    case 'authorized':
      return <Badge variant="default">Autorizada</Badge>;
    case 'processing':
      return <Badge variant="yellow">Processando</Badge>;
    case 'error':
      return <Badge variant="destructive">Rejeitada</Badge>;
    case 'cancelled':
      return <Badge variant="secondary">Cancelada</Badge>;
    default:
      return <Badge variant="secondary">Rascunho</Badge>;
  }
}

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  switch (status) {
    case 'confirmed':
      return <Badge variant="default">Confirmado</Badge>;
    case 'reserved':
      return <Badge variant="purple">Reservado</Badge>;
    case 'available':
      return <Badge variant="secondary">Disponível</Badge>;
    case 'completed':
      return <Badge variant="outline">Concluído</Badge>;
    case 'cancelled':
      return <Badge variant="destructive">Cancelado</Badge>;
  }
}

export function OnboardingStatusBadge({ status }: { status: OnboardingStatus }) {
  switch (status) {
    case 'active':
      return <Badge variant="default">100% Homologado</Badge>;
    case 'homologation_ready':
      return <Badge variant="purple">Pronto p/ Homologação</Badge>;
    case 'pending_pix_validation':
      return <Badge variant="yellow">Aguardando Pix Pluggy</Badge>;
    case 'pending_whatsapp_connection':
      return <Badge variant="yellow">Aguardando Conexão WhatsApp</Badge>;
    case 'pending_certificate':
      return <Badge variant="secondary">Aguardando Certificado A1</Badge>;
    case 'pending_xml':
      return <Badge variant="secondary">Aguardando XML</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}
