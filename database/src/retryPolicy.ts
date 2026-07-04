import { RetryStrategy } from '@prisma/client';

export interface RetryPolicyConfig {
  strategy: RetryStrategy;
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * Calculates the retry delay in milliseconds for a given attempt.
 * @param attempt The current attempt index (1-based, where 1 is the first retry attempt after the initial fail)
 * @param policy The retry policy config
 * @returns The delay in milliseconds
 */
export function calculateRetryDelay(attempt: number, policy: RetryPolicyConfig): number {
  if (attempt <= 0) return 0;
  
  let delay = policy.baseDelayMs;

  switch (policy.strategy) {
    case 'FIXED':
      delay = policy.baseDelayMs;
      break;
    case 'LINEAR':
      delay = policy.baseDelayMs * attempt;
      break;
    case 'EXPONENTIAL':
      delay = policy.baseDelayMs * Math.pow(2, attempt - 1);
      break;
    default:
      delay = policy.baseDelayMs;
  }

  return Math.min(delay, policy.maxDelayMs);
}
