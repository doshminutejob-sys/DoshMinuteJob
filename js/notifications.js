import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const tg = window.Telegram?.WebApp;

if (!tg || !tg.initDataUnsafe?.user) {
  location.href = "index.html";
  throw new Error("Telegram Required");
}

tg.ready();
tg.expand();
tg.setHeaderColor("#0B1220");
tg.setBackgroundColor("#0B1220");

const user = tg.initDataUnsafe.user;

async function loadNotifications() {
  // Update last active
  try {
    const userRef = doc(db, "users", String(user.id));
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      if (snap.data().isBanned) {
        document.getElementById("app").innerHTML = `
          <div class="loader-box">
            <div class="logo-circle">🚫</div>
            <h1>অ্যাকাউন্ট ব্যান</h1>
            <p class="error">আপনার অ্যাকাউন্ট স্থগিত</p>
          </div>
        `;
        return;
      }
      await updateDoc(userRef, { lastActiveAt: serverTimestamp() });
    }
  } catch (e) {}

  try {
    const q = query(
      collection(db, "notifications"),
      orderBy("createdAt", "desc")
    );
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
        <div class="card" style="border-left:3px solid var(--green);">
          <div class="card-title" style="margin-bottom:6px;">📢 ${n.title || "নোটিশ"}</div>
          <p style="font-size:14px;line-height:1.55;margin-bottom:10px;">
            ${n.message || ""}
          </p>
          <div style="font-size:11px;color:var(--muted);">${date}</div>
        </div>
      `;
    });

    document.getElementById("app").innerHTML = `
      <div class="page">
        <div class="hero" style="padding:16px;">
          <div style="font-size:20px;font-weight:800;margin-bottom:4px;">🔔 নোটিফিকেশন</div>
          <div style="font-size:13px;color:var(--muted);">সর্বশেষ ঘোষণা ও আপডেট</div>
        </div>

        <div>
          ${listHtml || `
            <div class="card" style="text-align:center;padding:40px 20px;color:var(--muted);">
              <div style="font-size:36px;margin-bottom:10px;">🔕</div>
              এখনো কোনো নোটিফিকেশন নেই
            </div>
          `}
        </div>
      </div>
    `;
  } catch (err) {
    console.error(err);
    document.getElementById("app").innerHTML = `
      <div class="page">
        <div class="hero" style="padding:16px;">
          <div style="font-size:20px;font-weight:800;">🔔 নোটিফিকেশন</div>
        </div>
        <div class="card" style="text-align:center;color:var(--red);">
          নোটিফিকেশন লোড করা যায়নি
        </div>
      </div>
    `;
  }
}

loadNotifications();
