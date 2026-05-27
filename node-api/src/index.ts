import Fastify from 'fastify'

const app = Fastify()

app.get('/health', async () => {
  return {
    status: 'ok',
    service: 'node-api'
  }
})

app.setNotFoundHandler(async (_request, reply) => {
  reply.code(404)
  return {
    error: { code: 'endpoint_not_found' }
  }
})

app.listen({
  port: 3000,
  host: '0.0.0.0'
})
