(() => {
    "use strict";

    const GAME_DURATION = 3 * 60 * 1000; // 3분
    const canvas = document.getElementById("arena");
    const ctx = canvas.getContext("2d");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMessage = document.getElementById("overlay-message");
    const startButton = document.getElementById("start-button");
    const restartButton = document.getElementById("restart-button");
    const gameStateEl = document.getElementById("game-state");
    const gameTimeEl = document.getElementById("game-time");
    const trapCountEl = document.getElementById("trap-count");
    const eventMessageEl = document.getElementById("event-message");

    const COLS = 15;
    const ROWS = 10;
    const background = new Image();
    background.src = "/static/ice_arena_bg.png";

    background.onload = () => {
        if (game) draw();
    };
    background.onerror = () => {
        console.error("배경 이미지를 불러오지 못했습니다.");
    };

    const TRAP_DELAY = 1500;
    const FREEZE_DURATION = 1300;
    const MAX_HEALTH = 3;
    const BASE_TRAP_CAPACITY = 1;
    const BASE_BLAST_RANGE = 1;
    const ITEM_SPAWN_INTERVAL = 4000;

    // [속도 조정] 기본 이동 간격 (ms). 숫자가 클수록 느려집니다.
    const BASE_MOVE_DELAY = 350;

    canvas.width = 1280;
    canvas.height = 720;

    const keysDown = new Set();
    const keyQueue = [];
    let game = null;
    let lastFrame = 0;
    let elapsedMs = 0;
    let frameId = null;

    const directions = {
        KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0],
        ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowRight: [1, 0]
    };

    function getRemainingTime(now) {
        if (!game || game.startedAt === null) return GAME_DURATION;
        return Math.max(0, GAME_DURATION - (now - game.startedAt));
    }

    function makeWalls() {
        const walls = new Set();
        for (let x = 0; x < COLS; x++) {
            walls.add(`${x},0`);
            walls.add(`${x},${ROWS - 1}`);
        }
        for (let y = 0; y < ROWS; y++) {
            walls.add(`0,${y}`);
            walls.add(`${COLS - 1},${y}`);
        }
        return walls;
    }

    function createRandomObstacles() {
        game.pillars = new Set();
        game.iceBlocks = new Set();
        game.iceBlockLoot = new Map();

        const candidates = [];
        const startZones = [[1, 1], [13, 8]];

        for (let y = 1; y < ROWS - 1; y++) {
            for (let x = 1; x < COLS - 1; x++) {
                const nearSpawn = startZones.some(([sx, sy]) => Math.abs(x - sx) + Math.abs(y - sy) <= 2);
                if (!nearSpawn) candidates.push({x, y});
            }
        }

        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        candidates.slice(0, 20).forEach(({x, y}) => game.pillars.add(tileKey(x, y)));

        candidates.slice(20, 60).forEach(({x, y}) => {
            const key = tileKey(x, y);
            game.iceBlocks.add(key);
            if (Math.random() < 0.6) {
                const types = ["extraTrap", "blastRange", "rollerSkates", "shoes", "superman", "banana", "glue", "devil"];
                const type = types[Math.floor(Math.random() * types.length)];
                game.iceBlockLoot.set(key, type);
            }
        });
    }

    function createPlayer(id, x, y, color, controls) {
        return {
            id, x, y, color,
            health: MAX_HEALTH,
            frozenUntil: 0,
            invulnerableUntil: 0,
            controls,
            trapCapacity: BASE_TRAP_CAPACITY,
            blastRange: BASE_BLAST_RANGE,
            slipUntil: 0,
            visualX: x, visualY: y, moveFromX: x, moveFromY: y,
            moveStartedAt: 0,
            // 부드러운 이동을 위해 애니메이션 시간을 350ms로 설정
            moveDuration: 350,
            moveCooldown: 0,
            // 16:23
            lastVisualX: x,
            lastVisualY: y,
            skateUntil: 0,
            glueUntil: 0,
            supermanUntil: 0,
            devilUntil: 0,
            hasShoes: false
        };
    }

    function resetGame(startImmediately) {
        if (frameId !== null) cancelAnimationFrame(frameId);
        const now = performance.now();
        game = {
            running: false, ended: false, startedAt: null,
            walls: makeWalls(),
            pillars: new Set(), iceBlocks: new Set(), iceBlockLoot: new Map(),
            iceTiles: new Map(), particles: [], traps: [], items: [],
            nextItemAt: now + ITEM_SPAWN_INTERVAL,
            players: [
                createPlayer(1, 1, 1, "#54c8ff", {up: "KeyW", left: "KeyA", down: "KeyS", right: "KeyD", trap: "KeyF"}),
                createPlayer(2, 13, 8, "#ff82b7", {
                    up: "ArrowUp",
                    left: "ArrowLeft",
                    down: "ArrowDown",
                    right: "ArrowRight",
                    trap: "Enter"
                })
            ],
            winner: null
        };

        createRandomObstacles();
        keysDown.clear();
        keyQueue.length = 0;
        elapsedMs = 0;
        lastFrame = now;
        updateHud(now);
        draw(now);
        overlay.classList.remove("hidden");
        overlayTitle.textContent = "아이스 아레나";
        overlayMessage.textContent = "두 플레이어가 준비되면 시작하세요.";
        startButton.textContent = "게임 시작";
        gameStateEl.textContent = "준비 완료";
        eventMessageEl.textContent = "시작 버튼을 눌러 경기를 시작하세요.";
        if (startImmediately) startGame();
    }

    function startGame() {
        if (!game || game.running || game.ended) return;
        game.running = true;
        game.startedAt = performance.now();
        lastFrame = game.startedAt;
        overlay.classList.add("hidden");
        gameStateEl.textContent = "경기 진행 중";
        eventMessageEl.textContent = "아이템을 먹고 상대를 제압하세요!";
        frameId = requestAnimationFrame(loop);
    }

    function endGame(winner) {
        if (!game || game.ended) return;
        game.running = false;
        game.ended = true;
        gameStateEl.textContent = winner === 0 ? "무승부" : `PLAYER ${winner} 승리`;
        overlayTitle.textContent = winner === 0 ? "무승부!" : `PLAYER ${winner} 승리!`;
        overlayMessage.textContent = winner === 0 ? "두 플레이어가 동시에 쓰러졌습니다." : `PLAYER ${winner}가 승리했습니다.`;
        startButton.textContent = "다시 플레이";
        overlay.classList.remove("hidden");
        eventMessageEl.textContent = "새 경기 / 재시작 버튼으로 판을 초기화할 수 있습니다.";
        updateHud();
        draw();
    }

    function inside(x, y) {
        return x >= 1 && x <= COLS - 2 && y >= 1 && y <= ROWS - 2;
    }

    function tileKey(x, y) {
        return `${x},${y}`;
    }

    function playerAt(x, y, exceptId = null) {
        return game.players.find(p => p.id !== exceptId && p.health > 0 && p.x === x && p.y === y);
    }

    function isBlocked(x, y, playerId) {
        if (!inside(x, y)) return true;
        const key = tileKey(x, y);
        if (game.walls.has(key) || game.pillars.has(key) || game.iceBlocks.has(key) || game.iceTiles.has(key)) return true;
        if (game.traps.some(t => t.x === x && t.y === y && t.ownerId !== playerId)) return true;
        return false;
    }

    function movePlayer(player, dx, dy, now) {
        if (!game.running || player.health <= 0 || now < player.frozenUntil) return;

        if (now < player.devilUntil) {
            dx = -dx;
            dy = -dy;
        }

        const nx = player.x + dx;
        const ny = player.y + dy;

        if (isBlocked(nx, ny, player.id)) return;
        const other = playerAt(nx, ny, player.id);
        if (other) return;

        const trapAtDest = game.traps.find(t => t.x === nx && t.y === ny && t.ownerId !== player.id);
        if (trapAtDest && player.hasShoes) {
            game.traps = game.traps.filter(t => t !== trapAtDest);
            let kx = nx + dx;
            let ky = ny + dy;
            for (let i = 0; i < 2; i++) {
                const nextX = kx + dx;
                const nextY = ky + dy;
                if (!isBlocked(nextX, nextY, null) && !game.walls.has(tileKey(nextX, nextY))) {
                    kx = nextX;
                    ky = nextY;
                } else break;
            }
            game.traps.push({
                x: kx,
                y: ky,
                ownerId: player.id,
                detonatesAt: now + TRAP_DELAY,
                range: player.blastRange
            });
            eventMessageEl.textContent = `PLAYER ${player.id}가 신발로 함정을 찼습니다!`;
        }

        const visual = getVisualPosition(player, now);
        player.moveFromX = visual.x;
        player.moveFromY = visual.y;
        player.x = nx;
        player.y = ny;
        player.moveStartedAt = now;
        player.visualX = nx;
        player.visualY = ny;

        collectItem(player, now);

        if (now < player.devilUntil) {
            const currentTraps = countPlayerTraps(player.id);
            if (currentTraps < 4 && !game.traps.some(t => t.x === nx && t.y === ny)) {
                game.traps.push({
                    x: nx,
                    y: ny,
                    ownerId: player.id,
                    detonatesAt: now + TRAP_DELAY,
                    range: player.blastRange
                });
                eventMessageEl.textContent = `PLAYER ${player.id}가 악마의 저주로 강제 함정을 설치했습니다!`;
            }
        }

        updateHud(now);
    }

    function countPlayerTraps(playerId) {
        return game.traps.filter(t => t.ownerId === playerId).length;
    }

    function placeTrap(player, now) {
        if (!game.running || player.health <= 0 || now < player.frozenUntil) return;

        let capacity = player.trapCapacity;
        if (now < player.supermanUntil) capacity = 4;

        if (countPlayerTraps(player.id) >= capacity) {
            eventMessageEl.textContent = `PLAYER ${player.id}: 설치 가능한 함정이 없습니다.`;
            return;
        }
        if (game.traps.some(t => t.x === player.x && t.y === player.y)) {
            eventMessageEl.textContent = "이 칸에는 이미 함정이 있습니다.";
            return;
        }
        game.traps.push({
            x: player.x, y: player.y, ownerId: player.id, detonatesAt: now + TRAP_DELAY, range: player.blastRange
        });
        eventMessageEl.textContent = `PLAYER ${player.id}가 얼음 함정을 설치했습니다!`;
        updateHud(now);
    }

    function randomOpenCell() {
        const options = [];
        for (let y = 1; y < ROWS - 1; y++) {
            for (let x = 1; x < COLS - 1; x++) {
                const key = tileKey(x, y);
                if (game.walls.has(key) || game.iceTiles.has(key) || game.pillars.has(key) || game.iceBlocks.has(key)) continue;
                if (game.traps.some(t => t.x === x && t.y === y)) continue;
                if (game.players.some(p => p.health > 0 && p.x === x && p.y === y)) continue;
                if (game.items.some(i => i.x === x && i.y === y)) continue;
                options.push({x, y});
            }
        }
        return options.length ? options[Math.floor(Math.random() * options.length)] : null;
    }

    function spawnItem(now) {
        const cell = randomOpenCell();
        if (!cell) return;
        const types = ["extraTrap", "blastRange", "rollerSkates", "shoes", "superman", "banana", "glue", "devil"];
        const type = types[Math.floor(Math.random() * types.length)];
        game.items.push({...cell, type, bornAt: now});

        let msg = "";
        switch (type) {
            case "extraTrap":
                msg = "함정 추가 설치!";
                break;
            case "blastRange":
                msg = "폭발 범위 증가!";
                break;
            case "rollerSkates":
                msg = "롤러 스케이트 (이동 속도 증가)";
                break;
            case "shoes":
                msg = "신발 (함정 차기)";
                break;
            case "superman":
                msg = "슈퍼맨 (20초간 최대 능력치)";
                break;
            case "banana":
                msg = "바나나 (미끄러짐)";
                break;
            case "glue":
                msg = "본드 (20초간 속도 저하)";
                break;
            case "devil":
                msg = "악마 (20초간 방향 반전 및 강제 함정)";
                break;
        }
        eventMessageEl.textContent = `아이템 등장: ${msg}`;
    }

    function collectItem(player, now) {
        const index = game.items.findIndex(i => i.x === player.x && i.y === player.y);
        if (index < 0) return;
        const [item] = game.items.splice(index, 1);

        switch (item.type) {
            case "extraTrap":
                player.trapCapacity = Math.min(4, player.trapCapacity + 1);
                eventMessageEl.textContent = `P${player.id}: 함정 한도 ${player.trapCapacity}개!`;
                break;
            case "blastRange":
                player.blastRange = Math.min(3, player.blastRange + 1);
                eventMessageEl.textContent = `P${player.id}: 폭발 범위 ${player.blastRange}칸!`;
                break;
            case "rollerSkates":
                player.skateUntil = now + 20000;
                player.glueUntil = 0;
                eventMessageEl.textContent = `P${player.id}: 롤러 스케이트! (속도 증가)`;
                break;
            case "shoes":
                player.hasShoes = true;
                eventMessageEl.textContent = `P${player.id}: 신발 장착! (함정을 찰 수 있음)`;
                break;
            case "superman":
                player.supermanUntil = now + 20000;
                eventMessageEl.textContent = `P${player.id}: 슈퍼맨! (20초간 최대 능력치)`;
                break;
            case "banana":
                eventMessageEl.textContent = `P${player.id}: 바나나를 밟아 미끄러집니다!`;
                player.slipUntil = now + 450;
                const dx = Math.sign(player.x - player.moveFromX) || (Math.random() < 0.5 ? 1 : -1);
                const dy = Math.sign(player.y - player.moveFromY) || 0;
                const direction = (dx !== 0 || dy !== 0) ? [dx, dy] : [1, 0];
                for (let step = 0; step < 2; step++) {
                    const nx = player.x + direction[0];
                    const ny = player.y + direction[1];
                    if (isBlocked(nx, ny, player.id) || playerAt(nx, ny, player.id)) break;
                    player.moveFromX = player.x;
                    player.moveFromY = player.y;
                    player.x = nx;
                    player.y = ny;
                    setTimeout(() => collectItem(player, performance.now()), 10);
                }
                break;
            case "glue":
                player.glueUntil = now + 20000;
                player.skateUntil = 0;
                eventMessageEl.textContent = `P${player.id}: 본드에 발이 붙었습니다! (속도 저하)`;
                break;
            case "devil":
                player.devilUntil = now + 20000;
                eventMessageEl.textContent = `P${player.id}: 악마의 저주! (방향 반전, 강제 함정)`;
                break;
        }
        updateHud(now);
    }

    function createIceShards(x, y, now) {
        const c = tileCenter(x, y);
        for (let i = 0; i < 9; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 35 + Math.random() * 115;
            const size = 3 + Math.random() * 7;
            game.particles.push({
                x: c.x, y: c.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 25,
                size, bornAt: now, life: 350 + Math.random() * 350,
                color: Math.random() < 0.5 ? "#c8f5ff" : "#ffffff",
                rotation: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 8
            });
        }
    }

    function updateParticles(now, delta) {
        if (!game) return;
        const seconds = delta / 1000;
        game.particles.forEach(particle => {
            particle.x += particle.vx * seconds;
            particle.y += particle.vy * seconds;
            particle.vy += 220 * seconds;
            particle.vx *= 0.985;
            particle.rotation += particle.spin * seconds;
        });
        game.particles = game.particles.filter(p => now - p.bornAt < p.life);
    }

    function detonateTrap(trap, now) {
        game.traps = game.traps.filter(t => t !== trap);
        const affected = [];
        game.players.forEach(player => {
            if (player.health <= 0) return;
            const distance = Math.abs(player.x - trap.x) + Math.abs(player.y - trap.y);
            if (distance <= trap.range && now >= player.invulnerableUntil) {
                player.health -= 1;
                player.frozenUntil = now + FREEZE_DURATION;
                player.invulnerableUntil = now + 900;
                affected.push(player.id);
            }
        });

        const blastCells = [{x: trap.x, y: trap.y}];
        for (let distance = 1; distance <= trap.range; distance++) {
            blastCells.push(
                {x: trap.x - distance, y: trap.y}, {x: trap.x + distance, y: trap.y},
                {x: trap.x, y: trap.y - distance}, {x: trap.x, y: trap.y + distance}
            );
        }

        blastCells.forEach(({x, y}) => {
            if (!inside(x, y)) return;
            const key = tileKey(x, y);
            if (game.iceBlocks.has(key)) {
                createIceShards(x, y, now);
                game.iceBlocks.delete(key);
                const lootType = game.iceBlockLoot.get(key);
                game.iceBlockLoot.delete(key);
                if (lootType) game.items.push({x, y, type: lootType, bornAt: now});
            }
            if (!game.walls.has(key)) game.iceTiles.set(key, now + 500);
        });

        if (affected.length) {
            eventMessageEl.textContent = `얼음 폭발! PLAYER ${affected.join(", ")} 피해를 입었습니다.`;
        } else {
            eventMessageEl.textContent = "얼음 함정이 발동했습니다. 폭발 범위를 피했습니다!";
        }

        const p1Dead = game.players[0].health <= 0;
        const p2Dead = game.players[1].health <= 0;
        if (p1Dead && p2Dead) endGame(0); else if (p1Dead) endGame(2); else if (p2Dead) endGame(1);
        updateHud(now);
    }

    function processInput(now, delta) {
        while (keyQueue.length) {
            const code = keyQueue.shift();
            if (!game.running) continue;
            if (code === "KeyF") placeTrap(game.players[0], now);
            else if (code === "Enter") placeTrap(game.players[1], now);
            else if (directions[code]) {
                const player = code.startsWith("Arrow") ? game.players[1] : game.players[0];
                const [dx, dy] = directions[code];
                movePlayer(player, dx, dy, now);
            }
        }

        // 플레이어별 개별 타이머 적용
        game.players.forEach(player => {
            if (player.health <= 0 || now < player.frozenUntil) return;
            const c = player.controls;

            let currentDelay = BASE_MOVE_DELAY;
            if (now < player.skateUntil) currentDelay = BASE_MOVE_DELAY * 0.55;
            else if (now < player.glueUntil) currentDelay = BASE_MOVE_DELAY * 2.2;

            if (player.moveCooldown === 0) {
                player.moveCooldown = now + currentDelay;
            }

            if (now >= player.moveCooldown) {
                let dx = 0, dy = 0;
                if (keysDown.has(c.up)) dy = -1; else if (keysDown.has(c.down)) dy = 1; else if (keysDown.has(c.left)) dx = -1; else if (keysDown.has(c.right)) dx = 1;

                if (dx || dy) {
                    movePlayer(player, dx, dy, now);
                    player.moveCooldown = now + currentDelay;
                } else {
                    player.moveCooldown = now;
                }
            }
        });
    }

    function updateTraps(now) {
        if (now >= game.nextItemAt) {
            spawnItem(now);
            game.nextItemAt = now + ITEM_SPAWN_INTERVAL;
        }
        const ready = game.traps.filter(t => now >= t.detonatesAt);
        ready.forEach(t => {
            if (game.running) detonateTrap(t, now);
        });
        for (const [key, until] of game.iceTiles.entries()) {
            if (now >= until) game.iceTiles.delete(key);
        }
    }

    function loop(now) {
        if (!game || !game.running) return;
        const delta = Math.min(now - lastFrame, 50);
        lastFrame = now;
        elapsedMs += delta;

        processInput(now, delta);
        updateTraps(now);
        updateParticles(now, delta);

        if (getRemainingTime(now) <= 0) {
            endGame(0);
            updateHud(now);
            draw(now);
            return;
        }

        updateHud(now);
        draw(now);

        if (game.running) frameId = requestAnimationFrame(loop);
    }

    const GRID_SIZE = 64;
    const GRID_LEFT = 160;
    const GRID_TOP = 40;

    function tileCenter(x, y) {
        return {
            x: GRID_LEFT + x * GRID_SIZE + GRID_SIZE / 2,
            y: GRID_TOP + y * GRID_SIZE + GRID_SIZE / 2
        };
    }

    function getVisualPosition(player, now) {
        if (!player.moveStartedAt) return {x: player.x, y: player.y};
        const progress = Math.max(0, Math.min(1, (now - player.moveStartedAt) / player.moveDuration));

        // [수정] easeInOutQuad: 천천히 시작해서 빨라졌다가 천천히 멈춤
        const eased = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        return {
            x: player.moveFromX + (player.x - player.moveFromX) * eased,
            y: player.moveFromY + (player.y - player.moveFromY) * eased
        };
    }

    function draw(now = performance.now()) {
        if (!game) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (background.complete && background.naturalWidth > 0) {
            ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = "#dff6ff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.save();

        // 기둥 그리기
        for (const key of game.pillars) {
            const [x, y] = key.split(",").map(Number);
            const c = tileCenter(x, y);
            ctx.save();
            ctx.fillStyle = "rgba(10, 50, 80, 0.22)";
            ctx.beginPath();
            ctx.ellipse(c.x + 2, c.y + 13, 24, 12, 0, 0, Math.PI * 2);
            ctx.fill();
            const side = ctx.createLinearGradient(c.x - 20, c.y, c.x + 22, c.y);
            side.addColorStop(0, "#426f89");
            side.addColorStop(0.35, "#8dc5dc");
            side.addColorStop(0.7, "#4d829d");
            side.addColorStop(1, "#315d78");
            ctx.fillStyle = side;
            ctx.beginPath();
            ctx.roundRect(c.x - 20, c.y - 17, 40, 36, 8);
            ctx.fill();
            const top = ctx.createLinearGradient(c.x - 18, c.y - 28, c.x + 18, c.y - 5);
            top.addColorStop(0, "#f5fdff");
            top.addColorStop(0.5, "#bcecff");
            top.addColorStop(1, "#73b8d5");
            ctx.fillStyle = top;
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(c.x, c.y - 17, 20, 11, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        // 얼음 블록 그리기
        for (const key of game.iceBlocks) {
            const [x, y] = key.split(",").map(Number);
            const c = tileCenter(x, y);
            const size = GRID_SIZE - 10;
            const left = c.x - size / 2;
            const top = c.y - size / 2;
            ctx.save();
            ctx.fillStyle = "rgba(35, 145, 190, 0.20)";
            ctx.beginPath();
            ctx.roundRect(left + 3, top + 5, size, size, 12);
            ctx.fill();
            ctx.shadowColor = "rgba(94, 218, 255, 0.5)";
            ctx.shadowBlur = 12;
            const ice = ctx.createLinearGradient(left, top, left + size, top + size);
            ice.addColorStop(0, "rgba(246, 254, 255, 0.98)");
            ice.addColorStop(0.35, "rgba(177, 237, 255, 0.94)");
            ice.addColorStop(0.72, "rgba(116, 207, 239, 0.92)");
            ice.addColorStop(1, "rgba(194, 245, 255, 0.98)");
            ctx.fillStyle = ice;
            ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(left, top, size, size, 11);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        // 폭발 타일
        for (const [key, until] of game.iceTiles.entries()) {
            const [x, y] = key.split(",").map(Number);
            const c = tileCenter(x, y);
            const remaining = Math.max(0, Math.min(1, (until - now) / 500));
            const size = (GRID_SIZE - 4) * (1 + Math.sin(now / 35) * 0.035);
            ctx.save();
            ctx.globalAlpha = remaining;
            ctx.shadowColor = "#4edcff";
            ctx.shadowBlur = 22;
            const blast = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, size * 0.72);
            blast.addColorStop(0, "rgba(255,255,255,0.98)");
            blast.addColorStop(0.35, "rgba(131,235,255,0.95)");
            blast.addColorStop(1, "rgba(40,160,255,0.38)");
            ctx.fillStyle = blast;
            ctx.beginPath();
            ctx.roundRect(c.x - size / 2, c.y - size / 2, size, size, 12);
            ctx.fill();
            ctx.restore();
        }

        // 함정 그리기
        game.traps.forEach(trap => {
            const c = tileCenter(trap.x, trap.y);
            const pulse = 1 + Math.sin(now / 95) * .10;
            ctx.save();
            ctx.translate(c.x, c.y - 5);
            ctx.scale(pulse, pulse);
            ctx.fillStyle = "rgba(0, 20, 40, .35)";
            ctx.beginPath();
            ctx.ellipse(0, 19, 22, 9, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = .32;
            ctx.fillStyle = trap.ownerId === 1 ? "#2dbfff" : "#ff5caa";
            ctx.beginPath();
            ctx.arc(0, 3, 26, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            const orb = ctx.createRadialGradient(-7, -10, 3, 0, 0, 22);
            orb.addColorStop(0, "#ffffff");
            orb.addColorStop(.42, trap.ownerId === 1 ? "#83e4ff" : "#ffc0dd");
            orb.addColorStop(1, trap.ownerId === 1 ? "#0879bb" : "#c62e78");
            ctx.fillStyle = orb;
            ctx.strokeStyle = "#effcff";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 1, 19, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        });

        // 아이템 그리기
        game.items.forEach(item => {
            if (game.iceBlocks.has(tileKey(item.x, item.y))) return;
            const c = tileCenter(item.x, item.y);
            const bob = Math.sin(now / 180 + item.x) * 4;
            const pulse = 1 + Math.sin(now / 130 + item.y) * 0.06;

            let color = "#ffffff", bright = "#ffffff", symbol = "?";

            switch (item.type) {
                case "extraTrap":
                    color = "#ffc94d";
                    bright = "#fff4bd";
                    symbol = "+";
                    break;
                case "blastRange":
                    color = "#a68bff";
                    bright = "#eee5ff";
                    symbol = "✦";
                    break;
                case "rollerSkates":
                    color = "#4ade80";
                    bright = "#dcfce7";
                    symbol = "🛼";
                    break;
                case "shoes":
                    color = "#f87171";
                    bright = "#fee2e2";
                    symbol = "👟";
                    break;
                case "superman":
                    color = "#3b82f6";
                    bright = "#dbeafe";
                    symbol = "🦸";
                    break;
                case "banana":
                    color = "#fde047";
                    bright = "#fef08a";
                    symbol = "🍌";
                    break;
                case "glue":
                    color = "#9ca3af";
                    bright = "#f3f4f6";
                    symbol = "💧";
                    break;
                case "devil":
                    color = "#9333ea";
                    bright = "#f3e8ff";
                    symbol = "😈";
                    break;
            }

            ctx.save();
            ctx.translate(c.x, c.y - 5 + bob);
            ctx.scale(pulse, pulse);

            ctx.fillStyle = "rgba(20, 65, 100, 0.20)";
            ctx.beginPath();
            ctx.ellipse(0, 22 - bob, 14, 5, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowColor = color;
            ctx.shadowBlur = 20;

            const orb = ctx.createRadialGradient(-6, -7, 2, 0, 0, 21);
            orb.addColorStop(0, "#ffffff");
            orb.addColorStop(0.35, bright);
            orb.addColorStop(1, color);

            ctx.fillStyle = orb;
            ctx.strokeStyle = "rgba(255,255,255,0.98)";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, 17, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.fillStyle = "#263c58";
            ctx.font = "900 20px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(symbol, 0, 1);

            ctx.restore();
        });

        // 얼음 파편
        game.particles.forEach(particle => {
            const progress = (now - particle.bornAt) / particle.life;
            const alpha = Math.max(0, 1 - progress);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(particle.x, particle.y);
            ctx.rotate(particle.rotation);
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.moveTo(0, -particle.size);
            ctx.lineTo(particle.size * 0.8, 0);
            ctx.lineTo(0, particle.size * 0.65);
            ctx.lineTo(-particle.size * 0.65, 0);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        });

        // 플레이어 그리기
        game.players.forEach(player => {
            if (player.health <= 0) return;
            const visual = getVisualPosition(player, now);
            const c = tileCenter(visual.x, visual.y);
            const frozen = now < player.frozenUntil;

            // 상태 효과 오라 표시
            ctx.save();
            if (now < player.supermanUntil) {
                ctx.shadowColor = "#fbbf24";
                ctx.shadowBlur = 25;
            } else if (now < player.devilUntil) {
                ctx.shadowColor = "#9333ea";
                ctx.shadowBlur = 20;
            } else if (now < player.skateUntil) {
                ctx.shadowColor = "#4ade80";
                ctx.shadowBlur = 15;
            } else if (now < player.glueUntil) {
                ctx.shadowColor = "#9ca3af";
                ctx.shadowBlur = 15;
            }

            if (frozen) ctx.globalAlpha = .65;

            // 그림자
            ctx.fillStyle = "rgba(0, 43, 70, .35)";
            ctx.beginPath();
            ctx.ellipse(c.x, c.y + 10, 25, 13, 0, 0, Math.PI * 2);
            ctx.fill();

            // 몸체
            ctx.fillStyle = player.color;
            ctx.strokeStyle = "#f5fdff";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(c.x, c.y - 9, 20, 25, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // 눈 (바이저)
            ctx.fillStyle = "#10314c";
            ctx.beginPath();
            ctx.ellipse(c.x, c.y - 14, 12, 9, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(c.x - 4, c.y - 15, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(c.x + 4, c.y - 15, 2.5, 0, Math.PI * 2);
            ctx.fill();

            // 이름표
            ctx.globalAlpha = 1;
            ctx.fillStyle = player.id === 1 ? "#064d7c" : "#8c174c";
            ctx.strokeStyle = "rgba(255,255,255,.9)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(c.x - 22, c.y - 49, 44, 19, 7);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#fff";
            ctx.font = "800 11px Inter, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`P${player.id}`, c.x, c.y - 39);

            // 신발 장착 표시
            if (player.hasShoes) {
                ctx.font = "14px sans-serif";
                ctx.fillText("👟", c.x + 18, c.y + 5);
            }

            // 얼음/본드 상태 표시
            if (frozen) {
                ctx.font = "bold 24px sans-serif";
                ctx.fillText("❄", c.x + 21, c.y - 32);
            } else if (now < player.glueUntil) {
                ctx.font = "18px sans-serif";
                ctx.fillText("💧", c.x + 21, c.y - 32);
            } else if (now < player.devilUntil) {
                ctx.font = "18px sans-serif";
                ctx.fillText("😈", c.x + 21, c.y - 32);
            }

            ctx.restore();
        });
        ctx.restore();
    }

    function updateHud(now = performance.now()) {
        if (!game) return;

        const [p1, p2] = game.players;

        document.getElementById("p1-health").textContent = "♥ ".repeat(Math.max(0, p1.health)).trim() || "—";
        document.getElementById("p2-health").textContent = "♥ ".repeat(Math.max(0, p2.health)).trim() || "—";

        const getStateStr = (p) => {
            if (p.health <= 0) return "탈락";
            if (now < p.frozenUntil) return "얼어붙음";
            if (now < p.glueUntil) return "본드에 붙음";
            if (now < p.devilUntil) return "악마의 저주";
            if (now < p.supermanUntil) return "슈퍼맨!";
            if (now < p.skateUntil) return "스케이트!";
            return `함정 ${countPlayerTraps(p.id)}/${p.trapCapacity} · 범위 ${p.blastRange}`;
        };

        document.getElementById("p1-state").textContent = getStateStr(p1);
        document.getElementById("p2-state").textContent = getStateStr(p2);

        trapCountEl.textContent = `P1 ${Math.max(0, p1.trapCapacity - countPlayerTraps(1))} · P2 ${Math.max(0, p2.trapCapacity - countPlayerTraps(2))}`;

        const remainingMs = getRemainingTime(now);
        const totalSeconds = Math.ceil(remainingMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        gameTimeEl.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
    }

    document.addEventListener("keydown", event => {
        const relevant = directions[event.code] || event.code === "KeyF" || event.code === "Enter";
        if (!relevant) return;
        event.preventDefault();
        if (!keysDown.has(event.code)) keyQueue.push(event.code);
        keysDown.add(event.code);
    });

    document.addEventListener("keyup", event => keysDown.delete(event.code));
    window.addEventListener("blur", () => keysDown.clear());
    startButton.addEventListener("click", () => {
        if (game && game.ended) resetGame(true); else startGame();
    });
    restartButton.addEventListener("click", () => resetGame(false));

    resetGame(false);
})();