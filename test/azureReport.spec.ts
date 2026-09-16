import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { describe, expect, it } from 'vitest'
import { Effect, Layer, Logger, LogLevel } from 'effect'
import { AppConfigTest } from '../src/effect/AppConfig.js'
import { makeMbHttpTest } from '../src/effect/MbHttp.js'
import { MindbodyError } from '../src/effect/mbErrors.js'
import { CurrentUserTest } from '../src/effect/CurrentUser.js'
import { makeReportStoreTest, type StoredReport } from '../src/report/store.js'
import { scheduledTargetDay } from '../src/targetDay.js'
import { createReportHandler } from '../src/azureReport.js'

const brokenNetwork = Layer.fail('network must stay unbuilt') as unknown as Parameters<
  typeof createReportHandler
>[0]['network']

const request = (qs: string): HttpRequest =>
  ({
    method: 'GET',
    headers: new Headers(),
    query: new URLSearchParams(qs),
    params: {},
  }) as unknown as HttpRequest

const context = (): InvocationContext =>
  ({
    error: () => {},
    log: () => {},
    info: () => {},
    warn: () => {},
    debug: () => {},
    trace: () => {},
  }) as unknown as InvocationContext

const fragment = (label: string): StoredReport => ({
  html: `<html><head></head><body><a href="https://wa.me/85291234567?text=hi">send</a></body></html>`,
  report: `list for ${label}`,
  targetDayLabel: label,
  generatedAt: new Date(),
})

const scheduleApi = (label: string) => ({
  StaffMembers: [
    {
      FirstName: 'Tamara',
      LastName: 'Wong',
      DisplayName: 'Tamara',
      Id: 1,
      Name: null,
      Appointments: [
        {
          Duration: 60,
          Id: 101,
          Status: 'Booked',
          StartDateTime: `${label}T10:00:00`,
          EndDateTime: `${label}T11:00:00`,
          Notes: null,
          StaffRequested: false,
          ProgramId: 2,
          SessionTypeId: 20,
          StaffId: 1,
          ClientId: 'c1',
          Resources: null,
          AddOns: null,
        },
      ],
    },
  ],
})

const handler = (label: string) => (requestPath: string) => {
  if (requestPath.includes('scheduleitems')) return scheduleApi(label)
  if (requestPath.includes('clients')) {
    return {
      Clients: [
        {
          Id: 'c1',
          FirstName: 'Ann',
          LastName: 'Bee',
          Email: null,
          MobilePhone: '91234567',
          HomePhone: null,
          SendScheduleTexts: true,
          SuspensionInfo: {},
        },
      ],
    }
  }
  if (requestPath.includes('staff')) {
    return {
      StaffMembers: [
        { Id: '1', DisplayName: 'Tamara', FirstName: 'Tamara', LastName: 'Wong', EmpID: 'e1', EmploymentEnd: null },
      ],
    }
  }
  return {}
}

const quiet = Logger.withMinimumLogLevel(LogLevel.Fatal)

// The handler with a seeded memory store. The network double answers from
// the fixture above, so uncached days generate with no Azure and no network;
// the template comes from the repo's shipped copy (templateFile default).
const serve = (
  seed: Parameters<typeof makeReportStoreTest>[0],
  labelForNetwork: string
): ((req: HttpRequest) => Promise<HttpResponseInit>) => {
  const layers = {
    store: makeReportStoreTest(seed),
    network: Layer.mergeAll(AppConfigTest, makeMbHttpTest(handler(labelForNetwork)), CurrentUserTest),
  }
  const handle = createReportHandler(layers)
  return (req) => handle(req, context())
}

describe('createReportHandler', () => {
  it('serves the scheduled list with the picker form and no ad-hoc banner', async () => {
    const label = scheduledTargetDay(new Date()).label
    const res = await serve({ scheduled: fragment(label) }, label)(request(''))
    expect(res.status).toBe(200)
    const page = String(res.body)
    expect(page).toContain('Reminders for')
    expect(page).toContain('https://wa.me/85291234567?text=hi')
    expect(page).toContain('name="day"')
    expect(page).not.toContain('not the scheduled morning list')
  })

  it('serves the scheduled list without building the network layers', async () => {
    // Regression: the merged layers used to build AppConfig on every
    // request, so the bookmark 503'd until Mindbody credentials existed.
    const label = scheduledTargetDay(new Date()).label
    const handle = createReportHandler({
      store: makeReportStoreTest({ scheduled: fragment(label) }),
      network: brokenNetwork,
    })
    const res = await handle(request(''), context())
    expect(res.status).toBe(200)
    expect(String(res.body)).toContain('Reminders for')
  })

  it('serves a cached day for its own label', async () => {
    const label = scheduledTargetDay(new Date()).label
    const res = await serve({ days: { [label]: fragment(label) } }, label)(
      request(`day=${label}`)
    )
    expect(res.status).toBe(200)
    expect(String(res.body)).toContain('https://wa.me/85291234567?text=hi')
  })

  it('banners a far-future cached day as ad-hoc', async () => {
    const res = await serve({ days: { '2099-01-05': fragment('2099-01-05') } }, '2099-01-05')(
      request('day=2099-01-05')
    )
    expect(res.status).toBe(200)
    const page = String(res.body)
    expect(page).toContain('not the scheduled morning list')
    expect(page).toContain('Monday January 5th 2099')
  })

  it('rejects an unparseable spec with the form and the reason', async () => {
    const label = scheduledTargetDay(new Date()).label
    const res = await serve({}, label)(request('day=not-a-day!!'))
    expect(res.status).toBe(200)
    const page = String(res.body)
    expect(page).toContain('Could not generate reminders')
    expect(page).toContain('name="day"')
    expect(page).toContain('Invalid day')
  })

  it('downloads the cached day as an attachment', async () => {
    const label = scheduledTargetDay(new Date()).label
    const res = await serve({ days: { [label]: fragment(label) } }, label)(
      request(`day=${label}&download=1`)
    )
    expect(res.status).toBe(200)
    const headers = res.headers as Record<string, string>
    expect(headers['Content-Disposition']).toContain('attachment')
    expect(headers['Content-Disposition']).toContain(`reminders-${label}.html`)
  })

  it('generates an uncached day end to end', async () => {
    const label = scheduledTargetDay(new Date()).label
    const res = await serve({}, label)(request(`day=${label}`))
    expect(res.status).toBe(200)
    const page = String(res.body)
    // Real Mindbody-shaped fixture through the real template: wa.me link.
    expect(page).toContain('https://wa.me/85291234567?text=')
    expect(page).toContain('name="day"')
  }, 30000)

  it('banners the typed Mindbody failure, not the FiberFailure default', async () => {
    // Regression: the adapter passed runPromise's FiberFailure straight to
    // describeFailure, so every page could only ever say "An error has
    // occurred" — hiding verdicts like the blocked calling IP.
    const denied = new MindbodyError({
      op: 'POST /usertoken/issue',
      cause: {
        isAxiosError: true,
        message: 'Request failed with status code 403',
        response: {
          status: 403,
          data: { Error: { Message: 'Unsupported IP Address 20.44.209.42.', Code: 'DeniedAccess' } },
        },
      },
    })
    const handle = createReportHandler({
      store: makeReportStoreTest({}),
      network: Layer.fail(denied) as unknown as Parameters<typeof createReportHandler>[0]['network'],
    })
    const res = await handle(request('day=tomorrow'), context())
    expect(res.status).toBe(503)
    const page = String(res.body)
    expect(page).toContain('Could not generate reminders')
    expect(page).toContain('Unsupported IP Address 20.44.209.42.')
    expect(page).toContain('DeniedAccess')
    expect(page).not.toContain('An error has occurred')
  })
})
