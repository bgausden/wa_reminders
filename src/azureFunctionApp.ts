import { app } from '@azure/functions'
import { createReportHandler } from './azureReport.js'
import { MORNING_TIMER_SCHEDULE, morningTimerHandler } from './azureTimer.js'
import { createGatedHandler } from './azureGate.js'

app.http('reportHttp', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  // Catch-all WITHOUT the `?` marker: ASP.NET routing rejects `{*route?}`
  // ("a catch-all parameter cannot be marked optional") and disables the
  // function at index time. `{*route}` already matches `/` (zero segments).
  route: '{*route}',
  // #10: the shared-password gate stands in front of whatever is served —
  // since #11, the stored scheduled report (no Mindbody calls on this path).
  handler: createGatedHandler(createReportHandler()),
})

// #11: the 9am Hong Kong run. Schedule is 9:00 in `TZ` (the deploy sets
// `TZ=Asia/Hong_Kong`, which Flex on Linux honors for timer triggers),
// resolving to "tomorrow in Hong Kong" per invocation at run time.
app.timer('morningTimer', {
  schedule: MORNING_TIMER_SCHEDULE,
  handler: morningTimerHandler,
})
