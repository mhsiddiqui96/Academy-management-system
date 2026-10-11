// Firebase সেটআপের তথ্য। এটা গোপন নয় — ডেটার সুরক্ষা থাকে firestore.rules-এ।
// null থাকলে অ্যাপ "লোকাল মোডে" চলে (ডেটা শুধু ব্রাউজারে)।
export const FIREBASE_CONFIG = null;

// মালিকের Gmail (ছোট হাতের অক্ষরে)। firestore.rules-এও একই ঠিকানা থাকতে হবে।
export const OWNER_EMAIL = '';
