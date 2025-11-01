/**
 * Integration Test for Main Functionality
 * 
 * This test ONLY tests the main watchForChanges function that:
 * 1. Reads timetable changes from WebUntis
 * 2. Detects differences
 * 3. Sends notifications to Discord
 * 
 * All utility functions are used as-is (not tested separately here)
 */

import { watchForChanges, resetPreviousState } from '../../src/index';

// Mock external dependencies
jest.mock('webuntis');
jest.mock('discord.js', () => {
  const actual = jest.requireActual('discord.js');
  return {
    ...actual,
    EmbedBuilder: jest.fn().mockImplementation(() => ({
      setTitle: jest.fn().mockReturnThis(),
      setDescription: jest.fn().mockReturnThis(),
      setTimestamp: jest.fn().mockReturnThis(),
      setColor: jest.fn().mockReturnThis(),
    })),
  };
});

// Import mocked modules
import { WebUntis } from 'webuntis';
import { Client, TextChannel } from 'discord.js';

describe('Main Functionality Integration Test', () => {
  let mockUntisClient: jest.Mocked<WebUntis>;
  let mockDiscordClient: jest.Mocked<Client>;
  let mockChannel: jest.Mocked<TextChannel>;

  beforeEach(() => {
    // Reset state before each test
    resetPreviousState();
    jest.clearAllMocks();

    // Mock WebUntis client
    mockUntisClient = {
      login: jest.fn().mockResolvedValue(undefined),
      validateSession: jest.fn().mockResolvedValue(true),
      getOwnClassTimetableForRange: jest.fn(),
    } as any;

    // Mock Discord channel
    mockChannel = {
      send: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock Discord client
    mockDiscordClient = {
      channels: {
        cache: {
          get: jest.fn().mockReturnValue(mockChannel),
        },
      },
    } as any;

    // Mock console methods to reduce noise in test output
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should detect changes and send Discord notification', async () => {
    // Arrange: Mock initial empty state
    const initialLessons: any[] = [];

    // Mock new lesson added
    // November 3, 2025 is a Monday, using subject/teacher that has mentions
    // Teacher ID 322 = BUCH, Subject M on Monday has mentions
    const updatedLessons: any[] = [
      {
        id: 1,
        date: 20251103, // Monday, Nov 3, 2025
        startTime: 800,
        endTime: 900,
        su: [{ id: 1, name: 'M', longname: 'Mathematik' }],
        te: [{ id: 322, orgid: 322, orgname: 'BUCH', name: 'BUCH', longname: 'Herr Buchholz' }],
        substText: 'Raumänderung',
        kl: [],
        ro: [],
        lsnumber: 1,
      },
    ];

    let callCount = 0;
    mockUntisClient.getOwnClassTimetableForRange.mockImplementation(async () => {
      callCount++;
      // First call returns empty, second call returns lesson
      return callCount === 1 ? initialLessons : updatedLessons;
    });

    // Act: Start watching for changes with short interval
    const intervalId = await watchForChanges(mockUntisClient, mockDiscordClient, 100);

    // Wait for at least 3 interval cycles to ensure changes are detected
    await new Promise(resolve => setTimeout(resolve, 350));

    // Cleanup
    clearInterval(intervalId);

    // Assert: Verify login was called
    expect(mockUntisClient.login).toHaveBeenCalled();

    // Assert: Verify session validation
    expect(mockUntisClient.validateSession).toHaveBeenCalled();

    // Assert: Verify timetable was fetched multiple times (at least 2)
    expect(mockUntisClient.getOwnClassTimetableForRange.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Assert: Verify Discord message was sent when change detected
    expect(mockChannel.send).toHaveBeenCalled();

    // Assert: Verify the message contains an embed
    const sendCall = mockChannel.send.mock.calls[0][0] as any;
    expect(sendCall).toHaveProperty('embeds');
    expect(sendCall.embeds).toHaveLength(1);
  });

  test('should NOT send notification when no changes detected', async () => {
    // Arrange: Mock consistent state
    // Using valid teacher and subject but will return same data both times
    const staticLessons: any[] = [
      {
        id: 1,
        date: 20251103,
        startTime: 800,
        endTime: 900,
        su: [{ id: 1, name: 'M', longname: 'Mathematik' }],
        te: [{ id: 322, orgid: 322, orgname: 'BUCH', name: 'BUCH', longname: 'Herr Buchholz' }],
        substText: 'Normal',
        kl: [],
        ro: [],
        lsnumber: 1,
      },
    ];

    mockUntisClient.getOwnClassTimetableForRange.mockResolvedValue(staticLessons);

    // Act: Start watching
    const intervalId = await watchForChanges(mockUntisClient, mockDiscordClient, 100);

    // Wait for at least 2 interval cycles
    await new Promise(resolve => setTimeout(resolve, 250));

    // Cleanup
    clearInterval(intervalId);

    // Assert: No Discord messages sent (no changes)
    expect(mockChannel.send).not.toHaveBeenCalled();
  });

  test('should re-login when session is invalid', async () => {
    // Arrange: Mock session becoming invalid
    mockUntisClient.validateSession
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    mockUntisClient.getOwnClassTimetableForRange.mockResolvedValue([]);

    // Act
    const intervalId = await watchForChanges(mockUntisClient, mockDiscordClient, 100);

    // Wait for at least 2 cycles
    await new Promise(resolve => setTimeout(resolve, 250));

    // Cleanup
    clearInterval(intervalId);

    // Assert: Login called initially + once for re-login
    expect(mockUntisClient.login).toHaveBeenCalledTimes(2);
  });

  test('should handle lesson modification (edit)', async () => {
    // Arrange: Mock lesson with changed time
    // Using Monday lesson with mentions - Teacher ID 322 = BUCH
    const originalLesson: any[] = [
      {
        id: 1,
        date: 20251103, // Monday, Nov 3, 2025
        startTime: 800,
        endTime: 900,
        su: [{ id: 1, name: 'M', longname: 'Mathematik' }],
        te: [{ id: 322, orgid: 322, orgname: 'BUCH', name: 'BUCH', longname: 'Herr Buchholz' }],
        substText: 'Normal',
        kl: [],
        ro: [],
        lsnumber: 1,
      },
    ];

    const modifiedLesson: any[] = [
      {
        id: 1,
        date: 20251103, // Monday, Nov 3, 2025
        startTime: 900, // Changed time
        endTime: 1000,
        su: [{ id: 1, name: 'M', longname: 'Mathematik' }],
        te: [{ id: 322, orgid: 322, orgname: 'BUCH', name: 'BUCH', longname: 'Herr Buchholz' }],
        substText: 'Zeitänderung',
        kl: [],
        ro: [],
        lsnumber: 1,
      },
    ];

    let callCount = 0;
    mockUntisClient.getOwnClassTimetableForRange.mockImplementation(async () => {
      callCount++;
      return callCount === 1 ? originalLesson : modifiedLesson;
    });

    // Act
    const intervalId = await watchForChanges(mockUntisClient, mockDiscordClient, 100);

    await new Promise(resolve => setTimeout(resolve, 350));

    clearInterval(intervalId);

    // Assert: Change detected and notification sent
    expect(mockChannel.send).toHaveBeenCalled();
  });

  test('should handle multiple changes in single update', async () => {
    // Arrange: Multiple new lessons
    const emptyState: any[] = [];
    const multipleNewLessons: any[] = [
      {
        id: 1,
        date: 20251103, // Monday, Nov 3, 2025
        startTime: 800,
        endTime: 900,
        su: [{ id: 1, name: 'M', longname: 'Mathematik' }],
        te: [{ id: 322, orgid: 322, orgname: 'BUCH', name: 'BUCH', longname: 'Herr Buchholz' }],
        substText: 'Neue Stunde 1',
        kl: [],
        ro: [],
        lsnumber: 1,
      },
      {
        id: 2,
        date: 20251103, // Monday, Nov 3, 2025
        startTime: 900,
        endTime: 1000,
        su: [{ id: 2, name: 'EK', longname: 'Erdkunde' }],
        te: [{ id: 56, orgid: 56, orgname: 'SEIT', name: 'SEIT', longname: 'Herr Scheitler' }],
        substText: 'Neue Stunde 2',
        kl: [],
        ro: [],
        lsnumber: 2,
      },
    ];

    let callCount = 0;
    mockUntisClient.getOwnClassTimetableForRange.mockImplementation(async () => {
      callCount++;
      return callCount === 1 ? emptyState : multipleNewLessons;
    });

    // Act
    const intervalId = await watchForChanges(mockUntisClient, mockDiscordClient, 100);

    await new Promise(resolve => setTimeout(resolve, 350));

    clearInterval(intervalId);

    // Assert: Single notification with multiple changes
    expect(mockChannel.send).toHaveBeenCalledTimes(1);
  });
});

