let levels = [];
let currentLevelId = null;
let currentLevel = null;
let playerPos = { x: 0, y: 0 };
let completedLevels = [];
let canvas, ctx;
let pushableBlocks = [];
let orbs = [];
let gameRunning = false;
// Ice support removed — blocks still animate; we use blocksSliding to block input
let blocksSliding = false; // whether blocks are currently moving/animating (prevents player input)
let playerRender = { xPos: 0, yPos: 0, startX: 0, startY: 0, destX: 0, destY: 0, moving: false, animProgress: 0, animDuration: 0.12, speed: 0 }; // pixels/s

// Mobile tap-to-move selection state
let playerSelected = false;
let moveHighlights = []; // array of {x,y} tiles that are valid moves when player is selected
let selectionLocked = false; // true while a move is in progress and highlights shouldn't be cleared
let moveInProgress = false; // guard to prevent overlapping move actions
let keyHandlerAttached = false; // whether we attached the keydown handler (avoid duplicates)
let canvasHandlerAttached = false; // whether canvas pointer handler is attached (attach once globally)

// Backward-compat fallback: no-op wait helper so older/cached code paths don't throw
if (typeof window !== 'undefined' && typeof window.waitForBlocksToFinish !== 'function') {
    window.waitForBlocksToFinish = function(chain) { return Promise.resolve(); };
}

// Attach the canvas pointer handler once at script init (prevents duplicate handlers across levels)
(function attachCanvasGlobal() {
    function tryAttach() {
        const c = document.getElementById('canvas');
        if (c && !canvasHandlerAttached) {
            canvas = c;
            ctx = canvas.getContext('2d');
            canvas.addEventListener('pointerdown', canvasPointerDown);
            canvasHandlerAttached = true;
            console.debug('attachCanvasGlobal: canvas pointerdown handler attached');
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        tryAttach();
    } else {
        document.addEventListener('DOMContentLoaded', tryAttach);
    }
})();

const TILE_SIZE = 40;
// assign dependent speeds after constants are initialized
playerRender.speed = TILE_SIZE * 8; // kept for compatibility if needed
const TILE_TYPES = {
    EMPTY: 0,
    WALL: 1,
    WATER: 2,
    BLOCK: 3,
    GOAL: 4,
    LAVA: 6
};

const COLORS = {
    EMPTY: '#000000',
    WALL: '#666666',
    WATER: '#0066CC',
    WATER_WITH_BLOCK: '#BB4400',
    BLOCK: '#ff8800',
    GOAL: '#00FF00',
    PLAYER: '#00CCFF',
    ORB: '#FF2222',
    GRID: '#222222',
    LAVA: '#cc3300'
};

class PushableBlock {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        // Short animation between tile steps (gives non-teleport feel)
        this.moving = false;
        this.startX = this.x;
        this.startY = this.y;
        this.destX = this.x;
        this.destY = this.y;
        this.animDuration = 0.12; // seconds for per-tile animation
        this.animProgress = 0;
    }

    // Request one discrete step (animates between tiles)
    stepOnce(dx, dy) {
        if (this.moving) return; // already moving
        this.startX = this.x;
        this.startY = this.y;
        this.destX = this.x + dx;
        this.destY = this.y + dy;
        this.animProgress = 0;
        this.moving = true;
    }

    // dt in seconds
    update(dt) {
        if (!this.moving) return;
        this.animProgress += dt;
        const t = Math.min(this.animProgress / this.animDuration, 1);
        if (t >= 1) {
            // Snap to destination
            this.moving = false;
            this.x = this.destX;
            this.y = this.destY;

            // Arrival interactions
            if (!currentLevel || !currentLevel.tiles) return;
            if (this.y < 0 || this.y >= currentLevel.height || this.x < 0 || this.x >= currentLevel.width) {
                // Out of bounds: remove block just in case
                const idx = pushableBlocks.indexOf(this);
                if (idx !== -1) pushableBlocks.splice(idx, 1);
                return;
            }

            const tile = currentLevel.tiles[this.y][this.x];

            if (tile === TILE_TYPES.WATER) {
                // Falls into water and creates a bridge
                const idx = pushableBlocks.indexOf(this);
                if (idx !== -1) pushableBlocks.splice(idx, 1);
                currentLevel.tiles[this.y][this.x] = TILE_TYPES.EMPTY;
                return;
            }

            if (tile === TILE_TYPES.LAVA) {
                // Falls into lava and disappears
                const idx = pushableBlocks.indexOf(this);
                if (idx !== -1) pushableBlocks.splice(idx, 1);
                return;
            }

            // Update game state checks after arrival
            moveOrbs();
            checkCollisions();
            checkWin();
        }
    }

    // draw helper: returns pixel pos
    getRenderPos() {
        if (this.moving) {
            const t = Math.min(this.animProgress / this.animDuration, 1);
            const sx = this.startX * TILE_SIZE;
            const sy = this.startY * TILE_SIZE;
            const dx = (this.destX * TILE_SIZE) - sx;
            const dy = (this.destY * TILE_SIZE) - sy;
            return { x: sx + dx * t, y: sy + dy * t };
        }
        return { x: this.x * TILE_SIZE, y: this.y * TILE_SIZE };
    }
} 

let moveHistory = [];

class Orb {
    constructor(data = {}) {
        // data: { x, y, seq: ['w','s','wait'], idx }
        if (Array.isArray(data.waypoints) && data.waypoints.length > 0) {
            // Backward compat: take first waypoint as starting pos
            this.x = data.waypoints[0][0];
            this.y = data.waypoints[0][1];
        } else {
            this.x = Number.isFinite(data.x) ? data.x : 0;
            this.y = Number.isFinite(data.y) ? data.y : 0;
        }
        this.seq = Array.isArray(data.seq) ? data.seq.slice() : (data.seq ? [data.seq] : []);
        this.idx = Number.isFinite(data.idx) ? data.idx : 0; // next command index
    }

    // Execute a single command from the sequence (one player move triggers one orb step)
    step(pushableBlocksRef, currentLevelRef, otherOrbs) {
        if (!this.seq || this.seq.length === 0) return;
        const cmd = this.seq[this.idx % this.seq.length];
        this.idx = (this.idx + 1) % this.seq.length;
        if (!cmd) return;
        const c = cmd.toLowerCase().trim();
        if (c === 'wait') return;
        const deltas = { w: {dx:0,dy:-1}, s: {dx:0,dy:1}, a: {dx:-1,dy:0}, d: {dx:1,dy:0} };
        if (!deltas[c]) return;
        const dx = deltas[c].dx, dy = deltas[c].dy;
        const nx = this.x + dx, ny = this.y + dy;
        if (!currentLevelRef) return;
        // bounds / walls
        if (nx < 0 || nx >= currentLevelRef.width || ny < 0 || ny >= currentLevelRef.height) return;
        const tile = currentLevelRef.tiles[ny][nx];
        if (tile === TILE_TYPES.WALL) return;
        // don't move into blocks
        const hasBlock = pushableBlocksRef.find(b => b.x === nx && b.y === ny);
        if (hasBlock) return;
        // don't move into other orbs
        const collisionOrb = otherOrbs.find(o => o !== this && o.x === nx && o.y === ny);
        if (collisionOrb) return;
        // allowed: move
        this.x = nx; this.y = ny;
    }

    // serialize state for save/undo
    toJSON() {
        return { x: this.x, y: this.y, seq: this.seq.slice(), idx: this.idx };
    }

    // Simple collision check against player coords
    checkCollision(px, py) {
        return this.x === px && this.y === py;
    }
}

async function loadLevels() {
    try {
        // If launched from editor (test), the editor sets localStorage.testLevel and adds ?test=1 to the URL
        const params = new URLSearchParams(window.location.search);
        if (params.has('test') && localStorage.getItem('testLevel')) {
            try {
                const obj = JSON.parse(localStorage.getItem('testLevel'));
                if (obj && Array.isArray(obj.levels) && obj.levels.length > 0) {
                    levels = obj.levels;
                    console.log('Loaded test level from editor:', levels);
                    // Start the test level immediately
                    startLevel(0);
                    // remove test payload to avoid accidental reuse
                    localStorage.removeItem('testLevel');
                    return;
                }
            } catch (e) {
                console.warn('Failed to parse testLevel from localStorage', e);
            }
        }

        const response = await fetch('levels.json?v=' + new Date().getTime());
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        levels = data.levels;
        console.log('Levels loaded:', levels);
        setupLevelSelect();
    } catch (error) {
        console.error('Error loading levels:', error);
        // Fallback levels or error message could be shown here
    }
} 

function setupLevelSelect() {
    const container = document.getElementById('levelSelect');
    container.innerHTML = '';
    
    levels.forEach((level, index) => {
        const btn = document.createElement('button');
        btn.className = 'levelButton';
        btn.textContent = `${index + 1}`;
        btn.title = level.name;
        
        const isCompleted = completedLevels.includes(index);
        // Level is available if it's the first level OR the previous level is completed
        const isAvailable = index === 0 || completedLevels.includes(index - 1);
        
        if (isCompleted) {
            btn.classList.add('completed');
        } else if (isAvailable) {
            btn.classList.add('available');
        } else {
            btn.disabled = true;
        }
        
        if (isAvailable) {
            btn.onclick = () => startLevel(index);
        }
        
        container.appendChild(btn);
    });
}

function startLevel(levelId) {
    currentLevelId = levelId;
    currentLevel = JSON.parse(JSON.stringify(levels[levelId]));
    
    // Reset move guard on level start
    moveInProgress = false;
    selectionLocked = false;
    blocksSliding = false;

    // Ensure per-level move distance is defined and sensible (default 1)
    currentLevel.moveDistance = Number.isFinite(currentLevel.moveDistance) && currentLevel.moveDistance > 0 ? Math.floor(currentLevel.moveDistance) : 1;
    
    if (!currentLevel || !currentLevel.playerStart || currentLevel.playerStart.length < 2) {
        console.error('Invalid level or playerStart:', currentLevel);
        currentLevel.playerStart = [0, 0];
    }
    
    const startX = Number.isFinite(parseInt(currentLevel.playerStart[0])) ? parseInt(currentLevel.playerStart[0]) : 0;
    const startY = Number.isFinite(parseInt(currentLevel.playerStart[1])) ? parseInt(currentLevel.playerStart[1]) : 0;
    
    console.log('Parsed start pos:', startX, startY, 'from:', currentLevel.playerStart);
    
    playerPos = { x: startX, y: startY };
    
    moveHistory = []; // Reset history
    sliding = false; // reset sliding state on level start
    slideDir = { dx: 0, dy: 0 };
    playerRender.xPos = playerPos.x * TILE_SIZE;
    playerRender.yPos = playerPos.y * TILE_SIZE;
    playerRender.destX = playerPos.x;
    playerRender.destY = playerPos.y;
    playerRender.moving = false;
    
    // Validate player position
    if (!Number.isFinite(playerPos.x) || !Number.isFinite(playerPos.y)) {
        console.error('Invalid player start position detected, resetting to 0,0');
        playerPos = { x: 0, y: 0 };
    }
    
    gameRunning = true;
    
    // Attach key handler at level start (remove any previous and reattach to avoid duplicates)
    try {
        if (keyHandlerAttached) {
            document.removeEventListener('keydown', handleKeyPress);
            keyHandlerAttached = false;
            console.debug('startLevel: removed previous key handler');
        }
        document.addEventListener('keydown', handleKeyPress);
        keyHandlerAttached = true;
        console.debug('startLevel: keydown handler attached');
    } catch (e) {
        console.warn('startLevel: failed to attach key handler', e);
    }

    console.log('Starting level', levelId, 'Player at:', playerPos, 'Map size:', currentLevel.width, 'x', currentLevel.height);
    console.log('Game version: 1.1 (Safe Spawn)');
    
    // Ensure canvas exists and context is valid
    if (!canvas || !ctx) {
        canvas = document.getElementById('canvas');
        if (!canvas) {
            console.error('Canvas element not found in DOM. Aborting level start.');
            return;
        }
        ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('2D context not available. Aborting level start.');
            return;
        }
    }

    pushableBlocks = [];
    for (let y = 0; y < currentLevel.height; y++) {
        for (let x = 0; x < currentLevel.width; x++) {
            if (currentLevel.tiles[y][x] === TILE_TYPES.BLOCK) {
                pushableBlocks.push(new PushableBlock(x, y));
                currentLevel.tiles[y][x] = TILE_TYPES.EMPTY;
            }
        }
    }
    
    // If player is at 0,0 and it's a wall, find a safe spot
    if (playerPos.x === 0 && playerPos.y === 0 && currentLevel.tiles[0][0] === TILE_TYPES.WALL) {
        console.warn('Player spawn is WALL, searching for empty tile...');
        outerLoop:
        for (let y = 0; y < currentLevel.height; y++) {
            for (let x = 0; x < currentLevel.width; x++) {
                if (currentLevel.tiles[y][x] === TILE_TYPES.EMPTY) {
                    playerPos.x = x;
                    playerPos.y = y;
                    console.log('Found safe spawn at:', x, y);
                    break outerLoop;
                }
            }
        }
    }

    orbs = (currentLevel.orbs || []).map(orbData => new Orb(orbData));
    
    document.getElementById('levelSelectWrapper').style.display = 'none';
    document.getElementById('gameView').classList.add('active');
    document.getElementById('levelInfo').textContent = `Level ${levelId + 1}: ${currentLevel.name}`;
    const instrEl = document.getElementById('levelInstructions');
    if (instrEl) instrEl.textContent = currentLevel.instructions || '';
    
    // canvas and ctx should already be available here
    if (!canvas || !ctx) {
        console.error('Canvas or context missing after activation. Aborting.');
        return;
    }
    
    canvas.width = currentLevel.width * TILE_SIZE;
    canvas.height = currentLevel.height * TILE_SIZE;
    
    setupInputs();
    gameLoop();
}

function getCanvasTileFromEvent(e) {
    const canvasRect = canvas.getBoundingClientRect();
    const cx = e.clientX - canvasRect.left;
    const cy = e.clientY - canvasRect.top;
    const tx = Math.floor(cx / TILE_SIZE);
    const ty = Math.floor(cy / TILE_SIZE);
    if (!currentLevel) return null;
    if (tx < 0 || tx >= currentLevel.width || ty < 0 || ty >= currentLevel.height) return null;
    return { x: tx, y: ty };
}

function computeMoveHighlights() {
    moveHighlights = [];
    if (!currentLevel) return;

    const maxSteps = Number.isFinite(currentLevel.moveDistance) && currentLevel.moveDistance > 0 ? Math.floor(currentLevel.moveDistance) : 1;
    const dirs = [ {dx:0,dy:-1}, {dx:0,dy:1}, {dx:-1,dy:0}, {dx:1,dy:0} ];

    // Helper to check pushability against simulated blocks/tiles
    const canPushInSim = (tx, ty, simBlocks, simTiles) => {
        if (tx < 0 || tx >= currentLevel.width || ty < 0 || ty >= currentLevel.height) return false;
        const tile = simTiles[ty][tx];
        const hasBlock = simBlocks.some(b => b.x === tx && b.y === ty);
        return (tile === TILE_TYPES.EMPTY || tile === TILE_TYPES.WATER || tile === TILE_TYPES.GOAL || tile === TILE_TYPES.LAVA) && !hasBlock;
    };

    dirs.forEach(d => {
        // create simulation copies so we can reason multiple steps ahead
        const simBlocks = pushableBlocks.map(b => ({ x: b.x, y: b.y }));
        const simTiles = currentLevel.tiles.map(r => r.slice());
        let px = playerPos.x, py = playerPos.y;

        for (let step = 1; step <= maxSteps; step++) {
            const nx = px + d.dx;
            const ny = py + d.dy;
            // bounds/wall check
            if (!currentLevel || nx < 0 || nx >= currentLevel.width || ny < 0 || ny >= currentLevel.height) break;
            const tile = simTiles[ny][nx];
            if (tile === TILE_TYPES.WALL) break;

            // Is there a simulated block at nx,ny ?
            const blockIdx = simBlocks.findIndex(b => b.x === nx && b.y === ny);
            if (blockIdx === -1) {
                // empty/goal/water/lava tile — we can step here
                moveHighlights.push({ x: nx, y: ny });
                // advance the simulated player position and continue
                px = nx; py = ny;
                // If this is an absorbing tile (water/lava/goal), stop further steps
                if (tile === TILE_TYPES.WATER || tile === TILE_TYPES.LAVA || tile === TILE_TYPES.GOAL) break;
                continue;
            }

            // There's a block — collect the chain in simBlocks
            const chainIdxs = [];
            let cx = nx, cy = ny;
            while (true) {
                const idx = simBlocks.findIndex(b => b.x === cx && b.y === cy);
                if (idx === -1) break;
                chainIdxs.push(idx);
                cx += d.dx; cy += d.dy;
            }

            const lastIdx = chainIdxs[chainIdxs.length - 1];
            const lastBlock = simBlocks[lastIdx];
            const tx = lastBlock.x + d.dx;
            const ty = lastBlock.y + d.dy;

            // Check whether we can push the chain in the simulated world
            if (!canPushInSim(tx, ty, simBlocks, simTiles)) break;

            // Apply simulated push: handle water/lava interactions on the leading tile
            const leadTile = simTiles[ty][tx];
            if (leadTile === TILE_TYPES.WATER) {
                // leading block falls into water -> remove it and create a bridge
                simBlocks.splice(lastIdx, 1);
                simTiles[ty][tx] = TILE_TYPES.EMPTY;
                // shift remaining chain
                for (let i = chainIdxs.length - 2; i >= 0; i--) {
                    const bi = simBlocks[chainIdxs[i]];
                    bi.x += d.dx; bi.y += d.dy;
                }
            } else if (leadTile === TILE_TYPES.LAVA) {
                // leading block falls into lava -> remove it, lava remains
                simBlocks.splice(lastIdx, 1);
                for (let i = chainIdxs.length - 2; i >= 0; i--) {
                    const bi = simBlocks[chainIdxs[i]];
                    bi.x += d.dx; bi.y += d.dy;
                }
            } else {
                // normal shift
                for (let i = chainIdxs.length - 1; i >= 0; i--) {
                    const bi = simBlocks[chainIdxs[i]];
                    bi.x += d.dx; bi.y += d.dy;
                }
            }

            // The tile with the block (nx,ny) is a valid action (push) — highlight it
            moveHighlights.push({ x: nx, y: ny });
            // Advance the simulated player and continue
            px = nx; py = ny;
        }
    });
}

function clearPlayerSelection() {
    playerSelected = false;
    moveHighlights = [];
    selectionLocked = false;
    draw();
}

// Clear highlights immediately when a move action is started. Keeps selection locked
// so further taps are ignored until the move / animations complete.
function clearHighlightsForAction() {
    playerSelected = false;
    moveHighlights = [];
    selectionLocked = true;
    draw();
}

function clearSelectionWhenIdle() {
    return new Promise(resolve => {
        const id = setInterval(() => {
            const playerMoving = !!(playerRender && playerRender.moving);
            const blocksMoving = pushableBlocks.some(b => b.moving);
            if (!playerMoving && !blocksMoving) {
                clearInterval(id);
                clearPlayerSelection();
                resolve();
            }
        }, 50);
        // safety timeout
        setTimeout(() => {
            clearInterval(id);
            clearPlayerSelection();
            resolve();
        }, 5000);
    });
}

function canvasPointerDown(e) {
    // Only enable selection on narrow screens (mobile)
    if (!window.matchMedia('(max-width: 800px)').matches) return;
    if (!gameRunning || !currentLevel) return;
    if (blocksSliding) return; // don't allow during block animations

    const pos = getCanvasTileFromEvent(e);
    if (!pos) return;

    // If not in selection mode, tap on player selects
    if (!playerSelected) {
        if (pos.x === playerPos.x && pos.y === playerPos.y) {
            playerSelected = true;
            computeMoveHighlights();
            draw();
        }
        return;
    }

    // If selection is locked (move in progress), ignore taps
    // Defensive: if selectionLocked is set but nothing is moving, clear it so user can continue
    if (selectionLocked) {
        const playerMoving = !!(playerRender && playerRender.moving);
        const blocksMoving = pushableBlocks.some(b => b.moving);
        if (!playerMoving && !blocksMoving) {
            selectionLocked = false;
        } else {
            return;
        }
    }

    // If we are selecting, check if tapped a highlighted tile
    const found = moveHighlights.find(h => h.x === pos.x && h.y === pos.y);
    if (found) {
        // compute dx/dy from current playerPos to target
        const dx = found.x - playerPos.x;
        const dy = found.y - playerPos.y;
        // Convert to Arrow key and trigger move via handleKeyPress
        let key = null;
        if (dx === -1 && dy === 0) key = 'ArrowLeft';
        else if (dx === 1 && dy === 0) key = 'ArrowRight';
        else if (dx === 0 && dy === -1) key = 'ArrowUp';
        else if (dx === 0 && dy === 1) key = 'ArrowDown';
        if (key) {
            const ev = { key: key, preventDefault: () => {} };
            // Lock selection until movement/animations finish
            selectionLocked = true;
            handleKeyPress(ev);
            // Clear selection after player and blocks finish moving
            clearSelectionWhenIdle();
        }
        return;
    }

    // Tapped elsewhere: cancel selection
    clearPlayerSelection();
}


function setupInputs() {
    // Key handler is attached at start of each level (in `startLevel`) to avoid duplicates across level transitions.
    const backBtn = document.getElementById('backButton');
    if (backBtn) backBtn.onclick = backToMenu;
    else console.warn('setupInputs: No #backButton found in DOM.');

    // Canvas pointer handler is attached globally during script init. No need to reattach here.
    if (!canvasHandlerAttached && canvas) {
        canvas.addEventListener('pointerdown', canvasPointerDown);
        canvasHandlerAttached = true;
        console.debug('setupInputs: attached canvas handler (fallback)');
    }
}

// Forward mobile arrow button presses into the same key handler used for keyboard input
function mobileArrowPress(key) {
    const ev = { key: key, preventDefault: () => {} };
    try {
        handleKeyPress(ev);
    } catch (e) {
        console.warn('mobileArrowPress: failed to dispatch key', e);
    }
} 

function handleKeyPress(e) {
    if (!gameRunning || !currentLevel) return;

    const key = e.key.toLowerCase();
    
    // If there's an accidental lock, clear it when nothing is moving
    if (selectionLocked) {
        const playerMoving = !!(playerRender && playerRender.moving);
        const blocksMoving = pushableBlocks.some(b => b.moving);
        if (!playerMoving && !blocksMoving) {
            selectionLocked = false;
        }
    }

    // While blocks are moving, ignore movement keys (cannot change direction)
    if (blocksSliding && ['w','a','s','d'].includes(key)) {
        return;
    }
    
    if (key === 'escape') {
        backToMenu();
        return;
    }

    if (key === 'r') {
        startLevel(currentLevelId);
        return;
    }

    if (key === 'z') { // Undo
        if (moveHistory.length > 0) {
            const lastState = moveHistory.pop();
            playerPos = lastState.playerPos;
            pushableBlocks = lastState.pushableBlocks.map(b => new PushableBlock(b.x, b.y));
            currentLevel.tiles = JSON.parse(JSON.stringify(lastState.tiles)); // Deep copy to restore tiles (water bridges)
            if (lastState.orbs) {
                orbs = lastState.orbs.map(o => new Orb(o));
            }
        }
        return;
    }

    if (!playerPos || typeof playerPos.x !== 'number' || typeof playerPos.y !== 'number') {
        console.error('handleKeyPress: Invalid playerPos', playerPos);
        return;
    }
    
    let newX = playerPos.x;
    let newY = playerPos.y;
    let dx = 0;
    let dy = 0;
    
    if (key === 'w' || key === 'arrowup') { newY -= 1; dy = -1; }
    else if (key === 's' || key === 'arrowdown') { newY += 1; dy = 1; }
    else if (key === 'a' || key === 'arrowleft') { newX -= 1; dx = -1; }
    else if (key === 'd' || key === 'arrowright') { newX += 1; dx = 1; }
    else return;

    e.preventDefault();
    
    // Save state before move
    const currentState = {
        playerPos: { ...playerPos },
        pushableBlocks: pushableBlocks.map(b => ({ ...b })),
        tiles: JSON.parse(JSON.stringify(currentLevel.tiles))
    };

    if (canMoveTo(newX, newY) || pushableBlocks.some(b => b.x === newX && b.y === newY)) {
        // A valid move/push was initiated — clear highlights immediately for this action
        clearHighlightsForAction();

        // Multi-step move: allow up to `moveDistance` tiles per action (configured per level; default is 1)
        const maxSteps = Number.isFinite(currentLevel.moveDistance) && currentLevel.moveDistance > 0 ? Math.floor(currentLevel.moveDistance) : 1;
        // Record a single history state for the entire action
        moveHistory.push(currentState);

        const doSteps = async () => {
            for (let step = 0; step < maxSteps; step++) {
                const nx = playerPos.x + dx;
                const ny = playerPos.y + dy;

                // Blocked by wall/out-of-bounds
                if (!canMoveTo(nx, ny) && !pushableBlocks.some(b => b.x === nx && b.y === ny)) {
                    break;
                }

                // Collect any blocks in the line
                const blocksToPush = [];
                let cx = nx, cy = ny;
                while (true) {
                    const block = pushableBlocks.find(b => b.x === cx && b.y === cy);
                    if (!block) break;
                    blocksToPush.push(block);
                    cx += dx; cy += dy;
                }

                if (blocksToPush.length > 0) {
                    const lastBlock = blocksToPush[blocksToPush.length - 1];
                    const targetX = lastBlock.x + dx;
                    const targetY = lastBlock.y + dy;

                    if (!canPushBlockTo(targetX, targetY)) break;

                    const targetTile = currentLevel.tiles[targetY][targetX];
                    if (targetTile === TILE_TYPES.WATER) {
                        // Lead block falls and creates bridge
                        pushableBlocks.splice(pushableBlocks.indexOf(lastBlock), 1);
                        currentLevel.tiles[targetY][targetX] = TILE_TYPES.EMPTY;
                        for (let i = blocksToPush.length - 2; i >= 0; i--) {
                            blocksToPush[i].x += dx;
                            blocksToPush[i].y += dy;
                            blocksToPush[i].xPos = blocksToPush[i].x * TILE_SIZE;
                            blocksToPush[i].yPos = blocksToPush[i].y * TILE_SIZE;
                        }
                    } else if (targetTile === TILE_TYPES.LAVA) {
                        // Lead block falls into lava
                        pushableBlocks.splice(pushableBlocks.indexOf(lastBlock), 1);
                        for (let i = blocksToPush.length - 2; i >= 0; i--) {
                            blocksToPush[i].x += dx;
                            blocksToPush[i].y += dy;
                            blocksToPush[i].xPos = blocksToPush[i].x * TILE_SIZE;
                            blocksToPush[i].yPos = blocksToPush[i].y * TILE_SIZE;
                        }
                    } else {
                        // Normal shift
                        blocksToPush.forEach(b => {
                            b.x += dx; b.y += dy;
                            b.xPos = b.x * TILE_SIZE; b.yPos = b.y * TILE_SIZE;
                        });
                    }

                    // Move player into the tile
                    playerPos.x = nx; playerPos.y = ny;
                    movePlayerToTile(playerPos.x, playerPos.y);
                    // Player moved one step — make orbs step as well
                    stepOrbs();

                    // Recompute chain for animation
                    let currentChain = [];
                    let qx = playerPos.x, qy = playerPos.y;
                    while (true) {
                        const b = pushableBlocks.find(b => b.x === qx && b.y === qy);
                        if (!b) break;
                        currentChain.push(b);
                        qx += dx; qy += dy;
                    }

                    if (currentChain.length > 0) {
                        blocksSliding = true;
                        slideBlocksChainDiscrete(currentChain, dx, dy);
                        try {
                            if (typeof window !== 'undefined' && typeof window.waitForBlocksToFinish === 'function') {
                                await window.waitForBlocksToFinish(currentChain);
                            } else {
                                // Fallback: no wait available
                                await Promise.resolve();
                            }
                        } catch (err) {
                            console.warn('waitForBlocksToFinish failed or missing:', err);
                        }
                        blocksSliding = false;
                        movePlayerToTile(playerPos.x, playerPos.y);
                    }

                    // after handling push, continue to next step unless something stopped us
                    continue; // next step
                }

                // No blocks in the way: simple move
                playerPos.x = nx; playerPos.y = ny;
                movePlayerToTile(playerPos.x, playerPos.y);
                // Player moved one step — make orbs step as well
                stepOrbs();

                // If we stepped into water/lava/goal, stop further steps
                const tile = currentLevel.tiles[playerPos.y][playerPos.x];
                if (tile === TILE_TYPES.WATER || tile === TILE_TYPES.LAVA || tile === TILE_TYPES.GOAL) break;

                // otherwise continue next step
                continue;
            }

            // Ensure selection is cleared after the multi-step action finishes
            clearPlayerSelection();
        };

        // Prevent overlapping moves
        if (moveInProgress) return;
        moveInProgress = true;

        // Run steps (fire-and-forget; errors should not block the UI)
        doSteps().catch(err => { console.error('multi-step move error', err); blocksSliding = false; clearPlayerSelection(); }).finally(() => { moveInProgress = false; });

        // Quick update checks
        moveOrbs();
        checkCollisions();
        checkWin();
        return;
    }
}

function canMoveTo(x, y) {
    if (!currentLevel || !currentLevel.tiles) return false;
    
    // Strict validation of coordinates
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
        console.warn('canMoveTo: Invalid coordinates:', x, y);
        return false;
    }
    
    if (x < 0 || x >= currentLevel.width || y < 0 || y >= currentLevel.height) {
        return false;
    }
    
    // Check if row exists
    if (!currentLevel.tiles[y]) {
        console.warn('canMoveTo: Row undefined:', y);
        return false;
    }

    const tile = currentLevel.tiles[y][x];
    const hasBlock = pushableBlocks.find(b => b.x === x && b.y === y);
    
    // Player can move to:
    // 1. Empty tile
    // 2. Goal tile
    // 3. Water tile (but will die)
    // 4. Block (if it can be pushed)
    // We handle the "if block" logic in handleKeyPress, so here we just return true if it's a valid tile to *attempt* to move to
    
    // Player can move to empty, goal, water (dies), or lava (dies)
    return (tile === TILE_TYPES.EMPTY || tile === TILE_TYPES.GOAL || tile === TILE_TYPES.WATER || tile === TILE_TYPES.LAVA);
}

function canPushBlockTo(x, y) {
    if (!currentLevel || !currentLevel.tiles) return false;
    if (x < 0 || x >= currentLevel.width || y < 0 || y >= currentLevel.height) {
        return false;
    }
    
    if (!currentLevel.tiles[y]) return false;

    const tile = currentLevel.tiles[y][x];
    const hasBlock = pushableBlocks.find(b => b.x === x && b.y === y);
    
    // Block can be pushed into:
    // 1. Empty space
    // 2. Water (becomes bridge)
    // 3. Goal
    // 4. Lava (block falls into lava and disappears)
    // CANNOT push into: Wall, Another Block
    // Blocks can be pushed to empty, water (falls), goal, or lava (falls)
    return (tile === TILE_TYPES.EMPTY || tile === TILE_TYPES.WATER || tile === TILE_TYPES.GOAL || tile === TILE_TYPES.LAVA);
}

// Attempt a single slide step (player): decide whether to move, push blocks, or stop.
function attemptSlideStep() {
    if (!sliding || !currentLevel) return;

    const dx = slideDir.dx;
    const dy = slideDir.dy;
    const nextX = playerPos.x + dx;
    const nextY = playerPos.y + dy;

    // Out of bounds or wall -> stop sliding
    if (nextX < 0 || nextX >= currentLevel.width || nextY < 0 || nextY >= currentLevel.height) {
        sliding = false;
        return;
    }

    const nextTile = currentLevel.tiles[nextY][nextX];

    // If there's a block in the way, try to push chain
    const block = pushableBlocks.find(b => b.x === nextX && b.y === nextY);
    if (block) {
        // Collect blocks in line
        const blocksToPush = [];
        let cx = nextX, cy = nextY;
        while (true) {
            const bb = pushableBlocks.find(b => b.x === cx && b.y === cy);
            if (!bb) break;
            blocksToPush.push(bb);
            cx += dx; cy += dy;
        }

        const lastBlock = blocksToPush[blocksToPush.length - 1];
        const targetX = lastBlock.x + dx;
        const targetY = lastBlock.y + dy;

        if (!canPushBlockTo(targetX, targetY)) {
            sliding = false; // blocked
            return;
        }

        // Push chain synchronously then move player into the freed space (discrete steps)
        blocksSliding = true;
        slideBlocksChainDiscrete(blocksToPush, dx, dy);
        blocksSliding = false;
        // Now move player into that tile (immediate, no animation)
        movePlayerToTile(nextX, nextY);
        // Defensive: ensure any selection locks are cleared (in case this was triggered while selectionLocked)
        clearPlayerSelection();
        return;
    }

    // No block in way: move player into next tile (animated)
    if (nextTile === TILE_TYPES.WALL) {
        sliding = false;
        return;
    }

    movePlayerToTile(nextX, nextY);
}

function slideBlocksChainDiscrete(chain, dx, dy) {
    if (!chain || chain.length === 0) return;

    // We'll perform a single discrete step for the chain (animated),
    // and then let individual block sliding logic continue subsequent steps.
    // Move blocks from last to first (so they can animate into freed space)
    for (let i = chain.length - 1; i >= 0; i--) {
        const b = chain[i];
        // Start an animated step into the target tile
        b.stepOnce(dx, dy);
    }

    // Do a quick state update (orbs/collisions/win may be handled upon arrival in block.update)
    moveOrbs();
    checkCollisions();
    checkWin();
}

// No async waiting required for discrete block movement.

function waitForBlocksToFinish(chain) {
    if (!chain || chain.length === 0) return Promise.resolve();
    return new Promise(resolve => {
        const id = setInterval(() => {
            const anyMoving = chain.some(b => b.moving);
            if (!anyMoving) {
                clearInterval(id);
                // Defensive cleanup
                try { chain.forEach(b => { b.moving = false; b.stepTimer = 0; }); } catch (e) {}
                blocksSliding = false;
                selectionLocked = false;
                resolve();
            }
        }, 40);
        // safety timeout
        setTimeout(() => {
            clearInterval(id);
            try { chain.forEach(b => { b.moving = false; b.stepTimer = 0; }); } catch (e) {}
            blocksSliding = false;
            selectionLocked = false;
            resolve();
        }, 5000);
    });
}
// Ensure the helper is available globally so event handlers and older code paths can call it
if (typeof window !== 'undefined') window.waitForBlocksToFinish = waitForBlocksToFinish;

function updateEntities(dt) {
    // Update blocks (handle step timers and short animations)
    pushableBlocks.forEach(b => b.update(dt));

    // Orbs and other entity updates
    moveOrbs();

    // Defensive cleanup: if nothing is moving, ensure locks/flags are cleared
    const anyBlockMoving = pushableBlocks.some(b => b.moving);
    const playerMoving = !!(playerRender && playerRender.moving);
    if (!anyBlockMoving && !playerMoving) {
        if (blocksSliding) {
            console.debug('updateEntities: clearing stale blocksSliding flag');
            blocksSliding = false;
        }
        if (selectionLocked) {
            console.debug('updateEntities: clearing stale selectionLocked flag');
            selectionLocked = false;
            // Also ensure player selection state isn't stuck
            playerSelected = false;
            moveHighlights = [];
            draw();
        }
    }
}

function moveOrbs() {
    // Orbs no longer move continuously; movement happens when the player performs a step.
    // Keep this function for compatibility (no-op).
}

function stepOrbs() {
    if (!orbs || orbs.length === 0) return;
    // Each orb executes its next sequence command
    orbs.forEach(o => o.step(pushableBlocks, currentLevel, orbs));
    // After orbs moved, check collisions (orb vs player)
    checkCollisions();
}

function movePlayerToTile(tx, ty) {
    // Immediate discrete movement (snap to tile, no smooth animation)
    playerPos.x = tx;
    playerPos.y = ty;
    playerRender.destX = tx;
    playerRender.destY = ty;
    playerRender.xPos = tx * TILE_SIZE;
    playerRender.yPos = ty * TILE_SIZE;
    playerRender.moving = false;
    // Call arrival handler immediately to continue sliding if needed
    onPlayerArrive();

    // Defensive: ensure move guard is cleared if we arrive while a previous action left it set
    if (moveInProgress && !pushableBlocks.some(b => b.moving) && !(playerRender && playerRender.moving)) {
        console.debug('movePlayerToTile: clearing stale moveInProgress flag');
        moveInProgress = false;
    }
}

function onPlayerArrive() {
    if (!currentLevel) return;
    const tile = currentLevel.tiles[playerPos.y][playerPos.x];

    // Death conditions
    if (tile === TILE_TYPES.WATER || tile === TILE_TYPES.LAVA) {
        sliding = false;
        dieLevel();
        return;
    }

    // Win
    if (tile === TILE_TYPES.GOAL) {
        sliding = false;
        checkWin();
        return;
    }

    // Check collisions with orbs after arrival
    checkCollisions();



    // Not sliding: perform post-move checks
    moveOrbs();
    checkWin();
}

function checkCollisions() {
    orbs.forEach(orb => {
        if (orb.checkCollision(playerPos.x, playerPos.y)) {
            dieLevel();
        }
    });
}

function checkWin() {
    const tile = currentLevel.tiles[playerPos.y][playerPos.x];
    if (tile === TILE_TYPES.GOAL) {
        winLevel();
    }
}

function dieLevel() {
    gameRunning = false;
    
    const message = document.getElementById('winMessage');
    message.innerHTML = '<div>You died!<br><br>Try again!</div>';
    message.classList.add('show');
    
    if (keyHandlerAttached) {
        document.removeEventListener('keydown', handleKeyPress);
        keyHandlerAttached = false;
    }
    
    setTimeout(() => {
        startLevel(currentLevelId);
    }, 2000);
}

function winLevel() {
    gameRunning = false;

    if (!completedLevels.includes(currentLevelId)) {
        completedLevels.push(currentLevelId);
        localStorage.setItem('completedLevels', JSON.stringify(completedLevels));
    }
    
    const nextLevel = currentLevelId + 1;
    
    const message = document.getElementById('winMessage');
    message.innerHTML = `<div>You win!<br>${currentLevel.name}<br><br>`;
    
    if (nextLevel < levels.length) {
        message.innerHTML += `Next level unlocked! 🚀</div>`;
    } else {
        message.innerHTML += `You completed the game! 🏆</div>`;
    }
    
    message.classList.add('show');
    
    if (keyHandlerAttached) {
        document.removeEventListener('keydown', handleKeyPress);
        keyHandlerAttached = false;
    }
    
    setTimeout(() => {
        backToMenu();
    }, 3000);
}

function backToMenu() {
    gameRunning = false;
    if (keyHandlerAttached) {
        document.removeEventListener('keydown', handleKeyPress);
        keyHandlerAttached = false;
    }
    document.getElementById('gameView').classList.remove('active');
    document.getElementById('levelSelectWrapper').style.display = 'block';
    document.getElementById('winMessage').classList.remove('show');
    
    setupLevelSelect();
}

let lastTimestamp = null;

function gameLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = (timestamp - lastTimestamp) / 1000; // seconds
    lastTimestamp = timestamp;

    updateEntities(dt);
    draw();

    if (gameRunning) {
        requestAnimationFrame(gameLoop);
    } else {
        console.log('Game loop stopped');
        lastTimestamp = null;
    }
}

function draw() {
    if (!ctx || !currentLevel) return;
    
    ctx.fillStyle = COLORS.EMPTY;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    for (let y = 0; y < currentLevel.height; y++) {
        for (let x = 0; x < currentLevel.width; x++) {
            const tile = currentLevel.tiles[y][x];
            const px = x * TILE_SIZE;
            const py = y * TILE_SIZE;
            const hasBlock = pushableBlocks.find(b => b.x === x && b.y === y);
            
            if (tile === TILE_TYPES.WALL) {
                ctx.fillStyle = COLORS.WALL;
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            } else if (tile === TILE_TYPES.WATER) {
                ctx.fillStyle = hasBlock ? COLORS.WATER_WITH_BLOCK : COLORS.WATER;
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            } else if (tile === TILE_TYPES.GOAL) {
                ctx.fillStyle = COLORS.GOAL;
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            } else if (tile === TILE_TYPES.LAVA) {
                ctx.fillStyle = COLORS.LAVA;
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            }
            
            ctx.strokeStyle = COLORS.GRID;
            ctx.lineWidth = 1;
            ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        }
    }

    pushableBlocks.forEach(block => {
        const pos = block.getRenderPos ? block.getRenderPos() : { x: block.x * TILE_SIZE, y: block.y * TILE_SIZE };
        const px = pos.x;
        const py = pos.y;
        const padding = 3;
        ctx.fillStyle = COLORS.BLOCK;
        ctx.fillRect(px + padding, py + padding, TILE_SIZE - padding * 2, TILE_SIZE - padding * 2);
    });

    orbs.forEach(orb => {
        const px = orb.x * TILE_SIZE;
        const py = orb.y * TILE_SIZE;
        const radius = TILE_SIZE * 0.35;
        ctx.fillStyle = COLORS.ORB;
        ctx.beginPath();
        ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, radius, 0, Math.PI * 2);
        ctx.fill();
    });
    
    // Draw move highlights if player is selected (mobile tap mode)
    if (playerSelected && moveHighlights && moveHighlights.length > 0) {
        ctx.fillStyle = 'rgba(255, 255, 0, 0.22)';
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
        moveHighlights.forEach(h => {
            const hx = h.x * TILE_SIZE;
            const hy = h.y * TILE_SIZE;
            ctx.fillRect(hx, hy, TILE_SIZE, TILE_SIZE);
            ctx.lineWidth = 2;
            ctx.strokeRect(hx + 1, hy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        });
    }

    const pr = playerRender && typeof playerRender.xPos === 'number' ? playerRender : { xPos: playerPos.x * TILE_SIZE, yPos: playerPos.y * TILE_SIZE };
    const px = pr.xPos;
    const py = pr.yPos;
    const padding = 5;
    
    ctx.fillStyle = COLORS.PLAYER;
    ctx.fillRect(px + padding, py + padding, TILE_SIZE - padding * 2, TILE_SIZE - padding * 2);
}

function loadProgress() {
    const saved = localStorage.getItem('completedLevels');
    if (saved) {
        completedLevels = JSON.parse(saved);
    }
}

loadProgress();
loadLevels();
