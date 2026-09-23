import { collection, addDoc, deleteDoc, doc, onSnapshot, updateDoc, query, orderBy, serverTimestamp, setDoc, getDoc, increment } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

// ==========================================
// GÜVENLİK FİLTRESİ (XSS ÖNLEYİCİ)
// ==========================================
function escapeHTML(str) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/[&<>"'`]/g, function(match) {
        const masks = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '`': '&#x60;'
        };
        return masks[match];
    });
}

// Link güvenliği: sadece http/https adreslerine izin verir.
// "javascript:", "data:" gibi tehlikeli linkler '#' olarak değiştirilir.
function safeUrl(url) {
    if (!url) return '#';
    let candidate = String(url).trim();
    if (candidate === '#') return '#';
    if (!/^https?:\/\//i.test(candidate)) {
        if (/^[a-z][a-z0-9+.\-]*:/i.test(candidate)) return '#';
        candidate = 'https://' + candidate;
    }
    try {
        const parsed = new URL(candidate);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
    } catch (e) {}
    return '#';
}

// ==========================================
// GLOBALS
// ==========================================
let userLoggedIn = false;
let currentUsername = "";
let likedEquipments = [];
let isKurucuActive = false;
let userData = { gold: 0, gem: 0, ownedBadges: [], activeBadge: "", isAdmin: false };

let customEquipments = {
    mouse: [], mousepad: [], keyboard: [], headset: [], monitor: [], koltuk: [], mikrofon: [], kasa: [], bilesenler: []
};

let customBadges = [];
let forumTopics = [];
let vitrinItems = [];
let latestChatSnapshot = null;

// ==========================================
// CANLI PARTİKÜL ARKA PLANI
// ==========================================
const canvas = document.getElementById("bgCanvas");
const ctx = canvas.getContext("2d");
let particlesArray = [];
const numberOfParticles = 100;

function resizeCanvas() {
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

class Particle {
    constructor() {
        this.x = Math.random() * (canvas? canvas.width : window.innerWidth);
        this.y = Math.random() * (canvas? canvas.height : window.innerHeight);
        this.size = Math.random() * 2 + 1;
        this.speedY = Math.random() * 0.8 + 0.3;
        this.opacity = Math.random() * 0.6 + 0.2;
    }
    update() {
        this.y += this.speedY;
        if (canvas && this.y > canvas.height) {
            this.y = 0;
            this.x = Math.random() * canvas.width;
        }
    }
    draw() {
        if (!ctx) return;
        ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function initParticles() {
    particlesArray = [];
    for (let i = 0; i < numberOfParticles; i++) {
        particlesArray.push(new Particle());
    }
}

function animateParticles() {
    if (!ctx ||!canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].update();
        particlesArray[i].draw();
    }
    requestAnimationFrame(animateParticles);
}

if (canvas && ctx) {
    initParticles();
    animateParticles();
}

setInterval(() => {
    const el = document.getElementById("onlineCount");
    if(el) el.innerText = Math.floor(Math.random() * (80 - 68 + 1)) + 68;
}, 3000);

// ==========================================
// FIREBASE REALTIME
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const db = window.db;
    if (!db) {
        console.error("Firebase bağlantısı yok!");
        return;
    }

    // 1. EKİPMANLAR
    onSnapshot(collection(db, "equipments"), (snapshot) => {
        customEquipments = { mouse: [], mousepad: [], keyboard: [], headset: [], monitor: [], koltuk: [], mikrofon: [], kasa: [], bilesenler: [] };
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (customEquipments[data.category]) {
                customEquipments[data.category].push({
                    id: doc.id,
                    name: data.name,
                    desc: data.desc,
                    link: data.link || "#",
                    foto_url: data.foto_url || "https://via.placeholder.com/400x300/0a0f14/00bcff?text=Foto+Yok"
                });
            }
        });
        renderAllEquipments();
        const currentCat = document.getElementById("admEquipCategory")?.value || "mouse";
        updateAdminEquipDeleteList(currentCat);
    });

    // 2. ROZET MARKETİ
    onSnapshot(collection(db, "badges"), (snapshot) => {
        customBadges = [];
        snapshot.forEach((doc) => {
            customBadges.push({ id: doc.id,...doc.data() });
        });
        renderMarketBadges();
        updateAdminDeleteListUI();
    });

    // 3. FORUM
    onSnapshot(query(collection(db, "forum"), orderBy("timestamp", "desc")), (snapshot) => {
        forumTopics = [];
        snapshot.forEach((doc) => {
            forumTopics.push({ id: doc.id,...doc.data() });
        });
        renderForumTopics();
    });

    // 4. VİTRİNLER
    onSnapshot(query(collection(db, "vitrinler"), orderBy("timestamp", "desc")), (snapshot) => {
        vitrinItems = [];
        snapshot.forEach((doc) => {
            vitrinItems.push({ id: doc.id,...doc.data() });
        });
        renderVitrinler();
    });

    // 5. CHAT (24 saatte bir sıfırlanır, bkz. "CHAT SIFIRLAMA" bölümü)
    onSnapshot(query(collection(db, "chat"), orderBy("timestamp", "asc")), (snapshot) => {
        latestChatSnapshot = snapshot;
        renderChatMessages(snapshot);
    });
});

// ==========================================
// SAYFA GEÇİŞLERİ
// ==========================================
window.showPage = function(pageId) {
    const pages = document.querySelectorAll('.page-content');
    pages.forEach(page => page.classList.remove('active'));
    const activePage = document.getElementById(pageId);
    if(activePage) activePage.classList.add('active');
    window.scrollTo(0, 0);
};

window.handleProfileNav = function() {
    if(!userLoggedIn) {
        alert("Profilinizi görebilmek için lütfen önce giriş yapın! 🔐");
        openModal('loginModal');
    } else {
        showPage('my-profile-page');
        loadUserData();
    }
};

// ==========================================
// MODAL KONTROLLERİ
// ==========================================
window.openModal = function(modalId) {
    const targetModal = document.getElementById(modalId);
    if(targetModal) targetModal.style.display = "flex";
};

window.closeModal = function(modalId) {
    const targetModal = document.getElementById(modalId);
    if(targetModal) targetModal.style.display = "none";
};

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = "none";
    }
};

// ==========================================
// KULLANICI GİRİŞİ & VERİ YÜKLEME
// ==========================================
// Kullanıcı adı, giriş için "kullaniciadi@seetup.app" şeklinde sahte bir e-postaya çevrilir.
// Şifreler Firebase Authentication tarafından güvenli şekilde saklanır, kodda veya veritabanında düz yazı olarak tutulmaz.
const AUTH_EMAIL_DOMAIN = "@seetup.app";
let authInstance = null;
let pendingAuthAction = null;

function getAuthInstance() {
    if (!authInstance && window.firebaseApp) authInstance = getAuth(window.firebaseApp);
    return authInstance;
}

function isValidUsername(name) {
    const n = String(name).trim().toLowerCase();
    if (n.length < 3 || n.length > 20) return false;
    if (/^__.*__$/.test(n)) return false;
    return /^[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(n);
}

function usernameToEmail(name) {
    return String(name).trim().toLowerCase() + AUTH_EMAIL_DOMAIN;
}

function authErrorMessage(e) {
    switch (e && e.code) {
        case "auth/email-already-in-use":
            return "Bu kullanıcı adı zaten alınmış. Başka bir ad dene ya da giriş yap.";
        case "auth/invalid-credential":
        case "auth/invalid-login-credentials":
        case "auth/wrong-password":
        case "auth/user-not-found":
            return "Kullanıcı adı veya şifre hatalı. Hesabın yoksa KAYIT OL'a bas (eski hesaplar da yeniden kayıt olmalı).";
        case "auth/weak-password":
            return "Şifre çok zayıf, en az 6 karakter olmalı.";
        case "auth/too-many-requests":
            return "Çok fazla deneme yaptın, biraz bekleyip tekrar dene.";
        case "auth/network-request-failed":
            return "İnternet bağlantısı kurulamadı.";
        case "auth/operation-not-allowed":
            return "Giriş sistemi kapalı. Firebase Console > Authentication > Sign-in method bölümünden Email/Password'u aç.";
        default:
            return "Giriş yapılamadı: " + ((e && e.code) || "bilinmeyen hata");
    }
}

window.handleAuth = async function(type) {
    const userEl = document.getElementById("authUser");
    const passEl = document.getElementById("authPass");
    if(!userEl ||!passEl) return;

    const user = userEl.value.trim();
    const pass = passEl.value;
    if(!user ||!pass) {
        alert("Lütfen alanları doldurun! 👤");
        return;
    }
    if (!isValidUsername(user)) {
        alert("Kullanıcı adı 3-20 karakter olmalı. Sadece harf (a-z), rakam, _ ve . kullanabilirsin (Türkçe harf ve boşluk olmaz).");
        return;
    }
    if (pass.length < 6) {
        alert("Şifre en az 6 karakter olmalı.");
        return;
    }

    const auth = getAuthInstance();
    if (!auth) {
        alert("Giriş sistemi başlatılamadı, sayfayı yenileyip tekrar dene.");
        return;
    }

    pendingAuthAction = { type: type, displayName: user };
    try {
        if (type === 'register') {
            await createUserWithEmailAndPassword(auth, usernameToEmail(user), pass);
        } else {
            await signInWithEmailAndPassword(auth, usernameToEmail(user), pass);
        }
    } catch (e) {
        pendingAuthAction = null;
        alert(authErrorMessage(e));
        return;
    }

    userEl.value = "";
    passEl.value = "";
};

window.handleLogout = async function() {
    const auth = getAuthInstance();
    if (!auth) return;
    try {
        await signOut(auth);
    } catch (e) {
        console.error("Çıkış yapılamadı:", e);
    }
};

function ensureLogoutButton() {
    const card = document.querySelector('.profile-header-card');
    if (!card || document.getElementById("logoutBtn")) return;
    const btn = document.createElement("button");
    btn.id = "logoutBtn";
    btn.className = "read-btn";
    btn.textContent = "🚪 Çıkış Yap";
    btn.style.display = "block";
    btn.style.margin = "14px auto 0";
    btn.addEventListener("click", () => handleLogout());
    card.appendChild(btn);
}

// Giriş yapılmış durum (sayfa yenilense de oturum hatırlanır)
async function applySignedInState(firebaseUser, action) {
    const db = window.db;
    const idName = (firebaseUser.email || "").split("@")[0];
    if (!idName) throw new Error("Hesapta kullanıcı adı yok");

    const userRef = doc(db, "users", idName);
    let snap = await getDoc(userRef);
    if (!snap.exists()) {
        // Yeni hesap: kullanıcı kaydını buluta (Firestore) yaz
        const displayName = action && action.displayName ? action.displayName : idName;
        await setDoc(userRef, {
            username: displayName,
            gold: 1300,
            gem: 100,
            ownedBadges: [],
            activeBadge: ""
        });
        snap = await getDoc(userRef);
    }

    userData = snap.data();
    userData.ownedBadges = userData.ownedBadges || [];
    currentUsername = userData.username || idName;
    userLoggedIn = true;

    // Kurucu/Admin: sadece Firebase'de "admins" koleksiyonuna UID'si eklenmiş hesap.
    // Yetkiyi asıl belirleyen Firestore güvenlik kurallarıdır, bu sadece paneli göstermek içindir.
    let admin = false;
    try {
        admin = (await getDoc(doc(db, "admins", firebaseUser.uid))).exists();
    } catch (e) {
        admin = false;
    }
    isKurucuActive = admin;

    document.getElementById("goldCount").innerText = userData.gold;
    document.getElementById("gemCount").innerText = userData.gem;
    renderOwnedBadges();

    const authBtn = document.querySelector('.auth-btn');
    if(authBtn) {
        authBtn.innerText = `👤 ${currentUsername.toUpperCase()}`;
        authBtn.setAttribute('onclick', "handleProfileNav()");
    }

    const pUserDisplay = document.getElementById("profileUsernameDisplay");
    if(pUserDisplay) pUserDisplay.innerText = currentUsername.toUpperCase();

    const roleBadge = document.getElementById("profileRoleBadge");
    if(roleBadge) {
        if(admin) {
            roleBadge.innerText = "👑 KURUCU / ADMIN";
            roleBadge.classList.add("kurucu-trigger");
            roleBadge.setAttribute("onclick", "openModal('adminPanelModal')");
        } else {
            roleBadge.innerText = "Üye";
            roleBadge.classList.remove("kurucu-trigger");
            roleBadge.removeAttribute("onclick");
        }
    }

    ensureLogoutButton();

    if (action) {
        if (admin) {
            alert(`Sisteme Kurucu olarak giriş yaptınız! Hoş geldin ${currentUsername} 👑`);
        } else {
            alert(action.type === 'login'? `Başarıyla giriş yapıldı: ${currentUsername} 🎉` : `Hesap başarıyla açıldı: ${currentUsername} 📝`);
        }
        closeModal('loginModal');
        showPage('my-profile-page');
    }
}

// Çıkış yapılmış durum
function applySignedOutState() {
    const wasLoggedIn = userLoggedIn;
    userLoggedIn = false;
    currentUsername = "";
    isKurucuActive = false;
    userData = { gold: 0, gem: 0, ownedBadges: [], activeBadge: "", isAdmin: false };
    likedEquipments = [];

    const goldEl = document.getElementById("goldCount");
    const gemEl = document.getElementById("gemCount");
    if(goldEl) goldEl.innerText = 0;
    if(gemEl) gemEl.innerText = 0;

    const authBtn = document.querySelector('.auth-btn');
    if(authBtn) {
        authBtn.innerText = "🔐 Giriş Yap / Kayıt Ol";
        authBtn.setAttribute('onclick', "openModal('loginModal')");
    }

    const pUserDisplay = document.getElementById("profileUsernameDisplay");
    if(pUserDisplay) pUserDisplay.innerText = "Kullanıcı Adı";

    const roleBadge = document.getElementById("profileRoleBadge");
    if(roleBadge) {
        roleBadge.innerText = "Üye";
        roleBadge.classList.remove("kurucu-trigger");
        roleBadge.removeAttribute("onclick");
    }

    const logoutBtn = document.getElementById("logoutBtn");
    if(logoutBtn) logoutBtn.remove();

    closeModal('adminPanelModal');
    renderOwnedBadges();
    updateLikedListUI();
    renderAllEquipments();
    if (wasLoggedIn) showPage('home');
}

function startAuthListener() {
    const auth = getAuthInstance();
    if (!auth) {
        console.error("Firebase Auth başlatılamadı!");
        return;
    }
    onAuthStateChanged(auth, async (firebaseUser) => {
        const action = pendingAuthAction;
        pendingAuthAction = null;
        try {
            if (firebaseUser) await applySignedInState(firebaseUser, action);
            else applySignedOutState();
        } catch (e) {
            console.error("Hesap bilgileri yüklenemedi:", e);
            alert("Hesap bilgileri yüklenemedi. Lütfen tekrar dene.");
            try { await signOut(auth); } catch (_) {}
        }
    });
}
document.addEventListener("DOMContentLoaded", startAuthListener);

// Kural (yetki) hatalarını sessiz bırakma, kullanıcıya bildir
window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    if (reason && reason.code === "permission-denied") {
        alert("Bu işlem için yetkin yok. Giriş yaptığından emin ol.");
    }
});

async function loadUserData() {
    const db = window.db;
    if (!db ||!currentUsername) return;

    const userRef = doc(db, "users", currentUsername.toLowerCase());
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        userData = userSnap.data();
        document.getElementById("goldCount").innerText = userData.gold;
        document.getElementById("gemCount").innerText = userData.gem;
        renderOwnedBadges();
    }
}

// ==========================================
// ROZET SEÇME SİSTEMİ
// ==========================================
window.selectBadge = async function(badgeName) {
    if(!userLoggedIn) return;
    const db = window.db;
    const userRef = doc(db, "users", currentUsername.toLowerCase());

    if (userData.activeBadge === badgeName) {
        await updateDoc(userRef, { activeBadge: "" });
        alert("Rozet kaldırıldı!");
    } else {
        await updateDoc(userRef, { activeBadge: badgeName });
        alert(`[${badgeName}] rozeti aktif edildi! 🏆`);
    }
    loadUserData();
};

function renderOwnedBadges() {
    const container = document.getElementById("ownedBadgesList");
    if(!container) return;
    if(userData.ownedBadges.length === 0) {
        container.innerHTML = '<p class="no-badge-text">Henüz rozetiniz yok.</p>';
        return;
    }
    container.innerHTML = "";
    userData.ownedBadges.forEach(badgeName => {
        const badgeData = customBadges.find(b => b.name === badgeName);
        const isActive = userData.activeBadge === badgeName;
        const badgeDiv = document.createElement("div");
        badgeDiv.className = `owned-badge-item ${isActive? 'active-badge' : ''}`;
        badgeDiv.innerHTML = `
            <span>${badgeData? escapeHTML(badgeData.icon) : '🏅'} ${escapeHTML(badgeName)}</span>
            <button class="use-badge-btn">
                ${isActive? '✓ Kullanılıyor' : 'Kullan'}
            </button>
        `;
        badgeDiv.querySelector('.use-badge-btn').addEventListener('click', () => selectBadge(badgeName));
        container.appendChild(badgeDiv);
    });
}

// ==========================================
// KURUCU PANELİ
// ==========================================
window.openAdminSub = function(sectionId) {
    const subs = document.querySelectorAll('.admin-sub-panel');
    subs.forEach(sub => sub.style.display = "none");
    const activeSub = document.getElementById(sectionId);
    if(activeSub) activeSub.style.display = "block";
};

window.updateDrawSettings = function() {
    const title = document.getElementById("admDrawTitle").value.trim();
    const gift = document.getElementById("admDrawGift").value.trim();
    if(!title ||!gift) {
        alert("Lütfen tüm alanları doldurun!");
        return;
    }
    const dispTitle = document.getElementById("drawTitleDisplay");
    const dispGift = document.getElementById("drawGiftDisplay");
    if(dispTitle) dispTitle.innerText = title;
    if(dispGift) dispGift.innerText = gift;
    alert("Çekiliş bilgileri başarıyla güncellendi! 🎁");
};

// ROZET MARKETİ
function renderMarketBadges() {
    const grid = document.getElementById("badgeGridContainer");
    if(!grid) return;
    grid.innerHTML = "";
    customBadges.forEach(badge => {
        const card = document.createElement("div");
        card.className = "badge-card";
        card.innerHTML = `
            <span class="badge-icon">${escapeHTML(badge.icon)}</span>
            <h3>${escapeHTML(badge.name)}</h3>
            <p class="price">Fiyat: ${escapeHTML(badge.price)} ${badge.type === 'gold'? 'Gold 🪙' : 'Gem 💎'}</p>
            <button class="action-btn">Satın Al</button>
        `;
        card.querySelector('.action-btn').addEventListener('click', () => {
            buyBadge(badge.id, badge.name, Number(badge.price), badge.type === 'gold'? 'gold' : 'gem');
        });
        grid.appendChild(card);
    });
}

function updateAdminDeleteListUI() {
    const delZone = document.getElementById("adminDeleteBadgeList");
    if(!delZone) return;
    delZone.innerHTML = "";
    customBadges.forEach((badge) => {
        const div = document.createElement("div");
        div.className = "admin-del-item";
        div.innerHTML = `
            <span>${escapeHTML(badge.icon)} ${escapeHTML(badge.name)}</span>
            <button class="remove-liked-btn"><i class="fa-solid fa-trash"></i></button>
        `;
        div.querySelector('.remove-liked-btn').addEventListener('click', () => deleteBadgeFromMarket(badge.id));
        delZone.appendChild(div);
    });
}

window.addNewBadgeToMarket = async function() {
    const icon = document.getElementById("admBadgeIcon").value.trim();
    const name = document.getElementById("admBadgeName").value.trim();
    const priceInput = document.getElementById("admBadgePrice").value.trim();
    const price = parseInt(priceInput);
    const type = document.getElementById("admBadgeCurrency").value;
    if(!icon ||!name ||!priceInput) {
        alert("Lütfen rozet ekleme alanlarını eksiksiz doldurun!");
        return;
    }
    const db = window.db;
    await addDoc(collection(db, "badges"), { icon, name, price, type });
    document.getElementById("admBadgeIcon").value = "";
    document.getElementById("admBadgeName").value = "";
    document.getElementById("admBadgePrice").value = "";
    alert(`[${name}] rozeti markete eklendi! 🏅`);
};

window.deleteBadgeFromMarket = async function(badgeId) {
    if(confirm("Bu rozeti marketten silmek istediğinize emin misiniz?")) {
        const db = window.db;
        await deleteDoc(doc(db, "badges", badgeId));
        alert("Rozet silindi!");
    }
};

// EKİPMAN EKLEME
window.addNewEquipment = async function() {
    const category = document.getElementById("admEquipCategory").value;
    const name = document.getElementById("admEquipName").value.trim();
    const link = document.getElementById("admEquipLink").value.trim();
    const foto = document.getElementById("admEquipImg").value.trim();
    const desc = document.getElementById("admEquipDesc").value.trim();
    if(!name ||!desc ||!foto) {
        alert("Lütfen Ürün Adı, Açıklama ve Resim URL alanlarını doldurun!");
        return;
    }
    const db = window.db;
    if(!db) {
        alert("Firebase bağlantısı kurulamadı.");
        return;
    }
    try {
        await addDoc(collection(db, "equipments"), {
            category: category,
            name: name,
            link: link || "#",
            desc: desc,
            foto_url: foto
        });
        document.getElementById("admEquipName").value = "";
        document.getElementById("admEquipLink").value = "";
        document.getElementById("admEquipImg").value = "";
        document.getElementById("admEquipDesc").value = "";
        alert(`[${name}] ürünü başarıyla eklendi! 📦`);
    } catch (e) {
        console.error("Hata oluştu: ", e);
        alert("Ürün eklenirken hata oluştu.");
    }
};

window.updateAdminEquipDeleteList = function(category) {
    const delZone = document.getElementById("adminDeleteEquipList");
    if(!delZone) return;
    delZone.innerHTML = "";
    const items = customEquipments[category] || [];
    if(items.length === 0) {
        delZone.innerHTML = '<p style="font-size:0.8rem; color:#555; text-align:center;">Bu kategoride ürün yok.</p>';
        return;
    }
    items.forEach((item) => {
        const div = document.createElement("div");
        div.className = "admin-del-item";
        div.innerHTML = `
            <span>⚙️ ${escapeHTML(item.name)}</span>
            <button class="remove-liked-btn"><i class="fa-solid fa-trash"></i></button>
        `;
        div.querySelector('.remove-liked-btn').addEventListener('click', () => deleteEquipmentFromSystem(item.id));
        delZone.appendChild(div);
    });
};

window.deleteEquipmentFromSystem = async function(docId) {
    if(confirm("Bu ürünü kalıcı olarak silmek istediğinize emin misiniz?")) {
        const db = window.db;
        if(!db) return;
        try {
            await deleteDoc(doc(db, "equipments", docId));
            alert("Ürün başarıyla kaldırıldı!");
        } catch (e) {
            console.error("Silme hatası: ", e);
        }
    }
};

// ==========================================
// ROZET SATIN ALMA
// ==========================================
window.buyBadge = async function(badgeId, badgeName, price, currencyType) {
    if(!userLoggedIn) {
        alert("Rozet satın almak için giriş yapmalısınız! 🔐");
        openModal('loginModal');
        return;
    }
    const db = window.db;
    const userRef = doc(db, "users", currentUsername.toLowerCase());

    if (userData.ownedBadges.includes(badgeName)) {
        alert("Bu rozete zaten sahipsin!");
        return;
    }

    if(currencyType === 'gold') {
        if(userData.gold >= price) {
            await updateDoc(userRef, {
                gold: increment(-price),
                ownedBadges: [...userData.ownedBadges, badgeName]
            });
            alert(`Rozet hesabınıza yüklendi! 🏆`);
            loadUserData();
        } else {
            alert("Yetersiz Gold! 🪙");
        }
    } else {
        if(userData.gem >= price) {
            await updateDoc(userRef, {
                gem: increment(-price),
                ownedBadges: [...userData.ownedBadges, badgeName]
            });
            alert(`Rozet hesabınıza yüklendi! 🏆`);
            loadUserData();
        } else {
            alert("Yetersiz Gem! 💎");
        }
    }
};

// ==========================================
// FORUM (GÜVENLİ HALE GETİRİLDİ)
// ==========================================
function formatForumDate(ts) {
    if (ts && typeof ts.toDate === 'function') return new Date(ts.toDate()).toLocaleDateString();
    return '';
}

function renderForumTopics() {
    const list = document.getElementById("forumTopicsList");
    if(!list) return;
    list.innerHTML = "";
    forumTopics.forEach(topic => {
        const newCard = document.createElement("div");
        newCard.className = "topic-card";
        // Tüm kullanıcı yazıları escapeHTML() ile korunur, butonlar onclick yerine addEventListener ile bağlanır
        newCard.innerHTML = `
            <h3>${escapeHTML(topic.title)}</h3>
            <p class="topic-meta">👤 Yazar: ${escapeHTML(topic.author)} | 📅 ${formatForumDate(topic.timestamp)}</p>
            <p class="topic-preview-text">${escapeHTML(topic.content)}</p>
            <button class="read-btn">📖 Oku / Cevapları Gör</button>
            <div class="forum-answers-area" style="display: none;">
                <div class="answers-list"></div>
                <div class="answer-input-zone">
                    <input type="text" placeholder="Cevabını yaz...">
                    <button class="answer-send-btn">Gönder</button>
                </div>
            </div>
        `;
        const readBtn = newCard.querySelector('.read-btn');
        readBtn.addEventListener('click', () => toggleReadForum(readBtn));
        const sendBtn = newCard.querySelector('.answer-send-btn');
        sendBtn.addEventListener('click', () => addAnswerToTopic(topic.id, sendBtn));
        list.appendChild(newCard);
        loadAnswers(topic.id, newCard.querySelector('.answers-list'));
    });
}

async function loadAnswers(topicId, answersList) {
    const db = window.db;
    if(!answersList) return;

    onSnapshot(query(collection(db, "forum", topicId, "answers"), orderBy("timestamp", "asc")), (snapshot) => {
        answersList.innerHTML = "";
        snapshot.forEach(doc => {
            const data = doc.data();
            const newItem = document.createElement("div");
            newItem.className = "answer-item";
            // Forum cevapları escapeHTML() ile korundu
            newItem.innerHTML = `<strong>@${escapeHTML(data.author)}:</strong> ${escapeHTML(data.text)}`;
            answersList.appendChild(newItem);
        });
    });
}

window.createNewTopic = async function() {
    if(!userLoggedIn) {
        alert("Konu açmak için giriş yapmalısın!");
        return;
    }
    const title = document.getElementById("topicTitle").value.trim();
    const content = document.getElementById("topicContent").value.trim();
    if(!title ||!content) {
        alert("Boş alan bırakılamaz!");
        return;
    }
    const db = window.db;
    await addDoc(collection(db, "forum"), {
        title: title,
        content: content,
        author: currentUsername,
        timestamp: serverTimestamp()
    });
    document.getElementById("topicTitle").value = "";
    document.getElementById("topicContent").value = "";
    alert("Konu açıldı! 💬");
};

window.addAnswerToTopic = async function(topicId, btn) {
    if(!userLoggedIn) {
        alert("Cevap yazmak için giriş yapmalısın!");
        return;
    }
    const input = btn.previousElementSibling;
    const answerText = input.value.trim();
    if(!answerText) return;
    const db = window.db;
    await addDoc(collection(db, "forum", topicId, "answers"), {
        text: answerText,
        author: currentUsername,
        timestamp: serverTimestamp()
    });
    input.value = "";
};

window.toggleReadForum = function(button) {
    const answersArea = button.nextElementSibling;
    if(!answersArea) return;
    if (answersArea.style.display === "block") {
        answersArea.style.display = "none";
        button.innerText = "📖 Oku / Cevapları Gör";
    } else {
        answersArea.style.display = "block";
        button.innerText = "📕 Kapat";
    }
};

// ==========================================
// VİTRİNLER (GÜVENLİ HALE GETİRİLDİ)
// ==========================================
function renderVitrinler() {
    const globalGrid = document.getElementById("vitrinShowcaseGrid");
    if(!globalGrid) return;
    const noText = document.getElementById("noVitrinGlobalText");
    if(vitrinItems.length === 0) {
        if(noText) noText.style.display = "block";
        globalGrid.innerHTML = "";
        return;
    }
    if(noText) noText.style.display = "none";
    globalGrid.innerHTML = "";
    vitrinItems.forEach(item => {
        const card = document.createElement("div");
        card.className = "equip-card";
        card.style.borderColor = "#9b51e0";
        // Yazılar escapeHTML() ile, link ise safeUrl() ile (sadece http/https) korunur
        card.innerHTML = `
            <h3 style="color:#9b51e0;">🎬 ${escapeHTML(item.title)}</h3>
            <p class="topic-meta">👤 Yükleyen: ${escapeHTML(item.author)}</p>
            <p class="equip-desc">${escapeHTML(item.desc)}</p>
            <a href="${escapeHTML(safeUrl(item.link))}" target="_blank" rel="noopener noreferrer" class="read-btn" style="display:inline-block; border-color:#9b51e0; color:#9b51e0; text-decoration:none; margin-top:10px;">Videoyu/Detayı Gör</a>
        `;
        globalGrid.appendChild(card);
    });
}

window.uploadMyVitrin = async function() {
    if(!userLoggedIn) {
        alert("Vitrin yüklemek için giriş yapmalısın!");
        return;
    }
    const title = document.getElementById("vitrinTitle").value.trim();
    const link = document.getElementById("vitrinLink").value.trim();
    const desc = document.getElementById("vitrinDesc").value.trim();
    if(!title ||!desc) {
        alert("Lütfen alanları doldurun!");
        return;
    }
    const db = window.db;
    await addDoc(collection(db, "vitrinler"), {
        title: title,
        link: link,
        desc: desc,
        author: currentUsername,
        timestamp: serverTimestamp()
    });
    document.getElementById("vitrinTitle").value = "";
    document.getElementById("vitrinLink").value = "";
    document.getElementById("vitrinDesc").value = "";
    alert("Vitrininiz küresel listeye gönderildi! 🎬");
    showPage('tiktok-vitrin');
};

// ==========================================
// CHAT TETİKLEME
// ==========================================
window.toggleChat = function() {
    const chatWin = document.getElementById("chatWindow");
    if(chatWin) {
        chatWin.style.display = chatWin.style.display === "none" || chatWin.style.display === ""? "flex" : "none";
    }
};

window.sendChatMessage = async function() {
    if(!userLoggedIn) {
        alert("Sohbete yazabilmek için giriş yapmalısınız! 🔐");
        openModal('loginModal');
        return;
    }
    const input = document.getElementById("chatInput");
    if(!input) return;
    const text = input.value.trim();
    if(!text) return;
    const db = window.db;
    await addDoc(collection(db, "chat"), {
        text: text,
        username: currentUsername,
        isAdmin: isKurucuActive,
        timestamp: serverTimestamp()
    });
    input.value = "";
};

// ==========================================
// DİĞER
// ==========================================
window.joinGiveaway = function() {
    window.open("https://www.inovapin.com/p/seetup?page=1&t=cekilisler", "_blank");
};

window.toggleFavorite = function(icon, itemName) {
    if(!userLoggedIn) {
        alert("Ekipmanları beğenebilmek için önce giriş yapmalısınız! 🔐");
        openModal('loginModal');
        return;
    }
    if(icon.classList.contains('fa-regular')) {
        icon.classList.remove('fa-regular');
        icon.classList.add('fa-solid');
        if(!likedEquipments.includes(itemName)) likedEquipments.push(itemName);
    } else {
        icon.classList.remove('fa-solid');
        icon.classList.add('fa-regular');
        likedEquipments = likedEquipments.filter(item => item!== itemName);
    }
    updateLikedListUI();
};

function updateLikedListUI() {
    const container = document.getElementById("likedEquipmentsList");
    if(!container) return;
    if(likedEquipments.length === 0) {
        container.innerHTML = '<p class="no-badge-text">Henüz beğendiğiniz bir ekipman yok.</p>';
        return;
    }
    container.innerHTML = "";
    likedEquipments.forEach(item => {
        const div = document.createElement("div");
        div.className = "liked-item";
        div.innerHTML = `
            <span>⚙️ ${escapeHTML(item)}</span>
            <button class="remove-liked-btn"><i class="fa-solid fa-trash"></i></button>
        `;
        div.querySelector('.remove-liked-btn').addEventListener('click', () => removeLikedDirectly(item));
        container.appendChild(div);
    });
}

window.removeLikedDirectly = function(itemName) {
    likedEquipments = likedEquipments.filter(item => item!== itemName);
    updateLikedListUI();
    const icons = document.querySelectorAll('.favorite-icon');
    icons.forEach(icon => {
        const card = icon.closest('.equip-card');
        if (card) {
            const cardName = card.querySelector('h3').innerText;
            if(cardName === itemName) {
                icon.classList.remove('fa-solid');
                icon.classList.add('fa-regular');
            }
        }
    });
};

// ==========================================
// EKİPMAN RENDER
// ==========================================
function renderAllEquipments() {
    const categories = ['mouse', 'mousepad', 'keyboard', 'headset', 'monitor', 'koltuk', 'mikrofon', 'kasa', 'bilesenler'];
    categories.forEach(cat => renderEquipGrid(cat));
}

function renderEquipGrid(category) {
    const gridId = category + "Grid";
    const grid = document.getElementById(gridId);
    if(!grid) return;
    grid.innerHTML = "";
    const items = customEquipments[category] || [];
    items.forEach(item => {
        const card = document.createElement("div");
        card.className = "equip-card";
        card.innerHTML = `
            <i class="fa-regular fa-heart favorite-icon"></i>
            <img src="${escapeHTML(safeUrl(item.foto_url))}" alt="${escapeHTML(item.name)}" class="equip-img">
            <h3>${escapeHTML(item.name)}</h3>
            <p class="equip-desc">${escapeHTML(item.desc)}</p>
            <a href="${escapeHTML(safeUrl(item.link))}" target="_blank" rel="noopener noreferrer" class="action-btn" style="display:block; text-decoration:none; line-height:36px; text-align:center;">İncele</a>
        `;
        const heart = card.querySelector('.favorite-icon');
        heart.addEventListener('click', () => toggleFavorite(heart, item.name));
        grid.appendChild(card);
    });
}

// ==========================================
// CHAT SIFIRLAMA (24 SAATTE BİR + GERİ SAYIM)
// ==========================================
// Sohbet her gün Türkiye saatiyle CHAT_RESET_HOUR_TR'de sıfırlanır (0 = gece 00:00).
// Sıfırlamadan 10 saniye önce sohbet penceresinde ve sohbet butonunda 10, 9, 8 ... diye geri sayım başlar.
const CHAT_RESET_HOUR_TR = 0;
const TR_UTC_OFFSET = 3; // Türkiye UTC+3 (yaz/kış saati yok)
const CHAT_RESET_HOUR_UTC = (CHAT_RESET_HOUR_TR - TR_UTC_OFFSET + 24) % 24;
const DAY_MS = 24 * 60 * 60 * 1000;
const CHAT_COUNTDOWN_SECONDS = 10;

// En son gerçekleşen sıfırlama anı (ms)
function getLastChatResetTime(now = Date.now()) {
    const d = new Date(now);
    let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), CHAT_RESET_HOUR_UTC, 0, 0, 0);
    if (t > now) t -= DAY_MS;
    return t;
}

// Bir sonraki sıfırlama anı (ms)
function getNextChatResetTime(now = Date.now()) {
    return getLastChatResetTime(now) + DAY_MS;
}

function getChatDocMillis(docSnap) {
    const ts = docSnap.data({ serverTimestamps: 'estimate' }).timestamp;
    return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : null;
}

// Sıfırlama zamanından önceki mesajları veritabanından siler.
// Birden fazla kullanıcı aynı anda silmesin diye rastgele kısa bir bekleme kullanılır.
let chatCleanupTimer = null;
function scheduleChatCleanup() {
    if (chatCleanupTimer) return;
    chatCleanupTimer = setTimeout(async () => {
        chatCleanupTimer = null;
        if (!latestChatSnapshot) return;
        const resetStart = getLastChatResetTime();
        for (const docSnap of latestChatSnapshot.docs) {
            const ms = getChatDocMillis(docSnap);
            if (ms !== null && ms < resetStart) {
                try {
                    await deleteDoc(docSnap.ref);
                } catch (e) {
                    console.error("Eski sohbet mesajı silinemedi:", e);
                    return;
                }
            }
        }
    }, Math.random() * 4000);
}

let chatRenderToken = 0;
async function renderChatMessages(snapshot) {
    const messagesDiv = document.getElementById("chatMessages");
    if (!messagesDiv || !snapshot) return;

    const myToken = ++chatRenderToken;
    const db = window.db;
    const resetStart = getLastChatResetTime();

    // Son sıfırlamadan önce yazılan mesajlar gösterilmez, arka planda silinir
    const liveDocs = [];
    let hasOldDocs = false;
    snapshot.docs.forEach(docSnap => {
        const ms = getChatDocMillis(docSnap);
        if (ms !== null && ms < resetStart) hasOldDocs = true;
        else liveDocs.push(docSnap);
    });
    if (hasOldDocs) scheduleChatCleanup();

    const fragment = document.createDocumentFragment();
    const rules = document.createElement("div");
    rules.className = "msg alert";
    rules.textContent = "⚠️ Sohbet kurallarına uyun! Küfür/Hakaret yasaktır.";
    fragment.appendChild(rules);

    const badgeCache = new Map();

    for (const docSnap of liveDocs) {
        const data = docSnap.data({ serverTimestamps: 'estimate' });
        const msgRow = document.createElement("div");
        msgRow.className = "chat-msg-row";

        let userBadge = "";
        if (!data.isAdmin && data.username) {
            const key = String(data.username).toLowerCase();
            if (!badgeCache.has(key)) {
                try {
                    const userDoc = await getDoc(doc(db, "users", key));
                    badgeCache.set(key, userDoc.exists() ? (userDoc.data().activeBadge || "") : "");
                } catch (e) {
                    badgeCache.set(key, "");
                }
            }
            const badgeName = badgeCache.get(key);
            if (badgeName) {
                const badgeData = customBadges.find(b => b.name === badgeName);
                if (badgeData) userBadge = `<span class="chat-user-badge" title="${escapeHTML(badgeData.name)}">${escapeHTML(badgeData.icon)}</span>`;
            }
        }

        // Chat alanına yazılan tüm metinler escapeHTML() ile güvenli hale getirildi
        if (data.isAdmin) {
            msgRow.innerHTML = `
                <div class="msg-body" style="color: #ffaa00; font-weight: bold; text-shadow: 0 0 5px rgba(255,170,0,0.3)">
                    <span class="chat-admin-badge">👑 ${escapeHTML(data.username)}</span>: ${escapeHTML(data.text)}
                </div>
            `;
        } else {
            msgRow.innerHTML = `
                <div class="msg-body" style="margin-bottom: 6px;">
                    ${userBadge}<strong style="color: #00bcff;">${escapeHTML(data.username)}:</strong> ${escapeHTML(data.text)}
                </div>
            `;
        }
        fragment.appendChild(msgRow);
    }

    // Bu arada daha yeni bir çizim başladıysa bunu bırak
    if (myToken !== chatRenderToken) return;

    messagesDiv.innerHTML = "";
    messagesDiv.appendChild(fragment);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function setupChatResetCountdown() {
    const chatWindow = document.getElementById("chatWindow");
    const trigger = document.querySelector(".chat-trigger");
    if (!chatWindow) return;

    const style = document.createElement("style");
    style.textContent = `
        #chatResetOverlay {
            display: none;
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            z-index: 20;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 20px;
            text-align: center;
            background: rgba(0, 10, 20, 0.94);
        }
        #chatResetOverlay.visible { display: flex; }
        .chat-reset-title { color: #ff0055; font-weight: bold; font-size: 0.9rem; line-height: 1.6; letter-spacing: 1px; }
        .chat-reset-number { color: #fff; font-size: 4.5rem; font-weight: 900; text-shadow: 0 0 20px #ff0055, 0 0 40px #ff0055; }
        .chat-reset-number.pop { animation: chatResetPop 1s ease-out; }
        @keyframes chatResetPop {
            0% { transform: scale(1.6); opacity: 0.3; }
            30% { transform: scale(1); opacity: 1; }
            100% { transform: scale(0.9); opacity: 0.85; }
        }
        .chat-trigger.chat-reset-pulse {
            background: #ff0055 !important;
            color: #fff;
            font-weight: 900;
            font-size: 1.4rem;
            animation: chatResetBeat 1s infinite;
        }
        @keyframes chatResetBeat {
            0%, 100% { box-shadow: 0 0 10px rgba(255, 0, 85, 0.6); }
            50% { box-shadow: 0 0 25px rgba(255, 0, 85, 1); }
        }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "chatResetOverlay";
    overlay.innerHTML = '<div class="chat-reset-title"></div><div class="chat-reset-number"></div>';
    chatWindow.appendChild(overlay);
    const titleEl = overlay.querySelector(".chat-reset-title");
    const numberEl = overlay.querySelector(".chat-reset-number");
    const triggerDefaultText = trigger ? trigger.textContent : "💬";

    let shownKey = null;
    let handledReset = getLastChatResetTime();
    let doneUntil = 0;

    function show(key, title, bigText, triggerText, pulse) {
        if (shownKey === key) return;
        shownKey = key;
        titleEl.textContent = title;
        numberEl.textContent = bigText;
        numberEl.classList.remove("pop");
        void numberEl.offsetWidth;
        numberEl.classList.add("pop");
        overlay.classList.add("visible");
        if (trigger) {
            trigger.textContent = triggerText;
            trigger.classList.toggle("chat-reset-pulse", pulse);
        }
    }

    function hide() {
        if (shownKey === null) return;
        shownKey = null;
        overlay.classList.remove("visible");
        if (trigger) {
            trigger.textContent = triggerDefaultText;
            trigger.classList.remove("chat-reset-pulse");
        }
    }

    setInterval(() => {
        const now = Date.now();

        // Sıfırlama anı geldi: eski mesajları gizle ve sil
        const currentReset = getLastChatResetTime(now);
        if (currentReset !== handledReset) {
            handledReset = currentReset;
            doneUntil = now + 3000;
            if (latestChatSnapshot) renderChatMessages(latestChatSnapshot);
        }

        const msLeft = getNextChatResetTime(now) - now;
        if (msLeft <= CHAT_COUNTDOWN_SECONDS * 1000) {
            const sec = Math.ceil(msLeft / 1000);
            show(sec, "🔄 SOHBET SIFIRLANIYOR", String(sec), String(sec), true);
        } else if (now < doneUntil) {
            show("done", "SOHBET SIFIRLANDI", "✅", triggerDefaultText, false);
        } else {
            hide();
        }
    }, 200);
}

setupChatResetCountdown();

// ==========================================
// MOBİL MENÜ (HAMBURGER + AÇILIR MENÜLER)
// ==========================================
(function initMobileMenu() {
    const header = document.querySelector('header');
    const toggleBtn = document.getElementById('menuToggle');
    if (!header || !toggleBtn) return;

    // style.css'teki @media (max-width: 1200px) ile aynı olmalı
    const mobileQuery = window.matchMedia('(max-width: 1200px)');

    function setMenu(open) {
        header.classList.toggle('menu-open', open);
        toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (!open) {
            header.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
        }
    }

    window.toggleMobileMenu = function() {
        setMenu(!header.classList.contains('menu-open'));
    };

    header.addEventListener('click', function(e) {
        if (!mobileQuery.matches) return;

        // Ekipmanlar / Vitrinler: dokununca alt menüyü aç-kapat
        const dropBtn = e.target.closest('.dropbtn');
        if (dropBtn) {
            e.preventDefault();
            dropBtn.parentElement.classList.toggle('open');
            return;
        }

        // Bir sayfaya/işleme gidilince menüyü kapat
        if (e.target.closest('nav a, .auth-btn, .logo-area')) {
            setMenu(false);
        }
    });

    // Ekran genişleyip masaüstü görünüme dönerse menü durumunu sıfırla
    window.addEventListener('resize', function() {
        if (!mobileQuery.matches) setMenu(false);
    });
})();
