// ราคาชุดนี้คือราคาจริงที่ใช้คิดเงิน ต้องตรงกับ js/products.js บนหน้าเว็บ
// แก้แล้วต้อง Deploy > Manage deployments > New version ทุกครั้ง
var PRODUCTS = [
  { id: 'bread',   name: 'ขนมปังเนยหนึบ',    unit: 'ถุง',     price: 120 },
  { id: 'brownie', name: 'บราวนี่',           unit: 'กล่อง',   price: 150 },
  { id: 'popcorn', name: 'ป็อปคอร์นคาราเมล', unit: 'กระปุก', price: 200 }
];

var SHEET_ORDERS = 'Orders';
var SHEET_CUSTOMERS = 'Customers';

var ORDER_HEADERS = [
  'OrderID', 'CreatedAt', 'UpdatedAt', 'Status', 'CustomerID',
  'Name', 'Phone', 'Email', 'Address',
  'Items', 'ItemsJSON', 'Qty', 'Total',
  'PayMethod', 'PayLabel', 'Note'
];

var CUSTOMER_HEADERS = [
  'CustomerID', 'Name', 'Phone', 'Email', 'Address',
  'OrderCount', 'TotalSpent', 'ItemsBought', 'FirstOrderAt', 'LastOrderAt'
];

// คอลัมน์ที่ต้องบังคับเป็นข้อความล้วน กันเบอร์โทรเลข 0 ตัวหน้าหาย
// และกัน Sheet แปลงวันที่ ISO เป็นรูปแบบอื่น
var ORDER_TEXT_COLUMNS = ['CreatedAt', 'UpdatedAt', 'Phone'];
var CUSTOMER_TEXT_COLUMNS = ['Phone', 'FirstOrderAt', 'LastOrderAt'];

var VALID_STATUS = ['new', 'paid', 'shipped', 'done', 'cancelled'];

var PROP_ADMIN = 'admin';
var PROP_SESSIONS = 'sessions';
var PROP_LOGIN_FAIL = 'loginFail';
var PROP_ORDER_RATE = 'orderRate';

var SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
var MAX_SESSIONS = 10;

var PBKDF2_ITERATIONS = 5000;
var MIN_PASSWORD_LEN = 8;

var LOGIN_WINDOW_MS = 15 * 60 * 1000;
var LOGIN_MAX_FAIL = 10;
var LOGIN_DELAY_MS = 400;

var ORDER_WINDOW_MS = 10 * 60 * 1000;
var ORDER_MAX_PER_WINDOW = 30;

var LOCK_WAIT_MS = 25000;

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonOut({ error: 'รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง', status: 400 });
  }

  try {
    return jsonOut(handleAction(body));
  } catch (err) {
    var status = (err && err.appStatus) || 500;
    var message = (err && err.message) ? err.message : String(err);
    if (status >= 500) Logger.log('ข้อผิดพลาด: ' + message + '\n' + (err && err.stack));
    return jsonOut({ error: message, status: status });
  }
}

function doGet() {
  return jsonOut({
    ok: true,
    message: 'API ของร้านขนมทำงานอยู่ ใช้วิธี POST ในการเรียกใช้'
  });
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail(status, message) {
  var err = new Error(message);
  err.appStatus = status;
  return err;
}

function handleAction(body) {
  var action = String((body && body.action) || '');

  switch (action) {
    case 'health':        return actionHealth();
    case 'createOrder':   return actionCreateOrder(body);

    case 'setup':         return actionSetup(body);
    case 'login':         return actionLogin(body);
    case 'me':            return actionMe(body);
    case 'logout':        return actionLogout(body);
    case 'changePassword': return actionChangePassword(body);

    case 'listOrders':    requireAuth(body); return { orders: readOrders() };
    case 'listCustomers': requireAuth(body); return { customers: readCustomers() };
    case 'updateStatus':  return actionUpdateStatus(body);
    case 'deleteOrder':   return actionDeleteOrder(body);

    default:
      throw fail(400, 'ไม่รู้จักคำสั่ง "' + action + '"');
  }
}

function getBook() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw fail(500, 'หา Google Sheet ไม่เจอ ต้องผูกสคริปต์กับ Sheet');
  return book;
}

function getSheet(name, headers, textColumns) {
  var book = getBook();
  var sheet = book.getSheetByName(name);

  if (!sheet) {
    sheet = book.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#fdf1e2');
    sheet.setFrozenRows(1);

    (textColumns || []).forEach(function (colName) {
      var index = headers.indexOf(colName);
      if (index >= 0) {
        sheet.getRange(2, index + 1, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
      }
    });
  }
  return sheet;
}

var ordersSheetCache = null;
function ordersSheet() {
  if (!ordersSheetCache) ordersSheetCache = getSheet(SHEET_ORDERS, ORDER_HEADERS, ORDER_TEXT_COLUMNS);
  return ordersSheetCache;
}

var customersSheetCache = null;
function customersSheet() {
  if (!customersSheetCache) customersSheetCache = getSheet(SHEET_CUSTOMERS, CUSTOMER_HEADERS, CUSTOMER_TEXT_COLUMNS);
  return customersSheetCache;
}

function readRows(sheet, headers) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function (row, i) {
    var obj = { _row: i + 2 };
    headers.forEach(function (key, c) { obj[key] = row[c]; });
    return obj;
  }).filter(function (obj) {
    return String(obj[headers[0]] || '').length > 0;
  });
}

function toIso(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toNumber(value) {
  var n = Number(value);
  return isFinite(n) ? n : 0;
}

function readOrders() {
  return readRows(ordersSheet(), ORDER_HEADERS).map(function (row) {
    var items = [];
    try {
      items = JSON.parse(row.ItemsJSON || '[]');
    } catch (e) {
      items = [];
    }
    return {
      id: String(row.OrderID),
      createdAt: toIso(row.CreatedAt),
      updatedAt: toIso(row.UpdatedAt),
      status: String(row.Status || 'new'),
      customerId: String(row.CustomerID || ''),
      customer: {
        name: String(row.Name || ''),
        phone: String(row.Phone || ''),
        email: String(row.Email || ''),
        address: String(row.Address || '')
      },
      items: items,
      qty: toNumber(row.Qty),
      payment: {
        method: String(row.PayMethod || ''),
        label: String(row.PayLabel || '')
      },
      total: toNumber(row.Total),
      note: String(row.Note || '')
    };
  }).reverse();
}

function readCustomers() {
  return readRows(customersSheet(), CUSTOMER_HEADERS).map(function (row) {
    return {
      id: String(row.CustomerID),
      name: String(row.Name || ''),
      phone: String(row.Phone || ''),
      email: String(row.Email || ''),
      address: String(row.Address || ''),
      orderCount: toNumber(row.OrderCount),
      totalSpent: toNumber(row.TotalSpent),
      itemsBought: String(row.ItemsBought || ''),
      firstOrderAt: toIso(row.FirstOrderAt),
      lastOrderAt: toIso(row.LastOrderAt)
    };
  });
}

function cleanText(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max || 500);
}

function digitsOnly(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function findProduct(id) {
  for (var i = 0; i < PRODUCTS.length; i++) {
    if (PRODUCTS[i].id === id) return PRODUCTS[i];
  }
  return null;
}

function buildOrder(payload) {
  var rawItems = (payload && payload.items) || [];
  if (!rawItems.length) throw fail(400, 'ไม่มีรายการสินค้า');
  if (rawItems.length > 20) throw fail(400, 'รายการสินค้ามากเกินไป');

  var items = [];
  var seen = {};
  for (var i = 0; i < rawItems.length; i++) {
    var product = findProduct(rawItems[i].id);
    if (!product) throw fail(400, 'ไม่รู้จักสินค้ารหัส ' + cleanText(rawItems[i].id, 40));
    if (seen[product.id]) throw fail(400, 'มีสินค้า ' + product.name + ' ซ้ำในรายการ');
    seen[product.id] = true;

    var qty = parseInt(rawItems[i].qty, 10);
    if (!(qty >= 1 && qty <= 99)) {
      throw fail(400, 'จำนวนของ ' + product.name + ' ต้องอยู่ระหว่าง 1-99');
    }
    items.push({
      id: product.id,
      name: product.name,
      unit: product.unit,
      price: product.price,
      qty: qty,
      lineTotal: product.price * qty
    });
  }

  var c = (payload && payload.customer) || {};
  var name = cleanText(c.name, 120);
  var phone = cleanText(c.phone, 30);
  var phoneDigits = digitsOnly(phone);
  if (name.length < 2) throw fail(400, 'กรอกชื่อผู้รับ');
  if (phoneDigits.length < 9 || phoneDigits.length > 10) throw fail(400, 'เบอร์โทรต้องมี 9-10 หลัก');

  var email = cleanText(c.email, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw fail(400, 'รูปแบบอีเมลไม่ถูกต้อง');

  var address = cleanText(c.address, 500);
  if (address.length < 10) throw fail(400, 'กรอกที่อยู่ให้ครบ');

  if (!c.consent) throw fail(400, 'ต้องยินยอมให้เก็บข้อมูลเพื่อจัดส่ง');

  var payMethod = (payload.payment && payload.payment.method === 'cod') ? 'cod' : 'promptpay';

  var total = items.reduce(function (sum, item) { return sum + item.lineTotal; }, 0);
  var qty = items.reduce(function (sum, item) { return sum + item.qty; }, 0);

  return {
    items: items,
    qty: qty,
    customer: {
      name: name,
      phone: phone,
      email: email,
      address: address
    },
    payment: {
      method: payMethod,
      label: payMethod === 'cod' ? 'เก็บเงินปลายทาง' : 'โอนเงิน / พร้อมเพย์'
    },
    note: cleanText(payload.note, 500),
    total: total
  };
}

function makeOrderId(sheet) {
  var d = new Date();
  var stamp = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyyMMdd');
  var lastRow = sheet.getLastRow();
  var count = 0;
  if (lastRow >= 2) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).indexOf('ORD-' + stamp) === 0) count++;
    }
  }
  return 'ORD-' + stamp + '-' + ('00' + (count + 1)).slice(-3);
}

// สรุปสินค้าที่ลูกค้าซื้อสะสม เช่น "ขนมปังเนยหนึบ 5 ถุง | บราวนี่ 2 กล่อง"
// อ่านจากชีต Orders ใหม่ทุกครั้ง ยอดจึงตรงกับข้อมูลจริงเสมอ ลบออเดอร์แล้วยอดลดตามเอง
function summarizeItemsBought(oSheet, customerId, newItems) {
  var totals = {};

  var addItems = function (items) {
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || !it.id) continue;
      if (!totals[it.id]) {
        totals[it.id] = { name: it.name || it.id, unit: it.unit || '', qty: 0 };
      }
      totals[it.id].qty += Number(it.qty) || 0;
    }
  };

  var lastRow = oSheet.getLastRow();
  if (lastRow >= 2) {
    var idCol = ORDER_HEADERS.indexOf('CustomerID') + 1;
    var jsonCol = ORDER_HEADERS.indexOf('ItemsJSON') + 1;
    var ids = oSheet.getRange(2, idCol, lastRow - 1, 1).getValues();
    var jsons = oSheet.getRange(2, jsonCol, lastRow - 1, 1).getValues();
    for (var r = 0; r < ids.length; r++) {
      if (String(ids[r][0]) !== String(customerId)) continue;
      try {
        addItems(JSON.parse(jsons[r][0] || '[]'));
      } catch (e) {  }
    }
  }

  addItems(newItems);

  var parts = [];
  var listed = {};
  for (var p = 0; p < PRODUCTS.length; p++) {
    var id = PRODUCTS[p].id;
    listed[id] = true;
    if (totals[id] && totals[id].qty > 0) {
      parts.push(totals[id].name + ' ' + totals[id].qty + ' ' + totals[id].unit);
    }
  }

  for (var key in totals) {
    if (!totals.hasOwnProperty(key) || listed[key]) continue;
    if (totals[key].qty > 0) {
      parts.push(totals[key].name + ' ' + totals[key].qty + ' ' + totals[key].unit);
    }
  }
  return parts.join(' | ');
}

function itemsToText(items) {
  return items.map(function (item) {
    return item.name + ' x' + item.qty + ' ' + item.unit + ' = ' + item.lineTotal + '฿';
  }).join(' | ');
}

function actionHealth() {
  var admin = loadAdmin();
  var prices = {};
  PRODUCTS.forEach(function (p) { prices[p.id] = p.price; });

  return {
    ok: true,
    storage: 'google-sheet',
    needsSetup: !admin,
    config: { prices: prices }
  };
}

function checkOrderRate() {
  var props = PropertiesService.getScriptProperties();
  var now = Date.now();
  var state = { count: 0, resetAt: now + ORDER_WINDOW_MS };
  try {
    var raw = props.getProperty(PROP_ORDER_RATE);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.resetAt > now) state = parsed;
    }
  } catch (e) {  }

  state.count += 1;
  props.setProperty(PROP_ORDER_RATE, JSON.stringify(state));

  if (state.count > ORDER_MAX_PER_WINDOW) {
    throw fail(429, 'มีการสั่งซื้อเข้ามาถี่มากในช่วงนี้ กรุณาลองใหม่อีกครั้งภายหลัง หรือติดต่อร้านทางโทรศัพท์');
  }
}

function actionCreateOrder(body) {
  checkOrderRate();
  var draft = buildOrder(body.order || body);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    throw fail(503, 'ระบบกำลังทำงานหนัก กรุณาลองใหม่อีกครั้ง');
  }

  try {
    var oSheet = ordersSheet();
    var cSheet = customersSheet();
    var nowIso = new Date().toISOString();
    var orderId = makeOrderId(oSheet);

    var phoneKey = digitsOnly(draft.customer.phone);
    var customers = readRows(cSheet, CUSTOMER_HEADERS);
    var existing = null;
    for (var i = 0; i < customers.length; i++) {
      if (digitsOnly(customers[i].Phone) === phoneKey) { existing = customers[i]; break; }
    }

    var customerId;
    if (existing) {
      customerId = String(existing.CustomerID);
      var row = existing._row;
      var col = function (name) { return CUSTOMER_HEADERS.indexOf(name) + 1; };

      cSheet.getRange(row, col('Name')).setValue(draft.customer.name);
      if (draft.customer.email) cSheet.getRange(row, col('Email')).setValue(draft.customer.email);
      if (draft.customer.address) cSheet.getRange(row, col('Address')).setValue(draft.customer.address);
      cSheet.getRange(row, col('OrderCount')).setValue(toNumber(existing.OrderCount) + 1);
      cSheet.getRange(row, col('TotalSpent')).setValue(toNumber(existing.TotalSpent) + draft.total);
      cSheet.getRange(row, col('ItemsBought'))
        .setValue(summarizeItemsBought(oSheet, customerId, draft.items));
      cSheet.getRange(row, col('LastOrderAt')).setValue(nowIso);
    } else {
      customerId = 'CUS-' + phoneKey.slice(-9);
      cSheet.appendRow([
        customerId,
        draft.customer.name,
        draft.customer.phone,
        draft.customer.email,
        draft.customer.address,
        1,
        draft.total,
        summarizeItemsBought(oSheet, customerId, draft.items),
        nowIso,
        nowIso
      ]);

      var newRow = cSheet.getLastRow();
      CUSTOMER_TEXT_COLUMNS.forEach(function (name) {
        var index = CUSTOMER_HEADERS.indexOf(name);
        if (index >= 0) cSheet.getRange(newRow, index + 1).setNumberFormat('@');
      });
      cSheet.getRange(newRow, CUSTOMER_HEADERS.indexOf('Phone') + 1).setValue(draft.customer.phone);
    }

    oSheet.appendRow([
      orderId, nowIso, nowIso, 'new', customerId,
      draft.customer.name, draft.customer.phone, draft.customer.email, draft.customer.address,
      itemsToText(draft.items), JSON.stringify(draft.items), draft.qty, draft.total,
      draft.payment.method, draft.payment.label,
      draft.note
    ]);

    var orderRow = oSheet.getLastRow();
    ORDER_TEXT_COLUMNS.forEach(function (name) {
      var index = ORDER_HEADERS.indexOf(name);
      if (index >= 0) oSheet.getRange(orderRow, index + 1).setNumberFormat('@');
    });
    oSheet.getRange(orderRow, ORDER_HEADERS.indexOf('Phone') + 1).setValue(draft.customer.phone);
    oSheet.getRange(orderRow, ORDER_HEADERS.indexOf('CreatedAt') + 1).setValue(nowIso);
    oSheet.getRange(orderRow, ORDER_HEADERS.indexOf('UpdatedAt') + 1).setValue(nowIso);

    SpreadsheetApp.flush();

    var order = {
      id: orderId,
      status: 'new',
      createdAt: nowIso,
      updatedAt: nowIso,
      items: draft.items,
      qty: draft.qty,
      customer: {
        name: draft.customer.name,
        phone: draft.customer.phone,
        address: draft.customer.address
      },
      payment: draft.payment,
      note: draft.note,
      total: draft.total
    };
    return { order: order };
  } finally {
    lock.releaseLock();
  }
}

function actionUpdateStatus(body) {
  requireAuth(body);

  var id = cleanText(body.id, 40);
  var status = cleanText(body.status, 20);
  if (VALID_STATUS.indexOf(status) < 0) {
    throw fail(400, 'สถานะไม่ถูกต้อง (' + VALID_STATUS.join(', ') + ')');
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) throw fail(503, 'ระบบไม่ว่าง กรุณาลองใหม่');

  try {
    var sheet = ordersSheet();
    var rows = readRows(sheet, ORDER_HEADERS);
    var found = null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].OrderID) === id) { found = rows[i]; break; }
    }
    if (!found) throw fail(404, 'ไม่พบออเดอร์ ' + id);

    var nowIso = new Date().toISOString();
    sheet.getRange(found._row, ORDER_HEADERS.indexOf('Status') + 1).setValue(status);
    sheet.getRange(found._row, ORDER_HEADERS.indexOf('UpdatedAt') + 1).setValue(nowIso);
    SpreadsheetApp.flush();

    return { ok: true, id: id, status: status, updatedAt: nowIso };
  } finally {
    lock.releaseLock();
  }
}

function actionDeleteOrder(body) {
  requireAuth(body);
  var id = cleanText(body.id, 40);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) throw fail(503, 'ระบบไม่ว่าง กรุณาลองใหม่');

  try {
    var sheet = ordersSheet();
    var rows = readRows(sheet, ORDER_HEADERS);
    var found = null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].OrderID) === id) { found = rows[i]; break; }
    }
    if (!found) throw fail(404, 'ไม่พบออเดอร์ ' + id);

    sheet.deleteRow(found._row);
    SpreadsheetApp.flush();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function props() { return PropertiesService.getScriptProperties(); }

function loadAdmin() {
  try {
    var raw = props().getProperty(PROP_ADMIN);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveAdmin(admin) {
  props().setProperty(PROP_ADMIN, JSON.stringify(admin));
}

function randomHex(chunks) {
  var out = '';
  for (var i = 0; i < (chunks || 1); i++) {
    out += Utilities.getUuid().replace(/-/g, '');
  }
  return out;
}

function stringToBytes(str) {
  return Utilities.newBlob(str).getBytes();
}

function hexToBytes(hex) {
  var bytes = [];
  for (var i = 0; i < hex.length; i += 2) {
    var value = parseInt(hex.substr(i, 2), 16);
    bytes.push(value > 127 ? value - 256 : value);
  }
  return bytes;
}

function bytesToHex(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var value = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    out += (value < 16 ? '0' : '') + value.toString(16);
  }
  return out;
}

// PBKDF2-HMAC-SHA256 เขียนเอง เพราะ Apps Script ไม่มี scrypt/bcrypt/PBKDF2 ให้ใช้
// ผลลัพธ์ตรงกับ crypto.pbkdf2 มาตรฐาน ห้ามแก้สูตรนี้ ไม่งั้นรหัสผ่านเดิมจะใช้ไม่ได้
function pbkdf2(password, saltHex, iterations) {
  var passwordBytes = stringToBytes(password);
  var block = hexToBytes(saltHex).concat([0, 0, 0, 1]);

  var u = Utilities.computeHmacSha256Signature(block, passwordBytes);
  var result = u.slice(0);

  for (var i = 1; i < iterations; i++) {
    u = Utilities.computeHmacSha256Signature(u, passwordBytes);
    for (var j = 0; j < result.length; j++) {
      result[j] = result[j] ^ u[j];
    }
  }
  return bytesToHex(result);
}

function safeEqual(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function sha256Hex(str) {
  return bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8));
}

function checkPasswordStrength(password) {
  var pw = String(password || '');
  if (pw.length < MIN_PASSWORD_LEN) return 'รหัสผ่านต้องยาวอย่างน้อย ' + MIN_PASSWORD_LEN + ' ตัวอักษร';
  if (pw.length > 200) return 'รหัสผ่านยาวเกินไป';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข';
  var weak = ['password', '12345678', 'qwerty123', 'admin123', '11111111'];
  if (weak.indexOf(pw.toLowerCase()) >= 0) return 'รหัสผ่านนี้เดาง่ายเกินไป';
  return null;
}

function validateUsername(username) {
  var name = String(username || '').trim();
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(name)) {
    throw fail(400, 'ชื่อผู้ใช้ต้องยาว 3-40 ตัว ใช้ได้เฉพาะ a-z 0-9 . _ -');
  }
  return name.toLowerCase();
}

function loadSessions() {
  try {
    var raw = props().getProperty(PROP_SESSIONS);
    var list = raw ? JSON.parse(raw) : [];
    if (!(list instanceof Array)) list = [];
    var now = Date.now();
    return list.filter(function (s) { return s && s.exp > now; });
  } catch (e) {
    return [];
  }
}

function saveSessions(list) {
  var trimmed = list.slice(-MAX_SESSIONS);
  props().setProperty(PROP_SESSIONS, JSON.stringify(trimmed));
}

function issueToken(username) {
  var token = randomHex(2);
  var sessions = loadSessions();
  sessions.push({
    th: sha256Hex(token),
    u: username,
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS
  });
  saveSessions(sessions);
  return { token: token, expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() };
}

function findSession(token) {
  if (!token) return null;
  var hash = sha256Hex(String(token));
  var sessions = loadSessions();
  for (var i = 0; i < sessions.length; i++) {
    if (safeEqual(sessions[i].th, hash)) return sessions[i];
  }
  return null;
}

function requireAuth(body) {
  var session = findSession(body && body.token);
  if (!session) throw fail(401, 'ต้องล็อกอินก่อนเข้าถึงข้อมูลนี้');
  return session;
}

function loginFailState() {
  var now = Date.now();
  try {
    var raw = props().getProperty(PROP_LOGIN_FAIL);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.resetAt > now) return parsed;
    }
  } catch (e) {  }
  return { count: 0, resetAt: now + LOGIN_WINDOW_MS };
}

function recordLoginFail() {
  var state = loginFailState();
  state.count += 1;
  props().setProperty(PROP_LOGIN_FAIL, JSON.stringify(state));
  return state;
}

function clearLoginFail() {
  props().deleteProperty(PROP_LOGIN_FAIL);
}

function actionSetup(body) {
  if (loadAdmin()) throw fail(409, 'ตั้งบัญชีแอดมินไว้แล้ว');

  var username = validateUsername(body.username);
  var weak = checkPasswordStrength(body.password);
  if (weak) throw fail(400, weak);

  var salt = randomHex(1);
  var admin = {
    username: username,
    salt: salt,
    hash: pbkdf2(body.password, salt, PBKDF2_ITERATIONS),
    algo: 'pbkdf2-sha256',
    iterations: PBKDF2_ITERATIONS,
    createdAt: new Date().toISOString(),
    passwordChangedAt: new Date().toISOString()
  };
  saveAdmin(admin);

  ordersSheet();
  customersSheet();

  var issued = issueToken(username);
  return { ok: true, username: username, token: issued.token, expiresAt: issued.expiresAt };
}

function actionLogin(body) {
  Utilities.sleep(LOGIN_DELAY_MS);

  var state = loginFailState();
  if (state.count >= LOGIN_MAX_FAIL) {
    var wait = Math.ceil((state.resetAt - Date.now()) / 60000);
    throw fail(429, 'ล็อกอินผิดหลายครั้งเกินไป กรุณารออีก ' + wait + ' นาที');
  }

  var admin = loadAdmin();
  if (!admin) throw fail(409, 'ยังไม่ได้ตั้งบัญชีแอดมิน');

  var nameOk = safeEqual(String(body.username || '').trim().toLowerCase(), admin.username);
  var passOk = safeEqual(
    pbkdf2(String(body.password || ''), admin.salt, admin.iterations || PBKDF2_ITERATIONS),
    admin.hash
  );

  if (!nameOk || !passOk) {
    var next = recordLoginFail();
    var left = Math.max(0, LOGIN_MAX_FAIL - next.count);
    throw fail(401, left > 0
      ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (ลองได้อีก ' + left + ' ครั้ง)'
      : 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  clearLoginFail();
  var issued = issueToken(admin.username);
  return { ok: true, username: admin.username, token: issued.token, expiresAt: issued.expiresAt };
}

function actionMe(body) {
  var admin = loadAdmin();
  var session = findSession(body && body.token);
  return {
    authenticated: !!session,
    needsSetup: !admin,
    username: session ? session.u : null,
    minPasswordLength: MIN_PASSWORD_LEN
  };
}

function actionLogout(body) {
  var token = body && body.token;
  if (token) {
    var hash = sha256Hex(String(token));
    var remaining = loadSessions().filter(function (s) { return s.th !== hash; });
    saveSessions(remaining);
  }
  return { ok: true };
}

function actionChangePassword(body) {
  requireAuth(body);
  var admin = loadAdmin();
  if (!admin) throw fail(409, 'ยังไม่ได้ตั้งบัญชีแอดมิน');

  var currentOk = safeEqual(
    pbkdf2(String(body.currentPassword || ''), admin.salt, admin.iterations || PBKDF2_ITERATIONS),
    admin.hash
  );
  if (!currentOk) throw fail(401, 'รหัสผ่านเดิมไม่ถูกต้อง');

  var weak = checkPasswordStrength(body.newPassword);
  if (weak) throw fail(400, weak);

  var salt = randomHex(1);
  var newHash = pbkdf2(String(body.newPassword), salt, PBKDF2_ITERATIONS);
  if (safeEqual(pbkdf2(String(body.newPassword), admin.salt, admin.iterations || PBKDF2_ITERATIONS), admin.hash)) {
    throw fail(400, 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม');
  }

  admin.salt = salt;
  admin.hash = newHash;
  admin.iterations = PBKDF2_ITERATIONS;
  admin.passwordChangedAt = new Date().toISOString();
  saveAdmin(admin);

  props().deleteProperty(PROP_SESSIONS);
  return { ok: true, message: 'เปลี่ยนรหัสผ่านแล้ว กรุณาล็อกอินใหม่' };
}

function resetAdminAccount() {
  props().deleteProperty(PROP_ADMIN);
  props().deleteProperty(PROP_SESSIONS);
  props().deleteProperty(PROP_LOGIN_FAIL);
  Logger.log('ล้างบัญชีแอดมินเรียบร้อย เปิด admin.html เพื่อตั้งบัญชีใหม่');
}

function logoutAllDevices() {
  props().deleteProperty(PROP_SESSIONS);
  Logger.log('ออกจากระบบทุกอุปกรณ์เรียบร้อย');
}

function initSheets() {
  ordersSheet();
  customersSheet();
  Logger.log('สร้าง sheet Orders และ Customers เรียบร้อย');
}
