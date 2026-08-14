class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
  get isAuthError() { return this.status === 401; }
  get isOffline() { return this.status === 0; }
  get isNotConfigured() { return this.status === -1; }
}

const Store = (() => {
  const KEY_CART = 'khanom.cart.v1';
  const KEY_TOKEN = 'khanom.admin.token';

  const config = window.KHANOM_CONFIG || {};
  const apiUrl = String(config.apiUrl || '').trim();

  let health = null;

  const getToken = () => {
    try { return sessionStorage.getItem(KEY_TOKEN) || ''; }
    catch (e) { return ''; }
  };

  const setToken = (token) => {
    try {
      if (token) sessionStorage.setItem(KEY_TOKEN, token);
      else sessionStorage.removeItem(KEY_TOKEN);
    } catch (e) {  }
  };

  const isConfigured = () => /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/.test(apiUrl);

  async function call(action, payload = {}) {
    if (!isConfigured()) {
      throw new ApiError(-1,
        'ยังไม่ได้ตั้งค่าลิงก์ Google Apps Script ในไฟล์ js/config.js');
    }

    const body = { action, ...payload };
    if (!('token' in body)) {
      const token = getToken();
      if (token) body.token = token;
    }

    let res;
    try {
      res = await fetch(apiUrl, {
        method: 'POST',
        redirect: 'follow',

        // text/plain เพื่อไม่ให้เบราว์เซอร์ยิง preflight (OPTIONS) ซึ่ง Apps Script ตอบไม่ได้
        // ถ้าเปลี่ยนเป็น application/json การสั่งซื้อจะพังทันที
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      });
    } catch (err) {
      throw new ApiError(0, 'ติดต่อ Google ไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่');
    }

    let data;
    try {
      data = await res.json();
    } catch (err) {
      throw new ApiError(res.ok ? 502 : res.status,
        'Google ตอบกลับมาในรูปแบบที่อ่านไม่ได้ — ตรวจว่า deploy เป็น Web app ' +
        'และตั้ง Who has access เป็น Anyone แล้ว');
    }

    if (data && data.error) {
      throw new ApiError(data.status || 400, data.error);
    }
    return data || {};
  }

  async function init() {
    try {
      health = await call('health');
    } catch (err) {
      health = null;
      if (err.isNotConfigured) health = { notConfigured: true };
    }
    return health;
  }

  const isOnline = () => !!(health && health.ok);
  const isNotConfigured = () => !isConfigured();
  const needsSetup = () => !!(health && health.needsSetup);
  const serverConfig = () => (health && health.config) || null;

  const getCart = () => {
    try {
      const raw = localStorage.getItem(KEY_CART);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  };

  const setCart = (items) => {
    try { localStorage.setItem(KEY_CART, JSON.stringify(items)); }
    catch (e) {  }
  };

  const clearCart = () => setCart([]);

  const auth = {
    me: () => call('me'),

    async setup(username, password) {
      const res = await call('setup', { username, password, token: '' });
      if (res.token) setToken(res.token);
      return res;
    },

    async login(username, password) {
      const res = await call('login', { username, password, token: '' });
      if (res.token) setToken(res.token);
      return res;
    },

    async logout() {
      try { await call('logout'); }
      finally { setToken(''); }
      return { ok: true };
    },

    async changePassword(currentPassword, newPassword) {
      const res = await call('changePassword', { currentPassword, newPassword });
      setToken('');
      return res;
    },

    hasToken: () => !!getToken(),
    clearToken: () => setToken('')
  };

  const createOrder = (order) => call('createOrder', { order, token: '' });

  const listOrders = async () => (await call('listOrders')).orders || [];

  const listCustomers = async () => (await call('listCustomers')).customers || [];

  const updateOrderStatus = (id, status) => call('updateStatus', { id, status });

  const deleteOrder = (id) => call('deleteOrder', { id });

  return {
    ApiError,
    apiUrl,
    init,
    isOnline,
    isNotConfigured,
    needsSetup,
    serverConfig,
    getCart,
    setCart,
    clearCart,
    auth,
    createOrder,
    listOrders,
    listCustomers,
    updateOrderStatus,
    deleteOrder
  };
})();
