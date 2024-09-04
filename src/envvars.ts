import { string, z } from 'zod'
import dotenv from 'dotenv'
import debug from 'debug'
import chalk from 'chalk'

const debugNamespace = 'wa_reminders:envvars'
const log = debug(debugNamespace)
log.log = console.log.bind(console)

log(chalk.blue(`Environment is set to ${chalk.redBright(process.env.NODE_ENV)}`))

dotenv.config({
  path:
    process.env.NODE_ENV === 'production'
      ? '.env.production'
      : '.env.development',
})

const ev = z.object({
  API_KEY: z.string(),
  SITE_ID: z.coerce.number(),
  MB_USERNAME: z.string(),
  MB_PASSWORD: z.string(),
})

const envVars = ev.parse(process.env)

export default envVars