import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  updateDoc,
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

async function loadProfile() {
  const userRef = doc(db, "users", String(user.id));
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    location.href = "index.html";
    return;
  }

  const data = snap.data();

  // Update last active
  await updateDoc(userRef, { lastActiveAt: serverTimestamp() });

  if (data.isBanned) {
    document.getElementById("app").innerHTML = `
      <div class="loader-box">
        <div class="logo-circle">🚫</div>
        <h1>অ্যাকাউন্ট ব্যান</h1>
        <p class="error">আপনার অ্যাকাউন্ট স্থগিত করা হয়েছে</p>
      </div>
    `;
    return;
  }

  const statusClass = data.status === "Active" ? "status-active" : "status-inactive";
  const statusText = data.status === "Active" ? "Active" : "Inactive";

  const joinDate = data.createdAt?.toDate
    ? data.createdAt.toDate().toLocaleDateString("bn-BD", {
        day: "numeric",
        month: "long",
        year: "numeric"
      })
    : "—";

  // Facebook Section
  let fbSection = "";
  if (!data.facebookLink) {
    fbSection = `
      <div class="card warning-card">
        <div class="card-title">⚠️ অ্যাকাউন্ট এক্টিভেট করুন</div>
        <p>Facebook প্রোফাইল লিংক দিলেই আপনার অ্যাকাউন্ট Active হবে এবং সব ফিচার আনলক হবে।</p>
        <input type="url" id="fbInput" placeholder="https://facebook.com/your.profile">
        <button class="btn" id="saveFbBtn" style="margin-top:12px;">লিংক সাবমিট করুন</button>
      </div>
    `;
  } else {
    fbSection = `
      <div class="card">
        <div class="card-title">📘 Facebook প্রোফাইল</div>
        <p style="font-size:13px;word-break:break-all;margin-bottom:10px;">
          <a href="${data.facebookLink}" target="_blank" style="color:var(--green);text-decoration:none;">
            ${data.facebookLink}
          </a>
        </p>
        <button class="btn" id="changeFbBtn" style="background:var(--card2);color:var(--text);border:1px solid var(--border);">
          লিংক পরিবর্তন করুন
        </button>
      </div>
    `;
  }

  // Payment Section
  const paymentSection = `
    <div class="card">
      <div class="card-title">💳 পেমেন্ট তথ্য</div>
      
      <label style="font-size:12px;color:var(--muted);">পেমেন্ট মেথড</label>
      <select id="payMethod">
        <option value="">সিলেক্ট করুন</option>
        <option value="Bkash" ${data.paymentMethod === "Bkash" ? "selected" : ""}>বিকাশ</option>
        <option value="Nagad" ${data.paymentMethod === "Nagad" ? "selected" : ""}>নগদ</option>
      </select>

      <label style="font-size:12px;color:var(--muted);margin-top:12px;display:block;">মোবাইল নাম্বার</label>
      <input type="text" id="payNumber" placeholder="01XXXXXXXXX" value="${data.paymentNumber || ""}">

      <button class="btn" id="savePayBtn" style="margin-top:14px;">পেমেন্ট তথ্য সেভ করুন</button>
    </div>
  `;

  document.getElementById("app").innerHTML = `
    <div class="page">
      <div class="hero">
        <div class="hero-top">
          <img src="${data.photoUrl || 'images/default-avatar.png'}" class="avatar" onerror="this.src='images/default-avatar.png'">
          <div>
            <div class="hero-name">${data.firstName || "User"} ${data.lastName || ""}</div>
            <div class="hero-username">@${data.username || "unknown"}</div>
            <span class="status-badge \( {statusClass}"> \){statusText}</span>
          </div>
        </div>
        <div class="balance-box">
          <div class="balance-label">বর্তমান ব্যালেন্স</div>
          <div class="balance-amount">💰 ${Number(data.coin || 0).toLocaleString()}</div>
        </div>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat-value">${Number(data.totalEarned || 0).toLocaleString()}</div>
          <div class="stat-label">মোট আয়</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.activeReferrals || 0}</div>
          <div class="stat-label">একটিভ রেফার</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.referrals || 0}</div>
          <div class="stat-label">মোট রেফার</div>
        </div>
        <div class="stat">
          <div class="stat-value">${Number(data.totalWithdraw || 0).toLocaleString()}</div>
          <div class="stat-label">উইথড্র</div>
        </div>
      </div>

      ${fbSection}
      ${paymentSection}

      <div class="card">
        <div class="card-title">📋 অ্যাকাউন্ট তথ্য</div>
        <div style="font-size:13px;line-height:1.9;">
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--muted);">Telegram ID</span>
            <span>${data.telegramId}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--muted);">ইউজারনেম</span>
            <span>@${data.username || "—"}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--muted);">স্ট্যাটাস</span>
            <span>${data.status}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--muted);">যোগদান</span>
            <span>${joinDate}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // ===== Events =====

  // Save Facebook
  const saveFbBtn = document.getElementById("saveFbBtn");
  if (saveFbBtn) {
    saveFbBtn.onclick = async () => {
      const link = document.getElementById("fbInput").value.trim();

      if (!link) {
        return tg.showAlert("Facebook লিংক দিন");
      }
      if (!link.includes("facebook.com") && !link.includes("fb.com") && !link.includes("fb.me")) {
        return tg.showAlert("সঠিক Facebook লিংক দিন");
      }

      saveFbBtn.disabled = true;
      saveFbBtn.innerText = "সেভ হচ্ছে...";

      try {
        await updateDoc(userRef, {
          facebookLink: link,
          status: "Active",
          lastActiveAt: serverTimestamp()
        });
        tg.showAlert("✅ অ্যাকাউন্ট সফলভাবে Active হয়েছে!");
        loadProfile();
      } catch (e) {
        tg.showAlert("সমস্যা: " + e.message);
        saveFbBtn.disabled = false;
        saveFbBtn.innerText = "লিংক সাবমিট করুন";
      }
    };
  }

  // Change Facebook
  const changeFbBtn = document.getElementById("changeFbBtn");
  if (changeFbBtn) {
    changeFbBtn.onclick = () => {
      const card = changeFbBtn.closest(".card");
      card.innerHTML = `
        <div class="card-title">📘 Facebook লিংক পরিবর্তন</div>
        <input type="url" id="fbInput" value="${data.facebookLink}" placeholder="https://facebook.com/your.profile">
        <button class="btn" id="saveFbBtn" style="margin-top:12px;">আপডেট করুন</button>
      `;

      document.getElementById("saveFbBtn").onclick = async () => {
        const link = document.getElementById("fbInput").value.trim();
        if (!link) return tg.showAlert("লিংক দিন");

        await updateDoc(userRef, {
          facebookLink: link,
          lastActiveAt: serverTimestamp()
        });
        tg.showAlert("আপডেট হয়েছে");
        loadProfile();
      };
    };
  }

  // Save Payment
  document.getElementById("savePayBtn").onclick = async () => {
    const method = document.getElementById("payMethod").value;
    const number = document.getElementById("payNumber").value.trim();

    if (!method) return tg.showAlert("পেমেন্ট মেথড সিলেক্ট করুন");
    if (!number) return tg.showAlert("মোবাইল নাম্বার দিন");
    if (!/^01[3-9][0-9]{8}$/.test(number)) {
      return tg.showAlert("সঠিক ১১ ডিজিটের বাংলাদেশি নাম্বার দিন");
    }

    const btn = document.getElementById("savePayBtn");
    btn.disabled = true;
    btn.innerText = "সেভ হচ্ছে...";

    try {
      await updateDoc(userRef, {
        paymentMethod: method,
        paymentNumber: number,
        lastActiveAt: serverTimestamp()
      });
      tg.showAlert("✅ পেমেন্ট তথ্য সেভ হয়েছে");
      loadProfile();
    } catch (e) {
      tg.showAlert("সমস্যা: " + e.message);
      btn.disabled = false;
      btn.innerText = "পেমেন্ট তথ্য সেভ করুন";
    }
  };
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
