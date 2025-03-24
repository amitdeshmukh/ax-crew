import { StateInstance } from '../types.js';

// State management
const stateInstances: { [id: string]: StateInstance } = {};

function createState(id: string): StateInstance {
  if (stateInstances[id]) {
    return stateInstances[id];
  }

  let state: Record<string, any> = {};
  
  const instance: StateInstance = {
    reset() {
      state = {};
    },
    set(key: string, value: any) {
      state[key] = value;
    },
    get(key: string) {
      return state[key];
    },
    getAll() {
      return { ...state };
    }
  };

  stateInstances[id] = instance;
  return instance;
}

function getState(id: string): StateInstance | undefined {
  return stateInstances[id];
}

export { createState, getState };