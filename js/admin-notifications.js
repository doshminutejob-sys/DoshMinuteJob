import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
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

async function loadPage() {
  await checkAdmin();
  await render();
}

async function render() {
  const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  let listHtml = "";

  snap.forEach(item => {
    const n = item.data();
    const date = n.createdAt?.toDate
      ? n.createdAt.toDate().toLocaleString("bn-BD", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })
      : "—";

    listHtml += `
      <div class="item-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <div style="font-weight:700;font-size:15px;">📢 ${n.title || "নোটিশ"}</div>
        </div>
        <p style="font-size:14px;line-height:1.5;margin-bottom:10px;color:var(--text);">
          ${n.message || ""}
        </p>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:11px;color:var(--muted);">${date}</span>
          <button class="btn-danger" style="width:auto;padding:7px 12px;font-size:11px;"
            onclick="window.deleteNotice('${item.id}')">
            🗑 ডিলিট
          </button>
        </div>
      </div>
    `;
  });

  document.getElementById("app").innerHTML = `
    <div class="admin-page">
      <div class="admin-header">
        <h1>📢 নোটিফিকেশন</h1>
        <p>সব ইউজারকে ঘোষণা পাঠান</p>
      </div>

      <div class="section-card">
        <h2>➕ নতুন নোটিশ পাবলিশ করুন</h2>
        <input id="noticeTitle" placeholder="টাইটেল" style="margin-bottom:8px;">
        <textarea id="noticeMessage" placeholder="মেসেজ লিখুন..." rows="4" style="resize:vertical;width:100%;padding:12px 13px;background:var(--card2);border:1px solid #2A3A5C;border-radius:12px;color:var(--text);font-size:14px;outline:none;"></textarea>
        <button class="btn-primary" id="publishBtn" style="margin-top:12px;">
          🚀 নোটিশ পাবলিশ করুন
        </button>
      </div>

      <div style="font-size:15px;font-weight:700;margin:18px 0 12px;">
        📜 সব নোটিশ
      </div>

      <div id="noticeList">
        ${listHtml || `
          <div class="section-card" style="text-align:center;color:var(--muted);">
            এখনো কোনো নোটিশ নেই
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

  document.getElementById("publishBtn").onclick = publishNotice;
}

async function publishNotice() {
  const title = document.getElementById("noticeTitle").value.trim();
  const message = document.getElementById("noticeMessage").value.trim();

  if (!title || !message) {
    return tg.showAlert("টাইটেল এবং মেসেজ দুটোই আবশ্যক");
  }

  const btn = document.getElementById("publishBtn");
  btn.disabled = true;
  btn.innerText = "পাবলিশ হচ্ছে...";

  try {
    await addDoc(collection(db, "notifications"), {
      title,
      message,
      createdAt: serverTimestamp()
    });

    tg.showAlert("✅ নোটিশ সফলভাবে পাবলিশ হয়েছে!");
    await render();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
    btn.disabled = false;
    btn.innerText = "🚀 নোটিশ পাবলিশ করুন";
  }
}

window.deleteNotice = async function(id) {
  if (!confirm("এই নোটিশ পার্মানেন্টলি ডিলিট করবেন?")) return;

  try {
    await deleteDoc(doc(db, "notifications", id));
    tg.showAlert("নোটিশ ডিলিট হয়েছে");
    await render();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
};

loadPage().catch(err => console.error(err));
