import { makeMBDateTimeString, tomorrowMidnight } from '../src/util.js'
import { assert } from 'chai'
import { describe } from 'mocha'

describe('test wa_reminders:util', function () {
  it('should produce valid datetime string', function (done) {
    // valid input for Date() is 2011-10-10T14:48:00.000+08:00
    // example ISO string is 2023-09-03T11:41:06.490Z
    let date = tomorrowMidnight()
    // change the date so it's storing midnight Hong Kong
    // 00:00:00HKT is 00:(00-480min):00 in UTC where 480min is the offset
    //date.setHours(0,-date.getTimezoneOffset(),0,0)
    let result = makeMBDateTimeString(date)
    console.log(`result: ${result}`)
    assert.doesNotThrow(() => {
      let newDate = new Date(result[0]!)
      assert.deepEqual(date, newDate)
    })
    done()
  })
})
