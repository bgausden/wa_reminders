// var unirest = require("unirest")
// @ts-ignore ts-7016
// import * as Unirest from "unirest"
import unirest from "unirest"
import { render } from "prettyjson"

function getAppointments(accessToken: string): void {
    let appointmentsReq = unirest(
        "GET",
        "https://api.mindbodyonline.com/public/v6/appointment/scheduleitems?request.endDate=2020-01-01&request.limit=200&request.staffIds=0&request.startDate=2020-01-01"
    )
        .headers({
            siteID: "-99",
            // authorization: "2d65f91a75814aaab6e5fd93148130f0a271a0ca280147aea289b9345ff1d753",
            authorization: accessToken,
            "Api-Key": "b46102a0d390475aae114962a9a1fbd9",
        })
        .end(function(appointmentsReqResult: any) {
            if (appointmentsReqResult.error) throw new Error(appointmentsReqResult.error)
            console.log(render(appointmentsReqResult.raw_body))
        })
}

let tokenReq = unirest("POST", "https://api.mindbodyonline.com/public/v6/usertoken/issue")
    .headers({
        SiteId: "-99",
        "Content-Type": "application/x-www-form-urlencoded",
        "Api-Key": "b46102a0d390475aae114962a9a1fbd9",
    })
    .send("Username=Siteowner")
    .send("Password=apitest1234")
    .end(function(tokenReqResult: any) {
        if (tokenReqResult.error) throw new Error(tokenReqResult.error)
        getAppointments(tokenReqResult.body.AccessToken)
    })
