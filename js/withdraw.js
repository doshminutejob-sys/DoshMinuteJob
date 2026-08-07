import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
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

async function loadWithdraw() {
  const userRef = doc(db, "users", String(user.id));
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    location.href = "index.html";
    return;
  }

  const data = userSnap.data();

  if (data.isBanned) {
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

  // Settings
  const settingsSnap = await getDoc(doc(db, "system_settings", "main"));
  const settings = settingsSnap.exists() ? settingsSnap.data() : {
    withdrawEnabled: false,
    minWithdraw: 1000,
    requiredActiveReferrals: 15
  };

  const minWithdraw = settings.minWithdraw || 1000;
  const requiredRefs = settings.requiredActiveReferrals || 15;
  const withdrawEnabled = settings.withdrawEnabled === true;

  // Check pending withdraw
  const pendingQ = query(
    collection(db, "withdraw_requests"),
    where("userId", "==", String(user.id)),
    where("status", "==", "pending")
  );
  const pendingSnap = await getDocs(pendingQ);
  const hasPending = !pendingSnap.empty;

  // History
  const histQ = query(
    collection(db, "withdraw_requests"),
    where("userId", "==", String(user.id))
  );
  const histSnap = await getDocs(histQ);

  let historyHtml = "";
  histSnap.forEach(item => {
    const w = item.data();
    let badge = `<span class="status-badge status-inactive">Pending</span>`;
    if (w.status === "approved") badge = `<span class="status-badge status-active">Approved</span>`;
    if (w.status === "rejected") badge = `<span class="status-badge" style="background:rgba(255,77,109,0.15);color:var(--red);">Rejected</span>`;

    const date = w.createdAt?.toDate
      ? w.createdAt.toDate().toLocaleDateString("bn-BD")
      : "—";

    historyHtml += `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-size:18px;font-weight:800;color:var(--green);">💰 ${Number(w.coin).toLocaleString()}</div>
          ${badge}
        </div>
        <div style="font-size:12px;color:var(--muted);">
          ${w.paymentMethod || "—"} • ${w.paymentNumber || "—"}<br>
          ${date}
        </div>
      </div>
    `;
  });

  // Requirements check
  const canWithdraw =
    withdrawEnabled &&
    data.status === "Active" &&
    (data.coin || 0) >= minWithdraw &&
    (data.activeReferrals || 0) >= requiredRefs &&
    !hasPending &&
    data.paymentMethod &&
    data.paymentNumber;

  const reqHtml = `
    <div style="font-size:13px;line-height:1.9;">
      <div style="display:flex;justify-content:space-between;">
        <span>উইথড্র সিস্টেম</span>
        <span style="color:${withdrawEnabled ? 'var(--green)' : 'var(--red)'}">
          ${withdrawEnabled ? '✅ চালু' : '❌ বন্ধ'}
        </span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span>অ্যাকাউন্ট স্ট্যাটাস</span>
        <span style="color:${data.status === 'Active' ? 'var(--green)' : 'var(--yellow)'}">
          ${data.status === 'Active' ? '✅ Active' : '⚠️ Inactive'}
        </span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span>মিনিমাম কয়েন (${minWithdraw})</span>
        <span style="color:${(data.coin || 0) >= minWithdraw ? 'var(--green)' : 'var(--red)'}">
          ${(data.coin || 0) >= minWithdraw ? '✅' : '❌'} ${Number(data.coin || 0).toLocaleString()}
        </span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span>একটিভ রেফার (${requiredRefs})</span>
        <span style="color:${(data.activeReferrals || 0) >= requiredRefs ? 'var(--green)' : 'var(--red)'}">
          ${(data.activeReferrals || 0) >= requiredRefs ? '✅' : '❌'} ${data.activeReferrals || 0}
        </span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span>পেন্ডিং রিকোয়েস্ট নেই</span>
        <span style="color:${!hasPending ? 'var(--green)' : 'var(--red)'}">
          ${!hasPending ? '✅' : '❌ আছে'}
        </span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span>পেমেন্ট তথ্য</span>
        <span style="color:${data.paymentMethod && data.paymentNumber ? 'var(--green)' : 'var(--red)'}">
          ${data.paymentMethod && data.paymentNumber ? '✅ সেভ আছে' : '❌ নেই'}
        </span>
      </div>
    </div>
  `;

  document.getElementById("app").innerHTML = `
    <div class="page">
      <div class="hero">
        <div class="balance-box" style="margin:0;">
          <div class="balance-label">উপলব্ধ ব্যালেন্স</div>
          <div class="balance-amount">💰 ${Number(data.coin || 0).toLocaleString()}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">📋 উইথড্র শর্তসমূহ</div>
        ${reqHtml}
      </div>

      ${canWithdraw ? `
        <div class="card">
          <div class="card-title">💸 উইথড্র রিকোয়েস্ট</div>
          <p style="font-size:13px;color:var(--muted);margin-bottom:8px;">
            পেমেন্ট: <b>${data.paymentMethod}</b> • ${data.paymentNumber}
          </p>
          <p style="font-size:13px;color:var(--muted);margin-bottom:14px;">
            আপনি রিকোয়েস্ট করবেন: <b style="color:var(--green)">${Number(data.coin).toLocaleString()}</b> কয়েন
          </p>
          <button class="btn" id="withdrawBtn">সম্পূর্ণ উইথড্র রিকোয়েস্ট করুন</button>
        </div>
      ` : `
        <div class="card warning-card">
          <div class="card-title">⚠️ এখন উইথড্র করা যাবে না</div>
          <p>উপরের সব শর্ত পূরণ করতে হবে। ${!data.paymentMethod ? 'প্রথমে প্রোফাইল থেকে পেমেন্ট তথ্য সেভ করুন।' : ''}</p>
          ${!data.paymentMethod || !data.paymentNumber ? `
            <button class="btn" onclick="location.href='profile.html'">প্রোফাইলে যান</button>
          ` : ""}
        </div>
      `}

      <div style="font-size:15px;font-weight:700;margin:18px 0 10px;">📜 উইথড্র হিস্টোরি</div>
      <div>
        ${historyHtml || `
          <div class="card" style="text-align:center;color:var(--muted);font-size:13px;">
            এখনো কোনো উইথড্র রিকোয়েস্ট নেই
          </div>
        `}
      </div>
    </div>
  `;

  const btn = document.getElementById("withdrawBtn");
  if (btn) {
    btn.onclick = async () => {
      if (!canWithdraw) return;

      btn.disabled = true;
      btn.innerText = "সাবমিট হচ্ছে...";

      try {
        // Double check pending
        const check = await getDocs(pendingQ);
        if (!check.empty) {
          tg.showAlert("আপনার ইতিমধ্যে একটি পেন্ডিং রিকোয়েস্ট আছে");
          loadWithdraw();
          return;
        }

        await addDoc(collection(db, "withdraw_requests"), {
          userId: String(user.id),
          username: data.username || "",
          firstName: data.firstName || "",
          coin: data.coin || 0,
          paymentMethod: data.paymentMethod,
          paymentNumber: data.paymentNumber,
          facebookLink: data.facebookLink || "",
          activeReferrals: data.activeReferrals || 0,
          status: "pending",
          createdAt: serverTimestamp()
        });

        tg.showAlert("✅ উইথড্র রিকোয়েস্ট সফলভাবে সাবমিট হয়েছে!");
        loadWithdraw();
      } catch (e) {
        console.error(e);
        tg.showAlert("সমস্যা: " + e.message);
        btn.disabled = false;
        btn.innerText = "সম্পূর্ণ উইথড্র রিকোয়েস্ট করুন";
      }
    };
  }
}

loadWithdraw().catch(err => {
  console.error(err);
  document.getElementById("app").innerHTML = `
    <div class="loader-box">
      <h2>সমস্যা হয়েছে</h2>
      <p class="error">${err.message}</p>
    </div>
  `;
});
