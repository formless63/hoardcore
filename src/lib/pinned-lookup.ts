import type { LookupAddress } from 'node:dns'
import type { LookupFunction } from 'node:net'

/** Return only the address already checked by the caller's public-IP policy. */
export function createPinnedLookup(pinned: LookupAddress): LookupFunction {
  return (_hostname, options, callback) => {
    // Node's connection path may ask for all addresses (notably with
    // autoSelectFamily). In that mode the callback must receive an array;
    // supplying the single-address shape makes Node reject `undefined` as an IP.
    if (options.all) callback(null, [pinned])
    else callback(null, pinned.address, pinned.family)
  }
}
