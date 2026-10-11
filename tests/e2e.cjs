// পুরো ব্যবস্থার পরীক্ষা (মালিক, অ্যাডমিন, শিক্ষক, অচেনা) — নকল Firebase-এ।
// চালাতে: অ্যাপ ফোল্ডারে 'python3 -m http.server 8765' চালু রেখে, মূল ফোল্ডার থেকে:
//   tests/node_modules/.bin/firebase emulators:exec --project demo-academy --only firestore,auth "node tests/e2e.cjs /tmp"
// (firestore.rules-এ মালিকের ঠিকানা owner@test.com বসিয়ে চালাতে হবে)
const { chromium } = require('playwright');
const U='http://localhost:8765/';
const FB=U+'?emulator&owner=owner@test.com';
const SS=process.argv[2];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await chromium.launch(); const errs=[]; const R={};
  async function page(){ const c=await b.newContext({viewport:{width:1300,height:900}}); const p=await c.newPage(); p.on('pageerror',e=>errs.push('pageerror '+e.message)); p.on('console',m=>{ if(m.type()==='error' && !/permission|PERMISSION/.test(m.text())) errs.push('console '+m.text().slice(0,200))}); p.on('dialog',d=>d.accept()); return p; }
  async function login(p,email){ await p.goto(FB+'#dashboard'); await p.waitForSelector('[data-action=login]',{timeout:20000}); await p.evaluate(e=>window.__testLogin(e), email); await sleep(2500); }
  const dbv=(p,expr)=>p.evaluate(expr);
  // 1) local demo data in same origin
  const O=await page(); await O.goto(U+'#settings'); await O.waitForTimeout(300); await O.click('[data-action=load-demo]'); await O.waitForTimeout(300);
  // 2) owner login and migrate
  await login(O,'owner@test.com');
  R.ownerNav = await O.$$eval('#sidebar a', as=>as.length);
  await O.click('[data-action=migrate-local] >> nth=0'); await sleep(6000);
  await O.goto(FB+'#dashboard'); await sleep(3000);
  R.afterMigrate = await O.evaluate(()=>document.querySelector('#main').innerText.includes('মোট বকেয়া'));
  await O.screenshot({path:SS+'/fb-owner-dash.png', fullPage:true});
  // 3) add members
  await O.goto(FB+'#settings'); await sleep(800);
  await O.click('[data-action=add-member]'); await O.fill('input[name=email]','admin@test.com'); await O.selectOption('select[name=role]','admin'); await O.click('#modal-submit'); await sleep(500);
  await O.click('[data-action=add-member]'); await O.fill('input[name=email]','Teacher@Test.com'); await O.selectOption('select[name=role]','teacher'); await O.selectOption('select[name=teacherId]',{label:'উস্তাযা মারইয়াম'}); await O.click('#modal-submit'); await sleep(1500);
  await O.screenshot({path:SS+'/fb-owner-settings.png', fullPage:true});
  // 4) admin
  const A=await page(); await login(A,'admin@test.com');
  R.adminNav = await A.$$eval('#sidebar a', as=>as.map(a=>a.textContent.trim()));
  R.adminDashHasProfit = await A.evaluate(()=>document.querySelector('#main').innerText.includes('লাভ/ক্ষতি'));
  await A.goto(FB+'#accounts'); await sleep(800); R.adminAccounts = await A.evaluate(()=>({text: document.querySelector('#main').innerText.includes('ব্যয়'), del: document.querySelectorAll('[data-action=del-txn]').length}));
  await A.screenshot({path:SS+'/fb-admin-accounts.png', fullPage:true});
  await A.goto(FB+'#students'); await sleep(500); R.adminDeleteBtns = await A.$$eval('[data-action=del-student]', x=>x.length);
  await A.click('text=+ নতুন স্টুডেন্ট'); await A.fill('input[name=name]','অ্যাডমিনের ছাত্র'); await A.selectOption('select[name=batchId]',{index:1}); await A.selectOption('select[name=referredBy]',{index:1}); await A.click('#modal-submit'); await sleep(1500);
  await A.goto(FB+'#fees'); await sleep(500); await A.click('text=+ ফি জমা নিন'); 
  const lbl = (await A.$$eval('select[name=studentId] option', os=>os.map(o=>o.textContent))).find(t=>t.startsWith('অ্যাডমিনের ছাত্র'));
  await A.selectOption('select[name=studentId]',{label:lbl}); await A.fill('input[name=amount]','1500'); await A.click('#modal-submit'); await sleep(1500);
  // admin tries to edit fee of existing student -> field disabled
  await A.goto(FB+'#students'); await sleep(500); await A.click('[data-action=edit-student] >> nth=0'); R.adminFeeDisabled = await A.$eval('input[name=monthlyFee]', i=>i.disabled); await A.click('text=বাতিল');
  // 5) owner reconcile: share + commission for admin's student
  await sleep(4000);
  R.ownerSeesAdminWork = await O.evaluate(()=>{ return document.title; });
  await O.goto(FB+'#staff'); await sleep(3000);
  R.reconcile = await O.evaluate(async()=>{ return null; });
  // read via page internals not exposed; check UI text
  await O.goto(FB+'#payroll'); await sleep(1500);
  await O.screenshot({path:SS+'/fb-owner-payroll.png', fullPage:true});
  // 6) teacher
  const T=await page(); await login(T,'teacher@test.com');
  R.teacherNav = await T.$$eval('#sidebar a', as=>as.map(a=>a.textContent.trim()));
  await T.goto(FB+'#t-students'); await sleep(1500); R.teacherStudents = await T.$$eval('#main tbody tr', rs=>rs.map(r=>r.cells[0].innerText.split('\n')[0]));
  R.teacherSeesPhone = await T.evaluate(()=>/017\d{8}/.test(document.querySelector('#main').innerText));
  await T.screenshot({path:SS+'/fb-teacher-students.png', fullPage:true});
  await T.goto(FB+'#t-account'); await sleep(1500); R.teacherAccount = await T.evaluate(()=>document.querySelector('#main').innerText.slice(0,200));
  await T.screenshot({path:SS+'/fb-teacher-account.png', fullPage:true});
  await T.goto(FB+'#t-info'); await sleep(500); await T.click('[data-action=t-edit-info]'); await T.fill('input[name=bkash]','01799999999'); await T.click('#modal-submit'); await sleep(1500);
  await T.goto(FB+'#t-classes'); await sleep(800); await T.screenshot({path:SS+'/fb-teacher-classes.png', fullPage:true});
  // owner sees teacher bkash in payout form
  await O.goto(FB+'#payroll'); await sleep(1000); await O.selectOption('select[data-filter=payTeacher]',{label:'উস্তাযা মারইয়াম'}); await sleep(500);
  await O.click('#payroll-detail [data-action=payout]'); R.ownerSeesBkash = await O.evaluate(()=>document.querySelector('#modal-body').innerText.includes('01799999999')); await O.click('text=বাতিল');
  // 7) stranger
  const X=await page(); await login(X,'stranger@test.com'); R.stranger = await X.evaluate(()=>document.querySelector('#main').innerText.includes('অনুমতি নেই'));
  // 8) reports switch
  R.adminReportsBefore = (await A.$$eval('#sidebar a', as=>as.map(a=>a.textContent))).some(t=>t.includes('রিপোর্ট'));
  await O.goto(FB+'#settings'); await sleep(800); await O.check('#set-reports'); await sleep(2500);
  await A.goto(FB+'#reports'); await sleep(2500);
  R.adminReportsAfter = (await A.$$eval('#sidebar a', as=>as.map(a=>a.textContent))).some(t=>t.includes('রিপোর্ট'));
  R.adminReportText = await A.evaluate(()=>document.querySelector('#main').innerText.includes('শিক্ষক সম্মানী'));
  await A.screenshot({path:SS+'/fb-admin-reports.png', fullPage:true});
  // 9) activity log
  await O.goto(FB+'#activity'); await sleep(2000); R.activityRows = await O.$$eval('#activity-list tbody tr', r=>r.length);
  await O.screenshot({path:SS+'/fb-owner-activity.png'});
  // 10) owner staff page shows commission for admin's student
  await O.goto(FB+'#staff'); await sleep(800); await O.click('[data-action=staff-detail] >> nth=0'); await sleep(500);
  R.commForAdminStudent = await O.evaluate(()=>document.querySelector('#main').innerText.includes('অ্যাডমিনের ছাত্র'));
  console.log(JSON.stringify({R, errs}, null, 1));
  await b.close();
})().catch(e=>{ console.error('FATAL', e); process.exit(1); });
