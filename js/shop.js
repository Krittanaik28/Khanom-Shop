(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const baht = (n) => new Intl.NumberFormat('th-TH').format(Math.round(n)) + ' ฿';
  const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const productById = (id) => PRODUCTS.find(p => p.id === id);

  const ICONS = {
    photo: '<rect x="3" y="4" width="18" height="16" rx="3"/>' +
           '<circle cx="8.5" cy="10" r="1.7"/><path d="M20.5 16.5L15.5 11 9 18.5"/>'
  };

  const svgIcon = (name, className = 'icon') =>
    `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

  function imageCandidates(image) {
    const noExt = image.src.replace(/\.[a-z0-9]+$/i, '');
    return [
      image.src,
      `${noExt}.jpeg`,
      `${noExt}.png`,
      `${noExt}.webp`,
      `images/${image.tag}.jpg`,
      `images/${image.tag}.png`
    ];
  }

  function imageFrame(product, image, className = '') {
    const wrap = document.createElement('div');
    wrap.className = className;

    const ph = document.createElement('div');
    ph.className = 'img-placeholder';
    ph.innerHTML = svgIcon('photo', 'ph-icon') + `<small>${escapeHtml(image.tag)}</small>`;
    wrap.appendChild(ph);

    const img = document.createElement('img');
    const candidates = imageCandidates(image);
    let index = 0;

    // ห้ามใส่ loading="lazy" หรือ style.display = 'none' ให้ img ตัวนี้
    // เบราว์เซอร์จะไม่โหลดรูปที่ถูกซ่อนอยู่ ทำให้ event load ไม่เกิดและรูปไม่ขึ้นทั้งหน้า
    // จึงใช้ opacity 0 แล้วไล่ขึ้นเมื่อโหลดเสร็จแทน
    img.className = 'frame-img';
    img.alt = image.alt;
    img.decoding = 'async';

    const onLoaded = () => {
      img.classList.add('is-loaded');
      ph.style.display = 'none';
    };

    img.addEventListener('load', onLoaded);
    img.addEventListener('error', () => {
      index += 1;
      if (index < candidates.length) {
        img.src = candidates[index];
      } else {
        img.remove();
      }
    });

    img.src = candidates[0];
    wrap.appendChild(img);

    if (img.complete && img.naturalWidth > 0) onLoaded();

    return wrap;
  }

  function renderProducts() {
    const grid = $('#productGrid');
    grid.innerHTML = '';

    PRODUCTS.forEach(product => {
      const card = document.createElement('article');
      card.className = 'product-card';

      const gallery = document.createElement('div');
      gallery.className = 'gallery';

      const main = imageFrame(product, product.images[0], 'gallery-main');
      if (product.badge) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = product.badge;
        gallery.appendChild(badge);
      }
      gallery.appendChild(main);

      const thumbs = document.createElement('div');
      thumbs.className = 'thumbs';
      product.images.forEach((image, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'thumb';
        btn.setAttribute('aria-label', `ดูรูปที่ ${i + 1} ของ ${product.name}`);
        btn.setAttribute('aria-current', i === 0 ? 'true' : 'false');
        btn.appendChild(imageFrame(product, image, 'thumb-inner'));
        btn.addEventListener('click', () => {
          const fresh = imageFrame(product, image, 'gallery-main');
          gallery.replaceChild(fresh, gallery.querySelector('.gallery-main'));
          $$('.thumb', thumbs).forEach((t, ti) => t.setAttribute('aria-current', String(ti === i)));
        });
        thumbs.appendChild(btn);
      });
      gallery.appendChild(thumbs);
      card.appendChild(gallery);

      const body = document.createElement('div');
      body.className = 'product-body';
      body.innerHTML = `
        <div class="product-title">
          <h3>${escapeHtml(product.name)}</h3>
          <span class="price">${baht(product.price)}<small> / ${escapeHtml(product.unit)}</small></span>
        </div>
        <p class="product-sub">${escapeHtml(product.subtitle)}</p>
        <p class="product-desc">${escapeHtml(product.desc)}</p>
      `;

      const actions = document.createElement('div');
      actions.className = 'product-actions';

      const qty = document.createElement('div');
      qty.className = 'qty';
      qty.innerHTML = `
        <button type="button" aria-label="ลดจำนวน ${escapeHtml(product.name)}">−</button>
        <input type="number" min="1" max="99" value="1"
               aria-label="จำนวน ${escapeHtml(product.name)} (${escapeHtml(product.unit)})" />
        <button type="button" aria-label="เพิ่มจำนวน ${escapeHtml(product.name)}">+</button>
      `;
      const [minus, plus] = $$('button', qty);
      const input = $('input', qty);
      const clamp = () => {
        let v = parseInt(input.value, 10);
        if (!Number.isFinite(v) || v < 1) v = 1;
        if (v > 99) v = 99;
        input.value = String(v);
        return v;
      };
      minus.addEventListener('click', () => { input.value = String(Math.max(1, clamp() - 1)); });
      plus.addEventListener('click', () => { input.value = String(Math.min(99, clamp() + 1)); });
      input.addEventListener('change', clamp);

      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'btn btn-primary';
      add.textContent = 'ใส่ตะกร้า';
      add.addEventListener('click', () => {
        addToCart(product.id, clamp());
        input.value = '1';
      });

      actions.append(qty, add);
      body.appendChild(actions);
      card.appendChild(body);
      grid.appendChild(card);
    });
  }

  function renderHeroArt() {
    const art = $('#heroArt');
    if (!art) return;
    art.innerHTML = '';

    PRODUCTS.forEach((product, i) => {
      const card = document.createElement('div');
      card.className = `hero-card hero-card-${i + 1}`;
      card.appendChild(imageFrame(product, product.images[0], 'hero-card-media'));
      art.appendChild(card);
    });
  }

  let cart = [];

  const loadCart = () => {
    cart = Store.getCart().filter(line => productById(line.id) && line.qty > 0);
  };
  const persistCart = () => Store.setCart(cart);

  function addToCart(id, qty) {
    const line = cart.find(l => l.id === id);
    if (line) line.qty = Math.min(99, line.qty + qty);
    else cart.push({ id, qty: Math.min(99, qty) });
    persistCart();
    renderCart();
    const p = productById(id);
    toast(`เพิ่ม ${p.name} ${qty} ${p.unit} ลงตะกร้าแล้ว`);
    openCart();
  }

  function setQty(id, qty) {
    const line = cart.find(l => l.id === id);
    if (!line) return;
    if (qty <= 0) cart = cart.filter(l => l.id !== id);
    else line.qty = Math.min(99, qty);
    persistCart();
    renderCart();
  }

  function removeLine(id) {
    cart = cart.filter(l => l.id !== id);
    persistCart();
    renderCart();
  }

  const cartItemCount = () => cart.reduce((s, l) => s + l.qty, 0);

  function paymentKey() {
    const checked = $('input[name="payment"]:checked');
    return checked ? checked.value : 'promptpay';
  }

  const grandTotal = () => cart.reduce((s, l) => s + productById(l.id).price * l.qty, 0);

  function renderCart() {
    const box = $('#cartItems');
    box.innerHTML = '';

    if (cart.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cart-empty';

      const thumbs = document.createElement('div');
      thumbs.className = 'cart-empty-thumbs';
      PRODUCTS.forEach(p => thumbs.appendChild(imageFrame(p, p.images[0], 'cart-empty-thumb')));

      const title = document.createElement('p');
      title.textContent = 'ตะกร้ายังว่างอยู่';

      const hint = document.createElement('p');
      hint.className = 'cart-empty-hint';
      hint.textContent = 'เลือกขนมที่ชอบแล้วกด “ใส่ตะกร้า”';

      empty.append(thumbs, title, hint);
      box.appendChild(empty);
    } else {
      cart.forEach(line => {
        const p = productById(line.id);
        const row = document.createElement('div');
        row.className = 'cart-line';

        row.appendChild(imageFrame(p, p.images[0], 'cart-thumb'));

        const mid = document.createElement('div');
        mid.innerHTML = `
          <div class="cart-line-name">${escapeHtml(p.name)}</div>
          <div class="cart-line-meta">${baht(p.price)} / ${escapeHtml(p.unit)}</div>
        `;
        const qty = document.createElement('div');
        qty.className = 'qty';
        qty.style.marginTop = '.35rem';
        qty.innerHTML = `
          <button type="button" aria-label="ลดจำนวน ${escapeHtml(p.name)}">−</button>
          <input type="number" min="1" max="99" value="${line.qty}" aria-label="จำนวน ${escapeHtml(p.name)}" />
          <button type="button" aria-label="เพิ่มจำนวน ${escapeHtml(p.name)}">+</button>
        `;
        const [dec, inc] = $$('button', qty);
        const inp = $('input', qty);
        dec.addEventListener('click', () => setQty(line.id, line.qty - 1));
        inc.addEventListener('click', () => setQty(line.id, line.qty + 1));
        inp.addEventListener('change', () => {
          const v = parseInt(inp.value, 10);
          setQty(line.id, Number.isFinite(v) ? v : 1);
        });
        mid.appendChild(qty);
        row.appendChild(mid);

        const right = document.createElement('div');
        right.className = 'cart-line-right';
        right.innerHTML = `<span class="cart-line-price">${baht(p.price * line.qty)}</span>`;
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'link-remove';
        del.textContent = 'ลบ';
        del.addEventListener('click', () => removeLine(line.id));
        right.appendChild(del);
        row.appendChild(right);

        box.appendChild(row);
      });
    }

    const count = cartItemCount();
    $('#cartCount').textContent = String(count);
    $('#sumCount').textContent = count === 0 ? '-' : `${count} ชิ้น`;
    $('#sumTotal').textContent = baht(grandTotal());
    $('#goCheckout').disabled = cart.length === 0;

    renderRecap();
  }

  const overlay = $('#overlay');
  const drawer = $('#cartDrawer');

  function openCart() {
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    overlay.hidden = false;
  }
  function closeCart() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    if ($('#checkoutModal').hidden && $('#successModal').hidden) overlay.hidden = true;
  }

  function openModal(id) {
    $(`#${id}`).hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModal(id) {
    $(`#${id}`).hidden = true;
    if ($('#checkoutModal').hidden && $('#successModal').hidden) document.body.style.overflow = '';
  }

  let toastTimer = null;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function renderRecap() {
    const box = $('#orderRecap');
    if (!box) return;
    const lines = cart.map(l => {
      const p = productById(l.id);
      return `<div class="recap-line"><span>${escapeHtml(p.name)} × ${l.qty} ${escapeHtml(p.unit)}</span><span>${baht(p.price * l.qty)}</span></div>`;
    }).join('');
    box.innerHTML = `
      ${lines}
      <div class="recap-total"><span>ยอดที่ต้องจ่าย</span><span>${baht(grandTotal())}</span></div>
    `;
  }

  function showError(inputId, message) {
    const input = $(`#${inputId}`);
    const slot = $(`[data-error-for="${inputId}"]`);
    if (input) input.classList.toggle('invalid', !!message);
    if (slot) slot.textContent = message || '';
  }

  function clearErrors() {
    ['fName', 'fPhone', 'fEmail', 'fAddress', 'fConsent'].forEach(id => showError(id, ''));
    $('#formError').textContent = '';
  }

  function validate() {
    clearErrors();
    let firstBad = null;
    const fail = (id, msg) => { showError(id, msg); if (!firstBad) firstBad = $(`#${id}`); };

    const name = $('#fName').value.trim();
    if (name.length < 2) fail('fName', 'กรอกชื่อผู้รับ');

    const phoneDigits = $('#fPhone').value.replace(/\D/g, '');
    if (phoneDigits.length < 9 || phoneDigits.length > 10) fail('fPhone', 'กรอกเบอร์โทร 9-10 หลัก');

    const email = $('#fEmail').value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail('fEmail', 'รูปแบบอีเมลไม่ถูกต้อง');

    if ($('#fAddress').value.trim().length < 10) {
      fail('fAddress', 'กรอกที่อยู่ให้ครบ');
    }

    if (!$('#fConsent').checked) fail('fConsent', 'ต้องยินยอมให้เก็บข้อมูลเพื่อจัดส่ง');

    if (cart.length === 0) $('#formError').textContent = 'ตะกร้าว่าง กรุณาเลือกสินค้า';

    if (firstBad) firstBad.focus();
    return !firstBad && cart.length > 0;
  }

  function buildPayload() {
    return {
      items: cart.map(l => ({ id: l.id, qty: l.qty })),
      customer: {
        name: $('#fName').value.trim(),
        phone: $('#fPhone').value.trim(),
        email: $('#fEmail').value.trim(),
        address: $('#fAddress').value.trim(),
        consent: $('#fConsent').checked
      },

      payment: { method: paymentKey() },
      note: $('#fNote').value.trim()
    };
  }

  function orderTextFromForm() {
    return [
      'สั่งขนม',
      `ชื่อ: ${$('#fName').value.trim()} / โทร: ${$('#fPhone').value.trim()}`,
      ...cart.map(l => {
        const p = productById(l.id);
        return `- ${p.name} x${l.qty} ${p.unit} = ${p.price * l.qty} บาท`;
      }),
      `รวม ${cartItemCount()} ชิ้น`,
      `ที่อยู่: ${$('#fAddress').value.trim()}`,
      `ชำระ: ${paymentKey() === 'cod' ? 'เก็บเงินปลายทาง' : 'โอนเงิน / พร้อมเพย์'}`,
      `ยอดที่ต้องจ่าย: ${grandTotal()} บาท`,
      $('#fNote').value.trim() ? `หมายเหตุ: ${$('#fNote').value.trim()}` : ''
    ].filter(Boolean).join('\n');
  }

  async function copyText(text, okMessage) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMessage);
    } catch (e) {
      toast('เบราว์เซอร์ไม่อนุญาตให้คัดลอก ลองเลือกข้อความเอง');
    }
  }

  let lastOrderText = '';

  async function submitOrder(event) {
    event.preventDefault();
    if (!validate()) return;

    const btn = $('#submitOrder');
    btn.disabled = true;
    btn.textContent = 'กำลังส่งออเดอร์…';
    $('#copyFallback').hidden = true;

    try {
      const payload = buildPayload();
      const { order } = await Store.createOrder(payload);
      if (!order || !order.id) throw new Error('ระบบไม่ได้ส่งเลขที่ออเดอร์กลับมา');

      cart = [];
      Store.clearCart();
      renderCart();

      $('#successOrderId').textContent = order.id;
      $('#successDetail').innerHTML = `
        <div><strong>ผู้รับ:</strong> ${escapeHtml(order.customer.name)} (${escapeHtml(order.customer.phone)})</div>
        <div><strong>รายการ:</strong> ${order.items.map(i => `${escapeHtml(i.name)} × ${i.qty}`).join(', ')}</div>
        <div><strong>จำนวนสินค้า:</strong> ${order.items.reduce((s, i) => s + i.qty, 0)} ชิ้น</div>
        ${order.customer.address ? `<div><strong>ที่อยู่:</strong> ${escapeHtml(order.customer.address)}</div>` : ''}
        <div><strong>ชำระเงิน:</strong> ${escapeHtml(order.payment.label)}</div>
        <div><strong>ยอดที่ต้องจ่าย:</strong> ${baht(order.total)}</div>
        ${order.payment.method === 'promptpay'
          ? `<div style="margin-top:.5rem">โอนเข้าพร้อมเพย์ <strong>${SHOP.promptpay}</strong> แล้วส่งสลิปพร้อมเลขออเดอร์มาที่ Facebook: ${SHOP.facebook}</div>`
          : ''}
      `;

      lastOrderText = [
        `ออเดอร์ ${order.id}`,
        `ชื่อ: ${order.customer.name} / โทร: ${order.customer.phone}`,
        ...order.items.map(i => `- ${i.name} x${i.qty} ${i.unit} = ${i.lineTotal} บาท`),
        `รวม ${order.items.reduce((s, i) => s + i.qty, 0)} ชิ้น`,
        order.customer.address ? `ที่อยู่: ${order.customer.address}` : '',
        `ชำระ: ${order.payment.label}`,
        `ยอดที่ต้องจ่าย: ${order.total} บาท`,
        order.note ? `หมายเหตุ: ${order.note}` : ''
      ].filter(Boolean).join('\n');

      closeModal('checkoutModal');
      closeCart();
      overlay.hidden = true;
      openModal('successModal');
      $('#checkoutForm').reset();
    } catch (err) {
      console.error(err);

      const offline = err.status === 0 || err.status === -1 || err.status >= 500;
      $('#formError').innerHTML = offline
        ? 'ส่งออเดอร์ไม่สำเร็จ ระบบติดต่อร้านไม่ได้ชั่วคราว<br />กรุณาโทร ' +
          `<a href="tel:${SHOP.phoneRaw}">${SHOP.phone}</a> หรือคัดลอกรายละเอียดไปส่งทางแชต`
        : escapeHtml('ส่งออเดอร์ไม่สำเร็จ: ' + err.message);
      $('#copyFallback').hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'ยืนยันสั่งซื้อ';
    }
  }

  function bindEvents() {
    $('#cartButton').addEventListener('click', openCart);
    $('#closeCart').addEventListener('click', closeCart);
    overlay.addEventListener('click', closeCart);

    $('#goCheckout').addEventListener('click', () => {
      renderRecap();
      openModal('checkoutModal');
      setTimeout(() => $('#fName').focus(), 60);
    });
    $('#closeCheckout').addEventListener('click', () => closeModal('checkoutModal'));
    $('#checkoutForm').addEventListener('submit', submitOrder);
    $$('input[name="payment"]').forEach(r => r.addEventListener('change', renderCart));

    $('#closeSuccess').addEventListener('click', () => closeModal('successModal'));
    $('#copyOrder').addEventListener('click', () =>
      copyText(lastOrderText, 'คัดลอกรายละเอียดออเดอร์แล้ว'));
    $('#copyFallback').addEventListener('click', () =>
      copyText(orderTextFromForm(), 'คัดลอกแล้ว ส่งข้อความนี้ให้ร้านทางแชตได้เลย'));

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#successModal').hidden) closeModal('successModal');
      else if (!$('#checkoutModal').hidden) closeModal('checkoutModal');
      else if (drawer.classList.contains('open')) closeCart();
    });
  }

  function syncPricesFromServer() {
    const config = Store.serverConfig();
    if (!config) return false;

    let changed = false;

    if (config.prices) {
      PRODUCTS.forEach(product => {
        const serverPrice = Number(config.prices[product.id]);
        if (Number.isFinite(serverPrice) && serverPrice > 0 && serverPrice !== product.price) {
          console.warn(`ราคา ${product.name} ในหน้าเว็บ (${product.price}) ` +
            `ไม่ตรงกับใน Apps Script (${serverPrice}) — ใช้ราคาจาก Apps Script`);
          product.price = serverPrice;
          changed = true;
        }
      });
    }

    return changed;
  }

  async function init() {
    $('#year').textContent = new Date().getFullYear();
    renderHeroArt();
    renderProducts();
    loadCart();
    renderCart();
    bindEvents();

    await Store.init();

    if (syncPricesFromServer()) {
      renderHeroArt();
      renderProducts();
      renderCart();
    }

    const online = Store.isOnline();
    $('#modeNote').textContent = online
      ? 'ออเดอร์ของคุณถูกบันทึกตรงเข้าระบบของทางร้าน มีเพียงเจ้าของร้านที่เข้าดูได้'
      : 'ระบบสั่งซื้อออนไลน์ติดต่อไม่ได้ชั่วคราว กรุณาสั่งทางโทรศัพท์หรือเฟซบุ๊ก';
    $('#offlineWarn').hidden = online;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
