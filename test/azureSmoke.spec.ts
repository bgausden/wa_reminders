import { describe, expect, it } from 'vitest'
import { renderSmokePage, resolveTargetDayForHongKong } from '../src/azureSmoke.js'

describe('azure smoke page', () => {
  it('renders a Hong Kong clock and target label', () => {
    const now = new Date('2026-09-13T08:45:00Z')
    const html = renderSmokePage(now)

    expect(html).toContain('Current Hong Kong time')
    expect(html).toContain('Target day')
    expect(html).toContain('2026-09-14')
  })

  it('treats 23:00 UTC as Hong Kong tomorrow', () => {
    const day = resolveTargetDayForHongKong(new Date('2026-09-13T23:00:00Z'))
    expect(day.label).toBe('2026-09-15')
  })
})
