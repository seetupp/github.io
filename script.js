import { collection, addDoc, deleteDoc, doc, onSnapshot, updateDoc, query, orderBy, serverTimestamp, setDoc, getDoc, increment } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

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

    // 5. CHAT - ROZET GÖSTERME
    onSnapshot(query(collection(db, "chat"), orderBy("timestamp", "asc")), async (snapshot) => {
        const messagesDiv = document.getElementById("chatMessages");
        if(!messagesDiv) return;
        messagesDiv.innerHTML = '<div class="msg alert">⚠️ Sohbet kurallarına uyun! Küfür/Hakaret yasaktır.</div>';

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const msgRow = document.createElement("div");
            msgRow.className = "chat-msg-row";

            let userBadge = "";
            if (!data.isAdmin && data.username) {
                const userRef = doc(db, "users", data.username.toLowerCase());
                const userDoc = await getDoc(userRef);
                if (userDoc.exists() && userDoc.data().activeBadge) {
                    const badgeName = userDoc.data().activeBadge;
                    const badgeData = customBadges.find(b => b.name === badgeName);
                    if (badgeData) userBadge = `<span class="chat-user-badge" title="${badgeData.name}">${badgeData.icon}</span>`;
                }
            }

            if(data.isAdmin) {
                msgRow.innerHTML = `
                    <div class="msg-body" style="color: #ffaa00; font-weight: bold; text-shadow: 0 0 5px rgba(255,170,0,0.3)">
                        <span class="chat-admin-badge">👑 ${data.username}</span>: ${data.text}
                    </div>
                `;
            } else {
                msgRow.innerHTML = `
                    <div class="msg-body" style="margin-bottom: 6px;">
                        ${userBadge}<strong style="color: #00bcff;">${data.username}:</strong> ${data.text}
                    </div>
                `;
            }
            messagesDiv.appendChild(msgRow);
        }
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
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
window.handleAuth = async function(type) {
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
    const db = window.db;

    const userRef = doc(db, "users", user.toLowerCase());
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        await setDoc(userRef, {
            username: user,
            gold: 1300,
            gem: 100,
            ownedBadges: [],
            activeBadge: "",
            isAdmin: user.toLowerCase() === "flexy" && pass === "kerem4848*"
        });
    }

    await loadUserData();

    const authBtn = document.querySelector('.auth-btn');
    if(authBtn) {
        authBtn.innerText = `👤 ${user.toUpperCase()}`;
        authBtn.setAttribute('onclick', "handleProfileNav()");
    }

    const pUserDisplay = document.getElementById("profileUsernameDisplay");
    if(pUserDisplay) pUserDisplay.innerText = user.toUpperCase();

    const roleBadge = document.getElementById("profileRoleBadge");
    if(userData.isAdmin) {
        isKurucuActive = true;
        if(roleBadge) {
            roleBadge.innerText = "👑 KURUCU / ADMIN";
            roleBadge.classList.add("kurucu-trigger");
            roleBadge.setAttribute("onclick", "openModal('adminPanelModal')");
        }
        alert(`Sisteme Kurucu olarak giriş yaptınız! Hoş geldin flexy 👑`);
    } else {
        isKurucuActive = false;
        if(roleBadge) {
            roleBadge.innerText = "Üye";
            roleBadge.classList.remove("kurucu-trigger");
            roleBadge.removeAttribute("onclick");
        }
        alert(type === 'login'? `Başarıyla giriş yapıldı: ${user} 🎉` : `Hesap başarıyla açıldı: ${user} 📝`);
    }

    userEl.value = "";
    passEl.value = "";
    closeModal('loginModal');
    showPage('my-profile-page');
};

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
// ROZET SEÇME SİSTEMİ - YENİ
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
            <span>${badgeData? badgeData.icon : '🏅'} ${badgeName}</span>
            <button class="use-badge-btn" onclick="selectBadge('${badgeName}')">
                ${isActive? '✓ Kullanılıyor' : 'Kullan'}
            </button>
        `;
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
            <span class="badge-icon">${badge.icon}</span>
            <h3>${badge.name}</h3>
            <p class="price">Fiyat: ${badge.price} ${badge.type === 'gold'? 'Gold 🪙' : 'Gem 💎'}</p>
            <button class="action-btn" onclick="buyBadge('${badge.id}', '${badge.name}', ${badge.price}, '${badge.type}')">Satın Al</button>
        `;
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
            <span>${badge.icon} ${badge.name}</span>
            <button class="remove-liked-btn" onclick="deleteBadgeFromMarket('${badge.id}')"><i class="fa-solid fa-trash"></i></button>
        `;
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
            <span>⚙️ ${item.name}</span>
            <button class="remove-liked-btn" onclick="deleteEquipmentFromSystem('${item.id}')"><i class="fa-solid fa-trash"></i></button>
        `;
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
// FORUM
// ==========================================
function renderForumTopics() {
    const list = document.getElementById("forumTopicsList");
    if(!list) return;
    list.innerHTML = "";
    forumTopics.forEach(topic => {
        const newCard = document.createElement("div");
        newCard.className = "topic-card";
        newCard.innerHTML = `
            <h3>${topic.title}</h3>
            <p class="topic-meta">👤 Yazar: ${topic.author} | 📅 ${new Date(topic.timestamp?.toDate()).toLocaleDateString()}</p>
            <p class="topic-preview-text">${topic.content}</p>
            <button class="read-btn" onclick="toggleReadForum(this)">📖 Oku / Cevapları Gör</button>
            <div class="forum-answers-area" style="display: none;">
                <div class="answers-list" id="answers-${topic.id}"></div>
                <div class="answer-input-zone">
                    <input type="text" placeholder="Cevabını yaz...">
                    <button onclick="addAnswerToTopic('${topic.id}', this)">Gönder</button>
                </div>
            </div>
        `;
        list.appendChild(newCard);
        loadAnswers(topic.id);
    });
}

async function loadAnswers(topicId) {
    const db = window.db;
    const answersList = document.getElementById(`answers-${topicId}`);
    if(!answersList) return;

    onSnapshot(query(collection(db, "forum", topicId, "answers"), orderBy("timestamp", "asc")), (snapshot) => {
        answersList.innerHTML = "";
        snapshot.forEach(doc => {
            const data = doc.data();
            const newItem = document.createElement("div");
            newItem.className = "answer-item";
            newItem.innerHTML = `<strong>@${data.author}:</strong> ${data.text}`;
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
// VİTRİNLER
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
        card.innerHTML = `
            <h3 style="color:#9b51e0;">🎬 ${item.title}</h3>
            <p class="topic-meta">👤 Yükleyen: ${item.author}</p>
            <p class="equip-desc">${item.desc}</p>
            <a href="${item.link || '#'}" target="_blank" class="read-btn" style="display:inline-block; border-color:#9b51e0; color:#9b51e0; text-decoration:none; margin-top:10px;">Videoyu/Detayı Gör</a>
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
// CHAT
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
            <i class="fa-regular fa-heart favorite-icon" onclick="toggleFavorite(this, '${item.name}')"></i>
            <img src="${item.foto_url}" alt="${item.name}" class="equip-img">
            <h3>${item.name}</h3>
            <p class="equip-desc">${item.desc}</p>
            <a href="${item.link}" target="_blank" class="action-btn" style="display:block; text-decoration:none; line-height:36px; text-align:center;">İncele</a>
        `;
        grid.appendChild(card);
    });
}
