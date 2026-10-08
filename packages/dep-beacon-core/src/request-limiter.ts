export class RequestLimiter {
  #active = 0
  readonly #limit: number
  readonly #queue: (() => void)[] = []

  constructor(limit: number) {
    this.#limit = limit
  }

  async run<T>(lookup: () => Promise<T>): Promise<T> {
    await this.#acquire()

    try {
      return await lookup()
    } finally {
      this.#release()
    }
  }

  async #acquire(): Promise<void> {
    if (this.#active < this.#limit) {
      this.#active += 1

      return
    }

    await new Promise<void>(resolve => {
      this.#queue.push(resolve)
    })
  }

  #release(): void {
    const next = this.#queue.shift()

    if (next) {
      next()

      return
    }

    this.#active -= 1
  }
}
