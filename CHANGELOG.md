# Changelog

This Changelog format is based on [Keep a Changelog]
(https://keepachangelog.com/en/1.0.0/), and this project 
adheres to [Semantic Versioning](https://semver.org/spec/
v2.0.0.html).

## [3.5.3] - 2025-02-20

### Added
- New methods for crew level cost tracking:
  - `getAggregatedCosts()` for crew-wide metrics
  - `resetCosts()` for resetting cost tracking
  - Enhanced `forward()` method with automatic cost tracking
- New TypeScript interfaces for better type safety in cost tracking
- Improved token metrics aggregation with detailed per-agent breakdowns

### Fixed
- Improved handling of cost calculations for sub-agent calls
- Updated [examples](./examples/) to demonstrate the new cost tracking methods

## [3.5.2] - 2025-02-03

### Added
- Enhanced cost tracking with precise decimal calculations for agent and crew usage
- Improved token metrics aggregation across multiple agent runs
- Added support for per-agent and total crew cost analysis

### Fixed
- Added missing decimal.js dependency installation to resolve type declarations error

## [3.3.4] - 2025-02-03

### Changed
- Fixed sub-agent function calling in StatefulAxAgent to properly handle AI configuration
- Improved TypeScript function overloads for the forward method to provide better type safety and readability
- Removed redundant AI parameter passing in sub-agent calls
- Added an [example](examples/write-post-and-publish-to-wordpress.ts) of using AxCrew to write a post and publish it to WordPress

## [3.3.3] - 2024-12-12

### Added
- TypeScript declaration file (`index.d.ts`)
- Improved type definitions for:
  - `AxCrew` class and its methods
  - `StatefulAxAgent` class
  - State management interfaces
  - Function registry types
  - Configuration types
- TypeScript documentation in `README.md` with example

## [3.3.1] - 2024-12-11

### Changed
- Fixed Websearch agent configuration in `agentConfig.json`
- Refactored agent configuration structure in `src/agents/agentConfig.ts` for better type safety and maintainability

## [3.3.0] - 2024-12-10

### Added
- Added `getUsageCost` method to track API usage costs and token metrics
- Cost tracking includes prompt cost, completion cost, and total cost
- Detailed token metrics for prompt, completion, and total tokens
- Documentation and examples for usage cost tracking in README.md

## [3.2.0] - 2024-12-10

### Added
- Support for agent examples through the `examples` field in agent configuration
- Examples can be used to guide agent behavior and response format
- Documentation for using examples in README.md

### Enhanced
- Agent responses now better follow example patterns when provided
- Improved consistency in agent outputs through example-based learning

## [3.1.0] - 2024-12-10

### Added
- Support for direct JSON object configuration in addition to configuration files
- New configuration option to pass agent configuration as a JavaScript object
- Updated documentation in README.md with examples of both configuration methods

### Enhanced
- Configuration flexibility allowing runtime configuration modifications
- Support for dynamic agent configuration generation

## [3.0.0] - 2024-12-10

### Changed
- Switched from YAML to JSON format for agent configuration files
- Renamed `provider_key_name` to `providerKeyName` in agent configuration to align with JSON naming conventions
- Improved error handling for JSON parsing with detailed error message and troubleshooting hints

### Added
- Better error messages for configuration file parsing issues, including:
  - Exact line and column numbers for JSON syntax errors
  - Context showing surrounding lines of code
  - Common troubleshooting tips for JSON configuration issues

## [2.0.7] - 2024-11-23

### Added
- Release of version 2.0.7
- Support for [AxLLM](https://axllm.dev) versions > 10.0.0
- Changelog

### Changed
- Updated README.md

### Fixed
- Updates to [dateTime.ts](src/dateTime.ts) to enable use in Gemini models

