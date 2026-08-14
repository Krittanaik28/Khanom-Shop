window.AdminApp = (() => {
  'use strict';

  const REFRESH_MS = 60000;

  const $ = (sel, root = document) => root.querySelector(sel);

  const baht = (n) => new Intl.NumberFormat('th-TH').format(Math.round(n || 0)) + ' ฿';
  const escapeHtml = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const fmtDate = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleString('th-TH', {
      day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  };

  const STATUS = {
    new: { label: 'ใหม่', cls: 'pill-new' },
    paid: { label: 'ชำระแล้ว', cls: 'pill-paid' },
    shipped: { label: 'ส่งแล้ว', cls: 'pill-shipped' },
    done: { label: 'เสร็จสิ้น', cls: 'pill-done' },
    cancelled: { label: 'ยกเลิก', cls: 'pill-cancel' }
  };

  let orders = [];
  let customers = [];
  let refreshTimer = null;
  let running = false;
  let bound = false;

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function handleError(err, fallbackMsg) {
    if (err && err.status === 401) {
      window.dispatchEvent(new CustomEvent('khanom:unauthorized'));
      return;
    }
    console.error(err);
    toast((fallbackMsg ? fallbackMsg + ': ' : '') + (err && err.message ? err.message : 'เกิดข้อผิดพลาด'));
  }

  async function loadAll({ quiet = false } = {}) {
    if (!running) return;
    try {
      const [o, c] = await Promise.all([Store.listOrders(), Store.listCustomers()]);
      orders = o;
      customers = c;
      renderStats();
      renderOrders();
      renderCustomers();
      renderProductStats();
      if (!quiet) toast('โหลดข้อมูลล่าสุดแล้ว');
    } catch (err) {
      handleError(err, 'โหลดข้อมูลไม่สำเร็จ');
    }
  }

  function renderStats() {
    const active = orders.filter(o => o.status !== 'cancelled');
    $('#statOrders').textContent = String(orders.length);
    $('#statRevenue').textContent = baht(active.reduce((s, o) => s + (o.total || 0), 0));
    $('#statCustomers').textContent = String(customers.length);
    $('#statPending').textContent = String(orders.filter(o => o.status === 'new' || o.status === 'paid').length);
  }

  function filteredOrders() {
    const q = $('#orderSearch').value.trim().toLowerCase();
    const status = $('#statusFilter').value;
    return orders.filter(o => {
      if (status && o.status !== status) return false;
      if (!q) return true;
      const hay = [o.id, o.customer && o.customer.name, o.customer && o.customer.phone, o.note]
        .join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  function renderOrders() {
    const tbody = $('#orderRows');
    const rows = filteredOrders();
    tbody.innerHTML = '';

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-row">ยังไม่มีออเดอร์ที่ตรงเงื่อนไข</td></tr>';
      return;
    }

    rows.forEach(o => {
      const tr = document.createElement('tr');
      const st = STATUS[o.status] || STATUS.new;
      const phone = (o.customer && o.customer.phone) || '';

      tr.innerHTML = `
        <td><strong>${escapeHtml(o.id)}</strong></td>
        <td>${escapeHtml(fmtDate(o.createdAt))}</td>
        <td>
          ${escapeHtml(o.customer && o.customer.name)}<br />
          <a href="tel:${escapeHtml(phone.replace(/\D/g, ''))}">${escapeHtml(phone)}</a>
          ${o.customer && o.customer.address ? `<div class="addr-cell">${escapeHtml(o.customer.address)}</div>` : ''}
        </td>
        <td class="items-cell">
          ${(o.items || []).map(i => `${escapeHtml(i.name)} × ${i.qty}`).join('<br />')}
          ${o.note ? `<div class="note-flag">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="M14.5 5.5l4 4" />
            </svg>${escapeHtml(o.note)}</div>` : ''}
        </td>
        <td class="num">${o.qty || (o.items || []).reduce((s, i) => s + i.qty, 0)}</td>
        <td class="num">${baht(o.total)}</td>
        <td class="items-cell">${escapeHtml((o.payment && o.payment.label) || '-')}</td>
        <td><span class="pill ${st.cls}">${st.label}</span></td>
        <td class="action-cell"></td>
      `;

      const actionCell = tr.lastElementChild;

      const select = document.createElement('select');
      select.className = 'status-select';
      select.setAttribute('aria-label', 'เปลี่ยนสถานะออเดอร์ ' + o.id);
      Object.entries(STATUS).forEach(([key, meta]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = meta.label;
        if (key === o.status) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener('change', async () => {
        const previous = o.status;
        try {
          await Store.updateOrderStatus(o.id, select.value);
          o.status = select.value;
          renderStats();
          renderOrders();
          renderProductStats();
          toast(`อัปเดต ${o.id} เป็น "${STATUS[select.value].label}"`);
        } catch (err) {
          select.value = previous;
          handleError(err, 'อัปเดตไม่สำเร็จ');
        }
      });
      actionCell.appendChild(select);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'link-remove';
      del.textContent = 'ลบ';
      del.addEventListener('click', async () => {
        const ok = window.confirm(
          `ลบออเดอร์ ${o.id} ถาวร?\n\nการลบไม่สามารถย้อนกลับได้ และยอดซื้อสะสมของลูกค้าจะไม่ถูกหักออก\nถ้าเป็นออเดอร์ที่ยกเลิก แนะนำเปลี่ยนสถานะเป็น "ยกเลิก" แทนการลบ`
        );
        if (!ok) return;
        try {
          await Store.deleteOrder(o.id);
          orders = orders.filter(x => x.id !== o.id);
          renderStats();
          renderOrders();
          renderProductStats();
          toast(`ลบ ${o.id} แล้ว`);
        } catch (err) {
          handleError(err, 'ลบไม่สำเร็จ');
        }
      });
      actionCell.appendChild(del);

      tbody.appendChild(tr);
    });
  }

  function filteredCustomers() {
    const q = $('#customerSearch').value.trim().toLowerCase();
    const list = [...customers].sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0));
    if (!q) return list;
    return list.filter(c => [c.name, c.phone, c.email].join(' ').toLowerCase().includes(q));
  }

  function renderCustomers() {
    const tbody = $('#customerRows');
    const rows = filteredCustomers();
    tbody.innerHTML = '';

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-row">ยังไม่มีข้อมูลลูกค้า</td></tr>';
      return;
    }

    rows.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(c.name)}</strong></td>
        <td><a href="tel:${escapeHtml((c.phone || '').replace(/\D/g, ''))}">${escapeHtml(c.phone)}</a></td>
        <td>${escapeHtml(c.email || '-')}</td>
        <td class="addr-cell">${escapeHtml(c.address || '-')}</td>
        <td class="num">${c.orderCount || 0}</td>
        <td class="num">${baht(c.totalSpent)}</td>
        <td class="items-cell">${escapeHtml(c.itemsBought || '-')}</td>
        <td>${escapeHtml(fmtDate(c.lastOrderAt))}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderProductStats() {
    const tbody = $('#productRows');
    const active = orders.filter(o => o.status !== 'cancelled');

    const rows = PRODUCTS.map(p => {
      let qty = 0;
      let revenue = 0;
      active.forEach(o => (o.items || []).forEach(i => {
        if (i.id === p.id) {
          qty += i.qty;
          revenue += i.lineTotal != null ? i.lineTotal : i.price * i.qty;
        }
      }));
      return { p, qty, revenue };
    });

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td class="product-cell">
          <span class="stat-thumb">
            <img src="${escapeHtml(r.p.images[0].src)}" alt="" decoding="async" />
          </span>
          <strong>${escapeHtml(r.p.name)}</strong>
        </td>
        <td class="num">${baht(r.p.price)} / ${escapeHtml(r.p.unit)}</td>
        <td class="num">${r.qty} ${escapeHtml(r.p.unit)}</td>
        <td class="num">${baht(r.revenue)}</td>
      </tr>
    `).join('') + `
      <tr>
        <td><strong>รวม</strong></td>
        <td class="num">-</td>
        <td class="num"><strong>${rows.reduce((s, r) => s + r.qty, 0)} ชิ้น</strong></td>
        <td class="num"><strong>${baht(rows.reduce((s, r) => s + r.revenue, 0))}</strong></td>
      </tr>`;
  }

  function toCsv(headers, rows) {
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
  }

  function download(filename, csv) {
    // ใส่ BOM เพื่อให้ Excel อ่านภาษาไทยถูก
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportOrders() {
    const rows = filteredOrders().map(o => [
      o.id,
      o.createdAt,
      o.customer && o.customer.name,
      o.customer && o.customer.phone,
      o.customer && o.customer.email,
      o.customer && o.customer.address,
      (o.items || []).map(i => `${i.name} x${i.qty}`).join(' | '),
      o.qty || (o.items || []).reduce((s, i) => s + i.qty, 0),
      o.total,
      o.payment && o.payment.label,
      (STATUS[o.status] || {}).label || o.status,
      o.note
    ]);
    const headers = ['เลขออเดอร์', 'วันที่', 'ชื่อ', 'เบอร์โทร', 'อีเมล', 'ที่อยู่', 'รายการ',
      'จำนวนสินค้า', 'ยอดที่ต้องจ่าย', 'วิธีชำระ', 'สถานะ', 'หมายเหตุ'];
    download(`orders-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows));
    toast('ส่งออกไฟล์ออเดอร์แล้ว');
  }

  function exportCustomers() {
    const rows = filteredCustomers().map(c => [
      c.id, c.name, c.phone, c.email, c.address,
      c.orderCount, c.totalSpent, c.itemsBought, c.firstOrderAt, c.lastOrderAt
    ]);
    const headers = ['รหัสลูกค้า', 'ชื่อ', 'เบอร์โทร', 'อีเมล', 'ที่อยู่',
      'จำนวนออเดอร์', 'ยอดสะสม', 'สินค้าที่ซื้อสะสม', 'ซื้อครั้งแรก', 'ซื้อล่าสุด'];
    download(`customers-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows));
    toast('ส่งออกไฟล์ลูกค้าแล้ว');
  }

  /* ================= แท็บ ================= */

  const TABS = [
    ['#tabOrders', '#panelOrders'],
    ['#tabCustomers', '#panelCustomers'],
    ['#tabProducts', '#panelProducts'],
    ['#tabAccount', '#panelAccount']
  ];

  function setupTabs() {
    TABS.forEach(([tabSel, panelSel]) => {
      $(tabSel).addEventListener('click', () => {
        TABS.forEach(([t, p]) => {
          const on = t === tabSel;
          $(t).setAttribute('aria-selected', String(on));
          $(p).hidden = !on;
        });
      });
    });
  }

  /* ================= เปิด / ปิดการทำงาน ================= */

  function bindOnce() {
    if (bound) return;
    bound = true;
    setupTabs();
    $('#orderSearch').addEventListener('input', renderOrders);
    $('#statusFilter').addEventListener('change', renderOrders);
    $('#customerSearch').addEventListener('input', renderCustomers);
    $('#refreshBtn').addEventListener('click', () => loadAll());
    $('#exportOrders').addEventListener('click', exportOrders);
    $('#exportCustomers').addEventListener('click', exportCustomers);
  }

  function start() {
    bindOnce();
    running = true;
    loadAll({ quiet: true });
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') loadAll({ quiet: true });
    }, REFRESH_MS);
  }

  function stop() {
    running = false;
    clearInterval(refreshTimer);
    refreshTimer = null;
    orders = [];
    customers = [];
    // ล้างข้อมูลบนหน้าจอ ไม่ให้ค้างอยู่หลังออกจากระบบ
    ['#orderRows', '#customerRows', '#productRows'].forEach(sel => { $(sel).innerHTML = ''; });
    ['#statOrders', '#statCustomers', '#statPending'].forEach(sel => { $(sel).textContent = '0'; });
    $('#statRevenue').textContent = '0 ฿';
  }

  return { start, stop };
})();
