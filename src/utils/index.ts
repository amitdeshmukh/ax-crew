import { AxFunction } from "@ax-llm/ax";

/**
 * Checks if a given function is a class constructor.
 *
 * @param {Function} obj - The object to check.
 * @returns {boolean} True if the object is a class constructor, false otherwise.
 */
export function isClass(obj: AxFunction | ClassDecorator): boolean {
  // A class must be a function
  if (typeof obj !== 'function') {
    return false;
  }
  // The function must have a prototype, but not be an instance of another function
  if (obj.prototype === undefined || obj.prototype.constructor !== obj) {
    return false;
  }
  // The function's prototype must have isPrototypeOf method
  if (!Object.prototype.hasOwnProperty.call(obj.prototype, 'isPrototypeOf')) {
    return false;
  }
  // The function must not have its own 'isPrototypeOf' property
  if (obj.hasOwnProperty('isPrototypeOf')) {
    return false;
  }
  return true;
}