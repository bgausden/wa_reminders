import { app } from '@azure/functions'
import { createAzureFunctionHandler } from './azureSmoke.js'

app.http('smokeHttp', {
  methods: ['GET'],
  authLevel: 'anonymous',
  // Catch-all WITHOUT the `?` marker: ASP.NET routing rejects `{*route?}`
  // ("a catch-all parameter cannot be marked optional") and disables the
  // function at index time. `{*route}` already matches `/` (zero segments).
  route: '{*route}',
  handler: createAzureFunctionHandler(),
})
