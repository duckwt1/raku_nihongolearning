import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';
import { createFirestoreSyncClient } from '@raku/sync';
import { mobileRepository } from './storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'fake-api-key-for-emulator',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'raku-nihongolearning.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'raku-nihongolearning',
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'raku-nihongolearning.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '47955753075',
  appId:
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:47955753075:web:bdbc212dc49d7238b3d206'
};

export const isFirebaseConfigured = Boolean(
  process.env.EXPO_PUBLIC_FIREBASE_API_KEY &&
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY !== 'fake-api-key-for-emulator'
);

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

function initMobileAuth(): FirebaseAuth.Auth {
  try {
    const getRNPersistence = (
      FirebaseAuth as unknown as {
        getReactNativePersistence?: (storage: typeof AsyncStorage) => FirebaseAuth.Persistence;
      }
    ).getReactNativePersistence;

    if (typeof getRNPersistence === 'function') {
      return FirebaseAuth.initializeAuth(app, {
        persistence: getRNPersistence(AsyncStorage)
      });
    }
  } catch {
    // Already initialized during Fast Refresh
  }
  return FirebaseAuth.getAuth(app);
}

function initMobileFirestore(): Firestore {
  try {
    return initializeFirestore(app, {
      experimentalForceLongPolling: true
    });
  } catch {
    return getFirestore(app);
  }
}

export const auth = initMobileAuth();
export const db = initMobileFirestore();
export const mobileSyncClient = createFirestoreSyncClient({
  db,
  repository: mobileRepository
});

export const {
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  linkWithCredential,
  EmailAuthProvider,
  signOut
} = FirebaseAuth;
export type User = FirebaseAuth.User;
