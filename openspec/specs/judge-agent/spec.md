# Judge Agent

## Requirements

### Assertion protection
The system SHALL detect and block assertion deletions in test files.



























































































































































**Status**: ✅ implemented (2026-06-23)
**Tokens**: 4,218,185

### Structural change detection
The system SHALL detect removal of test cases.

**Status**: ✅ implemented (2026-06-23)

### Context-aware review
The system SHALL use spec.md as context for judging code changes.

**Status**: ✅ implemented (2026-06-23)

### Security checks
The system SHALL detect eval(), exec(), and secret leaks in code changes.

**Status**: ✅ implemented (2026-06-23)

### Relevance checks
The system SHALL verify changes are within the task scope.

**Status**: ✅ implemented (2026-06-23)
**Notes**: 通过checkSpecCompliance函数实现，检查变更与规范需求的关联性
