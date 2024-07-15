import { AxFunction } from '@ax-llm/ax';
import { CurrentDateTime, DaysBetweenDates } from './dateTime.js';

// Export the FunctionMap type
type FunctionRegistryType = {
  [key: string]: AxFunction | { new(state: Record<string, any>): { toFunction: () => AxFunction } };
};


const AxCrewFunctions = {
  CurrentDateTime,
  DaysBetweenDates,
};

export { AxCrewFunctions, FunctionRegistryType };