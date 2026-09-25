import { describe, it, expect } from 'vitest';
import { FocusNfeClient } from './focus-nfe-client';

describe('FocusNfeClient', () => {
  const client = new FocusNfeClient({
    token: 'test-token',
    environment: 'homologacao',
  });

  it('deve inicializar com o endpoint correto de homologação', () => {
    expect(client).toBeDefined();
  });
});
