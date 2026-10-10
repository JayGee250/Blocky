// Firebase sign-in and storage for family accounts. Loaded only when someone
// uses an account, so the app itself never waits for (or needs) the network.
// Each player on this phone gets their own Firebase app instance, so several
// family members can stay signed in on a shared phone at once.
import { firebaseConfig, FIREBASE_SDK, FIREBASE_EMULATOR } from './firebase-config.js';

let sdk = null;
function loadSdk() {
  sdk ||= Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore-lite.js'].map((f) => import(FIREBASE_SDK + f)))
    .then(([app, auth, store]) => ({ ...app, ...auth, ...store }))
    .catch((e) => { sdk = null; throw e; });
  return sdk;
}

async function instance(playerId) {
  const f = await loadSdk();
  const name = 'bb-' + playerId;
  const existing = f.getApps().find((a) => a.name === name);
  const app = existing || f.initializeApp(firebaseConfig, name);
  const auth = f.getAuth(app), db = f.getFirestore(app);
  if (!existing && FIREBASE_EMULATOR) {
    f.connectAuthEmulator(auth, FIREBASE_EMULATOR.auth, { disableWarnings: true });
    f.connectFirestoreEmulator(db, ...FIREBASE_EMULATOR.firestore);
  }
  return { f, auth, db };
}

// Everything one player's account can do. Methods reject with Firebase errors
// (error.code like 'auth/invalid-credential' or 'permission-denied').
export function account(playerId) {
  const me = async () => {
    const x = await instance(playerId);
    await x.auth.authStateReady();
    return x;
  };
  const userDoc = (x) => x.f.doc(x.db, 'users', x.auth.currentUser.uid);
  const rowDoc = (x) => x.f.doc(x.db, 'leaderboard', x.auth.currentUser.uid);
  const historyDoc = (x) => x.f.doc(x.db, 'history', x.auth.currentUser.uid);
  const who = (u) => (u ? { uid: u.uid, email: u.email } : null);
  return {
    async user() { return who((await me()).auth.currentUser); },
    async signIn(email, password) { const x = await me(); return who((await x.f.signInWithEmailAndPassword(x.auth, email, password)).user); },
    async signUp(email, password) { const x = await me(); return who((await x.f.createUserWithEmailAndPassword(x.auth, email, password)).user); },
    async resetPassword(email) { const x = await me(); await x.f.sendPasswordResetEmail(x.auth, email); },
    async signOut() { const x = await me(); await x.f.signOut(x.auth); },
    async pull() { const x = await me(); const snap = await x.f.getDoc(userDoc(x)); return snap.exists() ? snap.data() : null; },
    async push(doc) { const x = await me(); await x.f.setDoc(userDoc(x), { ...doc, updatedAt: Date.now() }); },
    async pushRow(row) { const x = await me(); await x.f.setDoc(rowDoc(x), { ...row, updatedAt: Date.now() }); },
    async pushHistory(h) { const x = await me(); await x.f.setDoc(historyDoc(x), { ...h, updatedAt: Date.now() }); },
    // Every family member's game history: [{ uid, name, games }].
    async histories() {
      const x = await me();
      const snap = await x.f.getDocs(x.f.collection(x.db, 'history'));
      return snap.docs.map((d) => ({ uid: d.id, name: d.get('name'), games: d.get('games') || [] }));
    },
    async board() {
      const x = await me();
      const snap = await x.f.getDocs(x.f.query(x.f.collection(x.db, 'leaderboard'), x.f.orderBy('best', 'desc'), x.f.limit(50)));
      return snap.docs.map((d) => ({ uid: d.id, name: d.get('name'), best: d.get('best'), level: d.get('level') }));
    },
  };
}
