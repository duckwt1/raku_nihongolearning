import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  signInAnonymously,
  onAuthStateChanged,
  type User
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  type Firestore
} from 'firebase/firestore';

// Client Firebase config - public values, secured by Firestore Rules & Worker
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'fake-api-key-for-emulator',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'raku-nihongo-learning.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'raku-nihongo-learning',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'raku-nihongo-learning.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:123456789:web:abcdef'
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Firestore with IndexedDB multi-tab offline persistence
export const db: Firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// Automatically connect to Firebase Emulator in development mode if enabled
const shouldUseEmulator =
  import.meta.env.DEV || import.meta.env.VITE_USE_EMULATOR === 'true';

if (shouldUseEmulator && typeof window !== 'undefined') {
  const host = window.location.hostname || '127.0.0.1';
  // Avoid duplicate connection if already connected
  try {
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    console.log('🔗 Connected to Firebase Emulator Suite (Auth: 9099, Firestore: 8080)');
  } catch {
    // Emulator already connected in HMR
  }
}

export { signInAnonymously, onAuthStateChanged, type User };
