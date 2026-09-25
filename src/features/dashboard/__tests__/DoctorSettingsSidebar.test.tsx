import { describe, it, expect } from 'vitest';
import type { DoctorProfileData } from '../components/DoctorSettingsSidebar';

describe('DoctorProfileData configuration contract', () => {
  it('contém exatamente os campos requeridos de configuração profissional', () => {
    const profile: DoctorProfileData = {
      especialidade: 'Cardiologia',
      crm: '12345/RS',
      rqr: '98765',
      name: 'Dr. Allan Severo',
    };

    expect(profile.especialidade).toBe('Cardiologia');
    expect(profile.crm).toBe('12345/RS');
    expect(profile.rqr).toBe('98765');
    expect(profile.name).toBe('Dr. Allan Severo');
  });
});

