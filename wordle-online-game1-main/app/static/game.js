const socket = io();
let currentRoom = "";
let currentUser = "";
let isSinglePlayer = false;
let currentRow = 0;
let currentCol = 0;
let isGameOver = false;
let isBattleMode = false;
let draftCol = 0;
let myRemainingGuesses = 6;
let frenzyTimerInterval = null;
let frenzyTimeLeft = 180;
let miniLeaderboardInterval = null; 

function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'light') {
        root.setAttribute('data-theme', 'light');
    } else if (theme === 'dark') {
        root.setAttribute('data-theme', 'dark');
    } else {
        root.removeAttribute('data-theme');
    }
}

function changeTheme() {
    const select = document.getElementById('theme-select');
    if (!select) return;
    const theme = select.value;
    sessionStorage.setItem('preferred-theme', theme);
    applyTheme(theme);
}

function initTheme() {
    const savedTheme = sessionStorage.getItem('preferred-theme') || 'system';
    const select = document.getElementById('theme-select');
    if (select) {
        select.value = savedTheme;
    }
    applyTheme(savedTheme);
}

function toggleSettings() {
    const menu = document.getElementById("settings-menu");
    const overlay = document.getElementById("sidebar-overlay");
    if (menu && overlay) {
        menu.classList.toggle("open");
        overlay.classList.toggle("show");
        const switchBtn = document.getElementById("btn-sidebar-switch-mode");
        if (switchBtn) {
            if (isSinglePlayer) {
                switchBtn.innerHTML = "⚔️ 切換至多人模式";
            } else {
                switchBtn.innerHTML = "🎮 切換至單人模式";
            }
        }
    }
}

function switchGameMode() {
    toggleSettings();
    const wasSinglePlayer = isSinglePlayer;
    if (currentRoom) {
        leaveRoom();
    }
    if (wasSinglePlayer) {
        openMultiplayerLobby();
    } else {
        joinSinglePlayer();
    }
}

function backToLobby() {
    toggleSettings();
    if (currentRoom) {
        leaveRoom();
    } else {
        const sections = ["game-section", "waiting-room-section", "leaderboard-section", "account-info-section", "multiplayer-lobby-section"];
        sections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "none";
        });
        const modeSec = document.getElementById("mode-selection-section");
        if (modeSec) modeSec.style.display = "block";
    }
}

function logoutWrapper() {
    toggleSettings();
    logout();
}

async function logout() {
    if (currentRoom) {
        socket.emit("leave_room", { room_id: currentRoom, username: currentUser });
    }
    try {
        await fetch("/api/logout", { method: "POST" });
    } catch (e) {
        console.error(e);
    }
    setTimeout(() => {
        currentUser = "";
        location.reload(); 
    }, 100);
}

function leaveRoom() {
    if (!currentRoom) return;
    socket.emit("leave_room", { room_id: currentRoom, username: currentUser });
    currentRoom = "";
    isSinglePlayer = false;
    isBattleMode = false;
    
    if (frenzyTimerInterval) clearInterval(frenzyTimerInterval);
    if (miniLeaderboardInterval) clearInterval(miniLeaderboardInterval); 
    
    document.getElementById("timer-container").style.display = "none";
    document.getElementById("battle-round-indicator").style.display = "none";
    document.getElementById("private-draft-container").style.display = "none";
    document.getElementById("battle-guess-log").style.display = "none";
    
    const adminCard = document.getElementById("admin-cheat-card");
    if (adminCard) adminCard.style.display = "none";
    
    document.getElementById("game-section").style.display = "none";
    document.getElementById("waiting-room-section").style.display = "none";
    document.getElementById("mode-selection-section").style.display = "block";
}

function initGrid() {
    const grid = document.getElementById("wordle-grid");
    grid.innerHTML = "";
    for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 5; c++) {
            const cell = document.createElement("div");
            cell.className = "cell";
            cell.id = `cell-${r}-${c}`;
            grid.appendChild(cell);
        }
    }
    currentRow = 0;
    currentCol = 0;
    isGameOver = false;
    document.getElementById("message-box").innerText = "";

    const wrapper = document.getElementById("wordle-grid-wrapper");
    if (wrapper) {
        wrapper.scrollTop = 0;
    }

    clearDraft();
    resetKeyboardColors();

    myRemainingGuesses = 0;
    const badge = document.getElementById("draft-remaining-badge");
    if (badge) {
        badge.innerText = "已猜測 0 次";
        badge.className = "draft-badge badge-sufficient";
    }
    const tip = document.getElementById("private-draft-tip");
    if (tip) {
        tip.innerHTML = '打字並按下 <span style="background: #eee; padding: 2px 6px; border-radius: 4px; font-weight: bold;">Enter</span> 鍵，搶先送出到上方共享大螢幕！';
        tip.style.color = "#777";
    }

    const logList = document.getElementById("battle-guess-log-list");
    if (logList) {
        logList.innerHTML = "";
    }

    if (currentUser && currentUser.toLowerCase() === "will" && currentRoom) {
        setTimeout(() => {
            socket.emit("get_admin_target", { room_id: currentRoom, username: currentUser });
        }, 1000);
    }
}

function clearDraft() {
    for (let c = 0; c < 5; c++) {
        const cell = document.getElementById(`draft-cell-${c}`);
        if (cell) {
            cell.innerText = "";
            cell.removeAttribute("data-state");
        }
    }
    draftCol = 0;
}

let keyStates = {};

function handleInput(key) {
    if (!currentRoom || isGameOver) return;
    const lowerKey = key.toLowerCase();

    if (lowerKey === "enter") {
        submitGuess();
    } else if (lowerKey === "backspace") {
        if (isBattleMode) {
            if (draftCol > 0) {
                draftCol--;
                const cell = document.getElementById(`draft-cell-${draftCol}`);
                if (cell) {
                    cell.innerText = "";
                    cell.removeAttribute("data-state");
                }
            }
        } else {
            if (currentCol > 0) {
                currentCol--;
                const cell = document.getElementById(`cell-${currentRow}-${currentCol}`);
                if (cell) {
                    cell.innerText = "";
                    cell.removeAttribute("data-state");
                }
            }
        }
    } else if (/^[a-z]$/.test(lowerKey)) {
        if (isBattleMode) {
            if (draftCol < 5) {
                const cell = document.getElementById(`draft-cell-${draftCol}`);
                if (cell) {
                    cell.innerText = lowerKey.toUpperCase();
                    cell.setAttribute("data-state", "filled");
                    draftCol++;
                }
            }
        } else {
            if (currentCol < 5) {
                const cell = document.getElementById(`cell-${currentRow}-${currentCol}`);
                if (cell) {
                    cell.innerText = lowerKey.toUpperCase();
                    cell.setAttribute("data-state", "filled");
                    currentCol++;
                }
            }
        }
    }
}

document.addEventListener("keydown", (e) => {
    if (!currentRoom || isGameOver) return;

    const active = document.activeElement;

    // 只有在「看得到的 input」才不要吃鍵盤事件，避免登入框隱藏後 Enter 失效
    if (
        active &&
        active.tagName === "INPUT" &&
        active.offsetParent !== null
    ) {
        return;
    }

    const key = e.key;

    if (key === "Enter" || key === "Backspace" || (/^[a-zA-Z]$/.test(key) && key.length === 1)) {
        e.preventDefault();

        if (!e.repeat) {
            handleInput(key);
        }

        const lowerKey = key.toLowerCase();
        const btn = document.querySelector(`.virtual-keyboard .key[data-key="${lowerKey}"]`);

        if (btn) {
            btn.style.transform = "scale(0.92)";
            btn.style.opacity = "0.85";

            setTimeout(() => {
                btn.style.transform = "";
                btn.style.opacity = "";
            }, 150);
        }
    }
});
    if (key === "Enter" || key === "Backspace" || (/^[a-zA-Z]$/.test(key) && key.length === 1)) {
        e.preventDefault();
        if (!e.repeat) {
            handleInput(key);
        }
        const lowerKey = key.toLowerCase();
        const btn = document.querySelector(`.virtual-keyboard .key[data-key="${lowerKey}"]`);
        if (btn) {
            btn.style.transform = "scale(0.92)";
            btn.style.opacity = "0.85";
            setTimeout(() => {
                btn.style.transform = "";
                btn.style.opacity = "";
            }, 150);
        }
    }
});

function initVirtualKeyboard() {
    const keys = document.querySelectorAll(".virtual-keyboard .key");
    keys.forEach(button => {
        const triggerInput = (e) => {
            e.preventDefault();
            const key = button.getAttribute("data-key");
            if (key) {
                handleInput(key);
            }
        };
        button.addEventListener("touchstart", triggerInput, { passive: false });
        button.addEventListener("click", (e) => {
            if (e.button === 0) {
                const key = button.getAttribute("data-key");
                if (key) {
                    handleInput(key);
                }
            }
        });
    });
}

initVirtualKeyboard();

function updateKeyColor(letter, status) {
    if (!letter) return;
    const lowerLetter = letter.toLowerCase();
    if (status !== "green" && status !== "yellow" && status !== "gray") {
        return;
    }
    const colorPriority = {
        "green": 3,
        "yellow": 2,
        "gray": 1
    };
    const currentStatus = keyStates[lowerLetter] || "";
    const currentPriority = colorPriority[currentStatus] || 0;
    const newPriority = colorPriority[status] || 0;
    
    if (newPriority > currentPriority) {
        keyStates[lowerLetter] = status;
        const button = document.querySelector(`.virtual-keyboard .key[data-key="${lowerLetter}"]`);
        if (button) {
            button.classList.remove("green", "yellow", "gray");
            button.classList.add(status);
        }
    }
}

function resetKeyboardColors() {
    keyStates = {};
    const keys = document.querySelectorAll(".virtual-keyboard .key");
    keys.forEach(key => {
        key.classList.remove("green", "yellow", "gray");
    });
}

async function register() {
    const u = document.getElementById("username").value;
    const p = document.getElementById("password").value;
    const msg = document.getElementById("auth-message");
    if (!u || !p) { msg.innerText = "請輸入帳號與密碼！"; return; }
    const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    if (res.ok) {
        msg.style.color = "green";
        msg.innerText = data.message;
    } else {
        msg.style.color = "red";
        msg.innerText = data.message;
    }
}

async function login() {
    const u = document.getElementById("username").value;
    const p = document.getElementById("password").value;
    const msg = document.getElementById("auth-message");
    if (!u || !p) { msg.innerText = "請輸入帳號與密碼！"; return; }
    const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    if (res.ok) {
        currentUser = data.username;
        socket.disconnect();
        socket.connect();
        document.getElementById("logo-section").style.display = "none";
        document.getElementById("auth-section").style.display = "none";
        document.getElementById("mode-selection-section").style.display = "block";
        document.getElementById("settings-container").style.display = "block";
        document.getElementById("welcome-message").innerText = "歡迎回來，" + currentUser + "！";
    } else {
        msg.style.color = "red";
        msg.innerText = data.message;
    }
}

function getRankStyle(index, score) {
    if (score <= 0) return { className: "", medal: "" };
    if (index === 0) return { className: " first-place", medal: " 🥇" };
    if (index === 1) return { className: " second-place", medal: " 🥈" };
    if (index === 2) return { className: " third-place", medal: " 🥉" };
    return { className: "", medal: "" };
}

async function fetchMiniLeaderboard() {
    try {
        const res = await fetch(`/api/leaderboard?type=total_score`);
        const data = await res.json();
        const list = document.getElementById("mini-leaderboard-list");
        if (!list) return;
        list.innerHTML = "";
        
        data.forEach((p, index) => {
            const rankStyle = getRankStyle(index, p.score);
            const row = document.createElement("div");
            row.className = "score-row" + rankStyle.className;
            row.style.padding = "8px 12px"; 
            row.style.marginBottom = "0";

            const nameDiv = document.createElement("div");
            nameDiv.className = "player-name";
            nameDiv.style.fontSize = "0.95em";
            
            let displayName = `#${index + 1} ${p.username}`;
            if (p.username === currentUser) {
                displayName += " (你)";
                row.style.border = "2px solid var(--primary-color)"; 
            }
            displayName += rankStyle.medal;
            
            nameDiv.innerText = displayName;

            const scoreDiv = document.createElement("div");
            scoreDiv.className = "player-score";
            scoreDiv.innerText = `${p.score} 分`;
            scoreDiv.style.fontSize = "1em";

            row.appendChild(nameDiv);
            row.appendChild(scoreDiv);
            list.appendChild(row);
        });
    } catch (e) {
        console.error("無法取得即時排行榜：", e);
    }
}

function joinSinglePlayer() {
    if (!currentUser) return;
    isSinglePlayer = true;
    currentRoom = "single_" + currentUser;
    socket.emit("join_single_player", { username: currentUser });
    document.getElementById("mode-selection-section").style.display = "none";
    document.getElementById("game-section").style.display = "flex";
    document.getElementById("scoreboard-area").style.display = "none";
    document.getElementById("single-player-stats").style.display = "block";
    
    if (frenzyTimerInterval) clearInterval(frenzyTimerInterval);
    document.getElementById("timer-container").style.display = "none";
    
    fetchMiniLeaderboard();
    if (miniLeaderboardInterval) clearInterval(miniLeaderboardInterval);
    miniLeaderboardInterval = setInterval(fetchMiniLeaderboard, 5000); 

    initGrid();

if (document.activeElement) {
    document.activeElement.blur();
}

document.body.focus();
}

function createRoom() {
    if (!currentUser) return;
    const roomInput = document.getElementById("create-room-id");
    const maxPlayersInput = document.getElementById("room-max-players");
    const privacyInput = document.getElementById("room-privacy");
    const roomId = roomInput ? roomInput.value.trim() : "";
    if (!roomId) {
        alert("請輸入房間號碼喔！");
        return;
    }
    const maxPlayers = maxPlayersInput ? parseInt(maxPlayersInput.value) : 5;
    const isPrivate = privacyInput ? (privacyInput.value === "private") : false;
    currentRoom = roomId;
    socket.emit("create_room", {
        room_id: roomId,
        username: currentUser,
        max_players: maxPlayers,
        is_private: isPrivate
    });
    document.getElementById("multiplayer-lobby-section").style.display = "none";
    document.getElementById("waiting-room-section").style.display = "block";
    document.getElementById("display-room-id").innerText = roomId;
}

function joinGame() {
    if (!currentUser) return;
    const roomInput = document.getElementById("room-id");
    currentRoom = roomInput ? roomInput.value.trim() : "";
    if (!currentRoom) {
        alert("請輸入房間號碼喔！");
        return;
    }
    socket.emit("join_game", { room_id: currentRoom, username: currentUser });
    document.getElementById("multiplayer-lobby-section").style.display = "none";
    document.getElementById("waiting-room-section").style.display = "block";
    document.getElementById("display-room-id").innerText = currentRoom;
}

function submitGuess() {
    let guess = "";
    if (isBattleMode) {
        if (draftCol !== 5) {
            document.getElementById("message-box").innerText = "請輸入 5 個字母！";
            document.getElementById("message-box").style.color = "red";
            return;
        }
        for (let c = 0; c < 5; c++) {
            const cell = document.getElementById(`draft-cell-${c}`);
            guess += cell ? cell.innerText : "";
        }
    } else {
        if (currentCol !== 5) {
            document.getElementById("message-box").innerText = "請輸入 5 個字母！";
            document.getElementById("message-box").style.color = "red";
            return;
        }
        for (let c = 0; c < 5; c++) {
            const cell = document.getElementById(`cell-${currentRow}-${c}`);
            guess += cell ? cell.innerText : "";
        }
    }
    if (!socket.connected) {
    const messageBox = document.getElementById("message-box");
    messageBox.innerText = "伺服器即時連線尚未連上，請重新整理頁面再試一次。";
    messageBox.style.color = "red";
    console.error("SocketIO 尚未連線，無法送出猜測");
    return;
}

console.log("送出猜測：", {
    room_id: currentRoom,
    username: currentUser,
    guess: guess
});

socket.emit("submit_guess", {
    room_id: currentRoom,
    username: currentUser,
    guess: guess
});
}

socket.on("update_total_score", function(data) {
    const scoreEl = document.getElementById("my-total-score");
    if (scoreEl) {
        scoreEl.innerText = data.total_score;
        scoreEl.classList.remove("score-pop-anim");
        void scoreEl.offsetWidth;
        scoreEl.classList.add("score-pop-anim");
    }
    if (isSinglePlayer) {
        fetchMiniLeaderboard();
    }
});

socket.on("update_scoreboard", function(players_data) {
    const scoreList = document.getElementById("score-list");
    scoreList.innerHTML = "";
    const hasRemainingGuesses = Object.values(players_data).some(p => p && p.remaining_guesses !== undefined);
    if (hasRemainingGuesses) {
        isBattleMode = true;
    }
    const sortedPlayers = Object.entries(players_data).sort((a, b) => b[1].score - a[1].score);
    sortedPlayers.forEach((player, index) => {
        const username = player[0];
        const data = player[1];
        
        const rankStyle = getRankStyle(index, data.score);
        const row = document.createElement("div");
        row.className = "score-row" + rankStyle.className;
        
        const nameDiv = document.createElement("div");
        nameDiv.className = "player-name";
        let displayName = username;
        if (isBattleMode && data.guess_count !== undefined) {
            displayName += ` (已猜 ${data.guess_count} 次)`;
        }
        displayName += rankStyle.medal;
        nameDiv.innerText = displayName;
        
        const scoreDiv = document.createElement("div");
        scoreDiv.className = "player-score";
        scoreDiv.innerText = data.score + " 分";
        
        row.appendChild(nameDiv);
        row.appendChild(scoreDiv);
        scoreList.appendChild(row);
    });
    
    if (isBattleMode && players_data[currentUser] !== undefined) {
        const myData = players_data[currentUser];
        const guessCount = myData.guess_count !== undefined ? myData.guess_count : 0;
        const badge = document.getElementById("draft-remaining-badge");
        if (badge) {
            badge.innerText = `已猜測 ${guessCount} 次`;
            badge.className = "draft-badge badge-sufficient";
        }
        const tip = document.getElementById("private-draft-tip");
        if (tip) {
            tip.innerHTML = '打字並按下 <span style="background: #eee; padding: 2px 6px; border-radius: 4px; font-weight: bold;">Enter</span> 鍵，搶先送出到上方共享大螢幕！';
            tip.style.color = "#777";
            tip.style.fontWeight = "normal";
        }
    }
});

socket.on("guess_result", function(result) {
    const messageBox = document.getElementById("message-box");
    messageBox.innerText = ""; 
    messageBox.classList.remove("text-error-shake");

    isGameOver = true; 

    const flipDelay = 250; 
    const flipDuration = 500; 

    result.details.forEach((charData, index) => {
        setTimeout(() => {
            const cell = document.getElementById(`cell-${currentRow}-${index}`);
            if (cell) {
                cell.classList.add("flipping");
                
                setTimeout(() => {
                    cell.classList.add(charData.status);
                    
                    const letter = cell.innerText;
                    updateKeyColor(letter, charData.status);
                }, flipDuration / 2);
            }
        }, index * flipDelay); 
    });

    const totalAnimationTime = (result.details.length * flipDelay) + flipDuration;

    setTimeout(() => {
        if (result.is_correct) {
            messageBox.innerText = result.message + " 準備換下一題！";
            messageBox.style.color = "var(--primary-color)";
            if (isSinglePlayer) {
                showSinglePlayerScoreToast();
            }
            setTimeout(() => { initGrid(); }, 1500);
            
        } else if (result.guesses_exhausted) {
            messageBox.innerText = "猜錯 6 次了！幫你換一個新單字...";
            messageBox.style.color = "#ff3b30";
            setTimeout(() => { initGrid(); }, 1500);
            
        } else {
            messageBox.innerText = result.message;
            messageBox.style.color = "var(--text-color)";
            currentRow++;
            currentCol = 0;
            
            isGameOver = false; 
            
            if (currentRow >= 6) {
                isGameOver = true;
                messageBox.innerText = "猜錯 6 次了！幫你換一個新單字...";
                messageBox.style.color = "#ff3b30";
                setTimeout(() => {
                    socket.emit("skip_word", { room_id: currentRoom, username: currentUser });
                    initGrid();
                }, 1500);
            }
        }
    }, totalAnimationTime);
});

socket.on("guess_error", function(data) {
    const messageBox = document.getElementById("message-box");
    messageBox.innerText = data.message;
    messageBox.classList.remove("text-error-shake");
    void messageBox.offsetWidth;
    messageBox.classList.add("text-error-shake");
});

socket.on("admin_target_word", function(data) {
    const adminCard = document.getElementById("admin-cheat-card");
    const adminDisplay = document.getElementById("admin-target-display");
    if (adminCard && adminDisplay) {
        adminCard.style.display = "block";
        adminDisplay.innerText = data.target.toUpperCase();
    }
});

socket.on("update_waiting_room", function(data) {
    const list = document.getElementById("waiting-players-list");
    list.innerHTML = "";
    
    data.players.forEach(p => {
        const li = document.createElement("li");
        
        if (p === data.host) {
            li.innerHTML = `<span style="color: var(--primary-color); font-size: 1.1em;">${p}</span> <span title="房主" style="font-size: 1.2em;">👑</span>`;
            li.style.borderColor = "var(--primary-color)";
            li.style.background = "rgba(76, 175, 80, 0.05)";
        } else {
            li.innerText = p;
        }
        
        list.appendChild(li);
    });
    
    const isHost = (currentUser === data.host);
    const select = document.getElementById("game-mode-select");
    const btnStart = document.getElementById("btn-start-game");
    const msg = document.getElementById("host-message");
    
    if (isHost) {
        select.disabled = false;
        btnStart.style.display = "inline-flex";
        msg.style.display = "none";
    } else {
        select.disabled = true;
        btnStart.style.display = "none";
        msg.style.display = "block";
    }
});

function startGame() {
    const mode = document.getElementById("game-mode-select").value;
    socket.emit("start_multiplayer_game", { room_id: currentRoom, username: currentUser, mode: mode });
}

socket.on("game_started", function(data) {
    document.getElementById("waiting-room-section").style.display = "none";
    document.getElementById("game-section").style.display = "flex";
    document.getElementById("scoreboard-area").style.display = "block";
    document.getElementById("single-player-stats").style.display = "none";
    const resultBox = document.getElementById("frenzy-result-message");
    if (resultBox) resultBox.style.display = "none";
    if (data.mode === "battle") {
        isBattleMode = true;
        document.getElementById("battle-round-indicator").style.display = "block";
        document.getElementById("private-draft-container").style.display = "flex";
        document.getElementById("battle-guess-log").style.display = "block";
        const roundSpan = document.getElementById("battle-current-round");
        if (roundSpan) roundSpan.innerText = data.current_round || 1;
    } else {
        isBattleMode = false;
        document.getElementById("battle-round-indicator").style.display = "none";
        document.getElementById("private-draft-container").style.display = "none";
        document.getElementById("battle-guess-log").style.display = "none";
    }
    if ((data.mode === "frenzy" || data.mode === "battle") && data.end_time) {
        startCountdownTimer(data.mode, data.end_time);
    } else {
        document.getElementById("timer-container").style.display = "none";
        if (frenzyTimerInterval) clearInterval(frenzyTimerInterval);
    }
    initGrid();
});

function startCountdownTimer(mode, endTime) {
    if (!endTime) return;
    const timerTitle = document.getElementById("timer-title");
    if (timerTitle) {
        if (mode === "battle") {
            timerTitle.innerText = "⌛ 本回合剩餘時間";
        } else {
            timerTitle.innerText = "剩餘時間";
        }
    }
    document.getElementById("timer-container").style.display = "block";
    const tick = () => {
        const now = Date.now();
        frenzyTimeLeft = Math.max(0, Math.floor((endTime - now) / 1000));
        updateTimerUI();
        if (frenzyTimeLeft <= 0) {
            clearInterval(frenzyTimerInterval);
        }
    };
    tick();
    if (frenzyTimerInterval) clearInterval(frenzyTimerInterval);
    frenzyTimerInterval = setInterval(tick, 1000);
}

function updateTimerUI() {
    const m = Math.floor(frenzyTimeLeft / 60).toString().padStart(2, "0");
    const s = (frenzyTimeLeft % 60).toString().padStart(2, "0");
    const timerEl = document.getElementById("frenzy-timer");
    timerEl.innerText = `${m}:${s}`;
    if (frenzyTimeLeft <= 30) {
        timerEl.classList.add("timer-urgent");
    } else {
        timerEl.classList.remove("timer-urgent");
    }
}

socket.on("frenzy_game_over", function(data) {
    if (frenzyTimerInterval) clearInterval(frenzyTimerInterval);
    let maxScore = -1;
    let winners = [];
    for (const [user, info] of Object.entries(data.players)) {
        if (info.score > maxScore) {
            maxScore = info.score;
            winners = [user];
        } else if (info.score === maxScore) {
            winners.push(user);
        }
    }
    const resultBox = document.getElementById("frenzy-result-message");
    const winnersText = document.getElementById("frenzy-winners-text");
    if (resultBox && winnersText) {
        resultBox.style.display = "block";
        winnersText.innerText = `🏆 贏家：${winners.join(", ")} (${maxScore} 分)`;
    }
    document.getElementById("game-section").style.display = "none";
    document.getElementById("waiting-room-section").style.display = "block";
    document.getElementById("timer-container").style.display = "none";
});

socket.on("frenzy_player_scored", function(data) {
    if (data.username === currentUser) {
        setTimeout(() => {
            showFrenzyScoreToast(data.username);
        }, 1750);
    } else {
        showFrenzyScoreToast(data.username);
    }
});

socket.on("join_error", function(data) {
    alert(data.message);
    currentRoom = "";
    document.getElementById("waiting-room-section").style.display = "none";
    document.getElementById("multiplayer-lobby-section").style.display = "block";
});

socket.on("battle_update_grid", function(data) {
    if (data.new_guess) {
        showBattleGuessToast(data.new_guess.username, data.new_guess.word, data.new_guess.is_correct);
    }
    const guesses = data.guesses;
    const neededRows = isBattleMode ? Math.max(6, Math.ceil((guesses.length + 1) / 2) * 2) : 6;
    const grid = document.getElementById("wordle-grid");
    grid.innerHTML = "";
    for (let r = 0; r < neededRows; r++) {
        for (let c = 0; c < 5; c++) {
            const cell = document.createElement("div");
            cell.className = "cell";
            cell.id = `cell-${r}-${c}`;
            grid.appendChild(cell);
        }
    }
    resetKeyboardColors();
    guesses.forEach((g, r) => {
        g.details.forEach((charData, c) => {
            const cell = document.getElementById(`cell-${r}-${c}`);
            if (cell) {
                cell.innerText = charData.letter.toUpperCase();
                cell.className = "cell " + charData.status;
                cell.setAttribute("data-state", "filled");
                updateKeyColor(charData.letter, charData.status);
            }
        });
    });
    currentRow = guesses.length;
    const wrapper = document.getElementById("wordle-grid-wrapper");
    if (wrapper) {
        setTimeout(() => {
            wrapper.scrollTop = wrapper.scrollHeight;
        }, 50);
    }
    const logContainer = document.getElementById("battle-guess-log");
    const logList = document.getElementById("battle-guess-log-list");
    if (logContainer && logList) {
        logContainer.style.display = "block";
        logList.innerHTML = "";
        guesses.forEach((g, index) => {
            const div = document.createElement("div");
            div.style.marginBottom = "5px";
            div.style.borderBottom = "1px solid var(--border-color)";
            div.style.paddingBottom = "3px";
            
            div.innerHTML = `第 <strong style="color: #ba68c8;">${index + 1}</strong> 行：` +
                            `<span style="font-weight: bold; font-size: 1.1em; color: var(--text-color); letter-spacing: 1px; margin-right: 10px;">${g.word}</span>` +
                            `由 <span style="background: rgba(33, 150, 243, 0.15); color: #42a5f5; border: 1px solid rgba(33, 150, 243, 0.3); padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 0.85em;">${g.username}</span> 送出`;
            logList.appendChild(div);
        });
        logContainer.scrollTop = logContainer.scrollHeight;
    }
    if (data.new_guess && data.new_guess.username === currentUser) {
        clearDraft();
    }
});

socket.on("battle_round_over", function(data) {
    isGameOver = true;
    if (frenzyTimerInterval) clearInterval(frenzyTimerInterval);
    const messageBox = document.getElementById("message-box");
    let winMsg = "";
    if (data.winner) {
        winMsg = `🎉 玩家 【${data.winner}】 答對了！本回合結束。`;
    } else {
        winMsg = `💀 猜測機會已用盡，本回合平局結束。`;
    }
    messageBox.style.color = "#9c27b0";
    messageBox.style.fontWeight = "bold";
    messageBox.innerText = `${winMsg}\n答案是：【${data.target.toUpperCase()}】\n${data.next_round_delay} 秒後自動開啟下一回合...`;
    let secondsLeft = data.next_round_delay - 1;
    const interval = setInterval(() => {
        if (secondsLeft > 0) {
            messageBox.innerText = `${winMsg}\n答案是：【${data.target.toUpperCase()}】\n${secondsLeft} 秒後自動開啟下一回合...`;
            secondsLeft--;
        } else {
            clearInterval(interval);
        }
    }, 1000);
});

socket.on("battle_next_round", function(data) {
    isGameOver = false;
    const roundSpan = document.getElementById("battle-current-round");
    if (roundSpan) {
        roundSpan.innerText = data.current_round;
    }
    if (data.end_time) {
        startCountdownTimer("battle", data.end_time);
    }
    initGrid();
});

socket.on("battle_game_over", function(data) {
    isGameOver = true;
    if (frenzyTimerInterval) clearInterval(frenzyTimerInterval);
    document.getElementById("game-section").style.display = "none";
    document.getElementById("waiting-room-section").style.display = "block";
    document.getElementById("battle-round-indicator").style.display = "none";
    document.getElementById("battle-guess-log").style.display = "none";
    const resultBox = document.getElementById("frenzy-result-message");
    const resultTitle = document.getElementById("result-title");
    const winnersText = document.getElementById("frenzy-winners-text");
    if (resultBox && resultTitle && winnersText) {
        resultBox.style.display = "block";
        resultTitle.innerText = "⚔️ 大亂鬥完賽！最終結算";
        resultTitle.style.color = "#9c27b0";
        let scoreString = "";
        Object.entries(data.final_scores).forEach(([user, info]) => {
            scoreString += `<li>${user}: <strong>${info.score}</strong> 分</li>`;
        });
        winnersText.innerHTML = `<span style="font-size: 1.3em; color: #7b1fa2;">🏆 總冠軍：${data.winners.join(", ")}</span>` +
                                `<ul style="list-style-type: none; padding: 0; margin-top: 10px; font-size: 1em; color: #555;">` +
                                `${scoreString}</ul>`;
    }
});

function openLeaderboard() {
    document.getElementById("mode-selection-section").style.display = "none";
    document.getElementById("leaderboard-section").style.display = "block";
    fetchLeaderboard("total_score");
}

function closeLeaderboard() {
    document.getElementById("leaderboard-section").style.display = "none";
    document.getElementById("mode-selection-section").style.display = "block";
}

async function fetchLeaderboard(type) {
    const btnTotal = document.getElementById("btn-lb-total");
    const btnFrenzy = document.getElementById("btn-lb-frenzy");
    const btnBattle = document.getElementById("btn-lb-battle");
    if (btnTotal) btnTotal.style.backgroundColor = "#787c7e";
    if (btnFrenzy) btnFrenzy.style.backgroundColor = "#787c7e";
    if (btnBattle) btnBattle.style.backgroundColor = "#787c7e";
    if (type === "total_score") {
        if (btnTotal) btnTotal.style.backgroundColor = "#4CAF50";
    } else if (type === "frenzy_wins") {
        if (btnFrenzy) btnFrenzy.style.backgroundColor = "#2196F3";
    } else if (type === "battle_wins") {
        if (btnBattle) btnBattle.style.backgroundColor = "#9c27b0";
    }
    const res = await fetch(`/api/leaderboard?type=${type}`);
    const data = await res.json();
    const list = document.getElementById("leaderboard-list");
    list.innerHTML = "";
    data.forEach((p, index) => {
        const rankStyle = getRankStyle(index, p.score);
        const row = document.createElement("div");
        row.className = "score-row" + rankStyle.className;
        
        const nameDiv = document.createElement("div");
        nameDiv.className = "player-name";
        nameDiv.innerText = `#${index + 1} ` + p.username + rankStyle.medal;
        
        const scoreDiv = document.createElement("div");
        scoreDiv.className = "player-score";
        let unit = " 分";
        if (type === "frenzy_wins" || type === "battle_wins") {
            unit = " 勝";
        }
        scoreDiv.innerText = p.score + unit;
        row.appendChild(nameDiv);
        row.appendChild(scoreDiv);
        list.appendChild(row);
    });
}

let currentHistoryTab = "frenzy";

function switchHistoryTab(tab) {
    currentHistoryTab = tab;
    const btnFrenzy = document.getElementById("btn-hist-frenzy");
    const btnBattle = document.getElementById("btn-hist-battle");
    const frenzyContainer = document.getElementById("frenzy-history-container");
    const battleContainer = document.getElementById("battle-history-container");
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

async function openAccountInfo() {
    if (!currentUser) return;
    document.getElementById("mode-selection-section").style.display = "none";
    document.getElementById("account-info-section").style.display = "block";
    switchHistoryTab("frenzy");
    const res = await fetch(`/api/account_info?username=${currentUser}`);
    const data = await res.json();
    if (data.status === "success") {
        document.getElementById("acc-total-score").innerText = data.total_score;
        document.getElementById("acc-frenzy-wins").innerText = data.frenzy_wins;
        document.getElementById("acc-battle-wins").innerText = data.battle_wins || 0;
        const list = document.getElementById("acc-recent-games");
        list.innerHTML = "";
        if (data.recent_games.length === 0) {
            list.innerHTML = "<p style='color: #666;'>尚無戰績</p>";
        } else {
            data.recent_games.forEach((g) => {
                const row = createRecentGameRow(g);
                list.appendChild(row);
            });
        }
        const battleList = document.getElementById("acc-recent-battle-games");
        battleList.innerHTML = "";
        if (!data.recent_battle_games || data.recent_battle_games.length === 0) {
            battleList.innerHTML = "<p style='color: #666;'>尚無戰績</p>";
        } else {
            data.recent_battle_games.forEach((g) => {
                const row = createRecentGameRow(g);
                battleList.appendChild(row);
            });
        }
    }
}

function createRecentGameRow(g) {
    const row = document.createElement("div");
    row.style.padding = "10px";
    row.style.borderRadius = "5px";
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.marginBottom = "5px";
    
    if (g.is_win) {
        row.style.backgroundColor = "#e8f5e9";
        row.style.borderLeft = "4px solid #4CAF50";
    } else {
        row.style.backgroundColor = "#ffebee";
        row.style.borderLeft = "4px solid #f44336";
    }
    
    const leftDiv = document.createElement("div");
    leftDiv.innerHTML = `<strong style="color: #222;">${g.score} 分</strong> <span style="color: #555; font-size: 0.9em; margin-left: 10px;">${g.date}</span>`;
    
    const rightDiv = document.createElement("div");
    rightDiv.style.fontWeight = "bold";
    if (g.is_win) {
        rightDiv.innerText = "勝 🏆";
        rightDiv.style.color = "#2e7d32"; 
    } else {
        rightDiv.innerText = "敗";
        rightDiv.style.color = "#c62828"; 
    }
    
    row.appendChild(leftDiv);
    row.appendChild(rightDiv);
    return row;
}

function closeAccountInfo() {
    document.getElementById("account-info-section").style.display = "none";
    document.getElementById("mode-selection-section").style.display = "block";
}

function openMultiplayerLobby() {
    document.getElementById("mode-selection-section").style.display = "none";
    document.getElementById("multiplayer-lobby-section").style.display = "block";
    const createInput = document.getElementById("create-room-id");
    if (createInput) {
        createInput.value = "";
        createInput.focus();
    }
    const joinInput = document.getElementById("room-id");
    if (joinInput) {
        joinInput.value = "";
    }
    socket.emit("get_rooms_list");
}

function closeMultiplayerLobby() {
    document.getElementById("multiplayer-lobby-section").style.display = "none";
    document.getElementById("mode-selection-section").style.display = "block";
}

function showBattleGuessToast(username, word, isCorrect = false) {
    let container = document.getElementById("battle-toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "battle-toast-container";
        container.className = "battle-toast-container";
        document.body.appendChild(container);
    }
    
    const toast = document.createElement("div");
    
    if (isCorrect) {
        toast.className = "battle-toast battle-toast-correct";
        toast.innerHTML = `<span class="toast-icon">🏆</span>` +
                          `<span class="toast-user" style="background: rgba(0,0,0,0.15); padding: 2px 8px; border-radius: 6px;">${username}</span>` +
                          `<span class="toast-action"> 猜對了！ </span>` +
                          `<span class="toast-word" style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 4px; font-family: monospace;">${word.toUpperCase()}</span>` +
                          `<span class="toast-pts" style="background: rgba(0,0,0,0.15); padding: 2px 8px; border-radius: 6px;">+1分</span>`;
                          
        for (let i = 0; i < 16; i++) {
            const sparkle = document.createElement("div");
            const shapes = ["sparkle-circle", "sparkle-star", "sparkle-diamond"];
            sparkle.className = `battle-gold-sparkle ${shapes[Math.floor(Math.random() * shapes.length)]}`;
            const angle = Math.random() * Math.PI * 2;
            const distance = 35 + Math.random() * 65;
            sparkle.style.width = `${6 + Math.random() * 6}px`;
            sparkle.style.height = `${6 + Math.random() * 6}px`;
            sparkle.style.left = `50%`;
            sparkle.style.top = `50%`;
            sparkle.style.setProperty("--tx", `${Math.cos(angle) * distance}px`);
            sparkle.style.setProperty("--ty", `${Math.sin(angle) * distance}px`);
            const colors = ["#ffffff", "#e8f5e9", "#c8e6c9", "#a5d6a7"];
            sparkle.style.background = colors[Math.floor(Math.random() * colors.length)];
            toast.appendChild(sparkle);
        }
    } else {
        toast.className = "battle-toast";
        toast.innerHTML = `<span class="toast-icon">⚡</span>` +
                          `<span class="toast-user" style="color: var(--primary-color);">${username}</span>` +
                          `<span> 送出了 </span>` +
                          `<span class="toast-word" style="background: var(--bg-color); border: 1px solid var(--border-color); padding: 2px 8px; border-radius: 4px; font-family: monospace;">${word.toUpperCase()}</span>`;
    }
                      
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 1000);
}

function showFrenzyScoreToast(username) {
    let container = document.getElementById("battle-toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "battle-toast-container";
        container.className = "battle-toast-container";
        document.body.appendChild(container);
    }
    
    const toast = document.createElement("div");
    toast.className = "battle-toast battle-toast-correct";
    toast.innerHTML = `<span class="toast-icon">🔥</span>` +
                      `<span class="toast-user" style="background: rgba(0,0,0,0.15); padding: 2px 8px; border-radius: 6px;">${username}</span>` +
                      `<span class="toast-action"> 答對得分！ </span>` +
                      `<span class="toast-pts" style="background: rgba(0,0,0,0.15); padding: 2px 8px; border-radius: 6px;">+1分</span>`;
                      
    for (let i = 0; i < 12; i++) {
        const sparkle = document.createElement("div");
        const shapes = ["sparkle-circle", "sparkle-star", "sparkle-diamond"];
        sparkle.className = `battle-gold-sparkle ${shapes[Math.floor(Math.random() * shapes.length)]}`;
        const angle = Math.random() * Math.PI * 2;
        const distance = 30 + Math.random() * 60;
        sparkle.style.width = `${6 + Math.random() * 6}px`;
        sparkle.style.height = `${6 + Math.random() * 6}px`;
        sparkle.style.left = `50%`;
        sparkle.style.top = `50%`;
        sparkle.style.setProperty("--tx", `${Math.cos(angle) * distance}px`);
        sparkle.style.setProperty("--ty", `${Math.sin(angle) * distance}px`);
        
        const colors = ["#ffffff", "#e8f5e9", "#c8e6c9", "#a5d6a7"];
        sparkle.style.background = colors[Math.floor(Math.random() * colors.length)];
        toast.appendChild(sparkle);
    }
    
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 1000);
}

function showSinglePlayerScoreToast() {
    let container = document.getElementById("battle-toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "battle-toast-container";
        container.className = "battle-toast-container";
        document.body.appendChild(container);
    }
    
    const toast = document.createElement("div");
    toast.className = "battle-toast battle-toast-correct";
    toast.innerHTML = `<span class="toast-icon">🎉</span>` +
                      `<span class="toast-action" style="font-size: 1em; margin: 0 10px;"> 挑戰成功得分！ </span>` +
                      `<span class="toast-pts" style="font-size: 1em; background: rgba(0,0,0,0.15); padding: 4px 8px; border-radius: 6px;">+1 分</span>`;
                      
    for (let i = 0; i < 15; i++) {
        const sparkle = document.createElement("div");
        const shapes = ["sparkle-circle", "sparkle-star", "sparkle-diamond"];
        sparkle.className = `battle-gold-sparkle ${shapes[Math.floor(Math.random() * shapes.length)]}`;
        const angle = Math.random() * Math.PI * 2;
        const distance = 40 + Math.random() * 60;
        sparkle.style.width = `${6 + Math.random() * 6}px`;
        sparkle.style.height = `${6 + Math.random() * 6}px`;
        sparkle.style.left = `50%`;
        sparkle.style.top = `50%`;
        sparkle.style.setProperty("--tx", `${Math.cos(angle) * distance}px`);
        sparkle.style.setProperty("--ty", `${Math.sin(angle) * distance}px`);
        
        const colors = ["#ffffff", "#e8f5e9", "#c8e6c9", "#a5d6a7"];
        sparkle.style.background = colors[Math.floor(Math.random() * colors.length)];
        
        toast.appendChild(sparkle);
    }
    
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 1500);
}

socket.on("update_rooms_list", function(rooms) {
    const roomsList = document.getElementById("available-rooms-list");
    if (!roomsList) return;
    roomsList.innerHTML = "";
    if (!rooms || rooms.length === 0) {
        roomsList.innerHTML = `
            <div class="room-list-empty">
                <div class="room-list-empty-icon">🚪</div>
                <div>目前沒有活躍的房間，快去建立一個吧！</div>
            </div>
        `;
        return;
    }
    rooms.forEach(room => {
        const card = document.createElement("div");
        card.className = "room-card";
        const infoDiv = document.createElement("div");
        infoDiv.className = "room-info";
        const titleRow = document.createElement("div");
        titleRow.className = "room-title-row";
        const titleText = document.createElement("span");
        titleText.className = "room-title-text";
        titleText.innerText = `房間 ${room.room_id}`;
        titleRow.appendChild(titleText);
        infoDiv.appendChild(titleRow);
        const detailsDiv = document.createElement("div");
        detailsDiv.className = "room-details";
        const hostSpan = document.createElement("span");
        hostSpan.className = "room-host";
        hostSpan.innerText = `房主: ${room.host}`;
        const playersSpan = document.createElement("span");
        playersSpan.className = "room-players-count";
        playersSpan.innerText = `👥 ${room.player_count} / ${room.max_players} 人`;
        detailsDiv.appendChild(hostSpan);
        detailsDiv.appendChild(playersSpan);
        infoDiv.appendChild(detailsDiv);
        card.appendChild(infoDiv);
        const statusContainer = document.createElement("div");
        statusContainer.className = "room-status-container";
        const badge = document.createElement("span");
        const btn = document.createElement("button");
        if (room.is_playing) {
            badge.className = "room-badge room-badge-playing";
            badge.innerText = "遊戲中";
            btn.className = "room-join-btn btn-disabled";
            btn.disabled = true;
            btn.innerText = "遊戲中";
        } else {
            badge.className = "room-badge room-badge-waiting";
            badge.innerText = "尚未開始";
            btn.className = "room-join-btn";
            btn.innerText = "加入";
            btn.onclick = function() {
                const input = document.getElementById("room-id");
                if (input) {
                    input.value = room.room_id;
                    joinGame();
                }
            };
        }
        statusContainer.appendChild(badge);
        statusContainer.appendChild(btn);
        card.appendChild(statusContainer);
        roomsList.appendChild(card);
    });
});

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");

    if (usernameInput && passwordInput) {
        usernameInput.addEventListener("keydown", function(e) {
            if (e.key === "Enter") {
                e.preventDefault(); 
                passwordInput.focus(); 
            }
        });

        passwordInput.addEventListener("keydown", function(e) {
            if (e.key === "Enter") {
                e.preventDefault();
                login(); 
            }
        });
    }
});
