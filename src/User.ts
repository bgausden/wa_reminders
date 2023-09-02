import envvars from "./envvars.js";
import axios from "axios"
import { MB_BASE_URL } from "./constants.js";
import { USER_TOKEN_ENDPOINT } from "./mb_endpoints.js";
import { render } from "prettyjson";

export interface User {
    userName: string;
    password: string;
    siteId: number;
    token?: string;
}

export class UserBuilder {
    private user: User;

    constructor() {
        this.user = {
            userName: "",
            password: "",
            siteId: -99,
            token: ""
        };
    }

    withUserName(userName: string): UserBuilder {
        this.user.userName = userName;
        return this;
    }

    withPassword(password: string): UserBuilder {
        this.user.password = password;
        return this;
    }

    withSiteId(siteId: number): UserBuilder {
        this.user.siteId = siteId;
        return this;
    }

    withToken(token: string): UserBuilder {
        this.user.token = token;
        return this;
    }

    build(): User {
        return this.user;
    }
}

async function createDefaultUser(): Promise<User> {
    const user = new UserBuilder()
        .withUserName(envvars.MB_USERNAME)
        .withPassword(envvars.MB_PASSWORD)  
        .withSiteId(envvars.STUDIO_ID)
        .build();

    return ({...user, token: await getUserToken(user)})
}

const defaultUser = await createDefaultUser();

/**
 * 
 * @param user 
 * @returns Promise<string>
 * 
 * @summary Request a user token from Mindbody
 */
function getUserToken(user: User): Promise<string> {
    const response  = axios.post(
        `${MB_BASE_URL}${USER_TOKEN_ENDPOINT}`, {
        Username: user.userName,
        Password: user.password
    },
        {
            headers: {
                'Content-Type': 'application/json',
                'Api-Key': envvars.API_KEY,
                SiteId: [user.siteId.toString()],
            }
        }
    ).then((response) => {
        if (!response) { return }
        if (response.status !== 200) {
            throw new Error(`Failed to get user token: ${response.status}`);
        }

        return response.data.AccessToken;
    }).catch((error) => {
        throw new Error(`Failed to get user token: ${render(error)}`);
    })
    return response
}

export { defaultUser };


