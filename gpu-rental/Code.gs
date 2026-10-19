// 算力顯卡租借平台：Google Apps Script 後端
// 試算表分頁：顯卡方案、租借訂單、優惠碼

const STUDENT_RATE = 0.8;   // 學生 8 折
const OVERTIME_RATE = 1.5;  // 逾時每小時以 1.5 倍時租計費
const HOUR = 36e5;
const TZ = 'Asia/Taipei';
const COLS = ['no', 'created', 'gpu', 'gpuName', 'name', 'email', 'role', 'sid', 'purpose', 'start', 'hours', 'end',
  'price', 'base', 'coupon', 'paid', 'state', 'endedAt', 'otHours', 'otFee', 'total'];
// state 只存「有效／已結束／已取消」，畫面上的「已預約／使用中／逾時中」依現在時間即時判斷

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('算力顯卡租借平台')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

const sheet_ = name => SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
const rows_ = name => sheet_(name).getDataRange().getValues().slice(1).filter(r => r[0] !== '');
const ms_ = v => v ? +new Date(v) : null;
const fmt_ = (ms, p) => Utilities.formatDate(new Date(ms), TZ, p || 'yyyy/MM/dd HH:mm');

function plans_() {
  return rows_('顯卡方案').map(r => ({ id: r[0], name: r[1], tier: r[2], vram: +r[3], use: r[4], price: +r[5], units: +r[6], intro: r[7] }));
}

function orders_() {
  return rows_('租借訂單').map((r, i) => {
    const o = { row: i + 2 };
    COLS.forEach((k, j) => o[k] = r[j]);
    ['created', 'start', 'end', 'endedAt'].forEach(k => o[k] = ms_(o[k]));
    return o;
  });
}

function status_(o, now) {
  if (o.state !== '有效') return o.state;
  if (now < o.start) return '已預約';
  return now < o.end ? '使用中' : '逾時中';
}

// 這筆訂單實際佔用顯卡到什麼時候（逾時未結束的會持續佔用）
function busyEnd_(o, now) {
  if (o.state === '已取消') return o.start;
  if (o.state === '已結束') return o.endedAt;
  return Math.max(o.end, now);
}

// 某張卡在 [s, e) 期間，每小時最多同時被租幾台
function maxUsed_(orders, gpu, s, e, now) {
  let max = 0;
  for (let t = s; t < e; t += HOUR) {
    const n = orders.filter(o => o.gpu === gpu && o.start < t + HOUR && busyEnd_(o, now) > t).length;
    max = Math.max(max, n);
  }
  return max;
}

function coupon_(code) {
  if (!code) return null;
  const r = rows_('優惠碼').find(r => String(r[0]).toUpperCase() === code.toUpperCase());
  if (!r) throw new Error('查無此優惠碼：' + code);
  if (r[3] !== true) throw new Error('優惠碼「' + code + '」已停用');
  return { code: r[0], rate: +r[1], desc: r[2] };
}

function publicOrder_(o, now) {
  const x = Object.assign({}, o, { status: status_(o, now) });
  delete x.row;
  return x;
}

// ---------- 給網頁呼叫的 API ----------

function getInit() {
  const now = Date.now(), orders = orders_();
  return {
    now: now,
    studentRate: STUDENT_RATE,
    overtimeRate: OVERTIME_RATE,
    plans: plans_().map(p => Object.assign(p, { free: p.units - orders.filter(o => o.gpu === p.id && o.start <= now && busyEnd_(o, now) > now).length })),
  };
}

// 回傳某張卡從指定日期 00:00 起 96 小時內，每小時已被租用的台數
function getSlots(gpu, dateStr) {
  const now = Date.now(), orders = orders_();
  const day0 = Date.parse(dateStr + 'T00:00:00+08:00');
  const used = [];
  for (let i = 0; i < 96; i++) used.push(maxUsed_(orders, gpu, day0 + i * HOUR, day0 + (i + 1) * HOUR, now));
  return { day0: day0, used: used };
}

function checkCoupon(code) {
  return coupon_(String(code || '').trim());
}

function book(f) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const now = Date.now();
    const plan = plans_().find(p => p.id === f.gpu);
    const name = String(f.name || '').trim(), email = String(f.email || '').trim();
    const hours = Number(f.hours), start = Number(f.start);
    if (!plan) throw new Error('請選擇顯卡');
    if (!name) throw new Error('請填寫姓名');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Email 格式不正確');
    if (!(hours >= 1 && hours <= 72 && hours % 1 === 0)) throw new Error('租用時數需為 1～72 小時');
    if (!(start % HOUR === 0 && start >= Math.floor(now / HOUR) * HOUR)) throw new Error('開始時間不正確或已經過去');
    const student = f.role === '學生';
    if (student && !String(f.sid || '').trim()) throw new Error('學生方案請填寫學號');

    const orders = orders_(), end = start + hours * HOUR;
    if (maxUsed_(orders, plan.id, start, end, now) >= plan.units) throw new Error('這個時段 ' + plan.name + ' 已被租滿，請換個時段或顯卡');

    const c = coupon_(String(f.coupon || '').trim());
    const base = plan.price * hours;
    const paid = Math.round(base * (student ? STUDENT_RATE : 1) * (c ? c.rate : 1));
    const seq = orders.reduce((m, o) => Math.max(m, Number(String(o.no).slice(1)) || 0), 0) + 1;
    const o = {
      no: 'R' + String(seq).padStart(4, '0'), created: now, gpu: plan.id, gpuName: plan.name, name: name, email: email,
      role: student ? '學生' : '一般', sid: student ? String(f.sid).trim() : '', purpose: String(f.purpose || '').trim(),
      start: start, hours: hours, end: end, price: plan.price, base: base, coupon: c ? c.code : '', paid: paid,
      state: '有效', endedAt: null, otHours: 0, otFee: 0, total: paid,
    };
    sheet_('租借訂單').appendRow(COLS.map(k => ['created', 'start', 'end'].includes(k) ? new Date(o[k]) : (o[k] === null ? '' : o[k])));
    o.mailed = mail_(o, '【算力顯卡租借】預約成功 ' + o.no, [
      '您的顯卡租借預約已成立，以下是訂單資訊：',
      '訂單編號：' + o.no, '顯卡：' + o.gpuName,
      '租用時段：' + fmt_(o.start) + ' ～ ' + fmt_(o.end) + '（' + o.hours + ' 小時）',
      '應付金額：NT$' + o.paid + (o.base !== o.paid ? '（原價 NT$' + o.base + '）' : ''),
      '連線資訊（SSH / Jupyter）將於開始前 10 分鐘寄出。逾時使用將以 ' + OVERTIME_RATE + ' 倍時租計費。',
    ]);
    o.status = status_(o, now);
    return o;
  } finally {
    lock.releaseLock();
  }
}

function findOrders(q) {
  q = String(q || '').trim().toLowerCase();
  if (!q) throw new Error('請輸入 Email 或訂單編號');
  const now = Date.now();
  return orders_().filter(o => String(o.email).toLowerCase() === q || String(o.no).toLowerCase() === q)
    .sort((a, b) => b.start - a.start).map(o => publicOrder_(o, now));
}

// 已預約 → 取消；使用中／逾時中 → 結束租用並計算逾時費
function endRental(no) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const now = Date.now();
    const o = orders_().find(o => o.no === no);
    if (!o) throw new Error('查無訂單 ' + no);
    const s = status_(o, now);
    if (s === '已結束' || s === '已取消') throw new Error('這筆訂單已經' + s);
    if (s === '已預約') {
      Object.assign(o, { state: '已取消', endedAt: now, otHours: 0, otFee: 0, total: 0 });
    } else {
      const otHours = Math.max(0, Math.ceil((now - o.end) / HOUR));
      const otFee = Math.round(otHours * o.price * OVERTIME_RATE);
      Object.assign(o, { state: '已結束', endedAt: now, otHours: otHours, otFee: otFee, total: o.paid + otFee });
    }
    sheet_('租借訂單').getRange(o.row, 17, 1, 5).setValues([[o.state, new Date(o.endedAt), o.otHours, o.otFee, o.total]]);
    mail_(o, '【算力顯卡租借】' + (o.state === '已取消' ? '預約已取消 ' : '租用結束 ') + o.no, o.state === '已取消'
      ? ['您的預約 ' + o.no + '（' + o.gpuName + '）已取消，不會收取任何費用。']
      : ['訂單 ' + o.no + '（' + o.gpuName + '）已結束租用，費用明細如下：',
        '租用費用：NT$' + o.paid, '逾時：' + o.otHours + ' 小時，逾時費 NT$' + o.otFee, '總金額：NT$' + o.total]);
    return publicOrder_(o, now);
  } finally {
    lock.releaseLock();
  }
}

function getReport() {
  const now = Date.now(), DAY = 24 * HOUR, days = 30;
  const today0 = Date.parse(fmt_(now, 'yyyy-MM-dd') + 'T00:00:00+08:00');
  const from = today0 - (days - 1) * DAY, to = today0 + DAY;
  const plans = plans_(), all = orders_();
  const orders = all.filter(o => o.state !== '已取消' && o.start >= from && o.start < to);
  const by = {};
  plans.forEach(p => by[p.id] = { id: p.id, name: p.name, tier: p.tier, orders: 0, hours: 0, revenue: 0, units: p.units });
  orders.forEach(o => {
    const g = by[o.gpu];
    if (!g) return;
    g.orders++;
    g.hours += o.hours;
    g.revenue += o.total;
  });
  const gpus = Object.values(by).map(g => Object.assign(g, { util: g.hours / (g.units * 24 * days) }));
  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const d0 = today0 - i * DAY;
    daily.push({ day: fmt_(d0, 'M/d'), revenue: orders.filter(o => o.start >= d0 && o.start < d0 + DAY).reduce((s, o) => s + o.total, 0) });
  }
  const live = all.map(o => publicOrder_(o, now));
  const coupons = {};
  orders.filter(o => o.coupon).forEach(o => coupons[o.coupon] = (coupons[o.coupon] || 0) + 1);
  const totalUnits = plans.reduce((s, p) => s + p.units, 0);
  return {
    now: now, days: days,
    revenue: orders.reduce((s, o) => s + o.total, 0),
    count: orders.length,
    hours: orders.reduce((s, o) => s + o.hours, 0),
    util: orders.reduce((s, o) => s + o.hours, 0) / (totalUnits * 24 * days),
    students: orders.filter(o => o.role === '學生').length,
    otFee: orders.reduce((s, o) => s + Number(o.otFee || 0), 0),
    inUse: live.filter(o => o.status === '使用中').length,
    overdue: live.filter(o => o.status === '逾時中'),
    gpus: gpus, daily: daily, coupons: coupons,
  };
}

function mail_(o, subject, lines) {
  try {
    MailApp.sendEmail({
      to: o.email, bcc: Session.getEffectiveUser().getEmail(), subject: subject,
      htmlBody: '<p>' + o.name + ' 您好：</p><p>' + lines.join('<br>') + '</p><p>算力顯卡租借平台</p>',
    });
    return true;
  } catch (e) {
    console.error('寄信失敗', e); // 寄信失敗不影響訂單成立
    return false;
  }
}

// ---------- 範例資料：在編輯器選 seedDemo 執行一次即可 ----------
// 會清空「租借訂單」，以現在時間為基準產生過去 30 天到未來 3 天的訂單

function seedDemo() {
  const now = Date.now(), plans = plans_();
  let x = 20261019;
  const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const names = ['王小明', '陳怡君', '林志豪', '張雅婷', '李建宏', '黃靜宜', '吳俊傑', '周佳慧', '鄭宇翔', '許家豪', '蔡宛蓉', '楊子毅', '謝承恩', '郭品妤', '洪偉倫'];
  const purposes = ['專題 LoRA 微調', 'Stable Diffusion 生圖', '論文實驗', 'Kaggle 競賽', 'LLM 推論測試', '影片生成', '課堂作業'];
  const weights = { '入門': 5, '進階': 6, '旗艦': 3, '工作站': 2, '資料中心': 2 };
  const pool = [];
  plans.forEach(p => { for (let i = 0; i < weights[p.tier]; i++) pool.push(p); });
  const hourNow = Math.floor(now / HOUR) * HOUR;
  const out = [];
  const add = (p, start, hours, opt) => {
    opt = opt || {};
    const end = start + hours * HOUR;
    if (maxUsed_(out, p.id, start, end, now) >= p.units) return null;
    const n = names.indexOf(opt.name || pick(names));
    const student = opt.role ? opt.role === '學生' : rnd() < 0.45;
    const c = opt.coupon !== undefined ? opt.coupon : (rnd() < 0.25 ? pick(['AI2026', 'FIRST85', 'LAB70']) : '');
    const rate = { AI2026: 0.9, FIRST85: 0.85, LAB70: 0.7 }[c] || 1;
    const base = p.price * hours, paid = Math.round(base * (student ? STUDENT_RATE : 1) * rate);
    const o = {
      no: '', created: start - Math.floor(rnd() * 48 + 1) * HOUR, gpu: p.id, gpuName: p.name, name: names[n],
      email: 'user' + String(n + 1).padStart(2, '0') + '@example.com', role: student ? '學生' : '一般',
      sid: student ? 'B11' + String(200000 + n * 1373).slice(0, 6) : '', purpose: pick(purposes),
      start: start, hours: hours, end: end, price: p.price, base: base, coupon: c, paid: paid,
      state: '有效', endedAt: null, otHours: 0, otFee: 0, total: paid,
    };
    if (opt.state) o.state = opt.state;
    if (o.state === '有效' && end <= now && !opt.keepOpen) {
      const ot = rnd() < 0.12 ? Math.floor(rnd() * 3) + 1 : 0;
      Object.assign(o, { state: '已結束', endedAt: end + ot * HOUR - (ot ? 20 * 6e4 : 0), otHours: ot, otFee: Math.round(ot * p.price * OVERTIME_RATE) });
      o.total = o.paid + o.otFee;
    }
    if (o.state === '已取消') Object.assign(o, { endedAt: o.created + HOUR, total: 0 });
    out.push(o);
    return o;
  };
  for (let i = 0; i < 300; i++) {
    const p = pick(pool);
    const start = hourNow - Math.floor(rnd() * 30 * 24 + 4) * HOUR;
    const hours = pick([1, 2, 2, 3, 4, 4, 6, 8, 12, 24]);
    if (start + hours * HOUR <= now) add(p, start, hours);
  }
  const P = id => plans.find(p => p.id === id);
  add(P('G05'), hourNow - 2 * HOUR, 6, { name: '周佳慧' });                 // 使用中
  add(P('G10'), hourNow - 5 * HOUR, 12, { name: '謝承恩', role: '學生' });   // 使用中
  add(P('G03'), hourNow - 1 * HOUR, 4, { name: '郭品妤' });                  // 使用中
  add(P('G07'), hourNow - 7 * HOUR, 4, { name: '吳俊傑', keepOpen: true });  // 逾時中
  add(P('G06'), hourNow + 3 * HOUR, 8, { name: '鄭宇翔', role: '學生', coupon: 'AI2026' });
  add(P('G11'), hourNow + 20 * HOUR, 24, { name: '楊子毅', role: '一般', coupon: '' });
  add(P('G02'), hourNow + 26 * HOUR, 3, { name: '張雅婷' });
  add(P('G05'), hourNow + 30 * HOUR, 4, { name: '李建宏', state: '已取消' });
  add(P('G12'), hourNow + 44 * HOUR, 12, { name: '許家豪', coupon: 'LAB70' });
  out.sort((a, b) => a.created - b.created).forEach((o, i) => o.no = 'R' + String(i + 1).padStart(4, '0'));
  const sh = sheet_('租借訂單');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, COLS.length).clearContent();
  const dateKeys = ['created', 'start', 'end', 'endedAt'];
  sh.getRange(2, 1, out.length, COLS.length).setValues(out.map(o => COLS.map(k =>
    dateKeys.includes(k) ? (o[k] ? new Date(o[k]) : '') : o[k])));
  return out.length;
}
