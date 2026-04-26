import { getHistory, addTurn, _reset } from '../src/ai/context';

describe('conversation buffer', () => {
  beforeEach(() => _reset());

  test('returns empty array for a new sender', () => {
    expect(getHistory('unknown')).toEqual([]);
  });

  test('stores and retrieves turns correctly', () => {
    const sender = '5563999990001';
    addTurn(sender, 'user', 'hello');
    addTurn(sender, 'assistant', 'hi there');

    const history = getHistory(sender);
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: 'user', content: 'hello' });
    expect(history[1]).toEqual({ role: 'assistant', content: 'hi there' });
  });

  test('trims buffer to last 10 exchanges (20 turns)', () => {
    const sender = '5563999990002';
    for (let i = 0; i < 15; i++) {
      addTurn(sender, 'user', `message ${i}`);
      addTurn(sender, 'assistant', `response ${i}`);
    }

    const history = getHistory(sender);
    expect(history.length).toBe(20);
    expect(history[0].content).toBe('message 5');
  });

  test('different senders have independent buffers', () => {
    addTurn('sender_a', 'user', 'message from A');
    addTurn('sender_b', 'user', 'message from B');

    expect(getHistory('sender_a')).toHaveLength(1);
    expect(getHistory('sender_b')).toHaveLength(1);
    expect(getHistory('sender_a')[0].content).toBe('message from A');
  });
});
