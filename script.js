document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const playerSetupModal = document.getElementById('player-setup-modal');
    const exhibitionContainer = document.getElementById('exhibition-container');
    const playerNameInput = document.getElementById('player-name');
    const avatarSelectionContainer = document.getElementById('avatar-selection');
    const startBtn = document.getElementById('start-exhibition-btn');
    const map = document.getElementById('exhibition-map');
    const countdownTimerEl = document.getElementById('countdown-timer');

    const boothModal = document.getElementById('booth-modal');
    const boothModalBody = document.getElementById('booth-modal-body');
    const closeBoothModalBtn = document.getElementById('close-booth-modal-btn');

    // --- Game State ---
    let player = {
        id: 'player',
        name: '訪客',
        avatar: '',
        element: null
    };
    let characters = []; // Includes player and NPCs
    let booths = [];
    let avatars = [];
    const GRID_CELL_SIZE = 100; // 100px

    // --- Initialization ---
    async function initialize() {
        await loadAllData();
        setupPlayerModal();
        setupEventListeners();
        startCountdown();
    }

    async function loadAllData() {
        try {
            const [avatarsData, boothsData, npcsData] = await Promise.all([
                fetch('./data/avatars.json').then(res => res.json()),
                fetch('./data/booths.json').then(res => res.json()),
                fetch('./data/npcs.json').then(res => res.json())
            ]);
            avatars = avatarsData;
            booths = boothsData;
            characters = npcsData.map(npc => ({...npc, type: 'npc'}));
        } catch (error) {
            console.error("Failed to load data:", error);
            alert("資料載入失敗，請重新整理頁面。");
        }
    }

    function setupPlayerModal() {
        avatars.forEach(avatar => {
            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'avatar-option';
            avatarDiv.dataset.avatarId = avatar.id;
            avatarDiv.dataset.avatarSrc = avatar.image;
            avatarDiv.innerHTML = `
                <img src="${avatar.image}" alt="${avatar.name}">
                <span class="avatar-tooltip">${avatar.description}</span>
            `;
            avatarDiv.addEventListener('click', () => {
                document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
                avatarDiv.classList.add('selected');
                player.avatar = avatar.image;
            });
            avatarSelectionContainer.appendChild(avatarDiv);
        });
        // Select first avatar by default
        const firstAvatar = avatarSelectionContainer.querySelector('.avatar-option');
        if(firstAvatar) {
            firstAvatar.click();
        }
    }
    
    function setupEventListeners() {
        startBtn.addEventListener('click', startGame);
        map.addEventListener('click', handleMapClick);
        closeBoothModalBtn.addEventListener('click', closeBoothModal);
    }
    
    // --- Game Flow ---
    function startGame() {
        const playerName = playerNameInput.value.trim();
        if (playerName) {
            player.name = playerName;
        }
        if (!player.avatar) {
            alert('請選擇一個頭像！');
            return;
        }

        playerSetupModal.classList.remove('active');
        exhibitionContainer.classList.remove('hidden');

        spawnPlayer();
        renderAll();
        startNpcBehavior();
    }
    
    function spawnPlayer() {
        // Find a random empty spot to spawn
        let spawnX, spawnY, isOccupied;
        do {
            spawnX = Math.floor(Math.random() * 15);
            spawnY = Math.floor(Math.random() * 10);
            isOccupied = booths.some(b => 
                spawnX >= b.position.x && spawnX < b.position.x + b.size.width &&
                spawnY >= b.position.y && spawnY < b.position.y + b.size.height
            );
        } while (isOccupied);

        player.position = { x: spawnX, y: spawnY };
        characters.push({ ...player, type: 'player' });
    }

    // --- Rendering ---
    function renderAll() {
        map.innerHTML = ''; // Clear map
        renderBooths();
        renderCharacters();
    }

    function renderBooths() {
        booths.forEach(booth => {
            const boothEl = document.createElement('div');
            boothEl.className = 'booth';
            boothEl.style.left = `${booth.position.x * GRID_CELL_SIZE}px`;
            boothEl.style.top = `${booth.position.y * GRID_CELL_SIZE}px`;
            boothEl.style.width = `${booth.size.width * GRID_CELL_SIZE}px`;
            boothEl.style.height = `${booth.size.height * GRID_CELL_SIZE}px`;
            boothEl.innerHTML = `
                <img src="${booth.posterImage}" alt="${booth.name}" class="booth-poster">
                <div class="booth-name">${booth.name}</div>
            `;
            boothEl.addEventListener('click', (e) => {
                e.stopPropagation();
                openBoothModal(booth);
            });
            map.appendChild(boothEl);
        });
    }

    function renderCharacters() {
        characters.forEach(char => {
            const charEl = document.createElement('div');
            charEl.className = 'character';
            charEl.id = char.id;
             if(char.type === 'player'){
                charEl.classList.add('user-player');
            }
            charEl.style.left = `${char.position.x * GRID_CELL_SIZE + (GRID_CELL_SIZE - 50) / 2}px`;
            charEl.style.top = `${char.position.y * GRID_CELL_SIZE + (GRID_CELL_SIZE - 50) / 2}px`;
            
            charEl.innerHTML = `
                <div class="character-name">${char.name}</div>
                <img src="${char.avatar || char.image}" alt="${char.name}">
                <div class="character-speech-bubble" id="speech-${char.id}"></div>
            `;
            map.appendChild(charEl);

            if(char.type === 'player') {
                player.element = charEl;
            }
        });
    }

    // --- Player & NPC Movement ---
    function handleMapClick(e) {
        if (!player.element) return;
        const rect = map.getBoundingClientRect();
        const clickX = e.clientX - rect.left + map.scrollLeft;
        const clickY = e.clientY - rect.top + map.scrollTop;

        const targetGridX = Math.floor(clickX / GRID_CELL_SIZE);
        const targetGridY = Math.floor(clickY / GRID_CELL_SIZE);

        // Check if target is a booth, if so, do not move character on top of it.
        const isBooth = booths.some(b => 
            targetGridX >= b.position.x && targetGridX < b.position.x + b.size.width &&
            targetGridY >= b.position.y && targetGridY < b.position.y + b.size.height
        );
        if(isBooth) return; // Or handle walking to the booth entrance

        moveCharacter(player.id, { x: targetGridX, y: targetGridY });
    }

    function moveCharacter(charId, newPos) {
        const character = characters.find(c => c.id === charId);
        const charEl = document.getElementById(charId);
        if (character && charEl) {
            character.position = newPos;
            charEl.style.left = `${newPos.x * GRID_CELL_SIZE + (GRID_CELL_SIZE - 50) / 2}px`;
            charEl.style.top = `${newPos.y * GRID_CELL_SIZE + (GRID_CELL_SIZE - 50) / 2}px`;
        }
    }
    
    function startNpcBehavior() {
        characters.filter(c => c.type === 'npc').forEach(npc => {
            // NPC Patrol
            if (npc.patrolPoints && npc.patrolPoints.length > 0) {
                let currentPatrolIndex = 0;
                setInterval(() => {
                    currentPatrolIndex = (currentPatrolIndex + 1) % npc.patrolPoints.length;
                    moveCharacter(npc.id, npc.patrolPoints[currentPatrolIndex]);
                }, 5000 + Math.random() * 2000); // Patrol every 5-7 seconds
            }
            // NPC Dialogue
            if (npc.dialogue && npc.dialogue.length > 0) {
                 setInterval(() => {
                    const speechBubble = document.getElementById(`speech-${npc.id}`);
                    if (speechBubble) {
                        const message = npc.dialogue[Math.floor(Math.random() * npc.dialogue.length)];
                        speechBubble.textContent = message;
                        speechBubble.style.opacity = '1';
                        setTimeout(() => { speechBubble.style.opacity = '0'; }, 4000);
                    }
                }, 8000 + Math.random() * 5000); // Speak every 8-13 seconds
            }
        });
    }

    // --- Booth Modal ---
    function openBoothModal(booth) {
        let linksHtml = '';
        if (booth.links && booth.links.length > 0) {
            linksHtml = `
                <div class="booth-links">
                    <h3>相關連結</h3>
                    ${booth.links.map(link => `<a href="${link.url}" target="_blank">${link.title}</a>`).join('')}
                </div>`;
        }
        
        let galleryHtml = '<p>此攤位尚未上傳圖片</p>';
        if (booth.images && booth.images.length > 0) {
            galleryHtml = `
                <div class="gallery-grid">
                    ${booth.images.map(img => `
                        <div class="gallery-item">
                            <img src="${img.url}" alt="${img.caption || ''}">
                            <p>${img.caption || ''}</p>
                        </div>
                    `).join('')}
                </div>`;
        }

        let videoHtml = '';
        if(booth.videoUrl){
            videoHtml = `
                <div class="booth-video">
                    <iframe src="${booth.videoUrl}" title="${booth.name} 影片" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                </div>`;
        }

        boothModalBody.innerHTML = `
            <div class="booth-header">
                <h2>${booth.name} <span class="category-badge">${booth.category}</span></h2>
                <p>${booth.shortDescription}</p>
            </div>
            
            <div class="booth-tabs">
                <button class="tab-btn active" data-tab="info">展覽資訊</button>
                <button class="tab-btn" data-tab="gallery">圖片集</button>
            </div>

            <div id="tab-info" class="tab-content active">
                ${videoHtml}
                <div class="booth-description">${booth.description}</div>
                ${linksHtml}
            </div>
            <div id="tab-gallery" class="tab-content">
                ${galleryHtml}
            </div>
        `;
        
        boothModal.classList.add('active');

        // Add event listeners for tabs
        boothModalBody.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                boothModalBody.querySelector('.tab-btn.active').classList.remove('active');
                boothModalBody.querySelector('.tab-content.active').classList.remove('active');
                btn.classList.add('active');
                document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
            });
        });
    }

    function closeBoothModal() {
        boothModal.classList.remove('active');
        boothModalBody.innerHTML = '';
    }
    
    // --- Utils ---
    function startCountdown() {
        const eventEndDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
        
        function updateTimer() {
            const difference = eventEndDate.getTime() - new Date().getTime();
            if (difference > 0) {
                const days = Math.floor(difference / (1000 * 60 * 60 * 24));
                const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
                const minutes = Math.floor((difference / 1000 / 60) % 60);
                const seconds = Math.floor((difference / 1000) % 60);
                countdownTimerEl.textContent = `活動倒數：${days}天 ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            } else {
                 countdownTimerEl.textContent = "活動已結束";
                 clearInterval(timerInterval);
            }
        }

        updateTimer();
        const timerInterval = setInterval(updateTimer, 1000);
    }

    // --- Start the app ---
    initialize();
});