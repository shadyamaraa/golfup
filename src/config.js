// Firebase Configuration - Replace with your Firebase project config
// See SETUP.md for instructions
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

export const APP_CONFIG = {
  defaultGroupSize: 4,
  maxGroupSize: 8,
  minGroupSize: 2,
  waitingListThreshold: 3,
};

export function isFirebaseConfigured() {
  return !!firebaseConfig.apiKey && !!firebaseConfig.databaseURL;
}
