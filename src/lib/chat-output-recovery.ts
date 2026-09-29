/** A user turn shares this allowance across normal tool rounds and output recovery. */
export const CHAT_RECOVERY_ATTEMPTS = 2
export const CHAT_OUTPUT_BUDGET = 320000

export interface ChatOutputRecoveryOptions {
  /** Remaining additional model calls allowed for output recovery in this HTTP segment. */
  maxAttempts: number
  /** Remaining total generated tokens, including thinking, for this HTTP segment. */
  maxOutputTokens: number
  onRecovery?: (event: { attempt: number; mode: 'continue' | 'retry' }) => void | PromiseLike<void>
}

/** An unfinished response is never returned as a successful answer or executable action. */
export class ChatOutputRecoveryError extends Error {
  constructor(
    public readonly partialText: string,
    public readonly reason: 'output_limit' | 'output_budget' | 'request_failed',
    options?: ErrorOptions,
  ) {
    super(reason === 'request_failed'
      ? 'Chat response could not complete after an upstream request failed.'
      : reason === 'output_budget'
        ? 'Chat response reached its total output budget before completion.'
        : 'Chat response reached its output limit after automatic recovery.', options)
    this.name = 'ChatOutputRecoveryError'
  }
}
