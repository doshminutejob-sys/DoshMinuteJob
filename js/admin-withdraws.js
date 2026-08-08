import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  increment,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const tg = window.Telegram?.WebApp;

if (!tg || !tg.initDataUnsafe?.user) {
  document.getElementById("app").innerHTML = `
    <div class="loader-box">
      <h1>⛔ অ্যাক্সেস ডিনাইড</h1>
      <p>Telegram থেকে খুলুন</p>
    </div>
  `;
  throw new Error("Telegram Required");
}

tg.ready();
tg.expand();
tg.setHeaderColor("#0B1220");
tg.setBackgroundColor("#0B1220");

const adminUser = tg.initDataUnsafe.user;
let allWithdraws = [];
let currentMethod = null;

const METHODS = [
  { key: "Bkash", icon: "📱", label: "Bkash" },
  { key: "Nagad", icon: "📱", label: "Nagad" },
  { key: "Bybit", icon: "🟡", label: "Bybit (USDT)" },
  { key: "Binance", icon: "🟡", label: "Binance (USDT)" },
  { key: "Bitget", icon: "🟡", label: "Bitget (USDT)" }
];

async function checkAdmin() {
  const snap = await getDoc(doc(db, "users", String(adminUser.id)));
  if (!snap.exists() || snap.data().role !== "admin") {
    document.getElementById("app").innerHTML = `
      <div class="loader-box">
        <div class="logo-circle">⛔</div>
        <h1>অ্যাক্সেস ডিনাইড</h1>
        <p>আপনি অ্যাডমিন নন</p>
      </div>
    `;
    throw new Error("Not Admin");
  }
}

async function loadData() {
  await checkAdmin();

  const snap = await getDocs(collection(db, "withdraw_requests"));
  allWithdraws = [];
  snap.forEach(d => {
    allWithdraws.push({ id: d.id, ...d.data() });
  });

  // Newest first
  allWithdraws.sort((a, b) => {
    const ta = a.createdAt?.toDate?.()?.getTime() || 0;
    const tb = b.createdAt?.toDate?.()?.getTime() || 0;
    return tb - ta;
  });

  showMethodList();
}

// ==================== METHOD LIST ====================
function showMethodList() {
  currentMethod = null;

  let pending = 0, approved = 0, rejected = 0;
  allWithdraws.forEach(w => {
    if (w.status === "pending") pending++;
    else if (w.status === "approved") approved++;
    else if (w.status === "rejected") rejected++;
  });

  let methodsHtml = "";

  METHODS.forEach(m => {
    const items = allWithdraws.filter(w => w.paymentMethod === m.key);
    const pendingCount = items.filter(w => w.status === "pending").length;

    methodsHtml += `
      <div class="item-card" style="cursor:pointer;" onclick="window.openMethod('${m.key}')">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="font-size:24px;">${m.icon}</div>
            <div>
              <div style="font-weight:700;font-size:15px;">${m.label}</div>
              <div style="font-size:12px;color:var(--muted);margin-top:2px;">
                মোট ${items.length} টি রিকোয়েস্ট
              </div>
            </div>
          </div>
          <div style="text-align:right;">
            ${pendingCount > 0
              ? `<span class="badge badge-pending">${pendingCount} Pending</span>`
              : `<span style="font-size:12px;color:var(--muted);">—</span>`
            }
          </div>
        </div>
      </div>
    `;
  });

  document.getElementById("app").innerHTML = `
    <div class="admin-page">
      <div class="admin-header">
        <h1>💰 উইথড্র রিকোয়েস্ট</h1>
        <p>মেথড সিলেক্ট করে দেখুন</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Pending</div>
          <div class="stat-value yellow">${pending}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Approved</div>
          <div class="stat-value green">${approved}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Rejected</div>
          <div class="stat-value red">${rejected}</div>
        </div>
      </div>

      <div style="font-size:14px;font-weight:700;margin:8px 0 12px;color:var(--muted);">
        পেমেন্ট মেথড
      </div>

      ${methodsHtml}

      <div style="margin-top:18px;">
        <a href="index.html" class="btn-secondary" style="display:block;text-align:center;text-decoration:none;">
          ← ড্যাশবোর্ডে ফিরে যান
        </a>
      </div>
    </div>
  `;
}

// ==================== METHOD DETAILS ====================
window.openMethod = function(method) {
  currentMethod = method;
  const items = allWithdraws.filter(w => w.paymentMethod === method);

  // Pending first
  items.sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (b.status === "pending" && a.status !== "pending") return 1;
    return 0;
  });

  const methodInfo = METHODS.find(m => m.key === method) || { icon: "💳", label: method };

  let cards = "";

  if (items.length === 0) {
    cards = `
      <div class="section-card" style="text-align:center;color:var(--muted);">
        এই মেথডে কোনো রিকোয়েস্ট নেই
      </div>
    `;
  } else {
    items.forEach(w => {
      let badge = `<span class="badge badge-pending">Pending</span>`;
      if (w.status === "approved") badge = `<span class="badge badge-active">Approved</span>`;
      if (w.status === "rejected") badge = `<span class="badge badge-rejected">Rejected</span>`;

      const date = w.createdAt?.toDate
        ? w.createdAt.toDate().toLocaleString("bn-BD", {
            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
          })
        : "—";

      const feeLine = w.fee
        ? `<div>ফি: \( {w.fee} • পাবে: <b style="color:var(--green)"> \){w.receiveAmount || (w.coin - w.fee)}</b></div>`
        : `<div>ফি: নেই</div>`;

      cards += `
        <div class="item-card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
            <div style="font-size:22px;font-weight:800;color:var(--green);">
              💰 ${Number(w.coin || 0).toLocaleString()}
            </div>
            ${badge}
          </div>

          <div style="font-size:13px;line-height:1.7;margin-bottom:12px;">
            <div>👤 <b>${w.firstName || "User"}</b> ${w.username ? "(@" + w.username + ")" : ""}</div>
            <div style="font-size:11px;color:var(--muted);">ID: ${w.userId}</div>
            ${feeLine}
            <div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span style="word-break:break-all;">💳 ${w.paymentNumber}</span>
              <button onclick="window.copyText('${String(w.paymentNumber).replace(/'/g, "\\'")}')" 
                style="padding:5px 12px;font-size:11px;border-radius:8px;border:none;background:#1e293b;color:#e2e8f0;cursor:pointer;">
                📋 কপি
              </button>
            </div>
            <div style="font-size:11px;color:var(--muted);margin-top:6px;">${date}</div>
          </div>

          ${w.status === "pending" ? `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <button class="btn-primary" style="padding:12px;font-size:13px;" onclick="window.approveWithdraw('${w.id}')">
                ✅ অ্যাপ্রুভ
              </button>
              <button class="btn-danger" style="padding:12px;font-size:13px;" onclick="window.rejectWithdraw('${w.id}')">
                ❌ রিজেক্ট
              </button>
            </div>
          ` : `
            <button class="btn-secondary" disabled style="padding:12px;">
              ${w.status.toUpperCase()}
            </button>
          `}
        </div>
      `;
    });
  }

  document.getElementById("app").innerHTML = `
    <div class="admin-page">
      <div style="margin-bottom:14px;">
        <button class="btn-secondary" style="width:auto;padding:10px 16px;font-size:13px;" onclick="window.backToMethods()">
          ← সব মেথড
        </button>
      </div>

      <div class="admin-header" style="margin-bottom:16px;">
        <h1>${methodInfo.icon} ${methodInfo.label}</h1>
        <p>${items.length} টি রিকোয়েস্ট</p>
      </div>

      ${cards}
    </div>
  `;
};

window.backToMethods = function() {
  showMethodList();
};

window.copyText = function(text) {
  navigator.clipboard.writeText(text).then(() => {
    tg.showAlert("কপি হয়েছে!");
  }).catch(() => {
    tg.showAlert(text);
  });
};

window.approveWithdraw = async function(id) {
  if (!confirm("অ্যাপ্রুভ করবেন?\nইউজারের কয়েন কেটে যাবে।")) return;

  try {
    const wdRef = doc(db, "withdraw_requests", id);
    const wdSnap = await getDoc(wdRef);
    if (!wdSnap.exists()) return tg.showAlert("পাওয়া যায়নি");

    const w = wdSnap.data();
    if (w.status !== "pending") return tg.showAlert("ইতিমধ্যে প্রসেস হয়েছে");

    const userRef = doc(db, "users", w.userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const currentCoin = Number(userSnap.data().coin || 0);
      const deduct = Number(w.coin || 0);
      if (currentCoin < deduct) {
        return tg.showAlert("ইউজারের কাছে পর্যাপ্ত কয়েন নেই");
      }
      await updateDoc(userRef, {
        coin: increment(-deduct),
        totalWithdraw: increment(deduct)
      });
    }

    await updateDoc(wdRef, {
      status: "approved",
      processedAt: serverTimestamp(),
      processedBy: String(adminUser.id)
    });

    tg.showAlert("✅ অ্যাপ্রুভ হয়েছে");
    await loadData();
    if (currentMethod) window.openMethod(currentMethod);
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

window.rejectWithdraw = async function(id) {
  if (!confirm("রিজেক্ট করবেন?\nকয়েন ইউজারের কাছে থাকবে।")) return;

  try {
    const wdRef = doc(db, "withdraw_requests", id);
    const wdSnap = await getDoc(wdRef);
    if (!wdSnap.exists() || wdSnap.data().status !== "pending") {
      return tg.showAlert("প্রসেস করা যায়নি");
    }

    await updateDoc(wdRef, {
      status: "rejected",
      processedAt: serverTimestamp(),
      processedBy: String(adminUser.id)
    });

    tg.showAlert("রিজেক্ট হয়েছে");
    await loadData();
    if (currentMethod) window.openMethod(currentMethod);
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

loadData().catch(err => {
  console.error(err);
  document.getElementById("app").innerHTML = `
    <div class="loader-box">
      <h1>সমস্যা হয়েছে</h1>
      <p class="error">${err.message}</p>
    </div>
  `;
});
