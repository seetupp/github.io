import { collection, addDoc, deleteDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ==========================================
// GLOBALS & RECOVERY VARIABLES
// ==========================================
let userLoggedIn = false;
let currentUsername = "";
let likedEquipments = [];
let isKurucuActive = false;

// Firebase yüklendikten sonra yerel değişken yerine veritabanından beslenecek ürünler listesi
let customEquipments = {
    mouse: [], mousepad: [], keyboard: [], headset: [], monitor: [], koltuk: [], mikrofon: [], kasa: [], bilesenler: []
};

let customBadges = [
    { icon: "👑", name: "Premium Kurucu", price: 500, type: "gold" },
    { icon: "🧠", name: "Setup Gurusu", price: 50, type: "gem" },
    { icon: "💸", name: "Zengin", price: 1000, type: "gold" },
    { icon: "🔥", name: "Aktif Üye", price: 20, type: "gem" }
];

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
// GERÇEK ZAMANLI FIREBASE SORGULARI (DÜNYA GENELİ)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    renderMarketBadges();

    // Firestore'dan verileri canlı dinleme motoru (onSnapshot)
    const db = window.db;
    if (db) {
        onSnapshot(collection(db, "equipments"), (snapshot) => {
            // Kategorileri sıfırla
            customEquipments = { mouse: [], mousepad: [], keyboard: [], headset: [], monitor: [], koltuk: [], mikrofon: [], kasa: [], bilesenler: [] };

            snapshot.forEach((doc) => {
                const data = doc.data();
                if (customEquipments[data.category]) {
                    customEquipments[data.category].push({
                        id: doc.id, // Silme işlemi için döküman kimliği gerekli
                        name: data.name,
                        desc: data.desc,
                        link: data.link || "#"
                    });
                }
            });

            // Ekran kartlarını ve listeleri yenile
            renderAllEquipments();
            const currentCat = document.getElementById("admEquipCategory")?.value || "mouse";
            updateAdminEquipDeleteList(currentCat);
        });
    }
});

// ==========================================
// SAYFA GEÇİŞLERİ VE NAVİGASYON
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
// KULLANICI GİRİŞİ & KURUCU SORGUSU
// ==========================================
window.handleAuth = function(type) {
    const userEl = document.getElementById("authUser");
    const passEl = document.getElementById("authPass");

    if(!userEl ||!passEl) return;

    const user = userEl.value.trim();
    const pass = passEl.value.trim();

    if(!user ||!pass) {
        alert("Lütfen alanları doldurun! 👤");
        return;
    }

    userLoggedIn = true;
    currentUsername = user;

    const goldCountEl = document.getElementById("goldCount");
    const gemCountEl = document.getElementById("gemCount");
    if(goldCountEl) goldCountEl.innerText = "1300";
    if(gemCountEl) gemCountEl.innerText = "100";

    const authBtn = document.querySelector('.auth-btn');
    if(authBtn) {
        authBtn.innerText = `👤 ${user.toUpperCase()}`;
        authBtn.setAttribute('onclick', "handleProfileNav()");
    }

    const pUserDisplay = document.getElementById("profileUsernameDisplay");
    if(pUserDisplay) pUserDisplay.innerText = user.toUpperCase();

    const roleBadge = document.getElementById("profileRoleBadge");

    if(user.toLowerCase() === "flexy" && pass === "kerem4848*") {
        isKurucuActive = true;
        if(roleBadge) {
            roleBadge.innerText = "👑 KURUCU / ADMIN";
            roleBadge.classList.add("kurucu-trigger");
            roleBadge.setAttribute("onclick", "openModal('adminPanelModal')");
        }

        updateAdminDeleteListUI();
        updateAdminEquipDeleteList('mouse');
        alert(`Sisteme Kurucu olarak giriş yaptınız! Paneli açmak için profilinizdeki 'KURUCU' rozetine tıklayın. Hoş geldin flexy 👑`);
    } else {
        isKurucuActive = false;
        if(roleBadge) {
            roleBadge.innerText = "Üye";
            roleBadge.classList.remove("kurucu-trigger");
            roleBadge.removeAttribute("onclick");
        }
        if(type === 'login') {
            alert(`Başarıyla giriş yapıldı: ${user} 🎉`);
        } else {
            alert(`Hesap başarıyla açıldı: ${user} 📝`);
        }
    }

    userEl.value = "";
    passEl.value = "";
    closeModal('loginModal');
    showPage('my-profile-page');
};

// ==========================================
// KURUCU PANELİ - VERİTABANI BAĞLANTILARI
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

function renderMarketBadges() {
    const grid = document.getElementById("badgeGridContainer");
    if(!grid) return;
    grid.innerHTML = "";

    customBadges.forEach(badge => {
        const card = document.createElement("div");
        card.className = "badge-card";
        card.innerHTML = `
            <span class="badge-icon">${badge.icon}</span>
            <h3>${badge.name}</h3>
            <p class="price">Fiyat: ${badge.price} ${badge.type === 'gold'? 'Gold 🪙' : 'Gem 💎'}</p>
            <button class="action-btn" onclick="buyBadge('${badge.name}', ${badge.price}, '${badge.type}')">Satın Al</button>
        `;
        grid.appendChild(card);
    });
}

function updateAdminDeleteListUI() {
    const delZone = document.getElementById("adminDeleteBadgeList");
    if(!delZone) return;
    delZone.innerHTML = "";

    customBadges.forEach((badge, index) => {
        const div = document.createElement("div");
        div.className = "admin-del-item";
        div.innerHTML = `
            <span>${badge.icon} ${badge.name}</span>
            <button class="remove-liked-btn" onclick="deleteBadgeFromMarket(${index})"><i class="fa-solid fa-trash"></i></button>
        `;
        delZone.appendChild(div);
    });
}

window.addNewBadgeToMarket = function() {
    const icon = document.getElementById("admBadgeIcon").value.trim();
    const name = document.getElementById("admBadgeName").value.trim();
    const priceInput = document.getElementById("admBadgePrice").value.trim();
    const price = parseInt(priceInput);
    const type = document.getElementById("admBadgeCurrency").value;

    if(!icon ||!name ||!priceInput) {
        alert("Lütfen rozet ekleme alanlarını eksiksiz doldurun!");
        return;
    }

    customBadges.push({ icon, name, price, type });
    renderMarketBadges();
    updateAdminDeleteListUI();

    document.getElementById("admBadgeIcon").value = "";
    document.getElementById("admBadgeName").value = "";
    document.getElementById("admBadgePrice").value = "";
    alert(`[${name}] rozeti markete eklendi! 🏅`);
};

window.deleteBadgeFromMarket = function(index) {
    if(confirm("Bu rozeti marketten silmek istediğinize emin misiniz?")) {
        customBadges.splice(index, 1);
        renderMarketBadges();
        updateAdminDeleteListUI();
    }
};

// 🌟 FIREBASE FİRESTORE'A YENİ ÜRÜN EKLEME
window.addNewEquipment = async function() {
    const category = document.getElementById("admEquipCategory").value;
    const name = document.getElementById("admEquipName").value.trim();
    const link = document.getElementById("admEquipLink").value.trim();
    const desc = document.getElementById("admEquipDesc").value.trim();

    if(!name ||!desc) {
        alert("Lütfen ürün adı ve açıklama alanlarını doldurun!");
        return;
    }

    const db = window.db;
    if(!db) {
        alert("Firebase bağlantısı kurulamadı. index.html kontrol edin.");
        return;
    }

    try {
        // Ürünü doğrudan Firebase Firestore bulut veritabanına ekle
        await addDoc(collection(db, "equipments"), {
            category: category,
            name: name,
            link: link || "#",
            desc: desc
        });

        document.getElementById("admEquipName").value = "";
        document.getElementById("admEquipLink").value = "";
        document.getElementById("admEquipDesc").value = "";
        alert(`[${name}] ürünü başarıyla KÜRESEL SİSTEME eklendi! Artık herkes görebilir. 📦`);
    } catch (e) {
        console.error("Hata oluştu: ", e);
        alert("Ürün eklenirken veritabanı hatası oluştu.");
    }
};

// SİLME PANELİ LİSTESİNİ GÜNCELLEME
window.updateAdminEquipDeleteList = function(category) {
    const delZone = document.getElementById("adminDeleteEquipList");
    if(!delZone) return;
    delZone.innerHTML = "";

    const items = customEquipments[category] || [];
    if(items.length === 0) {
        delZone.innerHTML = '<p style="font-size:0.8rem; color:#555; text-align:center;">Bu kategoride veritabanında ürün yok.</p>';
        return;
    }

    items.forEach((item) => {
        const div = document.createElement("div");
        div.className = "admin-del-item";
        div.innerHTML = `
            <span>⚙️ ${item.name}</span>
            <button class="remove-liked-btn" onclick="deleteEquipmentFromSystem('${item.id}')"><i class="fa-solid fa-trash"></i></button>
        `;
        delZone.appendChild(div);
    });
};

// 🌟 FIREBASE FİRESTORE'DAN ÜRÜN SİLME
window.deleteEquipmentFromSystem = async function(docId) {
    if(confirm("Bu ürünü veritabanından kalıcı olarak silmek istediğinize emin misiniz? Herkesten silinecektir.")) {
        const db = window.db;
        if(!db) return;
        try {
            // Belirtilen döküman kimliğine sahip ürünü veritabanından tamamen siler
            await deleteDoc(doc(db, "equipments", docId));
            alert("Ürün veritabanından başarıyla kaldırıldı!");
        } catch (e) {
            console.error("Silme hatası: ", e);
        }
    }
};

// ==========================================
// BEĞENİ VE VİTRİN MODÜLLERİ
// ==========================================
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
            <span>⚙️ ${item}</span>
            <button class="remove-liked-btn" onclick="removeLikedDirectly('${item}')"><i class="fa-solid fa-trash"></i></button>
        `;
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

window.uploadMyVitrin = function() {
    const title = document.getElementById("vitrinTitle").value.trim();
    const link = document.getElementById("vitrinLink").value.trim();
    const desc = document.getElementById("vitrinDesc").value.trim();

    if(!title ||!desc) {
        alert("Lütfen alanları doldurun!");
        return;
    }

    const globalGrid = document.getElementById("vitrinShowcaseGrid");
    if(globalGrid) {
        const noText = document.getElementById("noVitrinGlobalText");
        if(noText) noText.style.display = "none";

        const card = document.createElement("div");
        card.className = "equip-card";
        card.style.borderColor = "#9b51e0";
        card.innerHTML = `
            <h3 style="color:#9b51e0;">🎬 ${title}</h3>
            <p class="topic-meta">👤 Yükleyen: ${currentUsername.toUpperCase()}</p>
            <p class="equip-desc">${desc}</p>
            <a href="${link || '#'}" target="_blank" class="read-btn" style="display:inline-block; border-color:#9b51e0; color:#9b51e0; text-decoration:none; margin-top:10px;">Videoyu/Detayı Gör</a>
        `;
        globalGrid.insertBefore(card, globalGrid.firstChild);
    }

    document.getElementById("vitrinTitle").value = "";
    document.getElementById("vitrinLink").value = "";
    document.getElementById("vitrinDesc").value = "";
    alert("Vitrininiz küresel listeye gönderildi! 🎬");
    showPage('tiktok-vitrin');
};

window.buyBadge = function(badgeName, price, currencyType) {
    if(!userLoggedIn) {
        alert("Rozet satın alabilmek için önce giriş yapmalısınız! 🔐");
        openModal('loginModal');
        return;
    }

    if(currencyType === 'gold') {
        const goldEl = document.getElementById("goldCount");
        let gold = goldEl? parseInt(goldEl.innerText) : 0;
        if(gold >= price) {
            if(goldEl) goldEl.innerText = gold - price;
            addBadgeToDashboard(badgeName);
        } else {
            alert("Yetersiz Gold miktarı! 🪙");
        }
    } else {
        const gemEl = document.getElementById("gemCount");
        let gem = gemEl? parseInt(gemEl.innerText) : 0;
        if(gem >= price) {
            if(gemEl) gemEl.innerText = gem - price;
            addBadgeToDashboard(badgeName);
        } else {
            alert("Yetersiz Gem miktarı! 💎");
        }
    }
};

function addBadgeToDashboard(badgeName) {
    const container = document.getElementById("ownedBadgesList");
    if(!container) return;
    if(container.querySelector(".no-badge-text")) container.innerHTML = "";

    const badgeSpan = document.createElement("span");
    badgeSpan.className = "owned-badge-item";
    badgeSpan.innerText = badgeName;
    container.appendChild(badgeSpan);
    alert(`Rozet hesabınıza başarıyla yüklendi! 🏆`);
}

// ==========================================
// FORUM TARTIŞMA SİSTEMİ
// ==========================================
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

window.createNewTopic = function() {
    const title = document.getElementById("topicTitle").value.trim();
    const content = document.getElementById("topicContent").value.trim();

    if(!title ||!content) {
        alert("Boş alan bırakılamaz!");
        return;
    }

    const author = userLoggedIn? currentUsername : "Ziyaretçi";
    const list = document.getElementById("forumTopicsList");
    if(!list) return;

    const newCard = document.createElement("div");
    newCard.className = "topic-card";
    newCard.innerHTML = `
        <h3>${title}</h3>
        <p class="topic-meta">👤 Yazar: ${author} | 📅 Tarih: Bugün</p>
        <p class="topic-preview-text">${content}</p>
        <button class="read-btn" onclick="toggleReadForum(this)">📖 Oku / Cevapları Gör</button>
        <div class="forum-answers-area" style="display: none;">
            <div class="answers-list"></div>
            <div class="answer-input-zone">
                <input type="text" placeholder="Cevabını yaz...">
                <button onclick="addAnswerToTopic(this)">Gönder</button>
            </div>
        </div>
    `;
    list.insertBefore(newCard, list.firstChild);
    document.getElementById("topicTitle").value = "";
    document.getElementById("topicContent").value = "";
    alert("Konu açıldı! 💬");
};

window.addAnswerToTopic = function(btn) {
    const input = btn.previousElementSibling;
    if(!input) return;
    const answerText = input.value.trim();
    if(!answerText) return;

    const author = userLoggedIn? "@" + currentUsername : "@Ziyaretçi";
    const list = btn.parentElement.previousElementSibling;

    if(list) {
        const newItem = document.createElement("div");
        newItem.className = "answer-item";
        newItem.innerHTML = `<strong>${author}:</strong> ${answerText}`;
        list.appendChild(newItem);
    }
    input.value = "";
};

// ==========================================
// ÇEKİLİŞ KATILIM VE CHAT MOTORU
// ==========================================
window.joinGiveaway = function() {
    window.open("https://www.inovapin.com/p/seetup?page=1&t=cekilisler", "_blank");
};

window.toggleChat = function() {
    const chatWin = document.getElementById("chatWindow");
    if(chatWin) {
        chatWin.style.display = chatWin.style.display === "none" || chatWin.style.display === ""? "flex" : "none";
    }
};

window.sendChatMessage = function() {
    if(!userLoggedIn) {
        alert("Sohbete yazabilmek için önce sisteme Kayıt Olmalı / Giriş yapmalısınız! 🔐");
        openModal('loginModal');
        return;
    }

    const input = document.getElementById("chatInput");
    if(!input) return;
    const text = input.value.trim();
    if(!text) return;

    const messagesDiv = document.getElementById("chatMessages");
    if(!messagesDiv) return;

    const msgRow = document.createElement("div");
    msgRow.className = "chat-msg-row";

    if(isKurucuActive) {
        msgRow.classList.add("admin-msg");
        msgRow.innerHTML = `
            <div class="msg-body" style="color: #ffaa00; font-weight: bold; text-shadow: 0 0 5px rgba(255,170,0,0.3)">
                <span class="chat-admin-badge" style="background:#ffaa00; color:#000; padding:1px 5px; border-radius:3px; font-size:0.75rem; margin-right:4px;">👑 FLEXY</span>: ${text}
            </div>
        `;
    } else {
        msgRow.classList.add("user-msg");
        msgRow.innerHTML = `
            <div class="msg-body" style="margin-bottom: 6px;">
                <strong style="color: #00bcff;">${currentUsername}:</strong> ${text}
            </div>
        `;
    }

    messagesDiv.appendChild(msgRow);
    input.value = "";
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
};

// ==========================================
// DİNAMİK EKİPMAN RENDER MOTORU
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
            <i class="fa-regular fa-heart favorite-icon" onclick="toggleFavorite(this, '${item.name}')"></i>
            <h3>${item.name}</h3>
            <p class="equip-desc">${item.desc}</p>
            <a href="${item.link}" target="_blank" class="action-btn" style="display:block; text-decoration:none; line-height:36px; text-align:center;">İncele</a>
        `;
        grid.appendChild(card);
    });
}

// ===== FIRESTORE: Vitrinler ve Forumlar =====
document.addEventListener('DOMContentLoaded', () => {
    const waitForFirebase = setInterval(() => {
        if (window.firestoreDB && window.firestoreFuncs) {
            clearInterval(waitForFirebase);
            initFirestoreData();
        }
    }, 100);
});

async function initFirestoreData() {
    const { db } = { db: window.firestoreDB };
    const { collection, getDocs, onSnapshot } = window.firestoreFuncs;

    // Vitrinler
    const vitrinContainer = document.querySelector('.vitrinler, #vitrinler');
    if (vitrinContainer && db) {
        onSnapshot(collection(db, 'vitrinler'), (snapshot) => {
            vitrinContainer.innerHTML = '';
            snapshot.forEach(doc => {
                const data = doc.data();
                const item = document.createElement('div');
                item.className = 'vitrin-item';
                item.innerHTML = `
                    <img src="${data.image || ''}" alt="${data.title || ''}">
                    <h3>${data.title || ''}</h3>
                    <p>${data.desc || ''}</p>
                `;
                vitrinContainer.appendChild(item);
            });
        });
    }

    // Forumlar
    const forumContainer = document.querySelector('.forumlar, #forumlar');
    if (forumContainer && db) {
        onSnapshot(collection(db, 'forumlar'), (snapshot) => {
            forumContainer.innerHTML = '';
            snapshot.forEach(doc => {
                const data = doc.data();
                const post = document.createElement('div');
                post.className = 'forum-post';
                post.innerHTML = `
                    <h4>${data.baslik || ''}</h4>
                    <p>${data.icerik || ''}</p>
                    <span>${data.tarih || ''}</span>
                `;
                forumContainer.appendChild(post);
            });
        });
    }
}