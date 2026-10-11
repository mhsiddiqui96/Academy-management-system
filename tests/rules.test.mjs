// ডেটাবেসের নিয়মের পরীক্ষা: cd tests && npm install && npm run test:rules
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
// মালিকের ঠিকানা পরীক্ষার জন্য owner@test.com দিয়ে বদলে নেওয়া হয়
const rulesSrc = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8').replace(/return '[^']*@[^']*';|return 'OWNER_EMAIL';/, "return 'owner@test.com';");
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where, updateDoc } from 'firebase/firestore';
const env = await initializeTestEnvironment({ projectId: 'demo-rules', firestore: { rules: rulesSrc, host:'127.0.0.1', port:8085 } });
const ctx = (email) => env.authenticatedContext(email.replace(/\W/g,''), { email, email_verified: true }).firestore();
await env.withSecurityRulesDisabled(async (c) => { const d=c.firestore();
  await setDoc(doc(d,'members/admin@test.com'), {role:'admin'});
  await setDoc(doc(d,'members/teacher@test.com'), {role:'teacher', teacherId:'T1'});
  await setDoc(doc(d,'members/old@test.com'), {role:'admin', active:false});
  await setDoc(doc(d,'settings/main'), {academyName:'X', adminReports:false});
  await setDoc(doc(d,'students/S1'), {name:'a', monthlyFee:1000, by:'owner@test.com'});
  await setDoc(doc(d,'teacherView/s_S1'), {teacherId:'T1', name:'a'});
  await setDoc(doc(d,'teacherView/s_S2'), {teacherId:'T2', name:'b'});
  await setDoc(doc(d,'teachers/T1'), {name:'t1'}); await setDoc(doc(d,'teachers/T2'), {name:'t2'});
  await setDoc(doc(d,'teacherStatements/T1'), {balance:5}); await setDoc(doc(d,'teacherStatements/T2'), {balance:5});
  await setDoc(doc(d,'expenses/E1'), {amount:5}); await setDoc(doc(d,'summaries/2026-10'), {income:1});
  await setDoc(doc(d,'payments/P1'), {amount:5, by:'owner@test.com'});
});
const O=ctx('owner@test.com'), A=ctx('admin@test.com'), T=ctx('teacher@test.com'), X=ctx('stranger@test.com'), OLD=ctx('old@test.com');
const unverified = env.authenticatedContext('u', {email:'owner@test.com', email_verified:false}).firestore();
const anon = env.unauthenticatedContext().firestore();
const results=[]; async function t(name, p, ok){ try { await (ok?assertSucceeds(p):assertFails(p)); results.push(['PASS',name]); } catch(e){ results.push(['FAIL',name, e.message]); } }
// owner
await t('owner reads expenses', getDoc(doc(O,'expenses/E1')), true);
await t('owner writes member', setDoc(doc(O,'members/new@test.com'),{role:'admin'}), true);
await t('owner deletes student', deleteDoc(doc(O,'students/S1')), true);
await env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),'students/S1'),{name:'a',monthlyFee:1000,by:'owner@test.com'}));
await t('unverified owner email blocked', getDoc(doc(unverified,'expenses/E1')), false);
await t('anon blocked', getDoc(doc(anon,'students/S1')), false);
// admin
await t('admin reads students', getDocs(collection(A,'students')), true);
await t('admin creates student stamped', setDoc(doc(A,'students/S9'),{name:'n',monthlyFee:800,by:'admin@test.com'}), true);
await t('admin create unstamped fails', setDoc(doc(A,'students/S8'),{name:'n',monthlyFee:800}), false);
await t('admin edits name', setDoc(doc(A,'students/S1'),{name:'z',monthlyFee:1000,by:'admin@test.com'}), true);
await t('admin cannot change fee', setDoc(doc(A,'students/S1'),{name:'z',monthlyFee:500,by:'admin@test.com'}), false);
await t('admin cannot delete student', deleteDoc(doc(A,'students/S1')), false);
await t('admin adds payment', setDoc(doc(A,'payments/P2'),{amount:5,by:'admin@test.com'}), true);
await t('admin cannot delete payment', deleteDoc(doc(A,'payments/P1')), false);
await t('admin adds income', setDoc(doc(A,'incomes/I1'),{amount:5,by:'admin@test.com'}), true);
await t('admin cannot read expenses', getDoc(doc(A,'expenses/E1')), false);
await t('admin cannot write expenses', setDoc(doc(A,'expenses/E2'),{amount:5,by:'admin@test.com'}), false);
for (const c of ['payRules','shares','teacherPayouts','staff','staffPayouts','staffEntries','commissions','teacherStatements','teacherPrivate'])
  await t('admin cannot read '+c, getDocs(collection(A,c)), false);
await t('admin cannot write members', setDoc(doc(A,'members/x@test.com'),{role:'admin'}), false);
await t('admin cannot write settings', setDoc(doc(A,'settings/main'),{adminReports:true}), false);
await t('admin cannot read summaries (switch off)', getDoc(doc(A,'summaries/2026-10')), false);
await env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),'settings/main'),{academyName:'X',adminReports:true}));
await t('admin reads summaries (switch on)', getDoc(doc(A,'summaries/2026-10')), true);
await t('admin still cannot read expenses (switch on)', getDoc(doc(A,'expenses/E1')), false);
await t('admin cannot read audit log', getDocs(collection(A,'auditLog')), false);
await t('admin writes own audit', setDoc(doc(A,'auditLog/L1'),{by:'admin@test.com',action:'x'}), true);
await t('admin cannot forge audit', setDoc(doc(A,'auditLog/L2'),{by:'owner@test.com',action:'x'}), false);
await t('nobody edits audit', setDoc(doc(O,'auditLog/L1'),{by:'owner@test.com',action:'y'}), false);
await t('inactive admin blocked', getDocs(collection(OLD,'students')), false);
// teacher
await t('teacher reads own views (query)', getDocs(query(collection(T,'teacherView'), where('teacherId','==','T1'))), true);
await t('teacher cannot list all views', getDocs(collection(T,'teacherView')), false);
await t('teacher cannot read other view', getDoc(doc(T,'teacherView/s_S2')), false);
await t('teacher cannot read students', getDocs(collection(T,'students')), false);
await t('teacher cannot read payments', getDocs(collection(T,'payments')), false);
await t('teacher reads own statement', getDoc(doc(T,'teacherStatements/T1')), true);
await t('teacher cannot read other statement', getDoc(doc(T,'teacherStatements/T2')), false);
await t('teacher writes own private info', setDoc(doc(T,'teacherPrivate/T1'),{bkash:'017'}), true);
await t('teacher cannot write other private', setDoc(doc(T,'teacherPrivate/T2'),{bkash:'017'}), false);
await t('teacher reads own teacher doc', getDoc(doc(T,'teachers/T1')), true);
await t('teacher cannot edit teacher doc', setDoc(doc(T,'teachers/T1'),{name:'hack'}), false);
await t('teacher cannot write view', setDoc(doc(T,'teacherView/s_S1'),{teacherId:'T1'}), false);
await t('teacher reads settings', getDoc(doc(T,'settings/main')), true);
await t('teacher reads own member doc', getDoc(doc(T,'members/teacher@test.com')), true);
await t('teacher cannot read summaries', getDoc(doc(T,'summaries/2026-10')), false);
// stranger
await t('stranger cannot read students', getDocs(collection(X,'students')), false);
await t('stranger cannot read settings', getDoc(doc(X,'settings/main')), false);
await t('stranger reads own (missing) member doc', getDoc(doc(X,'members/stranger@test.com')), true);
await t('stranger cannot self-register', setDoc(doc(X,'members/stranger@test.com'),{role:'admin'}), false);
await env.cleanup();
const fails=results.filter(r=>r[0]==='FAIL'); console.log(`${results.length-fails.length}/${results.length} passed`); fails.forEach(f=>console.log('X', f[1], '|', String(f[2]).slice(0,150)));
process.exit(fails.length?1:0);
