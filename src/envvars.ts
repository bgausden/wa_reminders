import { string, z } from 'zod'
import dotenv from 'dotenv'

dotenv.config({
  path:
    process.env.NODE_ENV === 'production'
      ? '.env.production'
      : '.env.development',
})

const ev = z.object({
  API_KEY: z.string(),
  STUDIO_ID: z.coerce.number(),
  MB_USERNAME: z.string(),
  MB_PASSWORD: z.string(),
})

const envVars = ev.parse(process.env)

export default envVars
