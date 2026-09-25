export interface RetryOptions {
  attempts: number;
  delaysMs: number[];
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number) => void;
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === options.attempts - 1;
      const canRetry = options.shouldRetry ? options.shouldRetry(error) : true;

      if (isLastAttempt || !canRetry) throw error;

      options.onRetry?.(error, attempt + 1);
      const delay = options.delaysMs[attempt] ?? options.delaysMs.at(-1) ?? 0;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Operação falhou após as tentativas configuradas.');
}

export function isTransientIntegrationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(408|425|429|500|502|503|504)\b|timeout|temporar|indisponível|quota|limite/i.test(message);
}
