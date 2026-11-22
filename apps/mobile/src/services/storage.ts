import AsyncStorage from '@react-native-async-storage/async-storage';
import { createUserRepository, type AsyncKeyValueStorage } from '@raku/sync';

export const mobileStorage: AsyncKeyValueStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key)
};

export const mobileRepository = createUserRepository(mobileStorage);
