// The family's Firebase project (Bloxx). These values identify the project to
// Firebase; they are not secrets and are safe in a public repository. What
// keeps the data private is firestore.rules.
//
// Where apiKey and appId come from: Firebase console > Bloxx > gear icon >
// Project settings > General > Your apps > the Web app (</>) > SDK setup and
// configuration > Config.
// While apiKey is still the placeholder, the app stays local only and hides sign-in.
export const firebaseConfig = {
  apiKey: 'AIzaSyA39A__g_hut-560VuXqQseJmpsg3Vw7ts',
  authDomain: 'bloxx-6d09c.firebaseapp.com',
  projectId: 'bloxx-6d09c',
  storageBucket: 'bloxx-6d09c.firebasestorage.app',
  messagingSenderId: '627449600841',
  appId: '1:627449600841:web:3d24c1837e40ef01c1d898',
};

// Firebase web SDK version, loaded from Google's CDN only when someone signs in.
export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';

// Local emulators for tools/check-cloud.js: { auth: 'http://127.0.0.1:9099', firestore: ['127.0.0.1', 8080] }.
export const FIREBASE_EMULATOR = null;
