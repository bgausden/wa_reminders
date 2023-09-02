import { render } from "prettyjson"
import { getUserToken, defaultUser } from "./User.js";


const userToken = await getUserToken(defaultUser);

console.log(userToken)
