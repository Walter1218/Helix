# Judge Agent

## Requirements

### Assertion protection
The system SHALL detect and block assertion deletions in test files.

**Status**: implemented

### Structural change detection
The system SHALL detect removal of test cases.

**Status**: implemented

### Context-aware review
The system SHALL use spec.md as context for judging code changes.

**Status**: pending

### Security checks
The system SHALL detect eval(), exec(), and secret leaks in code changes.

**Status**: pending

### Relevance checks
The system SHALL verify changes are within the task scope.

**Status**: pending
