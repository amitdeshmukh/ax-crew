import type { AxFunction } from "@ax-llm/ax";

export const CurrentDateTime: AxFunction = {
  name: 'CurrentDateTime',
  description: 'Get the current date and time.',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  func: () => new Date().toISOString()
}

export const DaysBetweenDates: AxFunction = {
  name: 'DaysBetweenDates',
  description: 'Calculate the number of days between two dates in ISO format.',
  parameters: {
    type: 'object',
    properties: {
      startDate: { 
        type: 'string',
        description: 'The start date in ISO format.'
      },
      endDate: {
        type: 'string',
        description: 'The end date in ISO format.'
      }
    },
    required: ['startDate', 'endDate']
  },
  func: (args: { startDate: string; endDate: string }) => {
    const { startDate, endDate } = args;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const differenceInTime = end.getTime() - start.getTime();
    const differenceInDays = differenceInTime / (1000 * 3600 * 24);
    return Math.round(differenceInDays);
  }
}