import { CurrentDateTime, DaysBetweenDates } from './dateTime.js';

/**
 * Built-in function registry for AxCrew agents.
 *
 * Contains common utility tools/functions that can be referenced by name from
 * agent configs (e.g., "functions": ["CurrentDateTime", "DaysBetweenDates"]).
 * You can pass this object to the AxCrew constructor or merge with your
 * own registry.
 * Example:
 * const crew = new AxCrew(config, AxCrewFunctions); or
 * const crew = new AxCrew(config, { ...AxCrewFunctions, ...myFunctions });
 */
const AxCrewFunctions = {
  CurrentDateTime,
  DaysBetweenDates
};

export { AxCrewFunctions };