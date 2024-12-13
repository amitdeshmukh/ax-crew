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