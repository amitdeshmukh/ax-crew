import { AxFunction } from '@ax-llm/ax';
import { CurrentDateTime, DaysBetweenDates } from './dateTime.js';

// FunctionRegistryType
type FunctionRegistryType = {
  [key: string]: AxFunction | { new(state: Record<string, any>): { toFunction: () => AxFunction } };
};

const AxCrewFunctions = {
  CurrentDateTime,
  DaysBetweenDates,
};

export { AxCrewFunctions, FunctionRegistryType };