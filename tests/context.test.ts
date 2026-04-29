import {
  getHistory, addTurn, clearHistory,
  setPendingAction, getPendingAction, clearPendingAction,
  isConfirmation, isRejection,
  _reset
} from '../src/ai/context';

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

  test('clearHistory removes only the given sender', () => {
    addTurn('sender_x', 'user', 'hello');
    addTurn('sender_y', 'user', 'hello');
    clearHistory('sender_x');
    expect(getHistory('sender_x')).toEqual([]);
    expect(getHistory('sender_y')).toHaveLength(1);
  });

  test('different senders have independent buffers', () => {
    addTurn('sender_a', 'user', 'message from A');
    addTurn('sender_b', 'user', 'message from B');

    expect(getHistory('sender_a')).toHaveLength(1);
    expect(getHistory('sender_b')).toHaveLength(1);
    expect(getHistory('sender_a')[0].content).toBe('message from A');
  });
});

describe('pending action store', () => {
  beforeEach(() => _reset());

  test('returns null for a sender with no pending action', () => {
    expect(getPendingAction('5563999999999')).toBeNull();
  });

  test('stores and retrieves a pending save action', () => {
    const action = {
      type: 'save' as const,
      demand: { message: 'texto', summary: 'resumo', category: 'rotina', priority: 'low' },
      messageId: 'false_5511999999999_ABCDEF1234567890'
    };
    setPendingAction('5563999999999', action);
    expect(getPendingAction('5563999999999')).toEqual(action);
  });

  test('clears the pending action', () => {
    setPendingAction('5563999999999', { type: 'resolve', demandId: 'abc', demandPriority: 'high', demandSummary: 'resumo' });
    clearPendingAction('5563999999999');
    expect(getPendingAction('5563999999999')).toBeNull();
  });

  test('different senders have independent pending actions', () => {
    setPendingAction('sender_a', { type: 'resolve', demandId: 'id-a', demandPriority: 'high', demandSummary: 'A' });
    setPendingAction('sender_b', { type: 'resolve', demandId: 'id-b', demandPriority: 'low', demandSummary: 'B' });

    expect((getPendingAction('sender_a') as any).demandId).toBe('id-a');
    expect((getPendingAction('sender_b') as any).demandId).toBe('id-b');
  });

  test('stores and retrieves an add_note action', () => {
    const action = {
      type: 'add_note' as const,
      demandId: 'abc-123',
      existingNotes: '[29/04 10:00] Nota anterior',
      formattedNote: '[29/04 14:32] Liguei para o fornecedor',
      demandSummary: 'Falta de dipirona'
    };
    setPendingAction('5563999999999', action);
    expect(getPendingAction('5563999999999')).toEqual(action);
  });
});

describe('isConfirmation()', () => {
  test.each(['sim', 'Sim', 'SIM', 'pode', 'confirma', 'ok', 'salva', 'correto', 'certo', 's'])(
    'returns true for "%s"', (word) => {
      expect(isConfirmation(word)).toBe(true);
    }
  );

  test('returns false for a rejection word', () => {
    expect(isConfirmation('não')).toBe(false);
  });

  test('returns false for an unrelated message', () => {
    expect(isConfirmation('o que está pendente?')).toBe(false);
  });
});

describe('isRejection()', () => {
  test.each(['não', 'nao', 'cancela', 'para', 'errado', 'n'])(
    'returns true for "%s"', (word) => {
      expect(isRejection(word)).toBe(true);
    }
  );

  test('returns false for a confirmation word', () => {
    expect(isRejection('sim')).toBe(false);
  });

  test('returns false for an unrelated message', () => {
    expect(isRejection('paciente na cadeira 3')).toBe(false);
  });
});
