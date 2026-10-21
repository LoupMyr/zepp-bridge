// Promise for Zepp OS 2.x watch apps: the native one is not reliable there.
// Import this first in app.js, before anything that uses promises.
import ES6Promise from 'es6-promise/lib/es6-promise/promise'

// Run reactions synchronously: the device has no microtask queue to rely on
ES6Promise._setScheduler((flush) => flush && flush())

const root = typeof globalThis !== 'undefined' ? globalThis : Function('return this')()
root.Promise = ES6Promise
