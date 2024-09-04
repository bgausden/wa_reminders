import * as O from 'fp-ts/lib/Option.js'
import * as IO from 'fp-ts/lib/IO.js'
import * as FUNC from 'fp-ts/lib/function.js'
const { pipe } = FUNC

import { render } from 'prettyjson'
import debug from 'debug'

/**
 * Checks if the parameter is of the form Array<{}>
 * @param param - The parameter to be checked
 * @returns boolean - Returns true if the parameter is an array of objects, false otherwise
 */
const isObjectsArray = (param: unknown): boolean =>
  pipe(param, O.fromNullable, O.chain(O.fromPredicate(Array.isArray)), O.isSome)

/**
 * A function that logs the given value using the debug library
 * @param x - The value to be logged
 * @returns IO.IO<void> - A function that logs the value
 */
export const fpLog =
  (x: any): IO.IO<void> =>
  () =>
    log(x)

const debugNamespace = 'wa_reminders:Logging'
const log = debug(debugNamespace)
log.log = console.log.bind(console)

/**
 * A wrapper around the log function that checks if the parameter is an array of objects.
 * If it is, it pretty prints the array, otherwise it logs the parameter as is.
 * @param x - The value to be logged
 */
export function complexLog(x: unknown, logger: debug.Debugger): void {
  pipe(
    x,
    O.fromPredicate(isObjectsArray),
    O.fold(
      () => logger(x),
      () => pipe(render(x), logger)
    )
  )
}

function logging(): void {
  log({ bert: 1, ernie: 2 })
  log(['bert', 'ernie'])
  log({ bert: 1 }, { ernie: 2 })
  log([{ bert: 1 }, { ernie: 2 }])
  log([{ bert: 1 }, { ernie: 2, bigbird: 3 }])
  const x = [{ bert: 1 }, { ernie: 2, bigbird: 3 }]
  log(x)
  return
}

//logging()