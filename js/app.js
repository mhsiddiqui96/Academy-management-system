import { FIREBASE_CONFIG, OWNER_EMAIL } from './config.js';

/* =========================================================
 * At-Turath Academy — ম্যানেজমেন্ট সিস্টেম
 * ডেটা থাকে Firebase-এ (লগইনসহ)। Firebase সেটআপ না থাকলে ব্রাউজারের
 * localStorage-এ চলে (লোকাল মোড, শুধু একজন ব্যবহারকারী)।
 * ========================================================= */

const STORE_KEY = 'academy-ms-v1';
const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const PAY_METHODS = ['বিকাশ', 'নগদ', 'রকেট', 'ব্যাংক ট্রান্সফার', 'কার্ড/অনলাইন গেটওয়ে', 'PayPal/Wise/Payoneer (বিদেশ)', 'ক্যাশ'];
const INCOME_CATS = ['ভর্তি/রেজিস্ট্রেশন ফি', 'কোর্স ফি (এককালীন)', 'পরীক্ষা/সার্টিফিকেট ফি', 'বই/PDF/রেকর্ডেড কোর্স বিক্রি', 'অনুদান', 'অন্যান্য আয়'];
const EXPENSE_CATS = ['Zoom/Google Meet সাবস্ক্রিপশন', 'ওয়েবসাইট/ডোমেইন/হোস্টিং', 'সফটওয়্যার/অ্যাপ', 'ফেসবুক/অনলাইন বিজ্ঞাপন', 'পেমেন্ট গেটওয়ে/ক্যাশআউট চার্জ', 'ইন্টারনেট', 'ডিজাইন/কনটেন্ট তৈরি', 'অন্যান্য ব্যয়'];

/** ডেটাবেসের সব কালেকশন (প্রতিটা একটা অ্যারে; settings আলাদা) */
const COLLECTIONS = [
  'teachers', 'teacherPrivate', 'teacherView', 'teacherStatements', 'batches', 'students', 'exams',
  'payments', 'incomes', 'expenses', 'payRules', 'shares', 'teacherPayouts',
  'staff', 'staffNames', 'staffPayouts', 'staffEntries', 'commissions', 'summaries', 'members',
];

const defaultSettings = () => ({
  academyName: 'At-Turath Academy',
  phone: '',
  address: '',
  adminReports: false,
  reminderTemplate: 'আসসালামু আলাইকুম, {guardian}। {academy} থেকে জানানো যাচ্ছে যে {student}-এর {months} মাসের ফি মোট {amount} টাকা বকেয়া আছে। অনুগ্রহ করে দ্রুত পরিশোধ করুন। ধন্যবাদ।',
});

const defaultData = () => {
  const d = { version: 2, settings: defaultSettings() };
  for (const c of COLLECTIONS) d[c] = [];
  return d;
};

/** পুরোনো (v1) ফরম্যাটের ডেটা নতুন ফরম্যাটে আনা: আয়/ব্যয় আলাদা, গোপন তথ্য আলাদা কালেকশনে */
function upgrade(d) {
  d = JSON.parse(JSON.stringify(d || {}));
  if (!d.version || d.version < 2) {
    const tx = Array.isArray(d.transactions) ? d.transactions : [];
    d.incomes = tx.filter((t) => t.type === 'income').map(({ type, ...t }) => t);
    d.expenses = tx.filter((t) => t.type === 'expense').map(({ type, ...t }) => t);
    delete d.transactions;
    d.payRules = [];
    for (const b of d.batches || []) {
      if (b.payType) d.payRules.push({ id: 'b_' + b.id, type: b.payType, value: Number(b.payValue) || 0 });
      delete b.payType; delete b.payValue;
    }
    for (const s of d.students || []) {
      if (s.payType) d.payRules.push({ id: 's_' + s.id, type: s.payType, value: Number(s.payValue) || 0 });
      delete s.payType; delete s.payValue;
    }
    d.shares = [];
    for (const p of d.payments || []) {
      if (p.teacherShare !== undefined) d.shares.push({ id: p.id, teacherId: p.teacherId || '', share: Number(p.teacherShare) || 0, amount: p.amount, date: p.date });
      delete p.teacherId; delete p.teacherShare;
    }
    for (const t of d.teachers || []) delete t.salary;
    d.version = 2;
  }
  return normalize(d);
}

function normalize(d) {
  const out = defaultData();
  out.settings = Object.assign(defaultSettings(), d.settings || {});
  for (const c of COLLECTIONS) out[c] = Array.isArray(d[c]) ? d[c] : [];
  return out;
}

/** Firestore-এ undefined রাখা যায় না, তাই পরিষ্কার কপি */
const clean = (o) => JSON.parse(JSON.stringify(o));

/* ---------- লোকাল মোড (Firebase ছাড়া) ---------- */
function loadLocal() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return upgrade(JSON.parse(raw));
  } catch (e) {
    console.error(e);
  }
  return defaultData();
}

function saveLocal() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch (e) {
    alert('ডেটা সেভ করা যায়নি: ' + e.message);
  }
}

// Firebase চালু কিনা (?emulator দিয়ে পরীক্ষার সময় নকল Firebase)
const URLP = new URLSearchParams(location.search);
const EMULATOR = URLP.has('emulator');
const FB_CONFIG = EMULATOR ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-academy' } : FIREBASE_CONFIG;
const OWNER = (EMULATOR ? URLP.get('owner') || '' : OWNER_EMAIL || '').toLowerCase();
const FB_MODE = !!(FB_CONFIG && FB_CONFIG.projectId);

let db = FB_MODE ? defaultData() : loadLocal();

/** বর্তমান ব্যবহারকারী: লোকাল মোডে সবসময় মালিক */
const me = { email: '', role: FB_MODE ? '' : 'owner', teacherId: '', name: '' };
const isOwnerRole = () => me.role === 'owner';
const isAdminRole = () => me.role === 'admin';
const isTeacherRole = () => me.role === 'teacher';
/** মালিক বা অ্যাডমিন */
const isStaffRole = () => isOwnerRole() || isAdminRole();
const canSeeReports = () => isOwnerRole() || (isAdminRole() && !!db.settings.adminReports);

/* ---------- helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('bn-BD');
const tk = (n) => (Number(n) < 0 ? '−৳' + num(-n) : '৳' + num(n));
const sum = (list, key = 'amount') => list.reduce((a, x) => a + (Number(x[key]) || 0), 0);
const byId = (list, id) => list.find((x) => x.id === id);

function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
const thisMonth = () => today().slice(0, 7);

function monthLabel(m) {
  if (!m) return '';
  const [y, mo] = m.split('-').map(Number);
  return `${BN_MONTHS[mo - 1]} ${num(y).replace(/,/g, '')}`;
}

function shiftMonth(m, delta) {
  let [y, mo] = m.split('-').map(Number);
  mo += delta;
  while (mo < 1) { mo += 12; y--; }
  while (mo > 12) { mo -= 12; y++; }
  return `${y}-${String(mo).padStart(2, '0')}`;
}

function monthsBetween(start, end) {
  const out = [];
  let m = start;
  while (m <= end && out.length < 240) {
    out.push(m);
    m = shiftMonth(m, 1);
  }
  return out;
}

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return `${num(day)} ${BN_MONTHS[m - 1]} ${num(y).replace(/,/g, '')}`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- domain logic ---------- */
const teacherName = (id) => byId(db.teachers, id)?.name || '—';
const batchName = (id) => byId(db.batches, id)?.name || '—';
const isOne2One = (s) => s?.type === 'one2one';
const ONE2ONE = '__one2one';
/** স্টুডেন্ট কোথায় পড়ে: ব্যাচের নাম অথবা "ওয়ান-টু-ওয়ান" */
const classLabel = (s) => (isOne2One(s) ? 'ওয়ান-টু-ওয়ান' : batchName(s?.batchId));
const typeBadge = (s) => (isOne2One(s) ? '<span class="badge amber">ওয়ান-টু-ওয়ান</span>' : '<span class="badge blue">ব্যাচ</span>');
/** ফিল্টার: '' = সব, ONE2ONE = সব ওয়ান-টু-ওয়ান, নাহলে নির্দিষ্ট ব্যাচ */
function matchClass(s, f) {
  if (!f) return true;
  if (f === ONE2ONE) return isOne2One(s);
  return !isOne2One(s) && s.batchId === f;
}
const classFilterOpts = () => [[ONE2ONE, 'সব ওয়ান-টু-ওয়ান'], ...db.batches.map((b) => [b.id, 'ব্যাচ: ' + b.name])];
function classLink(s) {
  return isOne2One(s) ? s.classLink : byId(db.batches, s.batchId)?.classLink;
}
const studentName = (id) => byId(db.students, id)?.name || '(মুছে ফেলা স্টুডেন্ট)';

function studentTeacherId(s) {
  if (s.teacherId || isOne2One(s)) return s.teacherId || '';
  return byId(db.batches, s.batchId)?.teacherId || '';
}

function paidFor(studentId, month) {
  return sum(db.payments.filter((p) => p.studentId === studentId && p.month === month));
}

/** একজন স্টুডেন্টের ভর্তির মাস থেকে `upto` মাস পর্যন্ত যেসব মাসের ফি বাকি */
function studentDues(s, upto = thisMonth()) {
  const fee = Number(s.monthlyFee) || 0;
  if (!fee || s.status === 'inactive') return [];
  const start = (s.admissionDate || today()).slice(0, 7);
  return monthsBetween(start, upto)
    .map((m) => {
      const paid = paidFor(s.id, m);
      return { month: m, fee, paid, due: Math.max(0, fee - paid) };
    })
    .filter((x) => x.due > 0);
}

function allDues() {
  return db.students
    .map((s) => {
      const dues = studentDues(s);
      return { student: s, dues, total: sum(dues, 'due') };
    })
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);
}

const inMonth = (d, month) => !month || String(d || '').startsWith(month);

/** একটা মাসের সব আয় (ফি + অন্যান্য আয়) ও ব্যয় (খরচ + শিক্ষক/স্টাফকে পরিশোধ) একসাথে */
function ledger(month) {
  const rows = [];
  for (const p of db.payments) {
    if (!inMonth(p.date, month)) continue;
    rows.push({
      id: p.id, kind: 'payment', type: 'income', date: p.date, amount: p.amount,
      category: isOne2One(byId(db.students, p.studentId)) ? 'মাসিক ফি (ওয়ান-টু-ওয়ান)' : 'মাসিক ফি (ব্যাচ)', note: `${studentName(p.studentId)} — ${monthLabel(p.month)}${p.method ? ' (' + p.method + ')' : ''}`,
    });
  }
  for (const t of db.incomes) {
    if (inMonth(t.date, month)) rows.push({ id: t.id, kind: 'income', type: 'income', date: t.date, amount: t.amount, category: t.category, note: t.note || '' });
  }
  for (const t of db.expenses) {
    if (inMonth(t.date, month)) rows.push({ id: t.id, kind: 'expense', type: 'expense', date: t.date, amount: t.amount, category: t.category, note: t.note || '' });
  }
  for (const o of db.teacherPayouts) {
    if (inMonth(o.date, month)) rows.push({ id: o.id, kind: 'payout', type: 'expense', date: o.date, amount: o.amount, category: 'শিক্ষক সম্মানী', note: `${teacherName(o.teacherId)}${o.method ? ' (' + o.method + ')' : ''}${o.note ? ' — ' + o.note : ''}` });
  }
  for (const o of db.staffPayouts) {
    if (inMonth(o.date, month)) rows.push({ id: o.id, kind: 'staffPayout', type: 'expense', date: o.date, amount: o.amount, category: 'স্টাফ সম্মানী', note: `${staffName(o.staffId)}${o.method ? ' (' + o.method + ')' : ''}${o.note ? ' — ' + o.note : ''}` });
  }
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/* ---------- শিক্ষকের পাওনা ----------
 * নিয়ম: স্টুডেন্ট ফি দিলে তবেই শিক্ষকের অংশ পাওনা হয় (যে মাসে টাকা এলো, সেই মাসের পাওনা)।
 * অংশের নিয়ম (payRules) ব্যাচে `b_<id>` বা ওয়ান-টু-ওয়ান স্টুডেন্টে `s_<id>`:
 *   percent = ফি-এর শতাংশ, fixed = প্রতি স্টুডেন্ট মাসে নির্দিষ্ট টাকা (আংশিক ফি এলে আনুপাতিক)।
 * প্রতিটা ফি-এর শিক্ষক ও অংশ `shares/<paymentId>`-এ সেভ থাকে (শুধু মালিক দেখেন),
 * তাই পরে নিয়ম বদলালে পুরোনো হিসাব বদলায় না।
 */
const ruleDoc = (key) => byId(db.payRules, key);

function payRule(s) {
  const own = s && ruleDoc('s_' + s.id);
  if (own) return { type: own.type, value: Number(own.value) || 0 };
  if (s && !isOne2One(s)) {
    const b = ruleDoc('b_' + s.batchId);
    if (b) return { type: b.type, value: Number(b.value) || 0 };
  }
  return { type: 'percent', value: 0 };
}

function fmtRule(r) {
  if (!r.value) return '<span class="badge amber">নিয়ম ঠিক করা নেই</span>';
  return r.type === 'fixed' ? `মাসে ${tk(r.value)}` : `ফি-এর ${num(r.value)}%`;
}

/** মালিক নিজে যে "শিক্ষক" — তাঁর ক্লাসের পুরো ফি একাডেমির আয়, শিক্ষকের পাওনা হয় না */
const isSelfTeacher = (tid) => !!byId(db.teachers, tid)?.selfOwner;
const payTeachers = () => db.teachers.filter((t) => !t.selfOwner);
const ruleText = (tid, r) => (isSelfTeacher(tid) ? '<span class="badge blue">মালিক নিজে — সম্মানী নেই</span>' : fmtRule(r));

function teacherShareFor(s, amount) {
  if (!s) return 0;
  if (isSelfTeacher(studentTeacherId(s))) return 0;
  const r = payRule(s);
  if (r.type === 'fixed') {
    const fee = Number(s.monthlyFee) || 0;
    return fee ? Math.round(r.value * Math.min(1, Number(amount) / fee)) : 0;
  }
  return Math.round((Number(amount) * r.value) / 100);
}

/** একটা ফি-এর শিক্ষক ও তাঁর অংশ (সেভ করা থাকলে সেটা, না থাকলে এখনকার নিয়মে) */
function computeShare(p) {
  const st = byId(db.students, p.studentId);
  return { id: p.id, teacherId: st ? studentTeacherId(st) : '', share: teacherShareFor(st, p.amount), amount: Number(p.amount) || 0, date: p.date };
}
const shareOf = (p) => byId(db.shares, p.id) || computeShare(p);
const paymentTeacher = (p) => shareOf(p).teacherId;
const paymentShare = (p) => Number(shareOf(p).share) || 0;

/** শিক্ষকের হিসাব: month দিলে শুধু সেই মাস, upto দিলে শুরু থেকে সেই মাস পর্যন্ত */
function teacherAccount(tid, { month, upto } = {}) {
  const inRange = (d) => (month ? d.startsWith(month) : upto ? d.slice(0, 7) <= upto : true);
  const pays = db.payments.filter((p) => paymentTeacher(p) === tid && inRange(p.date));
  const outs = db.teacherPayouts.filter((o) => o.teacherId === tid && inRange(o.date));
  const earned = sum(pays);
  const share = pays.reduce((a, p) => a + paymentShare(p), 0);
  const paid = sum(outs);
  return { pays, outs, earned, share, academy: earned - share, paid, balance: share - paid };
}

/* ---------- স্টাফের পাওনা ----------
 * মাসিক সম্মানী: যোগদানের মাস থেকে (চলে গেলে শেষ মাস পর্যন্ত) প্রতি মাসে পাওনা।
 *   সম্মানী বদলালে salaryHistory-তে নতুন সারি যোগ হয়, তাই আগের মাসের হিসাব বদলায় না।
 * ভর্তি কমিশন: স্টুডেন্টের "ভর্তি করিয়েছেন" স্টাফ পান, স্টুডেন্টের প্রথম ফি আসার দিন পাওনা হয়।
 *   ভর্তির সময় স্টাফের তখনকার নিয়ম `commissions/<studentId>`-এ সেভ হয়।
 * বোনাস (+) ও কর্তন (−): staffEntries।
 */
const staffName = (id) => byId(db.staff, id)?.name || byId(db.staffNames, id)?.name || '—';
const COMM_TYPES = [['none', 'কমিশন নেই'], ['fixed', 'প্রতি ভর্তিতে নির্দিষ্ট টাকা'], ['percent', 'প্রথম মাসের ফি-এর শতাংশ']];

function fmtComm(c) {
  if (!c || c.type === 'none' || !Number(c.value)) return 'কমিশন নেই';
  return c.type === 'fixed' ? `প্রতি ভর্তিতে ${tk(c.value)}` : `প্রথম মাসের ফি-এর ${num(c.value)}%`;
}

function salaryFor(st, m) {
  const hist = (st.salaryHistory || []).slice().sort((a, b) => (a.from < b.from ? -1 : 1));
  let amt = 0;
  for (const h of hist) if (h.from <= m) amt = Number(h.amount) || 0;
  return amt;
}

/** যেসব মাসে সম্মানী পাওনা হয় (যোগদানের মাস থেকে আজ বা চলে যাওয়ার মাস পর্যন্ত) */
function staffMonths(st, upto = thisMonth()) {
  const start = (st.joinDate || today()).slice(0, 7);
  let end = upto;
  if (st.status === 'inactive' && st.leftDate) end = st.leftDate.slice(0, 7) < end ? st.leftDate.slice(0, 7) : end;
  return monthsBetween(start, end);
}

/** স্টুডেন্টের প্রথম ফি (তারিখ অনুযায়ী) */
function firstPayment(studentId) {
  let first = null;
  for (const p of db.payments) if (p.studentId === studentId && (!first || p.date < first.date)) first = p;
  return first;
}

function commissionAmount(c, st) {
  if (!c || c.type === 'none') return 0;
  if (c.type === 'fixed') return Math.round(Number(c.value) || 0);
  return Math.round(((Number(st?.monthlyFee) || 0) * (Number(c.value) || 0)) / 100);
}

/** কমিশনের অবস্থা: পাওনা হয়েছে (প্রথম ফি এসেছে) নাকি অপেক্ষায় */
function commissionStatus(c) {
  const st = byId(db.students, c.id);
  if (c.accruedDate) return { accrued: true, date: c.accruedDate, amount: Number(c.accruedAmount) || 0, student: st };
  const fp = firstPayment(c.id);
  if (fp) return { accrued: true, date: fp.date, amount: commissionAmount(c, st), student: st };
  return { accrued: false, date: '', amount: commissionAmount(c, st), student: st };
}

function staffAccount(sid, { month, upto } = {}) {
  const st = byId(db.staff, sid);
  if (!st) return { salary: 0, commission: 0, bonus: 0, deduction: 0, paid: 0, earned: 0, balance: 0, comms: [], entries: [], outs: [] };
  const inRange = (d) => (month ? String(d).startsWith(month) : upto ? String(d).slice(0, 7) <= upto : true);
  const lastMonth = month || upto || thisMonth();
  const months = staffMonths(st, lastMonth > thisMonth() ? thisMonth() : lastMonth).filter((m) => (month ? m === month : true));
  const salary = months.reduce((a, m) => a + salaryFor(st, m), 0);
  const comms = db.commissions.filter((c) => c.staffId === sid).map((c) => ({ c, ...commissionStatus(c) }));
  const commission = comms.filter((x) => x.accrued && inRange(x.date)).reduce((a, x) => a + x.amount, 0);
  const entries = db.staffEntries.filter((e) => e.staffId === sid && inRange(e.date));
  const bonus = sum(entries.filter((e) => e.kind === 'bonus'));
  const deduction = sum(entries.filter((e) => e.kind === 'deduction'));
  const outs = db.staffPayouts.filter((o) => o.staffId === sid && inRange(o.date));
  const paid = sum(outs);
  const earned = salary + commission + bonus - deduction;
  return { salary, commission, bonus, deduction, paid, earned, balance: earned - paid, comms, entries, outs };
}

function monthTotals(month) {
  const rows = ledger(month);
  const income = sum(rows.filter((r) => r.type === 'income'));
  const expense = sum(rows.filter((r) => r.type === 'expense'));
  return { income, expense, net: income - expense };
}

function grade(pct) {
  if (pct >= 80) return ['A+', 'green'];
  if (pct >= 70) return ['A', 'green'];
  if (pct >= 60) return ['A-', 'green'];
  if (pct >= 50) return ['B', 'amber'];
  if (pct >= 40) return ['C', 'amber'];
  if (pct >= 33) return ['D', 'amber'];
  return ['F', 'red'];
}

/* ---------- ক্লাস রুটিন ---------- */
const DAY_NAMES = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহস্পতি', 'শুক্র', 'শনি']; // JS getDay() অনুযায়ী
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5]; // শনিবার থেকে সপ্তাহ শুরু
const bnDigits = (str) => String(str).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);

function fmtTime(t) {
  if (!t) return '';
  const [h, mi] = t.split(':').map(Number);
  const period = h < 4 ? 'রাত' : h < 6 ? 'ভোর' : h < 12 ? 'সকাল' : h < 15 ? 'দুপুর' : h < 18 ? 'বিকাল' : h < 20 ? 'সন্ধ্যা' : 'রাত';
  return `${period} ${bnDigits(h % 12 || 12)}:${bnDigits(String(mi).padStart(2, '0'))}`;
}

const daysOf = (x) => (Array.isArray(x?.days) ? x.days.map(Number) : []);

function fmtSchedule(x) {
  const days = daysOf(x);
  if (!days.length) return x?.schedule || '';
  const d = days.length === 7 ? 'প্রতিদিন' : WEEK_ORDER.filter((i) => days.includes(i)).map((i) => DAY_NAMES[i]).join(', ');
  return d + (x.time ? ' · ' + fmtTime(x.time) : '');
}

/** একটা মাসে নির্ধারিত দিনগুলোতে মোট কয়টা ক্লাস পড়ে */
function classesInMonth(days, month) {
  if (!days.length) return 0;
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = 1; d <= last; d++) if (days.includes(new Date(y, m - 1, d).getDay())) n++;
  return n;
}

/** সব ক্লাস: প্রতিটা ব্যাচ আর প্রতিটা সক্রিয় ওয়ান-টু-ওয়ান স্টুডেন্ট */
function classSessions() {
  const out = [];
  for (const b of db.batches) {
    const n = db.students.filter((s) => !isOne2One(s) && s.batchId === b.id && s.status !== 'inactive').length;
    out.push({ key: 'b' + b.id, title: b.name, sub: `ব্যাচ · ${num(n)} জন`, teacherId: b.teacherId, days: daysOf(b), time: b.time || '', link: b.classLink, raw: b });
  }
  for (const s of db.students) {
    if (!isOne2One(s) || s.status === 'inactive') continue;
    out.push({ key: 's' + s.id, title: s.name, sub: 'ওয়ান-টু-ওয়ান' + (s.course ? ' · ' + s.course : ''), teacherId: s.teacherId, days: daysOf(s), time: s.time || '', link: s.classLink, raw: s });
  }
  return out;
}

const byTime = (a, b) => (a.time || '99').localeCompare(b.time || '99');

function sessionRows(list, withClash = true) {
  return list.map((c) => {
    const clash = withClash && c.teacherId && c.time && list.some((o) => o !== c && o.teacherId === c.teacherId && o.time === c.time);
    return `<tr><td><b>${fmtTime(c.time) || '—'}</b></td><td><b>${esc(c.title)}</b><br><span class="muted">${esc(c.sub)}</span></td>
      <td>${esc(teacherName(c.teacherId))}${clash ? ' <span class="badge red">⚠️ একই সময়ে আরেকটা ক্লাস</span>' : ''}</td>
      <td class="actions">${c.link ? `<a class="btn sm primary" target="_blank" rel="noopener" href="${esc(c.link)}">ক্লাসে যান</a>` : '<span class="muted">লিংক নেই</span>'}</td></tr>`;
  });
}

const pctOf = (e) => (Number(e.total) ? (Number(e.marks) / Number(e.total)) * 100 : 0);

/* ---------- reminders ---------- */
function intlPhone(p) {
  const raw = String(p || '').trim();
  const d = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return d; // বিদেশি নম্বর: +44..., +966... ইত্যাদি
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('880')) return d;
  if (d.startsWith('01') && d.length === 11) return '88' + d; // বাংলাদেশি নম্বর
  if (d.length === 10 && d.startsWith('1')) return '880' + d;
  return d;
}

function reminderText(s, dues) {
  const months = dues.map((d) => monthLabel(d.month)).join(', ');
  return db.settings.reminderTemplate
    .replace(/\{guardian\}/g, s.guardian || s.name)
    .replace(/\{student\}/g, s.name)
    .replace(/\{months\}/g, months)
    .replace(/\{month\}/g, months)
    .replace(/\{amount\}/g, num(sum(dues, 'due')))
    .replace(/\{academy\}/g, db.settings.academyName);
}

function reminderButtons(s, dues) {
  const text = encodeURIComponent(reminderText(s, dues));
  const phone = intlPhone(s.phone);
  const subject = encodeURIComponent(`${db.settings.academyName} — বকেয়া ফি-এর রিমাইন্ডার`);
  let html = '';
  if (phone) {
    html += `<a class="btn sm wa" target="_blank" rel="noopener" href="https://wa.me/${phone}?text=${text}">WhatsApp</a>
          <a class="btn sm" href="sms:+${phone}?body=${text}">SMS</a> `;
  }
  if (s.email) html += `<a class="btn sm" href="mailto:${esc(s.email)}?subject=${subject}&body=${text}">ইমেইল</a> `;
  html += `<button class="btn sm" data-action="copy-reminder" data-id="${s.id}">কপি</button>`;
  return html;
}

/* ---------- generic UI pieces ---------- */
function opts(list, selected, placeholder) {
  const head = placeholder !== undefined ? `<option value="">${esc(placeholder)}</option>` : '';
  return head + list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(selected ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('');
}

function table(headers, rows, emptyMsg = 'এখনো কোনো ডেটা নেই') {
  if (!rows.length) return `<div class="table-wrap"><div class="empty">${emptyMsg}</div></div>`;
  const th = headers.map((h) => {
    const [label, cls] = Array.isArray(h) ? h : [h, ''];
    return `<th class="${cls}">${label}</th>`;
  }).join('');
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

const card = (label, value, cls = '') => `<div class="card ${cls}"><div class="label">${label}</div><div class="value">${value}</div></div>`;

let modalSubmit = null;

function openForm({ title, fields, values = {}, submitLabel = 'সেভ করুন', onSubmit }) {
  $('#modal-title').textContent = title;
  $('#modal-submit').textContent = submitLabel;
  $('#modal-body').innerHTML = fields.map((f) => {
    const v = values[f.name] ?? f.default ?? '';
    const req = f.required ? 'required' : '';
    let input;
    const dis = f.disabled ? 'disabled data-locked="1"' : '';
    if (f.type === 'info') {
      input = `<div class="info-box">${esc(f.text)}</div>`;
    } else if (f.type === 'select') {
      input = `<select name="${f.name}" ${req} ${dis}>${opts(f.options, v, f.placeholder)}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea name="${f.name}" ${req}>${esc(v)}</textarea>`;
    } else if (f.type === 'days') {
      const sel = Array.isArray(v) ? v.map(Number) : [];
      input = `<div class="days">${WEEK_ORDER.map((d) => `<label><input type="checkbox" name="${f.name}" value="${d}" ${sel.includes(d) ? 'checked' : ''}> ${DAY_NAMES[d]}</label>`).join('')}</div>`;
    } else {
      const extra = f.type === 'number' ? 'min="0" step="any"' : '';
      input = `<input type="${f.type || 'text'}" name="${f.name}" value="${esc(v)}" ${req} ${extra} ${dis}>`;
    }
    const cond = f.showIf ? `data-show-if="${f.showIf[0]}" data-show-values="${f.showIf[1].join(',')}"` : '';
    return `<div class="field" ${cond}><label>${f.label}${f.required ? ' *' : ''}</label>${input}</div>`;
  }).join('');
  updateConditionalFields();
  modalSubmit = (fd) => {
    const out = {};
    for (const f of fields) {
      if (f.type === 'info') continue;
      if (f.disabled) { out[f.name] = values[f.name] ?? ''; continue; }
      if (f.type === 'days') { out[f.name] = fd.getAll(f.name).map(Number); continue; }
      const raw = fd.get(f.name);
      out[f.name] = f.type === 'number' ? (raw === '' ? 0 : Number(raw)) : String(raw ?? '').trim();
    }
    return onSubmit(out);
  };
  $('#modal').showModal();
  $('#modal-body').querySelector('input,select,textarea')?.focus();
}

/** showIf: অন্য কোনো ফিল্ডের মান অনুযায়ী ফিল্ড দেখানো/লুকানো */
function updateConditionalFields() {
  const form = $('#modal-form');
  form.querySelectorAll('[data-show-if]').forEach((el) => {
    const ctrl = form.elements[el.dataset.showIf];
    const show = !!ctrl && el.dataset.showValues.split(',').includes(ctrl.value);
    el.hidden = !show;
    el.querySelectorAll('input,select,textarea').forEach((i) => { i.disabled = !show || i.dataset.locked === '1'; });
  });
}
$('#modal-body').addEventListener('change', updateConditionalFields);

$('#modal-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!modalSubmit) return;
  const keepOpen = modalSubmit(new FormData(e.target)) === false;
  if (keepOpen) return;
  $('#modal').close();
  commit();
});

/* ---------- view state ---------- */
const state = {
  studentSearch: '',
  studentBatch: '',
  studentTeacher: '',
  feeMonth: thisMonth(),
  feeBatch: '',
  accMonth: thisMonth(),
  progressStudent: '',
  progressBatch: '',
  reportMonth: thisMonth(),
  routineTeacher: '',
  payMonth: thisMonth(),
  staffMonth: thisMonth(),
  staffSel: '',
  tStudent: '',
  payTeacher: '',
};

/* ---------- views ---------- */
const views = {};

/** এই ব্রাউজারে আগের (লোকাল মোডের) ডেটা আছে কিনা */
function localBackupInfo() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    const n = (d.students || []).length;
    return n || (d.teachers || []).length ? { students: n } : null;
  } catch { return null; }
}

views.dashboard = () => {
  const m = thisMonth();
  const t = monthTotals(m);
  const active = db.students.filter((s) => s.status !== 'inactive');
  const dues = allDues();
  const collectedThisMonth = sum(db.payments.filter((p) => p.month === m));
  const expectedThisMonth = sum(active.filter((s) => (s.admissionDate || '').slice(0, 7) <= m), 'monthlyFee');
  const o2oCount = active.filter(isOne2One).length;

  const dueRows = dues.slice(0, 8).map(({ student: s, dues: d, total }) => `
    <tr><td>${esc(s.name)}</td><td>${esc(classLabel(s))}</td>
    <td>${d.map((x) => monthLabel(x.month)).join(', ')}</td>
    <td class="num"><b>${tk(total)}</b></td>
    <td class="actions">${reminderButtons(s, d)}</td></tr>`);

  const recent = ledger().slice(0, 6).map((r) => `
    <tr><td>${fmtDate(r.date)}</td><td>${esc(r.category)}</td><td>${esc(r.note)}</td>
    <td class="num ${r.type === 'income' ? 'up' : 'down'}">${r.type === 'income' ? '+' : '−'}${tk(r.amount)}</td></tr>`);

  const localData = FB_MODE && isOwnerRole() && !db.students.length && localBackupInfo();
  const firstRun = !db.students.length && !db.teachers.length && isOwnerRole() ? `
    <div class="note">👋 স্বাগতম! ${localData ? `এই ব্রাউজারে আগের ডেটা পাওয়া গেছে (${num(localData.students)} জন স্টুডেন্ট)।
    <button class="btn sm primary" data-action="migrate-local">আগের ডেটা অনলাইনে তুলুন</button><br>` : ''}
    নতুন করে শুরু করতে <b>শিক্ষক → ব্যাচ → স্টুডেন্ট</b> এই ক্রমে যোগ করুন (ওয়ান-টু-ওয়ান স্টুডেন্টের জন্য ব্যাচ লাগে না)।
    ${FB_MODE ? '' : 'শুধু দেখার জন্য চাইলে <button class="btn sm" data-action="load-demo">ডেমো ডেটা লোড করুন</button>'}</div>` : '';

  const todayIdx = new Date().getDay();
  const todays = classSessions().filter((c) => c.days.includes(todayIdx)).sort(byTime);

  const syncWarn = !FB_MODE && db.students.length && !db.settings.academyName.includes('(ডেমো)')
    ? '<div class="note">⚠️ লোকাল মোড: ডেটা শুধু এই ব্রাউজারে আছে। নিয়মিত <a href="#settings">ব্যাকআপ</a> ডাউনলোড করুন।</div>' : '';
  const staffDue = db.staff.reduce((a, x) => a + Math.max(0, staffAccount(x.id).balance), 0);
  const teacherDue = db.teachers.reduce((a, x) => a + Math.max(0, teacherAccount(x.id).balance), 0);

  return `
    <h2>ড্যাশবোর্ড — ${monthLabel(m)}</h2>
    ${syncWarn}${firstRun}
    <h3>📅 আজকের ক্লাস — ${DAY_NAMES[todayIdx]}বার, ${fmtDate(today())}</h3>
    ${table(['সময়', 'ক্লাস', 'শিক্ষক', ['', 'actions']], sessionRows(todays), 'আজ কোনো ক্লাস নির্ধারিত নেই')}
    <h3>এ মাসের হিসাব</h3>
    <div class="cards">
      ${isOwnerRole() ? `${card('এ মাসের আয়', tk(t.income), 'green')}
      ${card('এ মাসের ব্যয়', tk(t.expense), 'red')}
      ${card('এ মাসের লাভ/ক্ষতি', tk(t.net), t.net >= 0 ? 'green' : 'red')}` : ''}
      ${card('এ মাসের ফি আদায়', `${tk(collectedThisMonth)} <span class="muted" style="font-size:14px">/ ${tk(expectedThisMonth)}</span>`, 'blue')}
      ${card('মোট বকেয়া', tk(sum(dues, 'total')), 'red')}
      ${card('বকেয়া আছে এমন স্টুডেন্ট', num(dues.length))}
      ${card('সক্রিয় স্টুডেন্ট', num(active.length))}
      ${card('ব্যাচে / ওয়ান-টু-ওয়ান', `${num(active.length - o2oCount)} / ${num(o2oCount)}`)}
      ${card('শিক্ষক / ব্যাচ', `${num(db.teachers.length)} / ${num(db.batches.length)}`)}
      ${isOwnerRole() ? card('<a href="#payroll">শিক্ষকদের বাকি পাওনা →</a>', tk(teacherDue), 'red') + card('<a href="#staff">স্টাফদের বাকি পাওনা →</a>', tk(staffDue), 'red') : ''}
    </div>
    <h3>সবচেয়ে বেশি বকেয়া — রিমাইন্ডার পাঠান</h3>
    ${table(['স্টুডেন্ট', 'ব্যাচ/ধরন', 'বকেয়া মাস', ['মোট', 'num'], ['রিমাইন্ডার', 'actions']], dueRows, '🎉 কোনো বকেয়া নেই')}
    ${dues.length > 8 ? '<p><a href="#fees">সব বকেয়া দেখুন →</a></p>' : ''}
    <h3>সাম্প্রতিক ${isOwnerRole() ? 'লেনদেন' : 'আয়'}</h3>
    ${table(['তারিখ', 'খাত', 'বিবরণ', ['টাকা', 'num']], recent)}
  `;
};

views.students = () => {
  const q = state.studentSearch.toLowerCase();
  const list = db.students.filter((s) =>
    (!q || [s.name, s.roll, s.phone, s.guardian, s.email, s.course, s.country].some((x) => String(x || '').toLowerCase().includes(q))) &&
    matchClass(s, state.studentBatch) &&
    (!state.studentTeacher || studentTeacherId(s) === state.studentTeacher));

  const rows = list.map((s) => {
    const due = sum(studentDues(s), 'due');
    return `<tr>
      <td><b>${esc(s.name)}</b>${s.roll ? `<br><span class="muted">রোল: ${esc(s.roll)}</span>` : ''}</td>
      <td>${typeBadge(s)}<br>${esc(isOne2One(s) ? s.course || '' : classLabel(s))}</td>
      <td>${esc(teacherName(studentTeacherId(s)))}</td>
      <td>${esc(s.guardian || '')}${s.guardian ? '<br>' : ''}<span class="muted">${esc(s.phone)}${s.country ? ' · ' + esc(s.country) : ''}</span></td>
      <td class="num">${tk(s.monthlyFee)}</td>
      <td class="num">${due ? `<span class="badge red">${tk(due)}</span>` : '<span class="badge green">পরিশোধিত</span>'}</td>
      <td>${s.status === 'inactive' ? '<span class="badge gray">নিষ্ক্রিয়</span>' : '<span class="badge green">সক্রিয়</span>'}</td>
      <td class="actions">
        ${classLink(s) ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(classLink(s))}">ক্লাস লিংক</a>` : ''}
        <button class="btn sm success" data-action="pay" data-id="${s.id}">ফি নিন</button>
        <button class="btn sm" data-action="view-progress" data-id="${s.id}">প্রগ্রেস</button>
        <button class="btn sm" data-action="edit-student" data-id="${s.id}">এডিট</button>
        ${isOwnerRole() ? `<button class="btn sm danger" data-action="del-student" data-id="${s.id}">মুছুন</button>` : ''}
      </td></tr>`;
  });

  return `
    <h2>স্টুডেন্ট (${num(list.length)} জন)</h2>
    <div class="toolbar">
      <input id="student-search" data-filter="studentSearch" placeholder="🔍 নাম/রোল/ফোন দিয়ে খুঁজুন" value="${esc(state.studentSearch)}">
      <select data-filter="studentBatch">${opts(classFilterOpts(), state.studentBatch, 'সব ব্যাচ ও ওয়ান-টু-ওয়ান')}</select>
      <select data-filter="studentTeacher">${opts(db.teachers.map((t) => [t.id, t.name]), state.studentTeacher, 'সব শিক্ষক')}</select>
      <span class="spacer"></span>
      <button class="btn primary" data-action="add-student">+ নতুন স্টুডেন্ট</button>
    </div>
    ${table(['নাম', 'ধরন / ব্যাচ', 'দায়িত্বপ্রাপ্ত শিক্ষক', 'যোগাযোগ', ['মাসিক ফি', 'num'], ['বকেয়া', 'num'], 'অবস্থা', ['', 'actions']], rows,
      db.students.length ? 'কোনো মিল পাওয়া যায়নি' : 'এখনো কোনো স্টুডেন্ট যোগ করা হয়নি')}
  `;
};

views.batches = () => {
  const rows = db.batches.map((b) => {
    const count = db.students.filter((s) => !isOne2One(s) && s.batchId === b.id && s.status !== 'inactive').length;
    return `<tr><td><b>${esc(b.name)}</b></td><td>${esc(b.subject)}</td><td>${esc(teacherName(b.teacherId))}</td>
      <td>${esc(fmtSchedule(b))}</td><td class="num">${tk(b.fee)}</td>${isOwnerRole() ? `<td>${ruleText(b.teacherId, payRule({ batchId: b.id }))}</td>` : ''}<td class="num">${num(count)}</td>
      <td class="actions">
        ${b.classLink ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(b.classLink)}">ক্লাস লিংক</a>` : ''}
        ${isOwnerRole() ? `<button class="btn sm" data-action="edit-batch" data-id="${b.id}">এডিট</button>
        <button class="btn sm danger" data-action="del-batch" data-id="${b.id}">মুছুন</button>` : ''}
      </td></tr>`;
  });
  return `
    <h2>ব্যাচ</h2>
    ${isOwnerRole() ? '<div class="toolbar"><span class="spacer"></span><button class="btn primary" data-action="add-batch">+ নতুন ব্যাচ</button></div>' : ''}
    ${table(['ব্যাচের নাম', 'বিষয়', 'দায়িত্বপ্রাপ্ত শিক্ষক', 'সময়সূচি', ['মাসিক ফি', 'num'], ...(isOwnerRole() ? ['শিক্ষক পাবেন'] : []), ['স্টুডেন্ট', 'num'], ['', 'actions']], rows, 'এখনো কোনো ব্যাচ নেই')}
  `;
};

views.teachers = () => {
  const m = thisMonth();
  const activeOf = (t) => db.students.filter((s) => s.status !== 'inactive' && studentTeacherId(s) === t.id);
  const rows = db.teachers.map((t) => {
    const batches = db.batches.filter((b) => b.teacherId === t.id);
    const students = activeOf(t);
    const o2o = students.filter(isOne2One);
    const acc = teacherAccount(t.id, { month: m });
    const due = teacherAccount(t.id).balance;
    const monthClasses = classSessions().filter((c) => c.teacherId === t.id).reduce((a, c) => a + classesInMonth(c.days, m), 0);
    return `<tr><td><b>${esc(t.name)}</b><br><span class="muted">${esc(t.phone)}</span></td><td>${esc(t.subject)}</td>
      <td>${batches.map((b) => esc(b.name)).join(', ') || '—'}</td>
      <td class="num">${num(o2o.length)}</td><td class="num">${num(students.length)}</td>
      <td class="num">${num(monthClasses)}</td>
      ${isOwnerRole() ? `<td class="num">${tk(acc.earned)}</td>
      ${t.selfOwner ? '<td class="num" colspan="2"><span class="badge blue">মালিক নিজে — সম্মানী নেই</span></td>' : `<td class="num">${tk(acc.share)}</td>
      <td class="num">${due > 0 ? `<span class="badge red">${tk(due)}</span>` : tk(due)}</td>`}
      <td class="actions">
        ${t.selfOwner ? '' : `<button class="btn sm success" data-action="payout" data-id="${t.id}">পরিশোধ</button>
        <button class="btn sm" data-action="payroll-detail" data-id="${t.id}">হিসাব</button>`}
        <button class="btn sm" data-action="edit-teacher" data-id="${t.id}">এডিট</button>
        <button class="btn sm danger" data-action="del-teacher" data-id="${t.id}">মুছুন</button>
      </td>` : ''}</tr>`;
  });

  const unassigned = db.students.filter((s) => s.status !== 'inactive' && !studentTeacherId(s));
  const cards = db.teachers.map((t) => {
    const batches = db.batches.filter((b) => b.teacherId === t.id);
    const batchHtml = batches.map((b) => {
      const st = db.students.filter((s) => !isOne2One(s) && s.batchId === b.id && s.status !== 'inactive' && (!s.teacherId || s.teacherId === t.id));
      return `<li><b>${esc(b.name)}</b> <span class="muted">(${num(st.length)} জন${fmtSchedule(b) ? ' · ' + esc(fmtSchedule(b)) : ''})</span>${isOwnerRole() ? ' · ' + ruleText(t.id, payRule({ batchId: b.id })) : ''}</li>`;
    }).join('');
    const o2o = activeOf(t).filter(isOne2One).map((s) =>
      `<li>${esc(s.name)} <span class="muted">(${esc(s.course || 'ওয়ান-টু-ওয়ান')}${fmtSchedule(s) ? ' · ' + esc(fmtSchedule(s)) : ''})</span>${isOwnerRole() ? ' · ' + ruleText(t.id, payRule(s)) : ''}</li>`).join('');
    const other = activeOf(t).filter((s) => !isOne2One(s) && !batches.some((b) => b.id === s.batchId))
      .map((s) => `<li>${esc(s.name)} <span class="muted">(${esc(classLabel(s))} থেকে আলাদাভাবে)</span></li>`).join('');
    return `<div class="panel"><h3>👩‍🏫 ${esc(t.name)}</h3>
      <div class="muted">ব্যাচ</div><ul>${batchHtml || '<li class="muted">নেই</li>'}</ul>
      <div class="muted" style="margin-top:8px">ওয়ান-টু-ওয়ান</div><ul>${o2o || '<li class="muted">নেই</li>'}</ul>
      ${other ? `<div class="muted" style="margin-top:8px">অন্য ব্যাচ থেকে এসাইন করা</div><ul>${other}</ul>` : ''}</div>`;
  }).join('');

  return `
    <h2>শিক্ষক ও এসাইনমেন্ট</h2>
    ${isOwnerRole() ? '<div class="toolbar"><span class="spacer"></span><button class="btn primary" data-action="add-teacher">+ নতুন শিক্ষক</button></div>' : ''}
    ${table(['নাম', 'বিষয়', 'ব্যাচ', ['ওয়ান-টু-ওয়ান', 'num'], ['মোট স্টুডেন্ট', 'num'], ['এ মাসে ক্লাস', 'num'],
      ...(isOwnerRole() ? [['এ মাসে উপার্জন', 'num'], ['এ মাসে পাওনা', 'num'], ['মোট বাকি', 'num'], ['', 'actions']] : [])], rows, 'এখনো কোনো শিক্ষক যোগ করা হয়নি')}
    ${isOwnerRole() ? '<p class="muted">বিস্তারিত হিসাব ও পরিশোধের জন্য <a href="#payroll">💵 শিক্ষকের হিসাব</a> পেজ দেখুন।</p>' : ''}
    <h3>কোন ব্যাচ/স্টুডেন্ট কার কাছে</h3>
    <p class="muted">ব্যাচে শিক্ষক এসাইন করলে সেই ব্যাচের সব স্টুডেন্ট তাঁর কাছে যায়। ওয়ান-টু-ওয়ান স্টুডেন্টের শিক্ষক স্টুডেন্ট যোগ করার সময়ই বাছাই করা হয়।</p>
    <div class="assign-grid">${cards}</div>
    ${unassigned.length ? `<div class="note">⚠️ ${num(unassigned.length)} জন স্টুডেন্ট কোনো শিক্ষকের কাছে এসাইন করা নেই: ${unassigned.map((s) => esc(s.name)).join(', ')}</div>` : ''}
  `;
};

views.routine = () => {
  const m = thisMonth();
  const all = classSessions().filter((c) => !state.routineTeacher || c.teacherId === state.routineTeacher);
  const todayIdx = new Date().getDay();
  const blocks = WEEK_ORDER.map((d) => {
    const list = all.filter((c) => c.days.includes(d)).sort(byTime);
    return `<h3>${DAY_NAMES[d]}বার ${d === todayIdx ? '<span class="badge green">আজ</span>' : ''} <span class="muted" style="font-size:14px">(${num(list.length)}টি ক্লাস)</span></h3>
      ${table(['সময়', 'ক্লাস', 'শিক্ষক', ['', 'actions']], sessionRows(list), 'এই দিনে কোনো ক্লাস নেই')}`;
  }).join('');
  const countRows = all.sort((a, b) => a.title.localeCompare(b.title)).map((c) => `
    <tr><td><b>${esc(c.title)}</b><br><span class="muted">${esc(c.sub)}</span></td><td>${esc(teacherName(c.teacherId))}</td>
    <td>${esc(fmtSchedule(c.raw)) || '<span class="badge amber">দিন/সময় ঠিক করা নেই</span>'}</td>
    <td class="num">${c.days.length ? num(classesInMonth(c.days, m)) : '—'}</td></tr>`);
  return `
    <h2>ক্লাস রুটিন (বাংলাদেশ সময়)</h2>
    <div class="toolbar">
      <select data-filter="routineTeacher">${opts(db.teachers.map((t) => [t.id, t.name]), state.routineTeacher, 'সব শিক্ষক')}</select>
    </div>
    <p class="muted">ব্যাচ বা ওয়ান-টু-ওয়ান স্টুডেন্ট এডিট করে ক্লাসের দিন আর সময় ঠিক করলে রুটিন নিজে থেকেই তৈরি হয়। একই শিক্ষকের একই সময়ে দুটো ক্লাস পড়লে ⚠️ চিহ্ন দেখাবে।</p>
    ${blocks}
    <h3>${monthLabel(m)} — নির্ধারিত ক্লাসের সংখ্যা</h3>
    ${table(['ক্লাস', 'শিক্ষক', 'রুটিন', ['এ মাসে ক্লাস', 'num']], countRows, 'কোনো ক্লাস নেই')}
  `;
};

views.payroll = () => {
  const m = state.payMonth;
  const now = thisMonth();
  const selfIncome = db.teachers.filter((t) => t.selfOwner).reduce((a, t) => a + teacherAccount(t.id, { month: m }).earned, 0);
  const rows = payTeachers().map((t) => {
    const a = teacherAccount(t.id, { month: m });
    const due = teacherAccount(t.id, { upto: m }).balance;
    return `<tr><td><b>${esc(t.name)}</b><br><span class="muted">${esc(t.subject || '')}</span></td>
      <td class="num">${tk(a.earned)}</td><td class="num"><b>${tk(a.share)}</b></td><td class="num">${tk(a.academy)}</td>
      <td class="num">${tk(a.paid)}</td>
      <td class="num">${due > 0 ? `<span class="badge red">${tk(due)}</span>` : due < 0 ? `<span class="badge amber">অগ্রিম ${tk(-due)}</span>` : '<span class="badge green">পরিশোধিত</span>'}</td>
      <td class="actions">
        <button class="btn sm success" data-action="payout" data-id="${t.id}">পরিশোধ করুন</button>
        <button class="btn sm" data-action="payroll-detail" data-id="${t.id}">বিস্তারিত</button>
      </td></tr>`;
  });
  const tot = payTeachers().reduce((acc, t) => {
    const a = teacherAccount(t.id, { month: m });
    acc.e += a.earned; acc.s += a.share; acc.p += a.paid; acc.d += teacherAccount(t.id, { upto: m }).balance;
    return acc;
  }, { e: 0, s: 0, p: 0, d: 0 });

  let detail = '';
  const t = byId(payTeachers(), state.payTeacher);
  if (t) {
    const a = teacherAccount(t.id, { month: m });
    const dueTotal = teacherAccount(t.id, { upto: m }).balance;
    // উৎস অনুযায়ী (ব্যাচ / ওয়ান-টু-ওয়ান স্টুডেন্ট)
    const groups = {};
    for (const p of a.pays) {
      const st = byId(db.students, p.studentId);
      const key = !st ? 'deleted' : isOne2One(st) ? 's' + st.id : 'b' + (st.batchId || '-');
      const label = !st ? '(মুছে ফেলা স্টুডেন্ট)' : isOne2One(st) ? `ওয়ান-টু-ওয়ান: ${st.name}` : `ব্যাচ: ${batchName(st.batchId)}`;
      const g = (groups[key] ||= { label, rule: st ? ruleText(studentTeacherId(st), payRule(st)) : '—', n: new Set(), earned: 0, share: 0 });
      g.n.add(p.studentId); g.earned += Number(p.amount); g.share += paymentShare(p);
    }
    const srcRows = Object.values(groups).sort((x, y) => y.share - x.share).map((g) => `
      <tr><td>${esc(g.label)}</td><td>${g.rule}</td><td class="num">${num(g.n.size)}</td><td class="num">${tk(g.earned)}</td><td class="num"><b>${tk(g.share)}</b></td></tr>`);
    const payRows = a.pays.slice().sort((x, y) => (x.date < y.date ? 1 : -1)).map((p) => `
      <tr><td>${fmtDate(p.date)}</td><td>${esc(studentName(p.studentId))}</td><td>${monthLabel(p.month)}</td>
      <td class="num">${tk(p.amount)}</td><td class="num">${tk(paymentShare(p))}</td></tr>`);
    const outRows = db.teacherPayouts.filter((o) => o.teacherId === t.id).sort((x, y) => (x.date < y.date ? 1 : -1)).map((o) => `
      <tr><td>${fmtDate(o.date)}</td><td>${esc(o.method || '')}</td><td>${esc(o.note || '')}</td><td class="num">${tk(o.amount)}</td>
      <td class="actions"><button class="btn sm" data-action="payout-slip" data-id="${o.id}">স্লিপ</button>
      <button class="btn sm danger" data-action="del-payout" data-id="${o.id}">মুছুন</button></td></tr>`);
    // মাসভিত্তিক বিবরণী (শেষ ১২ মাস)
    const stmt = monthsBetween(shiftMonth(now, -11), now).reverse().map((mm) => {
      const x = teacherAccount(t.id, { month: mm });
      if (!x.earned && !x.paid) return '';
      return `<tr><td>${monthLabel(mm)}</td><td class="num">${tk(x.earned)}</td><td class="num">${tk(x.share)}</td><td class="num">${tk(x.paid)}</td>
        <td class="num"><b>${tk(teacherAccount(t.id, { upto: mm }).balance)}</b></td></tr>`;
    }).filter(Boolean);
    const phone = intlPhone(t.phone);
    const wa = phone ? `<a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/${phone}?text=${encodeURIComponent(teacherStatementText(t, m))}">WhatsApp-এ হিসাব পাঠান</a>` : '';
    detail = `
      <div class="panel" id="payroll-detail">
        <div class="toolbar"><h3 style="margin:0">👩‍🏫 ${esc(t.name)} — ${monthLabel(m)}</h3><span class="spacer"></span>
          <button class="btn success" data-action="payout" data-id="${t.id}">পরিশোধ করুন</button> ${wa}</div>
        <div class="cards" style="margin-bottom:0">
          ${card('তাঁর মাধ্যমে উপার্জন', tk(a.earned), 'blue')}
          ${card('তাঁর পাওনা (এ মাসে)', tk(a.share), 'green')}
          ${card('একাডেমির অংশ', tk(a.academy))}
          ${card('এ মাসে পরিশোধ', tk(a.paid))}
          ${card(`মোট বাকি (${monthLabel(m)} পর্যন্ত)`, dueTotal < 0 ? 'অগ্রিম ' + tk(-dueTotal) : tk(dueTotal), dueTotal > 0 ? 'red' : 'green')}
        </div>
      </div>
      <h3>কোন ব্যাচ/স্টুডেন্ট থেকে কত</h3>
      ${table(['ব্যাচ / স্টুডেন্ট', 'শিক্ষকের অংশের নিয়ম', ['স্টুডেন্ট', 'num'], ['ফি আদায়', 'num'], ['শিক্ষকের পাওনা', 'num']], srcRows, 'এই মাসে এই শিক্ষকের কোনো স্টুডেন্টের ফি আসেনি')}
      <h3>এ মাসে আসা ফি (বিস্তারিত)</h3>
      ${table(['জমার তারিখ', 'স্টুডেন্ট', 'কোন মাসের ফি', ['ফি', 'num'], ['শিক্ষকের অংশ', 'num']], payRows, 'কোনো ফি আসেনি')}
      <h3>মাসভিত্তিক বিবরণী</h3>
      ${table(['মাস', ['উপার্জন', 'num'], ['পাওনা', 'num'], ['পরিশোধ', 'num'], ['মোট বাকি', 'num']], stmt, 'এখনো কোনো হিসাব নেই')}
      <h3>সব পরিশোধ</h3>
      ${table(['তারিখ', 'মাধ্যম', 'নোট', ['টাকা', 'num'], ['', 'actions']], outRows, 'এখনো কোনো পরিশোধ করা হয়নি')}`;
  }

  return `
    <h2>শিক্ষকের হিসাব ও পরিশোধ</h2>
    <div class="toolbar">
      <label>মাস: <input type="month" data-filter="payMonth" value="${m}"></label>
      <select data-filter="payTeacher">${opts(payTeachers().map((x) => [x.id, x.name]), state.payTeacher, '— শিক্ষক বাছাই করে বিস্তারিত দেখুন —')}</select>
      <span class="spacer"></span>
      <button class="btn" data-action="recalc-shares">🔄 এ মাসের পাওনা নতুন নিয়মে হিসাব করুন</button>
    </div>
    <p class="muted"><b>উপার্জন</b> = শিক্ষকের স্টুডেন্টদের কাছ থেকে এ মাসে আসা ফি। <b>পাওনা</b> = এর মধ্যে শিক্ষকের অংশ (ব্যাচ বা ওয়ান-টু-ওয়ানে ঠিক করা নিয়ম অনুযায়ী)।
    স্টুডেন্ট ফি দিলে তবেই শিক্ষকের পাওনা যোগ হয়। <b>মোট বাকি</b>-তে আগের মাসের বাকিও ধরা আছে।</p>
    <div class="cards">
      ${card('শিক্ষকদের মাধ্যমে উপার্জন', tk(tot.e), 'blue')}
      ${card('শিক্ষকদের পাওনা (এ মাসে)', tk(tot.s), 'green')}
      ${card('একাডেমির অংশ', tk(tot.e - tot.s))}
      ${card('এ মাসে পরিশোধ', tk(tot.p))}
      ${card('শিক্ষকদের মোট বাকি', tk(tot.d), tot.d > 0 ? 'red' : '')}
      ${db.teachers.some((x) => x.selfOwner) ? card('আপনার নিজের ক্লাস থেকে আয়', tk(selfIncome), 'blue') : ''}
    </div>
    ${table(['শিক্ষক', ['উপার্জন', 'num'], ['পাওনা', 'num'], ['একাডেমির অংশ', 'num'], ['পরিশোধ', 'num'], ['মোট বাকি', 'num'], ['', 'actions']], rows, 'এখনো কোনো শিক্ষক যোগ করা হয়নি')}
    ${detail}
  `;
};

function teacherStatementText(t, m) {
  const a = teacherAccount(t.id, { month: m });
  const due = teacherAccount(t.id, { upto: m }).balance;
  return `আসসালামু আলাইকুম, ${t.name}।\n${db.settings.academyName} — ${monthLabel(m)} মাসের হিসাব:\n` +
    `• আপনার স্টুডেন্টদের ফি আদায়: ${num(a.earned)} টাকা\n• আপনার পাওনা: ${num(a.share)} টাকা\n• এ মাসে পরিশোধ: ${num(a.paid)} টাকা\n` +
    `• মোট বাকি: ${due < 0 ? 'অগ্রিম ' + num(-due) : num(due)} টাকা\nজাযাকাল্লাহু খাইরান।`;
}

/* ---------- স্টাফ ও সম্মানী (শুধু মালিক) ---------- */
views.staff = () => {
  const m = state.staffMonth;
  const rows = db.staff.map((st) => {
    const a = staffAccount(st.id, { month: m });
    const due = staffAccount(st.id, { upto: m }).balance;
    return `<tr><td><b>${esc(st.name)}</b><br><span class="muted">${esc(st.designation || '')}${st.status === 'inactive' ? ' · নিষ্ক্রিয়' : ''}</span></td>
      <td class="num">${tk(a.salary)}</td><td class="num">${tk(a.commission)}</td><td class="num">${a.bonus ? tk(a.bonus) : '—'}</td><td class="num">${a.deduction ? '−' + tk(a.deduction) : '—'}</td>
      <td class="num"><b>${tk(a.earned)}</b></td><td class="num">${tk(a.paid)}</td>
      <td class="num">${due > 0 ? `<span class="badge red">${tk(due)}</span>` : due < 0 ? `<span class="badge amber">অগ্রিম ${tk(-due)}</span>` : '<span class="badge green">পরিশোধিত</span>'}</td>
      <td class="actions">
        <button class="btn sm success" data-action="staff-pay" data-id="${st.id}">পরিশোধ</button>
        <button class="btn sm" data-action="staff-detail" data-id="${st.id}">বিস্তারিত</button>
      </td></tr>`;
  });
  const tot = db.staff.reduce((acc, st) => {
    const a = staffAccount(st.id, { month: m });
    acc.e += a.earned; acc.p += a.paid; acc.d += staffAccount(st.id, { upto: m }).balance;
    return acc;
  }, { e: 0, p: 0, d: 0 });

  let detail = '';
  const st = byId(db.staff, state.staffSel);
  if (st) {
    const a = staffAccount(st.id, { month: m });
    const dueTotal = staffAccount(st.id, { upto: m }).balance;
    const all = staffAccount(st.id);
    const commRows = all.comms.sort((x, y) => (String(x.date || '9') < String(y.date || '9') ? 1 : -1)).map((x) => `
      <tr><td>${esc(x.student?.name || '(মুছে ফেলা স্টুডেন্ট)')}</td><td>${fmtComm(x.c)}</td><td class="num">${tk(x.amount)}</td>
      <td>${x.accrued ? `<span class="badge green">পাওনা — ${fmtDate(x.date)}</span>` : '<span class="badge amber">প্রথম ফি-এর অপেক্ষায়</span>'}</td></tr>`);
    const entryRows = db.staffEntries.filter((e) => e.staffId === st.id).sort((x, y) => (x.date < y.date ? 1 : -1)).map((e) => `
      <tr><td>${fmtDate(e.date)}</td><td>${e.kind === 'bonus' ? '<span class="badge green">বোনাস</span>' : '<span class="badge red">কর্তন</span>'}</td>
      <td>${esc(e.note || '')}</td><td class="num">${e.kind === 'bonus' ? '' : '−'}${tk(e.amount)}</td>
      <td class="actions"><button class="btn sm danger" data-action="del-staff-entry" data-id="${e.id}">মুছুন</button></td></tr>`);
    const outRows = db.staffPayouts.filter((o) => o.staffId === st.id).sort((x, y) => (x.date < y.date ? 1 : -1)).map((o) => `
      <tr><td>${fmtDate(o.date)}</td><td>${esc(o.method || '')}</td><td>${esc(o.note || '')}</td><td class="num">${tk(o.amount)}</td>
      <td class="actions"><button class="btn sm" data-action="staff-slip" data-id="${o.id}">স্লিপ</button>
      <button class="btn sm danger" data-action="del-staff-payout" data-id="${o.id}">মুছুন</button></td></tr>`);
    const now = thisMonth();
    const stmt = monthsBetween(shiftMonth(now, -11), now).reverse().map((mm) => {
      const x = staffAccount(st.id, { month: mm });
      if (!x.earned && !x.paid) return '';
      return `<tr><td>${monthLabel(mm)}</td><td class="num">${tk(x.salary)}</td><td class="num">${tk(x.commission)}</td>
        <td class="num">${tk(x.bonus - x.deduction)}</td><td class="num">${tk(x.paid)}</td><td class="num"><b>${tk(staffAccount(st.id, { upto: mm }).balance)}</b></td></tr>`;
    }).filter(Boolean);
    const salHist = (st.salaryHistory || []).slice().sort((x, y) => (x.from < y.from ? 1 : -1)).map((h) => `${monthLabel(h.from)} থেকে ${tk(h.amount)}`).join(' · ');
    detail = `
      <div class="panel" id="staff-detail">
        <div class="toolbar"><h3 style="margin:0">👤 ${esc(st.name)} — ${esc(st.designation || '')}</h3><span class="spacer"></span>
          <button class="btn success" data-action="staff-pay" data-id="${st.id}">পরিশোধ করুন</button>
          <button class="btn" data-action="staff-bonus" data-id="${st.id}">+ বোনাস</button>
          <button class="btn" data-action="staff-deduction" data-id="${st.id}">− কর্তন</button>
          <button class="btn" data-action="edit-staff" data-id="${st.id}">এডিট</button>
          <button class="btn danger" data-action="del-staff" data-id="${st.id}">মুছুন</button></div>
        <p class="muted">মাসিক সম্মানী: ${salHist || '—'}<br>ভর্তি কমিশনের নিয়ম: ${fmtComm({ type: st.commType, value: st.commValue })}<br>
        পেমেন্টের তথ্য: ${esc(payInfoText(st)) || 'দেওয়া নেই'}</p>
        <div class="cards" style="margin-bottom:0">
          ${card(`${monthLabel(m)}-এ সম্মানী`, tk(a.salary))}
          ${card('ভর্তি কমিশন', tk(a.commission), 'blue')}
          ${card('বোনাস − কর্তন', tk(a.bonus - a.deduction))}
          ${card('এ মাসে মোট পাওনা', tk(a.earned), 'green')}
          ${card('এ মাসে পরিশোধ', tk(a.paid))}
          ${card(`মোট বাকি (${monthLabel(m)} পর্যন্ত)`, dueTotal < 0 ? 'অগ্রিম ' + tk(-dueTotal) : tk(dueTotal), dueTotal > 0 ? 'red' : 'green')}
        </div>
      </div>
      <h3>মাসভিত্তিক বিবরণী</h3>
      ${table(['মাস', ['সম্মানী', 'num'], ['কমিশন', 'num'], ['বোনাস − কর্তন', 'num'], ['পরিশোধ', 'num'], ['মোট বাকি', 'num']], stmt, 'এখনো কোনো হিসাব নেই')}
      <h3>ভর্তি কমিশন</h3>
      ${table(['স্টুডেন্ট', 'নিয়ম', ['কমিশন', 'num'], 'অবস্থা'], commRows, 'এই স্টাফের মাধ্যমে এখনো কোনো ভর্তি নেই')}
      <h3>বোনাস ও কর্তন</h3>
      ${table(['তারিখ', 'ধরন', 'কারণ', ['টাকা', 'num'], ['', 'actions']], entryRows, 'নেই')}
      <h3>সব পরিশোধ</h3>
      ${table(['তারিখ', 'মাধ্যম', 'নোট', ['টাকা', 'num'], ['', 'actions']], outRows, 'এখনো কোনো পরিশোধ করা হয়নি')}`;
  }

  return `
    <h2>স্টাফ ও সম্মানী</h2>
    <div class="toolbar">
      <label>মাস: <input type="month" data-filter="staffMonth" value="${m}"></label>
      <select data-filter="staffSel">${opts(db.staff.map((x) => [x.id, x.name]), state.staffSel, '— স্টাফ বাছাই করে বিস্তারিত দেখুন —')}</select>
      <span class="spacer"></span>
      <button class="btn primary" data-action="add-staff">+ নতুন স্টাফ</button>
    </div>
    <p class="muted"><b>পাওনা</b> = মাসিক সম্মানী + ভর্তি কমিশন + বোনাস − কর্তন। কমিশন পাওনা হয় স্টুডেন্টের <b>প্রথম ফি আসার দিন</b>। <b>মোট বাকি</b>-তে আগের মাসের বাকিও ধরা আছে।</p>
    <div class="cards">
      ${card('এ মাসে স্টাফদের পাওনা', tk(tot.e), 'green')}
      ${card('এ মাসে পরিশোধ', tk(tot.p))}
      ${card('স্টাফদের মোট বাকি', tk(tot.d), tot.d > 0 ? 'red' : '')}
    </div>
    ${table(['স্টাফ', ['সম্মানী', 'num'], ['কমিশন', 'num'], ['বোনাস', 'num'], ['কর্তন', 'num'], ['মোট পাওনা', 'num'], ['পরিশোধ', 'num'], ['মোট বাকি', 'num'], ['', 'actions']], rows, 'এখনো কোনো স্টাফ যোগ করা হয়নি')}
    ${detail}
  `;
};

function staffForm(st) {
  openForm({
    title: st ? 'স্টাফ এডিট' : 'নতুন স্টাফ',
    values: st ? { ...st, salary: salaryFor(st, thisMonth()) } : { joinDate: today(), status: 'active', commType: 'none' },
    fields: [
      { name: 'name', label: 'নাম', required: true },
      { name: 'designation', label: 'পদ (যেমন: পেজ মডারেটর, কো-অর্ডিনেটর)' },
      { name: 'phone', label: 'মোবাইল/WhatsApp', type: 'tel' },
      { name: 'joinDate', label: 'যোগদানের তারিখ (এই মাস থেকে সম্মানী পাওনা)', type: 'date', required: true },
      { name: 'salary', label: st ? 'মাসিক সম্মানী (বদলালে এই মাস থেকে নতুন অঙ্ক)' : 'মাসিক সম্মানী', type: 'number' },
      { name: 'commType', label: 'ভর্তি কমিশনের ডিফল্ট নিয়ম', type: 'select', options: COMM_TYPES },
      { name: 'commValue', label: 'কমিশন (টাকা বা শতাংশ)', type: 'number' },
      { name: 'status', label: 'অবস্থা', type: 'select', options: [['active', 'কর্মরত'], ['inactive', 'চলে গেছেন']] },
      { name: 'leftDate', label: 'চলে যাওয়ার তারিখ (সেই মাস পর্যন্ত সম্মানী)', type: 'date', showIf: ['status', ['inactive']] },
      ...PAYINFO_FIELDS,
      { name: 'note', label: 'নোট', type: 'textarea' },
    ],
    onSubmit: (v) => {
      if (v.commType === 'percent' && v.commValue > 100) { alert('শতাংশ ১০০-এর বেশি হতে পারে না'); return false; }
      const { salary, ...rest } = v;
      let hist = (st?.salaryHistory || []).slice();
      const joinM = v.joinDate.slice(0, 7);
      if (!st) hist = [{ from: joinM, amount: Number(salary) || 0 }];
      else if (salaryFor(st, thisMonth()) !== Number(salary)) {
        const from = thisMonth() < joinM ? joinM : thisMonth();
        hist = hist.filter((h) => h.from !== from).concat({ from, amount: Number(salary) || 0 });
      }
      if (st && hist.length && hist.every((h) => h.from > joinM)) hist.push({ from: joinM, amount: hist.sort((x, y) => (x.from < y.from ? -1 : 1))[0].amount });
      if (rest.status !== 'inactive') rest.leftDate = '';
      put('staff', { ...(st || {}), ...rest, salaryHistory: hist, id: st?.id }, `${v.name} — সম্মানী ${tk(salary)}`);
      toast('স্টাফ সেভ হয়েছে');
    },
  });
}

function staffEntryForm(staffId, kind) {
  openForm({
    title: `${staffName(staffId)} — ${kind === 'bonus' ? 'বোনাস' : 'কর্তন'}`,
    values: { date: today() },
    fields: [
      { name: 'amount', label: 'টাকার পরিমাণ', type: 'number', required: true },
      { name: 'date', label: 'তারিখ', type: 'date', required: true },
      { name: 'note', label: 'কারণ', required: true },
    ],
    onSubmit: (v) => {
      if (!(v.amount > 0)) { alert('সঠিক টাকার পরিমাণ লিখুন'); return false; }
      put('staffEntries', { ...v, staffId, kind }, `${staffName(staffId)} — ${kind === 'bonus' ? 'বোনাস' : 'কর্তন'} ${tk(v.amount)}`);
      state.staffSel = staffId;
      toast('সেভ হয়েছে');
    },
  });
}

function staffPayForm(staffId) {
  if (!db.staff.length) return toast('আগে স্টাফ যোগ করুন');
  const due = staffId ? staffAccount(staffId).balance : 0;
  const st = byId(db.staff, staffId);
  openForm({
    title: 'স্টাফকে পরিশোধ',
    submitLabel: 'পরিশোধ করুন',
    values: { staffId: staffId || '', amount: due > 0 ? due : '', date: today(), method: PAY_METHODS[0], note: `${monthLabel(thisMonth())}-এর সম্মানী` },
    fields: [
      { name: 'staffId', label: 'স্টাফ', type: 'select', required: true, options: db.staff.map((x) => [x.id, `${x.name} — বাকি ${tk(staffAccount(x.id).balance)}`]), placeholder: '— বাছাই করুন —' },
      ...(st ? [{ name: 'payinfo', type: 'info', label: 'পেমেন্টের তথ্য', text: payInfoText(st) || 'দেওয়া নেই' }] : []),
      { name: 'amount', label: 'টাকার পরিমাণ (আংশিকও দেওয়া যাবে)', type: 'number', required: true },
      { name: 'date', label: 'তারিখ', type: 'date', required: true },
      { name: 'method', label: 'মাধ্যম', type: 'select', options: PAY_METHODS.map((x) => [x, x]) },
      { name: 'note', label: 'নোট (যেমন: অক্টোবরের সম্মানী, TrxID)' },
    ],
    onSubmit: (v) => {
      if (!(v.amount > 0)) { alert('সঠিক টাকার পরিমাণ লিখুন'); return false; }
      const bal = staffAccount(v.staffId).balance;
      if (v.amount > bal && !confirm(`বাকি ${tk(Math.max(0, bal))}। ${tk(v.amount)} দিলে বাড়তি টাকা অগ্রিম হিসেবে থাকবে। ঠিক আছে?`)) return false;
      const { payinfo, ...o } = v;
      put('staffPayouts', o, `${staffName(v.staffId)} — ${tk(v.amount)}`);
      state.staffSel = v.staffId;
      toast(`${staffName(v.staffId)}-কে ${tk(v.amount)} পরিশোধ হয়েছে`);
    },
  });
}

/* ---------- শিক্ষকের পোর্টাল ----------
 * শিক্ষক শুধু teacherView (নিজের ক্লাস ও স্টুডেন্টের নাম/সময়/লিংক/ফলাফল),
 * teacherStatements (নিজের হিসাবের সারাংশ) আর নিজের পেমেন্টের তথ্য পড়তে পারেন।
 */
const myViews = (kind) => db.teacherView.filter((v) => v.kind === kind);

function viewSessions() {
  // ব্যাচ একটা ক্লাস; ওয়ান-টু-ওয়ান স্টুডেন্ট প্রত্যেকে আলাদা ক্লাস
  const out = myViews('batch').map((b) => ({ title: b.name, sub: `ব্যাচ · ${num(b.count)} জন`, days: b.days || [], time: b.time, link: b.link }));
  for (const st of myViews('student')) if (st.one2one) out.push({ title: st.name, sub: st.classLabel, days: st.days || [], time: st.time, link: st.link });
  return out;
}

const sessionRowsSimple = (list) => list.map((c) => `<tr><td><b>${fmtTime(c.time) || '—'}</b></td><td><b>${esc(c.title)}</b><br><span class="muted">${esc(c.sub)}</span></td>
  <td class="actions">${c.link ? `<a class="btn sm primary" target="_blank" rel="noopener" href="${esc(c.link)}">ক্লাসে যান</a>` : '<span class="muted">লিংক নেই</span>'}</td></tr>`);

views['t-classes'] = () => {
  const all = viewSessions();
  const todayIdx = new Date().getDay();
  const todays = all.filter((c) => c.days.includes(todayIdx)).sort(byTime);
  const week = WEEK_ORDER.map((d) => {
    const list = all.filter((c) => c.days.includes(d)).sort(byTime);
    if (!list.length) return '';
    return `<h3>${DAY_NAMES[d]}বার ${d === todayIdx ? '<span class="badge green">আজ</span>' : ''}</h3>${table(['সময়', 'ক্লাস', ['', 'actions']], sessionRowsSimple(list))}`;
  }).join('');
  const name = db.teachers[0]?.name || me.name;
  return `
    <h2>আসসালামু আলাইকুম, ${esc(name)}</h2>
    <h3>📅 আজকের ক্লাস — ${DAY_NAMES[todayIdx]}বার, ${fmtDate(today())}</h3>
    ${table(['সময়', 'ক্লাস', ['', 'actions']], sessionRowsSimple(todays), 'আজ কোনো ক্লাস নেই')}
    <h3>এ মাসে মোট নির্ধারিত ক্লাস: ${num(all.reduce((a, c) => a + classesInMonth(c.days, thisMonth()), 0))}টি</h3>
    ${week || '<div class="empty">এখনো কোনো ক্লাসের রুটিন ঠিক করা হয়নি</div>'}`;
};

views['t-students'] = () => {
  const list = myViews('student').sort((a, b) => a.name.localeCompare(b.name));
  const sel = list.find((x) => x.id === state.tStudent);
  const rows = list.map((st) => {
    const ex = st.exams || [];
    const avg = ex.length ? ex.reduce((a, e) => a + pctOf(e), 0) / ex.length : null;
    const [g, gc] = avg === null ? ['—', 'gray'] : grade(avg);
    return `<tr><td><b>${esc(st.name)}</b>${st.roll ? `<br><span class="muted">${esc(st.roll)}</span>` : ''}</td><td>${esc(st.classLabel)}</td>
      <td>${esc(fmtSchedule(st))}</td><td class="num">${num(ex.length)}</td><td>${avg === null ? '—' : `${num(Math.round(avg))}% <span class="badge ${gc}">${g}</span>`}</td>
      <td class="actions">${st.link ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(st.link)}">ক্লাস লিংক</a>` : ''}
      <button class="btn sm" data-action="t-student" data-id="${st.id}">ফলাফল</button></td></tr>`;
  });
  let detail = '';
  if (sel) {
    let prev = null;
    const ex = (sel.exams || []).map((e) => {
      const p = pctOf(e);
      const [g, gc] = grade(p);
      const trend = prev === null ? '' : p > prev ? '<span class="up">▲</span>' : p < prev ? '<span class="down">▼</span>' : '＝';
      prev = p;
      return `<tr><td>${fmtDate(e.date)}</td><td>${esc(e.title)}</td><td>${esc(e.subject)}</td><td class="num">${num(e.marks)} / ${num(e.total)}</td>
        <td>${num(Math.round(p))}% ${trend}</td><td><span class="badge ${gc}">${g}</span></td><td>${esc(e.remark)}</td></tr>`;
    }).reverse();
    detail = `<div class="panel" id="t-student-detail"><h3>${esc(sel.name)} — ${esc(sel.classLabel)}</h3>
      ${table(['তারিখ', 'পরীক্ষা', 'বিষয়', ['নম্বর', 'num'], 'শতকরা', 'গ্রেড', 'মন্তব্য'], ex, 'এখনো কোনো ফলাফল নেই')}</div>`;
  }
  return `
    <h2>আমার স্টুডেন্ট (${num(list.length)} জন)</h2>
    <p class="muted">পরীক্ষার নম্বর অ্যাডমিন বা মালিক তোলেন। কোনো তথ্য ভুল থাকলে তাঁদের জানান।</p>
    ${table(['নাম', 'ব্যাচ / ধরন', 'ক্লাসের সময়', ['পরীক্ষা', 'num'], 'গড়', ['', 'actions']], rows, 'আপনার কাছে এখনো কোনো স্টুডেন্ট এসাইন করা নেই')}
    ${detail}`;
};

views['t-account'] = () => {
  const stmt = db.teacherStatements[0];
  if (!stmt) return '<h2>আমার হিসাব</h2><div class="empty">এখনো কোনো হিসাব তৈরি হয়নি। মালিক অ্যাপ খুললে হিসাব হালনাগাদ হয়।</div>';
  const months = Object.keys(stmt.months || {}).sort().reverse();
  let running = stmt.balance;
  const rows = months.slice(0, 12).map((m) => {
    const x = stmt.months[m];
    const row = `<tr><td>${monthLabel(m)}</td><td class="num">${tk(x.share)}</td><td class="num">${tk(x.paid)}</td><td class="num"><b>${tk(running)}</b></td></tr>`;
    running -= x.share - x.paid;
    return row;
  });
  const cur = stmt.months[thisMonth()] || { share: 0, paid: 0 };
  const outRows = (stmt.payouts || []).map((o) => `<tr><td>${fmtDate(o.date)}</td><td>${esc(o.method)}</td><td>${esc(o.note)}</td><td class="num">${tk(o.amount)}</td></tr>`);
  return `
    <h2>আমার হিসাব</h2>
    <div class="cards">
      ${card('এ মাসে আমার পাওনা', tk(cur.share), 'green')}
      ${card('এ মাসে পেয়েছি', tk(cur.paid))}
      ${card('মোট বাকি', stmt.balance < 0 ? 'অগ্রিম ' + tk(-stmt.balance) : tk(stmt.balance), stmt.balance > 0 ? 'red' : 'green')}
    </div>
    <p class="muted">স্টুডেন্ট ফি দিলে তবেই আপনার অংশ পাওনায় যোগ হয়। হিসাব মালিকের অ্যাপ থেকে হালনাগাদ হয়।</p>
    <h3>মাসভিত্তিক বিবরণী</h3>
    ${table(['মাস', ['পাওনা', 'num'], ['পেয়েছি', 'num'], ['মোট বাকি', 'num']], rows, 'এখনো কোনো হিসাব নেই')}
    <h3>পেমেন্টের তালিকা</h3>
    ${table(['তারিখ', 'মাধ্যম', 'নোট', ['টাকা', 'num']], outRows, 'এখনো কোনো পেমেন্ট নেই')}`;
};

views['t-info'] = () => {
  const t = db.teachers[0] || {};
  const priv = byId(db.teacherPrivate, me.teacherId) || {};
  return `
    <h2>আমার তথ্য</h2>
    <div class="panel">
      <h3>${esc(t.name || me.name)}</h3>
      <p class="muted">${esc(t.subject || '')}${t.phone ? ' · ' + esc(t.phone) : ''}<br>${esc(me.email)}</p>
      <p class="muted">নাম বা ফোন নম্বর বদলাতে হলে একাডেমিকে জানান।</p>
    </div>
    <div class="panel">
      <h3>💳 পেমেন্টের তথ্য</h3>
      <p>একাডেমি এই তথ্য দেখে আপনাকে সম্মানী পাঠাবে। এটা শুধু আপনি আর একাডেমির মালিক দেখতে পারেন।</p>
      <p><b>${esc(payInfoText(priv)) || 'এখনো দেওয়া হয়নি'}</b></p>
      <button class="btn primary" data-action="t-edit-info">✏️ আপডেট করুন</button>
    </div>
    <button class="btn" data-action="logout">লগআউট</button>`;
};

views.fees = () => {
  const m = state.feeMonth;
  const list = db.students.filter((s) => s.status !== 'inactive' && Number(s.monthlyFee) > 0 &&
    (s.admissionDate || '').slice(0, 7) <= m && matchClass(s, state.feeBatch));
  let expected = 0, collected = 0;
  const rows = list.map((s) => {
    const fee = Number(s.monthlyFee);
    const paid = paidFor(s.id, m);
    const due = Math.max(0, fee - paid);
    expected += fee; collected += Math.min(paid, fee);
    const status = due === 0 ? '<span class="badge green">পরিশোধিত</span>' : paid > 0 ? '<span class="badge amber">আংশিক</span>' : '<span class="badge red">বাকি</span>';
    const allDue = studentDues(s);
    return `<tr><td><b>${esc(s.name)}</b><br><span class="muted">${esc(classLabel(s))}</span></td>
      <td class="num">${tk(fee)}</td><td class="num">${tk(paid)}</td><td class="num">${tk(due)}</td><td>${status}</td>
      <td class="num">${allDue.length ? tk(sum(allDue, 'due')) + `<br><span class="muted">${num(allDue.length)} মাস</span>` : '—'}</td>
      <td class="actions">
        ${due > 0 ? `<button class="btn sm success" data-action="pay" data-id="${s.id}" data-month="${m}">ফি নিন</button>` : ''}
        ${allDue.length ? reminderButtons(s, allDue) : ''}
      </td></tr>`;
  });

  const payRows = db.payments.filter((p) => p.month === m).sort((a, b) => (a.date < b.date ? 1 : -1)).map((p) => `
    <tr><td>${fmtDate(p.date)}</td><td>${esc(studentName(p.studentId))}</td><td>${esc(p.method)}</td><td class="num">${tk(p.amount)}</td>
    <td class="actions"><button class="btn sm" data-action="receipt" data-id="${p.id}">রসিদ</button>
    <button class="btn sm" data-action="edit-payment" data-id="${p.id}">এডিট</button>
    ${isOwnerRole() ? `<button class="btn sm danger" data-action="del-payment" data-id="${p.id}">মুছুন</button>` : ''}</td></tr>`);

  return `
    <h2>ফি ও রিমাইন্ডার</h2>
    <div class="toolbar">
      <label>মাস: <input type="month" data-filter="feeMonth" value="${m}"></label>
      <select data-filter="feeBatch">${opts(classFilterOpts(), state.feeBatch, 'সব ব্যাচ ও ওয়ান-টু-ওয়ান')}</select>
      <span class="spacer"></span>
      <button class="btn primary" data-action="pay">+ ফি জমা নিন</button>
    </div>
    <div class="cards">
      ${card(`${monthLabel(m)} — মোট পাওনা`, tk(expected), 'blue')}
      ${card('আদায় হয়েছে', tk(collected), 'green')}
      ${card('বাকি', tk(expected - collected), 'red')}
    </div>
    <p class="muted">WhatsApp/SMS বাটনে চাপ দিলে অভিভাবকের নম্বরে বকেয়ার বিস্তারিতসহ মেসেজ তৈরি হয়ে যাবে — শুধু "Send" চাপবেন। মেসেজের ভাষা সেটিংস থেকে বদলাতে পারবেন।</p>
    ${table(['স্টুডেন্ট', ['মাসিক ফি', 'num'], ['জমা', 'num'], ['এ মাসে বাকি', 'num'], 'অবস্থা', ['সব মিলিয়ে বকেয়া', 'num'], ['', 'actions']], rows, 'এই মাসে কোনো সক্রিয় স্টুডেন্ট নেই')}
    <h3>${monthLabel(m)} মাসের ফি জমার তালিকা</h3>
    ${table(['জমার তারিখ', 'স্টুডেন্ট', 'মাধ্যম', ['টাকা', 'num'], ['', 'actions']], payRows, 'এই মাসের কোনো ফি জমা হয়নি')}
  `;
};

views.accounts = () => {
  const m = state.accMonth;
  const rows = ledger(m);
  const t = monthTotals(m);
  const trs = rows.map((r) => `
    <tr><td>${fmtDate(r.date)}</td><td>${r.type === 'income' ? '<span class="badge green">আয়</span>' : '<span class="badge red">ব্যয়</span>'}</td>
    <td>${esc(r.category)}</td><td>${esc(r.note)}</td>
    <td class="num ${r.type === 'income' ? 'up' : 'down'}">${tk(r.amount)}</td>
    <td class="actions">${r.kind === 'income' || r.kind === 'expense'
      ? `<button class="btn sm" data-action="edit-txn" data-kind="${r.kind}" data-id="${r.id}">এডিট</button>${isOwnerRole() ? ` <button class="btn sm danger" data-action="del-txn" data-kind="${r.kind}" data-id="${r.id}">মুছুন</button>` : ''}`
      : r.kind === 'payout' ? `<button class="btn sm" data-action="payout-slip" data-id="${r.id}">স্লিপ</button>${isOwnerRole() ? ` <button class="btn sm danger" data-action="del-payout" data-id="${r.id}">মুছুন</button>` : ''}`
      : r.kind === 'staffPayout' ? `<button class="btn sm" data-action="staff-slip" data-id="${r.id}">স্লিপ</button>${isOwnerRole() ? ` <button class="btn sm danger" data-action="del-staff-payout" data-id="${r.id}">মুছুন</button>` : ''}`
      : `<button class="btn sm" data-action="receipt" data-id="${r.id}">রসিদ</button>`}</td></tr>`);

  return `
    <h2>${isOwnerRole() ? 'আয়-ব্যয়' : 'আয়'}</h2>
    <div class="toolbar">
      <label>মাস: <input type="month" data-filter="accMonth" value="${m}"></label>
      <span class="spacer"></span>
      <button class="btn success" data-action="add-income">+ আয় যোগ</button>
      ${isOwnerRole() ? '<button class="btn primary" data-action="add-expense">+ ব্যয় যোগ</button>' : ''}
    </div>
    <div class="cards">
      ${card('মোট আয়', tk(t.income), 'green')}
      ${isOwnerRole() ? card('মোট ব্যয়', tk(t.expense), 'red') + card('লাভ/ক্ষতি', tk(t.net), t.net >= 0 ? 'green' : 'red') : ''}
    </div>
    <p class="muted">স্টুডেন্টদের ফি জমা নিলে সেটা নিজে থেকেই আয় হিসেবে এখানে চলে আসে।${isOwnerRole() ? ' শিক্ষক বা স্টাফকে "💵 শিক্ষকের হিসাব" বা "👥 স্টাফ" পেজ থেকে পরিশোধ করলে নিজে থেকেই ব্যয় হিসেবে যোগ হয় (এখানে আলাদা করে লিখবেন না)।' : ''} বিদেশ থেকে আসা পেমেন্ট টাকায় রূপান্তর করে (যত টাকা হাতে এসেছে) লিখুন।</p>
    ${table(['তারিখ', 'ধরন', 'খাত', 'বিবরণ', ['টাকা', 'num'], ['', 'actions']], trs, 'এই মাসে কোনো লেনদেন নেই')}
  `;
};

views.progress = () => {
  const sel = state.progressStudent;
  const studentOpts = db.students.filter((s) => matchClass(s, state.progressBatch))
    .map((s) => [s.id, `${s.name}${s.roll ? ' (' + s.roll + ')' : ''}`]);

  let detail = '';
  if (sel && byId(db.students, sel)) {
    const s = byId(db.students, sel);
    const exams = db.exams.filter((e) => e.studentId === sel).sort((a, b) => (a.date > b.date ? 1 : -1));
    let prev = null;
    const rows = exams.map((e) => {
      const p = pctOf(e);
      const [g, gc] = grade(p);
      let trend = '';
      if (prev !== null) trend = p > prev ? '<span class="up">▲</span>' : p < prev ? '<span class="down">▼</span>' : '＝';
      prev = p;
      return `<tr><td>${fmtDate(e.date)}</td><td>${esc(e.title)}</td><td>${esc(e.subject)}</td>
        <td class="num">${num(e.marks)} / ${num(e.total)}</td>
        <td><div style="display:flex;align-items:center;gap:8px"><div class="bar" style="flex:1"><span style="width:${Math.min(100, p)}%"></span></div>${num(Math.round(p))}% ${trend}</div></td>
        <td><span class="badge ${gc}">${g}</span></td><td>${esc(e.remark)}</td>
        <td class="actions"><button class="btn sm" data-action="edit-exam" data-id="${e.id}">এডিট</button>
        ${isOwnerRole() ? `<button class="btn sm danger" data-action="del-exam" data-id="${e.id}">মুছুন</button>` : ''}</td></tr>`;
    }).reverse();
    const avg = exams.length ? exams.reduce((a, e) => a + pctOf(e), 0) / exams.length : 0;
    const bySubject = {};
    for (const e of exams) (bySubject[e.subject || 'অন্যান্য'] ||= []).push(pctOf(e));
    const subjRows = Object.entries(bySubject).map(([sub, ps]) => {
      const a = ps.reduce((x, y) => x + y, 0) / ps.length;
      const [g, gc] = grade(a);
      return `<tr><td>${esc(sub)}</td><td class="num">${num(ps.length)}</td><td class="num">${num(Math.round(a))}%</td><td><span class="badge ${gc}">${g}</span></td></tr>`;
    });
    detail = `
      <div class="panel"><h3>${esc(s.name)} — ${esc(classLabel(s))} · শিক্ষক: ${esc(teacherName(studentTeacherId(s)))}</h3>
      <div class="cards" style="margin-bottom:0">
        ${card('মোট পরীক্ষা', num(exams.length))}
        ${card('গড় নম্বর', exams.length ? num(Math.round(avg)) + '%' : '—', 'blue')}
        ${card('গড় গ্রেড', exams.length ? grade(avg)[0] : '—')}
      </div></div>
      ${subjRows.length ? '<h3>বিষয়ভিত্তিক গড়</h3>' + table(['বিষয়', ['পরীক্ষা', 'num'], ['গড়', 'num'], 'গ্রেড'], subjRows) : ''}
      <h3>পরীক্ষা/মূল্যায়নের ইতিহাস</h3>
      ${table(['তারিখ', 'পরীক্ষা', 'বিষয়', ['নম্বর', 'num'], 'শতকরা', 'গ্রেড', 'মন্তব্য', ['', 'actions']], rows, 'এখনো কোনো ফলাফল যোগ করা হয়নি')}`;
  } else {
    // ব্যাচভিত্তিক সারসংক্ষেপ
    const list = db.students.filter((s) => s.status !== 'inactive' && matchClass(s, state.progressBatch));
    const rows = list.map((s) => {
      const ex = db.exams.filter((e) => e.studentId === s.id).sort((a, b) => (a.date > b.date ? 1 : -1));
      if (!ex.length) return { s, avg: -1, html: `<tr><td>${esc(s.name)}</td><td>${esc(classLabel(s))}</td><td class="num">০</td><td colspan="2" class="muted">কোনো ফলাফল নেই</td><td class="actions"><button class="btn sm" data-action="view-progress" data-id="${s.id}">দেখুন</button></td></tr>` };
      const avg = ex.reduce((a, e) => a + pctOf(e), 0) / ex.length;
      const last = pctOf(ex[ex.length - 1]);
      const [g, gc] = grade(avg);
      return { s, avg, html: `<tr><td>${esc(s.name)}</td><td>${esc(classLabel(s))}</td><td class="num">${num(ex.length)}</td>
        <td><div style="display:flex;align-items:center;gap:8px"><div class="bar" style="flex:1"><span style="width:${Math.min(100, avg)}%"></span></div>${num(Math.round(avg))}% <span class="badge ${gc}">${g}</span></div></td>
        <td class="num">${num(Math.round(last))}%</td>
        <td class="actions"><button class="btn sm" data-action="view-progress" data-id="${s.id}">দেখুন</button></td></tr>` };
    }).sort((a, b) => b.avg - a.avg).map((x) => x.html);
    detail = `<h3>র‍্যাংকিং (গড় নম্বর অনুযায়ী)</h3>
      ${table(['স্টুডেন্ট', 'ব্যাচ', ['পরীক্ষা', 'num'], 'গড়', ['সর্বশেষ', 'num'], ['', 'actions']], rows, 'কোনো স্টুডেন্ট নেই')}`;
  }

  return `
    <h2>পড়াশোনার প্রগ্রেস</h2>
    <div class="toolbar">
      <select data-filter="progressBatch">${opts(classFilterOpts(), state.progressBatch, 'সব ব্যাচ ও ওয়ান-টু-ওয়ান')}</select>
      <select data-filter="progressStudent">${opts(studentOpts, sel, 'সব স্টুডেন্ট (র‍্যাংকিং)')}</select>
      <span class="spacer"></span>
      <button class="btn primary" data-action="add-exam">+ পরীক্ষার ফলাফল যোগ</button>
    </div>
    ${detail}
  `;
};

/** অ্যাডমিনের রিপোর্ট: মালিকের অ্যাপের তৈরি মাসিক সারাংশ থেকে (কে কত সম্মানী পেলেন তা নেই, শুধু মোট) */
function adminReports() {
  const end = thisMonth();
  const months = monthsBetween(shiftMonth(end, -11), end).reverse();
  const get = (m) => byId(db.summaries, m) || { income: 0, expense: 0, cats: {} };
  let ti = 0, te = 0;
  const yearRows = months.map((m) => {
    const x = get(m);
    ti += x.income; te += x.expense;
    return `<tr><td>${monthLabel(m)}</td><td class="num up">${tk(x.income)}</td><td class="num down">${tk(x.expense)}</td>
      <td class="num ${x.income - x.expense >= 0 ? 'up' : 'down'}"><b>${tk(x.income - x.expense)}</b></td></tr>`;
  });
  yearRows.push(`<tr><td><b>মোট (১২ মাস)</b></td><td class="num up"><b>${tk(ti)}</b></td><td class="num down"><b>${tk(te)}</b></td><td class="num"><b>${tk(ti - te)}</b></td></tr>`);
  const rm = state.reportMonth;
  const catRows = Object.entries(get(rm).cats || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
    const [type, cat] = k.split('|');
    return `<tr><td>${type === 'income' ? '<span class="badge green">আয়</span>' : '<span class="badge red">ব্যয়</span>'}</td><td>${esc(cat)}</td><td class="num">${tk(v)}</td></tr>`;
  });
  return `
    <h2>রিপোর্ট</h2>
    <div class="toolbar">
      <label>মাস: <input type="month" data-filter="reportMonth" value="${rm}"></label>
      <span class="spacer"></span>
      <button class="btn" data-action="print">🖨️ প্রিন্ট / PDF</button>
    </div>
    <h3>${monthLabel(rm)} — খাতভিত্তিক আয়-ব্যয়</h3>
    ${table(['ধরন', 'খাত', ['টাকা', 'num']], catRows, 'এই মাসে কোনো লেনদেন নেই')}
    <h3>গত ১২ মাসের আয়-ব্যয়</h3>
    ${table(['মাস', ['আয়', 'num'], ['ব্যয়', 'num'], ['লাভ/ক্ষতি', 'num']], yearRows)}
  `;
}

views.reports = () => {
  if (!isOwnerRole()) return adminReports();
  const end = thisMonth();
  const months = monthsBetween(shiftMonth(end, -11), end).reverse();
  const yearRows = months.map((m) => {
    const t = monthTotals(m);
    return `<tr><td>${monthLabel(m)}</td><td class="num up">${tk(t.income)}</td><td class="num down">${tk(t.expense)}</td>
      <td class="num ${t.net >= 0 ? 'up' : 'down'}"><b>${tk(t.net)}</b></td></tr>`;
  });
  const yt = months.reduce((a, m) => { const t = monthTotals(m); a.i += t.income; a.e += t.expense; return a; }, { i: 0, e: 0 });
  yearRows.push(`<tr><td><b>মোট (১২ মাস)</b></td><td class="num up"><b>${tk(yt.i)}</b></td><td class="num down"><b>${tk(yt.e)}</b></td><td class="num"><b>${tk(yt.i - yt.e)}</b></td></tr>`);

  const rm = state.reportMonth;
  const cats = {};
  for (const r of ledger(rm)) {
    const key = r.type + '|' + r.category;
    cats[key] = (cats[key] || 0) + Number(r.amount);
  }
  const catRows = Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
    const [type, cat] = k.split('|');
    return `<tr><td>${type === 'income' ? '<span class="badge green">আয়</span>' : '<span class="badge red">ব্যয়</span>'}</td><td>${esc(cat)}</td><td class="num">${tk(v)}</td></tr>`;
  });

  const teacherRows = db.teachers.map((t) => {
    const st = db.students.filter((s) => s.status !== 'inactive' && studentTeacherId(s) === t.id);
    const ids = new Set(st.map((s) => s.id));
    const collected = sum(db.payments.filter((p) => ids.has(p.studentId) && p.month === rm));
    const expected = sum(st.filter((s) => (s.admissionDate || '').slice(0, 7) <= rm), 'monthlyFee');
    return `<tr><td>${esc(t.name)}</td><td class="num">${num(st.length)}</td><td class="num">${tk(expected)}</td><td class="num">${tk(collected)}</td></tr>`;
  });

  // ব্যাচভিত্তিক ও ওয়ান-টু-ওয়ান আদায়
  const classRow = (label, st) => {
    const ids = new Set(st.map((s) => s.id));
    const collected = sum(db.payments.filter((p) => ids.has(p.studentId) && p.month === rm));
    const expected = sum(st.filter((s) => (s.admissionDate || '').slice(0, 7) <= rm), 'monthlyFee');
    return { collected, expected, html: `<tr><td>${label}</td><td class="num">${num(st.length)}</td><td class="num">${tk(expected)}</td><td class="num">${tk(collected)}</td><td class="num">${tk(Math.max(0, expected - collected))}</td></tr>` };
  };
  const activeSt = db.students.filter((s) => s.status !== 'inactive');
  const classRows = db.batches.map((b) => classRow(`ব্যাচ: ${esc(b.name)}`, activeSt.filter((s) => !isOne2One(s) && s.batchId === b.id)));
  const noBatch = activeSt.filter((s) => !isOne2One(s) && !byId(db.batches, s.batchId));
  if (noBatch.length) classRows.push(classRow('ব্যাচ ছাড়া', noBatch));
  const o2oRow = classRow('<b>ওয়ান-টু-ওয়ান (সব)</b>', activeSt.filter(isOne2One));
  const batchTotal = classRows.reduce((a, r) => ({ c: a.c + r.collected, e: a.e + r.expected }), { c: 0, e: 0 });
  const classHtml = [...classRows.map((r) => r.html),
    `<tr><td><b>ব্যাচ (সব)</b></td><td></td><td class="num"><b>${tk(batchTotal.e)}</b></td><td class="num"><b>${tk(batchTotal.c)}</b></td><td class="num"><b>${tk(Math.max(0, batchTotal.e - batchTotal.c))}</b></td></tr>`,
    o2oRow.html];

  return `
    <h2>রিপোর্ট</h2>
    <div class="toolbar">
      <label>মাস: <input type="month" data-filter="reportMonth" value="${rm}"></label>
      <span class="spacer"></span>
      <button class="btn" data-action="print">🖨️ প্রিন্ট / PDF</button>
      <button class="btn" data-action="export-csv">⬇️ লেনদেন Excel (CSV)</button>
    </div>
    <h3>${monthLabel(rm)} — খাতভিত্তিক আয়-ব্যয়</h3>
    ${table(['ধরন', 'খাত', ['টাকা', 'num']], catRows, 'এই মাসে কোনো লেনদেন নেই')}
    <h3>${monthLabel(rm)} — ব্যাচ বনাম ওয়ান-টু-ওয়ান</h3>
    ${table(['ব্যাচ/ধরন', ['স্টুডেন্ট', 'num'], ['পাওনা', 'num'], ['আদায়', 'num'], ['বাকি', 'num']], classHtml)}
    <h3>${monthLabel(rm)} — শিক্ষকভিত্তিক ফি আদায়</h3>
    ${table(['শিক্ষক', ['স্টুডেন্ট', 'num'], ['পাওনা', 'num'], ['আদায়', 'num']], teacherRows, 'কোনো শিক্ষক নেই')}
    <h3>গত ১২ মাসের আয়-ব্যয়</h3>
    ${table(['মাস', ['আয়', 'num'], ['ব্যয়', 'num'], ['লাভ/ক্ষতি', 'num']], yearRows)}
  `;
};

function membersPanel() {
  if (!FB_MODE) return '';
  const rows = db.members.slice().sort((x, y) => (x.role + x.id < y.role + y.id ? -1 : 1)).map((m) => `
    <tr><td><b>${esc(m.id)}</b>${m.name ? `<br><span class="muted">${esc(m.name)}</span>` : ''}</td>
    <td>${ROLE_LABEL[m.role] || esc(m.role)}${m.role === 'teacher' ? ` — ${esc(teacherName(m.teacherId))}` : ''}</td>
    <td>${m.active === false ? '<span class="badge gray">বন্ধ</span>' : '<span class="badge green">চালু</span>'}</td>
    <td class="actions"><button class="btn sm" data-action="toggle-member" data-id="${esc(m.id)}">${m.active === false ? 'চালু করুন' : 'বন্ধ করুন'}</button>
    <button class="btn sm danger" data-action="del-member" data-id="${esc(m.id)}">মুছুন</button></td></tr>`);
  return `<div class="panel">
    <h3>🔐 লগইনের অনুমতি</h3>
    <p>মালিক: <b>${esc(OWNER)}</b> (আপনি)। এখানে অ্যাডমিন বা শিক্ষককে তাঁদের Gmail দিয়ে অনুমতি দিন। তাঁরা সেই Gmail দিয়ে Google লগইন করলেই ঢুকতে পারবেন।</p>
    <div class="toolbar"><span class="spacer"></span><button class="btn primary" data-action="add-member">+ অনুমতি দিন</button></div>
    ${table(['Gmail', 'ভূমিকা', 'অবস্থা', ['', 'actions']], rows, 'এখনো কাউকে অনুমতি দেওয়া হয়নি')}
    <p class="muted"><b>অ্যাডমিন</b>: স্টুডেন্ট যোগ ও এডিট, ফি জমা, রিমাইন্ডার, আয় লেখা, পরীক্ষার নম্বর তোলা। খরচ, লাভ-ক্ষতি, শিক্ষক বা স্টাফের সম্মানী দেখতে পারেন না, কিছু মুছতেও পারেন না।<br>
    <b>শিক্ষক</b>: শুধু নিজের ক্লাস, নিজের স্টুডেন্টের নাম ও ফলাফল (ফোন বা ফি নয়), আর নিজের হিসাব দেখতে পারেন; নিজের পেমেন্টের তথ্য আপডেট করতে পারেন।</p>
  </div>`;
}

views.settings = () => {
  const s = db.settings;
  if (!isOwnerRole()) {
    return `
      <h2>সেটিংস</h2>
      <div class="panel">
        <h3>আপনার অ্যাকাউন্ট</h3>
        <p><b>${esc(me.name || me.email)}</b><br><span class="muted">${esc(me.email)} · ${ROLE_LABEL[me.role]}</span></p>
        <button class="btn" data-action="logout">লগআউট</button>
      </div>`;
  }
  const last = localStorage.getItem(STORE_KEY + '-last-backup');
  const local = FB_MODE && localBackupInfo();
  return `
    <h2>সেটিংস ও ব্যাকআপ</h2>
    <div class="panel">
      <h3>একাডেমির তথ্য</h3>
      <div class="field"><label>একাডেমির নাম</label><input id="set-name" value="${esc(s.academyName)}"></div>
      <div class="field"><label>ফোন</label><input id="set-phone" value="${esc(s.phone)}"></div>
      <div class="field"><label>ঠিকানা</label><input id="set-address" value="${esc(s.address)}"></div>
      <div class="field"><label>ফি রিমাইন্ডার মেসেজ — {guardian}, {student}, {months}, {amount}, {academy} লিখলে আসল তথ্য বসে যাবে</label>
        <textarea id="set-template">${esc(s.reminderTemplate)}</textarea></div>
      <button class="btn primary" data-action="save-settings">সেভ করুন</button>
    </div>
    ${FB_MODE ? `<div class="panel">
      <h3>অ্যাডমিনের অনুমতি</h3>
      <label class="switch"><input type="checkbox" id="set-reports" ${s.adminReports ? 'checked' : ''}> অ্যাডমিন রিপোর্ট দেখতে পারবে</label>
      <p class="muted">চালু করলে অ্যাডমিন মাসিক আয়-ব্যয়, লাভ-ক্ষতি আর ১২ মাসের হিসাব দেখতে পারবে। তবু কোন শিক্ষক বা স্টাফ কত পেলেন তা দেখবে না, শুধু মোট "শিক্ষক সম্মানী" বা "স্টাফ সম্মানী" দেখবে। খরচ লেখা বা কিছু মোছা যাবে না।</p>
    </div>` : ''}
    ${membersPanel()}
    <div class="panel">
      <h3>💾 ব্যাকআপ</h3>
      <p>${FB_MODE ? 'সব ডেটা অনলাইনে (Firebase) নিরাপদে থাকে। তবু মাসে একবার ব্যাকআপ ফাইল ডাউনলোড করে Google Drive-এ রেখে দিলে আরও নিশ্চিন্ত থাকবেন।'
        : 'লোকাল মোড: সব ডেটা শুধু এই ব্রাউজারে আছে। নিয়মিত ব্যাকআপ ফাইল ডাউনলোড করে Google Drive-এ রাখুন।'}</p>
      <p class="muted">শেষ ব্যাকআপ: ${last ? fmtDate(last) : 'কখনো নেওয়া হয়নি'}</p>
      <div class="toolbar">
        <button class="btn primary" data-action="export">⬇️ ব্যাকআপ ডাউনলোড</button>
        <label class="btn">⬆️ ব্যাকআপ থেকে ফেরত আনুন <input type="file" id="import-file" accept=".json,application/json" hidden></label>
        ${local ? `<button class="btn" data-action="migrate-local">📥 এই ব্রাউজারের আগের ডেটা অনলাইনে তুলুন (${num(local.students)} স্টুডেন্ট)</button>` : ''}
      </div>
      <p class="muted">"ফেরত আনুন" দিয়ে কোনো ব্যাকআপ ফাইল লোড করলে বর্তমান সব ডেটা সেই ফাইলের ডেটা দিয়ে বদলে যাবে। লগইনের অনুমতিগুলো বদলাবে না।</p>
    </div>
    ${FB_MODE ? '' : `<div class="panel">
      <h3>অন্যান্য</h3>
      <div class="toolbar">
        <button class="btn" data-action="load-demo">ডেমো ডেটা লোড করুন</button>
        <button class="btn danger" data-action="reset">⚠️ সব ডেটা মুছে ফেলুন</button>
      </div>
    </div>`}
  `;
};

/* ---------- কার্যক্রমের রেকর্ড (শুধু মালিক) ---------- */
const ACTION_LABEL = { save: 'সেভ/এডিট', delete: 'মুছে ফেলা', import: 'ব্যাকআপ আনা' };
let activityRows = null;
views.activity = () => `
  <h2>🕘 কার্যক্রম</h2>
  <p class="muted">কে কখন কী যোগ, এডিট বা মুছেছে (সর্বশেষ ৩০০টি)। এই রেকর্ড কেউ বদলাতে বা মুছতে পারে না।</p>
  <div class="toolbar"><span class="spacer"></span><button class="btn" data-action="reload-activity">🔄 আবার আনুন</button></div>
  <div id="activity-list">${activityRows ? activityTable() : '<div class="empty">⏳ লোড হচ্ছে…</div>'}</div>`;

function activityTable() {
  const rows = activityRows.map((r) => `<tr><td>${new Date(r.at).toLocaleString('bn-BD')}</td><td>${esc(r.by)}<br><span class="muted">${ROLE_LABEL[r.role] || ''}</span></td>
    <td>${ACTION_LABEL[r.action] || esc(r.action)}</td><td>${esc(COL_LABEL[r.col] || r.col)}</td><td>${esc(r.label || '')}</td></tr>`);
  return table(['সময়', 'কে', 'কাজ', 'কী', 'বিবরণ'], rows, 'এখনো কোনো রেকর্ড নেই');
}

async function loadActivity(force) {
  if (!FB_MODE || (activityRows && !force)) return;
  try {
    const snap = await fb.getDocs(fb.query(fb.collection(fs, 'auditLog'), fb.orderBy('at', 'desc'), fb.limit(300)));
    activityRows = snap.docs.map((d) => d.data());
  } catch (e) {
    console.error(e);
    activityRows = [];
  }
  const el = $('#activity-list');
  if (el) el.innerHTML = activityTable();
}

/* ---------- forms ---------- */
const teacherOpts = () => db.teachers.map((t) => [t.id, t.name]);
const batchOpts = () => db.batches.map((b) => [b.id, `${b.name}${b.fee ? ' — ' + tk(b.fee) : ''}`]);

function checkRule(v, fee) {
  if (v.payType === 'percent' && v.payValue > 100) { alert('শতাংশ ১০০-এর বেশি হতে পারে না'); return false; }
  if (v.payType === 'fixed' && fee && v.payValue > fee) { alert('শিক্ষকের নির্দিষ্ট টাকা মাসিক ফি-এর চেয়ে বেশি হতে পারে না'); return false; }
  return true;
}

/** "ভর্তি করিয়েছেন" তালিকা: মালিক পূর্ণ স্টাফ তালিকা দেখেন, অ্যাডমিন শুধু নাম */
const referrerOpts = () => (isOwnerRole() ? db.staff.map((x) => ({ id: x.id, name: x.name, active: x.status !== 'inactive' })) : db.staffNames)
  .filter((x) => x.active !== false).map((x) => [x.id, x.name]);

function studentForm(s) {
  const owner = isOwnerRole();
  const rule = s ? ruleDoc('s_' + s.id) : null;
  const comm = s ? byId(db.commissions, s.id) : null;
  const commLocked = !!comm?.accruedDate;
  const values = s
    ? { type: 'batch', ...s, one2oneTeacherId: s.teacherId, payType: rule?.type || 'percent', payValue: rule?.value || '', commMode: 'default', commValue: '' }
    : { type: 'batch', payType: 'percent', admissionDate: today(), status: 'active', commMode: 'default' };
  if (comm && !commLocked) {
    const def = byId(db.staff, comm.staffId);
    if (!def || def.commType !== comm.type || Number(def.commValue) !== Number(comm.value)) { values.commMode = comm.type; values.commValue = comm.value; }
  }
  const fields = [
    { name: 'name', label: 'নাম', required: true },
    { name: 'roll', label: 'স্টুডেন্ট আইডি' },
    { name: 'type', label: 'পড়ার ধরন', type: 'select', options: [['batch', 'ব্যাচে পড়ে'], ['one2one', 'ওয়ান-টু-ওয়ান (একা শিক্ষকের সাথে)']] },
    { name: 'batchId', label: 'ব্যাচ', type: 'select', options: batchOpts(), placeholder: '— ব্যাচ বাছাই করুন —', showIf: ['type', ['batch']] },
    { name: 'teacherId', label: 'আলাদা শিক্ষক (খালি রাখলে ব্যাচের শিক্ষক)', type: 'select', options: teacherOpts(), placeholder: '— ব্যাচের শিক্ষক —', showIf: ['type', ['batch']] },
    { name: 'one2oneTeacherId', label: 'শিক্ষক', type: 'select', options: teacherOpts(), placeholder: '— শিক্ষক বাছাই করুন —', showIf: ['type', ['one2one']] },
    { name: 'course', label: 'কোর্স/বিষয় (যেমন: আরবি ভাষা, তাজবীদ)', showIf: ['type', ['one2one']] },
    { name: 'days', label: 'ক্লাসের দিন', type: 'days', showIf: ['type', ['one2one']] },
    { name: 'time', label: 'ক্লাসের সময় (বাংলাদেশ সময়)', type: 'time', showIf: ['type', ['one2one']] },
    { name: 'classLink', label: 'ক্লাস লিংক (Zoom/Meet)', type: 'url', showIf: ['type', ['one2one']] },
    { name: 'monthlyFee', label: s && !owner ? 'মাসিক ফি (শুধু মালিক বদলাতে পারেন)' : 'মাসিক ফি (ব্যাচে খালি রাখলে ব্যাচের ফি বসবে)', type: 'number', disabled: !!s && !owner },
  ];
  if (owner) {
    fields.push(
      { name: 'payType', label: 'শিক্ষক কীভাবে পাবেন', type: 'select', options: [['percent', 'ফি-এর শতাংশ (%)'], ['fixed', 'মাসে নির্দিষ্ট টাকা']], showIf: ['type', ['one2one']] },
      { name: 'payValue', label: 'শিক্ষক পাবেন (শতাংশ হলে যেমন ৬০, টাকা হলে যেমন ২০০০)', type: 'number', showIf: ['type', ['one2one']] },
    );
  }
  fields.push(
    { name: 'guardian', label: 'অভিভাবকের নাম (প্রাপ্তবয়স্ক হলে খালি রাখুন)' },
    { name: 'phone', label: 'WhatsApp নম্বর (বিদেশি নম্বর হলে +দেশের কোডসহ, যেমন +447...)', type: 'tel' },
    { name: 'email', label: 'ইমেইল', type: 'email' },
    { name: 'country', label: 'দেশ/শহর' },
    { name: 'admissionDate', label: 'ভর্তির তারিখ (এই মাস থেকে ফি হিসাব হবে)', type: 'date', required: true },
    { name: 'referredBy', label: 'ভর্তি করিয়েছেন (স্টাফ)', type: 'select', options: referrerOpts(), placeholder: '— কেউ না / সরাসরি —', disabled: commLocked },
  );
  if (owner) {
    if (commLocked) {
      fields.push({ name: 'commInfo', type: 'info', label: 'কমিশন', text: `${staffName(comm.staffId)} — ${tk(comm.accruedAmount)} (প্রথম ফি এসেছে ${fmtDate(comm.accruedDate)}, তাই আর বদলানো যাবে না)` });
    } else {
      fields.push(
        { name: 'commMode', label: 'এই ভর্তির কমিশন', type: 'select', options: [['default', 'স্টাফের ডিফল্ট নিয়ম'], ...COMM_TYPES] },
        { name: 'commValue', label: 'কমিশন (টাকা বা শতাংশ — ডিফল্ট না হলে)', type: 'number' },
      );
    }
  }
  fields.push(
    { name: 'status', label: 'অবস্থা', type: 'select', options: [['active', 'সক্রিয়'], ['inactive', 'নিষ্ক্রিয় (ছেড়ে দিয়েছে)']] },
    { name: 'note', label: 'নোট', type: 'textarea' },
  );
  openForm({
    title: s ? 'স্টুডেন্ট এডিট' : 'নতুন স্টুডেন্ট',
    values,
    fields,
    onSubmit: (v) => {
      const { payType, payValue, commMode, commValue, commInfo, one2oneTeacherId, ...st } = v;
      if (st.type === 'one2one') {
        if (!one2oneTeacherId) { alert('ওয়ান-টু-ওয়ান স্টুডেন্টের জন্য শিক্ষক বাছাই করুন'); return false; }
        if (!st.monthlyFee) { alert('ওয়ান-টু-ওয়ান স্টুডেন্টের মাসিক ফি লিখুন'); return false; }
        st.teacherId = one2oneTeacherId;
        st.batchId = '';
        if (owner && !checkRule({ payType, payValue }, st.monthlyFee)) return false;
      } else {
        st.course = ''; st.classLink = ''; st.days = []; st.time = '';
        if (!st.monthlyFee && st.batchId) st.monthlyFee = Number(byId(db.batches, st.batchId)?.fee) || 0;
      }
      if (owner && commMode === 'percent' && commValue > 100) { alert('শতাংশ ১০০-এর বেশি হতে পারে না'); return false; }
      if (s && !owner) st.monthlyFee = s.monthlyFee; // অ্যাডমিন ফি বদলাতে পারে না
      delete st.schedule;
      const saved = put('students', { ...(s || {}), ...st, id: s?.id }, st.name);
      if (owner) {
        // ওয়ান-টু-ওয়ানের শিক্ষকের অংশের নিয়ম
        if (st.type === 'one2one') put('payRules', { id: 's_' + saved.id, type: payType, value: Number(payValue) || 0 }, `${st.name}: ${payType === 'fixed' ? tk(payValue) : num(payValue) + '%'}`);
        else if (ruleDoc('s_' + saved.id)) del('payRules', 's_' + saved.id, st.name);
        // ভর্তির কমিশন
        if (!commLocked) {
          const old = byId(db.commissions, saved.id);
          if (!st.referredBy) { if (old) del('commissions', saved.id, st.name); }
          else {
            const staff = byId(db.staff, st.referredBy);
            const c = commMode === 'default'
              ? (old && old.staffId === st.referredBy ? { type: old.type, value: old.value } : { type: staff?.commType || 'none', value: Number(staff?.commValue) || 0 })
              : { type: commMode, value: Number(commValue) || 0 };
            put('commissions', { id: saved.id, staffId: st.referredBy, ...c }, `${st.name} → ${staffName(st.referredBy)}: ${fmtComm(c)}`);
          }
        }
      }
      toast('স্টুডেন্ট সেভ হয়েছে');
    },
  });
}

function batchForm(b) {
  const rule = b ? ruleDoc('b_' + b.id) : null;
  openForm({
    title: b ? 'ব্যাচ এডিট' : 'নতুন ব্যাচ',
    values: b ? { ...b, payType: rule?.type || 'percent', payValue: rule?.value || '' } : { payType: 'percent' },
    fields: [
      { name: 'name', label: 'ব্যাচের নাম (যেমন: আরবি ভাষা — বেসিক, ব্যাচ-৩)', required: true },
      { name: 'subject', label: 'বিষয়' },
      { name: 'teacherId', label: 'দায়িত্বপ্রাপ্ত শিক্ষক', type: 'select', options: teacherOpts(), placeholder: '— শিক্ষক বাছাই করুন —' },
      { name: 'days', label: 'ক্লাসের দিন', type: 'days' },
      { name: 'time', label: 'ক্লাসের সময় (বাংলাদেশ সময়)', type: 'time' },
      { name: 'classLink', label: 'ক্লাস লিংক (Zoom/Google Meet)', type: 'url' },
      { name: 'fee', label: 'মাসিক ফি (প্রতি স্টুডেন্ট)', type: 'number' },
      { name: 'payType', label: 'শিক্ষক কীভাবে পাবেন', type: 'select', options: [['percent', 'ফি-এর শতাংশ (%)'], ['fixed', 'প্রতি স্টুডেন্ট মাসে নির্দিষ্ট টাকা']] },
      { name: 'payValue', label: 'শিক্ষক পাবেন (শতাংশ হলে যেমন ৬০, টাকা হলে যেমন ৮০০)', type: 'number' },
    ],
    onSubmit: (v) => {
      if (!checkRule(v, v.fee)) return false;
      const { payType, payValue, ...bt } = v;
      const saved = put('batches', { ...(b || {}), ...bt, id: b?.id }, bt.name);
      put('payRules', { id: 'b_' + saved.id, type: payType, value: Number(payValue) || 0 }, `${bt.name}: ${payType === 'fixed' ? tk(payValue) : num(payValue) + '%'}`);
      toast('ব্যাচ সেভ হয়েছে');
    },
  });
}

const PAYINFO_FIELDS = [
  { name: 'bkash', label: 'বিকাশ নম্বর' },
  { name: 'nagad', label: 'নগদ নম্বর' },
  { name: 'rocket', label: 'রকেট নম্বর' },
  { name: 'bank', label: 'ব্যাংক অ্যাকাউন্ট (ব্যাংক, শাখা, হিসাব নম্বর, নাম)', type: 'textarea' },
];
const payInfoText = (x) => [['বিকাশ', x?.bkash], ['নগদ', x?.nagad], ['রকেট', x?.rocket], ['ব্যাংক', x?.bank]].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ');

function teacherForm(t) {
  const priv = t ? byId(db.teacherPrivate, t.id) || {} : {};
  openForm({
    title: t ? 'শিক্ষক এডিট' : 'নতুন শিক্ষক',
    values: t ? { ...t, ...priv, kind: t.selfOwner ? 'owner' : 'teacher' } : { joinDate: today(), kind: 'teacher' },
    fields: [
      { name: 'name', label: 'নাম', required: true },
      { name: 'kind', label: 'ধরন', type: 'select', options: [['teacher', 'শিক্ষক — সম্মানী পান'], ['owner', 'আমি নিজে (মালিক) — সম্মানী নেই, পুরো ফি একাডেমির']] },
      { name: 'phone', label: 'মোবাইল/WhatsApp (বিদেশি হলে +দেশের কোডসহ)', type: 'tel' },
      { name: 'subject', label: 'বিষয়' },
      { name: 'joinDate', label: 'যোগদানের তারিখ', type: 'date' },
      { name: 'note', label: 'নোট', type: 'textarea' },
      ...PAYINFO_FIELDS,
    ],
    onSubmit: (v) => {
      const { bkash, nagad, rocket, bank, kind, ...tv } = v;
      tv.selfOwner = kind === 'owner';
      const changed = !!t && !!t.selfOwner !== tv.selfOwner;
      const saved = put('teachers', { ...(t || {}), ...tv, id: t?.id }, tv.name + (tv.selfOwner ? ' (মালিক নিজে)' : ''));
      put('teacherPrivate', { ...priv, id: saved.id, bkash, nagad, rocket, bank }, tv.name);
      // ধরন বদলালে এই শিক্ষকের আগের সব ফি-এর অংশ নতুন করে হিসাব (মালিক হলে ০)
      if (changed) applyWrites(db.payments.filter((p) => paymentTeacher(p) === saved.id).map((p) => ['set', 'shares', p.id, computeShare(p)])).then(() => render());
      toast('শিক্ষক সেভ হয়েছে');
    },
  });
}

function paymentForm(studentId, month, edit) {
  const active = db.students.filter((s) => s.status !== 'inactive' || s.id === edit?.studentId);
  if (!active.length) return toast('আগে স্টুডেন্ট যোগ করুন');
  const s = byId(db.students, studentId);
  let m = month;
  if (s && !m) m = studentDues(s)[0]?.month || thisMonth();
  const amount = s ? Math.max(0, Number(s.monthlyFee) - paidFor(s.id, m || thisMonth())) : '';
  openForm({
    title: edit ? 'ফি জমা এডিট' : 'ফি জমা',
    submitLabel: edit ? 'সেভ করুন' : 'জমা নিন',
    values: edit || { studentId, month: m || thisMonth(), amount, date: today(), method: PAY_METHODS[0] },
    fields: [
      { name: 'studentId', label: 'স্টুডেন্ট', type: 'select', required: true, options: active.map((x) => [x.id, `${x.name} — ${classLabel(x)}`]), placeholder: '— বাছাই করুন —' },
      { name: 'month', label: 'কোন মাসের ফি', type: 'month', required: true },
      { name: 'amount', label: 'টাকার পরিমাণ', type: 'number', required: true },
      { name: 'date', label: 'জমার তারিখ', type: 'date', required: true },
      { name: 'method', label: 'মাধ্যম', type: 'select', options: PAY_METHODS.map((x) => [x, x]) },
      { name: 'note', label: 'নোট (যেমন: TrxID/রেফারেন্স)' },
    ],
    onSubmit: (v) => {
      if (!(v.amount > 0)) { alert('সঠিক টাকার পরিমাণ লিখুন'); return false; }
      const p = put('payments', { ...(edit || {}), ...v, id: edit?.id }, `${studentName(v.studentId)} — ${monthLabel(v.month)} — ${tk(v.amount)}`);
      // মালিক ফি নিলে শিক্ষকের অংশ সঙ্গে সঙ্গে সেভ; অ্যাডমিন নিলে মালিকের অ্যাপ পরে যোগ করবে।
      // এডিটে টাকা/স্টুডেন্ট বদলালে অংশ নতুন করে হিসাব হয়।
      if (isOwnerRole()) {
        const old = byId(db.shares, p.id);
        if (!old || old.amount !== Number(v.amount) || !edit || edit.studentId !== v.studentId || old.date !== v.date) put('shares', computeShare(p), false);
      }
      toast(edit ? 'সেভ হয়েছে' : `${tk(v.amount)} জমা হয়েছে`);
    },
  });
}

function payoutForm(teacherId) {
  if (!db.teachers.length) return toast('আগে শিক্ষক যোগ করুন');
  const due = teacherId ? teacherAccount(teacherId).balance : 0;
  const info = teacherId ? payInfoText(byId(db.teacherPrivate, teacherId)) : '';
  openForm({
    title: 'শিক্ষককে পরিশোধ',
    submitLabel: 'পরিশোধ করুন',
    values: { teacherId: teacherId || '', amount: due > 0 ? due : '', date: today(), method: PAY_METHODS[0], note: `${monthLabel(thisMonth())}-এর সম্মানী` },
    fields: [
      { name: 'teacherId', label: 'শিক্ষক', type: 'select', required: true, options: payTeachers().map((t) => [t.id, `${t.name} — বাকি ${tk(teacherAccount(t.id).balance)}`]), placeholder: '— বাছাই করুন —' },
      ...(teacherId ? [{ name: 'payinfo', type: 'info', label: 'শিক্ষকের পেমেন্টের তথ্য', text: info || 'দেওয়া নেই' }] : []),
      { name: 'amount', label: 'টাকার পরিমাণ (আংশিকও দেওয়া যাবে)', type: 'number', required: true },
      { name: 'date', label: 'তারিখ', type: 'date', required: true },
      { name: 'method', label: 'মাধ্যম', type: 'select', options: PAY_METHODS.map((x) => [x, x]) },
      { name: 'note', label: 'নোট (যেমন: অক্টোবরের সম্মানী, TrxID)' },
    ],
    onSubmit: (v) => {
      if (!(v.amount > 0)) { alert('সঠিক টাকার পরিমাণ লিখুন'); return false; }
      const bal = teacherAccount(v.teacherId).balance;
      if (v.amount > bal && !confirm(`এই শিক্ষকের বাকি ${tk(Math.max(0, bal))}। ${tk(v.amount)} দিলে বাড়তি টাকা অগ্রিম হিসেবে থাকবে। ঠিক আছে?`)) return false;
      const { payinfo, ...o } = v;
      put('teacherPayouts', o, `${teacherName(v.teacherId)} — ${tk(v.amount)}`);
      state.payTeacher = v.teacherId;
      toast(`${teacherName(v.teacherId)}-কে ${tk(v.amount)} পরিশোধ হয়েছে`);
    },
  });
}

function txnForm(type, t) {
  const cats = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
  const col = type === 'income' ? 'incomes' : 'expenses';
  openForm({
    title: (t ? 'এডিট — ' : '') + (type === 'income' ? 'আয়' : 'ব্যয়'),
    values: t || { date: today(), category: cats[0] },
    fields: [
      { name: 'category', label: 'খাত', type: 'select', options: (t && !cats.includes(t.category) ? [t.category, ...cats] : cats).map((c) => [c, c]) },
      { name: 'amount', label: 'টাকার পরিমাণ', type: 'number', required: true },
      { name: 'date', label: 'তারিখ', type: 'date', required: true },
      { name: 'note', label: 'বিবরণ' },
    ],
    onSubmit: (v) => {
      if (!(v.amount > 0)) { alert('সঠিক টাকার পরিমাণ লিখুন'); return false; }
      put(col, { ...(t || {}), ...v, id: t?.id }, `${v.category} — ${tk(v.amount)}`);
      toast('সেভ হয়েছে');
    },
  });
}

function examForm(e, studentId) {
  if (!db.students.length) return toast('আগে স্টুডেন্ট যোগ করুন');
  openForm({
    title: e ? 'ফলাফল এডিট' : 'পরীক্ষার ফলাফল যোগ',
    values: e || { studentId: studentId || '', date: today(), total: 100 },
    fields: [
      { name: 'studentId', label: 'স্টুডেন্ট', type: 'select', required: true, options: db.students.map((s) => [s.id, `${s.name} — ${classLabel(s)}`]), placeholder: '— বাছাই করুন —' },
      { name: 'title', label: 'পরীক্ষার নাম (যেমন: সাপ্তাহিক টেস্ট-৩)', required: true },
      { name: 'subject', label: 'বিষয়' },
      { name: 'marks', label: 'প্রাপ্ত নম্বর', type: 'number', required: true },
      { name: 'total', label: 'পূর্ণমান', type: 'number', required: true },
      { name: 'date', label: 'তারিখ', type: 'date', required: true },
      { name: 'remark', label: 'শিক্ষকের মন্তব্য', type: 'textarea' },
    ],
    onSubmit: (v) => {
      if (!(v.total > 0) || v.marks > v.total) { alert('নম্বর পূর্ণমানের চেয়ে বেশি হতে পারে না'); return false; }
      put('exams', { ...(e || {}), ...v, id: e?.id }, `${studentName(v.studentId)} — ${v.title}: ${v.marks}/${v.total}`);
      state.progressStudent = v.studentId;
      toast('ফলাফল সেভ হয়েছে');
    },
  });
}

function memberForm() {
  openForm({
    title: 'লগইনের অনুমতি দিন',
    submitLabel: 'অনুমতি দিন',
    values: { role: 'admin' },
    fields: [
      { name: 'email', label: 'Gmail ঠিকানা (যেটা দিয়ে লগইন করবেন)', type: 'email', required: true },
      { name: 'name', label: 'নাম' },
      { name: 'role', label: 'ভূমিকা', type: 'select', options: [['admin', 'অ্যাডমিন'], ['teacher', 'শিক্ষক']] },
      { name: 'teacherId', label: 'কোন শিক্ষক', type: 'select', options: teacherOpts(), placeholder: '— শিক্ষক বাছাই করুন —', showIf: ['role', ['teacher']] },
    ],
    onSubmit: (v) => {
      const email = v.email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { alert('সঠিক ইমেইল ঠিকানা লিখুন'); return false; }
      if (email === OWNER) { alert('এটা মালিকের ঠিকানা, আলাদা অনুমতি লাগবে না'); return false; }
      if (v.role === 'teacher' && !v.teacherId) { alert('কোন শিক্ষক, বাছাই করুন'); return false; }
      put('members', { id: email, name: v.name, role: v.role, teacherId: v.role === 'teacher' ? v.teacherId : '', active: true }, `${email} — ${ROLE_LABEL[v.role]}`);
      toast('অনুমতি দেওয়া হয়েছে');
    },
  });
}

function teacherInfoForm() {
  const priv = byId(db.teacherPrivate, me.teacherId) || {};
  openForm({
    title: 'আমার পেমেন্টের তথ্য',
    values: priv,
    fields: PAYINFO_FIELDS,
    onSubmit: (v) => {
      put('teacherPrivate', { ...priv, ...v, id: me.teacherId }, 'নিজের পেমেন্টের তথ্য');
      toast('সেভ হয়েছে');
    },
  });
}

/* ---------- export / import ---------- */
function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exportCsv() {
  const lines = [['তারিখ', 'ধরন', 'খাত', 'বিবরণ', 'টাকা']];
  for (const r of ledger().reverse()) lines.push([r.date, r.type === 'income' ? 'আয়' : 'ব্যয়', r.category, r.note, r.amount]);
  const csv = lines.map((l) => l.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  download(`transactions-${today()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
}

function printPayoutSlip(o) {
  const t = byId(db.teachers, o.teacherId) || {};
  const set = db.settings;
  const due = teacherAccount(o.teacherId).balance;
  const w = window.open('', '_blank');
  if (!w) return toast('পপআপ ব্লক হয়েছে — ব্রাউজারে পপআপ অনুমতি দিন');
  w.document.write(`<!doctype html><html lang="bn"><head><meta charset="utf-8"><title>পেমেন্ট স্লিপ</title>
    <style>body{font-family:"Hind Siliguri",sans-serif;max-width:420px;margin:24px auto;padding:20px;border:1px dashed #999}
    p.c{text-align:center;margin:4px 0;color:#555}table{width:100%;margin-top:16px;border-collapse:collapse}
    td{padding:6px 0;border-bottom:1px solid #eee}td:last-child{text-align:right}.sig{margin-top:48px;display:flex;justify-content:space-between}</style></head><body>
    <img src="${new URL('icons/logo.png', location.href).href}" alt="" style="display:block;width:150px;margin:0 auto 8px">
    <p class="c">${esc(set.address)} ${esc(set.phone)}</p><p class="c"><b>শিক্ষক সম্মানী — পেমেন্ট স্লিপ</b></p>
    <table><tr><td>স্লিপ নং</td><td>${esc(o.id.toUpperCase())}</td></tr>
    <tr><td>শিক্ষক</td><td>${esc(t.name || '')}</td></tr><tr><td>তারিখ</td><td>${fmtDate(o.date)}</td></tr>
    <tr><td>মাধ্যম</td><td>${esc(o.method || '')}</td></tr>${o.note ? `<tr><td>বিবরণ</td><td>${esc(o.note)}</td></tr>` : ''}
    <tr><td><b>পরিশোধিত টাকা</b></td><td><b>${tk(o.amount)}</b></td></tr>
    <tr><td>বর্তমানে মোট বাকি</td><td>${due < 0 ? 'অগ্রিম ' + tk(-due) : tk(due)}</td></tr></table>
    <div class="sig"><span>_____________<br>প্রদানকারী</span><span>_____________<br>গ্রহণকারী</span></div>
    <script>window.onload = () => window.print()<\/script></body></html>`);
  w.document.close();
}

function printReceipt(p) {
  const s = byId(db.students, p.studentId) || {};
  const set = db.settings;
  const w = window.open('', '_blank');
  if (!w) return toast('পপআপ ব্লক হয়েছে — ব্রাউজারে পপআপ অনুমতি দিন');
  w.document.write(`<!doctype html><html lang="bn"><head><meta charset="utf-8"><title>রসিদ</title>
    <style>body{font-family:"Hind Siliguri",sans-serif;max-width:420px;margin:24px auto;padding:20px;border:1px dashed #999}
    h2{margin:0;text-align:center}p.c{text-align:center;margin:4px 0;color:#555}table{width:100%;margin-top:16px;border-collapse:collapse}
    td{padding:6px 0;border-bottom:1px solid #eee}td:last-child{text-align:right}.sig{margin-top:48px;text-align:right}</style></head><body>
    <img src="${new URL('icons/logo.png', location.href).href}" alt="" style="display:block;width:150px;margin:0 auto 8px">
    <h2>${esc(set.academyName)}</h2><p class="c">${esc(set.address)} ${esc(set.phone)}</p><p class="c"><b>ফি জমার রসিদ</b></p>
    <table><tr><td>রসিদ নং</td><td>${esc(p.id.toUpperCase())}</td></tr>
    <tr><td>স্টুডেন্ট</td><td>${esc(s.name || '')}</td></tr><tr><td>ব্যাচ</td><td>${esc(classLabel(s))}</td></tr>
    <tr><td>মাস</td><td>${monthLabel(p.month)}</td></tr><tr><td>জমার তারিখ</td><td>${fmtDate(p.date)}</td></tr>
    <tr><td>মাধ্যম</td><td>${esc(p.method)}</td></tr><tr><td><b>টাকা</b></td><td><b>${tk(p.amount)}</b></td></tr></table>
    <div class="sig">_____________<br>গ্রহণকারী</div><script>window.onload = () => window.print()<\/script></body></html>`);
  w.document.close();
}

function demoData() {
  const d = defaultData();
  d.version = 1;
  d.transactions = [];
  d.settings.academyName = 'At-Turath Academy (ডেমো)';
  const T = (name, subject, phone) => ({ id: uid(), name, subject, phone, joinDate: '2026-01-01' });
  const t1 = T('উস্তায আব্দুল্লাহ', 'আরবি ভাষা', '01700000001');
  const t2 = T('উস্তাযা মারইয়াম', 'তাজবীদ ও তিলাওয়াত', '01700000002');
  const t3 = T('উস্তায হাসান', 'আরবি ব্যাকরণ', '01700000003');
  d.teachers = [t1, t2, t3];
  const B = (name, subject, teacherId, days, time, fee, payType, payValue) => ({ id: uid(), name, subject, teacherId, days, time, fee, payType, payValue, classLink: 'https://meet.google.com/' });
  const b1 = B('আরবি ভাষা — বেসিক (ব্যাচ-৩)', 'আরবি ভাষা', t1.id, [6, 1, 3], '21:00', 1500, 'percent', 50);
  const b2 = B('তাজবীদ — বোনদের ব্যাচ', 'তাজবীদ', t2.id, [0, 2, 4], '16:00', 1200, 'fixed', 700);
  d.batches = [b1, b2];
  const m = thisMonth();
  const start = shiftMonth(m, -3) + '-01';
  let rollNo = 101;
  const mk = (name, extra) => ({ id: uid(), name, roll: 'AT-' + rollNo++, guardian: '', phone: '', email: '', country: 'বাংলাদেশ', admissionDate: start, status: 'active', ...extra });
  const batchSt = [
    ['আরিফ হাসান', b1, '01711000001'], ['সুমাইয়া আক্তার', b2, '01711000002'], ['রাফি আহমেদ', b1, '+447700900123', 'যুক্তরাজ্য'],
    ['নুসরাত জাহান', b2, '01711000004'], ['তাহমিদ ইসলাম', b1, '+966500000005', 'সৌদি আরব'], ['মাহিয়া রহমান', b2, '01711000006'],
  ].map(([name, b, phone, country]) => mk(name, { type: 'batch', batchId: b.id, teacherId: '', monthlyFee: b.fee, phone, country: country || 'বাংলাদেশ' }));
  const o2oSt = [
    mk('আব্দুর রহমান', { type: 'one2one', teacherId: t2.id, course: 'কুরআন তিলাওয়াত (নাজেরা)', payType: 'percent', payValue: 60, days: [0, 1, 2, 3, 4, 5, 6], time: '07:00', monthlyFee: 3000, guardian: 'জনাব করিম', phone: '01711000007', classLink: 'https://zoom.us/' }),
    mk('ফাতিমা খাতুন', { type: 'one2one', teacherId: t3.id, course: 'আরবি ব্যাকরণ (নাহু)', payType: 'fixed', payValue: 2500, days: [1, 4], time: '22:00', monthlyFee: 4000, phone: '+12025550108', country: 'যুক্তরাষ্ট্র', email: 'demo@example.com' }),
    mk('ইমরান খান', { type: 'one2one', teacherId: t1.id, course: 'আরবি কথোপকথন', payType: 'percent', payValue: 60, days: [5, 6], time: '21:00', monthlyFee: 3500, phone: '01711000009' }),
  ];
  d.students = [...batchSt, ...o2oSt];
  d.students.forEach((s, i) => {
    for (let k = 3; k >= 0; k--) {
      const mm = shiftMonth(m, -k);
      if (k === 0 && i % 3 === 0) continue;
      if (k <= 1 && i % 4 === 1) continue;
      const r = s.payType ? { type: s.payType, value: s.payValue } : { type: byId(d.batches, s.batchId).payType, value: byId(d.batches, s.batchId).payValue };
      const share = r.type === 'fixed' ? r.value : Math.round((s.monthlyFee * r.value) / 100);
      const tid = s.teacherId || byId(d.batches, s.batchId).teacherId;
      d.payments.push({ id: uid(), studentId: s.id, month: mm, amount: s.monthlyFee, date: mm + '-0' + (2 + (i % 4)), method: s.country === 'বাংলাদেশ' ? PAY_METHODS[i % 3] : PAY_METHODS[5], teacherId: tid, teacherShare: share });
    }
    const subject = s.type === 'one2one' ? s.course : byId(d.batches, s.batchId).subject;
    [['সাপ্তাহিক মূল্যায়ন-১', -2], ['সাপ্তাহিক মূল্যায়ন-২', -1], ['মাসিক পরীক্ষা', 0]].forEach(([title, off], j) => {
      d.exams.push({ id: uid(), studentId: s.id, title, subject, total: 50, marks: Math.min(50, 22 + ((i * 7 + j * 5) % 27)), date: shiftMonth(m, off) + '-0' + (1 + j), remark: '' });
    });
  });
  for (let k = 3; k >= 0; k--) {
    const mm = shiftMonth(m, -k);
    d.transactions.push({ id: uid(), type: 'expense', category: 'Zoom/Google Meet সাবস্ক্রিপশন', amount: 1600, date: mm + '-01', note: 'Zoom Pro' });
    d.transactions.push({ id: uid(), type: 'expense', category: 'ফেসবুক/অনলাইন বিজ্ঞাপন', amount: 3000, date: mm + '-05', note: 'ভর্তির বিজ্ঞাপন' });
    // আগের মাসগুলোর সম্মানী পরিশোধ (শেষ মাসেরটা আংশিক, যাতে বাকি দেখা যায়)
    if (k > 0) {
      for (const t of d.teachers) {
        const share = d.payments.filter((p) => p.date.startsWith(mm) && p.teacherId === t.id).reduce((a, p) => a + p.teacherShare, 0);
        const amt = k === 1 ? Math.round(share / 2) : share;
        if (amt) d.teacherPayouts.push({ id: uid(), teacherId: t.id, amount: amt, date: shiftMonth(mm, 1) + '-01', method: PAY_METHODS[0], note: monthLabel(mm) + '-এর সম্মানী' });
      }
    }
  }
  d.transactions.push({ id: uid(), type: 'income', category: 'ভর্তি/রেজিস্ট্রেশন ফি', amount: 4500, date: start, note: '৯ জন ভর্তি' });
  const out = upgrade(d);
  // স্টাফ: মাসিক সম্মানী + ভর্তি কমিশন
  const S = (name, designation, salary, commType, commValue) => ({ id: uid(), name, designation, phone: '01800000000', joinDate: start, status: 'active',
    salaryHistory: [{ from: start.slice(0, 7), amount: salary }], commType, commValue });
  const s1 = S('সাদিয়া আফরিন', 'পেজ মডারেটর', 5000, 'fixed', 300);
  const s2 = S('মাহমুদুল হাসান', 'কো-অর্ডিনেটর', 8000, 'percent', 20);
  out.staff = [s1, s2];
  out.students.forEach((st, i) => {
    if (i % 3 === 2) return;
    st.referredBy = i % 2 ? s1.id : s2.id;
    const sf = i % 2 ? s1 : s2;
    out.commissions.push({ id: st.id, staffId: sf.id, type: sf.commType, value: sf.commValue });
  });
  for (let k = 3; k >= 1; k--) {
    const mm = shiftMonth(m, -k);
    for (const sf of out.staff) out.staffPayouts.push({ id: uid(), staffId: sf.id, amount: salaryFor(sf, mm), date: shiftMonth(mm, 1) + '-02', method: PAY_METHODS[0], note: monthLabel(mm) + '-এর সম্মানী' });
  }
  out.staffEntries.push({ id: uid(), staffId: s1.id, kind: 'bonus', amount: 1000, date: shiftMonth(m, -1) + '-15', note: 'ভালো কাজের পুরস্কার' });
  return out;
}

function printStaffSlip(o) {
  const st = byId(db.staff, o.staffId) || {};
  const set = db.settings;
  const due = staffAccount(o.staffId).balance;
  const w = window.open('', '_blank');
  if (!w) return toast('পপআপ ব্লক হয়েছে — ব্রাউজারে পপআপ অনুমতি দিন');
  w.document.write(`<!doctype html><html lang="bn"><head><meta charset="utf-8"><title>পেমেন্ট স্লিপ</title>
    <style>body{font-family:"Hind Siliguri",sans-serif;max-width:420px;margin:24px auto;padding:20px;border:1px dashed #999}
    p.c{text-align:center;margin:4px 0;color:#555}table{width:100%;margin-top:16px;border-collapse:collapse}
    td{padding:6px 0;border-bottom:1px solid #eee}td:last-child{text-align:right}.sig{margin-top:48px;display:flex;justify-content:space-between}</style></head><body>
    <img src="${new URL('icons/logo.png', location.href).href}" alt="" style="display:block;width:150px;margin:0 auto 8px">
    <p class="c">${esc(set.address)} ${esc(set.phone)}</p><p class="c"><b>স্টাফ সম্মানী — পেমেন্ট স্লিপ</b></p>
    <table><tr><td>স্লিপ নং</td><td>${esc(o.id.toUpperCase())}</td></tr>
    <tr><td>নাম</td><td>${esc(st.name || '')}</td></tr><tr><td>পদ</td><td>${esc(st.designation || '')}</td></tr><tr><td>তারিখ</td><td>${fmtDate(o.date)}</td></tr>
    <tr><td>মাধ্যম</td><td>${esc(o.method || '')}</td></tr>${o.note ? `<tr><td>বিবরণ</td><td>${esc(o.note)}</td></tr>` : ''}
    <tr><td><b>পরিশোধিত টাকা</b></td><td><b>${tk(o.amount)}</b></td></tr>
    <tr><td>বর্তমানে মোট বাকি</td><td>${due < 0 ? 'অগ্রিম ' + tk(-due) : tk(due)}</td></tr></table>
    <div class="sig"><span>_____________<br>প্রদানকারী</span><span>_____________<br>গ্রহণকারী</span></div>
    <script>window.onload = () => window.print()<\/script></body></html>`);
  w.document.close();
}

/* ---------- actions ---------- */
const actions = {
  'toggle-menu': () => $('#sidebar').classList.toggle('open'),
  'close-modal': () => $('#modal').close(),
  'add-student': () => studentForm(),
  'edit-student': ({ id }) => studentForm(byId(db.students, id)),
  'del-student': ({ id }) => {
    const s = byId(db.students, id);
    if (!confirm(`"${s.name}"-কে মুছে ফেলবেন? (ছেড়ে দিলে মুছে না ফেলে "নিষ্ক্রিয়" করাই ভালো — তাতে হিসাব ঠিক থাকে)\nতাঁর পরীক্ষার ফলাফলও মুছে যাবে; ফি-এর হিসাব আয়-ব্যয়ে থেকে যাবে।`)) return;
    del('students', id, s.name);
    if (ruleDoc('s_' + id)) del('payRules', 's_' + id, s.name);
    const c = byId(db.commissions, id);
    if (c && !c.accruedDate) del('commissions', id, s.name);
    for (const e of db.exams.filter((x) => x.studentId === id)) del('exams', e.id, `${s.name} — ${e.title}`);
    commit('মুছে ফেলা হয়েছে');
  },
  'add-batch': () => batchForm(),
  'edit-batch': ({ id }) => batchForm(byId(db.batches, id)),
  'del-batch': ({ id }) => {
    if (!confirm('এই ব্যাচ মুছে ফেলবেন? এই ব্যাচের স্টুডেন্টরা ব্যাচ ছাড়া থেকে যাবে।')) return;
    const b = byId(db.batches, id);
    del('batches', id, b?.name);
    if (ruleDoc('b_' + id)) del('payRules', 'b_' + id, b?.name);
    for (const st of db.students.filter((x) => x.batchId === id)) put('students', { ...st, batchId: '' }, st.name);
    commit('মুছে ফেলা হয়েছে');
  },
  'add-teacher': () => teacherForm(),
  'edit-teacher': ({ id }) => teacherForm(byId(db.teachers, id)),
  'del-teacher': ({ id }) => {
    if (!confirm('এই শিক্ষককে মুছে ফেলবেন? তাঁর ব্যাচ/স্টুডেন্টরা শিক্ষকবিহীন হয়ে যাবে।')) return;
    const t = byId(db.teachers, id);
    del('teachers', id, t?.name);
    if (byId(db.teacherPrivate, id)) del('teacherPrivate', id, t?.name);
    for (const b of db.batches.filter((x) => x.teacherId === id)) put('batches', { ...b, teacherId: '' }, b.name);
    for (const st of db.students.filter((x) => x.teacherId === id)) put('students', { ...st, teacherId: '' }, st.name);
    for (const m of db.members.filter((x) => x.role === 'teacher' && x.teacherId === id)) del('members', m.id, m.id);
    commit('মুছে ফেলা হয়েছে');
  },
  payout: ({ id }) => payoutForm(id),
  'payroll-detail': ({ id }) => {
    state.payTeacher = id;
    if (location.hash !== '#payroll') location.hash = '#payroll';
    else render();
    setTimeout(() => document.getElementById('payroll-detail')?.scrollIntoView({ behavior: 'smooth' }), 50);
  },
  'payout-slip': ({ id }) => { const o = byId(db.teacherPayouts, id); if (o) printPayoutSlip(o); },
  'del-payout': ({ id }) => {
    if (!confirm('এই পরিশোধের এন্ট্রি মুছে ফেলবেন? শিক্ষকের বাকি আবার বেড়ে যাবে।')) return;
    const o = byId(db.teacherPayouts, id);
    del('teacherPayouts', id, o ? `${teacherName(o.teacherId)} — ${tk(o.amount)}` : '');
    commit('মুছে ফেলা হয়েছে');
  },
  'recalc-shares': () => {
    const m = state.payMonth;
    const list = db.payments.filter((p) => p.date.startsWith(m));
    if (!list.length) return toast('এই মাসে কোনো ফি জমা নেই');
    if (!confirm(`${monthLabel(m)}-এ জমা হওয়া ${num(list.length)}টি ফি-এর শিক্ষক ও শিক্ষকের অংশ এখনকার নিয়ম অনুযায়ী আবার হিসাব হবে। ঠিক আছে?`)) return;
    applyWrites(list.filter((p) => byId(db.students, p.studentId)).map((p) => ['set', 'shares', p.id, computeShare(p)]))
      .then(() => { audit('save', 'payRules', m, `${monthLabel(m)}-এর শিক্ষকের অংশ নতুন নিয়মে হিসাব`); commit('নতুন নিয়মে হিসাব হয়েছে'); });
  },
  pay: ({ id, month }) => paymentForm(id, month),
  'edit-payment': ({ id }) => { const p = byId(db.payments, id); if (p) paymentForm(p.studentId, p.month, p); },
  'del-payment': ({ id }) => {
    if (!confirm('এই ফি জমার এন্ট্রি মুছে ফেলবেন?')) return;
    const p = byId(db.payments, id);
    del('payments', id, p ? `${studentName(p.studentId)} — ${tk(p.amount)}` : '');
    if (byId(db.shares, id)) del('shares', id, false);
    commit('মুছে ফেলা হয়েছে');
  },
  receipt: ({ id }) => { const p = byId(db.payments, id); if (p) printReceipt(p); },
  'copy-reminder': ({ id }) => {
    const s = byId(db.students, id);
    navigator.clipboard?.writeText(reminderText(s, studentDues(s))).then(() => toast('মেসেজ কপি হয়েছে'), () => toast('কপি করা যায়নি'));
  },
  'add-income': () => txnForm('income'),
  'add-expense': () => txnForm('expense'),
  'edit-txn': ({ id, kind }) => { const t = byId(kind === 'expense' ? db.expenses : db.incomes, id); if (t) txnForm(kind, t); },
  'del-txn': ({ id, kind }) => {
    if (!confirm('এই লেনদেন মুছে ফেলবেন?')) return;
    const col = kind === 'expense' ? 'expenses' : 'incomes';
    const t = byId(db[col], id);
    del(col, id, t ? `${t.category} — ${tk(t.amount)}` : '');
    commit('মুছে ফেলা হয়েছে');
  },
  'view-progress': ({ id }) => {
    state.progressStudent = id;
    state.progressBatch = '';
    location.hash = '#progress';
  },
  'add-exam': () => examForm(null, state.progressStudent),
  'edit-exam': ({ id }) => examForm(byId(db.exams, id)),
  'del-exam': ({ id }) => {
    if (!confirm('এই ফলাফল মুছে ফেলবেন?')) return;
    const e = byId(db.exams, id);
    del('exams', id, e ? `${studentName(e.studentId)} — ${e.title}` : '');
    commit('মুছে ফেলা হয়েছে');
  },
  'save-settings': () => {
    put('settings', {
      ...db.settings, id: 'main',
      academyName: $('#set-name').value.trim() || 'At-Turath Academy',
      phone: $('#set-phone').value.trim(),
      address: $('#set-address').value.trim(),
      reminderTemplate: $('#set-template').value.trim() || defaultSettings().reminderTemplate,
    }, 'একাডেমির তথ্য');
    commit('সেটিংস সেভ হয়েছে');
  },
  'toggle-reports': (_, el) => {
    put('settings', { ...db.settings, id: 'main', adminReports: el.checked }, el.checked ? 'অ্যাডমিন রিপোর্ট দেখতে পারবে: চালু' : 'অ্যাডমিন রিপোর্ট দেখতে পারবে: বন্ধ');
    toast(el.checked ? 'অ্যাডমিন এখন রিপোর্ট দেখতে পারবে' : 'অ্যাডমিনের রিপোর্ট দেখা বন্ধ');
  },
  'add-member': () => memberForm(),
  't-student': ({ id }) => {
    state.tStudent = id;
    render();
    setTimeout(() => document.getElementById('t-student-detail')?.scrollIntoView({ behavior: 'smooth' }), 50);
  },
  't-edit-info': () => teacherInfoForm(),
  'add-staff': () => staffForm(),
  'edit-staff': ({ id }) => staffForm(byId(db.staff, id)),
  'del-staff': ({ id }) => {
    const st = byId(db.staff, id);
    if (!confirm(`"${st.name}"-কে মুছে ফেলবেন? চলে গেলে মুছে না ফেলে "চলে গেছেন" করাই ভালো — তাতে হিসাব থাকে।\nমুছলে তাঁর বোনাস/কর্তন ও পাওনা হিসাবও মুছে যাবে (পরিশোধ আয়-ব্যয়ে থাকবে)।`)) return;
    del('staff', id, st.name);
    for (const e of db.staffEntries.filter((x) => x.staffId === id)) del('staffEntries', e.id, st.name);
    state.staffSel = '';
    commit('মুছে ফেলা হয়েছে');
  },
  'staff-detail': ({ id }) => {
    state.staffSel = id;
    render();
    setTimeout(() => document.getElementById('staff-detail')?.scrollIntoView({ behavior: 'smooth' }), 50);
  },
  'staff-pay': ({ id }) => staffPayForm(id),
  'staff-bonus': ({ id }) => staffEntryForm(id, 'bonus'),
  'staff-deduction': ({ id }) => staffEntryForm(id, 'deduction'),
  'staff-slip': ({ id }) => { const o = byId(db.staffPayouts, id); if (o) printStaffSlip(o); },
  'del-staff-payout': ({ id }) => {
    if (!confirm('এই পরিশোধের এন্ট্রি মুছে ফেলবেন? বাকি আবার বেড়ে যাবে।')) return;
    const o = byId(db.staffPayouts, id);
    del('staffPayouts', id, o ? `${staffName(o.staffId)} — ${tk(o.amount)}` : '');
    commit('মুছে ফেলা হয়েছে');
  },
  'del-staff-entry': ({ id }) => {
    if (!confirm('এই বোনাস/কর্তন মুছে ফেলবেন?')) return;
    const e = byId(db.staffEntries, id);
    del('staffEntries', id, e ? `${staffName(e.staffId)} — ${tk(e.amount)}` : '');
    commit('মুছে ফেলা হয়েছে');
  },
  'toggle-member': ({ id }) => {
    const m = byId(db.members, id);
    if (!m) return;
    put('members', { ...m, active: m.active === false }, `${id} — ${m.active === false ? 'চালু' : 'বন্ধ'}`);
    commit(m.active === false ? 'অনুমতি চালু হয়েছে' : 'অনুমতি বন্ধ হয়েছে');
  },
  'del-member': ({ id }) => {
    if (!confirm(`${id}-এর লগইনের অনুমতি মুছে ফেলবেন? তিনি আর অ্যাপে ঢুকতে পারবেন না।`)) return;
    del('members', id, id);
    commit('অনুমতি মুছে ফেলা হয়েছে');
  },
  'reload-activity': () => { activityRows = null; render(); loadActivity(true); },
  'migrate-local': async () => {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return toast('এই ব্রাউজারে আগের কোনো ডেটা নেই');
    const data = upgrade(JSON.parse(raw));
    if (db.students.length && !confirm('অনলাইনে এখন যে ডেটা আছে তা মুছে এই ব্রাউজারের আগের ডেটা বসবে। নিশ্চিত?')) return;
    if (!db.students.length && !confirm(`এই ব্রাউজারের আগের ডেটা (${data.students.length} জন স্টুডেন্ট) অনলাইনে তোলা হবে। শুরু করবেন?`)) return;
    await importAll(data);
    // একবার তোলা হলে আর বাটন দেখাবে না; তবু কপিটা অন্য নামে রেখে দেওয়া হলো
    localStorage.setItem(STORE_KEY + '-migrated', raw);
    localStorage.removeItem(STORE_KEY);
    render();
  },
  login: () => {
    const provider = new fb.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    fb.signInWithPopup(auth, provider).catch((e) => {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e.code)) return fb.signInWithRedirect(auth, provider);
      loginError(e);
    });
  },
  logout: () => {
    if (pendingWrites > 0 && !confirm('কিছু তথ্য এখনো সেভ হচ্ছে। তবুও লগআউট করবেন?')) return;
    activityRows = null;
    fb.signOut(auth);
  },
  reload: () => location.reload(),
  export: () => {
    const { members, teacherView, teacherStatements, summaries, staffNames, ...data } = db;
    download(`academy-backup-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
    localStorage.setItem(STORE_KEY + '-last-backup', today());
    render();
  },
  'export-csv': () => exportCsv(),
  print: () => window.print(),
  'load-demo': () => {
    if (FB_MODE) return;
    if ((db.students.length || db.teachers.length) && !confirm('বর্তমান সব ডেটা মুছে ডেমো ডেটা লোড হবে। নিশ্চিত?')) return;
    db = demoData();
    saveLocal();
    commit('ডেমো ডেটা লোড হয়েছে');
  },
  reset: () => {
    if (FB_MODE) return;
    if (!confirm('সব ডেটা মুছে যাবে! আগে ব্যাকআপ নিয়েছেন তো?')) return;
    if (prompt('নিশ্চিত হলে নিচে "মুছুন" লিখুন') !== 'মুছুন') return;
    db = defaultData();
    saveLocal();
    commit('সব ডেটা মুছে ফেলা হয়েছে');
  },
};

function commit(msg) {
  if (!FB_MODE) reconcile();
  render();
  if (msg) toast(msg);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn(el.dataset, el);
});

document.addEventListener('input', (e) => {
  const key = e.target.dataset?.filter;
  if (!key) return;
  state[key] = e.target.value;
  if (key === 'progressBatch') state.progressStudent = '';
  if (key.endsWith('Month') && !e.target.value) state[key] = thisMonth();
  render(e.target.id);
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'set-reports') return actions['toggle-reports']({}, e.target);
  if (e.target.id !== 'import-file') return;
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let data;
    try {
      data = upgrade(JSON.parse(reader.result));
    } catch (err) {
      return alert('ফাইলটা সঠিক ব্যাকআপ ফাইল নয়।');
    }
    if (!confirm(`ব্যাকআপে ${data.students.length} জন স্টুডেন্ট, ${data.teachers.length} জন শিক্ষক আছে। বর্তমান ডেটা বদলে এটা লোড করবেন?`)) return;
    await importAll(data);
  };
  reader.readAsText(file);
  e.target.value = '';
});

/* =========================================================
 * ডেটা সেভ করা (store)
 * লোকাল মোডে localStorage-এ, Firebase মোডে Firestore-এ।
 * প্রতিটা পরিবর্তন কার্যক্রমের রেকর্ডে (auditLog) যায়।
 * ========================================================= */
let fb = null;
let fs = null;
let auth = null;
let pendingWrites = 0;

const AUDITED = new Set(['teachers', 'teacherPrivate', 'batches', 'students', 'exams', 'payments', 'incomes', 'expenses', 'payRules',
  'teacherPayouts', 'staff', 'staffPayouts', 'staffEntries', 'commissions', 'members', 'settings']);
const COL_LABEL = {
  teachers: 'শিক্ষক', teacherPrivate: 'শিক্ষকের পেমেন্ট তথ্য', batches: 'ব্যাচ', students: 'স্টুডেন্ট', exams: 'পরীক্ষার ফলাফল',
  payments: 'ফি জমা', incomes: 'আয়', expenses: 'খরচ', payRules: 'শিক্ষকের অংশের নিয়ম', teacherPayouts: 'শিক্ষককে পরিশোধ',
  staff: 'স্টাফ', staffPayouts: 'স্টাফকে পরিশোধ', staffEntries: 'স্টাফের বোনাস/কর্তন', commissions: 'কমিশন', members: 'লগইনের অনুমতি', settings: 'সেটিংস',
};

function localApply(col, obj) {
  if (col === 'settings') { const { id, ...rest } = obj; db.settings = Object.assign(defaultSettings(), rest); return; }
  const arr = db[col];
  const i = arr.findIndex((x) => x.id === obj.id);
  if (i >= 0) arr[i] = obj;
  else arr.push(obj);
}

function track(promise) {
  pendingWrites++;
  updateSyncBadge();
  promise
    .catch((e) => {
      console.error(e);
      toast(e.code === 'permission-denied' ? '⛔ এই কাজের অনুমতি নেই' : '❌ সেভ হয়নি: ' + (e.code || e.message));
    })
    .finally(() => { pendingWrites--; updateSyncBadge(); });
}

function audit(action, col, id, label) {
  if (!FB_MODE || !AUDITED.has(col)) return;
  const entry = { at: new Date().toISOString(), by: me.email, role: me.role, action, col, docId: id, label: String(label || '').slice(0, 200) };
  track(fb.setDoc(fb.doc(fs, 'auditLog', uid()), entry));
}

/** একটা ডকুমেন্ট সেভ (নতুন বা আপডেট) */
function put(col, obj, label) {
  if (!obj.id) obj.id = uid();
  const data = clean(obj);
  if (FB_MODE) { data.by = me.email; data.at = new Date().toISOString(); }
  localApply(col, data);
  if (!FB_MODE) { saveLocal(); return data; }
  const { id, ...rest } = data;
  track(fb.setDoc(fb.doc(fs, col, id), rest));
  audit('save', col, id, label);
  return data;
}

/** একটা ডকুমেন্ট মুছে ফেলা */
function del(col, id, label) {
  if (!id) return;
  db[col] = db[col].filter((x) => x.id !== id);
  if (!FB_MODE) { saveLocal(); return; }
  track(fb.deleteDoc(fb.doc(fs, col, id)));
  audit('delete', col, id, label);
}

/** অনেকগুলো লেখা একসাথে (Firestore-এ ৪০০টা করে) */
async function applyWrites(writes) {
  if (!writes.length) return;
  if (!FB_MODE) {
    for (const [op, col, id, data] of writes) {
      if (op === 'del') db[col] = db[col].filter((x) => x.id !== id);
      else localApply(col, { ...clean(data), id });
    }
    saveLocal();
    return;
  }
  for (let i = 0; i < writes.length; i += 400) {
    const batch = fb.writeBatch(fs);
    for (const [op, col, id, data] of writes.slice(i, i + 400)) {
      const ref = fb.doc(fs, col, id);
      if (op === 'del') batch.delete(ref);
      else { const { id: _, ...rest } = clean(data); batch.set(ref, rest); }
    }
    pendingWrites++;
    updateSyncBadge();
    try { await batch.commit(); } catch (e) { console.error(e); toast('❌ সেভ হয়নি: ' + (e.code || e.message)); } finally { pendingWrites--; updateSyncBadge(); }
  }
}

/** ব্যাকআপ বা পুরোনো ডেটা পুরোপুরি বসানো (members ছাড়া) */
async function importAll(data) {
  if (!FB_MODE) {
    db = data;
    saveLocal();
    return commit('ব্যাকআপ থেকে ডেটা ফেরত আনা হয়েছে');
  }
  const DERIVED = new Set(['teacherView', 'teacherStatements', 'summaries', 'staffNames', 'members']);
  const writes = [];
  for (const c of COLLECTIONS) {
    if (DERIVED.has(c)) continue;
    const keep = new Set(data[c].map((x) => x.id));
    for (const x of db[c]) if (!keep.has(x.id)) writes.push(['del', c, x.id]);
    for (const x of data[c]) writes.push(['set', c, x.id, x]);
  }
  writes.push(['set', 'settings', 'main', data.settings]);
  toast(`⏳ ${num(writes.length)}টি তথ্য অনলাইনে তোলা হচ্ছে…`);
  await applyWrites(writes);
  audit('import', 'settings', 'main', `ব্যাকআপ থেকে ${data.students.length} স্টুডেন্টের ডেটা আনা হয়েছে`);
  toast('✅ সব ডেটা অনলাইনে তোলা হয়েছে');
}

/* =========================================================
 * নিজে থেকে হওয়া হিসাব (reconcile)
 * মালিকের অ্যাপ: প্রতিটা ফি-এর শিক্ষকের অংশ, কমিশন, শিক্ষকের বিবরণী, রিপোর্টের সারাংশ।
 * মালিক/অ্যাডমিন: শিক্ষকের দেখার তথ্য (teacherView)।
 * শুধু যা বদলেছে তা-ই লেখা হয়।
 * ========================================================= */
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const strip = ({ id, by, at, ...rest }) => rest;
const sameDoc = (a, b) => stable(strip(clean(a))) === stable(strip(clean(b)));

function diffInto(col, want, writes) {
  const have = new Map(db[col].map((x) => [x.id, x]));
  for (const w of want) {
    const h = have.get(w.id);
    if (!h || !sameDoc(h, w)) writes.push(['set', col, w.id, w]);
    have.delete(w.id);
  }
  for (const id of have.keys()) writes.push(['del', col, id]);
}

function buildTeacherViews() {
  const out = [];
  for (const b of db.batches) {
    if (!b.teacherId) continue;
    const n = db.students.filter((s) => !isOne2One(s) && s.batchId === b.id && s.status !== 'inactive').length;
    out.push({ id: 'b_' + b.id, kind: 'batch', teacherId: b.teacherId, name: b.name, subject: b.subject || '', days: daysOf(b), time: b.time || '', link: b.classLink || '', count: n });
  }
  for (const s of db.students) {
    if (s.status === 'inactive') continue;
    const tid = studentTeacherId(s);
    if (!tid) continue;
    const b = byId(db.batches, s.batchId);
    const exams = db.exams.filter((e) => e.studentId === s.id)
      .map((e) => ({ title: e.title || '', subject: e.subject || '', marks: Number(e.marks) || 0, total: Number(e.total) || 0, date: e.date || '', remark: e.remark || '' }))
      .sort((x, y) => (x.date < y.date ? -1 : 1));
    out.push({
      id: 's_' + s.id, kind: 'student', teacherId: tid, name: s.name, roll: s.roll || '', one2one: isOne2One(s),
      classLabel: isOne2One(s) ? 'ওয়ান-টু-ওয়ান' + (s.course ? ' · ' + s.course : '') : batchName(s.batchId),
      days: isOne2One(s) ? daysOf(s) : daysOf(b), time: isOne2One(s) ? s.time || '' : b?.time || '', link: classLink(s) || '', exams,
    });
  }
  return out;
}

function buildTeacherStatements() {
  return payTeachers().map((t) => {
    const months = {};
    const add = (m, k, v) => { (months[m] ||= { share: 0, paid: 0 })[k] += v; };
    for (const p of db.payments) if (paymentTeacher(p) === t.id) add(p.date.slice(0, 7), 'share', paymentShare(p));
    const outs = db.teacherPayouts.filter((o) => o.teacherId === t.id);
    for (const o of outs) add(o.date.slice(0, 7), 'paid', Number(o.amount) || 0);
    const balance = Object.values(months).reduce((a, x) => a + x.share - x.paid, 0);
    const payouts = outs.sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 24)
      .map((o) => ({ date: o.date, amount: Number(o.amount) || 0, method: o.method || '', note: o.note || '' }));
    return { id: t.id, months, balance, payouts };
  });
}

function buildSummaries() {
  const by = {};
  for (const r of ledger()) {
    const m = String(r.date).slice(0, 7);
    const x = (by[m] ||= { id: m, income: 0, expense: 0, cats: {} });
    x[r.type] += Number(r.amount) || 0;
    const key = r.type + '|' + r.category;
    x.cats[key] = (x.cats[key] || 0) + (Number(r.amount) || 0);
  }
  return Object.values(by);
}

let reconciling = false;
async function reconcile() {
  if (reconciling || !isStaffRole() || (FB_MODE && !allSynced())) return;
  reconciling = true;
  try {
    const writes = [];
    if (FB_MODE) diffInto('teacherView', buildTeacherViews(), writes);
    if (isOwnerRole()) {
      // প্রতিটা ফি-এর শিক্ষক ও অংশ (অ্যাডমিন ফি নিলে মালিকের অ্যাপ এটা যোগ করে)
      for (const p of db.payments) if (!byId(db.shares, p.id)) writes.push(['set', 'shares', p.id, computeShare(p)]);
      for (const sh of db.shares) if (!byId(db.payments, sh.id)) writes.push(['del', 'shares', sh.id]);
      // নতুন ভর্তির কমিশন: স্টাফের তখনকার নিয়ম সেভ
      for (const s of db.students) {
        if (!s.referredBy || byId(db.commissions, s.id)) continue;
        const st = byId(db.staff, s.referredBy);
        writes.push(['set', 'commissions', s.id, { id: s.id, staffId: s.referredBy, type: st?.commType || 'none', value: Number(st?.commValue) || 0 }]);
      }
      // প্রথম ফি এলে কমিশন পাওনা — অঙ্কটা সেভ করে রাখা
      for (const c of db.commissions) {
        const st = byId(db.students, c.id);
        if (!st && !c.accruedDate) { writes.push(['del', 'commissions', c.id]); continue; }
        if (c.accruedDate) continue;
        const fp = firstPayment(c.id);
        if (fp) writes.push(['set', 'commissions', c.id, { ...c, accruedDate: fp.date, accruedAmount: commissionAmount(c, st) }]);
      }
      if (FB_MODE) {
        diffInto('teacherStatements', buildTeacherStatements(), writes);
        diffInto('summaries', buildSummaries(), writes);
        diffInto('staffNames', db.staff.map((x) => ({ id: x.id, name: x.name, active: x.status !== 'inactive' })), writes);
      }
    }
    await applyWrites(writes);
  } finally {
    reconciling = false;
  }
}

/* =========================================================
 * Firebase: লগইন ও লাইভ ডেটা
 * ========================================================= */
const listeners = [];
const synced = new Map(); // কালেকশন -> সার্ভার থেকে অন্তত একবার এসেছে কিনা
const received = new Set(); // কালেকশন -> অন্তত একবার এসেছে (ক্যাশ থেকে হলেও)
let firstRenderDone = false;
let lastReportsFlag = null;
const allSynced = () => [...synced.values()].every(Boolean);

async function initFirebase() {
  showScreen('loading');
  try {
    fb = await import('./vendor/firebase.js');
  } catch (e) {
    return showScreen('error', 'অ্যাপ লোড করা যায়নি। ইন্টারনেট সংযোগ দেখে পেজটা রিফ্রেশ করুন।');
  }
  const app = fb.initializeApp(FB_CONFIG);
  auth = fb.getAuth(app);
  fs = fb.initializeFirestore(app, EMULATOR ? {} : { localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) });
  if (EMULATOR) {
    fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    fb.connectFirestoreEmulator(fs, '127.0.0.1', 8085);
    window.__testLogin = (email) => fb.signInWithCredential(auth, fb.GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })));
  }
  fb.getRedirectResult(auth).catch((e) => loginError(e));
  fb.onAuthStateChanged(auth, onUser);
}

function stopListeners() {
  listeners.splice(0).forEach((u) => u());
  synced.clear();
  received.clear();
}

async function onUser(user) {
  stopListeners();
  db = defaultData();
  firstRenderDone = false;
  lastReportsFlag = null;
  Object.assign(me, { email: '', role: '', teacherId: '', name: '' });
  if (!user) return showScreen('login');
  me.email = (user.email || '').toLowerCase();
  me.name = user.displayName || '';
  showScreen('loading');
  if (me.email && me.email === OWNER) {
    me.role = 'owner';
  } else {
    try {
      const snap = await fb.getDoc(fb.doc(fs, 'members', me.email));
      const m = snap.exists() ? snap.data() : null;
      if (m && m.active !== false && (m.role === 'admin' || (m.role === 'teacher' && m.teacherId))) {
        me.role = m.role;
        me.teacherId = m.teacherId || '';
      }
    } catch (e) {
      console.error(e);
      return showScreen('error', 'অনুমতি যাচাই করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।');
    }
  }
  if (!me.role) return showScreen('noaccess');
  subscribeAll();
}

function listen(name, ref, { single = false, optional = false } = {}) {
  synced.set(name, false);
  const unsub = fb.onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
    if (single) {
      if (name === 'settings') db.settings = Object.assign(defaultSettings(), snap.exists() ? snap.data() : {});
      else db[name] = snap.exists() ? [{ id: snap.id, ...snap.data() }] : [];
    } else {
      db[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    received.add(name);
    if (!snap.metadata.fromCache) synced.set(name, true);
    onData();
  }, (err) => {
    if (!optional) console.error(name, err);
    if (name !== 'settings') db[name] = [];
    received.add(name);
    synced.set(name, true);
    onData();
  });
  listeners.push(unsub);
}

function subscribeAll() {
  const col = (c) => fb.collection(fs, c);
  listen('settings', fb.doc(fs, 'settings', 'main'), { single: true });
  if (isOwnerRole()) {
    for (const c of COLLECTIONS) listen(c, col(c));
  } else if (isAdminRole()) {
    for (const c of ['teachers', 'teacherView', 'batches', 'students', 'exams', 'payments', 'incomes', 'staffNames']) listen(c, col(c));
  } else if (isTeacherRole()) {
    listen('teacherView', fb.query(col('teacherView'), fb.where('teacherId', '==', me.teacherId)));
    listen('teachers', fb.doc(fs, 'teachers', me.teacherId), { single: true });
    listen('teacherPrivate', fb.doc(fs, 'teacherPrivate', me.teacherId), { single: true });
    listen('teacherStatements', fb.doc(fs, 'teacherStatements', me.teacherId), { single: true });
  }
}

let renderTimer = null;
let renderWaiting = false;
function onData() {
  // অ্যাডমিন: সেটিংসে রিপোর্টের সুইচ বদলালে রিপোর্টের সারাংশ শোনা শুরু/বন্ধ
  if (isAdminRole() && received.has('settings') && lastReportsFlag !== !!db.settings.adminReports) {
    lastReportsFlag = !!db.settings.adminReports;
    if (lastReportsFlag) listen('summaries', fb.collection(fs, 'summaries'), { optional: true });
    else db.summaries = [];
  }
  if (!firstRenderDone) {
    if ([...synced.keys()].every((k) => received.has(k))) {
      firstRenderDone = true;
      document.body.classList.remove('auth');
      render();
    }
  } else {
    scheduleRender();
  }
  if (allSynced()) scheduleReconcile();
}

/** লাইভ আপডেট এলে পেজ নতুন করে আঁকা, তবে কেউ টাইপ করার সময় নয় */
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    const a = document.activeElement;
    if (a && a.closest && a.closest('#main') && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && !a.dataset.filter) {
      if (!renderWaiting) {
        renderWaiting = true;
        a.addEventListener('blur', () => { renderWaiting = false; scheduleRender(); }, { once: true });
      }
      return;
    }
    if (!$('#modal').open) render();
    else scheduleRender._afterModal = true;
  }, 80);
}
$('#modal').addEventListener('close', () => { if (scheduleRender._afterModal) { scheduleRender._afterModal = false; render(); } });

let recTimer = null;
function scheduleReconcile() {
  clearTimeout(recTimer);
  recTimer = setTimeout(reconcile, 1500);
}

function loginError(e) {
  if (!e || e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
  console.error(e);
  if (e.code === 'auth/unauthorized-domain') {
    const url = `https://console.firebase.google.com/project/${FB_CONFIG.projectId}/authentication/settings`;
    $('#main').innerHTML = `<div class="login-card"><img src="icons/logo.png" alt="" class="login-logo">
      <p>⚠️ লগইন চালু করতে আরেকটা ধাপ বাকি: Firebase-এ <b>${esc(location.hostname)}</b> ঠিকানাটা "Authorized domains"-এ যোগ করতে হবে।</p>
      <p><a class="btn primary" target="_blank" rel="noopener" href="${esc(url)}">Firebase-এর সেই পেজ খুলুন</a></p>
      <p class="muted">সেখানে Authorized domains → Add domain → <b>${esc(location.hostname)}</b> লিখে Add চাপুন, তারপর এই পেজ রিফ্রেশ করুন।</p></div>`;
    return;
  }
  alert('লগইন করা যায়নি: ' + (e.code || e.message));
}

const ROLE_LABEL = { owner: 'মালিক', admin: 'অ্যাডমিন', teacher: 'শিক্ষক' };

function showScreen(kind, msg = '') {
  document.body.classList.add('auth');
  $('#sidebar').innerHTML = '';
  updateSyncBadge();
  const logo = '<img src="icons/logo.png" alt="At-Turath Academy" class="login-logo">';
  let body = '';
  if (kind === 'loading') body = '<p class="muted">⏳ লোড হচ্ছে…</p>';
  else if (kind === 'login') body = `<p>অ্যাপে ঢুকতে আপনার Google (Gmail) অ্যাকাউন্ট দিয়ে লগইন করুন।</p>
    <button class="btn primary big" data-action="login">Google দিয়ে লগইন করুন</button>`;
  else if (kind === 'noaccess') body = `<p>⛔ <b>${esc(me.email)}</b> অ্যাকাউন্টে এই অ্যাপ ব্যবহারের অনুমতি নেই।</p>
    <p class="muted">একাডেমির মালিককে আপনার এই Gmail ঠিকানাটা দিয়ে অনুমতি দিতে বলুন। অনুমতি পেলে আবার লগইন করুন।</p>
    <button class="btn" data-action="logout">অন্য অ্যাকাউন্ট দিয়ে লগইন</button>`;
  else body = `<p>❌ ${esc(msg)}</p><button class="btn" data-action="reload">আবার চেষ্টা করুন</button>`;
  $('#main').innerHTML = `<div class="login-card">${logo}${body}</div>`;
}

/* ---------- উপরের কোণের অবস্থা ---------- */
function updateSyncBadge() {
  const el = $('#sync-status');
  if (!el) return;
  let text = '';
  let cls = 'sync';
  let title = '';
  if (!FB_MODE) { text = '💻 লোকাল মোড'; cls += ' warn'; title = 'ডেটা শুধু এই ব্রাউজারে আছে'; }
  else if (!me.role) { cls += ' hidden'; }
  else if (!navigator.onLine) { text = '📴 অফলাইন — পরে সেভ হবে'; cls += ' warn'; }
  else if (pendingWrites > 0) text = '⏳ সেভ হচ্ছে…';
  else text = '☁️ সেভ আছে';
  el.textContent = text;
  el.className = cls;
  el.title = title || (me.email ? `${me.email} (${ROLE_LABEL[me.role] || ''})` : '');
}
window.addEventListener('online', updateSyncBadge);
window.addEventListener('offline', updateSyncBadge);
window.addEventListener('beforeunload', (e) => {
  if (pendingWrites > 0 && navigator.onLine) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------- router ---------- */
function navFor() {
  if (isTeacherRole()) {
    return [['t-classes', '📅 আমার ক্লাস'], ['t-students', '🎓 আমার স্টুডেন্ট'], ['t-account', '💵 আমার হিসাব'], ['t-info', '👤 আমার তথ্য']];
  }
  const items = [
    ['dashboard', '📊 ড্যাশবোর্ড'], ['students', '🎓 স্টুডেন্ট'], ['batches', '📚 ব্যাচ'], ['teachers', '👩‍🏫 শিক্ষক ও এসাইনমেন্ট'],
  ];
  if (isOwnerRole()) items.push(['payroll', '💵 শিক্ষকের হিসাব'], ['staff', '👥 স্টাফ ও সম্মানী']);
  items.push(['routine', '📅 ক্লাস রুটিন'], ['fees', '💰 ফি ও রিমাইন্ডার'], ['accounts', isOwnerRole() ? '📒 আয়-ব্যয়' : '📒 আয়'], ['progress', '📈 পড়াশোনার প্রগ্রেস']);
  if (canSeeReports()) items.push(['reports', '🧾 রিপোর্ট']);
  if (isOwnerRole() && FB_MODE) items.push(['activity', '🕘 কার্যক্রম']);
  items.push(['settings', isOwnerRole() ? '⚙️ সেটিংস ও ব্যাকআপ' : '⚙️ সেটিংস']);
  return items;
}

function render(focusId) {
  if (FB_MODE && (!me.role || !firstRenderDone)) return;
  const items = navFor();
  let route = (location.hash.slice(1) || items[0][0]).split('?')[0];
  if (!items.some((i) => i[0] === route)) route = items[0][0];
  const view = views[route];
  const user = FB_MODE ? `<div class="userbox"><div>${me.name ? `<b>${esc(me.name)}</b><br>` : ''}<span class="muted">${esc(me.email)} · ${ROLE_LABEL[me.role]}</span></div>
    <button class="btn sm" data-action="logout">লগআউট</button></div>` : '';
  $('#sidebar').innerHTML = items.map(([r, l]) => `<a href="#${r}" data-route="${r}" class="${r === route ? 'active' : ''}">${l}</a>`).join('') + user;
  $('#main').innerHTML = view();
  $('#academy-name').textContent = db.settings.academyName;
  document.title = db.settings.academyName + ' — ম্যানেজমেন্ট';
  updateSyncBadge();
  if (route === 'activity') loadActivity();
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus(); const n = el.value.length; el.setSelectionRange?.(n, n); }
  }
}

window.addEventListener('hashchange', () => {
  $('#sidebar').classList.remove('open');
  render();
  window.scrollTo(0, 0);
});

// লোকাল মোড: অন্য ট্যাবে ডেটা বদলালে এখানেও আপডেট
window.addEventListener('storage', (e) => {
  if (!FB_MODE && e.key === STORE_KEY) { db = loadLocal(); render(); }
});

if (FB_MODE) initFirebase();
else { reconcile(); render(); }
