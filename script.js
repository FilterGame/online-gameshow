document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const playerSetupModal = document.getElementById('player-setup-modal');
    const exhibitionContainer = document.getElementById('exhibition-container');
    const playerNameInput = document.getElementById('player-name');
    const avatarSelectionContainer = document.getElementById('avatar-selection');
    const startBtn = document.getElementById('start-exhibition-btn');
    const mapContainer = document.querySelector('.map-container'); // The "camera"
    const map = document.getElementById('exhibition-map'); // The "world"
    const countdownTimerEl = document.getElementById('countdown-timer');
    const boothModal = document.getElementById('booth-modal');
    const boothModalBody = document.getElementById('booth-modal-body');
    const closeBoothModalBtn = document.getElementById('close-booth-modal-btn');

    // --- Constants ---
    const GRID_CELL_SIZE = 100;
    const CHARACTER_SPEED = 200; // Pixels per second

    // --- Game State ---
    let player = {};
    let characters = [];
    let booths = [];
    let avatars = [];

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
            
            npcsData.forEach(npc => {
                 characters.push({
                    ...npc,
                    type: 'npc',
                    position: { ...npc.position }, // Grid position
                    currentPixelPos: { x: npc.position.x * GRID_CELL_SIZE, y: npc.position.y * GRID_CELL_SIZE },
                    animationFrameId: null
                });
            });

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
        const firstAvatar = avatarSelectionContainer.querySelector('.avatar-option');
        if (firstAvatar) firstAvatar.click();
    }

    function setupEventListeners() {
        startBtn.addEventListener('click', startGame);
        map.addEventListener('click', handleMapClick);
        closeBoothModalBtn.addEventListener('click', closeBoothModal);
    }

    // --- Game Flow ---
    function startGame() {
        player.name = playerNameInput.value.trim() || '訪客';
        if (!player.avatar) {
            alert('請選擇一個頭像！');
            return;
        }

        playerSetupModal.classList.remove('active');
        exhibitionContainer.classList.remove('hidden');

        spawnPlayer();
        renderAll();
        startNpcBehavior();
        centerCameraOnPlayer(); // Initial camera position
    }

    function spawnPlayer() {
        let spawnX, spawnY, isOccupied;
        do {
            spawnX = Math.floor(Math.random() * (map.clientWidth / GRID_CELL_SIZE));
            spawnY = Math.floor(Math.random() * (map.clientHeight / GRID_CELL_SIZE));
            isOccupied = booths.some(b =>
                spawnX >= b.position.x && spawnX < b.position.x + b.size.width &&
                spawnY >= b.position.y && spawnY < b.position.y + b.size.height
            );
        } while (isOccupied);
        
        player = {
            ...player,
            id: 'player',
            type: 'player',
            position: { x: spawnX, y: spawnY },
            currentPixelPos: { x: spawnX * GRID_CELL_SIZE, y: spawnY * GRID_CELL_SIZE },
            animationFrameId: null
        };
        characters.push(player);
    }

    // --- Rendering ---
    function renderAll() {
        map.innerHTML = '';
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
            if (char.type === 'player') charEl.classList.add('user-player');
            
            const charSize = 50;
            const pixelX = char.currentPixelPos.x + (GRID_CELL_SIZE - charSize) / 2;
            const pixelY = char.currentPixelPos.y + (GRID_CELL_SIZE - charSize) / 2;

            charEl.style.transform = `translate(${pixelX}px, ${pixelY}px)`;

            charEl.innerHTML = `
                <div class="character-name">${char.name}</div>
                <img src="${char.avatar || char.image}" alt="${char.name}">
                <div class="character-speech-bubble" id="speech-${char.id}"></div>
            `;
            map.appendChild(charEl);
            char.element = charEl;
        });
    }

    // --- Camera Control ---
    function centerCameraOnPlayer() {
        if (!player || !player.currentPixelPos) return;

        const playerCenterX = player.currentPixelPos.x + GRID_CELL_SIZE / 2;
        const playerCenterY = player.currentPixelPos.y + GRID_CELL_SIZE / 2;
        
        const viewportWidth = mapContainer.clientWidth;
        const viewportHeight = mapContainer.clientHeight;

        let targetX = playerCenterX - viewportWidth / 2;
        let targetY = playerCenterY - viewportHeight / 2;

        // Clamp camera to map boundaries
        targetX = Math.max(0, Math.min(targetX, map.scrollWidth - viewportWidth));
        targetY = Math.max(0, Math.min(targetY, map.scrollHeight - viewportHeight));
        
        mapContainer.scrollLeft = targetX;
        mapContainer.scrollTop = targetY;
    }

    // --- Character Movement (ANIMATED) ---
    function moveTo(charId, targetPixelPos) {
        const character = characters.find(c => c.id === charId);
        if (!character) return;

        const startPos = { ...character.currentPixelPos };
        const distance = Math.sqrt(Math.pow(targetPixelPos.x - startPos.x, 2) + Math.pow(targetPixelPos.y - startPos.y, 2));
        if (distance < 1) return;

        const duration = (distance / CHARACTER_SPEED) * 1000;
        let startTime = null;

        if (character.animationFrameId) {
            cancelAnimationFrame(character.animationFrameId);
        }

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / duration, 1);

            character.currentPixelPos.x = startPos.x + (targetPixelPos.x - startPos.x) * progress;
            character.currentPixelPos.y = startPos.y + (targetPixelPos.y - startPos.y) * progress;

            const charSize = 50;
            const pixelX = character.currentPixelPos.x + (GRID_CELL_SIZE - charSize) / 2;
            const pixelY = character.currentPixelPos.y + (GRID_CELL_SIZE - charSize) / 2;
            character.element.style.transform = `translate(${pixelX}px, ${pixelY}px)`;
            
            if (character.type === 'player') {
                centerCameraOnPlayer();
            }

            if (progress < 1) {
                character.animationFrameId = requestAnimationFrame(step);
            } else {
                character.position = {
                    x: Math.round(character.currentPixelPos.x / GRID_CELL_SIZE),
                    y: Math.round(character.currentPixelPos.y / GRID_CELL_SIZE),
                };
                character.animationFrameId = null;
            }
        }

        character.animationFrameId = requestAnimationFrame(step);
    }
    
    // --- CORRECTED: Click Handling ---
    function handleMapClick(e) {
        if (!player.element || player.animationFrameId) return; // Prevent clicking while moving

        // Use offsetX/offsetY for accurate coordinates relative to the map element
        const clickX = e.offsetX;
        const clickY = e.offsetY;

        let targetGridX = Math.floor(clickX / GRID_CELL_SIZE);
        let targetGridY = Math.floor(clickY / GRID_CELL_SIZE);
        
        // --- ADDED: Boundary check ---
        const mapWidthInGrids = Math.floor(map.clientWidth / GRID_CELL_SIZE);
        const mapHeightInGrids = Math.floor(map.clientHeight / GRID_CELL_SIZE);
        targetGridX = Math.max(0, Math.min(targetGridX, mapWidthInGrids - 1));
        targetGridY = Math.max(0, Math.min(targetGridY, mapHeightInGrids - 1));

        // Check if target is a booth
        const isBooth = booths.some(b =>
            targetGridX >= b.position.x && targetGridX < b.position.x + b.size.width &&
            targetGridY >= b.position.y && targetGridY < b.position.y + b.size.height
        );
        if (isBooth) return;

        moveTo(player.id, { x: targetGridX * GRID_CELL_SIZE, y: targetGridY * GRID_CELL_SIZE });
    }
    
    // --- NPC Behavior ---
    function startNpcBehavior() {
        characters.filter(c => c.type === 'npc').forEach(npc => {
            if (npc.patrolPoints && npc.patrolPoints.length > 0) {
                let currentPatrolIndex = 0;
                const patrol = () => {
                    if (npc.animationFrameId === null) {
                        currentPatrolIndex = (currentPatrolIndex + 1) % npc.patrolPoints.length;
                        const targetPoint = npc.patrolPoints[currentPatrolIndex];
                        moveTo(npc.id, { x: targetPoint.x * GRID_CELL_SIZE, y: targetPoint.y * GRID_CELL_SIZE });
                    }
                };
                setInterval(patrol, 5000 + Math.random() * 3000);
            }
            if (npc.dialogue && npc.dialogue.length > 0) {
                 setInterval(() => {
                    const speechBubble = document.getElementById(`speech-${npc.id}`);
                    if (speechBubble) {
                        const message = npc.dialogue[Math.floor(Math.random() * npc.dialogue.length)];
                        speechBubble.textContent = message;
                        speechBubble.style.opacity = '1';
                        setTimeout(() => { speechBubble.style.opacity = '0'; }, 4000);
                    }
                }, 8000 + Math.random() * 5000);
            }
        });
    }

    // --- Booth Modal (No significant changes) ---
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
    
    // --- Utils (No changes) ---
    function startCountdown() {
        // Since it's 2025, let's set a future date.
        const eventEndDate = new Date('2025-08-01T00:00:00');
        
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
                 if(timerInterval) clearInterval(timerInterval);
            }
        }

        const timerInterval = setInterval(updateTimer, 1000);
        updateTimer();
    }

    // --- Start the app ---
    initialize();
});