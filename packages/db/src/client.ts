import postgres from 'postgres'

export const sql = postgres(process.env['DATABASE_APP_URL']!, {
  max: 20,
  idle_timeout: 10,
  connect_timeout: 5,
  transform: postgres.camel,
  onnotice: () => {}
})

export const adminSql = postgres(process.env['DATABASE_URL']!, {
  max: 5,
  idle_timeout: 30,
  connect_timeout: 5,
  transform: postgres.camel,
  onnotice: () => {},
})

export type { Sql, TransactionSql } from 'postgres'
