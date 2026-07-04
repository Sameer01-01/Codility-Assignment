import { describe, it, expect } from 'vitest';
import { calculateRetryDelay } from 'database';

describe('Retry Policy Delay Calculations', () => {
  const policyFixed = {
    strategy: 'FIXED' as const,
    baseDelayMs: 1000,
    maxDelayMs: 5000,
  };

  const policyLinear = {
    strategy: 'LINEAR' as const,
    baseDelayMs: 1000,
    maxDelayMs: 5000,
  };

  const policyExponential = {
    strategy: 'EXPONENTIAL' as const,
    baseDelayMs: 1000,
    maxDelayMs: 5000,
  };

  it('calculates FIXED delay correctly', () => {
    expect(calculateRetryDelay(1, policyFixed)).toBe(1000);
    expect(calculateRetryDelay(2, policyFixed)).toBe(1000);
    expect(calculateRetryDelay(10, policyFixed)).toBe(1000);
  });

  it('calculates LINEAR delay correctly', () => {
    expect(calculateRetryDelay(1, policyLinear)).toBe(1000);
    expect(calculateRetryDelay(2, policyLinear)).toBe(2000);
    expect(calculateRetryDelay(4, policyLinear)).toBe(4000);
  });

  it('calculates EXPONENTIAL delay correctly', () => {
    expect(calculateRetryDelay(1, policyExponential)).toBe(1000); // 1000 * 2^0
    expect(calculateRetryDelay(2, policyExponential)).toBe(2000); // 1000 * 2^1
    expect(calculateRetryDelay(3, policyExponential)).toBe(4000); // 1000 * 2^2
  });

  it('caps delay at maxDelayMs', () => {
    expect(calculateRetryDelay(6, policyLinear)).toBe(5000); // 6000 capped at 5000
    expect(calculateRetryDelay(4, policyExponential)).toBe(5000); // 8000 capped at 5000
  });

  it('returns 0 for negative or zero attempts', () => {
    expect(calculateRetryDelay(0, policyFixed)).toBe(0);
    expect(calculateRetryDelay(-1, policyFixed)).toBe(0);
  });
});
