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
    constructor(waypoints, speed) {
        this.waypoints = waypoints;
        this.speed = speed;
        this.currentWaypoint = 0;
        this.progress = 0;
        this.x = waypoints[0][0];
        this.y = waypoints[0][1];
    }

    update() {
        if (this.waypoints.length < 2) return;

        const nextWaypoint = this.waypoints[(this.currentWaypoint + 1) % this.waypoints.length];
        const currentWaypoint = this.waypoints[this.currentWaypoint];

        const dx = nextWaypoint[0] - currentWaypoint[0];
        const dy = nextWaypoint[1] - currentWaypoint[1];
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Normalize speed relative to distance
        // Avoid division by zero
        if (distance > 0) {
            this.progress += this.speed / distance;
        }

        if (this.progress >= 1) {
            // Overshoot handling for smooth movement
            this.progress -= 1; 
            this.currentWaypoint = (this.currentWaypoint + 1) % this.waypoints.length;
            
            // Recalculate position based on new segment
            const nextNext = this.waypoints[(this.currentWaypoint + 1) % this.waypoints.length];
            const nextCurr = this.waypoints[this.currentWaypoint];
            
            // Optional: If you want perfect snapping to waypoints, you can simplify, 
            // but preserving progress makes it smoother if speed is high.
            // For simplicity in this grid game, snapping is usually fine, but let's keep it smooth.
            
            // Re-calculate position for the remainder of the progress
             const dX2 = nextNext[0] - nextCurr[0];
             const dY2 = nextNext[1] - nextCurr[1];
             this.x = nextCurr[0] + dX2 * this.progress;
             this.y = nextCurr[1] + dY2 * this.progress;

        } else {
            this.x = currentWaypoint[0] + dx * this.progress;
            this.y = currentWaypoint[1] + dy * this.progress;
        }
    }


    checkCollision(x, y, radius = 0.3) {
        const dist = Math.sqrt((this.x - x) ** 2 + (this.y - y) ** 2);
        return dist < (1 - radius);
    }
}

async function loadLevels() {
    try {
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

    orbs = (currentLevel.orbs || []).map(orbData => new Orb(orbData.waypoints, orbData.speed));
    
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

function setupInputs() {
    document.removeEventListener('keydown', handleKeyPress);
    document.addEventListener('keydown', handleKeyPress);
    const backBtn = document.getElementById('backButton');
    if (backBtn) backBtn.onclick = backToMenu;
    else console.warn('setupInputs: No #backButton found in DOM.');
}

function handleKeyPress(e) {
    if (!gameRunning || !currentLevel) return;

    const key = e.key.toLowerCase();
    
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
    
    if (key === 'w') { newY -= 1; dy = -1; }
    else if (key === 's') { newY += 1; dy = 1; }
    else if (key === 'a') { newX -= 1; dx = -1; }
    else if (key === 'd') { newX += 1; dx = 1; }
    else return;

    e.preventDefault();
    
    // Save state before move
    const currentState = {
        playerPos: { ...playerPos },
        pushableBlocks: pushableBlocks.map(b => ({ ...b })),
        tiles: JSON.parse(JSON.stringify(currentLevel.tiles))
    };

    if (canMoveTo(newX, newY) || pushableBlocks.some(b => b.x === newX && b.y === newY)) {
        // Collect all blocks in a line that we are pushing
        let blocksToPush = [];
        let checkX = newX;
        let checkY = newY;
        
        while (true) {
            const block = pushableBlocks.find(b => b.x === checkX && b.y === checkY);
            if (!block) break;
            blocksToPush.push(block);
            checkX += dx;
            checkY += dy;
        }

        // If we found blocks, check if the LAST block can move into the target space
        if (blocksToPush.length > 0) {
            const lastBlock = blocksToPush[blocksToPush.length - 1];
            const targetX = lastBlock.x + dx;
            const targetY = lastBlock.y + dy;

            if (canPushBlockTo(targetX, targetY)) {
                 // Push successful! Record history
                 moveHistory.push(currentState);
                 
                 // Move blocks from last to first to avoid overlap issues
                 // But wait, we need to handle special interactions like water for the LEAD block
                 
                 // Actually, we just shift them all by dx, dy. 
                 // The one at the front (furthest from player) hits the target tile.
                 
                 const targetTile = currentLevel.tiles[targetY][targetX];
                 
                 if (targetTile === TILE_TYPES.WATER) {
                     // The leading block falls into water and creates a bridge
                     pushableBlocks.splice(pushableBlocks.indexOf(lastBlock), 1);
                     currentLevel.tiles[targetY][targetX] = TILE_TYPES.EMPTY; // Bridge!
                     
                     // Move the rest
                     for (let i = blocksToPush.length - 2; i >= 0; i--) {
                         blocksToPush[i].x += dx;
                         blocksToPush[i].y += dy;
                         blocksToPush[i].xPos = blocksToPush[i].x * TILE_SIZE;
                         blocksToPush[i].yPos = blocksToPush[i].y * TILE_SIZE;
                     }
                 } else if (targetTile === TILE_TYPES.LAVA) {
                     // Block falls into lava and disappears; lava remains (no bridge)
                     pushableBlocks.splice(pushableBlocks.indexOf(lastBlock), 1);
                     for (let i = blocksToPush.length - 2; i >= 0; i--) {
                         blocksToPush[i].x += dx;
                         blocksToPush[i].y += dy;
                         blocksToPush[i].xPos = blocksToPush[i].x * TILE_SIZE;
                         blocksToPush[i].yPos = blocksToPush[i].y * TILE_SIZE;
                     }
                 } else {
                     // Normal move for all blocks
                     blocksToPush.forEach(b => {
                         b.x += dx;
                         b.y += dy;
                         b.xPos = b.x * TILE_SIZE;
                         b.yPos = b.y * TILE_SIZE;
                     });
                 }
                 
                 playerPos.x = newX;
                 playerPos.y = newY;
                 // Recompute current chain (some blocks may have been removed when pushing into water/lava)
                 let currentChain = [];
                 let cx = newX, cy = newY;
                 while (true) {
                     const b = pushableBlocks.find(b => b.x === cx && b.y === cy);
                     if (!b) break;
                     currentChain.push(b);
                     cx += dx; cy += dy;
                 }
                 // If the front block is movable, slide the chain one step
                 const leadBlock = currentChain[currentChain.length - 1];
                 // Animate player's step into the tile we just moved into
                 movePlayerToTile(newX, newY);
                 // Start chain animation and then move player into the freed space
                 blocksSliding = true;
                 slideBlocksChainDiscrete(currentChain, dx, dy);
                 waitForBlocksToFinish(currentChain).then(() => {
                     blocksSliding = false;
                     movePlayerToTile(newX, newY);
                 });
                 return; 

                 // Move player into the tile
                 movePlayerToTile(newX, newY);
                 return; 
            }
            // If chain cannot move, do nothing
        } else {
            // No blocks, simple move (animate player)
            moveHistory.push(currentState);
            // Move player tile coords immediately and animate to the tile
            playerPos.x = newX;
            playerPos.y = newY;
            movePlayerToTile(newX, newY);
            const steppedTile = currentLevel.tiles[newY][newX];

            // For water/lava/goal death/win will be handled on arrival
            return;
        }

        moveOrbs();
        checkCollisions();
        checkWin();
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

function updateEntities(dt) {
    // Update blocks (handle step timers and short animations)
    pushableBlocks.forEach(b => b.update(dt));

    // Orbs and other entity updates
    moveOrbs();
}

function moveOrbs() {
    orbs.forEach(orb => orb.update());
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
    
    document.removeEventListener('keydown', handleKeyPress);
    
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
    
    document.removeEventListener('keydown', handleKeyPress);
    
    setTimeout(() => {
        backToMenu();
    }, 3000);
}

function backToMenu() {
    gameRunning = false;
    document.removeEventListener('keydown', handleKeyPress);
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
