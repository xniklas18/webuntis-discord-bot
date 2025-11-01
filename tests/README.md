# Test System

This test system is designed to test **ONLY** the main functionality of the WebUntis Discord bot.

## What is Tested

The integration tests in `tests/integration/main.test.ts` test the **main `watchForChanges()` function**, which:

1. Reads timetable changes from WebUntis
2. Detects differences between the previous and current state (including array changes)
3. Sends Discord notifications when changes are detected with user mentions

## Test Coverage

Current coverage: **95.31%** of `src/index.ts`

## What is NOT Tested

- Individual utility functions (in `src/utils/`)
- Helper functions like `mergeLessons`, `untisDateToDateString`, etc.
- Discord formatting utilities
- Subject/teacher name mappings

The utility functions are used as-is during the integration tests, but are not tested separately.

## Running Tests

```bash
# Run tests once
npm test

# Run tests in watch mode (auto-rerun on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

### Integration Tests (`tests/integration/main.test.ts`)

1. **Change Detection Test**: Verifies that new lessons trigger Discord notifications
2. **No Change Test**: Ensures no notification is sent when timetable is unchanged
3. **Session Re-login Test**: Confirms the system re-authenticates when session expires
4. **Lesson Modification Test**: Tests that edited lessons trigger notifications
5. **Multiple Changes Test**: Verifies multiple simultaneous changes are handled correctly

## Important Fix Applied

During test development, we discovered and fixed a bug in the main code where array changes (kind 'A') weren't being properly detected. The code now correctly handles:
- `kind: 'E'` - Edit changes
- `kind: 'N'` - New changes  
- `kind: 'A'` - Array changes (new lessons added to the array)

## Mocking Strategy

The tests mock:
- **WebUntis API**: Mock timetable data without calling real API
- **Discord.js Client**: Mock Discord channel and message sending (including EmbedBuilder)
- **Console output**: Suppressed to keep test output clean

All utility functions run with their actual implementation.

## Adding New Tests

To add a new test for the main functionality:

1. Open `tests/integration/main.test.ts`
2. Add a new `test()` block in the `describe('Main Functionality Integration Test')` section
3. Use the existing `mockUntisClient` and `mockDiscordClient` to simulate different scenarios
4. Follow the pattern: **Arrange → Act → Assert**

Example:
```typescript
test('should handle new scenario', async () => {
  // Arrange: Set up mock data with valid teacher IDs and subjects
  mockUntisClient.getOwnClassTimetableForRange.mockResolvedValue([...]);
  
  // Act: Run the function with short interval for testing
  const intervalId = await watchForChanges(mockUntisClient, mockDiscordClient, 100);
  await new Promise(resolve => setTimeout(resolve, 350));
  clearInterval(intervalId);
  
  // Assert: Verify expected behavior
  expect(mockChannel.send).toHaveBeenCalled();
});
```

## Coverage

The test coverage focuses on `src/index.ts` (main file) only. Coverage reports can be found in:
- `coverage/lcov-report/index.html` (open in browser for detailed view)

Coverage excludes:
- `/node_modules/`
- `/tests/`
- `/src/utils/` (utility functions are used but not separately tested)
