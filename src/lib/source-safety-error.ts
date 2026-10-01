/** A persisted source access gate stopped acquisition; never retry inline. */
export class SourceSafetyStop extends Error {
  constructor(message: string) { super(message); this.name = 'SourceSafetyStop' }
}
