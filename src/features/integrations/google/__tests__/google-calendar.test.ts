import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleCalendarService } from '../google-calendar.service';
import { googleClientService } from '@/lib/integrations/google-client';
import { supabaseAdmin } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/integrations/google-client', () => ({
  googleClientService: {
    getAuthenticatedClient: vi.fn(),
  },
}));

describe('GoogleCalendarService', () => {
  let service: GoogleCalendarService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GoogleCalendarService();
  });

  it('deve extrair corretamente os dados do paciente e consulta a partir de um evento', () => {
    const mockEvent = {
      id: 'event-123',
      summary: 'Consulta: Maria da Silva',
      description: 'Primeira consulta médica.\nCPF: 123.456.789-00\nWhatsApp: (11) 98765-4321',
      start: { dateTime: '2026-09-25T14:30:00Z' },
      end: { dateTime: '2026-09-25T15:30:00Z' },
      attendees: [{ email: 'maria.silva@exemplo.com', displayName: 'Maria da Silva' }],
    };

    const parsed = service.parseEvent(mockEvent);

    expect(parsed).not.toBeNull();
    expect(parsed?.patientName).toBe('Maria da Silva');
    expect(parsed?.patientCpf).toBe('12345678900');
    expect(parsed?.patientPhone).toBe('11987654321');
    expect(parsed?.patientEmail).toBe('maria.silva@exemplo.com');
    expect(parsed?.date).toBe('2026-09-25');
    expect(parsed?.time).toBe('14:30:00');
  });

  it('deve importar eventos e criar pacientes e consultas no Supabase', async () => {
    const mockEventsList = [
      {
        id: 'event-abc',
        summary: 'Atendimento - João Santos',
        description: 'Retorno com exames de sangue',
        start: { dateTime: '2026-09-26T10:00:00Z' },
        end: { dateTime: '2026-09-26T11:00:00Z' },
        attendees: [{ email: 'joao@exemplo.com' }],
      },
    ];

    vi.spyOn(service, 'listEvents').mockResolvedValue(mockEventsList as any);

    const selectPatientMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'patient-joao-id', name: 'João Santos' },
            error: null,
          }),
        }),
      }),
    };

    const insertConsultaMock = {
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'consulta-1', data: '2026-09-26', hora: '10:00:00' },
            error: null,
          }),
        }),
      }),
    };

    const insertAppointmentMock = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    };

    const updateGoogleMock = {
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'patients') return selectPatientMock;
      if (table === 'consultas') return insertConsultaMock;
      if (table === 'appointments') return insertAppointmentMock;
      if (table === 'google_integrations') return updateGoogleMock;
      return {};
    });

    const result = await service.importEvents({ doctorId: 'doc-cal-1' });

    expect(result.importedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(result.consultations.length).toBe(1);
    expect(result.consultations[0].patientName).toBe('João Santos');
  });
});
