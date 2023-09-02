import { assert } from "chai"
import { getScheduleItems } from "../src/Appointment.js"
import { describe, it, before, after } from 'mocha';


describe('test getScheduleItems', function () {
    it('should not throw for valid dates', function (done) {
        getScheduleItems(new Date(2021, 0, 1), new Date(2021, 0, 2), 0).then((scheduleItems) => {
            assert.isNotNull(scheduleItems);
            assert.isObject(scheduleItems);
            done();
        }).catch((error) => {
            done(error);
        });
    })
})