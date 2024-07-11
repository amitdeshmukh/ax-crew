interface StateInstance {
  set: (key: string, value: any) => void;
  get: (key: string) => any;
  getAll: () => { [key: string]: any };
  getId: () => string;
  reset: () => void;
}

const stateInstances: { [id: string]: StateInstance } = {};

const createState = (id: string): StateInstance => {
  if (!id) {
    throw new Error('An ID is required to create a new state instance.');
  }
  if (stateInstances[id]) {
    return stateInstances[id];
  }

  let data: { [key: string]: any } = {};

  stateInstances[id] = {
    set: (key, value) => {
      data[key] = value;
    },
    get: (key) => {
      return data[key];
    },
    getAll: () => {
      return data;
    },
    getId: () => {
      return id;
    },
    reset: () => {
      data = {};
    }
  };

  return stateInstances[id];
};

const getState = (id: string): StateInstance | undefined  => {
  return stateInstances[id];
}

export { createState, getState, StateInstance };