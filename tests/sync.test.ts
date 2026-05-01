const mockGetLastActive = jest.fn();
const mockSetLastActive = jest.fn();
const mockClassify = jest.fn();
const mockSaveDemand = jest.fn();
const mockFindDemandByMessage = jest.fn();
const mockGetChatById = jest.fn();
const mockGetContacts = jest.fn();
const mockSendMessage = jest.fn();

jest.mock('../src/db/botState', () => ({
  getLastActive: mockGetLastActive,
  setLastActive: mockSetLastActive,
}));

jest.mock('../src/ai/classifier', () => ({
  classify: mockClassify,
}));

jest.mock('../src/db/supabase', () => ({
  saveDemand: mockSaveDemand,
  findDemandByMessage: mockFindDemandByMessage,
}));

const mockClient = {
  getChatById: mockGetChatById,
  getContacts: mockGetContacts,
  sendMessage: mockSendMessage,
} as unknown as import('whatsapp-web.js').Client;

import { syncMissedDemands } from '../src/sync';

const NOW_UNIX = 1745000000;
const LAST_UNIX = NOW_UNIX - 3600; // 1h before now

function makeMessage(overrides: Partial<{
  timestamp: number; fromMe: boolean; type: string; body: string;
}> = {}) {
  return {
    timestamp: NOW_UNIX - 1800, // within the window
    fromMe: false,
    type: 'chat',
    body: 'paciente caiu',
    id: { _serialized: 'false_5511999999999_ABCDEF1234567890' },
    ...overrides,
  };
}

function makeChat(serialized = '5511999999999@c.us', messages: object[] = []) {
  return {
    id: { _serialized: serialized },
    fetchMessages: jest.fn().mockResolvedValue(messages),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  process.env.RT_NUMBER = '5511999999999';
  delete process.env.RT_LID;
  mockGetLastActive.mockResolvedValue(new Date(LAST_UNIX * 1000));
  mockSetLastActive.mockResolvedValue(undefined);
  mockSendMessage.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('syncMissedDemands()', () => {
  test('saves new demands found after lastActive and returns count', async () => {
    const msg = makeMessage({ body: 'paciente caiu' });
    mockGetChatById.mockResolvedValue(makeChat('5511999999999@c.us', [msg]));
    mockClassify.mockResolvedValue({ type: 'new_demand', summary: 'Queda de paciente', category: 'urgência clínica', priority: 'high' });
    mockFindDemandByMessage.mockResolvedValue(null);
    mockSaveDemand.mockResolvedValue({ id: 'abc' });

    const count = await syncMissedDemands(mockClient);

    expect(count).toBe(1);
    expect(mockSaveDemand).toHaveBeenCalledWith(expect.objectContaining({
      message: 'paciente caiu',
      whatsapp_message_id: 'false_5511999999999_ABCDEF1234567890'
    }));
    expect(mockSetLastActive).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith('5511999999999@c.us', expect.stringContaining('1'));
  });

  test('skips messages older than lastActive', async () => {
    const old = makeMessage({ timestamp: LAST_UNIX - 60 });
    mockGetChatById.mockResolvedValue(makeChat('5511999999999@c.us', [old]));

    const count = await syncMissedDemands(mockClient);

    expect(count).toBe(0);
    expect(mockClassify).not.toHaveBeenCalled();
  });

  test('skips messages sent by the bot itself', async () => {
    const mine = makeMessage({ fromMe: true });
    mockGetChatById.mockResolvedValue(makeChat('5511999999999@c.us', [mine]));

    const count = await syncMissedDemands(mockClient);

    expect(count).toBe(0);
    expect(mockClassify).not.toHaveBeenCalled();
  });

  test('skips non-chat message types', async () => {
    const audio = makeMessage({ type: 'ptt' });
    mockGetChatById.mockResolvedValue(makeChat('5511999999999@c.us', [audio]));

    const count = await syncMissedDemands(mockClient);

    expect(count).toBe(0);
    expect(mockClassify).not.toHaveBeenCalled();
  });

  test('skips messages that are not new_demand', async () => {
    const msg = makeMessage({ body: 'qual é a lista de demandas?' });
    mockGetChatById.mockResolvedValue(makeChat('5511999999999@c.us', [msg]));
    mockClassify.mockResolvedValue({ type: 'query', summary: '', category: 'rotina', priority: 'low' });

    const count = await syncMissedDemands(mockClient);

    expect(count).toBe(0);
    expect(mockSaveDemand).not.toHaveBeenCalled();
  });

  test('skips duplicate demands (dedup guard)', async () => {
    const msg = makeMessage({ body: 'paciente caiu' });
    mockGetChatById.mockResolvedValue(makeChat('5511999999999@c.us', [msg]));
    mockClassify.mockResolvedValue({ type: 'new_demand', summary: 'Queda', category: 'urgência clínica', priority: 'high' });
    mockFindDemandByMessage.mockResolvedValue({ id: 'existing-123', message: 'paciente caiu' });

    const count = await syncMissedDemands(mockClient);

    expect(count).toBe(0);
    expect(mockSaveDemand).not.toHaveBeenCalled();
  });

  test('does not send summary message when count is 0', async () => {
    mockGetChatById.mockResolvedValue(makeChat('5511999999999@c.us', []));

    await syncMissedDemands(mockClient);

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockSetLastActive).toHaveBeenCalled();
  });

  test('returns 0 and does not throw when getChatById fails', async () => {
    mockGetChatById.mockRejectedValue(new Error('chat not found'));

    const count = await syncMissedDemands(mockClient);

    expect(count).toBe(0);
    expect(mockSaveDemand).not.toHaveBeenCalled();
    expect(mockSetLastActive).toHaveBeenCalled();
  });

  test('falls back to getContacts when getChatById throws No LID for user', async () => {
    const msg = makeMessage({ body: 'paciente caiu' });
    const mockGetChat = jest.fn().mockResolvedValue(makeChat('5511999999999@c.us', [msg]));
    mockGetChatById.mockRejectedValue(new Error('No LID for user'));
    mockGetContacts.mockResolvedValue([{ number: '5511999999999', getChat: mockGetChat }]);
    mockClassify.mockResolvedValue({ type: 'new_demand', summary: 'Queda', category: 'urgência clínica', priority: 'high' });
    mockFindDemandByMessage.mockResolvedValue(null);
    mockSaveDemand.mockResolvedValue({ id: 'abc' });

    const count = await syncMissedDemands(mockClient);

    expect(mockGetContacts).toHaveBeenCalled();
    expect(mockGetChat).toHaveBeenCalled();
    expect(count).toBe(1);
  });

  test('sends plural message for multiple demands', async () => {
    const msgs = [
      makeMessage({ body: 'paciente caiu' }),
      makeMessage({ body: 'medicação em falta' }),
    ];
    mockGetChatById.mockResolvedValue(makeChat('5511999999999@c.us', msgs));
    mockClassify.mockResolvedValue({ type: 'new_demand', summary: 'Demanda', category: 'rotina', priority: 'low' });
    mockFindDemandByMessage.mockResolvedValue(null);
    mockSaveDemand.mockResolvedValue({ id: 'xyz' });

    await syncMissedDemands(mockClient);

    expect(mockSendMessage).toHaveBeenCalledWith(
      '5511999999999@c.us',
      expect.stringContaining('demandas')
    );
  });

  test('syncs from multiple RT chats when RT_NUMBER has comma-separated values', async () => {
    process.env.RT_NUMBER = '5511999999999,5522888888888';
    const msg1 = makeMessage({ body: 'paciente caiu' });
    const msg2 = makeMessage({ body: 'medicação em falta' });
    mockGetChatById
      .mockResolvedValueOnce(makeChat('5511999999999@c.us', [msg1]))
      .mockResolvedValueOnce(makeChat('5522888888888@c.us', [msg2]));
    mockClassify.mockResolvedValue({ type: 'new_demand', summary: 'Demanda', category: 'rotina', priority: 'low' });
    mockFindDemandByMessage.mockResolvedValue(null);
    mockSaveDemand.mockResolvedValue({ id: 'xyz' });

    const count = await syncMissedDemands(mockClient);

    expect(count).toBe(2);
    expect(mockGetChatById).toHaveBeenCalledTimes(2);
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
  });

  test('continues syncing remaining RTs when one chat fails to load', async () => {
    process.env.RT_NUMBER = '5511999999999,5522888888888';
    const msg = makeMessage({ body: 'medicação em falta' });
    mockGetChatById
      .mockRejectedValueOnce(new Error('chat not found'))
      .mockResolvedValueOnce(makeChat('5522888888888@c.us', [msg]));
    mockClassify.mockResolvedValue({ type: 'new_demand', summary: 'Demanda', category: 'rotina', priority: 'low' });
    mockFindDemandByMessage.mockResolvedValue(null);
    mockSaveDemand.mockResolvedValue({ id: 'xyz' });

    const count = await syncMissedDemands(mockClient);

    expect(count).toBe(1);
    expect(mockSaveDemand).toHaveBeenCalledTimes(1);
  });
});
