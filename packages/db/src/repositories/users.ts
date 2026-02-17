import type { Sql } from 'postgres'
import type { User, NewUser, PatchUser } from '../types.js'
import { NotFoundError } from '../errors.js'

export class UsersRepository {
  constructor(private readonly sql: Sql) {}

  async findById(id: string): Promise<User | null> {
    const rows = await this.sql<User[]>`
      SELECT * FROM users WHERE id = ${id} AND deleted_at IS NULL
    `
    return rows[0] ?? null
  }

  async findByIdOrThrow(id: string): Promise<User> {
    const user = await this.findById(id)
    if (!user) throw new NotFoundError('User', id)
    return user
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.sql<User[]>`
      SELECT * FROM users
      WHERE  email = ${email.toLowerCase()} AND deleted_at IS NULL
    `
    return rows[0] ?? null
  }

  async create(data: NewUser): Promise<User> {
    const rows = await this.sql<User[]>`
      INSERT INTO users (email, email_verified, name, avatar_url)
      VALUES (
        ${data.email.toLowerCase()},
        ${data.emailVerified ?? false},
        ${data.name ?? null},
        ${data.avatarUrl ?? null}
      )
      RETURNING *
    `
    return rows[0]!
  }

  async upsertByEmail(data: NewUser): Promise<User> {
    const rows = await this.sql<User[]>`
      INSERT INTO users (email, email_verified, name, avatar_url)
      VALUES (
        ${data.email.toLowerCase()},
        ${data.emailVerified ?? false},
        ${data.name ?? null},
        ${data.avatarUrl ?? null}
      )
      ON CONFLICT (email) WHERE deleted_at IS NULL DO UPDATE
        SET name         = COALESCE(EXCLUDED.name, users.name),
            avatar_url   = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
            email_verified = EXCLUDED.email_verified OR users.email_verified,
            updated_at   = NOW()
      RETURNING *
    `
    return rows[0]!
  }

  async update(id: string, patch: PatchUser): Promise<User> {
    const rows = await this.sql<User[]>`
      UPDATE users
         SET ${this.sql(patch)}, updated_at = NOW()
       WHERE id = ${id} AND deleted_at IS NULL
      RETURNING *
    `
    if (!rows[0]) throw new NotFoundError('User', id)
    return rows[0]
  }

  async softDelete(id: string): Promise<void> {
    await this.sql`
      UPDATE users
         SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = ${id} AND deleted_at IS NULL
    `
  }
}
