'use strict';

/* =========================================================
 * একাডেমি ম্যানেজমেন্ট সিস্টেম — v1
 * সব ডেটা ব্রাউজারের localStorage-এ থাকে। নিয়মিত ব্যাকআপ নিন
 * (সেটিংস → ব্যাকআপ ডাউনলোড)।
 * ========================================================= */

const STORE_KEY = 'academy-ms-v1';
const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const PAY_METHODS = ['বিকাশ', 'নগদ', 'রকেট', 'ব্যাংক ট্রান্সফার', 'কার্ড/অনলাইন গেটওয়ে', 'PayPal/Wise/Payoneer (বিদেশ)', 'ক্যাশ'];
const INCOME_CATS = ['ভর্তি/রেজিস্ট্রেশন ফি', 'কোর্স ফি (এককালীন)', 'পরীক্ষা/সার্টিফিকেট ফি', 'বই/PDF/রেকর্ডেড কোর্স বিক্রি', 'অনুদান', 'অন্যান্য আয়'];
const EXPENSE_CATS = ['শিক্ষক সম্মানী', 'স্টাফ/মডারেটর সম্মানী', 'Zoom/Google Meet সাবস্ক্রিপশন', 'ওয়েবসাইট/ডোমেইন/হোস্টিং', 'সফটওয়্যার/অ্যাপ', 'ফেসবুক/অনলাইন বিজ্ঞাপন', 'পেমেন্ট গেটওয়ে/ক্যাশআউট চার্জ', 'ইন্টারনেট', 'ডিজাইন/কনটেন্ট তৈরি', 'অন্যান্য ব্যয়'];

const defaultData = () => ({
  version: 1,
  settings: {
    academyName: 'At-Turath Academy',
    email: '',
    phone: '',
    address: '',
    reminderTemplate: 'আসসালামু আলাইকুম, {guardian}। {academy} থেকে জানানো যাচ্ছে যে {student}-এর {months} মাসের ফি মোট {amount} টাকা বকেয়া আছে। অনুগ্রহ করে দ্রুত পরিশোধ করুন। ধন্যবাদ।',
  },
  teachers: [],
  batches: [],
  students: [],
  payments: [],
  transactions: [],
  exams: [],
});

/* ---------- storage ---------- */
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) {
    console.error(e);
  }
  return defaultData();
}

function normalize(d) {
  const base = defaultData();
  const out = Object.assign(base, d);
  out.settings = Object.assign(defaultData().settings, d.settings || {});
  for (const k of ['teachers', 'batches', 'students', 'payments', 'transactions', 'exams']) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  return out;
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch (e) {
    alert('ডেটা সেভ করা যায়নি: ' + e.message);
  }
}

let db = load();

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

/** একটা মাসের সব আয় (ফি + অন্যান্য আয়) ও ব্যয় একসাথে */
function ledger(month) {
  const rows = [];
  for (const p of db.payments) {
    if (month && !p.date.startsWith(month)) continue;
    rows.push({
      id: p.id, kind: 'payment', type: 'income', date: p.date, amount: p.amount,
      category: isOne2One(byId(db.students, p.studentId)) ? 'মাসিক ফি (ওয়ান-টু-ওয়ান)' : 'মাসিক ফি (ব্যাচ)', note: `${studentName(p.studentId)} — ${monthLabel(p.month)}${p.method ? ' (' + p.method + ')' : ''}`,
    });
  }
  for (const t of db.transactions) {
    if (month && !t.date.startsWith(month)) continue;
    rows.push({ id: t.id, kind: 'txn', type: t.type, date: t.date, amount: t.amount, category: t.category, note: t.note || '' });
  }
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
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
    if (f.type === 'select') {
      input = `<select name="${f.name}" ${req}>${opts(f.options, v, f.placeholder)}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea name="${f.name}" ${req}>${esc(v)}</textarea>`;
    } else {
      const extra = f.type === 'number' ? 'min="0" step="any"' : '';
      input = `<input type="${f.type || 'text'}" name="${f.name}" value="${esc(v)}" ${req} ${extra}>`;
    }
    const cond = f.showIf ? `data-show-if="${f.showIf[0]}" data-show-values="${f.showIf[1].join(',')}"` : '';
    return `<div class="field" ${cond}><label>${f.label}${f.required ? ' *' : ''}</label>${input}</div>`;
  }).join('');
  updateConditionalFields();
  modalSubmit = (fd) => {
    const out = {};
    for (const f of fields) {
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
    el.querySelectorAll('input,select,textarea').forEach((i) => { i.disabled = !show; });
  });
}
$('#modal-body').addEventListener('change', updateConditionalFields);

$('#modal-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!modalSubmit) return;
  const keepOpen = modalSubmit(new FormData(e.target)) === false;
  if (keepOpen) return;
  save();
  $('#modal').close();
  render();
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
};

/* ---------- views ---------- */
const views = {};

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

  const firstRun = !db.students.length && !db.teachers.length ? `
    <div class="note">👋 স্বাগতম! শুরু করতে প্রথমে <b>সেটিংস</b>-এ একাডেমির নাম দিন, তারপর
    <b>শিক্ষক → ব্যাচ → স্টুডেন্ট</b> এই ক্রমে যোগ করুন (ওয়ান-টু-ওয়ান স্টুডেন্টের জন্য ব্যাচ লাগে না)। শুধু দেখার জন্য চাইলে
    <button class="btn sm" data-action="load-demo">ডেমো ডেটা লোড করুন</button></div>` : '';

  return `
    <h2>ড্যাশবোর্ড — ${monthLabel(m)}</h2>
    ${firstRun}
    <div class="cards">
      ${card('এ মাসের আয়', tk(t.income), 'green')}
      ${card('এ মাসের ব্যয়', tk(t.expense), 'red')}
      ${card('এ মাসের লাভ/ক্ষতি', tk(t.net), t.net >= 0 ? 'green' : 'red')}
      ${card('এ মাসের ফি আদায়', `${tk(collectedThisMonth)} <span class="muted" style="font-size:14px">/ ${tk(expectedThisMonth)}</span>`, 'blue')}
      ${card('মোট বকেয়া', tk(sum(dues, 'total')), 'red')}
      ${card('বকেয়া আছে এমন স্টুডেন্ট', num(dues.length))}
      ${card('সক্রিয় স্টুডেন্ট', num(active.length))}
      ${card('ব্যাচে / ওয়ান-টু-ওয়ান', `${num(active.length - o2oCount)} / ${num(o2oCount)}`)}
      ${card('শিক্ষক / ব্যাচ', `${num(db.teachers.length)} / ${num(db.batches.length)}`)}
    </div>
    <h3>সবচেয়ে বেশি বকেয়া — রিমাইন্ডার পাঠান</h3>
    ${table(['স্টুডেন্ট', 'ব্যাচ/ধরন', 'বকেয়া মাস', ['মোট', 'num'], ['রিমাইন্ডার', 'actions']], dueRows, '🎉 কোনো বকেয়া নেই')}
    ${dues.length > 8 ? '<p><a href="#fees">সব বকেয়া দেখুন →</a></p>' : ''}
    <h3>সাম্প্রতিক লেনদেন</h3>
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
        <button class="btn sm danger" data-action="del-student" data-id="${s.id}">মুছুন</button>
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
      <td>${esc(b.schedule)}</td><td class="num">${tk(b.fee)}</td><td class="num">${num(count)}</td>
      <td class="actions">
        ${b.classLink ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(b.classLink)}">ক্লাস লিংক</a>` : ''}
        <button class="btn sm" data-action="edit-batch" data-id="${b.id}">এডিট</button>
        <button class="btn sm danger" data-action="del-batch" data-id="${b.id}">মুছুন</button>
      </td></tr>`;
  });
  return `
    <h2>ব্যাচ</h2>
    <div class="toolbar"><span class="spacer"></span><button class="btn primary" data-action="add-batch">+ নতুন ব্যাচ</button></div>
    ${table(['ব্যাচের নাম', 'বিষয়', 'দায়িত্বপ্রাপ্ত শিক্ষক', 'সময়সূচি', ['মাসিক ফি', 'num'], ['স্টুডেন্ট', 'num'], ['', 'actions']], rows, 'এখনো কোনো ব্যাচ নেই')}
  `;
};

views.teachers = () => {
  const m = thisMonth();
  const activeOf = (t) => db.students.filter((s) => s.status !== 'inactive' && studentTeacherId(s) === t.id);
  const rows = db.teachers.map((t) => {
    const batches = db.batches.filter((b) => b.teacherId === t.id);
    const students = activeOf(t);
    const o2o = students.filter(isOne2One);
    const collected = sum(db.payments.filter((p) => p.month === m && students.some((s) => s.id === p.studentId)));
    return `<tr><td><b>${esc(t.name)}</b><br><span class="muted">${esc(t.phone)}</span></td><td>${esc(t.subject)}</td>
      <td>${batches.map((b) => esc(b.name)).join(', ') || '—'}</td>
      <td class="num">${num(o2o.length)}</td><td class="num">${num(students.length)}</td>
      <td class="num">${tk(collected)}</td>
      <td class="num">${t.salary ? tk(t.salary) : '—'}</td>
      <td class="actions">
        <button class="btn sm success" data-action="pay-teacher" data-id="${t.id}">সম্মানী দিন</button>
        <button class="btn sm" data-action="edit-teacher" data-id="${t.id}">এডিট</button>
        <button class="btn sm danger" data-action="del-teacher" data-id="${t.id}">মুছুন</button>
      </td></tr>`;
  });

  const unassigned = db.students.filter((s) => s.status !== 'inactive' && !studentTeacherId(s));
  const cards = db.teachers.map((t) => {
    const batches = db.batches.filter((b) => b.teacherId === t.id);
    const batchHtml = batches.map((b) => {
      const st = db.students.filter((s) => !isOne2One(s) && s.batchId === b.id && s.status !== 'inactive' && (!s.teacherId || s.teacherId === t.id));
      return `<li><b>${esc(b.name)}</b> <span class="muted">(${num(st.length)} জন${b.schedule ? ' · ' + esc(b.schedule) : ''})</span></li>`;
    }).join('');
    const o2o = activeOf(t).filter(isOne2One).map((s) =>
      `<li>${esc(s.name)} <span class="muted">(${esc(s.course || 'ওয়ান-টু-ওয়ান')}${s.schedule ? ' · ' + esc(s.schedule) : ''})</span></li>`).join('');
    const other = activeOf(t).filter((s) => !isOne2One(s) && !batches.some((b) => b.id === s.batchId))
      .map((s) => `<li>${esc(s.name)} <span class="muted">(${esc(classLabel(s))} থেকে আলাদাভাবে)</span></li>`).join('');
    return `<div class="panel"><h3>👩‍🏫 ${esc(t.name)}</h3>
      <div class="muted">ব্যাচ</div><ul>${batchHtml || '<li class="muted">নেই</li>'}</ul>
      <div class="muted" style="margin-top:8px">ওয়ান-টু-ওয়ান</div><ul>${o2o || '<li class="muted">নেই</li>'}</ul>
      ${other ? `<div class="muted" style="margin-top:8px">অন্য ব্যাচ থেকে এসাইন করা</div><ul>${other}</ul>` : ''}</div>`;
  }).join('');

  return `
    <h2>শিক্ষক ও এসাইনমেন্ট</h2>
    <div class="toolbar"><span class="spacer"></span><button class="btn primary" data-action="add-teacher">+ নতুন শিক্ষক</button></div>
    ${table(['নাম', 'বিষয়', 'ব্যাচ', ['ওয়ান-টু-ওয়ান', 'num'], ['মোট স্টুডেন্ট', 'num'], [`${BN_MONTHS[Number(m.slice(5)) - 1]}-এ ফি আদায়`, 'num'], ['নির্দিষ্ট সম্মানী', 'num'], ['', 'actions']], rows, 'এখনো কোনো শিক্ষক যোগ করা হয়নি')}
    <p class="muted">"ফি আদায়" কলামে দেখায় ওই শিক্ষকের স্টুডেন্টদের কাছ থেকে এ মাসে কত ফি এসেছে। শিক্ষককে শতাংশ হারে সম্মানী দিলে এটা দেখে হিসাব করতে পারবেন।</p>
    <h3>কোন ব্যাচ/স্টুডেন্ট কার কাছে</h3>
    <p class="muted">ব্যাচে শিক্ষক এসাইন করলে সেই ব্যাচের সব স্টুডেন্ট তাঁর কাছে যায়। ওয়ান-টু-ওয়ান স্টুডেন্টের শিক্ষক স্টুডেন্ট যোগ করার সময়ই বাছাই করা হয়।</p>
    <div class="assign-grid">${cards}</div>
    ${unassigned.length ? `<div class="note">⚠️ ${num(unassigned.length)} জন স্টুডেন্ট কোনো শিক্ষকের কাছে এসাইন করা নেই: ${unassigned.map((s) => esc(s.name)).join(', ')}</div>` : ''}
  `;
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
    <button class="btn sm danger" data-action="del-payment" data-id="${p.id}">মুছুন</button></td></tr>`);

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
    <td class="actions">${r.kind === 'txn'
      ? `<button class="btn sm" data-action="edit-txn" data-id="${r.id}">এডিট</button> <button class="btn sm danger" data-action="del-txn" data-id="${r.id}">মুছুন</button>`
      : `<button class="btn sm" data-action="receipt" data-id="${r.id}">রসিদ</button>`}</td></tr>`);

  return `
    <h2>আয়-ব্যয়</h2>
    <div class="toolbar">
      <label>মাস: <input type="month" data-filter="accMonth" value="${m}"></label>
      <span class="spacer"></span>
      <button class="btn success" data-action="add-income">+ আয় যোগ</button>
      <button class="btn primary" data-action="add-expense">+ ব্যয় যোগ</button>
    </div>
    <div class="cards">
      ${card('মোট আয়', tk(t.income), 'green')}
      ${card('মোট ব্যয়', tk(t.expense), 'red')}
      ${card('লাভ/ক্ষতি', tk(t.net), t.net >= 0 ? 'green' : 'red')}
    </div>
    <p class="muted">স্টুডেন্টদের ফি জমা নিলে সেটা নিজে থেকেই আয় হিসেবে এখানে চলে আসে। শিক্ষকের সম্মানী "শিক্ষক" পেজ থেকে দিলে ব্যয় হিসেবে যোগ হয়। বিদেশ থেকে আসা পেমেন্ট টাকায় রূপান্তর করে (যত টাকা হাতে এসেছে) লিখুন।</p>
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
        <button class="btn sm danger" data-action="del-exam" data-id="${e.id}">মুছুন</button></td></tr>`;
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

views.reports = () => {
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

views.settings = () => {
  const s = db.settings;
  const last = localStorage.getItem(STORE_KEY + '-last-backup');
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
    <div class="panel">
      <h3>💾 ব্যাকআপ (খুবই জরুরি)</h3>
      <p>সব ডেটা এই ব্রাউজারেই জমা থাকে। ব্রাউজারের হিস্টরি/ডেটা মুছে ফেললে বা ফোন হারালে ডেটা হারিয়ে যেতে পারে।
      তাই <b>প্রতি সপ্তাহে অন্তত একবার</b> ব্যাকআপ ফাইল ডাউনলোড করে Google Drive-এ রেখে দিন।</p>
      <p class="muted">শেষ ব্যাকআপ: ${last ? fmtDate(last) : 'কখনো নেওয়া হয়নি'}</p>
      <div class="toolbar">
        <button class="btn primary" data-action="export">⬇️ ব্যাকআপ ডাউনলোড</button>
        <label class="btn">⬆️ ব্যাকআপ থেকে ফেরত আনুন <input type="file" id="import-file" accept=".json,application/json" hidden></label>
      </div>
      <p class="muted">অন্য কম্পিউটার/ফোনে একই ডেটা চাইলে: এখানে ব্যাকআপ ডাউনলোড করে ওখানে "ফেরত আনুন" দিয়ে ফাইলটা দিন।</p>
    </div>
    <div class="panel">
      <h3>অন্যান্য</h3>
      <div class="toolbar">
        <button class="btn" data-action="load-demo">ডেমো ডেটা লোড করুন</button>
        <button class="btn danger" data-action="reset">⚠️ সব ডেটা মুছে ফেলুন</button>
      </div>
    </div>
  `;
};

/* ---------- forms ---------- */
const teacherOpts = () => db.teachers.map((t) => [t.id, t.name]);
const batchOpts = () => db.batches.map((b) => [b.id, `${b.name}${b.fee ? ' — ' + tk(b.fee) : ''}`]);

function studentForm(s) {
  openForm({
    title: s ? 'স্টুডেন্ট এডিট' : 'নতুন স্টুডেন্ট',
    values: s ? { type: 'batch', ...s, one2oneTeacherId: s.teacherId } : { type: 'batch', admissionDate: today(), status: 'active' },
    fields: [
      { name: 'name', label: 'নাম', required: true },
      { name: 'roll', label: 'স্টুডেন্ট আইডি' },
      { name: 'type', label: 'পড়ার ধরন', type: 'select', options: [['batch', 'ব্যাচে পড়ে'], ['one2one', 'ওয়ান-টু-ওয়ান (একা শিক্ষকের সাথে)']] },
      { name: 'batchId', label: 'ব্যাচ', type: 'select', options: batchOpts(), placeholder: '— ব্যাচ বাছাই করুন —', showIf: ['type', ['batch']] },
      { name: 'teacherId', label: 'আলাদা শিক্ষক (খালি রাখলে ব্যাচের শিক্ষক)', type: 'select', options: teacherOpts(), placeholder: '— ব্যাচের শিক্ষক —', showIf: ['type', ['batch']] },
      { name: 'one2oneTeacherId', label: 'শিক্ষক', type: 'select', options: teacherOpts(), placeholder: '— শিক্ষক বাছাই করুন —', showIf: ['type', ['one2one']] },
      { name: 'course', label: 'কোর্স/বিষয় (যেমন: আরবি ভাষা, তাজবীদ)', showIf: ['type', ['one2one']] },
      { name: 'schedule', label: 'ক্লাসের সময়সূচি (বাংলাদেশ সময়, যেমন: সোম/বুধ রাত ৯টা)', showIf: ['type', ['one2one']] },
      { name: 'classLink', label: 'ক্লাস লিংক (Zoom/Meet)', type: 'url', showIf: ['type', ['one2one']] },
      { name: 'monthlyFee', label: 'মাসিক ফি (ব্যাচে খালি রাখলে ব্যাচের ফি বসবে)', type: 'number' },
      { name: 'guardian', label: 'অভিভাবকের নাম (প্রাপ্তবয়স্ক হলে খালি রাখুন)' },
      { name: 'phone', label: 'WhatsApp নম্বর (বিদেশি নম্বর হলে +দেশের কোডসহ, যেমন +447...)', type: 'tel' },
      { name: 'email', label: 'ইমেইল', type: 'email' },
      { name: 'country', label: 'দেশ/শহর' },
      { name: 'admissionDate', label: 'ভর্তির তারিখ (এই মাস থেকে ফি হিসাব হবে)', type: 'date', required: true },
      { name: 'status', label: 'অবস্থা', type: 'select', options: [['active', 'সক্রিয়'], ['inactive', 'নিষ্ক্রিয় (ছেড়ে দিয়েছে)']] },
      { name: 'note', label: 'নোট', type: 'textarea' },
    ],
    onSubmit: (v) => {
      if (v.type === 'one2one') {
        if (!v.one2oneTeacherId) { alert('ওয়ান-টু-ওয়ান স্টুডেন্টের জন্য শিক্ষক বাছাই করুন'); return false; }
        if (!v.monthlyFee) { alert('ওয়ান-টু-ওয়ান স্টুডেন্টের মাসিক ফি লিখুন'); return false; }
        v.teacherId = v.one2oneTeacherId;
        v.batchId = '';
      } else {
        v.course = ''; v.schedule = ''; v.classLink = '';
        if (!v.monthlyFee && v.batchId) v.monthlyFee = Number(byId(db.batches, v.batchId)?.fee) || 0;
      }
      delete v.one2oneTeacherId;
      if (s) Object.assign(s, v);
      else db.students.push({ id: uid(), ...v });
      toast('স্টুডেন্ট সেভ হয়েছে');
    },
  });
}

function batchForm(b) {
  openForm({
    title: b ? 'ব্যাচ এডিট' : 'নতুন ব্যাচ',
    values: b || {},
    fields: [
      { name: 'name', label: 'ব্যাচের নাম (যেমন: আরবি ভাষা — বেসিক, ব্যাচ-৩)', required: true },
      { name: 'subject', label: 'বিষয়' },
      { name: 'teacherId', label: 'দায়িত্বপ্রাপ্ত শিক্ষক', type: 'select', options: teacherOpts(), placeholder: '— শিক্ষক বাছাই করুন —' },
      { name: 'schedule', label: 'সময়সূচি (বাংলাদেশ সময়, যেমন: শনি/সোম/বুধ রাত ৯টা)' },
      { name: 'classLink', label: 'ক্লাস লিংক (Zoom/Google Meet)', type: 'url' },
      { name: 'fee', label: 'মাসিক ফি (প্রতি স্টুডেন্ট)', type: 'number' },
    ],
    onSubmit: (v) => {
      if (b) Object.assign(b, v);
      else db.batches.push({ id: uid(), ...v });
      toast('ব্যাচ সেভ হয়েছে');
    },
  });
}

function teacherForm(t) {
  openForm({
    title: t ? 'শিক্ষক এডিট' : 'নতুন শিক্ষক',
    values: t || { joinDate: today() },
    fields: [
      { name: 'name', label: 'নাম', required: true },
      { name: 'phone', label: 'মোবাইল', type: 'tel' },
      { name: 'subject', label: 'বিষয়' },
      { name: 'salary', label: 'মাসিক সম্মানী (নির্দিষ্ট হলে)', type: 'number' },
      { name: 'joinDate', label: 'যোগদানের তারিখ', type: 'date' },
      { name: 'note', label: 'নোট', type: 'textarea' },
    ],
    onSubmit: (v) => {
      if (t) Object.assign(t, v);
      else db.teachers.push({ id: uid(), ...v });
      toast('শিক্ষক সেভ হয়েছে');
    },
  });
}

function paymentForm(studentId, month) {
  const active = db.students.filter((s) => s.status !== 'inactive');
  if (!active.length) return toast('আগে স্টুডেন্ট যোগ করুন');
  const s = byId(db.students, studentId);
  let m = month;
  if (s && !m) m = studentDues(s)[0]?.month || thisMonth();
  const amount = s ? Math.max(0, Number(s.monthlyFee) - paidFor(s.id, m || thisMonth())) : '';
  openForm({
    title: 'ফি জমা',
    submitLabel: 'জমা নিন',
    values: { studentId, month: m || thisMonth(), amount, date: today(), method: PAY_METHODS[0] },
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
      db.payments.push({ id: uid(), ...v });
      toast(`${tk(v.amount)} জমা হয়েছে`);
    },
  });
}

function txnForm(type, t) {
  const cats = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
  openForm({
    title: (t ? 'এডিট — ' : '') + (type === 'income' ? 'আয়' : 'ব্যয়'),
    values: t || { date: today(), category: cats[0] },
    fields: [
      { name: 'category', label: 'খাত', type: 'select', options: cats.map((c) => [c, c]) },
      { name: 'amount', label: 'টাকার পরিমাণ', type: 'number', required: true },
      { name: 'date', label: 'তারিখ', type: 'date', required: true },
      { name: 'note', label: 'বিবরণ' },
    ],
    onSubmit: (v) => {
      if (!(v.amount > 0)) { alert('সঠিক টাকার পরিমাণ লিখুন'); return false; }
      if (t) Object.assign(t, v);
      else db.transactions.push({ id: uid(), type, ...v });
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
      if (e) Object.assign(e, v);
      else db.exams.push({ id: uid(), ...v });
      state.progressStudent = v.studentId;
      toast('ফলাফল সেভ হয়েছে');
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

function printReceipt(p) {
  const s = byId(db.students, p.studentId) || {};
  const set = db.settings;
  const w = window.open('', '_blank');
  if (!w) return toast('পপআপ ব্লক হয়েছে — ব্রাউজারে পপআপ অনুমতি দিন');
  w.document.write(`<!doctype html><html lang="bn"><head><meta charset="utf-8"><title>রসিদ</title>
    <style>body{font-family:"Hind Siliguri",sans-serif;max-width:420px;margin:24px auto;padding:20px;border:1px dashed #999}
    h2{margin:0;text-align:center}p.c{text-align:center;margin:4px 0;color:#555}table{width:100%;margin-top:16px;border-collapse:collapse}
    td{padding:6px 0;border-bottom:1px solid #eee}td:last-child{text-align:right}.sig{margin-top:48px;text-align:right}</style></head><body>
    <h2>${esc(set.academyName)}</h2><p class="c">${esc(set.address)} ${esc(set.phone)}</p><p class="c"><b>ফি জমার রসিদ</b></p>
    <table><tr><td>রসিদ নং</td><td>${esc(p.id.toUpperCase())}</td></tr>
    <tr><td>স্টুডেন্ট</td><td>${esc(s.name || '')}</td></tr><tr><td>ব্যাচ</td><td>${esc(classLabel(s))}</td></tr>
    <tr><td>মাস</td><td>${monthLabel(p.month)}</td></tr><tr><td>জমার তারিখ</td><td>${fmtDate(p.date)}</td></tr>
    <tr><td>মাধ্যম</td><td>${esc(p.method)}</td></tr><tr><td><b>টাকা</b></td><td><b>${tk(p.amount)}</b></td></tr></table>
    <div class="sig">_____________<br>গ্রহণকারী</div><script>window.print()<\/script></body></html>`);
  w.document.close();
}

function demoData() {
  const d = defaultData();
  d.settings.academyName = 'At-Turath Academy (ডেমো)';
  const T = (name, subject, salary, phone) => ({ id: uid(), name, subject, salary, phone, joinDate: '2026-01-01' });
  const t1 = T('উস্তায আব্দুল্লাহ', 'আরবি ভাষা', 15000, '01700000001');
  const t2 = T('উস্তাযা মারইয়াম', 'তাজবীদ ও তিলাওয়াত', 0, '01700000002');
  const t3 = T('উস্তায হাসান', 'আরবি ব্যাকরণ', 0, '01700000003');
  d.teachers = [t1, t2, t3];
  const B = (name, subject, teacherId, schedule, fee) => ({ id: uid(), name, subject, teacherId, schedule, fee, classLink: 'https://meet.google.com/' });
  const b1 = B('আরবি ভাষা — বেসিক (ব্যাচ-৩)', 'আরবি ভাষা', t1.id, 'শনি/সোম/বুধ — রাত ৯টা', 1500);
  const b2 = B('তাজবীদ — বোনদের ব্যাচ', 'তাজবীদ', t2.id, 'রবি/মঙ্গল — বিকাল ৪টা', 1200);
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
    mk('আব্দুর রহমান', { type: 'one2one', teacherId: t2.id, course: 'কুরআন তিলাওয়াত (নাজেরা)', schedule: 'প্রতিদিন সকাল ৭টা', monthlyFee: 3000, guardian: 'জনাব করিম', phone: '01711000007', classLink: 'https://zoom.us/' }),
    mk('ফাতিমা খাতুন', { type: 'one2one', teacherId: t3.id, course: 'আরবি ব্যাকরণ (নাহু)', schedule: 'সোম/বৃহঃ রাত ১০টা', monthlyFee: 4000, phone: '+12025550108', country: 'যুক্তরাষ্ট্র', email: 'demo@example.com' }),
    mk('ইমরান খান', { type: 'one2one', teacherId: t1.id, course: 'আরবি কথোপকথন', schedule: 'শুক্র/শনি সন্ধ্যা ৭টা', monthlyFee: 3500, phone: '01711000009' }),
  ];
  d.students = [...batchSt, ...o2oSt];
  d.students.forEach((s, i) => {
    for (let k = 3; k >= 0; k--) {
      const mm = shiftMonth(m, -k);
      if (k === 0 && i % 3 === 0) continue;
      if (k <= 1 && i % 4 === 1) continue;
      d.payments.push({ id: uid(), studentId: s.id, month: mm, amount: s.monthlyFee, date: mm + '-0' + (2 + (i % 4)), method: s.country === 'বাংলাদেশ' ? PAY_METHODS[i % 3] : PAY_METHODS[5] });
    }
    const subject = s.type === 'one2one' ? s.course : byId(d.batches, s.batchId).subject;
    [['সাপ্তাহিক মূল্যায়ন-১', -2], ['সাপ্তাহিক মূল্যায়ন-২', -1], ['মাসিক পরীক্ষা', 0]].forEach(([title, off], j) => {
      d.exams.push({ id: uid(), studentId: s.id, title, subject, total: 50, marks: Math.min(50, 22 + ((i * 7 + j * 5) % 27)), date: shiftMonth(m, off) + '-0' + (1 + j), remark: '' });
    });
  });
  // শতাংশ হারে সম্মানী: ওয়ান-টু-ওয়ান শিক্ষকদের ফি-এর ৬০%
  const shareOf = (t, mm) => Math.round(0.6 * sum(d.payments.filter((p) => p.month === mm && o2oSt.some((s) => s.id === p.studentId && s.teacherId === t.id))));
  for (let k = 3; k >= 0; k--) {
    const mm = shiftMonth(m, -k);
    d.transactions.push({ id: uid(), type: 'expense', category: 'Zoom/Google Meet সাবস্ক্রিপশন', amount: 1600, date: mm + '-01', note: 'Zoom Pro' });
    d.transactions.push({ id: uid(), type: 'expense', category: 'ফেসবুক/অনলাইন বিজ্ঞাপন', amount: 3000, date: mm + '-05', note: 'ভর্তির বিজ্ঞাপন' });
    if (k > 0) {
      d.transactions.push({ id: uid(), type: 'expense', category: 'শিক্ষক সম্মানী', amount: t1.salary, date: mm + '-28', note: t1.name + ' (নির্দিষ্ট)' });
      for (const t of [t2, t3]) {
        const amt = shareOf(t, mm);
        if (amt) d.transactions.push({ id: uid(), type: 'expense', category: 'শিক্ষক সম্মানী', amount: amt, date: mm + '-28', note: t.name + ' (ওয়ান-টু-ওয়ান ফি-এর ৬০%)' });
      }
    }
  }
  d.transactions.push({ id: uid(), type: 'income', category: 'ভর্তি/রেজিস্ট্রেশন ফি', amount: 4500, date: start, note: '৯ জন ভর্তি' });
  return d;
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
    db.students = db.students.filter((x) => x.id !== id);
    db.exams = db.exams.filter((x) => x.studentId !== id);
    commit('মুছে ফেলা হয়েছে');
  },
  'add-batch': () => batchForm(),
  'edit-batch': ({ id }) => batchForm(byId(db.batches, id)),
  'del-batch': ({ id }) => {
    if (!confirm('এই ব্যাচ মুছে ফেলবেন? এই ব্যাচের স্টুডেন্টরা ব্যাচ ছাড়া থেকে যাবে।')) return;
    db.batches = db.batches.filter((x) => x.id !== id);
    db.students.forEach((s) => { if (s.batchId === id) s.batchId = ''; });
    commit('মুছে ফেলা হয়েছে');
  },
  'add-teacher': () => teacherForm(),
  'edit-teacher': ({ id }) => teacherForm(byId(db.teachers, id)),
  'del-teacher': ({ id }) => {
    if (!confirm('এই শিক্ষককে মুছে ফেলবেন? তাঁর ব্যাচ/স্টুডেন্টরা শিক্ষকবিহীন হয়ে যাবে।')) return;
    db.teachers = db.teachers.filter((x) => x.id !== id);
    db.batches.forEach((b) => { if (b.teacherId === id) b.teacherId = ''; });
    db.students.forEach((s) => { if (s.teacherId === id) s.teacherId = ''; });
    commit('মুছে ফেলা হয়েছে');
  },
  'pay-teacher': ({ id }) => {
    const t = byId(db.teachers, id);
    txnForm('expense', null);
    const f = $('#modal-form');
    f.category.value = 'শিক্ষক সম্মানী';
    f.amount.value = t.salary || '';
    f.note.value = `${t.name} — ${monthLabel(thisMonth())}`;
  },
  pay: ({ id, month }) => paymentForm(id, month),
  'del-payment': ({ id }) => {
    if (!confirm('এই ফি জমার এন্ট্রি মুছে ফেলবেন?')) return;
    db.payments = db.payments.filter((x) => x.id !== id);
    commit('মুছে ফেলা হয়েছে');
  },
  receipt: ({ id }) => { const p = byId(db.payments, id); if (p) printReceipt(p); },
  'copy-reminder': ({ id }) => {
    const s = byId(db.students, id);
    navigator.clipboard?.writeText(reminderText(s, studentDues(s))).then(() => toast('মেসেজ কপি হয়েছে'), () => toast('কপি করা যায়নি'));
  },
  'add-income': () => txnForm('income'),
  'add-expense': () => txnForm('expense'),
  'edit-txn': ({ id }) => { const t = byId(db.transactions, id); txnForm(t.type, t); },
  'del-txn': ({ id }) => {
    if (!confirm('এই লেনদেন মুছে ফেলবেন?')) return;
    db.transactions = db.transactions.filter((x) => x.id !== id);
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
    db.exams = db.exams.filter((x) => x.id !== id);
    commit('মুছে ফেলা হয়েছে');
  },
  'save-settings': () => {
    db.settings.academyName = $('#set-name').value.trim() || 'আমার একাডেমি';
    db.settings.phone = $('#set-phone').value.trim();
    db.settings.address = $('#set-address').value.trim();
    db.settings.reminderTemplate = $('#set-template').value.trim() || defaultData().settings.reminderTemplate;
    commit('সেটিংস সেভ হয়েছে');
  },
  export: () => {
    download(`academy-backup-${today()}.json`, JSON.stringify(db, null, 2), 'application/json');
    localStorage.setItem(STORE_KEY + '-last-backup', today());
    render();
  },
  'export-csv': () => exportCsv(),
  print: () => window.print(),
  'load-demo': () => {
    if ((db.students.length || db.teachers.length) && !confirm('বর্তমান সব ডেটা মুছে ডেমো ডেটা লোড হবে। নিশ্চিত?')) return;
    db = demoData();
    commit('ডেমো ডেটা লোড হয়েছে');
  },
  reset: () => {
    if (!confirm('সব ডেটা স্থায়ীভাবে মুছে যাবে! আগে ব্যাকআপ নিয়েছেন তো?')) return;
    if (prompt('নিশ্চিত হলে নিচে "মুছুন" লিখুন') !== 'মুছুন') return;
    db = defaultData();
    commit('সব ডেটা মুছে ফেলা হয়েছে');
  },
};

function commit(msg) {
  save();
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
  if (e.target.id !== 'import-file') return;
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = normalize(JSON.parse(reader.result));
      if (!confirm(`ব্যাকআপে ${data.students.length} জন স্টুডেন্ট, ${data.teachers.length} জন শিক্ষক আছে। বর্তমান ডেটা বদলে এটা লোড করবেন?`)) return;
      db = data;
      commit('ব্যাকআপ থেকে ডেটা ফেরত আনা হয়েছে');
    } catch (err) {
      alert('ফাইলটা সঠিক ব্যাকআপ ফাইল নয়।');
    }
  };
  reader.readAsText(file);
});

/* ---------- router ---------- */
function render(focusId) {
  const route = (location.hash.slice(1) || 'dashboard').split('?')[0];
  const view = views[route] || views.dashboard;
  $('#main').innerHTML = view();
  $('#academy-name').textContent = db.settings.academyName;
  document.title = db.settings.academyName + ' — ম্যানেজমেন্ট';
  document.querySelectorAll('.sidebar a').forEach((a) => a.classList.toggle('active', a.dataset.route === route));
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

// অন্য ট্যাবে ডেটা বদলালে এখানেও আপডেট
window.addEventListener('storage', (e) => {
  if (e.key === STORE_KEY) { db = load(); render(); }
});

render();
