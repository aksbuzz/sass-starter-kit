import type { Container } from 'inversify'
import { TeamService }   from '../services/team.service.js'
import { TOKENS }        from '../container/tokens.js'

export function registerTeam(container: Container): void {
  container.bind<TeamService>(TOKENS.TeamService).to(TeamService).inSingletonScope()
}
