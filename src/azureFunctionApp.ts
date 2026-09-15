import { app } from '@azure/functions'
import { createAzureFunctionHandler } from './azureSmoke.js'
import { createGatedHandler } from './azureGate.js'

app.http('smokeHttp', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  // Catch-all WITHOUT the `?` marker: ASP.NET routing rejects `{*route?}`
  // ("a catch-all parameter cannot be marked optional") and disables the
  // function at index time. `{*route}` already matches `/` (zero segments).
  route: '{*route}',
  // #10: the shared-password gate stands in front of whatever is served —
  // currently the smoke page, the scheduled report once #11 lands.
  handler: createGatedHandler(createAzureFunctionHandler()),
})
