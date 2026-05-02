/**
 * ConversationSimulator — drives handleMessage() directly so e2e tests can
 * simulate a full conversation without a real WhatsApp connection.
 *
 * DB modules must already be mocked (via jest.mock) before importing this.
 */

import { handleMessage } from '../../../src/whatsapp/handler';
import { clearHistory, clearPendingAction, clearActiveWorkflow } from '../../../src/ai/context';

export class ConversationSimulator {
  constructor(
    private readonly senderNumber = '5511999999999',
    private readonly role: 'rt' | 'team' = 'rt',
  ) {}

  /**
   * Sends a message and returns the bot's response(s) for that turn.
   * Multiple responses happen when the engine auto-advances through
   * consecutive send_message steps.
   */
  async send(message: string): Promise<string[]> {
    const captured: string[] = [];
    await handleMessage(
      message,
      this.senderNumber,
      this.role,
      async (content) => { captured.push(content); },
    );
    return captured;
  }

  /** Reset all in-memory state for this sender between tests. */
  reset(): void {
    clearHistory(this.senderNumber);
    clearPendingAction(this.senderNumber);
    clearActiveWorkflow(this.senderNumber);
  }
}
