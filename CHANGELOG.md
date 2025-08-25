# Changelog
## [4.1.0] - 2025-08-25

### Added
- Agent persona support via `definition` with validation (>= 100 chars).
- `prompt` alias for persona; `definition` takes precedence when both provided.

### Changed
- README updated to document `definition`/`prompt` usage with example.
- Example `examples/mcp-agent.ts` demonstrates `prompt` in agent config.

## [4.0.1] - 2025-08-24

### Added
- Dependency: `big.js` for precise accumulation of estimated costs.
- Dev Dependency: `@types/big.js` for TypeScript support.

### Changed
- Switched crew cost reporting to metrics-based API. Use `agent.getMetrics()` and `crew.getCrewMetrics()` instead of legacy cost getters.
- Estimated cost (`estimatedCostUSD`) is now accumulated with Big.js and reported rounded to 5 decimal places.
- Tests updated to use metrics assertions; added dummy `ANTHROPIC_API_KEY` in test setup to avoid env failures.
- Test agent signatures updated to new DSL (`query:string -> queryResponse:string`).
- Aligned with new `@ax-llm/ax` `ai()` and `agent()` factory methods: enforce canonical provider slugs, pass cost tracker via `options.trackers`, and validate `apiURL` when provided.
- Updated package versions for `@ax-llm/ax` and `@ax-llm/ax-tools`.

### Deprecated
- Legacy cost APIs (`getLastUsageCost`, `getAccumulatedCosts`, `getAggregatedCosts`) are deprecated in favor of metrics.

### Removed
- Tests no longer use `getAggregatedCosts`; replaced with metrics assertions.

### Updated
- README now documents metrics usage and 5-decimal cost rounding, de-emphasizing legacy cost APIs.
- README Features now includes "Metrics and Cost Tracking"; examples updated to use metrics (`getMetrics`, `getCrewMetrics`).


This Changelog format is based on [Keep a Changelog]
(https://keepachangelog.com/en/1.0.0/), and this project 
adheres to [Semantic Versioning](https://semver.org/spec/
v2.0.0.html).

## [3.11.1] - 2025-06-04

### Changed
- Updated MCP (Model Context Protocol) transport implementation to support current ax-llm/ax framework
- Replaced deprecated `AxMCPHTTPTransport` with `AxMCPHTTPSSETransport` for HTTP SSE transport
- Added support for `AxMCPStreambleHTTPTransport` for streamable HTTP communication
- Enhanced MCP configuration with proper TypeScript types using `AxMCPStreamableHTTPTransportOptions`
- Updated transport configuration to use `mcpEndpoint` parameter for streamable HTTP transport

### Removed
- Removed all references to deprecated `MCPHTTPTransportConfig` interface
- Cleaned up deprecated MCP transport type definitions

### Added
- Comprehensive MCP documentation in README.md with examples for all transport types
- Added examples for STDIO, HTTP SSE, and streamable HTTP transport configurations
- Enhanced MCP server configuration examples including filesystem, search, and database servers
- Added migration guide for users upgrading from deprecated transport types

### Fixed
- Improved type safety for MCP transport configurations
- Enhanced error handling for unsupported MCP transport types

## [3.10.0] - 2025-05-28

### Added
- Support for Reka AI models through `AxAIReka` provider
- Support for Grok (xAI) models through `AxAIGrok` provider
- Added `REKA_API_KEY` and `GROK_API_KEY` environment variable support
- Added `DEEPSEEK_API_KEY` environment variable support for DeepSeek models
- Enhanced provider configuration to include all supported AI providers

### Changed
- Updated `src/config/index.ts` to include API keys for all supported providers
- Improved provider API key management for better consistency across all supported models

## [3.9.0] - 2025-05-28

### Fixed
- Updated @ax-llm/ax package to 11.0.47
- Updated TypeScript target from ES2020 to ES2022 to resolve `ErrorOptions` type compatibility issue with @ax-llm/ax package
- Improved build process compatibility with latest TypeScript type definitions

### Changed
- Enhanced TypeScript configuration for better compatibility with modern type definitions

## [3.8.1] - 2024-03-28

### Added
- Enhanced type definitions for model usage metrics with nested token structure support

### Changed
- Improved error handling and robustness in cost calculations
- Better null handling in usage cost tracking
- Updated type definitions in `src/types.ts` to support both direct and nested token structures

## [3.7.1] - 2025-03-27

### Fixed
- Enhanced error reporting for unsupported transport types with proper JSON stringification

## [3.7.0] - 2025-03-25

### Added
- New TypeScript type exports in src/index.ts for better type accessibility
- Enhanced type definitions for metrics and cost tracking interfaces
- Improved type documentation for core configuration interfaces
- Support for Model Context Protocol (MCP)
- Added `addAllAgents` method to add all agents to the crew
- Support for streaming responses from agents

### Changed
- Reorganized type exports in src/index.ts for better code organization
- Updated TypeScript interfaces for better type inference and documentation

## [3.6.1] - 2025-03-22

### Changed
- Improved type safety by making provider type more strict
- Enhanced documentation with JSDoc comments across the codebase
- Removed root `index.d.ts` in favor of auto-generated types during build
- Updated `.gitignore` patterns

### Added
- New TypeScript interfaces for better type documentation:
  - Added `AxCrewConfig` interface
  - Enhanced `Provider` type definition
  - Improved documentation for `StateInstance` and usage metrics

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

