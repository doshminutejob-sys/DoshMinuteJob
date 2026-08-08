import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  addDoc,
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

  document.getElementById("app").innerHTML = `
    <div class="admin-page">
      <div class="admin-header">
        <h1>➕ টাস্ক তৈরি করুন</h1>
        <p>ক্যাটাগরি অনুযায়ী নতুন টাস্ক যোগ করুন</p>
      </div>

      <!-- CATEGORY A -->
      <div class="section-card">
        <h2>⭐ Category A — Permanent Tasks</h2>
        <p style="font-size:12px;color:var(--muted);margin-bottom:12px;">ইউজার জীবনে মাত্র একবার করতে পারবে</p>

        <div class="form-grid">
          <input id="a_name" placeholder="টাস্কের নাম *">
          <input id="a_link" placeholder="টাস্ক লিংক *">
          <input id="a_coin" type="number" placeholder="কয়েন রিওয়ার্ড *">
          <input id="a_code" placeholder="ভেরিফিকেশন কোড (ঐচ্ছিক)">
          <input id="a_timer" type="number" placeholder="টাইমার (সেকেন্ড)" value="15">
          <input id="a_limit" type="number" placeholder="লিমিট (০ = আনলিমিটেড)" value="0">
        </div>
        <button class="btn-primary" id="createA">Permanent টাস্ক তৈরি করুন</button>
      </div>

      <!-- CATEGORY B -->
      <div class="section-card">
        <h2>🔄 Category B — Independent Cooldown</h2>
        <p style="font-size:12px;color:var(--muted);margin-bottom:12px;">প্রতিটি টাস্কের নিজস্ব কুলডাউন</p>

        <div class="form-grid">
          <input id="b_name" placeholder="টাস্কের নাম *">
          <input id="b_link" placeholder="টাস্ক লিংক *">
          <input id="b_coin" type="number" placeholder="কয়েন রিওয়ার্ড *">
          <input id="b_code" placeholder="ভেরিফিকেশন কোড (ঐচ্ছিক)">
          <input id="b_timer" type="number" placeholder="টাইমার (সেকেন্ড)" value="15">
          <input id="b_cooldown" type="number" placeholder="কুলডাউন ঘণ্টা *" value="3">
          <input id="b_limit" type="number" placeholder="লিমিট (০ = আনলিমিটেড)" value="0">
        </div>
        <button class="btn-primary" id="createB">Cooldown টাস্ক তৈরি করুন</button>
      </div>

      <!-- CATEGORY C -->
      <div class="section-card">
        <h2>📜 Category C — Sequential List</h2>
        <p style="font-size:12px;color:var(--muted);margin-bottom:12px;">
          প্রথমে লিস্ট তৈরি করুন। পরে Lists পেজ থেকে টাস্ক যোগ করুন।
        </p>

        <div class="form-grid">
          <input id="c_listName" placeholder="লিস্টের নাম *">
          <input id="c_cooldown" type="number" placeholder="লিস্ট কুলডাউন ঘণ্টা *" value="3">
        </div>
        <button class="btn-primary" id="createC">Sequential লিস্ট তৈরি করুন</button>
      </div>

      <!-- CATEGORY D -->
      <div class="section-card">
        <h2>⏳ Category D — Temporary Tasks</h2>
        <p style="font-size:12px;color:var(--muted);margin-bottom:12px;">নির্দিষ্ট দিন পর এক্সপায়ার + কুলডাউন</p>

        <div class="form-grid">
          <input id="d_name" placeholder="টাস্কের নাম *">
          <input id="d_link" placeholder="টাস্ক লিংক *">
          <input id="d_coin" type="number" placeholder="কয়েন রিওয়ার্ড *">
          <input id="d_code" placeholder="ভেরিফিকেশন কোড (ঐচ্ছিক)">
          <input id="d_timer" type="number" placeholder="টাইমার (সেকেন্ড)" value="15">
          <input id="d_cooldown" type="number" placeholder="কুলডাউন ঘণ্টা" value="3">
          <input id="d_days" type="number" placeholder="কত দিন অ্যাক্টিভ থাকবে *" value="7">
          <input id="d_limit" type="number" placeholder="লিমিট (০ = আনলিমিটেড)" value="0">
        </div>
        <button class="btn-primary" id="createD">Temporary টাস্ক তৈরি করুন</button>
      </div>

      <div style="margin-top:18px;">
        <a href="index.html" class="btn-secondary" style="display:block;text-align:center;text-decoration:none;">
          ← ড্যাশবোর্ডে ফিরে যান
        </a>
      </div>
    </div>
  `;

  // ===== Create Handlers =====

  document.getElementById("createA").onclick = async () => {
    const name = document.getElementById("a_name").value.trim();
    const link = document.getElementById("a_link").value.trim();
    const coin = Number(document.getElementById("a_coin").value);
    const code = document.getElementById("a_code").value.trim();
    const timer = Number(document.getElementById("a_timer").value) || 15;
    const limit = Number(document.getElementById("a_limit").value) || 0;

    if (!name || !link || !coin) return tg.showAlert("নাম, লিংক ও কয়েন আবশ্যক");

    const btn = document.getElementById("createA");
    btn.disabled = true;
    btn.innerText = "তৈরি হচ্ছে...";

    try {
      await addDoc(collection(db, "tasks_permanent"), {
        name, link, coin,
        code: code || "",
        timer, limit,
        category: "permanent",
        status: "published",
        completedCount: 0,
        createdAt: serverTimestamp()
      });
      tg.showAlert("✅ Permanent টাস্ক তৈরি হয়েছে!");
      location.href = "tasks.html";
    } catch (e) {
      tg.showAlert("সমস্যা: " + e.message);
      btn.disabled = false;
      btn.innerText = "Permanent টাস্ক তৈরি করুন";
    }
  };

  document.getElementById("createB").onclick = async () => {
    const name = document.getElementById("b_name").value.trim();
    const link = document.getElementById("b_link").value.trim();
    const coin = Number(document.getElementById("b_coin").value);
    const code = document.getElementById("b_code").value.trim();
    const timer = Number(document.getElementById("b_timer").value) || 15;
    const cooldownHours = Number(document.getElementById("b_cooldown").value) || 3;
    const limit = Number(document.getElementById("b_limit").value) || 0;

    if (!name || !link || !coin) return tg.showAlert("নাম, লিংক ও কয়েন আবশ্যক");

    const btn = document.getElementById("createB");
    btn.disabled = true;
    btn.innerText = "তৈরি হচ্ছে...";

    try {
      await addDoc(collection(db, "tasks_cooldown"), {
        name, link, coin,
        code: code || "",
        timer, cooldownHours, limit,
        category: "cooldown",
        status: "published",
        completedCount: 0,
        createdAt: serverTimestamp()
      });
      tg.showAlert("✅ Cooldown টাস্ক তৈরি হয়েছে!");
      location.href = "tasks.html";
    } catch (e) {
      tg.showAlert("সমস্যা: " + e.message);
      btn.disabled = false;
      btn.innerText = "Cooldown টাস্ক তৈরি করুন";
    }
  };

  document.getElementById("createC").onclick = async () => {
    const listName = document.getElementById("c_listName").value.trim();
    const cooldownHours = Number(document.getElementById("c_cooldown").value) || 3;

    if (!listName) return tg.showAlert("লিস্টের নাম দিন");

    const btn = document.getElementById("createC");
    btn.disabled = true;
    btn.innerText = "তৈরি হচ্ছে...";

    try {
      await addDoc(collection(db, "task_lists"), {
        name: listName,
        cooldownHours,
        status: "published",
        taskCount: 0,
        createdAt: serverTimestamp()
      });
      tg.showAlert("✅ লিস্ট তৈরি হয়েছে! এখন Lists পেজ থেকে টাস্ক যোগ করুন।");
      location.href = "lists.html";
    } catch (e) {
      tg.showAlert("সমস্যা: " + e.message);
      btn.disabled = false;
      btn.innerText = "Sequential লিস্ট তৈরি করুন";
    }
  };

  document.getElementById("createD").onclick = async () => {
    const name = document.getElementById("d_name").value.trim();
    const link = document.getElementById("d_link").value.trim();
    const coin = Number(document.getElementById("d_coin").value);
    const code = document.getElementById("d_code").value.trim();
    const timer = Number(document.getElementById("d_timer").value) || 15;
    const cooldownHours = Number(document.getElementById("d_cooldown").value) || 3;
    const activeDays = Number(document.getElementById("d_days").value) || 7;
    const limit = Number(document.getElementById("d_limit").value) || 0;

    if (!name || !link || !coin) return tg.showAlert("নাম, লিংক ও কয়েন আবশ্যক");

    const btn = document.getElementById("createD");
    btn.disabled = true;
    btn.innerText = "তৈরি হচ্ছে...";

    try {
      await addDoc(collection(db, "tasks_temporary"), {
        name, link, coin,
        code: code || "",
        timer, cooldownHours, activeDays, limit,
        category: "temporary",
        status: "published",
        completedCount: 0,
        createdAt: serverTimestamp()
      });
      tg.showAlert("✅ Temporary টাস্ক তৈরি হয়েছে!");
      location.href = "tasks.html";
    } catch (e) {
      tg.showAlert("সমস্যা: " + e.message);
      btn.disabled = false;
      btn.innerText = "Temporary টাস্ক তৈরি করুন";
    }
  };
}

loadPage().catch(err => console.error(err));
