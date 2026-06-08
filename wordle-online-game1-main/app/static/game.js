// =====================================================
// Wordle Online Game - Render Safe Version
// =====================================================

const socket = io();

let currentUser = "";
let currentRoom = "";
let currentGuess = "";
let currentRow = 0;
let isGameOver = false;
let currentMode = "single";
let miniLeaderboardInterval = null;
let timerInterval = null;
let currentHistoryTab = "frenzy";

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

function $(id) {
    return document.getElementById(id);
}

function showMessage(text, color = "red") {
    const box = $("message-box") || $("auth-message");
    if (box) {
        box.innerText = text;
        box.style.color = color;
    }
}

function showAuthMessage(text, color = "red") {
    const box = $("auth-message");
    if (box) {
        box.innerText = text;
        box.style.color = color;
    }
}

function hideAllMainSections() {
    const ids = [
        "auth-section",
        "mode-selection-section",
        "multiplayer-lobby-section",
        "leaderboard-section",
        "account-info-section",
        "waiting-room-section",
        "game-section"
    ];

    ids.forEach(id => {
        const el = $(id);
        if (el) el.style.display = "none";
    });
}

function showModeSelection() {
    hideAllMainSections();

    const modeSection = $("mode-selection-section");
    if (modeSection) modeSection.style.display = "block";

    const logo = $("logo-section");
    if (logo) logo.style.display = "block";

    const settings = $("settings-container");
    if (settings) settings.style.display = "block";

    const welcome = $("welcome-message");
    if (welcome) welcome.innerText = `歡迎，${currentUser}`;
}

async function register() {
    const username = $("username").value.trim();
    const password = $("password").value.trim();

    if (!username || !password) {
        showAuthMessage("請輸入帳號與密碼");
        return;
    }

    try {
        const res = await fetch("/api/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (data.status === "success") {
            showAuthMessage(data.message || "註冊成功，請登入", "green");
        } else {
            showAuthMessage(data.message || "註冊失敗");
        }
    } catch (err) {
        console.error(err);
        showAuthMessage("註冊時發生錯誤，請查看 Console");
    }
}

async function login() {
    const username = $("username").value.trim();
    const password = $("password").value.trim();

    if (!username || !password) {
        showAuthMessage("請輸入帳號與密碼");
        return;
    }

    try {
        const res = await fetch("/api/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (data.status === "success") {
            currentUser = data.username || username;
            localStorage.setItem("wordle_username", currentUser);
            showAuthMessage("登入成功", "green");
            showModeSelection();
        } else {
            showAuthMessage(data.message || "登入失敗");
        }
    } catch (err) {
        console.error(err);
        showAuthMessage("登入時發生錯誤，請查看 Console");
    }
}

async function logout() {
    try {
        await fetch("/api/logout", {
            method: "POST"
        });
    } catch (err) {
        console.error(err);
    }

    currentUser = "";
    currentRoom = "";
    localStorage.removeItem("wordle_username");

    if (miniLeaderboardInterval) {
        clearInterval(miniLeaderboardInterval);
        miniLeaderboardInterval = null;
    }

    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    hideAllMainSections();

    const auth = $("auth-section");
    if (auth) auth.style.display = "block";

    const logo = $("logo-section");
    if (logo) logo.style.display = "block";

    const settings = $("settings-container");
    if (settings) settings.style.display = "none";
}

function logoutWrapper() {
    logout();
}

function initGrid() {
    const grid = $("wordle-grid");
    if (!grid) return;

    grid.innerHTML = "";
    currentGuess = "";
    currentRow = 0;
    isGameOver = false;

    for (let r = 0; r < MAX_GUESSES; r++) {
        for (let c = 0; c < WORD_LENGTH; c++) {
            const cell = document.createElement("div");
            cell.className = "cell";
            cell.id = `cell-${r}-${c}`;
            grid.appendChild(cell);
        }
    }

    resetKeyboard();
    showMessage("", "white");
}

function resetKeyboard() {
    document.querySelectorAll(".key").forEach(btn => {
        btn.classList.remove("green", "yellow", "gray");
        btn.style.backgroundColor = "";
        btn.style.color = "";
    });
}

function updateCurrentRow() {
    for (let i = 0; i < WORD_LENGTH; i++) {
        const cell = $(`cell-${currentRow}-${i}`);
        if (cell) {
            cell.innerText = currentGuess[i] || "";
        }
    }
}

function handleInput(key) {
    if (!currentRoom || isGameOver) return;

    key = key.toLowerCase();

    if (key === "enter") {
        submitGuess();
        return;
    }

    if (key === "backspace") {
        currentGuess = currentGuess.slice(0, -1);
        updateCurrentRow();
        return;
    }

    if (/^[a-z]$/.test(key)) {
        if (currentGuess.length < WORD_LENGTH) {
            currentGuess += key.toUpperCase();
            updateCurrentRow();
        }
    }
}

function submitGuess() {
    if (!currentRoom || isGameOver) {
        showMessage("遊戲尚未開始");
        return;
    }

    if (currentGuess.length !== WORD_LENGTH) {
        showMessage("請輸入 5 個英文字母");
        return;
    }

    if (!socket.connected) {
        showMessage("SocketIO 尚未連線，請重新整理頁面", "red");
        console.error("SocketIO 尚未連線");
        return;
    }

    const guess = currentGuess.toUpperCase();

    console.log("submit_guess", {
        room_id: currentRoom,
        username: currentUser,
        guess
    });

    socket.emit("submit_guess", {
        room_id: currentRoom,
        username: currentUser,
        guess
    });
}

function applyGuessResult(data) {
    if (!data) return;

    const details = data.details || [];
    const guessLetters = details.map(d => d.letter).join("");

    for (let i = 0; i < WORD_LENGTH; i++) {
        const cell = $(`cell-${currentRow}-${i}`);
        const item = details[i];

        if (!cell || !item) continue;

        const status = item.status || "gray";
        cell.innerText = item.letter || guessLetters[i] || "";
        cell.classList.add(status);

        if (status === "green") {
            cell.style.backgroundColor = "#6aaa64";
            cell.style.color = "white";
        } else if (status === "yellow") {
            cell.style.backgroundColor = "#c9b458";
            cell.style.color = "white";
        } else {
            cell.style.backgroundColor = "#787c7e";
            cell.style.color = "white";
        }

        updateKeyboardKey(item.letter, status);
    }

    if (data.message) {
        showMessage(data.message, data.is_correct ? "green" : "white");
    }

    if (data.is_correct) {
        showMessage("答對了！準備下一題...", "green");

        setTimeout(() => {
            initGrid();
        }, 1200);

        return;
    }

    if (data.guesses_exhausted) {
        showMessage("已猜滿 6 次，準備下一題...", "orange");

        setTimeout(() => {
            initGrid();
        }, 1200);

        return;
    }

    currentRow += 1;
    currentGuess = "";

    if (currentRow >= MAX_GUESSES) {
        showMessage("已經猜滿 6 次", "orange");
        isGameOver = true;
    }
}

function updateKeyboardKey(letter, status) {
    if (!letter) return;

    const key = document.querySelector(`.key[data-key="${letter.toLowerCase()}"]`);
    if (!key) return;

    const priority = {
        gray: 1,
        yellow: 2,
        green: 3
    };

    const oldStatus = key.dataset.status || "";
    if (oldStatus && priority[oldStatus] >= priority[status]) {
        return;
    }

    key.dataset.status = status;
    key.classList.remove("green", "yellow", "gray");
    key.classList.add(status);

    if (status === "green") {
        key.style.backgroundColor = "#6aaa64";
    } else if (status === "yellow") {
        key.style.backgroundColor = "#c9b458";
    } else {
        key.style.backgroundColor = "#3a3a3c";
    }

    key.style.color = "white";
}

function joinSinglePlayer() {
    if (!currentUser) {
        showAuthMessage("請先登入");
        return;
    }

    currentMode = "single";
    currentRoom = `single_${currentUser}`;

    hideAllMainSections();

    const game = $("game-section");
    if (game) game.style.display = "flex";

    const logo = $("logo-section");
    if (logo) logo.style.display = "none";

    const scoreboard = $("scoreboard-area");
    if (scoreboard) scoreboard.style.display = "none";

    const singleStats = $("single-player-stats");
    if (singleStats) singleStats.style.display = "block";

    const timer = $("timer-container");
    if (timer) timer.style.display = "none";

    const battleRound = $("battle-round-indicator");
    if (battleRound) battleRound.style.display = "none";

    const draft = $("private-draft-container");
    if (draft) draft.style.display = "none";

    socket.emit("join_single_player", {
        username: currentUser
    });

    initGrid();
    fetchMiniLeaderboard();

    if (miniLeaderboardInterval) {
        clearInterval(miniLeaderboardInterval);
    }

    miniLeaderboardInterval = setInterval(fetchMiniLeaderboard, 5000);

    if (document.activeElement) {
        document.activeElement.blur();
    }

    document.body.focus();
}

function openMultiplayerLobby() {
    if (!currentUser) return;

    hideAllMainSections();

    const lobby = $("multiplayer-lobby-section");
    if (lobby) lobby.style.display = "block";

    socket.emit("get_rooms_list");
}

function closeMultiplayerLobby() {
    showModeSelection();
}

function createRoom() {
    console.log("createRoom 被按下");

    const roomInput = document.getElementById("create-room-id");
    const maxInput = document.getElementById("room-max-players");
    const privacyInput = document.getElementById("room-privacy");

    if (!roomInput) {
        alert("找不到 create-room-id 輸入框");
        console.error("找不到 create-room-id");
        return;
    }

    const roomId = roomInput.value.trim();
    const maxPlayers = maxInput ? parseInt(maxInput.value || "5", 10) : 5;
    const isPrivate = privacyInput ? privacyInput.value === "private" : false;

    console.log("建立房間資料：", {
        roomId: roomId,
        maxPlayers: maxPlayers,
        isPrivate: isPrivate,
        currentUser: currentUser,
        socketConnected: socket.connected
    });

    if (!currentUser) {
        alert("目前沒有登入帳號，請重新登入");
        console.error("currentUser 是空的");
        return;
    }

    if (!roomId) {
        alert("請輸入房間號碼");
        return;
    }

    if (!socket.connected) {
        alert("SocketIO 尚未連線，請重新整理頁面");
        console.error("SocketIO 尚未連線");
        return;
    }

    currentRoom = roomId;

    socket.emit("create_room", {
        room_id: roomId,
        username: currentUser,
        max_players: maxPlayers,
        is_private: isPrivate
    });

    console.log("已送出 create_room 事件");
}

function joinGame(roomIdFromButton = "") {
    const input = $("room-id");
    const roomId = roomIdFromButton || input.value.trim();

    if (!roomId) {
        alert("請輸入房間號碼");
        return;
    }

    currentRoom = roomId;

    socket.emit("join_game", {
        room_id: roomId,
        username: currentUser
    });
}

function showWaitingRoom(roomId, players = [], host = "") {
    hideAllMainSections();

    const waiting = $("waiting-room-section");
    if (waiting) waiting.style.display = "block";

    const displayRoom = $("display-room-id");
    if (displayRoom) displayRoom.innerText = roomId;

    const list = $("waiting-players-list");
    if (list) {
        list.innerHTML = "";
        players.forEach(p => {
            const li = document.createElement("li");
            li.innerText = p === host ? `👑 ${p}` : p;
            list.appendChild(li);
        });
    }

    const startBtn = $("btn-start-game");
    const modeSelect = $("game-mode-select");
    const hostMsg = $("host-message");

    if (currentUser === host) {
        if (startBtn) startBtn.style.display = "flex";
        if (modeSelect) modeSelect.disabled = false;
        if (hostMsg) hostMsg.innerText = "你是房主，可以選擇模式並開始遊戲";
    } else {
        if (startBtn) startBtn.style.display = "none";
        if (modeSelect) modeSelect.disabled = true;
        if (hostMsg) hostMsg.innerText = "等待房主開始遊戲...";
    }
}

function startGame() {
    if (!currentRoom) return;

    const modeSelect = $("game-mode-select");
    const mode = modeSelect ? modeSelect.value : "frenzy";

    socket.emit("start_multiplayer_game", {
        room_id: currentRoom,
        username: currentUser,
        mode
    });
}

function showGameForMultiplayer(mode = "frenzy") {
    currentMode = mode;

    hideAllMainSections();

    const game = $("game-section");
    if (game) game.style.display = "flex";

    const logo = $("logo-section");
    if (logo) logo.style.display = "none";

    const scoreboard = $("scoreboard-area");
    if (scoreboard) scoreboard.style.display = "block";

    const singleStats = $("single-player-stats");
    if (singleStats) singleStats.style.display = "none";

    const timer = $("timer-container");
    if (timer) timer.style.display = "block";

    const battleRound = $("battle-round-indicator");
    if (battleRound) battleRound.style.display = mode === "battle" ? "block" : "none";

    initGrid();
}

function updateScoreboard(players) {
    const list = $("score-list");
    if (!list || !players) return;

    list.innerHTML = "";

    Object.keys(players).forEach(name => {
        const info = players[name];
        const row = document.createElement("div");
        row.className = "score-row";

        let score = 0;
        if (typeof info === "object") {
            score = info.score || 0;
        } else {
            score = info;
        }

        row.innerHTML = `
            <div class="player-name">${name}</div>
            <div class="player-score">${score} 分</div>
        `;

        list.appendChild(row);
    });
}

function updateRoomsList(rooms) {
    const list = $("available-rooms-list");
    if (!list) return;

    list.innerHTML = "";

    if (!rooms || rooms.length === 0) {
        list.innerHTML = `<p style="opacity: 0.7;">目前沒有公開房間</p>`;
        return;
    }

    rooms.forEach(room => {
        const div = document.createElement("div");
        div.style.padding = "10px";
        div.style.marginBottom = "8px";
        div.style.border = "1px solid var(--border-color)";
        div.style.borderRadius = "8px";
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.style.alignItems = "center";

        div.innerHTML = `
            <span>房間 ${room.room_id}｜${room.player_count}/${room.max_players} 人</span>
            <button onclick="joinGame('${room.room_id}')">加入</button>
        `;

        list.appendChild(div);
    });
}

function startCountdown(endTime) {
    const timerBox = $("frenzy-timer");
    if (!timerBox || !endTime) return;

    if (timerInterval) {
        clearInterval(timerInterval);
    }

    timerInterval = setInterval(() => {
        const remain = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
        const min = String(Math.floor(remain / 60)).padStart(2, "0");
        const sec = String(remain % 60).padStart(2, "0");

        timerBox.innerText = `${min}:${sec}`;

        if (remain <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }, 500);
}

async function fetchLeaderboard(type = "total_score") {
    try {
        const res = await fetch(`/api/leaderboard?type=${type}`);
        const data = await res.json();

        const list = $("leaderboard-list");
        if (!list) return;

        list.innerHTML = "";

        data.forEach((p, index) => {
            const row = document.createElement("div");
            row.className = "score-row";

            let unit = " 分";
            if (type === "frenzy_wins" || type === "battle_wins") {
                unit = " 勝";
            }

            row.innerHTML = `
                <div class="player-name">#${index + 1} ${p.username}</div>
                <div class="player-score">${p.score}${unit}</div>
            `;

            list.appendChild(row);
        });

        const btnTotal = $("btn-lb-total");
        const btnFrenzy = $("btn-lb-frenzy");
        const btnBattle = $("btn-lb-battle");

        if (btnTotal) btnTotal.style.backgroundColor = type === "total_score" ? "#4CAF50" : "#787c7e";
        if (btnFrenzy) btnFrenzy.style.backgroundColor = type === "frenzy_wins" ? "#2196F3" : "#787c7e";
        if (btnBattle) btnBattle.style.backgroundColor = type === "battle_wins" ? "#9c27b0" : "#787c7e";
    } catch (err) {
        console.error(err);
    }
}

async function fetchMiniLeaderboard() {
    try {
        const res = await fetch("/api/leaderboard?type=total_score");
        const data = await res.json();

        const list = $("mini-leaderboard-list");
        if (!list) return;

        list.innerHTML = "";

        data.forEach((p, index) => {
            const row = document.createElement("div");
            row.className = "score-row";
            row.innerHTML = `
                <div class="player-name">#${index + 1} ${p.username}</div>
                <div class="player-score">${p.score} 分</div>
            `;
            list.appendChild(row);
        });
    } catch (err) {
        console.error(err);
    }
}

function openLeaderboard() {
    hideAllMainSections();

    const section = $("leaderboard-section");
    if (section) section.style.display = "block";

    fetchLeaderboard("total_score");
}

function closeLeaderboard() {
    showModeSelection();
}

async function openAccountInfo() {
    if (!currentUser) return;

    hideAllMainSections();

    const section = $("account-info-section");
    if (section) section.style.display = "block";

    switchHistoryTab("frenzy");

    try {
        const res = await fetch(`/api/account_info?username=${encodeURIComponent(currentUser)}`);
        const data = await res.json();

        if (data.status !== "success") return;

        if ($("acc-total-score")) $("acc-total-score").innerText = data.total_score || 0;
        if ($("acc-frenzy-wins")) $("acc-frenzy-wins").innerText = data.frenzy_wins || 0;
        if ($("acc-battle-wins")) $("acc-battle-wins").innerText = data.battle_wins || 0;

        const frenzyList = $("acc-recent-games");
        if (frenzyList) {
            frenzyList.innerHTML = "";

            if (!data.recent_games || data.recent_games.length === 0) {
                frenzyList.innerHTML = `<p style="opacity: 0.7;">目前沒有紀錄</p>`;
            } else {
                data.recent_games.forEach(g => {
                    const div = document.createElement("div");
                    div.className = "score-row";
                    div.innerHTML = `
                        <div>${g.date || ""}</div>
                        <div>${g.score || 0} 分 ${g.is_win ? "🏆" : ""}</div>
                    `;
                    frenzyList.appendChild(div);
                });
            }
        }

        const battleList = $("acc-recent-battle-games");
        if (battleList) {
            battleList.innerHTML = "";

            if (!data.recent_battle_games || data.recent_battle_games.length === 0) {
                battleList.innerHTML = `<p style="opacity: 0.7;">目前沒有紀錄</p>`;
            } else {
                data.recent_battle_games.forEach(g => {
                    const div = document.createElement("div");
                    div.className = "score-row";
                    div.innerHTML = `
                        <div>${g.date || ""}</div>
                        <div>${g.score || 0} 分 ${g.is_win ? "🏆" : ""}</div>
                    `;
                    battleList.appendChild(div);
                });
            }
        }
    } catch (err) {
        console.error(err);
    }
}

function closeAccountInfo() {
    showModeSelection();
}

function switchHistoryTab(tab) {
    currentHistoryTab = tab;

    const btnFrenzy = $("btn-hist-frenzy");
    const btnBattle = $("btn-hist-battle");
    const frenzyContainer = $("frenzy-history-container");
    const battleContainer = $("battle-history-container");

    if (tab === "frenzy") {
        if (btnFrenzy) btnFrenzy.style.backgroundColor = "#2196F3";
        if (btnBattle) btnBattle.style.backgroundColor = "#787c7e";
        if (frenzyContainer) frenzyContainer.style.display = "block";
        if (battleContainer) battleContainer.style.display = "none";
    } else {
        if (btnFrenzy) btnFrenzy.style.backgroundColor = "#787c7e";
        if (btnBattle) btnBattle.style.backgroundColor = "#9c27b0";
        if (frenzyContainer) frenzyContainer.style.display = "none";
        if (battleContainer) battleContainer.style.display = "block";
    }
}

function toggleSettings() {
    const menu = $("settings-menu");
    const overlay = $("sidebar-overlay");

    if (!menu) return;

    const isOpen = menu.classList.contains("open");

    if (isOpen) {
        menu.classList.remove("open");
        if (overlay) overlay.style.display = "none";
    } else {
        menu.classList.add("open");
        if (overlay) overlay.style.display = "block";
    }
}

function changeTheme() {
    const select = $("theme-select");
    if (!select) return;

    const theme = select.value;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("wordle_theme", theme);
}

function backToLobby() {
    showModeSelection();
}

function switchGameMode() {
    if (currentMode === "single") {
        openMultiplayerLobby();
    } else {
        joinSinglePlayer();
    }
}

// =====================================================
// Socket Events
// =====================================================

socket.on("connect", () => {
    console.log("SocketIO connected:", socket.id);
});

socket.on("disconnect", () => {
    console.log("SocketIO disconnected");
});

socket.on("update_total_score", data => {
    const score = data.total_score || 0;
    const box = $("my-total-score");
    if (box) box.innerText = score;
});

socket.on("guess_result", data => {
    applyGuessResult(data);
});

socket.on("guess_error", data => {
    showMessage(data.message || "猜測失敗", "red");
});

socket.on("join_error", data => {
    console.error("join_error:", data);
    alert(data.message || "加入或建立房間失敗");
});

socket.on("create_success", data => {
    currentRoom = data.room_id;
    showWaitingRoom(data.room_id, data.players || [], data.host || "");
});

socket.on("update_waiting_room", data => {
    showWaitingRoom(currentRoom, data.players || [], data.host || "");
});

socket.on("update_scoreboard", data => {
    updateScoreboard(data);
});

socket.on("update_rooms_list", rooms => {
    updateRoomsList(rooms);
});

socket.on("game_started", data => {
    showGameForMultiplayer(data.mode || "frenzy");

    if (data.end_time) {
        startCountdown(data.end_time);
    }

    if (data.current_round && $("battle-current-round")) {
        $("battle-current-round").innerText = data.current_round;
    }
});

socket.on("frenzy_player_scored", data => {
    if (data.username) {
        showMessage(`${data.username} 得分！`, "green");
    }
});

socket.on("frenzy_game_over", data => {
    showMessage("時間到！遊戲結束", "orange");
    isGameOver = true;
});

socket.on("battle_update_grid", data => {
    console.log("battle_update_grid:", data);

    const guesses = data.guesses || [];
    const newGuess = data.new_guess || null;

    renderBattleSharedGrid(guesses);

    currentGuess = "";
    currentRow = Math.min(guesses.length, MAX_GUESSES);

    if (currentRow < MAX_GUESSES) {
        updateCurrentRow();
    }

    if (newGuess && newGuess.username) {
        if (newGuess.username === currentUser) {
            showMessage("已送出猜測，換下一個字試試！", "white");
        } else {
            showMessage(`${newGuess.username} 猜了 ${newGuess.word}`, "white");
        }
    }
});

socket.on("battle_round_over", data => {
    showMessage(`本回合結束，答案是 ${data.target || "未知"}`, "orange");
});

socket.on("battle_next_round", data => {
    if ($("battle-current-round")) {
        $("battle-current-round").innerText = data.current_round || 1;
    }

    if (data.end_time) {
        startCountdown(data.end_time);
    }

    initGrid();
});

socket.on("battle_game_over", data => {
    showMessage(`大亂鬥結束，勝利者：${(data.winners || []).join(", ")}`, "green");
    isGameOver = true;
});

socket.on("admin_target_word", data => {
    const card = $("admin-cheat-card");
    const display = $("admin-target-display");

    if (card) card.style.display = "block";
    if (display) display.innerText = data.target || "-----";
});

// =====================================================
// Keyboard Events
// =====================================================

document.addEventListener("keydown", event => {
    if (!currentRoom || isGameOver) return;

    const active = document.activeElement;

    if (
        active &&
        active.tagName === "INPUT" &&
        active.offsetParent !== null
    ) {
        return;
    }

    const key = event.key;

    if (
        key === "Enter" ||
        key === "Backspace" ||
        (/^[a-zA-Z]$/.test(key) && key.length === 1)
    ) {
        event.preventDefault();

        if (!event.repeat) {
            handleInput(key);
        }
    }
});

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".key").forEach(btn => {
        btn.addEventListener("click", () => {
            const key = btn.dataset.key;
            handleInput(key);
        });
    });

    const usernameInput = $("username");
    const passwordInput = $("password");

    if (usernameInput && passwordInput) {
        usernameInput.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                passwordInput.focus();
            }
        });

        passwordInput.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                login();
            }
        });
    }

    const savedTheme = localStorage.getItem("wordle_theme");
    if (savedTheme) {
        document.documentElement.setAttribute("data-theme", savedTheme);
        const themeSelect = $("theme-select");
        if (themeSelect) themeSelect.value = savedTheme;
    }
});

// =====================================================
// Expose functions for inline onclick
// =====================================================

window.login = login;
window.register = register;
window.logout = logout;
window.logoutWrapper = logoutWrapper;

window.joinSinglePlayer = joinSinglePlayer;
window.openMultiplayerLobby = openMultiplayerLobby;
window.closeMultiplayerLobby = closeMultiplayerLobby;
window.createRoom = createRoom;
window.joinGame = joinGame;
window.startGame = startGame;

window.openLeaderboard = openLeaderboard;
window.closeLeaderboard = closeLeaderboard;
window.fetchLeaderboard = fetchLeaderboard;

window.openAccountInfo = openAccountInfo;
window.closeAccountInfo = closeAccountInfo;
window.switchHistoryTab = switchHistoryTab;

window.toggleSettings = toggleSettings;
window.changeTheme = changeTheme;
window.backToLobby = backToLobby;
window.switchGameMode = switchGameMode;
