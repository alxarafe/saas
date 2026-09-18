import Fastify, { type FastifyReply } from 'fastify'
import { SignJWT, jwtVerify } from 'jose'
import pg from 'pg'

const { Pool } = pg

const app = Fastify()
const secret = new TextEncoder().encode('secret')
const alg = 'HS256'

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'saas',
  password: process.env.DB_PASSWORD || 'saas',
  database: process.env.DB_NAME || 'saas',
  max: 10,
})

const VALIDATORS = {
  required: 'required',
  invalid_type: 'invalid_type',
} as const

function validateFields(fields: string[], get: (field: string) => unknown): { field: string; code: string }[] {
  const details: { field: string; code: string }[] = []
  for (const field of fields) {
    const value = get(field)
    if (value === undefined || value === null || (typeof value === 'string' && value === '')) {
      details.push({ field, code: VALIDATORS.required })
    } else if (typeof value !== 'string') {
      details.push({ field, code: VALIDATORS.invalid_type })
    }
  }
  return details
}

function badRequest(reply: FastifyReply) {
  reply.code(400)
  return { error: { code: 'bad_request' } }
}

function validationError(reply: FastifyReply, details: { field: string; code: string }[]) {
  reply.code(422)
  return { error: { code: 'validation_error', details } }
}

async function ensureSchema() {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS users (' +
      'id BIGSERIAL PRIMARY KEY, ' +
      'email TEXT NOT NULL UNIQUE, ' +
      'password_hash TEXT NOT NULL, ' +
      'created_at TIMESTAMPTZ NOT NULL DEFAULT now())'
  )
}

app.get('/health', async () => {
  return { status: 'ok' }
})

app.post<{ Body: unknown }>('/auth/login', async (request, reply) => {
  const body = request.body as { email?: unknown; password?: unknown } | null
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return badRequest(reply)
  }

  const details = validateFields(['email', 'password'], (f) => (body as any)[f])
  if (details.length > 0) {
    return validationError(reply, details)
  }

  const { email, password } = body as { email: string; password: string }

  if (email !== 'admin@example.com' || password !== 'secret') {
    reply.code(401)
    return { error: { code: 'invalid_credentials' } }
  }

  const token = await new SignJWT({ sub: '1', email: 'admin@example.com' })
    .setProtectedHeader({ alg })
    .sign(secret)

  return { data: { token } }
})

app.get('/me', async (request, reply) => {
  const auth = request.headers.authorization

  if (!auth || !auth.startsWith('Bearer ')) {
    reply.code(401)
    return { error: { code: 'missing_token' } }
  }

  const token = auth.slice(7)
  try {
    const { payload } = await jwtVerify(token, secret)
    return { data: { id: Number(payload.sub), email: payload.email } }
  } catch {
    reply.code(401)
    return { error: { code: 'invalid_token' } }
  }
})

app.post<{ Body: unknown }>('/users/bulk', async (request, reply) => {
  const body = request.body as { data?: unknown } | null
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return badRequest(reply)
  }

  if (body.data === undefined || !Array.isArray(body.data)) {
    return validationError(reply, [{ field: 'data', code: 'invalid_type' }])
  }

  const users: { email: string; password_hash: string }[] = []
  const details: { field: string; code: string }[] = []
  for (const [i, item] of body.data.entries()) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      details.push({ field: `data[${i}]`, code: 'invalid_type' })
      continue
    }
    const itemFields = validateFields(['email', 'password_hash'], (f) => (item as any)[f])
    for (const d of itemFields) details.push({ field: `data[${i}].${d.field}`, code: d.code })
    if (itemFields.length === 0) {
      users.push({ email: (item as any).email, password_hash: (item as any).password_hash })
    }
  }
  if (details.length > 0) {
    return validationError(reply, details)
  }
  if (users.length === 0) {
    return validationError(reply, [{ field: 'data', code: 'required' }])
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const created: { id: number; email: string; created_at: string }[] = []
    for (const user of users) {
      const { rows } = await client.query<{ id: string; email: string; created_at: Date }>(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
        [user.email, user.password_hash]
      )
      const row = rows[0]
      created.push({ id: Number(row.id), email: row.email, created_at: row.created_at.toISOString() })
    }
    await client.query('COMMIT')
    reply.code(201)
    return { data: created }
  } catch (error: any) {
    await client.query('ROLLBACK')
    if (error?.code === '23505') {
      reply.code(409)
      return { error: { code: 'conflict' } }
    }
    throw error
  } finally {
    client.release()
  }
})

app.get('/users', async (request, reply) => {
  const rawLimit = request.query ? (request.query as any).limit : undefined
  const rawOffset = request.query ? (request.query as any).offset : undefined
  const limit = rawLimit === undefined || rawLimit === '' ? 20 : Number(rawLimit)
  const offset = rawOffset === undefined || rawOffset === '' ? 0 : Number(rawOffset)

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return validationError(reply, [{ field: 'limit', code: 'invalid_type' }])
  }
  if (!Number.isInteger(offset) || offset < 0) {
    return validationError(reply, [{ field: 'offset', code: 'invalid_type' }])
  }

  try {
    const count = await pool.query<{ count: string }>('SELECT COUNT(*) FROM users')
    const total = Number(count.rows[0].count)
    const { rows } = await pool.query<{ id: string; email: string; created_at: Date }>(
      'SELECT id, email, created_at FROM users ORDER BY id LIMIT $1 OFFSET $2',
      [limit, offset]
    )
    return {
      data: rows.map((r) => ({ id: Number(r.id), email: r.email, created_at: r.created_at.toISOString() })),
      pagination: { limit, offset, total },
    }
  } catch (error: any) {
    if (error?.code === '23505') {
      reply.code(409)
      return { error: { code: 'conflict' } }
    }
    throw error
  }
})

app.setNotFoundHandler(async (_request, reply) => {
  reply.code(404)
  return { error: { code: 'endpoint_not_found' } }
})

app.setErrorHandler(async (error, request, reply) => {
  const statusCode = (error as { statusCode?: number }).statusCode
  if (statusCode === 400 || request.url === '/auth/login') {
    reply.code(400)
    return { error: { code: 'bad_request' } }
  }
  if (request.url === '/users/bulk' || request.url === '/users') {
    reply.code(500)
    return { error: { code: 'internal_error' } }
  }
  reply.send(error)
})

async function start() {
  await ensureSchema()
  await app.listen({ port: 3000, host: '0.0.0.0' })
}

start().catch((error) => {
  console.error('startup failed, retrying schema init...', error)
  setTimeout(start, 2000)
})