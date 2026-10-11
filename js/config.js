// Firebase সেটআপের তথ্য। এটা গোপন নয় — ডেটার সুরক্ষা থাকে firestore.rules-এ।
// null থাকলে অ্যাপ "লোকাল মোডে" চলে (ডেটা শুধু ব্রাউজারে)।
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDmVNe7dMsGMsG0CpSx5c3FXiuR1MAY1Yk',
  authDomain: 'at-turath-academy1.firebaseapp.com',
  projectId: 'at-turath-academy1',
  storageBucket: 'at-turath-academy1.firebasestorage.app',
  messagingSenderId: '508244492383',
  appId: '1:508244492383:web:9cc454191f2a5f1ecbdbea',
};

// মালিকের Gmail (ছোট হাতের অক্ষরে)। firestore.rules-এও একই ঠিকানা থাকতে হবে।
export const OWNER_EMAIL = 'turathedu.bd@gmail.com';
