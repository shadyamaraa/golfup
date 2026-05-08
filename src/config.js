// Firebase Configuration - Replace with your Firebase project config
// See SETUP.md for instructions
export const firebaseConfig = {
  apiKey: "AIzaSyAO8NzK55UF4U05e3dZoxkNomzNX3-Ybgc",
  authDomain: "golfup-app.firebaseapp.com",
  databaseURL: "https://golfup-app-default-rtdb.firebaseio.com",
  projectId: "golfup-app",
  storageBucket: "golfup-app.firebasestorage.app",
  messagingSenderId: "189599858941",
  appId: "1:189599858941:web:2dc317541d4ad4e9d33e94"
};

export const APP_CONFIG = {
  defaultGroupSize: 4,
  maxGroupSize: 8,
  minGroupSize: 2,
  waitingListThreshold: 3,
};

export const VAPID_KEY = 'BIt5RECplMZ2lTHXUVp63cKkASA_EeerU1A6X0F9XB4hNUvskVcThDUUMpenEwRcXWMl_yPtuYbtbdFHVACj314';

export function isFirebaseConfigured() {
  return !!firebaseConfig.apiKey && !!firebaseConfig.databaseURL;
}
