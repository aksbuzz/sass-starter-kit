import { buildApp }  from './app.js'
import { config }    from './config.js'
import { sql, adminSql } from '@saas/db'


async function shutdown(fastify: Awaited<ReturnType<typeof buildApp>>, signal: string) {
  fastify.log.info({ signal }, 'Shutdown signal received — closing server')
  try {
    await fastify.close()
    await Promise.all([sql.end(), adminSql.end()])
    fastify.log.info('Server and DB connections closed gracefully')
    process.exit(0)
  } catch (err) {
    fastify.log.error({ err }, 'Error during shutdown')
    process.exit(1)
  }
}

async function main() {
  const fastify = await buildApp()

  process.on('SIGTERM', () => shutdown(fastify, 'SIGTERM'))
  process.on('SIGINT',  () => shutdown(fastify, 'SIGINT'))
  process.on('unhandledRejection', (reason) => {
    fastify.log.fatal({ reason }, 'Unhandled promise rejection — exiting')
    process.exit(1)
  })

  try {
    await fastify.listen({ port: config.API_PORT, host: '0.0.0.0' })
  } catch (err) {
    fastify.log.fatal({ err }, 'Failed to start server')
    process.exit(1)
  }
}

main()
