import { z } from 'zod'

// Empty strings in .env files mean "not set".
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(v => (v === '' ? undefined : v), schema.optional())

const withDefault = <T extends z.ZodType>(schema: T, fallback: z.input<T>) =>
  z.preprocess(v => (v === '' || v === undefined ? fallback : v), schema)

const required = (name: string) =>
  z.preprocess(v => (v === '' ? undefined : v), z.string({ error: `${name} fehlt` }))

const envSchema = z.object({
  APP_URL: required('APP_URL').pipe(z.url({ error: 'APP_URL ist keine gültige URL' })),
  ADMIN_EMAIL: required('ADMIN_EMAIL')
    .transform(v => v.trim().toLowerCase())
    .pipe(z.email({ error: 'ADMIN_EMAIL ist keine gültige E-Mail-Adresse' })),
  SESSION_SECRET: required('SESSION_SECRET')
    .pipe(z.string().min(32, { error: 'SESSION_SECRET muss mindestens 32 Zeichen lang sein' })),
  DATABASE_URL: required('DATABASE_URL'),

  SMTP_HOST: required('SMTP_HOST'),
  SMTP_PORT: withDefault(z.coerce.number().int().positive(), 587),
  SMTP_USER: optional(z.string()),
  SMTP_PASS: optional(z.string()),
  SMTP_FROM: required('SMTP_FROM'),

  AI_PROVIDER: withDefault(z.enum(['anthropic', 'gemini']), 'anthropic'),
  ANTHROPIC_API_KEY: optional(z.string()),
  ANTHROPIC_MODEL: optional(z.string()),
  GEMINI_API_KEY: optional(z.string()),
  GEMINI_MODEL: optional(z.string()),

  LOGIN_TOKEN_TTL_MINUTES: withDefault(z.coerce.number().int().positive(), 15),
  SESSION_TTL_DAYS: withDefault(z.coerce.number().int().positive(), 30),
  UPLOAD_MAX_MB: withDefault(z.coerce.number().positive(), 10),
  ANALYSIS_MAX_RUNS_PER_DAY: withDefault(z.coerce.number().int().nonnegative(), 10),
})

export type Env = z.infer<typeof envSchema>

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Ungültige Konfiguration:\n${problems.map(p => `  - ${p}`).join('\n')}`)
    this.name = 'EnvError'
  }
}

/** Validates the given environment. Error messages name variables, never values. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source)
  if (result.success) return result.data
  const problems = result.error.issues.map((issue) => {
    const name = String(issue.path[0] ?? '?')
    return issue.message.includes(name) ? issue.message : `${name}: ${issue.message}`
  })
  throw new EnvError(problems)
}

let cached: Env | undefined

/** Validated environment of the running server (parsed once). */
export function useEnv(): Env {
  cached ??= parseEnv(process.env)
  return cached
}
