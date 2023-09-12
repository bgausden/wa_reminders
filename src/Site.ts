import debug from 'debug'
import { PaginationResponse } from './PaginationResponse.js'
import { mbCall } from './mbCall.js'
import { LOCATIONS_ENDPOINT, SITES_ENDPOINT } from './mb_endpoints.js'

const debugNamespace: string = 'wa_reminders:Site'
let log = debug(debugNamespace)
log.log = console.log.bind(console)

type Site = { id: number; name: string }

interface SitesResponse {
  PaginationResponse: PaginationResponse
  Sites: Site[]
}

interface Location {
  Id: number
  Name: string
  SiteID: number
  Description: string
}

interface LocationsResponse {
  PaginationResponse: PaginationResponse
  Locations: Array<Location>
}

async function getSites(): Promise<SitesResponse> {
  return mbCall('get', SITES_ENDPOINT, {}, {})
}

async function getLocations(): Promise<LocationsResponse> {
  return mbCall('get', LOCATIONS_ENDPOINT, {}, {})
}

export { getLocations, getSites }

// Debugging
//log(await getSites())
//log(await getLocations())
