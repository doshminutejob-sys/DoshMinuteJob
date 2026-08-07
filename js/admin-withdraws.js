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

async function loadWithdraws() {
  await checkAdmin();

  const snap = await getDocs(collection(db, "withdraw_requests"));
  const list = [];
  let pending = 0, approved = 0, rejected = 0;

  snap.forEach(d => {
    const data = d.data();
    list.push({ id: d.id, ...data });
    if (data.status === "pending") pending++;
    else if (data.status === "approved") approved++;
    else if (data.status === "rejected") rejected++;
  });

  // Pending first, then newest
  list.sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (b.status === "pending" && a.status !== "pending") return 1;
    const ta = a.createdAt?.toDate?.()?.getTime() || 0;
    const tb = b.createdAt?.toDate?.()?.getTime() || 0;
    return tb - ta;
  });

  let html = "";

  list.forEach(w => {
    let badge = `<span class="badge badge-pending">Pending</span>`;
    if (w.status === "approved") badge = `<span class="badge badge-active">Approved</span>`;
    if (w.status === "rejected") badge = `<span class="badge badge-rejected">Rejected</span>`;

    const date = w.createdAt?.toDate
      ? w.createdAt.toDate().toLocaleString("bn-BD", {
          day: "numeric", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit"
        })
      : "—";

    html += `
      <div class="item-card" id="wd-${w.id}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
          <div>
            <div style="font-size:22px;font-weight:800;color:var(--green);">
              💰 ${Number(w.coin || 0).toLocaleString()}
            </div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px;">${date}</div>
          </div>
          ${badge}
        </div>

        <div style="font-size:13px;line-height:1.7;margin-bottom:14px;">
          <div>👤 ${w.firstName || "User"} ${w.username ? "(@" + w.username + ")" : ""}</div>
          <div>🆔 ${w.userId}</div>
          <div>💳 \( {w.paymentMethod || "—"} • <b> \){w.paymentNumber || "—"}</b></div>
          <div>👥 Active Refs: ${w.activeReferrals || 0}</div>
          ${w.facebookLink ? `
            <div>
              <a href="${w.facebookLink}" target="_blank" style="color:var(--green);text-decoration:none;">
                📘 Facebook Profile
              </a>
            </div>
          ` : ""}
        </div>

        ${w.status === "pending" ? `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <button class="btn-primary" style="padding:12px;font-size:13px;"
              onclick="window.approveWithdraw('${w.id}')">
              ✅ অ্যাপ্রুভ
            </button>
            <button class="btn-danger" style="padding:12px;font-size:13px;"
              onclick="window.rejectWithdraw('${w.id}')">
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

  document.getElementById("app").innerHTML = `
    <div class="admin-page">
      <div class="admin-header">
        <h1>💰 উইথড্র রিকোয়েস্ট</h1>
        <p>পেমেন্ট রিভিউ ও প্রসেস করুন</p>
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

      <div id="withdrawsList">
        ${html || `
          <div class="section-card" style="text-align:center;color:var(--muted);">
            এখনো কোনো উইথড্র রিকোয়েস্ট নেই
          </div>
        `}
      </div>

      <div style="margin-top:18px;">
        <a href="index.html" class="btn-secondary" style="display:block;text-align:center;text-decoration:none;">
          ← ড্যাশবোর্ডে ফিরে যান
        </a>
      </div>
    </div>
  `;
}

window.approveWithdraw = async function(id) {
  if (!confirm("এই উইথড্র অ্যাপ্রুভ করবেন?\n\nইউজারের ব্যালেন্স থেকে কয়েন কেটে যাবে।")) return;

  try {
    const wdRef = doc(db, "withdraw_requests", id);
    const wdSnap = await getDoc(wdRef);
    if (!wdSnap.exists()) return tg.showAlert("রিকোয়েস্ট পাওয়া যায়নি");

    const w = wdSnap.data();
    if (w.status !== "pending") return tg.showAlert("ইতিমধ্যে প্রসেস করা হয়েছে");

    const userRef = doc(db, "users", w.userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const currentCoin = Number(userSnap.data().coin || 0);
      const deduct = Number(w.coin || 0);

      if (currentCoin < deduct) {
        return tg.showAlert("ইউজারের কাছে এখন পর্যাপ্ত কয়েন নেই। রিজেক্ট করুন।");
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

    tg.showAlert("✅ উইথড্র অ্যাপ্রুভ হয়েছে");
    loadWithdraws();
  } catch (e) {
    console.error(e);
    tg.showAlert("সমস্যা: " + e.message);
  }
};

window.rejectWithdraw = async function(id) {
  if (!confirm("এই উইথড্র রিজেক্ট করবেন?\n\nকয়েন ইউজারের কাছেই থাকবে।")) return;

  try {
    const wdRef = doc(db, "withdraw_requests", id);
    const wdSnap = await getDoc(wdRef);
    if (!wdSnap.exists()) return tg.showAlert("রিকোয়েস্ট পাওয়া যায়নি");

    if (wdSnap.data().status !== "pending") {
      return tg.showAlert("ইতিমধ্যে প্রসেস করা হয়েছে");
    }

    await updateDoc(wdRef, {
      status: "rejected",
      processedAt: serverTimestamp(),
      processedBy: String(adminUser.id)
    });

    tg.showAlert("❌ উইথড্র রিজেক্ট হয়েছে (কয়েন সেফ)");
    loadWithdraws();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

loadWithdraws().catch(err => console.error(err));
