import { describe, expect, it } from 'vitest'
import { EnvError, parseEnv } from '../../server/utils/env'

const valid = {
  APP_URL: 'https://tfc.example.de',
  ADMIN_EMAIL: 'Admin@Example.de ',
  SESSION_SECRET: 'x'.repeat(32),
  DATABASE_URL: 'postgres://tfc:tfc@db:5432/tfc',
  SMTP_HOST: 'mail.example.de',
  SMTP_FROM: 'TFC Insight <noreply@example.de>',
}

describe('parseEnv', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const env = parseEnv(valid)
    expect(env.ADMIN_EMAIL).toBe('admin@example.de')
    expect(env.SMTP_PORT).toBe(587)
    expect(env.AI_PROVIDER).toBe('anthropic')
    expect(env.LOGIN_TOKEN_TTL_MINUTES).toBe(15)
    expect(env.SESSION_TTL_DAYS).toBe(30)
    expect(env.UPLOAD_MAX_MB).toBe(10)
    expect(env.ANALYSIS_MAX_RUNS_PER_DAY).toBe(10)
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
  })

  it('treats empty strings as unset', () => {
    const env = parseEnv({ ...valid, GEMINI_API_KEY: '', SMTP_PORT: '' })
    expect(env.GEMINI_API_KEY).toBeUndefined()
    expect(env.SMTP_PORT).toBe(587)
  })

  it('names every missing required variable', () => {
    const { SESSION_SECRET: _s, DATABASE_URL: _d, ...rest } = valid
    expect(() => parseEnv(rest)).toThrow(EnvError)
    expect(() => parseEnv(rest)).toThrow(/SESSION_SECRET/)
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/)
  })

  it('rejects a SESSION_SECRET shorter than 32 characters', () => {
    expect(() => parseEnv({ ...valid, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET.*32/)
  })

  it('rejects invalid values with the variable name', () => {
    expect(() => parseEnv({ ...valid, ADMIN_EMAIL: 'nope' })).toThrow(/ADMIN_EMAIL/)
    expect(() => parseEnv({ ...valid, AI_PROVIDER: 'openai' })).toThrow(/AI_PROVIDER/)
    expect(() => parseEnv({ ...valid, APP_URL: 'not a url' })).toThrow(/APP_URL/)
  })

  it('never includes secret values in the error message', () => {
    const secret = 'supersecret-but-short'
    try {
      parseEnv({ ...valid, SESSION_SECRET: secret })
      expect.unreachable()
    }
    catch (e) {
      expect(String((e as Error).message)).not.toContain(secret)
    }
  })
})
