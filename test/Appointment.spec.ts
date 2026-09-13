import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getScheduleItems } from '../src/Appointment.js'
import { defaultHTTPClient } from '../src/httpClient.js'

describe('getScheduleItems', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should return schedule data for valid dates', async () => {
    const responseData = {
      PaginationResponse: { RequestedLimit: 10, RequestedOffset: 0 },
      StaffMembers: [],
    }
    // Minimal `config` only because Appointment.ts logs
    // `response.config.params`. It is not part of the assertion.
    const getSpy = vi.spyOn(defaultHTTPClient, 'get').mockResolvedValue({
      data: responseData,
      config: { params: {} },
    } as any)

    const scheduleItems = await getScheduleItems(
      { userName: 'user', password: 'pass', siteId: 1, token: 'token' },
      new Date(2021, 0, 1),
      new Date(2021, 0, 2),
      ['staff-1'],
      0,
      10
    )

    expect(scheduleItems).toEqual(responseData)
    expect(getSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: expect.objectContaining({
          startDate: expect.any(String),
          endDate: expect.any(String),
          staffIds: ['staff-1'],
          offset: 0,
          limit: 10,
        }),
        headers: expect.objectContaining({ authorization: 'token' }),
      })
    )
  })

  it('should reject when user token is missing without calling http', async () => {
    const getSpy = vi.spyOn(defaultHTTPClient, 'get')
    await expect(
      getScheduleItems(
        { userName: 'user', password: 'pass', siteId: 1 },
        new Date(2021, 0, 1),
        new Date(2021, 0, 2),
        ['staff-1'],
        0,
        10
      )
    ).rejects.toBe('User token is undefined')
    expect(getSpy).not.toHaveBeenCalled()
  })

  it('should reject when the request fails', async () => {
    vi.spyOn(defaultHTTPClient, 'get').mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: { status: 500, data: {} },
        config: {},
      })
    )
    await expect(
      getScheduleItems(
        { userName: 'user', password: 'pass', siteId: 1, token: 'token' },
        new Date(2021, 0, 1),
        new Date(2021, 0, 2),
        ['staff-1'],
        0,
        10
      )
    ).rejects.toBe('getScheduleItems() failed')
  })
})