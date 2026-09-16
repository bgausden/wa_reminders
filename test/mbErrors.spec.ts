import { describe, expect, it } from 'vitest'
import { MindbodyError, mbErrorText, summarizeCause } from '../src/effect/mbErrors.js'

// A bare-bones axios-shaped failure: `isAxiosError` passes on the flag,
// so no real axios instance is needed. Deliberately includes secrets in
// the request config — none may survive summarization (#16, #17).
const deniedAccess = (overrides: Record<string, unknown> = {}) => ({
  isAxiosError: true,
  message: 'Request failed with status code 403',
  config: {
    headers: { 'Api-Key': 'live-key-value', SiteId: '220689' },
    data: '{"Username":"owner@example.com","Password":"owner-password"}',
  },
  response: {
    status: 403,
    data: { Error: { Message: 'Unsupported IP Address 20.44.209.42.', Code: 'DeniedAccess' } },
  },
  ...overrides,
})

describe('summarizeCause', () => {
  it('unwraps MindbodyError to the axios message, status and response body', () => {
    const summary = summarizeCause(
      new MindbodyError({ op: 'POST /usertoken/issue', cause: deniedAccess() })
    ) as Record<string, unknown>
    expect(summary.message).toBe('Request failed with status code 403')
    expect(summary.status).toBe(403)
    expect(summary.data).toEqual({
      Error: { Message: 'Unsupported IP Address 20.44.209.42.', Code: 'DeniedAccess' },
    })
  })

  it('summarizes a bare axios error the same way', () => {
    const summary = summarizeCause(deniedAccess()) as Record<string, unknown>
    expect(summary.status).toBe(403)
  })

  it('never carries request config, headers or request bodies', () => {
    const summary = summarizeCause(
      new MindbodyError({ op: 'POST /usertoken/issue', cause: deniedAccess() })
    ) as Record<string, unknown>
    const text = JSON.stringify(summary)
    expect(text).not.toContain('live-key-value')
    expect(text).not.toContain('owner-password')
    expect(text).not.toContain('owner@example.com')
    expect(summary).not.toHaveProperty('config')
    expect(summary).not.toHaveProperty('headers')
  })

  it('passes non-axios causes through untouched', () => {
    expect(summarizeCause('boom')).toBe('boom')
    const err = new Error('plain')
    expect(summarizeCause(err)).toBe(err)
  })
})

describe('mbErrorText', () => {
  it('renders the Mindbody verdict with code', () => {
    expect(
      mbErrorText({ Error: { Message: 'Unsupported IP Address 20.44.209.42.', Code: 'DeniedAccess' } })
    ).toBe('Unsupported IP Address 20.44.209.42. [DeniedAccess]')
  })

  it('renders without a code when absent', () => {
    expect(mbErrorText({ Error: { Message: 'Nope.' } })).toBe('Nope.')
  })

  it('returns null for anything else', () => {
    expect(mbErrorText(null)).toBeNull()
    expect(mbErrorText('plain')).toBeNull()
    expect(mbErrorText({})).toBeNull()
    expect(mbErrorText({ Error: { Code: 'DeniedAccess' } })).toBeNull()
    expect(mbErrorText({ Error: 'DeniedAccess' })).toBeNull()
  })
})
