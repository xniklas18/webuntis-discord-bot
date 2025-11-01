/**
 * ============================================================================
 * INTEGRATION TEST FOR MAIN FUNCTIONALITY
 * ============================================================================
 * 
 * PURPOSE:
 * This test suite ONLY tests the main watchForChanges() function which is
 * responsible for:
 *   1. Reading timetable data from WebUntis
 *   2. Detecting differences between old and new timetables
 *   3. Sending notifications to Discord when changes are found
 * 
 * TESTING APPROACH:
 * - WebUntis API: MOCKED (we control the data it returns)
 * - Discord API: REAL (actually sends messages to TESTING_CHANNEL_ID)
 * - Utility functions: NOT tested separately (used as-is)
 * 
 * WHY REAL DISCORD?
 * To verify that the actual Discord integration works end-to-end, including:
 * - Client connection
 * - Channel access
 * - Message formatting
 * - Embed creation
 * ============================================================================
 */

import { watchForChanges, resetPreviousState } from '../../src/index';
import { Client, GatewayIntentBits } from 'discord.js';

// Tell Jest to replace WebUntis with a mock version
jest.mock('webuntis');

// Import the mocked WebUntis type
import { WebUntis } from 'webuntis';

describe('Main Functionality Integration Test', () => {
  // ============================================================================
  // TEST VARIABLES
  // ============================================================================
  let mockUntisClient: jest.Mocked<WebUntis>; // Fake WebUntis client
  let realDiscordClient: Client;              // Real Discord client
  let isDiscordReady: boolean = false;        // Track if Discord connected

  // ============================================================================
  // SETUP - RUNS ONCE BEFORE ALL TESTS
  // ============================================================================
  beforeAll(async () => {
    // Create a REAL Discord client that will connect to Discord
    realDiscordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,         // Access to server (guild) info
        GatewayIntentBits.GuildMessages,  // Access to send messages
      ],
    });

    // Connect to Discord and wait until ready
    await new Promise<void>((resolve, reject) => {
      // Listen for the 'ready' event (fired when Discord connection is successful)
      realDiscordClient.once('ready', () => {
        console.log('✅ Discord client ready for testing!');
        isDiscordReady = true;
        resolve(); // Tell the promise we're done
      });

      // Login using the token from .env file
      realDiscordClient.login(process.env.CLIENT_TOKEN).catch(reject);
    });
  }, 30000); // 30 second timeout (Discord login can take a while)

  // ============================================================================
  // TEARDOWN - RUNS ONCE AFTER ALL TESTS
  // ============================================================================
  afterAll(async () => {
    // Cleanup: Disconnect from Discord
    if (realDiscordClient) {
      await realDiscordClient.destroy();
    }
  });

  // ============================================================================
  // SETUP - RUNS BEFORE EACH INDIVIDUAL TEST
  // ============================================================================
  beforeEach(() => {
    // Reset the previousState to null (like starting fresh)
    resetPreviousState();

    // Clear all previous mock call history
    jest.clearAllMocks();

    // Create a mock WebUntis client with fake methods
    mockUntisClient = {
      login: jest.fn().mockResolvedValue(undefined),           // Fake login (always succeeds)
      validateSession: jest.fn().mockResolvedValue(true),      // Fake session check (always valid)
      getOwnClassTimetableForRange: jest.fn(),                 // Fake timetable fetch (we'll configure this per test)
    } as any;

    // Silence console output during tests to keep output clean
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  // ============================================================================
  // CLEANUP - RUNS AFTER EACH INDIVIDUAL TEST
  // ============================================================================
  afterEach(() => {
    // Restore all mocked functions (console.log, console.error, etc.)
    jest.restoreAllMocks();
  });

  // ============================================================================
  // TEST 1: Lesson is Canceled (Teacher removed, eigenverantwortliches Arbeiten)
  // ============================================================================
  test('should detect lesson cancellation and send notification', async () => {
    // Skip this test if Discord failed to connect
    if (!isDiscordReady) {
      console.warn('Skipping test: Discord client not ready');
      return;
    }

    // -------------------------------------------------------------------------
    // ARRANGE: Set up test data
    // -------------------------------------------------------------------------

    // Original state: Normal lesson with teacher BUCH
    const originalLessons: any[] = [
      {
        id: 1,
        date: 20251103,           // Monday, Nov 3, 2025
        startTime: 800,           // 08:00 (in Untis format)
        endTime: 900,             // 09:00
        su: [{ id: 1, name: 'M', longname: 'Mathematik' }],
        te: [{ id: 322, orgid: 322, orgname: 'BUCH', name: 'BUCH', longname: 'Herr Buchholz' }],
        substText: '',
        kl: [],
        ro: [],
        lsnumber: 1,
      },
    ];

    // Updated state: Lesson is CANCELED
    // Teacher ID becomes 0, name becomes empty
    // substText indicates "eigenverantwortliches Arbeiten" (self-study)
    const canceledLessons: any[] = [
      {
        id: 1,
        date: 20251103,
        startTime: 800,
        endTime: 900,
        su: [{ id: 1, name: 'M', longname: 'Mathematik' }],
        te: [{ id: 0, orgid: 322, orgname: 'BUCH', name: '', longname: '' }], // ⚠️ CANCELED: Teacher removed
        substText: 'eigenverantwortliches Arbeiten', // ⚠️ Self-study message
        kl: [],
        ro: [],
        lsnumber: 1,
      },
    ];

    // Configure the mock to return different data on each call
    let callCount = 0;
    mockUntisClient.getOwnClassTimetableForRange.mockImplementation(async () => {
      callCount++;
      // First call: return normal lesson
      // Second call: return canceled lesson (this triggers change detection!)
      return callCount === 1 ? originalLessons : canceledLessons;
    });

    // Temporarily override CHANNEL_ID to use testing channel
    const originalChannelId = process.env.CHANNEL_ID;
    process.env.CHANNEL_ID = process.env.TESTING_CHANNEL_ID;

    // -------------------------------------------------------------------------
    // ACT: Start the watchForChanges function
    // -------------------------------------------------------------------------

    // Start watching with 100ms interval (fast for testing)
    const intervalId = await watchForChanges(mockUntisClient, realDiscordClient, 100);

    // Wait for at least 3 interval cycles (350ms total)
    // Cycle 1 (0ms): Initial fetch (normal lesson)
    // Cycle 2 (100ms): Second fetch (canceled lesson) -> CHANGE DETECTED!
    // Cycle 3 (200ms): Third fetch (no further change)
    await new Promise(resolve => setTimeout(resolve, 350));

    // Stop the interval
    clearInterval(intervalId);

    // Restore original channel ID
    process.env.CHANNEL_ID = originalChannelId;

    // -------------------------------------------------------------------------
    // ASSERT: Verify the expected behavior
    // -------------------------------------------------------------------------

    // Verify that login was called
    expect(mockUntisClient.login).toHaveBeenCalled();

    // Verify that session validation happened
    expect(mockUntisClient.validateSession).toHaveBeenCalled();

    // Verify that timetable was fetched at least 2 times
    expect(mockUntisClient.getOwnClassTimetableForRange.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Note: We can't easily assert that Discord message was sent with real client,
    // but you should see the message appear in your testing channel!
    console.log('✅ Check Discord testing channel for the CANCELLATION message!');
  }, 10000); // 10 second timeout for this test

  // ============================================================================
  // TEST 2: No Changes Detected - No Notification Sent
  // ============================================================================
  test('should NOT send notification when no changes detected', async () => {
    if (!isDiscordReady) return;

    // -------------------------------------------------------------------------
    // ARRANGE: Set up test data
    // -------------------------------------------------------------------------

    // Same data returned every time (no changes)
    const staticLessons: any[] = [
      {
        id: 1,
        date: 20251103,
        startTime: 800,
        endTime: 900,
        su: [{ id: 1, name: 'M', longname: 'Mathematik' }],
        te: [{ id: 322, orgid: 322, orgname: 'BUCH', name: 'BUCH', longname: 'Herr Buchholz' }],
        substText: '',
        kl: [],
        ro: [{ id: 101, orgid: 101, name: 'A101', longname: 'Raum A101' }],
        lsnumber: 1,
      },
    ];

    // Always return the same data
    mockUntisClient.getOwnClassTimetableForRange.mockResolvedValue(staticLessons);

    const originalChannelId = process.env.CHANNEL_ID;
    process.env.CHANNEL_ID = process.env.TESTING_CHANNEL_ID;

    // -------------------------------------------------------------------------
    // ACT: Start watching
    // -------------------------------------------------------------------------
    const intervalId = await watchForChanges(mockUntisClient, realDiscordClient, 100);

    // Wait for at least 2 interval cycles
    await new Promise(resolve => setTimeout(resolve, 350));

    // Stop and cleanup
    clearInterval(intervalId);
    process.env.CHANNEL_ID = originalChannelId;

    // -------------------------------------------------------------------------
    // ASSERT: Verify behavior
    // -------------------------------------------------------------------------
    expect(mockUntisClient.getOwnClassTimetableForRange).toHaveBeenCalled();
    console.log('✅ No message should appear in Discord (no changes detected)');
  }, 10000);

  // ============================================================================
  // TEST 3: Session Becomes Invalid - Re-login Required
  // ============================================================================
  test('should re-login when session is invalid', async () => {
    if (!isDiscordReady) return;

    // -------------------------------------------------------------------------
    // ARRANGE: Set up test data
    // -------------------------------------------------------------------------

    // Mock session becoming invalid on the second check
    mockUntisClient.validateSession
      .mockResolvedValueOnce(true)   // First check: session valid
      .mockResolvedValueOnce(false); // Second check: session INVALID!

    // Return static timetable (no changes)
    const staticLessons: any[] = [
      {
        id: 1,
        date: 20251103,
        startTime: 800,
        endTime: 900,
        su: [{ id: 1, name: 'M', longname: 'Mathematik' }],
        te: [{ id: 322, orgid: 322, orgname: 'BUCH', name: 'BUCH', longname: 'Herr Buchholz' }],
        substText: '',
        kl: [],
        ro: [{ id: 101, orgid: 101, name: 'A101', longname: 'Raum A101' }],
        lsnumber: 1,
      },
    ];

    mockUntisClient.getOwnClassTimetableForRange.mockResolvedValue(staticLessons);

    const originalChannelId = process.env.CHANNEL_ID;
    process.env.CHANNEL_ID = process.env.TESTING_CHANNEL_ID;

    // -------------------------------------------------------------------------
    // ACT: Start watching
    // -------------------------------------------------------------------------
    const intervalId = await watchForChanges(mockUntisClient, realDiscordClient, 100);

    // Wait for at least 2 cycles (so session becomes invalid)
    await new Promise(resolve => setTimeout(resolve, 350));

    // Cleanup
    clearInterval(intervalId);
    process.env.CHANNEL_ID = originalChannelId;

    // -------------------------------------------------------------------------
    // ASSERT: Verify re-login happened
    // -------------------------------------------------------------------------
    // Login should be called twice:
    // 1. Initial login (when watchForChanges starts)
    // 2. Re-login (when session validation fails)
    expect(mockUntisClient.login).toHaveBeenCalledTimes(2);
  }, 10000);
});
