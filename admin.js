// =========================================================
// admin.js — منطق لوحة الإدارة (admin.html)
// =========================================================
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  orderBy,
  where,
  onSnapshot,
  serverTimestamp,
  increment,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { db, auth } from "./firebase-config.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const money = (n) => `${Number(n || 0).toLocaleString("ar-EG")} ج.م`;

// رابط المتجر الفعلي (واجهة العملاء) — لوحة التحكم بقت على ريبو/رابط منفصل تمامًا
// عن المتجر، فمينفعش نشتق رابط المتجر من رابط الصفحة الحالية، لازم يتحدد يدويًا هنا.
const STORE_BASE_URL = "https://a7m721.github.io/darstore/";

function showAdminToast(msg) {
  const t = $("#admin-toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showAdminToast._t);
  showAdminToast._t = setTimeout(() => t.classList.remove("show"), 4000);
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    [880, 1180].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.14;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.25);
    });
    setTimeout(() => ctx.close(), 700);
  } catch (e) { /* المتصفح مانعش تشغيل الصوت، مفيش داعي لأي إجراء */ }
}

const escapeHtml = (str) => String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function showLowStockToast(product) {
  const t = $("#admin-toast");
  let html = `⚠️ نفدت الكمية: ${escapeHtml(product.name)}`;
  if (STOCK_ALERT_PHONE) {
    const text = `⚠️ تنبيه: نفدت الكمية من "${product.name}" في ${STORE_NAME}. حدّث الكمية من لوحة الإدارة.`;
    const waLink = `https://wa.me/${toWhatsAppNumber(STOCK_ALERT_PHONE)}?text=${encodeURIComponent(text)}`;
    html += ` <a href="${waLink}" target="_blank" class="toast-action-link">📩 تنبيه واتساب</a>`;
  }
  t.innerHTML = html;
  t.classList.add("show");
  clearTimeout(showAdminToast._t);
  showAdminToast._t = setTimeout(() => t.classList.remove("show"), 7000);
}

/* ---------------- Invoice printing ---------------- */
function printInvoice(order, storeName, storeLogo) {
  const itemsRows = (order.items || []).map(i => `
    <tr>
      <td>${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ""}</td>
      <td>${i.qty}</td>
      <td>${money(i.price)}</td>
      <td>${money(i.price * i.qty)}</td>
    </tr>`).join("");
  const date = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString("ar-EG") : new Date().toLocaleDateString("ar-EG");
  const win = window.open("", "_blank");
  if (!win) { alert("المتصفح منع فتح نافذة الطباعة، من فضلك اسمح بالنوافذ المنبثقة لهذا الموقع"); return; }
  win.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>فاتورة طلب #${order.id.slice(0, 6)}</title>
<style>
  body{font-family:Tahoma,Arial,sans-serif; padding:40px; color:#111; max-width:700px; margin:0 auto;}
  .invoice-head{display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #111; padding-bottom:16px; margin-bottom:24px;}
  .invoice-head img{height:50px;}
  h1{font-size:20px; margin:0;}
  table{width:100%; border-collapse:collapse; margin:20px 0;}
  th, td{border:1px solid #ccc; padding:10px; text-align:right; font-size:13px;}
  th{background:#f2f2f2;}
  .totals{width:280px; margin-right:auto; margin-top:12px;}
  .totals div{display:flex; justify-content:space-between; padding:4px 0; font-size:13.5px;}
  .totals .grand{font-weight:800; font-size:16px; border-top:1px solid #111; padding-top:8px; margin-top:4px;}
  .meta{margin-bottom:20px; font-size:13.5px; line-height:1.9;}
  .print-btn{margin-top:24px; padding:10px 22px; cursor:pointer; font-size:14px; border-radius:8px; border:1px solid #111; background:#111; color:#fff;}
  @media print{ .no-print{display:none;} }
</style>
</head>
<body>
  <div class="invoice-head">
    <div><h1>${storeName || "المتجر"}</h1><div>فاتورة طلب</div></div>
    ${storeLogo ? `<img src="${storeLogo}">` : ""}
  </div>
  <div class="meta">
    <div><strong>رقم الطلب:</strong> #${order.id.slice(0, 6)}</div>
    <div><strong>التاريخ:</strong> ${date}</div>
    <div><strong>اسم العميل:</strong> ${order.customerName || ""}</div>
    <div><strong>الهاتف:</strong> ${order.phone || ""}</div>
    <div><strong>العنوان:</strong> ${order.address || ""}</div>
  </div>
  <table>
    <thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
    <tbody>${itemsRows}</tbody>
  </table>
  <div class="totals">
    <div><span>المجموع الفرعي</span><span>${money(order.subtotal ?? order.total)}</span></div>
    ${order.couponCode ? `<div><span>خصم (${order.couponCode})</span><span>− ${money(order.discountAmount || 0)}</span></div>` : ""}
    <div class="grand"><span>الإجمالي</span><span>${money(order.total)}</span></div>
  </div>
  <button class="print-btn no-print" onclick="window.print()">🖨️ طباعة</button>
</body>
</html>`);
  win.document.close();
}

function printShippingLabel(order, storeName, storePhone) {
  const itemsCount = (order.items || []).reduce((s, i) => s + (i.qty || 0), 0);
  const win = window.open("", "_blank");
  if (!win) { alert("المتصفح منع فتح نافذة الطباعة، من فضلك اسمح بالنوافذ المنبثقة لهذا الموقع"); return; }
  win.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>ملصق شحن #${order.id.slice(0, 6)}</title>
<style>
  @page{ size:10cm 15cm; margin:0; }
  body{font-family:Tahoma,Arial,sans-serif; color:#111; width:10cm; padding:14px; box-sizing:border-box;}
  .label-box{border:2px solid #111; border-radius:10px; padding:16px;}
  .sender{font-size:12px; color:#555; border-bottom:1px dashed #999; padding-bottom:10px; margin-bottom:14px;}
  .sender strong{display:block; font-size:14px; color:#111; margin-bottom:3px;}
  .to-label{font-size:11px; color:#777; letter-spacing:1px; margin-bottom:6px;}
  .recipient-name{font-size:22px; font-weight:800; margin-bottom:8px;}
  .recipient-phone{font-size:19px; font-weight:700; margin-bottom:10px; direction:ltr; text-align:right;}
  .recipient-address{font-size:15px; line-height:1.6; margin-bottom:16px;}
  .meta-row{display:flex; justify-content:space-between; border-top:2px solid #111; padding-top:10px; font-size:13px; font-weight:700;}
  .cod{background:#111; color:#fff; text-align:center; padding:8px; border-radius:8px; font-size:16px; font-weight:800; margin-top:12px;}
  .print-btn{margin-top:18px; padding:10px 22px; cursor:pointer; font-size:14px; border-radius:8px; border:1px solid #111; background:#111; color:#fff;}
  @media print{ .no-print{display:none;} body{padding:0;} }
</style>
</head>
<body>
  <div class="label-box">
    <div class="sender">
      <strong>${storeName || "المتجر"}</strong>
      ${storePhone ? `هاتف المرسل: ${storePhone}` : ""}
    </div>
    <div class="to-label">إلى (المستلم)</div>
    <div class="recipient-name">${order.customerName || ""}</div>
    <div class="recipient-phone">📞 ${order.phone || ""}</div>
    <div class="recipient-address">📍 ${order.address || ""}</div>
    <div class="meta-row">
      <span>رقم الطلب: #${order.id.slice(0, 6)}</span>
      <span>عدد القطع: ${itemsCount}</span>
    </div>
    <div class="cod">المبلغ المطلوب تحصيله: ${money(order.total)}</div>
  </div>
  <button class="print-btn no-print" onclick="window.print()">🖨️ طباعة الملصق</button>
</body>
</html>`);
  win.document.close();
}

let CATEGORIES = [];
let PRODUCTS = [];
let STORE_NAME = "المتجر";
let STORE_LOGO = "";
let SETTINGS_PHONE = "";
let STOCK_ALERT_PHONE = "";
let VIP_THRESHOLD = 5000;
let knownProductQuantities = new Map();
let isFirstProductsSnapshot = true;
let unsubscribers = [];
let knownOrderIds = new Set();
let knownReviewIds = new Set();
let isFirstOrdersSnapshot = true;
let isFirstReviewsSnapshot = true;

/* ========================================================
   AUTH
   ======================================================== */
async function verifyAdminAccess(uid) {
  try {
    const settingsSnap = await getDoc(doc(db, "settings", "main"));
    const ownerUid = settingsSnap.exists() ? settingsSnap.data().ownerUid : null;
    if (!ownerUid) {
      // أول تسجيل دخول لأي حساب بعد تفعيل هذا التحقق — يُعتبر تلقائيًا مالك المتجر
      await setDoc(doc(db, "settings", "main"), { ownerUid: uid }, { merge: true });
      return true;
    }
    return ownerUid === uid;
  } catch (e) {
    console.error("خطأ في التحقق من صلاحية الدخول:", e);
    return false; // فشل التحقق = رفض الدخول احتياطًا
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const allowed = await verifyAdminAccess(user.uid);
    if (!allowed) {
      await signOut(auth);
      const errBox = $("#login-error");
      errBox.textContent = "هذا الحساب غير مصرّح له بالدخول إلى لوحة الإدارة.";
      errBox.style.display = "block";
      return;
    }
    $("#login-screen").style.display = "none";
    $("#app-shell").classList.add("show");
    loadAllData();
  } else {
    $("#login-screen").style.display = "flex";
    $("#app-shell").classList.remove("show");
    unsubscribers.forEach(fn => fn());
    unsubscribers = [];
    isFirstOrdersSnapshot = true;
    isFirstReviewsSnapshot = true;
    isFirstProductsSnapshot = true;
    knownOrderIds = new Set();
    knownReviewIds = new Set();
    knownProductQuantities = new Map();
  }
});

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  const btn = $("#login-btn");
  const errBox = $("#login-error");
  errBox.style.display = "none";
  btn.disabled = true;
  btn.textContent = "جاري تسجيل الدخول...";
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    errBox.textContent = "بيانات الدخول غير صحيحة، حاول مرة أخرى.";
    errBox.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = "تسجيل الدخول";
  }
});

$("#logout-btn").addEventListener("click", () => signOut(auth));

/* ========================================================
   NAVIGATION
   ======================================================== */
$$("#sidebar-nav a").forEach(link => {
  link.addEventListener("click", () => {
    $$("#sidebar-nav a").forEach(a => a.classList.remove("active"));
    link.classList.add("active");
    $$(".section-panel").forEach(p => p.classList.remove("active"));
    $(`#panel-${link.dataset.section}`).classList.add("active");
    $("#sidebar").classList.remove("mobile-open");
  });
});
$("#mobile-toggle").addEventListener("click", () => $("#sidebar").classList.toggle("mobile-open"));

function openModal(id) { $(`#${id}`).classList.add("open"); }
function closeModal(id) { $(`#${id}`).classList.remove("open"); }
$$("[data-close]").forEach(btn => btn.addEventListener("click", () => closeModal(btn.dataset.close)));

/* ========================================================
   LOAD ALL DATA (after login)
   ======================================================== */
async function loadAllData() {
  await loadSettings();
  listenCustomers();
  listenCategories();
  listenBanners();
  listenCoupons();
  listenReviews();
  listenProducts();
  listenOrders();
  listenReturnRequests();
}

/* ========================================================
   DASHBOARD STATS
   ======================================================== */
function updateStat(id, value) { const el = $(id); if (el) el.textContent = value; }

/* ========================================================
   SETTINGS
   ======================================================== */
const WEEK_DAYS = [
  { key: "sun", label: "الأحد" }, { key: "mon", label: "الاثنين" }, { key: "tue", label: "الثلاثاء" },
  { key: "wed", label: "الأربعاء" }, { key: "thu", label: "الخميس" }, { key: "fri", label: "الجمعة" }, { key: "sat", label: "السبت" }
];

function renderWorkingHoursGrid(workingHours) {
  const wh = workingHours || {};
  const grid = $("#working-hours-grid");
  grid.innerHTML = WEEK_DAYS.map(d => {
    const dayData = wh[d.key] || { open: "10:00", close: "22:00", closed: false };
    return `
      <div class="wh-row ${dayData.closed ? "is-closed" : ""}" data-day="${d.key}">
        <label class="day-label">${d.label}</label>
        <label class="wh-closed-label"><input type="checkbox" class="wh-closed-checkbox" ${dayData.closed ? "checked" : ""}> مغلق</label>
        <input type="time" class="wh-open" value="${dayData.open || "10:00"}">
        <input type="time" class="wh-close" value="${dayData.close || "22:00"}">
      </div>`;
  }).join("");

  grid.querySelectorAll(".wh-closed-checkbox").forEach(cb => {
    cb.addEventListener("change", () => cb.closest(".wh-row").classList.toggle("is-closed", cb.checked));
  });
}

function collectWorkingHours() {
  const wh = {};
  $$("#working-hours-grid .wh-row").forEach(row => {
    wh[row.dataset.day] = {
      closed: row.querySelector(".wh-closed-checkbox").checked,
      open: row.querySelector(".wh-open").value || "10:00",
      close: row.querySelector(".wh-close").value || "22:00"
    };
  });
  return wh;
}

function renderStoreQr() {
  const url = STORE_BASE_URL;
  const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(url)}`;
  const img = $("#store-qr-img");
  const link = $("#store-qr-download");
  if (img) img.src = qrApi;
  if (link) link.href = qrApi;
}

async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, "settings", "main"));
    const s = snap.exists() ? snap.data() : {};
    STORE_NAME = s.storeName || "المتجر";
    STORE_LOGO = s.logoUrl || "";
    SETTINGS_PHONE = s.phone || "";
    STOCK_ALERT_PHONE = s.notifyPhone || s.whatsapp || "";
    $("#s-storeName").value = s.storeName || "";
    $("#s-ownerName").value = s.ownerName || "";
    $("#s-logoUrl").value = s.logoUrl || "";
    $("#s-faviconUrl").value = s.faviconUrl || "";
    $("#s-phone").value = s.phone || "";
    $("#s-email").value = s.email || "";
    $("#s-address").value = s.address || "";
    $("#s-facebook").value = s.facebook || "";
    $("#s-instagram").value = s.instagram || "";
    $("#s-whatsapp").value = s.whatsapp || "";
    $("#s-vipThreshold").value = s.vipThreshold || "";
    VIP_THRESHOLD = Number(s.vipThreshold) || 5000;
    $("#s-notifyPhone").value = s.notifyPhone || "";
    $("#s-privacyPolicy").value = s.privacyPolicy || "";
    $("#s-termsAndConditions").value = s.termsAndConditions || "";
    $("#s-aboutText").value = s.aboutText || "";
    $("#s-faqText").value = s.faqText || "";
    $("#s-gaId").value = s.gaId || "";
    renderWorkingHoursGrid(s.workingHours);
    renderStoreQr();
  } catch (e) {
    console.error("خطأ في تحميل الإعدادات:", e);
  }
}

$("#settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#settings-msg");
  try {
    const notifyPhone = $("#s-notifyPhone").value.trim();
    const whatsapp = $("#s-whatsapp").value.trim();
    await setDoc(doc(db, "settings", "main"), {
      storeName: $("#s-storeName").value.trim(),
      ownerName: $("#s-ownerName").value.trim(),
      logoUrl: $("#s-logoUrl").value.trim(),
      faviconUrl: $("#s-faviconUrl").value.trim(),
      phone: $("#s-phone").value.trim(),
      email: $("#s-email").value.trim(),
      address: $("#s-address").value.trim(),
      facebook: $("#s-facebook").value.trim(),
      instagram: $("#s-instagram").value.trim(),
      whatsapp,
      notifyPhone,
      vipThreshold: Number($("#s-vipThreshold").value) || 5000,
      privacyPolicy: $("#s-privacyPolicy").value.trim(),
      termsAndConditions: $("#s-termsAndConditions").value.trim(),
      aboutText: $("#s-aboutText").value.trim(),
      faqText: $("#s-faqText").value.trim(),
      gaId: $("#s-gaId").value.trim(),
      workingHours: collectWorkingHours(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    STOCK_ALERT_PHONE = notifyPhone || whatsapp;
    VIP_THRESHOLD = Number($("#s-vipThreshold").value) || 5000;
    renderCustomersTable(CURRENT_CUSTOMERS);
    msg.innerHTML = `<div class="form-msg success">تم حفظ الإعدادات بنجاح</div>`;
  } catch (err) {
    console.error(err);
    msg.innerHTML = `<div class="form-msg error">حدث خطأ أثناء الحفظ: ${err.code || err.message || "غير معروف"}</div>`;
  }
  setTimeout(() => msg.innerHTML = "", 3500);
});

/* ========================================================
   BANNERS
   ======================================================== */
function listenBanners() {
  const q = query(collection(db, "banners"), orderBy("order", "asc"));
  const unsub = onSnapshot(q, (snap) => {
    const banners = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderBannersTable(banners);
  }, (e) => {
    console.error("خطأ في متابعة البانرات:", e);
    renderBannersTable([]);
  });
  unsubscribers.push(unsub);
}

function renderBannersTable(banners) {
  const tbody = $("#banners-tbody");
  if (!banners.length) { tbody.innerHTML = `<tr class="empty-row"><td colspan="5">لا توجد بانرات بعد</td></tr>`; return; }
  tbody.innerHTML = banners.map(b => `
    <tr>
      <td><span class="table-thumb banner-style-swatch" data-style="${b.style || "classic"}" title="${b.style || "classic"}"></span></td>
      <td>${b.title || ""}</td>
      <td>${b.order ?? 0}</td>
      <td><span class="pill ${b.active !== false ? "pill-green" : "pill-gray"}">${b.active !== false ? "مفعّل" : "غير مفعّل"}</span></td>
      <td class="row-actions">
        <button class="btn btn-sm btn-outline" data-edit="${b.id}">تعديل</button>
        <button class="btn btn-sm btn-danger" data-del="${b.id}">حذف</button>
      </td>
    </tr>`).join("");

  tbody.querySelectorAll("[data-edit]").forEach(btn => btn.onclick = () => editBanner(btn.dataset.edit, banners));
  tbody.querySelectorAll("[data-del]").forEach(btn => btn.onclick = () => deleteItem("banners", btn.dataset.del));
}

$("#add-banner-btn").addEventListener("click", () => {
  $("#banner-form").reset();
  $("#banner-id").value = "";
  $("#banner-modal-title").textContent = "إضافة بانر";
  $("#banner-msg").innerHTML = "";
  openModal("banner-modal");
});

function editBanner(id, banners) {
  const b = banners.find(x => x.id === id);
  if (!b) return;
  $("#banner-id").value = b.id;
  $("#banner-title").value = b.title || "";
  $("#banner-description").value = b.description || "";
  $("#banner-style").value = b.style || "classic";
  $("#banner-buttonLink").value = b.buttonLink || "";
  $("#banner-expiresAt").value = b.expiresAt || "";
  $("#banner-order").value = b.order ?? 0;
  $("#banner-active").value = String(b.active !== false);
  $("#banner-modal-title").textContent = "تعديل البانر";
  $("#banner-msg").innerHTML = "";
  openModal("banner-modal");
}

$("#banner-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("#banner-id").value;
  const data = {
    title: $("#banner-title").value.trim(),
    description: $("#banner-description").value.trim(),
    style: $("#banner-style").value,
    buttonLink: $("#banner-buttonLink").value.trim(),
    expiresAt: $("#banner-expiresAt").value || null,
    order: Number($("#banner-order").value) || 0,
    active: $("#banner-active").value === "true"
  };
  try {
    if (id) await updateDoc(doc(db, "banners", id), data);
    else await addDoc(collection(db, "banners"), data);
    closeModal("banner-modal");
  } catch (err) {
    console.error("خطأ في حفظ البانر:", err);
    $("#banner-msg").innerHTML = `<div class="form-msg error">حدث خطأ: ${err.code || err.message || "غير معروف"}</div>`;
  }
});

/* ========================================================
   CATEGORIES
   ======================================================== */
function listenCategories() {
  const q = query(collection(db, "categories"), orderBy("order", "asc"));
  const unsub = onSnapshot(q, (snap) => {
    CATEGORIES = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCategoriesTable();
    fillCategorySelects();
    renderProductsTable();
    updateStat("#stat-categories", CATEGORIES.length);
  }, (e) => {
    console.error("خطأ في متابعة الأقسام:", e);
    CATEGORIES = [];
    renderCategoriesTable();
  });
  unsubscribers.push(unsub);
}

function renderCategoriesTable() {
  const tbody = $("#categories-tbody");
  if (!CATEGORIES.length) { tbody.innerHTML = `<tr class="empty-row"><td colspan="4">لا توجد أقسام بعد</td></tr>`; return; }
  tbody.innerHTML = CATEGORIES.map(c => `
    <tr>
      <td><img class="table-thumb" src="${c.imageUrl || ""}"></td>
      <td>${c.name || ""}</td>
      <td>${c.order ?? 0}</td>
      <td class="row-actions">
        <button class="btn btn-sm btn-outline" data-edit="${c.id}">تعديل</button>
        <button class="btn btn-sm btn-danger" data-del="${c.id}">حذف</button>
      </td>
    </tr>`).join("");

  tbody.querySelectorAll("[data-edit]").forEach(btn => btn.onclick = () => editCategory(btn.dataset.edit));
  tbody.querySelectorAll("[data-del]").forEach(btn => btn.onclick = () => deleteItem("categories", btn.dataset.del));
}

function fillCategorySelects() {
  const opts = `<option value="">بدون قسم</option>` + CATEGORIES.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  $("#product-category").innerHTML = opts;
  $("#product-filter-cat").innerHTML = `<option value="all">كل الأقسام</option>` + CATEGORIES.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
}

$("#add-category-btn").addEventListener("click", () => {
  $("#category-form").reset();
  $("#category-id").value = "";
  $("#category-modal-title").textContent = "إضافة قسم";
  $("#category-msg").innerHTML = "";
  openModal("category-modal");
});

function editCategory(id) {
  const c = CATEGORIES.find(x => x.id === id);
  if (!c) return;
  $("#category-id").value = c.id;
  $("#category-name").value = c.name || "";
  $("#category-imageUrl").value = c.imageUrl || "";
  $("#category-order").value = c.order ?? 0;
  $("#category-modal-title").textContent = "تعديل القسم";
  $("#category-msg").innerHTML = "";
  openModal("category-modal");
}

$("#category-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("#category-id").value;
  const data = {
    name: $("#category-name").value.trim(),
    imageUrl: $("#category-imageUrl").value.trim(),
    order: Number($("#category-order").value) || 0
  };
  try {
    if (id) await updateDoc(doc(db, "categories", id), data);
    else await addDoc(collection(db, "categories"), data);
    closeModal("category-modal");
  } catch (err) {
    console.error("خطأ في حفظ القسم:", err);
    $("#category-msg").innerHTML = `<div class="form-msg error">حدث خطأ: ${err.code || err.message || "غير معروف"}</div>`;
  }
});

/* ========================================================
   PRODUCTS
   ======================================================== */
function isProductOutOfStock(p) {
  if (p.variants && p.variants.length) return p.variants.every(v => Number(v.quantity) <= 0);
  return p.status === "unavailable" || Number(p.quantity) <= 0;
}

function goToProductEdit(id) {
  $$("#sidebar-nav a").forEach(a => a.classList.toggle("active", a.dataset.section === "products"));
  $$(".section-panel").forEach(p => p.classList.remove("active"));
  $("#panel-products").classList.add("active");
  $("#sidebar").classList.remove("mobile-open");
  editProduct(id);
}

function renderLowStockWidget() {
  const widget = $("#low-stock-widget");
  const list = $("#low-stock-list");
  const outOfStock = PRODUCTS.filter(isProductOutOfStock);
  if (!outOfStock.length) { widget.style.display = "none"; return; }
  widget.style.display = "";
  list.innerHTML = outOfStock.map(p => `
      <div class="low-stock-row">
        <span>${escapeHtml(p.name || "")}</span>
        <a href="#" data-goto-product="${p.id}">📦 اذهب للمنتج</a>
      </div>`).join("");
  list.querySelectorAll("[data-goto-product]").forEach(a => a.onclick = (e) => {
    e.preventDefault();
    goToProductEdit(a.dataset.gotoProduct);
  });
}

function listenProducts() {
  const unsub = onSnapshot(collection(db, "products"), (snap) => {
    PRODUCTS = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!isFirstProductsSnapshot) {
      PRODUCTS.forEach(p => {
        const wasOutOfStock = knownProductQuantities.get(p.id);
        const isOutOfStock = isProductOutOfStock(p);
        if (wasOutOfStock === false && isOutOfStock) {
          showLowStockToast(p);
        }
      });
    }
    knownProductQuantities = new Map(PRODUCTS.map(p => [p.id, isProductOutOfStock(p)]));
    isFirstProductsSnapshot = false;

    renderProductsTable();
    renderLowStockWidget();
    updateStat("#stat-products", PRODUCTS.length);
    renderAnalytics();
  }, (e) => {
    console.error("خطأ في متابعة المنتجات:", e);
    PRODUCTS = [];
    renderProductsTable();
  });
  unsubscribers.push(unsub);
}

function renderProductsTable() {
  const tbody = $("#products-tbody");
  const search = ($("#product-search").value || "").toLowerCase().trim();
  const catFilter = $("#product-filter-cat").value;
  const list = PRODUCTS.filter(p => {
    const matchesSearch = !search || (p.name || "").toLowerCase().includes(search);
    const matchesCat = catFilter === "all" || p.category === catFilter;
    return matchesSearch && matchesCat;
  });

  if (!list.length) { tbody.innerHTML = `<tr class="empty-row"><td colspan="8">لا توجد منتجات مطابقة</td></tr>`; return; }

  tbody.innerHTML = list.map(p => {
    const catName = CATEGORIES.find(c => c.id === p.category)?.name || "-";
    return `
    <tr>
      <td><img class="table-thumb" src="${p.mainImage || ""}"></td>
      <td>${p.name || ""}${p.variants && p.variants.length ? ` <span class="pill pill-gray">${p.variants.length} خيار</span>` : ""}</td>
      <td>${catName}</td>
      <td>${money(p.price)}</td>
      <td>${p.quantity ?? 0}</td>
      <td>${p.soldCount ?? 0}</td>
      <td><span class="pill ${p.status === "unavailable" ? "pill-red" : "pill-green"}">${p.status === "unavailable" ? "غير متوفر" : "متوفر"}</span></td>
      <td>${p.featured ? `<span class="pill pill-gold">مميز</span>` : "-"}${p.label ? ` <span class="pill pill-gray">${escapeHtml(p.label)}</span>` : ""}</td>
      <td class="row-actions">
        <button class="btn btn-sm btn-outline" data-edit="${p.id}">تعديل</button>
        <button class="btn btn-sm btn-outline" data-qr="${p.id}" title="رمز QR للمنتج">QR</button>
        <button class="btn btn-sm btn-danger" data-del="${p.id}">حذف</button>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-edit]").forEach(btn => btn.onclick = () => editProduct(btn.dataset.edit));
  tbody.querySelectorAll("[data-del]").forEach(btn => btn.onclick = () => deleteItem("products", btn.dataset.del));
  tbody.querySelectorAll("[data-qr]").forEach(btn => btn.onclick = () => showProductQr(btn.dataset.qr));
}

function getStoreBaseUrl() {
  return STORE_BASE_URL;
}

function showProductQr(productId) {
  const url = `${getStoreBaseUrl()}#/product/${productId}`;
  const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(url)}`;
  const win = window.open("", "_blank");
  if (!win) { showAdminToast("من فضلك اسمح بالنوافذ المنبثقة لعرض رمز QR"); return; }
  win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>QR للمنتج</title>
    <style>body{font-family:Tajawal,Arial,sans-serif; text-align:center; padding:40px; color:#111;}
    img{border-radius:14px; margin:20px 0;} a{display:inline-block; margin-top:10px; font-size:13px; color:#555; word-break:break-all;}</style></head>
    <body><h2>رمز QR للمنتج</h2><img src="${qrApi}" width="320" height="320"><p><a href="${url}" target="_blank">${url}</a></p></body></html>`);
  win.document.close();
}

/* ---------------- Product variants editor ---------------- */
function addVariantRow(variant) {
  const wrap = $("#variants-rows");
  const row = document.createElement("div");
  row.className = "variant-row";
  row.innerHTML = `
    <input type="text" placeholder="اللون (مثال: أحمر)" class="v-color" value="${escapeHtmlAttr(variant?.color)}">
    <input type="text" placeholder="المقاس (مثال: L)" class="v-size" value="${escapeHtmlAttr(variant?.size)}">
    <input type="number" placeholder="الكمية" class="v-qty" value="${variant?.quantity ?? ""}">
    <input type="number" step="0.01" placeholder="سعر مختلف (اختياري)" class="v-price" value="${variant?.priceOverride ?? ""}">
    <input type="text" placeholder="رابط صورة مختلفة (اختياري)" class="v-image" value="${escapeHtmlAttr(variant?.image)}">
    <button type="button" class="remove-variant-btn" title="حذف الخيار">✕</button>`;
  row.querySelector(".remove-variant-btn").onclick = () => row.remove();
  wrap.appendChild(row);
}

function escapeHtmlAttr(str) {
  return String(str ?? "").replace(/"/g, "&quot;");
}

function resetVariantRows(variants) {
  $("#variants-rows").innerHTML = "";
  (variants || []).forEach(v => addVariantRow(v));
}

function collectVariantsFromForm() {
  const rows = $$("#variants-rows .variant-row");
  const variants = [];
  rows.forEach((row, i) => {
    const color = row.querySelector(".v-color").value.trim();
    const size = row.querySelector(".v-size").value.trim();
    const qty = row.querySelector(".v-qty").value;
    const priceOverride = row.querySelector(".v-price").value;
    const image = row.querySelector(".v-image").value.trim();
    if (!color && !size && !qty && !priceOverride && !image) return; // صف فارغ، تجاهله
    variants.push({
      id: `v${i}_${Date.now()}`,
      color, size,
      quantity: Number(qty) || 0,
      priceOverride: priceOverride ? Number(priceOverride) : null,
      image: image || null
    });
  });
  return variants;
}

$("#add-variant-row-btn").addEventListener("click", () => addVariantRow());

$("#product-search").addEventListener("input", renderProductsTable);
$("#product-filter-cat").addEventListener("change", renderProductsTable);

$("#add-product-btn").addEventListener("click", () => {
  $("#product-form").reset();
  $("#product-id").value = "";
  resetVariantRows([]);
  $("#product-modal-title").textContent = "إضافة منتج";
  $("#product-msg").innerHTML = "";
  openModal("product-modal");
});

function editProduct(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  $("#product-id").value = p.id;
  $("#product-name").value = p.name || "";
  $("#product-description").value = p.description || "";
  $("#product-category").value = p.category || "";
  $("#product-status").value = p.status || "available";
  $("#product-price").value = p.price ?? "";
  $("#product-oldPrice").value = p.oldPrice ?? "";
  $("#product-flashPrice").value = p.flashPrice ?? "";
  $("#product-flashStartsAt").value = p.flashStartsAt || "";
  $("#product-flashEndsAt").value = p.flashEndsAt || "";
  $("#product-quantity").value = p.quantity ?? 0;
  $("#product-featured").value = String(!!p.featured);
  $("#product-label").value = p.label || "";
  $("#product-mainImage").value = p.mainImage || "";
  $("#product-images").value = (p.images || []).join("\n");
  resetVariantRows(p.variants || []);
  $("#product-modal-title").textContent = "تعديل المنتج";
  $("#product-msg").innerHTML = "";
  openModal("product-modal");
}

$("#product-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("#product-id").value;
  const images = $("#product-images").value.split("\n").map(s => s.trim()).filter(Boolean);
  const variants = collectVariantsFromForm();
  const data = {
    name: $("#product-name").value.trim(),
    description: $("#product-description").value.trim(),
    category: $("#product-category").value,
    status: $("#product-status").value,
    price: Number($("#product-price").value) || 0,
    oldPrice: $("#product-oldPrice").value ? Number($("#product-oldPrice").value) : null,
    flashPrice: $("#product-flashPrice").value ? Number($("#product-flashPrice").value) : null,
    flashStartsAt: $("#product-flashStartsAt").value || null,
    flashEndsAt: $("#product-flashEndsAt").value || null,
    quantity: Number($("#product-quantity").value) || 0,
    featured: $("#product-featured").value === "true",
    label: $("#product-label").value,
    mainImage: $("#product-mainImage").value.trim(),
    images,
    variants
  };
  try {
    if (id) {
      const prevProduct = PRODUCTS.find(x => x.id === id);
      const wasOut = prevProduct ? isProductOutOfStock(prevProduct) : false;
      const nowOut = (data.variants && data.variants.length)
        ? data.variants.every(v => Number(v.quantity) <= 0)
        : (data.status === "unavailable" || Number(data.quantity) <= 0);
      if (wasOut && !nowOut) data.restockedAt = serverTimestamp();
      await updateDoc(doc(db, "products", id), data);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "products"), data);
    }
    closeModal("product-modal");
  } catch (err) {
    console.error("خطأ في حفظ المنتج:", err);
    $("#product-msg").innerHTML = `<div class="form-msg error">حدث خطأ: ${err.code || err.message || "غير معروف"}</div>`;
  }
});

/* ========================================================
   COUPONS
   ======================================================== */
function listenCoupons() {
  const unsub = onSnapshot(collection(db, "coupons"), (snap) => {
    const coupons = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    renderCouponsTable(coupons);
  }, (e) => {
    console.error("خطأ في متابعة الكوبونات:", e);
    renderCouponsTable([]);
  });
  unsubscribers.push(unsub);
}

function isCouponExpired(c) {
  return c.expiryDate && new Date(c.expiryDate) < new Date(new Date().toDateString());
}

function renderCouponsTable(coupons) {
  const tbody = $("#coupons-tbody");
  if (!coupons.length) { tbody.innerHTML = `<tr class="empty-row"><td colspan="8">لا توجد كوبونات بعد</td></tr>`; return; }
  tbody.innerHTML = coupons.map(c => {
    const expired = isCouponExpired(c);
    const usageText = c.usageLimit ? `${c.usedCount || 0} / ${c.usageLimit}` : `${c.usedCount || 0} (بلا حدود)`;
    let statusPill = `<span class="pill pill-green">مفعّل</span>`;
    if (c.active === false) statusPill = `<span class="pill pill-gray">غير مفعّل</span>`;
    else if (expired) statusPill = `<span class="pill pill-red">منتهي</span>`;
    return `
    <tr>
      <td><strong>${c.code || ""}</strong></td>
      <td>${c.type === "fixed" ? "مبلغ ثابت" : "نسبة مئوية"}</td>
      <td>${c.type === "fixed" ? money(c.value) : `${c.value}%`}</td>
      <td>${c.minOrder ? money(c.minOrder) : "-"}</td>
      <td>${usageText}</td>
      <td>${c.expiryDate || "بلا تاريخ"}</td>
      <td>${statusPill}</td>
      <td class="row-actions">
        <button class="btn btn-sm btn-outline" data-edit="${c.id}">تعديل</button>
        <button class="btn btn-sm btn-danger" data-del="${c.id}">حذف</button>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-edit]").forEach(btn => btn.onclick = () => editCoupon(btn.dataset.edit, coupons));
  tbody.querySelectorAll("[data-del]").forEach(btn => btn.onclick = () => deleteItem("coupons", btn.dataset.del));
}

$("#add-coupon-btn").addEventListener("click", () => {
  $("#coupon-form").reset();
  $("#coupon-id").value = "";
  $("#coupon-modal-title").textContent = "إضافة كوبون";
  $("#coupon-msg").innerHTML = "";
  openModal("coupon-modal");
});

function editCoupon(id, coupons) {
  const c = coupons.find(x => x.id === id);
  if (!c) return;
  $("#coupon-id").value = c.id;
  $("#coupon-code").value = c.code || "";
  $("#coupon-type").value = c.type || "percentage";
  $("#coupon-value").value = c.value ?? "";
  $("#coupon-minOrder").value = c.minOrder ?? "";
  $("#coupon-usageLimit").value = c.usageLimit ?? "";
  $("#coupon-expiryDate").value = c.expiryDate || "";
  $("#coupon-active").value = String(c.active !== false);
  $("#coupon-modal-title").textContent = "تعديل الكوبون";
  $("#coupon-msg").innerHTML = "";
  openModal("coupon-modal");
}

$("#coupon-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("#coupon-id").value;
  const code = $("#coupon-code").value.trim().toUpperCase();
  const data = {
    code,
    type: $("#coupon-type").value,
    value: Number($("#coupon-value").value) || 0,
    minOrder: $("#coupon-minOrder").value ? Number($("#coupon-minOrder").value) : 0,
    usageLimit: $("#coupon-usageLimit").value ? Number($("#coupon-usageLimit").value) : 0,
    expiryDate: $("#coupon-expiryDate").value || null,
    active: $("#coupon-active").value === "true"
  };
  try {
    if (id) {
      await updateDoc(doc(db, "coupons", id), data);
    } else {
      data.usedCount = 0;
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "coupons"), data);
    }
    closeModal("coupon-modal");
  } catch (err) {
    console.error(err);
    $("#coupon-msg").innerHTML = `<div class="form-msg error">حدث خطأ: ${err.code || err.message || "غير معروف"}</div>`;
  }
});

/* ========================================================
   ORDERS
   ======================================================== */
const ORDER_STATUSES = ["جديد", "قيد التجهيز", "تم الشحن", "تم التسليم", "ملغي"];

/* ---------------- WhatsApp notifications ----------------
   لا يوجد Backend في هذا المشروع، لذلك لا يمكن إرسال رسائل واتساب
   تلقائيًا 100% بدون تدخل بشري (هذا يتطلب WhatsApp Business API
   ورسوم واشتراك). البديل العملي هنا: عند تغيير حالة الطلب، يفتح
   النظام تلقائيًا محادثة واتساب مع العميل ومعبأة برسالة جاهزة حسب
   الحالة الجديدة — كل ما على الأدمن فعله هو الضغط على "إرسال" داخل واتساب.
------------------------------------------------------------- */
function toWhatsAppNumber(phone) {
  let digits = (phone || "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "20" + digits.slice(1); // افتراضي: مصر (+20) — عدّل حسب دولة متجرك
  return digits;
}

function statusMessage(status, customerName, orderId) {
  const name = customerName || "عميلنا العزيز";
  const ref = `(طلب #${orderId.slice(0, 6)})`;
  const templates = {
    "قيد التجهيز": `مرحبًا ${name} 👋 من ${STORE_NAME}\nجاري تجهيز طلبك الآن ${ref} 📦`,
    "تم الشحن": `مرحبًا ${name} 👋 من ${STORE_NAME}\nتم شحن طلبك ${ref} وهو في الطريق إليك الآن 🚚`,
    "تم التسليم": `مرحبًا ${name} 👋 من ${STORE_NAME}\nتم تسليم طلبك ${ref} بنجاح، نتمنى أن ينال إعجابك 🎉\nيسعدنا تقييم المنتج على موقعنا!`,
    "ملغي": `مرحبًا ${name} 👋 من ${STORE_NAME}\nنأسف لإبلاغك بأنه تم إلغاء طلبك ${ref}. لأي استفسار، يسعدنا تواصلك معنا.`,
    "جديد": `مرحبًا ${name} 👋 من ${STORE_NAME}\nتم استلام طلبك ${ref} وسيتم تجهيزه قريبًا.`
  };
  return templates[status] || `مرحبًا ${name}، تحديث بخصوص طلبك ${ref}: الحالة الآن "${status}".`;
}

/* ---------------- تعديل المخزون تلقائيًا عند اعتماد/إلغاء الطلب ----------------
   sign = -1 لنقص الكمية (اعتماد الطلب)، sign = 1 لإرجاعها (لو الطلب اتلغى بعد الاعتماد) */
async function adjustVariantQuantity(productId, variantId, delta) {
  const ref = doc(db, "products", productId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    const variants = (data.variants || []).map(v =>
      v.id === variantId ? { ...v, quantity: Math.max(0, Number(v.quantity || 0) + delta) } : v
    );
    tx.update(ref, { variants });
  });
}

async function adjustStockForOrder(order, sign) {
  for (const item of (order.items || [])) {
    if (item.variantId) {
      await adjustVariantQuantity(item.productId, item.variantId, sign * item.qty);
    } else {
      await updateDoc(doc(db, "products", item.productId), { quantity: increment(sign * item.qty) });
    }
  }
}

function sendWhatsAppUpdate(order, status) {
  if (!order?.phone) return;
  const waNumber = toWhatsAppNumber(order.phone);
  const text = statusMessage(status, order.customerName, order.id);
  window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

function listenOrders() {
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
  const unsub = onSnapshot(q, (snap) => {
    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!isFirstOrdersSnapshot) {
      const newOrders = orders.filter(o => !knownOrderIds.has(o.id));
      newOrders.forEach(o => showAdminToast(`🛎️ طلب جديد من ${o.customerName || "عميل"} — ${money(o.total)}`));
      if (newOrders.length) playNotificationSound();
    }
    knownOrderIds = new Set(orders.map(o => o.id));
    isFirstOrdersSnapshot = false;

    renderOrdersTable(orders);
    updateStat("#stat-orders", orders.length);
  }, (err) => {
    console.error("خطأ في متابعة الطلبات:", err);
    renderOrdersTable([]);
  });
  unsubscribers.push(unsub);
}

function statusPillClass(status) {
  if (status === "تم التسليم") return "pill-green";
  if (status === "ملغي") return "pill-red";
  if (status === "جديد") return "pill-gold";
  return "pill-gray";
}

let CURRENT_ORDERS = [];
let CURRENT_CUSTOMERS = [];

/* ========================================================
   ANALYTICS (لوحة التحليلات)
   ======================================================== */
function renderAnalytics() {
  renderRevenueChart();
  renderTopProductsChart();
}

function renderRevenueChart() {
  const container = $("#revenue-chart");
  if (!container) return;
  const source = CURRENT_ORDERS;

  if (!source.length) {
    container.innerHTML = `<div class="chart-empty">لا توجد بيانات مبيعات بعد</div>`;
    return;
  }

  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }

  const dayTotals = days.map(d => {
    const dayStr = d.toDateString();
    const total = source
      .filter(o => o.createdAt?.toDate && o.createdAt.toDate().toDateString() === dayStr && o.status !== "ملغي")
      .reduce((s, o) => s + (Number(o.total) || 0), 0);
    return { date: d, total };
  });

  const maxTotal = Math.max(...dayTotals.map(d => d.total), 1);

  container.innerHTML = dayTotals.map(d => {
    const heightPct = d.total > 0 ? Math.max((d.total / maxTotal) * 100, 4) : 0;
    const label = d.date.toLocaleDateString("ar-EG", { weekday: "short" });
    return `
      <div class="bar-col">
        <span class="bar-value">${d.total ? money(d.total) : ""}</span>
        <div class="bar" style="height:${heightPct}%"></div>
        <span class="bar-label">${label}</span>
      </div>`;
  }).join("");
}

function renderTopProductsChart() {
  const container = $("#top-products-chart");
  if (!container) return;

  const top = [...PRODUCTS]
    .filter(p => (p.soldCount || 0) > 0)
    .sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0))
    .slice(0, 5);

  if (!top.length) {
    container.innerHTML = `<div class="chart-empty">لا توجد بيانات كافية بعد</div>`;
    return;
  }

  const maxCount = Math.max(...top.map(p => p.soldCount || 0), 1);
  container.innerHTML = top.map(p => {
    const pct = ((p.soldCount || 0) / maxCount) * 100;
    return `
      <div class="hbar-row">
        <div class="hbar-top"><span>${p.name || ""}</span><strong>${p.soldCount || 0}</strong></div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${pct}%"></div></div>
      </div>`;
  }).join("");
}

function renderOrdersTable(orders) {
  CURRENT_ORDERS = orders;
  renderAnalytics();
  const tbody = $("#orders-tbody");
  if (!orders.length) { tbody.innerHTML = `<tr class="empty-row"><td colspan="7">لا توجد طلبات بعد</td></tr>`; return; }
  tbody.innerHTML = orders.map(o => {
    const date = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString("ar-EG") : "-";
    return `
    <tr>
      <td>#${o.id.slice(0, 6)}</td>
      <td>${o.customerName || ""}</td>
      <td>${o.phone || ""}</td>
      <td>${money(o.total)}</td>
      <td>${date}</td>
      <td>
        <select class="status-select" data-id="${o.id}">
          ${ORDER_STATUSES.map(s => `<option value="${s}" ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}
        </select>
        <input type="date" class="delivery-date-input" data-id="${o.id}" value="${o.estimatedDelivery || ""}" title="تاريخ التسليم المتوقع">
      </td>
      <td class="row-actions">
        <button class="btn btn-sm btn-outline" data-view="${o.id}">التفاصيل</button>
        <button class="btn btn-sm btn-outline" data-print="${o.id}" title="طباعة الفاتورة">🖨️</button>
        <button class="btn btn-sm btn-outline" data-label="${o.id}" title="طباعة ملصق الشحن">🏷️</button>
        <button class="btn btn-sm btn-whatsapp" data-wa="${o.id}" title="مراسلة العميل عبر واتساب">💬 واتساب</button>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll(".status-select").forEach(sel => {
    sel.addEventListener("change", async () => {
      const newStatus = sel.value;
      const order = orders.find(x => x.id === sel.dataset.id);
      try {
        const updates = { status: newStatus };
        if (order && order.status === "جديد" && newStatus !== "جديد" && newStatus !== "ملغي" && !order.stockDeducted) {
          await adjustStockForOrder(order, -1);
          updates.stockDeducted = true;
        } else if (order && newStatus === "ملغي" && order.stockDeducted) {
          await adjustStockForOrder(order, 1);
          updates.stockDeducted = false;
        }
        await updateDoc(doc(db, "orders", sel.dataset.id), updates);
        if (order) sendWhatsAppUpdate(order, newStatus);
      } catch (e) {
        console.error(e);
        showAdminToast("⚠️ خطأ في تحديث المخزون: " + (e.code || e.message || "غير معروف"));
      }
    });
  });

  tbody.querySelectorAll(".delivery-date-input").forEach(inp => {
    inp.addEventListener("change", async () => {
      try { await updateDoc(doc(db, "orders", inp.dataset.id), { estimatedDelivery: inp.value }); showAdminToast("تم تحديث تاريخ التسليم المتوقع"); }
      catch (e) { console.error(e); }
    });
  });

  tbody.querySelectorAll("[data-wa]").forEach(btn => {
    btn.addEventListener("click", () => {
      const order = orders.find(x => x.id === btn.dataset.wa);
      if (order) sendWhatsAppUpdate(order, order.status);
    });
  });

  tbody.querySelectorAll("[data-print]").forEach(btn => {
    btn.addEventListener("click", () => {
      const order = orders.find(x => x.id === btn.dataset.print);
      if (order) printInvoice(order, STORE_NAME, STORE_LOGO);
    });
  });

  tbody.querySelectorAll("[data-label]").forEach(btn => {
    btn.addEventListener("click", () => {
      const order = orders.find(x => x.id === btn.dataset.label);
      if (order) printShippingLabel(order, STORE_NAME, SETTINGS_PHONE);
    });
  });

  tbody.querySelectorAll("[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      const o = orders.find(x => x.id === btn.dataset.view);
      const items = (o.items || []).map(i => `${i.name}${i.variantLabel ? " (" + i.variantLabel + ")" : ""} × ${i.qty} = ${money(i.price * i.qty)}`).join("\n");
      const couponLine = o.couponCode ? `\nالكوبون: ${o.couponCode} (خصم ${money(o.discountAmount || 0)})` : "";
      alert(`تفاصيل الطلب #${o.id.slice(0, 6)}\nالعنوان: ${o.address}\n\nالمنتجات:\n${items}${couponLine}\n\nالإجمالي: ${money(o.total)}`);
    });
  });
}

/* ========================================================
   CUSTOMERS
   ======================================================== */
function listenCustomers() {
  const unsub = onSnapshot(collection(db, "customers"), (snap) => {
    const customers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCustomersTable(customers);
    updateStat("#stat-customers", customers.length);
  }, (e) => {
    console.error("خطأ في متابعة العملاء:", e);
    renderCustomersTable([]);
  });
  unsubscribers.push(unsub);
}

function getCustomerTag(c) {
  const total = Number(c.totalPurchases) || 0;
  const orders = Number(c.ordersCount) || 0;
  if (total >= VIP_THRESHOLD) return { label: "VIP", cls: "pill-gold" };
  if (orders >= 2) return { label: "عميل متكرر", cls: "pill-green" };
  return { label: "عميل جديد", cls: "pill-gray" };
}

function renderCustomersTable(customers) {
  CURRENT_CUSTOMERS = customers;
  const tbody = $("#customers-tbody");
  if (!customers.length) { tbody.innerHTML = `<tr class="empty-row"><td colspan="6">لا يوجد عملاء بعد</td></tr>`; return; }
  tbody.innerHTML = customers.map(c => {
    const date = c.lastOrder?.toDate ? c.lastOrder.toDate().toLocaleDateString("ar-EG") : "-";
    const tag = getCustomerTag(c);
    return `
    <tr>
      <td>${c.name || ""}</td>
      <td>${c.phone || ""}</td>
      <td>${c.ordersCount ?? 0}</td>
      <td>${money(c.totalPurchases)}</td>
      <td><span class="pill ${tag.cls}">${tag.label}</span></td>
      <td>${date}</td>
    </tr>`;
  }).join("");
}

/* ========================================================
   EXCEL / CSV EXPORT
   ======================================================== */
function downloadCSV(filename, headers, rows) {
  const escapeCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.map(escapeCell).join(",")];
  rows.forEach(row => lines.push(row.map(escapeCell).join(",")));
  const csvContent = "\uFEFF" + lines.join("\r\n"); // BOM لدعم عرض العربي بشكل صحيح في Excel
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

$("#export-orders-btn").addEventListener("click", () => {
  if (!CURRENT_ORDERS.length) { alert("لا توجد طلبات لتصديرها"); return; }
  const headers = ["رقم الطلب", "اسم العميل", "الهاتف", "العنوان", "المنتجات", "الكوبون", "الخصم", "الإجمالي", "الحالة", "التاريخ"];
  const rows = CURRENT_ORDERS.map(o => {
    const date = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString("ar-EG") : "-";
    const items = (o.items || []).map(i => `${i.name}${i.variantLabel ? " (" + i.variantLabel + ")" : ""} x${i.qty}`).join(" | ");
    return [`#${o.id.slice(0, 6)}`, o.customerName || "", o.phone || "", o.address || "", items, o.couponCode || "-", o.discountAmount ? money(o.discountAmount) : "-", money(o.total), o.status || "", date];
  });
  downloadCSV(`orders-${Date.now()}.csv`, headers, rows);
});

$("#export-customers-btn").addEventListener("click", () => {
  if (!CURRENT_CUSTOMERS.length) { alert("لا يوجد عملاء لتصديرهم"); return; }
  const headers = ["الاسم", "الهاتف", "عدد الطلبات", "إجمالي المشتريات", "التصنيف", "آخر طلب"];
  const rows = CURRENT_CUSTOMERS.map(c => {
    const date = c.lastOrder?.toDate ? c.lastOrder.toDate().toLocaleDateString("ar-EG") : "-";
    return [c.name || "", c.phone || "", c.ordersCount ?? 0, money(c.totalPurchases), getCustomerTag(c).label, date];
  });
  downloadCSV(`customers-${Date.now()}.csv`, headers, rows);
});

/* ========================================================
   REVIEWS
   ======================================================== */
function listenReviews() {
  const unsub = onSnapshot(collection(db, "reviews"), (snap) => {
    const reviews = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    if (!isFirstReviewsSnapshot) {
      const newReviews = reviews.filter(r => !knownReviewIds.has(r.id));
      newReviews.forEach(r => {
        const productName = PRODUCTS.find(p => p.id === r.productId)?.name || "منتج";
        showAdminToast(`⭐ تقييم جديد (${r.rating}/5) على "${productName}"`);
      });
    }
    knownReviewIds = new Set(reviews.map(r => r.id));
    isFirstReviewsSnapshot = false;

    renderReviewsTable(reviews);
  }, (e) => {
    console.error("خطأ في متابعة التقييمات:", e);
    renderReviewsTable([]);
  });
  unsubscribers.push(unsub);
}

function renderReviewsTable(reviews) {
  const tbody = $("#reviews-tbody");
  if (!reviews.length) { tbody.innerHTML = `<tr class="empty-row"><td colspan="6">لا توجد تقييمات بعد</td></tr>`; return; }
  tbody.innerHTML = reviews.map(r => {
    const productName = PRODUCTS.find(p => p.id === r.productId)?.name || "منتج محذوف";
    const date = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString("ar-EG") : "-";
    const stars = "★".repeat(Number(r.rating) || 0) + "☆".repeat(5 - (Number(r.rating) || 0));
    return `
    <tr>
      <td>${productName}</td>
      <td>${r.customerName || ""}</td>
      <td><span class="pill pill-gold">${stars}</span></td>
      <td style="max-width:260px;">${r.comment || "-"}</td>
      <td>${date}</td>
      <td class="row-actions"><button class="btn btn-sm btn-danger" data-del="${r.id}">حذف</button></td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-del]").forEach(btn => btn.onclick = () => deleteItem("reviews", btn.dataset.del));
}

/* ========================================================
   RETURN REQUESTS (طلبات الاستبدال والاسترجاع)
   ======================================================== */
function listenReturnRequests() {
  const q = query(collection(db, "returnRequests"), orderBy("createdAt", "desc"));
  const unsub = onSnapshot(q, (snap) => {
    const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderReturnsTable(requests);
  }, (e) => {
    console.error("خطأ في متابعة طلبات الاستبدال:", e);
    renderReturnsTable([]);
  });
  unsubscribers.push(unsub);
}

function renderReturnsTable(requests) {
  const tbody = $("#returns-tbody");
  if (!requests.length) { tbody.innerHTML = `<tr class="empty-row"><td colspan="7">لا توجد طلبات استبدال حاليًا</td></tr>`; return; }
  tbody.innerHTML = requests.map(r => {
    const date = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString("ar-EG") : "-";
    return `
    <tr>
      <td>#${(r.orderId || "").slice(0, 6)}</td>
      <td>${escapeHtml(r.customerName || "")}</td>
      <td>${escapeHtml(r.phone || "")}</td>
      <td>${escapeHtml(r.reason || "")}</td>
      <td style="max-width:220px;">${escapeHtml(r.note || "-")}</td>
      <td>${date}</td>
      <td class="row-actions">
        ${r.phone ? `<a class="btn btn-sm btn-whatsapp" href="https://wa.me/${toWhatsAppNumber(r.phone)}" target="_blank" rel="noopener noreferrer">💬 تواصل</a>` : ""}
        <button class="btn btn-sm btn-danger" data-del="${r.id}">حذف</button>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-del]").forEach(btn => btn.onclick = () => deleteItem("returnRequests", btn.dataset.del));
}

/* ========================================================
   DELETE HELPER
   ======================================================== */
async function deleteItem(colName, id, reloadFn) {
  if (!confirm("هل أنت متأكد من الحذف؟ لا يمكن التراجع عن هذا الإجراء.")) return;
  try {
    await deleteDoc(doc(db, colName, id));
    if (reloadFn) reloadFn();
  } catch (e) {
    console.error("خطأ في الحذف:", e);
    alert("حدث خطأ أثناء الحذف: " + (e.code || e.message || "غير معروف"));
  }
}
