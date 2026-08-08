import { db } from "./firebase.js";
import {
  doc,
  getDoc,
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
let userData = null;
let settings = {};

async function loadWithdraw() {
  const userSnap = await getDoc(doc(db, "users", String(user.id)));
  if (!userSnap.exists()) {
    location.href = "index.html";
    return;
  }
  userData = userSnap.data();

  if (userData.isBanned) {
    document.getElementById("app").innerHTML = `
      <div class="loader-box">
        <div class="logo-circle">🚫</div>
        <h1>অ্যাকাউন্ট ব্যান</h1>
      </div>
    `;
    return;
  }

  const settingsSnap = await getDoc(doc(db, "system_settings", "main"));
  settings = settingsSnap.exists() ? settingsSnap.data() : {
    withdrawEnabled: false,
    minWithdraw: 1000,
    requiredActiveReferrals: 15
  };

  // History
  const q = query(
    collection(db, "withdraw_requests"),
    where("userId", "==", String(user.id))
  );
  const histSnap = await getDocs(q);
  let historyHtml = "";
  histSnap.forEach(d => {
    const w = d.data();
    let badge = "⏳ Pending";
    if (w.status === "approved") badge = "✅ Approved";
    if (w.status === "rejected") badge = "❌ Rejected";

    const feeText = w.fee ? ` (ফি: ${w.fee})` : "";
    historyHtml += `
      <div class="card" style="margin-bottom:10px;padding:12px;">
        <div style="font-weight:700;">💰 \( {w.coin} কয়েন \){feeText}</div>
        <div style="font-size:13px;color:var(--muted);margin-top:4px;">
          ${w.paymentMethod} • ${w.paymentNumber}<br>
          ${badge}
        </div>
      </div>
    `;
  });

  const canWithdraw = settings.withdrawEnabled &&
    userData.status === "Active" &&
    (userData.coin || 0) >= (settings.minWithdraw || 1000) &&
    (userData.activeReferrals || 0) >= (settings.requiredActiveReferrals || 15);

  document.getElementById("app").innerHTML = `
    <div class="page">
      <div class="hero" style="padding:16px;">
        <div style="font-size:20px;font-weight:800;margin-bottom:4px;">💰 উইথড্র</div>
        <div style="font-size:13px;color:var(--muted);">কয়েন উইথড্র করুন</div>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat-value">${Number(userData.coin || 0).toLocaleString()}</div>
          <div class="stat-label">ব্যালেন্স</div>
        </div>
        <div class="stat">
          <div class="stat-value">${userData.activeReferrals || 0}</div>
          <div class="stat-label">একটিভ রেফার</div>
        </div>
        <div class="stat">
          <div class="stat-value">${settings.minWithdraw || 1000}</div>
          <div class="stat-label">মিনিমাম</div>
        </div>
      </div>

      ${!settings.withdrawEnabled ? `
        <div class="card warning-card">
          <div class="card-title">⚠️ উইথড্র বন্ধ আছে</div>
          <p>এখন উইথড্র সিস্টেম বন্ধ রাখা হয়েছে।</p>
        </div>
      ` : ""}

      ${userData.status !== "Active" ? `
        <div class="card warning-card">
          <div class="card-title">⚠️ অ্যাকাউন্ট এক্টিভ নয়</div>
          <p>উইথড্র করতে আগে অ্যাকাউন্ট এক্টিভ করুন।</p>
          <button class="btn" onclick="location.href='profile.html'">প্রোফাইলে যান</button>
        </div>
      ` : ""}

      <div class="card">
        <div class="card-title">উইথড্র রিকোয়েস্ট</div>

        <label style="font-size:12px;color:var(--muted);">পেমেন্ট মেথড</label>
        <select id="payMethod" style="margin-bottom:10px;">
          <option value="">সিলেক্ট করুন</option>
          <option value="Bkash">Bkash (ফি নেই)</option>
          <option value="Nagad">Nagad (ফি নেই)</option>
          <option value="Bybit">Bybit (USDT • ১% ফি)</option>
          <option value="Binance">Binance (USDT • ১% ফি)</option>
          <option value="Bitget">Bitget (USDT • ১% ফি)</option>
        </select>

        <label style="font-size:12px;color:var(--muted);">পেমেন্ট নাম্বার / UID / অ্যাড্রেস</label>
        <input id="payNumber" placeholder="নাম্বার বা এক্সচেঞ্জ UID/অ্যাড্রেস" style="margin-bottom:10px;">

        <div id="feeInfo" style="font-size:12px;color:var(--muted);margin-bottom:10px;display:none;"></div>

        <button class="btn" id="submitBtn" ${canWithdraw ? "" : "disabled style='opacity:0.5'"}>
          উইথড্র রিকোয়েস্ট পাঠাও
        </button>

        <p style="font-size:11px;color:var(--muted);margin-top:10px;line-height:1.5;">
          • মিনিমাম: ${settings.minWithdraw || 1000} কয়েন<br>
          • প্রয়োজনীয় Active Referral: ${settings.requiredActiveReferrals || 15}<br>
          • Bkash/Nagad → ফি নেই<br>
          • Bybit/Binance/Bitget → শুধু USDT, ১% ফি
        </p>
      </div>

      <div style="font-size:15px;font-weight:700;margin:16px 0 10px;">ইতিহাস</div>
      ${historyHtml || `<div class="card" style="text-align:center;color:var(--muted);">কোনো রিকোয়েস্ট নেই</div>`}
    </div>
  `;

  // Fee info on method change
  document.getElementById("payMethod").onchange = function() {
    const method = this.value;
    const feeBox = document.getElementById("feeInfo");
    const coin = userData.coin || 0;

    if (["Bybit", "Binance", "Bitget"].includes(method)) {
      const fee = Math.ceil(coin * 0.01);
      const receive = coin - fee;
      feeBox.style.display = "block";
      feeBox.innerHTML = `১% ফি: <b>\( {fee}</b> কয়েন • আপনি পাবেন: <b> \){receive}</b> কয়েন (USDT)`;
    } else if (method) {
      feeBox.style.display = "block";
      feeBox.innerHTML = `ফি নেই • সম্পূর্ণ <b>${coin}</b> কয়েন পাবেন`;
    } else {
      feeBox.style.display = "none";
    }
  };

  document.getElementById("submitBtn").onclick = submitWithdraw;
}

async function submitWithdraw() {
  if (!settings.withdrawEnabled) return tg.showAlert("উইথড্র এখন বন্ধ আছে");
  if (userData.status !== "Active") return tg.showAlert("আগে অ্যাকাউন্ট এক্টিভ করুন");

  const minWithdraw = settings.minWithdraw || 1000;
  const requiredRefs = settings.requiredActiveReferrals || 15;

  if ((userData.coin || 0) < minWithdraw) {
    return tg.showAlert("মিনিমাম " + minWithdraw + " কয়েন লাগবে");
  }
  if ((userData.activeReferrals || 0) < requiredRefs) {
    return tg.showAlert("কমপক্ষে " + requiredRefs + "টি Active Referral লাগবে");
  }

  const method = document.getElementById("payMethod").value;
  const number = document.getElementById("payNumber").value.trim();

  if (!method || !number) {
    return tg.showAlert("পেমেন্ট মেথড ও নাম্বার/অ্যাড্রেস দিন");
  }

  // Already pending?
  const pendingQ = query(
    collection(db, "withdraw_requests"),
    where("userId", "==", String(user.id)),
    where("status", "==", "pending")
  );
  const pendingSnap = await getDocs(pendingQ);
  if (!pendingSnap.empty) {
    return tg.showAlert("আপনার ইতিমধ্যে একটি Pending রিকোয়েস্ট আছে");
  }

  const coin = userData.coin || 0;
  const isCrypto = ["Bybit", "Binance", "Bitget"].includes(method);
  const fee = isCrypto ? Math.ceil(coin * 0.01) : 0;
  const receiveAmount = coin - fee;

  try {
    await addDoc(collection(db, "withdraw_requests"), {
      userId: String(user.id),
      username: user.username || "",
      firstName: user.first_name || "",
      coin: coin,
      fee: fee,
      receiveAmount: receiveAmount,
      paymentMethod: method,
      paymentNumber: number,
      facebookLink: userData.facebookLink || "",
      activeReferrals: userData.activeReferrals || 0,
      status: "pending",
      createdAt: serverTimestamp()
    });

    tg.showAlert("উইথড্র রিকোয়েস্ট সাবমিট হয়েছে!");
    loadWithdraw();
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
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
