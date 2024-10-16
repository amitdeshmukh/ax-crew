import { AxFunction } from '@ax-llm/ax';
import { CurrentDateTime, DaysBetweenDates } from './dateTime.js';

// FunctionRegistryType to register custom functions
type FunctionRegistryType = {
  [key: string]: AxFunction | { new(state: Record<string, any>): { toFunction: () => AxFunction } };
};

// Built-in functions
const AxCrewFunctions = {
  CurrentDateTime,
  DaysBetweenDates
};

export { AxCrewFunctions, FunctionRegistryType };