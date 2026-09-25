import { retryWithBackoff } from '@/lib/utils/retry';

export interface ExtractedAppointmentData {
  patientName?: string;
  cpf?: string;
  email?: string;
  date?: string;
  time?: string;
  appointmentDate?: string;
  notes?: string;
}

export interface ExtractedPatientContactData {
  name?: string;
  cpf?: string;
  email?: string;
}

export class GeminiClient {
  private readonly groqApiKey = process.env.GROQ_API_KEY || '';
  private readonly groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  private readonly geminiApiKey = process.env.GEMINI_API_KEY || '';
  private readonly geminiModel = process.env.GEMINI_MODEL || 'gemini-flash-latest';

  public async extractAppointmentData(
    conversationText: string
  ): Promise<ExtractedAppointmentData> {
    if (!this.groqApiKey && !this.geminiApiKey) {
      throw new Error('Configure GROQ_API_KEY para extrair os dados do agendamento.');
    }

    const prompt = `Extraia somente os dados abaixo da conversa entre médico e paciente.
O texto "Vou verificar a disponibilidade, só um instante por favor" marca o início relevante.
Use a data e hora escolhidas pelo paciente, não a data de mensagens anteriores.
Responda apenas JSON válido:
{"patientName":null,"cpf":null,"email":null,"date":null,"time":null,"appointmentDate":null,"notes":null}

Conversa:
${conversationText}`;

    const raw = await this.requestCompletion(prompt);
    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(raw.replace(/```json/gi, '').replace(/```/g, '').trim());
    } catch {
      throw new Error('Falha ao extrair agendamento na IA: resposta JSON inválida.');
    }
    return {
      patientName: parsed.patientName || undefined,
      cpf: parsed.cpf ? String(parsed.cpf).replace(/\D/g, '') : undefined,
      email: parsed.email || undefined,
      date: parsed.date || undefined,
      time: parsed.time || undefined,
      appointmentDate: parsed.appointmentDate || undefined,
      notes: parsed.notes || undefined,
    };
  }

  public async extractPatientContactData(
    conversationText: string
  ): Promise<ExtractedPatientContactData> {
    if (!this.groqApiKey && !this.geminiApiKey) return {};

    const prompt = `Extraia somente dados cadastrais explícitos do paciente nesta conversa.
Não invente dados. Responda apenas JSON válido:
{"name":null,"cpf":null,"email":null}

Conversa:
${conversationText.slice(-12000)}`;

    let raw = '';
    try {
      raw = await this.requestCompletion(prompt);
      const parsed = JSON.parse(raw.replace(/```json/gi, '').replace(/```/g, '').trim());
      return {
        name: typeof parsed.name === 'string' ? parsed.name.trim() : undefined,
        cpf: parsed.cpf ? String(parsed.cpf).replace(/\D/g, '') : undefined,
        email: typeof parsed.email === 'string' ? parsed.email.toLowerCase().trim() : undefined,
      };
    } catch {
      return {};
    }
  }

  private async requestCompletion(prompt: string): Promise<string> {
    if (this.groqApiKey) {
      const response = await retryWithBackoff(
        () => fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.groqApiKey}`,
          },
          body: JSON.stringify({
            model: this.groqModel,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: 'Extraia os dados solicitados e responda somente JSON válido.',
              },
              { role: 'user', content: prompt },
            ],
          }),
        }).then(async (result) => {
          if (!result.ok) {
            throw new Error(`Falha ao extrair dados no Groq (${result.status}).`);
          }
          return result;
        }),
        {
          attempts: 3,
          delaysMs: [1500, 4000],
          shouldRetry: (error) => /\((408|425|429|500|502|503|504)\)/.test(String(error)),
        }
      );
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    }

    const response = await retryWithBackoff(
      () => fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': this.geminiApiKey,
          },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      ).then(async (result) => {
        if (!result.ok) throw new Error(`Falha ao extrair dados na Gemini (${result.status}).`);
        return result;
      }),
      {
        attempts: 3,
        delaysMs: [1500, 4000],
        shouldRetry: (error) => /\((408|425|429|500|502|503|504)\)/.test(String(error)),
      }
    );
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
}
