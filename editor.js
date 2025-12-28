let levels = [];
let currentLevelIndex = null;
let currentTool = '0';
let canvas, ctx;
let isDragging = false;

const TILE_SIZE = 40;
const HISTORY_LIMIT = 50;
const ORB_COLORS = {
    normal: '#FF4444',
    flying: '#9933ff',
    strong: '#8b4513'
};
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
        if (!('community' in level)) level.community = false;
        // Migrate legacy orb data: if waypoints present but seq missing, use first waypoint as start and set a default seq
        level.orbs.forEach(orb => {
            if (!orb) return;
            if (!('seq' in orb)) {
                orb.seq = Array.isArray(orb.seq) ? orb.seq.slice() : [];
            }
            if ((!('x' in orb) || !('y' in orb)) && Array.isArray(orb.waypoints) && orb.waypoints.length > 0) {
                orb.x = orb.waypoints[0][0];
                orb.y = orb.waypoints[0][1];
            }
            if (!Array.isArray(orb.seq) || orb.seq.length === 0) {
                // Default to a single wait command to avoid empty sequences
                orb.seq = ['wait'];
            }
        });
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
        // Community badge
        const commEl = document.getElementById('levelCommunity');
        if (commEl) commEl.checked = !!level.community;
        
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
                level.orbs[orbIndex] = { waypoints: [], speed: 1, x: x, y: y, seq: ['wait'] };
            }
            // Set starting position for the orb when editing
            level.orbs[orbIndex].x = x;
            level.orbs[orbIndex].y = y;
            // Ensure seq exists
            if (!Array.isArray(level.orbs[orbIndex].seq) || level.orbs[orbIndex].seq.length === 0) {
                level.orbs[orbIndex].seq = ['wait'];
            }
            updateOrbsList();
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
            } else if (tile === 5) {
                ctx.fillStyle = '#99ccff';
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
        // Draw starting position if present
        if (orb && typeof orb.x === 'number' && typeof orb.y === 'number') {
            const opx = orb.x * TILE_SIZE + TILE_SIZE / 2;
            const opy = orb.y * TILE_SIZE + TILE_SIZE / 2;
            const radius = 8;
            const isSelected = editingOrbIndex === orbIdx;
            
            const type = orb.type || 'normal';
            ctx.fillStyle = ORB_COLORS[type] || ORB_COLORS.normal;
            
            ctx.beginPath();
            ctx.arc(opx, opy, radius, 0, Math.PI * 2);
            ctx.fill();

            if (isSelected) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }

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
        community: false,
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
        
        const badge = level.community ? '<span style="background:#ffcc00; color:#000; padding:2px 6px; border-radius:6px; font-weight:bold; margin-left:8px;">C</span>' : '';
        div.innerHTML = `${index + 1}. ${level.name} ${badge}`;
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
        const seqPreview = orb && orb.seq ? orb.seq.join(', ') : '';
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>Orb ${idx + 1}</div>
                <div style="font-size:11px; color:#999;">Seq: ${seqPreview}</div>
            </div>
            <div style="font-size: 11px; color: #999; margin-top:6px;">
                <button onclick="startEditOrb(${idx})" style="padding: 3px 8px; width: 48%; margin-top: 5px;">${editingOrbIndex === idx ? '✓ Editing' : 'Edit'}</button>
                <button onclick="deleteOrb(${idx})" class="danger" style="padding: 3px 8px; width: 48%; margin-top: 5px;">Delete</button>
            </div>
        `;
        container.appendChild(div);
    });

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add orb';
    addBtn.style.width = '100%';
    addBtn.onclick = addOrb;
    container.appendChild(addBtn);

    // If an orb is being edited, show the orb editor below
    if (editingOrbIndex !== null) {
        const orb = level.orbs[editingOrbIndex];
        const editorDiv = document.createElement('div');
        editorDiv.style.marginTop = '12px';
        editorDiv.style.padding = '10px';
        editorDiv.style.background = '#222';
        editorDiv.style.borderRadius = '4px';

        editorDiv.innerHTML = `
            <div style="font-weight:bold; margin-bottom:8px;">Orb ${editingOrbIndex + 1} Editor</div>
            <div style="font-size:12px; color:#ddd; margin-bottom:8px;">Click on the canvas to set the starting position, or edit coordinates below.</div>
            <div style="display:flex; gap:8px; margin-bottom:8px;">
                <input type="number" id="orbStartX" style="width:60px;" value="${orb.x || 0}"> 
                <input type="number" id="orbStartY" style="width:60px;" value="${orb.y || 0}">
                <button onclick="applyOrbStart()" style="flex:1;">Apply start</button>
            </div>

            <div style="margin-bottom:8px;">
                <div style="font-size:12px; margin-bottom:6px;">Sequence (commands):</div>
                <div id="orbSeqContainer" style="display:flex; gap:8px; flex-wrap:wrap;">
                </div>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:6px;">
                <button onclick="addOrbCommand(${editingOrbIndex}, 'w')">W</button>
                <button onclick="addOrbCommand(${editingOrbIndex}, 'a')">A</button>
                <button onclick="addOrbCommand(${editingOrbIndex}, 's')">S</button>
                <button onclick="addOrbCommand(${editingOrbIndex}, 'd')">D</button>
                <button onclick="addOrbCommand(${editingOrbIndex}, 'wait')">WAIT</button>
            </div>

            <div style="font-size:11px; color:#999;">Use the buttons to add commands. Dragging to reorder isn't implemented; use up/down arrows.</div>
        `;

        container.appendChild(editorDiv);
        renderOrbSeq(orb, editingOrbIndex);
    }
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
    // Default orb: start at 0,0 with a single WAIT command
    level.orbs.push({ waypoints: [], speed: 1, x: 0, y: 0, seq: ['wait'] });
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

function renderOrbSeq(orb, idx) {
    const container = document.getElementById('orbSeqContainer');
    if (!container) return;
    container.innerHTML = '';
    if (!orb.seq || orb.seq.length === 0) return;

    orb.seq.forEach((cmd, cidx) => {
        const chip = document.createElement('div');
        chip.style.background = '#333';
        chip.style.padding = '6px 8px';
        chip.style.borderRadius = '4px';
        chip.style.color = '#fff';
        chip.style.display = 'flex';
        chip.style.alignItems = 'center';
        chip.style.gap = '6px';

        const span = document.createElement('span');
        span.textContent = cmd.toUpperCase();
        chip.appendChild(span);

        const up = document.createElement('button');
        up.textContent = '↑';
        up.style.padding = '2px 6px';
        up.onclick = () => { moveOrbCommand(idx, cidx, -1); };
        chip.appendChild(up);

        const down = document.createElement('button');
        down.textContent = '↓';
        down.style.padding = '2px 6px';
        down.onclick = () => { moveOrbCommand(idx, cidx, 1); };
        chip.appendChild(down);

        const rem = document.createElement('button');
        rem.textContent = '✖';
        rem.style.padding = '2px 6px';
        rem.onclick = () => { removeOrbCommand(idx, cidx); };
        chip.appendChild(rem);

        container.appendChild(chip);
    });
}

function addOrbCommand(orbIdx, cmd) {
    saveToHistory();
    const level = levels[currentLevelIndex];
    const orb = level.orbs[orbIdx];
    if (!orb) return;
    if (!Array.isArray(orb.seq)) orb.seq = [];
    orb.seq.push(cmd);
    updateOrbsList();
    renderOrbSeq(orb, orbIdx);
}

function removeOrbCommand(orbIdx, cmdIdx) {
    saveToHistory();
    const level = levels[currentLevelIndex];
    const orb = level.orbs[orbIdx];
    if (!orb || !Array.isArray(orb.seq)) return;
    orb.seq.splice(cmdIdx, 1);
    if (orb.seq.length === 0) orb.seq = ['wait'];
    updateOrbsList();
    renderOrbSeq(orb, orbIdx);
}

function moveOrbCommand(orbIdx, cmdIdx, dir) {
    saveToHistory();
    const level = levels[currentLevelIndex];
    const orb = level.orbs[orbIdx];
    if (!orb || !Array.isArray(orb.seq)) return;
    const newIdx = cmdIdx + dir;
    if (newIdx < 0 || newIdx >= orb.seq.length) return;
    const tmp = orb.seq[newIdx];
    orb.seq[newIdx] = orb.seq[cmdIdx];
    orb.seq[cmdIdx] = tmp;
    updateOrbsList();
    renderOrbSeq(orb, orbIdx);
}

function applyOrbStart() {
    const level = levels[currentLevelIndex];
    const orb = level.orbs[editingOrbIndex];
    if (!orb) return;
    const sx = parseInt(document.getElementById('orbStartX').value);
    const sy = parseInt(document.getElementById('orbStartY').value);
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
    saveToHistory();
    orb.x = sx; orb.y = sy;
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
                level.orbs.forEach(orb => {
                    if (!orb) return;
                    if ((!('x' in orb) || !('y' in orb)) && Array.isArray(orb.waypoints) && orb.waypoints.length > 0) {
                        orb.x = orb.waypoints[0][0];
                        orb.y = orb.waypoints[0][1];
                    }
                    if (!Array.isArray(orb.seq) || orb.seq.length === 0) orb.seq = ['wait'];
                });
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
    const commEl = document.getElementById('levelCommunity');
    if (commEl) levels[idx].community = !!commEl.checked;
}

// Open the current level in the game as a test. The level is stored to localStorage and game.html is opened with ?test=1
function playCurrentLevel() {
    updateLevelName();
    const level = JSON.parse(JSON.stringify(levels[currentLevelIndex]));

    // Ensure orbs have x,y and seq fields for runtime
    level.orbs = (level.orbs || []).map(o => {
        const orb = Object.assign({}, o);
        if ((!('x' in orb) || !('y' in orb)) && Array.isArray(orb.waypoints) && orb.waypoints.length > 0) {
            orb.x = orb.waypoints[0][0];
            orb.y = orb.waypoints[0][1];
        }
        if (!Array.isArray(orb.seq) || orb.seq.length === 0) orb.seq = ['wait'];
        return orb;
    });

    const payload = { levels: [level] };
    try {
        localStorage.setItem('testLevel', JSON.stringify(payload));
    } catch (e) {
        alert('Failed to store test level: ' + e);
        return;
    }

    // Try opening in a new tab; if blocked, fall back to same-tab navigation
    try {
        const w = window.open('game.html?test=1', '_blank');
        if (!w) {
            window.location.href = 'game.html?test=1';
        }
    } catch (e) {
        window.location.href = 'game.html?test=1';
    }
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
    if (['0', '1', '2', '3', '4', '5', '6'].includes(e.key)) {
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
