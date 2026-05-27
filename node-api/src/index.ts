import Fastify from 'fastify'
import { SignJWT, jwtVerify } from 'jose'

const app = Fastify()
const secret = new TextEncoder().encode('secret')
const alg = 'HS256'

app.get('/health', async () => {
  return { status: 'ok', service: 'node-api' }
})

app.post<{ Body: { email?: string; password?: string } }>('/auth/login', async (request, reply) => {
  const { email, password } = request.body

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

app.setNotFoundHandler(async (_request, reply) => {
  reply.code(404)
  return { error: { code: 'endpoint_not_found' } }
})

app.listen({ port: 3000, host: '0.0.0.0' })
