/*:
 * @target MZ
 * @plugindesc ZUIKO｜濕地警戒：地圖生存小遊戲
 *
 * @command start
 * @text 開始濕地巡查
 *
 * @arg seconds
 * @text 巡查秒數
 * @type number
 * @min 6
 * @default 180
 *
 * @arg resultVariable
 * @text 結果變數
 * @type variable
 * @default 0
 *
 * @arg scoreVariable
 * @text 驅離數變數
 * @type variable
 * @default 0
 *
 * @arg resultEvent
 * @text 結算共通事件
 * @type common_event
 * @default 0
 *
 * @arg shotSe
 * @text 發射音效
 * @type file
 * @dir audio/se/
 *
 * @command stop
 * @text 中止濕地巡查
 *
 * @help
 * 將本檔放入 js/plugins，再於插件管理器啟用。
 * 用專用的非循環地圖，建議至少 20 × 15 格，避免同時觸發劇情。
 * 在 NPC 的決定鍵事件最後呼叫「開始濕地巡查」。
 * 方向鍵／WASD 移動，長按空白鍵／滑鼠左鍵射擊，Esc 暫停／繼續。
 *
 * 小遊戲體力獨立於隊員 HP。死亡或撤離後會自動清除 HUD 與物件。
 * 結果變數：0 巡查中、1 撤離成功、2 體力耗盡、3 中止。
 * 驅離數變數在結束時寫入。正常結算後執行選填的結算共通事件。
 * 若未指定共通事件，插件會顯示簡短結算。中止時不執行共通事件。
 * 雁群與彈丸可穿越地形，玩家遵守圖塊通行設定。
 */
(() => {
    "use strict";

    const name = "ZuikoWetlandWatch";
    const fps = 60;
    const waveTypes = [
        { name: "加拿大雁", color: "#a88c6d", speed: 1.50, damage: 14, behavior: "flock", group: 3 },
        { name: "小加拿大雁", color: "#d4bb9b", speed: 1.72, damage: 12, behavior: "dash", group: 2 },
        { name: "黑雁", color: "#596981", speed: 1.58, damage: 14, behavior: "flank", group: 2 },
        { name: "白頰黑雁", color: "#9da9b7", speed: 1.80, damage: 16, behavior: "pair", group: 2 },
        { name: "紅胸黑雁", color: "#cf7559", speed: 1.72, damage: 18, behavior: "lunge", group: 2 },
        { name: "夏威夷雁", color: "#b7b582", speed: 2.48, damage: 16, behavior: "direct", group: 2 }
    ];
    const gunPhases = [
        { label: "退殼", frames: 30 },
        { label: "上殼", frames: 24 },
        { label: "發射", frames: 6 }
    ];
    const keys = {
        32: "zuikoFire",
        65: "zuikoLeft",
        68: "zuikoRight",
        83: "zuikoDown",
        87: "zuikoUp"
    };
    let patrol = null;

    function activeOn(scene) {
        return patrol && patrol.scene === scene;
    }

    function held(key, alternate) {
        return Input.isPressed(key) || Input.isPressed(alternate);
    }

    function unitVector(x, y) {
        const length = Math.hypot(x, y);
        return length ? { x: x / length, y: y / length } : { x: 0, y: 0 };
    }

    function birdBitmap(color) {
        const bitmap = new Bitmap(24, 20);
        bitmap.smooth = false;
        bitmap.fillRect(1, 10, 16, 7, "#252e38");
        bitmap.fillRect(3, 8, 14, 8, color);
        bitmap.fillRect(4, 11, 9, 4, "#45515d");
        bitmap.fillRect(14, 4, 4, 9, "#252e38");
        bitmap.fillRect(15, 1, 6, 6, "#252e38");
        bitmap.fillRect(17, 4, 3, 2, "#eee7d7");
        bitmap.fillRect(21, 3, 3, 2, "#d7a968");
        return bitmap;
    }

    function makeSprite(bitmap, z) {
        const sprite = new Sprite(bitmap);
        sprite.anchor.set(0.5);
        sprite.z = z;
        patrol.tilemap.addChild(sprite);
        return sprite;
    }

    function removeSprite(sprite) {
        sprite.parent?.removeChild(sprite);
        sprite.destroy();
    }

    function setVariable(id, value) {
        if (id > 0) {
            $gameVariables.setValue(id, value);
        }
    }

    function start(scene, args) {
        const total = Math.max(6, Math.trunc(Number(args.seconds) || 180)) * fps;
        const hud = new Sprite(new Bitmap(Math.min(Graphics.width - 16, 490), 82));
        const pellet = new Bitmap(8, 8);
        pellet.drawCircle(4, 4, 3, "#ffdb82");

        const savedKeys = Object.entries(keys).map(([code, symbol]) => {
            const previous = Input.keyMapper[code];
            Input.keyMapper[code] = symbol;
            return { code, previous };
        });
        Input.clear();
        $gameTemp.clearDestination();

        const facing = $gamePlayer.direction();
        patrol = {
            scene,
            tilemap: scene._spriteset._tilemap,
            mapId: $gameMap.mapId(),
            total,
            remaining: total,
            hp: 100,
            score: 0,
            wave: 0,
            spawnIn: 1,
            invulnerable: 0,
            aim: { x: Number(facing === 4) - Number(facing === 6), y: Number(facing === 8) - Number(facing === 2) },
            gunPhase: 0,
            gunFrame: 0,
            paused: false,
            birds: [],
            shots: [],
            birdBitmaps: waveTypes.map(type => birdBitmap(type.color)),
            pellet,
            hud,
            savedKeys,
            resultVariable: Number(args.resultVariable),
            scoreVariable: Number(args.scoreVariable),
            resultEvent: Number(args.resultEvent),
            shotSe: args.shotSe
        };
        hud.move(8, 8);
        scene.addChild(hud);
        setVariable(patrol.resultVariable, 0);
        setVariable(patrol.scoreVariable, 0);
        drawHud();
    }

    function finish(result) {
        const state = patrol;
        patrol = null;
        for (const { code, previous } of state.savedKeys) {
            if (Input.keyMapper[code] === keys[code]) {
                if (previous === undefined) {
                    delete Input.keyMapper[code];
                } else {
                    Input.keyMapper[code] = previous;
                }
            }
        }
        Input.clear();
        $gameTemp.clearDestination();

        for (const { sprite } of [...state.birds, ...state.shots]) {
            removeSprite(sprite);
        }
        const hudBitmap = state.hud.bitmap;
        removeSprite(state.hud);
        for (const bitmap of [...state.birdBitmaps, state.pellet, hudBitmap]) {
            bitmap.destroy();
        }

        setVariable(state.resultVariable, result);
        setVariable(state.scoreVariable, state.score);
        if (result === 3) return;

        if ($dataCommonEvents[state.resultEvent]) {
            $gameTemp.reserveCommonEvent(state.resultEvent);
        } else {
            const message = result === 1 ? "撤離成功！" : "體力耗盡，巡查結束。";
            $gameMessage.add(message + "\n已驅離 " + state.score + " 隻。");
        }
    }

    function spawnBirds(player) {
        const type = waveTypes[patrol.wave];
        const angle = Math.random() * Math.PI * 2;
        const distance = 6 + Math.random() * 3;
        for (let i = 0; i < type.group && patrol.birds.length < 28; i++) {
            const offset = (i - (type.group - 1) / 2) * 0.20;
            const x = Math.max(0, Math.min($gameMap.width() - 1, player.x + Math.cos(angle + offset) * distance));
            const y = Math.max(0, Math.min($gameMap.height() - 1, player.y + Math.sin(angle + offset) * distance));
            if (Math.hypot(player.x - x, player.y - y) < 3) continue;

            const sprite = makeSprite(patrol.birdBitmaps[patrol.wave], 3);
            sprite.scale.set(1.4);
            patrol.birds.push({ x, y, type, sprite, age: 0, side: i % 2 ? -1 : 1 });
        }
    }

    function placeSprite(entity) {
        entity.sprite.x = ($gameMap.adjustX(entity.x) + 0.5) * $gameMap.tileWidth();
        entity.sprite.y = ($gameMap.adjustY(entity.y) + 0.5) * $gameMap.tileHeight();
    }

    function updateBirds(player) {
        for (const bird of patrol.birds) {
            const dx = player.x - bird.x;
            const dy = player.y - bird.y;
            const distance = Math.hypot(dx, dy);
            const type = bird.type;
            bird.age++;
            let angle = Math.atan2(dy, dx);
            let speed = type.speed;

            switch (type.behavior) {
                case "flock":
                    angle += bird.side * Math.min(distance / 12, 0.34);
                    break;
                case "dash":
                    if (bird.age % 115 >= 91) speed *= 2.2;
                    break;
                case "flank":
                    angle += bird.side * Math.min(distance / 5, 0.85);
                    break;
                case "pair":
                    angle += bird.side * Math.min(distance / 9, 0.55);
                    break;
                case "lunge":
                    if (distance < 2.3) speed *= 1.9;
                    break;
            }

            const vx = Math.cos(angle) * speed / fps;
            const vy = Math.sin(angle) * speed / fps;
            bird.x = Math.max(0, Math.min($gameMap.width() - 1, bird.x + vx));
            bird.y = Math.max(0, Math.min($gameMap.height() - 1, bird.y + vy));
            bird.sprite.scale.x = vx < 0 ? -1.4 : 1.4;
            if (!patrol.invulnerable && Math.hypot(player.x - bird.x, player.y - bird.y) < 0.57) {
                patrol.hp = Math.max(0, patrol.hp - type.damage);
                patrol.invulnerable = 48;
            }
            placeSprite(bird);
        }
    }

    function fire(player) {
        const { x, y } = patrol.aim;
        patrol.shots.push({
            x: player.x + x * 0.35,
            y: player.y + y * 0.35,
            vx: x * 0.30,
            vy: y * 0.30,
            life: 42,
            sprite: makeSprite(patrol.pellet, 4)
        });
        if (patrol.shotSe) {
            AudioManager.playSe({ name: patrol.shotSe, volume: 75, pitch: 100, pan: 0 });
        }
    }

    function updateGun(player) {
        const firing = Input.isPressed("zuikoFire") || TouchInput.isPressed();
        if (!firing && patrol.gunPhase === 0 && patrol.gunFrame === 0) return;

        patrol.gunFrame++;
        if (patrol.gunFrame < gunPhases[patrol.gunPhase].frames) return;

        patrol.gunFrame = 0;
        patrol.gunPhase = (patrol.gunPhase + 1) % gunPhases.length;
        if (patrol.gunPhase === 2) {
            fire(player);
        }
    }

    function updateShots() {
        for (let i = patrol.shots.length - 1; i >= 0; i--) {
            const shot = patrol.shots[i];
            shot.x += shot.vx;
            shot.y += shot.vy;
            shot.life--;
            const index = patrol.birds.findIndex(bird => Math.hypot(bird.x - shot.x, bird.y - shot.y) < 0.49);
            if (index >= 0) {
                const [bird] = patrol.birds.splice(index, 1);
                removeSprite(bird.sprite);
                patrol.score++;
            }

            const outside = shot.x < -0.5 || shot.y < -0.5 ||
                shot.x > $gameMap.width() - 0.5 || shot.y > $gameMap.height() - 0.5;
            if (index >= 0 || shot.life <= 0 || outside) {
                patrol.shots.splice(i, 1);
                removeSprite(shot.sprite);
            } else {
                placeSprite(shot);
            }
        }
    }

    function drawHud() {
        const seconds = Math.ceil(patrol.remaining / fps);
        const time = String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
        const gun = gunPhases[patrol.gunPhase].label;
        const status = patrol.paused ? "暫停中（Esc 繼續）" :
            "第 " + (patrol.wave + 1) + "/6 波 · " + waveTypes[patrol.wave].name + "　｜　" + gun;
        const summary = "撤離 " + time + "　體力 " + patrol.hp + "/100　已驅離 " + patrol.score;
        const key = status + "|" + summary + "|" + patrol.gunFrame;
        if (key === patrol.hudKey) return;
        patrol.hudKey = key;

        const bitmap = patrol.hud.bitmap;
        bitmap.clear();
        bitmap.fillAll("rgba(22, 32, 41, 0.88)");
        bitmap.fontFace = $gameSystem.mainFontFace();
        bitmap.fontSize = 19;
        bitmap.drawText(summary, 12, 4, bitmap.width - 24, 26);
        bitmap.fontSize = 17;
        bitmap.drawText(status, 12, 31, bitmap.width - 24, 24);
        const barWidth = bitmap.width - 24;
        bitmap.fillRect(12, 63, barWidth, 5, "#4e5d64");
        bitmap.fillRect(12, 63, Math.floor(barWidth * patrol.gunFrame / gunPhases[patrol.gunPhase].frames), 5, "#e6b86c");
    }

    function updatePatrol() {
        if (patrol.mapId !== $gameMap.mapId() || $gamePlayer.isTransferring()) {
            finish(3);
            return;
        }
        if ($gameMessage.isBusy() || patrol.paused) {
            for (const entity of [...patrol.birds, ...patrol.shots]) placeSprite(entity);
            drawHud();
            return;
        }

        const player = { x: $gamePlayer._realX, y: $gamePlayer._realY };
        const wave = Math.min(waveTypes.length - 1, Math.floor(
            (patrol.total - patrol.remaining) * waveTypes.length / patrol.total
        ));
        if (wave !== patrol.wave) {
            patrol.wave = wave;
            patrol.spawnIn = 1;
        }
        patrol.remaining--;
        patrol.invulnerable = Math.max(0, patrol.invulnerable - 1);
        if (--patrol.spawnIn <= 0) {
            spawnBirds(player);
            patrol.spawnIn = 165 - patrol.wave * 12;
        }
        updateGun(player);
        updateShots();
        updateBirds(player);

        if (patrol.hp <= 0) {
            finish(2);
        } else if (patrol.remaining <= 0) {
            finish(1);
        } else {
            drawHud();
        }
    }

    const moveByInput = Game_Player.prototype.moveByInput;
    Game_Player.prototype.moveByInput = function() {
        if (!patrol) {
            moveByInput.call(this);
            return;
        }
        if (patrol.paused || this.isMoving() || !this.canMove()) return;

        const x = Number(held("right", "zuikoRight")) - Number(held("left", "zuikoLeft"));
        const y = Number(held("down", "zuikoDown")) - Number(held("up", "zuikoUp"));
        const oldX = this.x;
        const oldY = this.y;
        if (x && y) {
            this.moveDiagonally(x > 0 ? 6 : 4, y > 0 ? 2 : 8);
        } else if (x || y) {
            this.moveStraight(x ? (x > 0 ? 6 : 4) : (y > 0 ? 2 : 8));
        }
        if (this.x !== oldX || this.y !== oldY) {
            patrol.aim = unitVector(oldX - this.x, oldY - this.y);
        }
    };

    const mapUpdate = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        const wasRunning = activeOn(this);
        if (wasRunning && !$gameMessage.isBusy() && Input.isTriggered("cancel")) {
            patrol.paused = !patrol.paused;
        }
        mapUpdate.call(this);
        if (wasRunning && activeOn(this)) updatePatrol();
    };

    const processMapTouch = Scene_Map.prototype.processMapTouch;
    Scene_Map.prototype.processMapTouch = function() {
        if (!activeOn(this)) processMapTouch.call(this);
    };

    const isMenuEnabled = Scene_Map.prototype.isMenuEnabled;
    Scene_Map.prototype.isMenuEnabled = function() {
        return !activeOn(this) && isMenuEnabled.call(this);
    };

    const updateEncounter = Scene_Map.prototype.updateEncounter;
    Scene_Map.prototype.updateEncounter = function() {
        if (!activeOn(this)) updateEncounter.call(this);
    };

    const startMapEvent = Game_Player.prototype.startMapEvent;
    Game_Player.prototype.startMapEvent = function(...args) {
        if (!patrol) startMapEvent.apply(this, args);
    };

    const terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function() {
        if (activeOn(this)) finish(3);
        terminate.call(this);
    };

    PluginManager.registerCommand(name, "start", args => {
        const scene = SceneManager._scene;
        if (patrol || !(scene instanceof Scene_Map) || !scene._spriteset?._tilemap) return;
        if ($gameMap.isLoopHorizontal() || $gameMap.isLoopVertical()) {
            $gameMessage.add("請在非循環地圖啟動濕地巡查。");
            return;
        }
        start(scene, args);
    });

    PluginManager.registerCommand(name, "stop", () => {
        if (patrol) finish(3);
    });
})();
