let levels = [];
let currentLevelIndex = null;
let currentTool = '0';
let canvas, ctx;
let isDragging = false;

const TILE_SIZE = 40;
const HISTORY_LIMIT = 50;
let history = [];
let editingOrbIndex = null;

async function loadLevels() {
    const response = await fetch('levels.json');
    const data = await response.json();
    levels = data.levels;
    levels.forEach((level, index) => {
        level.id = index;
        if (!('instructions' in level)) level.instructions = '';
        if (!level.orbs) level.orbs = [];
    });
    if (levels.length > 0) {
        setCurrentLevel(0);
    }
}

function setCurrentLevel(index) {
    if (index >= 0 && index < levels.length) {
        currentLevelIndex = index;
        const level = levels[index];
        
        document.getElementById('levelName').value = level.name;
        document.getElementById('levelWidth').value = level.width;
        document.getElementById('levelHeight').value = level.height;
        document.getElementById('levelInstructions').value = level.instructions || ''; 
        
        updateOrbsList();
        initCanvas();
        updateLevelList();
        clearHistory();
    }
}

function initCanvas() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    
    const level = levels[currentLevelIndex];
    canvas.width = level.width * TILE_SIZE;
    canvas.height = level.height * TILE_SIZE;
    
    setupCanvasEvents();
    draw();
}

function setupCanvasEvents() {
    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('mouseup', () => { isDragging = false; });
    canvas.addEventListener('mouseleave', () => { isDragging = false; });
}

function handleCanvasMouseDown(e) {
    isDragging = true;
    const pos = getMouseTile(e);
    if (pos) {
        setTile(pos.x, pos.y);
    }
}

function handleCanvasMouseMove(e) {
    if (!isDragging) return;
    const pos = getMouseTile(e);
    if (pos) {
        setTile(pos.x, pos.y);
    }
}

function getMouseTile(e) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / TILE_SIZE);
    const y = Math.floor((e.clientY - rect.top) / TILE_SIZE);
    
    const level = levels[currentLevelIndex];
    if (x >= 0 && x < level.width && y >= 0 && y < level.height) {
        return { x, y };
    }
    return null;
}

function setTile(x, y) {
    const level = levels[currentLevelIndex];
    saveToHistory();
    
    if (currentTool === 'player') {
        level.playerStart = [x, y];
    } else if (currentTool.startsWith('orb')) {
        const orbIndex = parseInt(currentTool.split('-')[1]);
        if (editingOrbIndex === orbIndex) {
            if (!level.orbs[orbIndex]) {
                level.orbs[orbIndex] = { waypoints: [], speed: 1 };
            }
            level.orbs[orbIndex].waypoints.push([x, y]);
        }
    } else {
        level.tiles[y][x] = parseInt(currentTool);
    }
    
    draw();
}

function draw() {
    const level = levels[currentLevelIndex];
    
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    for (let y = 0; y < level.height; y++) {
        for (let x = 0; x < level.width; x++) {
            const tile = level.tiles[y][x];
            const px = x * TILE_SIZE;
            const py = y * TILE_SIZE;
            
            if (tile === 1) {
                ctx.fillStyle = '#666666';
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            } else if (tile === 2) {
                ctx.fillStyle = '#0066CC';
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            } else if (tile === 3) {
                ctx.fillStyle = '#FF8800';
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            } else if (tile === 4) {
                ctx.fillStyle = '#00FF00';
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            } else if (tile === 6) {
                ctx.fillStyle = '#cc3300';
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            }
            
            ctx.strokeStyle = '#222222';
            ctx.lineWidth = 1;
            ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        }
    }

    level.orbs.forEach((orb, orbIdx) => {
        if (orb && orb.waypoints) {
            orb.waypoints.forEach((wp, idx) => {
                const px = wp[0] * TILE_SIZE + TILE_SIZE / 2;
                const py = wp[1] * TILE_SIZE + TILE_SIZE / 2;
                const radius = 5;

                const isSelected = editingOrbIndex === orbIdx;
                ctx.fillStyle = isSelected ? '#FF2222' : '#FFAA00';
                ctx.beginPath();
                ctx.arc(px, py, radius, 0, Math.PI * 2);
                ctx.fill();

                if (idx < orb.waypoints.length - 1) {
                    const nextPx = orb.waypoints[idx + 1][0] * TILE_SIZE + TILE_SIZE / 2;
                    const nextPy = orb.waypoints[idx + 1][1] * TILE_SIZE + TILE_SIZE / 2;
                    ctx.strokeStyle = isSelected ? '#FF2222' : '#FFAA00';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(px, py);
                    ctx.lineTo(nextPx, nextPy);
                    ctx.stroke();
                }
            });
        }
    });
    
    const [px, py] = level.playerStart;
    const padding = 6;
    ctx.fillStyle = '#0099FF';
    ctx.fillRect(px * TILE_SIZE + padding, py * TILE_SIZE + padding, TILE_SIZE - padding * 2, TILE_SIZE - padding * 2);
}

function resizeLevel() {
    const level = levels[currentLevelIndex];
    const newWidth = parseInt(document.getElementById('levelWidth').value);
    const newHeight = parseInt(document.getElementById('levelHeight').value);
    
    saveToHistory();
    
    const newTiles = [];
    for (let y = 0; y < newHeight; y++) {
        const row = [];
        for (let x = 0; x < newWidth; x++) {
            if (y < level.height && x < level.width) {
                row.push(level.tiles[y][x]);
            } else {
                row.push(0);
            }
        }
        newTiles.push(row);
    }
    
    level.width = newWidth;
    level.height = newHeight;
    level.tiles = newTiles;
    
    initCanvas();
}

function clearLevel() {
    if (confirm('Are you sure? It can\'t be undone.')) {
        const level = levels[currentLevelIndex];
        level.tiles = Array(level.height).fill(0).map(() => Array(level.width).fill(0));
        level.playerStart = [0, 0];
        level.orbs = [];
        clearHistory();
        updateOrbsList();
        draw();
    }
}

function newLevel() {
    const newLevel = {
        id: levels.length,
        name: `Level ${levels.length + 1}`,
        instructions: '',
        width: 10,
        height: 8,
        tiles: Array(8).fill(0).map(() => Array(10).fill(0)),
        playerStart: [0, 0],
        orbs: []
    };
    
    levels.push(newLevel);
    setCurrentLevel(levels.length - 1);
}

function deleteLevel() {
    if (levels.length <= 1) {
        alert('You need to have at least one level!');
        return;
    }

    if (confirm(`Delete "${levels[currentLevelIndex].name}"?`)) {
        levels.splice(currentLevelIndex, 1);
        
        if (currentLevelIndex >= levels.length) {
            currentLevelIndex = levels.length - 1;
        }
        
        setCurrentLevel(currentLevelIndex);
    }
}

function updateLevelList() {
    const container = document.getElementById('levelList');
    container.innerHTML = '';
    
    levels.forEach((level, index) => {
        const div = document.createElement('div');
        div.className = 'level-item';
        if (index === currentLevelIndex) {
            div.classList.add('active');
        }
        
        div.textContent = `${index + 1}. ${level.name}`;
        div.onclick = () => setCurrentLevel(index);
        
        container.appendChild(div);
    });
}

function updateOrbsList() {
    const container = document.getElementById('orbsList');
    if (!container) return;

    const level = levels[currentLevelIndex];
    container.innerHTML = '';

    level.orbs.forEach((orb, idx) => {
        const div = document.createElement('div');
        div.className = 'orb-item';
        if (editingOrbIndex === idx) {
            div.classList.add('editing');
        }

        const wpCount = orb && orb.waypoints ? orb.waypoints.length : 0;
        div.innerHTML = `
            Orb ${idx + 1}: ${wpCount} waypoints
            <div style="font-size: 11px; color: #999;">
                <button onclick="startEditOrb(${idx})" style="padding: 3px 8px; width: 100%; margin-top: 5px;">
                    ${editingOrbIndex === idx ? '✓ Editing' : 'Edit'}
                </button>
            </div>
        `;
        container.appendChild(div);
    });

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add orb';
    addBtn.style.width = '100%';
    addBtn.onclick = addOrb;
    container.appendChild(addBtn);
}

function startEditOrb(idx) {
    if (editingOrbIndex === idx) {
        editingOrbIndex = null;
    } else {
        editingOrbIndex = idx;
        currentTool = `orb-${idx}`;
        document.querySelectorAll('.tool-button').forEach(b => b.classList.remove('active'));
    }
    updateOrbsList();
    draw();
}

function addOrb() {
    const level = levels[currentLevelIndex];
    level.orbs.push({ waypoints: [], speed: 1 });
    updateOrbsList();
}

function deleteOrb(idx) {
    const level = levels[currentLevelIndex];
    level.orbs.splice(idx, 1);
    if (editingOrbIndex === idx) {
        editingOrbIndex = null;
    }
    updateOrbsList();
    draw();
}

function clearOrbPath(idx) {
    const level = levels[currentLevelIndex];
    if (level.orbs[idx]) {
        level.orbs[idx].waypoints = [];
    }
    updateOrbsList();
    draw();
}

function saveToHistory() {
    const level = levels[currentLevelIndex];
    history.push(JSON.stringify(level));
    
    if (history.length > HISTORY_LIMIT) {
        history.shift();
    }
}

function clearHistory() {
    history = [];
}

function undo() {
    if (history.length > 0) {
        const levelData = JSON.parse(history.pop());
        levels[currentLevelIndex] = levelData;
        updateOrbsList();
        draw();
    }
}

function saveToFile() {
    updateLevelName();
    
    const data = { levels };
    const json = JSON.stringify(data, null, 2);
    
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'levels.json';
    a.click();
    URL.revokeObjectURL(url);
}

function loadFromFile() {
    document.getElementById('fileInput').click();
}

document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            levels = data.levels;
            
            levels.forEach((level, index) => {
                level.id = index;
                if (!level.orbs) level.orbs = [];
                if (!('instructions' in level)) level.instructions = '';
            });
            
            if (levels.length > 0) {
                setCurrentLevel(0);
            }
            
            alert('✓ Levels loaded successfully!');
        } catch (err) {
            alert('❌ Error loading file!');
        }
    };
    reader.readAsText(file);
    
    e.target.value = '';
});

function updateLevelName() {
    const idx = currentLevelIndex;
    levels[idx].name = document.getElementById('levelName').value;
    levels[idx].instructions = document.getElementById('levelInstructions').value;
}

document.querySelectorAll('.tool-button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tool-button').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentTool = e.target.getAttribute('data-tool');
        editingOrbIndex = null;
        updateOrbsList();
    });
});

document.addEventListener('keydown', (e) => {
    if (['0', '1', '2', '3', '4', '6'].includes(e.key)) {
        currentTool = e.key;
        editingOrbIndex = null;
        document.querySelectorAll('.tool-button').forEach(b => b.classList.remove('active'));
        const tool = document.querySelector(`[data-tool="${e.key}"]`);
        if (tool) tool.classList.add('active');
        updateOrbsList();
    } else if (e.key.toLowerCase() === 'p') {
        currentTool = 'player';
        editingOrbIndex = null;
        document.querySelectorAll('.tool-button').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-tool="player"]').classList.add('active');
        updateOrbsList();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
    } else if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveToFile();
    }
});

loadLevels();
