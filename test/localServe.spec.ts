import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { HttpHandler, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { afterEach, describe, expect, it } from 'vitest'
import { Effect, Layer } from 'effect'
import { AppConfigTest } from '../src/effect/AppConfig.js'
import { CurrentUserTest } from '../src/effect/CurrentUser.js'
import { makeMbHttpTest } from '../src/effect/MbHttp.js'
import { createReportHandler } from '../src/azureReport.js'
import { createGatedHandler } from '../src/azureGate.js'
import { makeReportStoreTest, type StoredReport } from '../src/report/store.js'
import {
  REPORTS_CONTAINER,
  ReportStoreBlobLive,
  STORAGE_CONNECTION_ENV,
  makeReportStoreBlob,
} from '../src/report/blobStore.js'
import { BlobServiceClient } from '@azure/storage-blob'
import { scheduledTargetDay } from '../src/targetDay.js'

// A local instance of the project: the real gated report handler behind a
// real TCP+HTTP server on 127.0.0.1. Tests talk to it with `fetch`, so what
// is verified is the wired app (gate -> handler -> Mindbody stub -> store),
// not a direct function call.
const PASSWORD = 'local-instance-test-password'

const previousPassword = process.env.REPORT_PASSWORD
const previousStorage = process.env[STORAGE_CONNECTION_ENV]
afterEach(() => {
  if (previousPassword === undefined) delete process.env.REPORT_PASSWORD
  else process.env.REPORT_PASSWORD = previousPassword
  if (previousStorage === undefined) delete process.env[STORAGE_CONNECTION_ENV]
  else process.env[STORAGE_CONNECTION_ENV] = previousStorage
})

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

interface MbCalls {
  total: number
  schedule: number
  clients: number
  staff: number
}

const countingMbHandler = (label: string, calls: MbCalls) => (requestPath: string) => {
  calls.total += 1
  if (requestPath.includes('scheduleitems')) {
    calls.schedule += 1
    return scheduleApi(label)
  }
  if (requestPath.includes('clients')) {
    calls.clients += 1
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
    calls.staff += 1
    return {
      StaffMembers: [
        { Id: '1', DisplayName: 'Tamara', FirstName: 'Tamara', LastName: 'Wong', EmpID: 'e1', EmploymentEnd: null },
      ],
    }
  }
  return {}
}

const stubContext = (): InvocationContext =>
  ({
    error: () => {},
    log: () => {},
    info: () => {},
    warn: () => {},
    debug: () => {},
    trace: () => {},
  }) as unknown as InvocationContext

async function startLocalInstance(handler: HttpHandler): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(async (nodeReq, nodeRes) => {
    try {
      const chunks: Array<Buffer> = []
      for await (const chunk of nodeReq) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk as Buffer)
      const bodyText = Buffer.concat(chunks).toString('utf8')
      const host = nodeReq.headers.host ?? '127.0.0.1'
      const url = new URL(nodeReq.url ?? '/', `http://${host}`)
      const headers = new Headers()
      for (const [name, value] of Object.entries(nodeReq.headers)) {
        if (value === undefined) continue
        if (Array.isArray(value)) {
          for (const v of value) if (v !== undefined) headers.append(name, v)
        } else {
          headers.set(name, value)
        }
      }
      const azureReq = {
        method: nodeReq.method ?? 'GET',
        headers,
        query: url.searchParams,
        params: {},
        url: url.pathname + url.search,
        text: async () => bodyText,
      } as unknown as HttpRequest
      const res: HttpResponseInit = await handler(azureReq, stubContext())
      nodeRes.statusCode = res.status ?? 200
      const outHeaders = res.headers as Record<string, string> | Headers | undefined
      if (outHeaders instanceof Headers) {
        outHeaders.forEach((v, k) => nodeRes.setHeader(k, v))
      } else if (outHeaders) {
        for (const [k, v] of Object.entries(outHeaders)) nodeRes.setHeader(k, v)
      }
      if (Array.isArray(res.cookies)) {
        nodeRes.setHeader('Set-Cookie', res.cookies.map((c) => (typeof c === 'string' ? c : `${c.name}=${c.value}`)))
      }
      if (res.body === undefined || res.body === null) {
        nodeRes.end()
      } else {
        nodeRes.end(res.body)
      }
    } catch (error) {
      nodeRes.statusCode = 500
      nodeRes.end(String(error))
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const { port } = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  }
}

const startGatedReportServer = (
  seed: Parameters<typeof makeReportStoreTest>[0],
  labelForNetwork: string,
  calls: MbCalls
): Promise<{ baseUrl: string; close: () => Promise<void> }> => {
  process.env.REPORT_PASSWORD = PASSWORD
  const layers = {
    store: makeReportStoreTest(seed),
    network: Layer.mergeAll(AppConfigTest, makeMbHttpTest(countingMbHandler(labelForNetwork, calls)), CurrentUserTest),
  }
  return startLocalInstance(createGatedHandler(createReportHandler(layers)))
}

/** Sign in over HTTP and return the `wa_session=...` cookie pair for later requests. */
const signInOverHttp = async (baseUrl: string): Promise<string> => {
  const res = await fetch(`${baseUrl}/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password: PASSWORD }).toString(),
    redirect: 'manual',
  })
  expect(res.status).toBe(302)
  const setCookie = res.headers.get('set-cookie')
  expect(setCookie).toContain('wa_session=')
  return (setCookie as string).split(',')[0]?.split(';')[0] as string
}

describe('local instance (localhost HTTP)', () => {
  it('serves the login form to an anonymous browser', async () => {
    const calls: MbCalls = { total: 0, schedule: 0, clients: 0, staff: 0 }
    const label = scheduledTargetDay(new Date()).label
    const { baseUrl, close } = await startGatedReportServer({ scheduled: fragment(label) }, label, calls)
    try {
      const res = await fetch(`${baseUrl}/`)
      expect(res.status).toBe(200)
      const page = await res.text()
      expect(page).toContain('<form method="post"')
      expect(page).toContain('Password')
      expect(page).not.toContain('wa.me')
      // No Mindbody traffic for the gate: the login form serves before the store or network.
      expect(calls.total).toBe(0)
    } finally {
      await close()
    }
  })

  it('rejects a wrong password and grants a session on the right one, then serves the stored list', async () => {
    const calls: MbCalls = { total: 0, schedule: 0, clients: 0, staff: 0 }
    const label = scheduledTargetDay(new Date()).label
    const { baseUrl, close } = await startGatedReportServer({ scheduled: fragment(label) }, label, calls)
    try {
      const denied = await fetch(`${baseUrl}/`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ password: 'nope' }).toString(),
        redirect: 'manual',
      })
      expect(denied.status).toBe(401)
      expect(await denied.text()).toContain('Wrong password')

      const cookie = await signInOverHttp(baseUrl)
      const served = await fetch(`${baseUrl}/`, { headers: { cookie } })
      expect(served.status).toBe(200)
      const page = await served.text()
      // Web page contents: the stored scheduled list with its furniture.
      expect(page).toContain('Reminders for')
      expect(page).toContain('https://wa.me/85291234567?text=hi')
      expect(page).toContain('name="day"')
      expect(page).not.toContain('not the scheduled morning list')
    } finally {
      await close()
    }
  })

  it('retrieves from Mindbody once, then serves the day from storage (refresh forces a second retrieval)', async () => {
    const calls: MbCalls = { total: 0, schedule: 0, clients: 0, staff: 0 }
    const label = scheduledTargetDay(new Date()).label
    const { baseUrl, close } = await startGatedReportServer({}, label, calls)
    try {
      const cookie = await signInOverHttp(baseUrl)

      const first = await fetch(`${baseUrl}/?day=${label}`, { headers: { cookie } })
      expect(first.status).toBe(200)
      const firstPage = await first.text()
      expect(firstPage).toContain('https://wa.me/85291234567?text=')
      expect(firstPage).toContain('name="day"')
      expect(calls.total).toBeGreaterThan(0)
      expect(calls.schedule).toBeGreaterThan(0)
      const afterFirst = calls.total

      // Second view of the same day: blob/memory storage answers, Mindbody is not called again.
      const second = await fetch(`${baseUrl}/?day=${label}`, { headers: { cookie } })
      expect(second.status).toBe(200)
      expect(await second.text()).toContain('https://wa.me/85291234567?text=')
      expect(calls.total).toBe(afterFirst)

      // Forced refresh bypasses the cache and retrieves again.
      const refreshed = await fetch(`${baseUrl}/?day=${label}&refresh=1`, { headers: { cookie } })
      expect(refreshed.status).toBe(200)
      expect(await refreshed.text()).toContain('https://wa.me/85291234567?text=')
      expect(calls.total).toBeGreaterThan(afterFirst)
    } finally {
      await close()
    }
  }, 30000)

  it('serves the day as a download attachment with the resolved filename', async () => {
    const calls: MbCalls = { total: 0, schedule: 0, clients: 0, staff: 0 }
    const label = scheduledTargetDay(new Date()).label
    const { baseUrl, close } = await startGatedReportServer({ days: { [label]: fragment(label) } }, label, calls)
    try {
      const cookie = await signInOverHttp(baseUrl)
      const res = await fetch(`${baseUrl}/?day=${label}&download=1`, { headers: { cookie } })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-disposition')).toContain('attachment')
      expect(res.headers.get('content-disposition')).toContain(`reminders-${label}.html`)
      expect(await res.text()).toContain('https://wa.me/85291234567?text=hi')
    } finally {
      await close()
    }
  })

  it('serves the blob-unavailable page over HTTP when the storage setting is missing', async () => {
    process.env.REPORT_PASSWORD = PASSWORD
    delete process.env[STORAGE_CONNECTION_ENV]
    const brokenNetwork = Layer.fail('network must stay unbuilt') as unknown as NonNullable<
      Parameters<typeof createReportHandler>[0]
    >['network']
    const { baseUrl, close } = await startLocalInstance(
      createGatedHandler(createReportHandler({ store: ReportStoreBlobLive, network: brokenNetwork }))
    )
    try {
      const cookie = await signInOverHttp(baseUrl)
      const res = await fetch(`${baseUrl}/`, { headers: { cookie } })
      expect(res.status).toBe(503)
      expect(await res.text()).toContain('Reminder list unavailable')
    } finally {
      await close()
    }
  })

  it('round-trips reports through real blob storage when an emulator is reachable', async (ctx) => {
    // Fast probe first: without Azurite the SDK call hangs until the test
    // timeout, so check the emulator port with a short fetch instead.
    try {
      const probe = await fetch('http://127.0.0.1:10000/devstoreaccount1?comp=list', {
        signal: AbortSignal.timeout(1000),
      })
      await probe.body?.cancel()
    } catch {
      ctx.skip()
      return
    }
    const cs =
      process.env[STORAGE_CONNECTION_ENV] ??
      'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;'
    let reachable = false
    try {
      const container = BlobServiceClient.fromConnectionString(cs).getContainerClient(REPORTS_CONTAINER)
      await container.createIfNotExists()
      reachable = true
    } catch {
      reachable = false
    }
    if (!reachable) {
      ctx.skip()
      return
    }
    const saved = process.env[STORAGE_CONNECTION_ENV]
    process.env[STORAGE_CONNECTION_ENV] = cs
    try {
      const label = `2026-09-${String(10 + Math.floor(Math.random() * 18)).padStart(2, '0')}`
      const report: StoredReport = { ...fragment(label), generatedAt: new Date('2026-09-13T09:00:00Z') }
      const store = makeReportStoreBlob()
      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.writeScheduled(report)
          const back = yield* store.readScheduled()
          expect(back).toMatchObject({ report: report.report, targetDayLabel: label })
          expect(back?.generatedAt.toISOString()).toBe(report.generatedAt.toISOString())
          yield* store.writeDay({ label }, report)
          const day = yield* store.readDay({ label })
          expect(day?.html).toBe(report.html)
          const missing = yield* store.readDay({ label: '2099-01-05' })
          expect(missing).toBeNull()
        })
      )
    } finally {
      if (saved === undefined) delete process.env[STORAGE_CONNECTION_ENV]
      else process.env[STORAGE_CONNECTION_ENV] = saved
    }
  }, 15000)
})
