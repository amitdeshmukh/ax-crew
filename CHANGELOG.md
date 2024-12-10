# Changelog

This Changelog format is based on [Keep a Changelog]
(https://keepachangelog.com/en/1.0.0/), and this project 
adheres to [Semantic Versioning](https://semver.org/spec/
v2.0.0.html).

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

