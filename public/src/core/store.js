import { seed } from "../data/seed.js";

const KEY = "clinic-crm-prototype-state-v2";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function ensureState() {
  if (!localStorage.getItem(KEY)) {
    localStorage.setItem(KEY, JSON.stringify(seed));
  }
  return getState();
}

export function getState() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || clone(seed);
  } catch {
    return clone(seed);
  }
}

export function setState(next) {
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function updateState(mutator) {
  const next = getState();
  mutator(next);
  setState(next);
  return next;
}

export function resetState() {
  setState(clone(seed));
}

export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function byId(collection, id) {
  return collection.find((item) => item.id === id);
}

export function ownerAnimals(state, ownerId) {
  return state.animals.filter((animal) => animal.ownerId === ownerId);
}

export function animalVisits(state, animalId) {
  return state.visits.filter((visit) => visit.animalId === animalId);
}
