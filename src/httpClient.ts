import axios from "axios"
import { MB_BASE_URL } from "./constants.js";
import {User, defaultUser} from "./User.js"
import envVars from "./envvars.js";
import debug from "debug"

const log = debug("httpClient:initHttpClient")

function initHttpClient(user:User) {
    if (!user.token) {
        log(`User ${user.userName} does not have a token. Consider calling getUserToken() first.`)
    }
    const httpClient = axios.create({
        baseURL: MB_BASE_URL,
        headers: {
            "Content-Type": "application/json",
            "API-Key": envVars.API_KEY,
            "SiteId": user.siteId.toString(),
            "Authorization": user.token
        },
        maxBodyLength: Infinity
    })
    return httpClient
}

const defaultHTTPClient = initHttpClient(defaultUser)

export {defaultHTTPClient, initHttpClient}
