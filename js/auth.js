(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  const SCREENS = ['#loadingScreen', '#configScreen', '#offlineScreen', '#setupScreen', '#loginScreen'];

  function showScreen(target) {
    SCREENS.forEach(sel => { $(sel).hidden = sel !== target; });
    $('#adminMain').hidden = true;
    $('#userChip').hidden = true;
    $('#logoutBtn').hidden = true;
  }

  function showAdmin(username) {
    SCREENS.forEach(sel => { $(sel).hidden = true; });
    $('#adminMain').hidden = false;
    $('#userName').textContent = username || 'admin';
    $('#userChip').hidden = false;
    $('#logoutBtn').hidden = false;
    window.AdminApp.start();
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
  }

  async function route() {
    showScreen('#loadingScreen');

    if (Store.isNotConfigured()) {
      showScreen('#configScreen');
      return;
    }

    try {
      const me = await Store.auth.me();
      if (me.authenticated) {
        showAdmin(me.username);
      } else if (me.needsSetup) {
        showScreen('#setupScreen');
        $('#setupUser').focus();
      } else {
        Store.auth.clearToken();
        showScreen('#loginScreen');
        $('#loginUser').focus();
      }
    } catch (err) {
      if (err.isNotConfigured) {
        showScreen('#configScreen');
      } else if (err.status === 0 || err.status >= 500) {
        showScreen('#offlineScreen');
        $('#offlineDetail').textContent = err.message;
      } else {
        showScreen('#loginScreen');
        $('#loginError').textContent = err.message;
      }
    }
  }

  function localPasswordProblem(pw) {
    if (pw.length < 8) return 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร';
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข';
    return null;
  }

  async function handleSetup(event) {
    event.preventDefault();
    const btn = $('#setupSubmit');
    const errorSlot = $('#setupError');
    errorSlot.textContent = '';

    const username = $('#setupUser').value.trim();
    const pass = $('#setupPass').value;
    const pass2 = $('#setupPass2').value;

    if (username.length < 3) return void (errorSlot.textContent = 'ชื่อผู้ใช้ต้องยาวอย่างน้อย 3 ตัว');
    const weak = localPasswordProblem(pass);
    if (weak) return void (errorSlot.textContent = weak);
    if (pass !== pass2) return void (errorSlot.textContent = 'รหัสผ่านสองช่องไม่ตรงกัน');

    btn.disabled = true;
    btn.textContent = 'กำลังสร้างบัญชี…';
    try {
      const res = await Store.auth.setup(username, pass);
      $('#setupForm').reset();
      toast('สร้างบัญชีเรียบร้อย');
      showAdmin(res.username);
    } catch (err) {
      errorSlot.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'สร้างบัญชีและเข้าใช้งาน';
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    const btn = $('#loginSubmit');
    const errorSlot = $('#loginError');
    errorSlot.textContent = '';

    const username = $('#loginUser').value.trim();
    const password = $('#loginPass').value;
    if (!username || !password) return void (errorSlot.textContent = 'กรอกชื่อผู้ใช้และรหัสผ่าน');

    btn.disabled = true;
    btn.textContent = 'กำลังเข้าสู่ระบบ…';
    try {
      const res = await Store.auth.login(username, password);
      $('#loginPass').value = '';
      showAdmin(res.username);
    } catch (err) {
      errorSlot.textContent = err.message;
      $('#loginPass').select();
    } finally {
      btn.disabled = false;
      btn.textContent = 'เข้าสู่ระบบ';
    }
  }

  async function handleLogout() {
    try {
      await Store.auth.logout();
    } catch (err) {  }
    window.AdminApp.stop();
    showScreen('#loginScreen');
    $('#loginUser').focus();
    toast('ออกจากระบบแล้ว');
  }

  async function handleChangePassword(event) {
    event.preventDefault();
    const btn = $('#passwordSubmit');
    const errorSlot = $('#passwordError');
    errorSlot.textContent = '';

    const cur = $('#curPass').value;
    const next = $('#newPass').value;
    const next2 = $('#newPass2').value;

    const weak = localPasswordProblem(next);
    if (weak) return void (errorSlot.textContent = weak);
    if (next !== next2) return void (errorSlot.textContent = 'รหัสผ่านใหม่สองช่องไม่ตรงกัน');
    if (cur === next) return void (errorSlot.textContent = 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม');

    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    try {
      await Store.auth.changePassword(cur, next);
      $('#passwordForm').reset();
      window.AdminApp.stop();
      showScreen('#loginScreen');
      $('#loginError').textContent = 'เปลี่ยนรหัสผ่านแล้ว กรุณาล็อกอินใหม่';
      $('#loginUser').focus();
      toast('เปลี่ยนรหัสผ่านเรียบร้อย');
    } catch (err) {
      errorSlot.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'บันทึกรหัสผ่านใหม่';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#setupForm').addEventListener('submit', handleSetup);
    $('#loginForm').addEventListener('submit', handleLogin);
    $('#logoutBtn').addEventListener('click', handleLogout);
    $('#passwordForm').addEventListener('submit', handleChangePassword);
    $('#retryBtn').addEventListener('click', route);
    $('#retryBtn2').addEventListener('click', () => window.location.reload());

    const peek = $('#peekPass');
    peek.addEventListener('click', () => {
      const input = $('#loginPass');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      peek.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
      input.focus();
    });

    window.addEventListener('khanom:unauthorized', () => {
      window.AdminApp.stop();
      showScreen('#loginScreen');
      $('#loginError').textContent = 'เซสชันหมดอายุ กรุณาล็อกอินอีกครั้ง';
    });

    route();
  });
})();
