import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
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

async function loadProfile() {
  const snap = await getDoc(doc(db, "users", String(user.id)));
  if (!snap.exists()) {
    location.href = "index.html";
    return;
  }

  userData = snap.data();

  if (userData.isBanned) {
    document.getElementById("app").innerHTML = `
      <div class="loader-box">
        <div class="logo-circle">🚫</div>
        <h1>অ্যাকাউন্ট ব্যান</h1>
        <p class="error">আপনার অ্যাকাউন্ট স্থগিত</p>
      </div>
    `;
    return;
  }

  const isActive = userData.status === "Active";
  const statusText = isActive ? "Active" : "Inactive";
  const statusClass = isActive ? "status-active" : "status-inactive";

  let activationSection = "";
  if (!isActive) {
    activationSection = `
      <div class="card warning-card">
        <div class="card-title">⚠️ অ্যাকাউন্ট এক্টিভেট করুন</div>
        <p>Facebook প্রোফাইল লিংক দিন। একই লিংক অন্য অ্যাকাউন্টে ব্যবহার করা যাবে না।</p>
        <input id="fbInput" type="url" placeholder="https://facebook.com/your.profile" style="margin-top:10px;">
        <button class="btn" id="activateBtn" style="margin-top:10px;">এক্টিভেট করুন</button>
      </div>
    `;
  } else {
    activationSection = `
      <div class="card">
        <div class="card-title">📘 Facebook</div>
        <p style="word-break:break-all;font-size:13px;">
          ${userData.facebookLink || "—"}
        </p>
      </div>
    `;
  }

  document.getElementById("app").innerHTML = `
    <div class="page">
      <div class="hero">
        <div class="hero-top">
          <img src="${userData.photoUrl || 'images/default-avatar.png'}" class="avatar" onerror="this.src='images/default-avatar.png'">
          <div>
            <div class="hero-name">${userData.firstName || "User"}</div>
            <div class="hero-username">@${userData.username || "unknown"}</div>
            <span class="status-badge \( {statusClass}"> \){statusText}</span>
          </div>
        </div>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat-value">${Number(userData.coin || 0).toLocaleString()}</div>
          <div class="stat-label">কয়েন</div>
        </div>
        <div class="stat">
          <div class="stat-value">${userData.activeReferrals || 0}</div>
          <div class="stat-label">একটিভ রেফার</div>
        </div>
        <div class="stat">
          <div class="stat-value">${userData.referrals || 0}</div>
          <div class="stat-label">মোট রেফার</div>
        </div>
        <div class="stat">
          <div class="stat-value">${Number(userData.totalEarned || 0).toLocaleString()}</div>
          <div class="stat-label">মোট আয়</div>
        </div>
      </div>

      ${activationSection}

      <div class="card">
        <div class="card-title">💳 পেমেন্ট তথ্য</div>
        <select id="paymentMethod" style="margin-bottom:8px;">
          <option value="">পেমেন্ট মেথড সিলেক্ট করুন</option>
          <option value="Bkash" ${userData.paymentMethod === "Bkash" ? "selected" : ""}>Bkash</option>
          <option value="Nagad" ${userData.paymentMethod === "Nagad" ? "selected" : ""}>Nagad</option>
        </select>
        <input id="paymentNumber" type="text" placeholder="পেমেন্ট নাম্বার" value="${userData.paymentNumber || ""}">
        <button class="btn" id="savePaymentBtn" style="margin-top:10px;">সেভ করুন</button>
      </div>

      <div class="card">
        <div class="card-title">অ্যাকাউন্ট তথ্য</div>
        <p style="font-size:13px;line-height:1.7;color:var(--muted);">
          Telegram ID: ${userData.telegramId}<br>
          দেশ: ${userData.country || "অজানা"}<br>
          জয়েন: ${userData.createdAt?.toDate ? userData.createdAt.toDate().toLocaleDateString("bn-BD") : "—"}
        </p>
      </div>
    </div>
  `;

  // Activate button
  const activateBtn = document.getElementById("activateBtn");
  if (activateBtn) {
    activateBtn.onclick = activateAccount;
  }

  // Save payment
  const savePaymentBtn = document.getElementById("savePaymentBtn");
  if (savePaymentBtn) {
    savePaymentBtn.onclick = savePayment;
  }
}

async function activateAccount() {
  const fbInput = document.getElementById("fbInput");
  const fbLink = (fbInput?.value || "").trim();

  if (!fbLink) {
    return tg.showAlert("Facebook লিংক দিন");
  }

  if (!fbLink.includes("facebook.com") && !fbLink.includes("fb.com")) {
    return tg.showAlert("সঠিক Facebook প্রোফাইল লিংক দিন");
  }

  // ===== FACEBOOK DUPLICATE CHECK =====
  try {
    const fbQuery = query(
      collection(db, "users"),
      where("facebookLink", "==", fbLink)
    );
    const fbSnap = await getDocs(fbQuery);

    let alreadyUsed = false;
    fbSnap.forEach(d => {
      if (d.id !== String(user.id)) {
        alreadyUsed = true;
      }
    });

    if (alreadyUsed) {
      return tg.showAlert("এই Facebook লিংক ইতিমধ্যে অন্য অ্যাকাউন্টে ব্যবহার করা হয়েছে। অন্য লিংক ব্যবহার করুন।");
    }

    // Activate
    await updateDoc(doc(db, "users", String(user.id)), {
      facebookLink: fbLink,
      status: "Active",
      lastActiveAt: serverTimestamp()
    });

    tg.showAlert("✅ অ্যাকাউন্ট সফলভাবে এক্টিভ হয়েছে!");
    loadProfile();

  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
}

async function savePayment() {
  const method = document.getElementById("paymentMethod").value;
  const number = document.getElementById("paymentNumber").value.trim();

  if (!method || !number) {
    return tg.showAlert("পেমেন্ট মেথড ও নাম্বার দিন");
  }

  try {
    await updateDoc(doc(db, "users", String(user.id)), {
      paymentMethod: method,
      paymentNumber: number,
      lastActiveAt: serverTimestamp()
    });
    tg.showAlert("পেমেন্ট তথ্য সেভ হয়েছে");
  } catch (e) {
    tg.showAlert("সমস্যা: " + e.message);
  }
}

loadProfile().catch(err => {
  console.error(err);
  document.getElementById("app").innerHTML = `
    <div class="loader-box">
      <h2>সমস্যা হয়েছে</h2>
      <p class="error">${err.message}</p>
    </div>
  `;
});
