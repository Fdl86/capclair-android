import { useCallback, useEffect, useState } from 'react';
import { readJson, writeJson } from '../services/storage/localStorageService';

export function useLocalStorageState<T>(key: string, initialValue: T): [T, (value: T | ((current: T) => T)) => void] {
  const [state, setState] = useState<T>(() => readJson(key, initialValue));

  useEffect(() => {
    writeJson(key, state);
  }, [key, state]);

  const setStoredState = useCallback((value: T | ((current: T) => T)) => {
    setState((current) => typeof value === 'function' ? (value as (current: T) => T)(current) : value);
  }, []);

  return [state, setStoredState];
}
