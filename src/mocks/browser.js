import { setupWorker } from 'msw'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)

export function startWorker() {
  // start the worker and return the promise
  return worker.start({ onUnhandledRequest: 'bypass' })
}
