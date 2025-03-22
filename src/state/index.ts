// State management

/**
 * A state instance that is shared between agents.
 * This can be used to store data that becomes available to all agents and functions in an out-of-band manner.
 * 
 * @typedef {Object} StateInstance
 * @property {Function} reset - Reset the state.
 * @property {Function} set - Set a value in the state.
 * @property {Function} get - Get a value from the state.
 * @property {Function} getAll - Get all the values from the state.
 */
export interface StateInstance {
  reset(): void;
  set(key: string, value: any): void;
  get(key: string): any;
  getAll(): Record<string, any>;
  [key: string]: any;
}

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