const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// Подключение к базе
const db = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "",
    database: "funfarm"
});

// Проверка подключения
db.getConnection((err) => {
    if (err) {
        console.error("Ошибка подключения к базе:", err);
    } else {
        console.log("База данных подключена");
    }
});

// Универсальная функция запроса
function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}

app.get("/", (req, res) => {
    res.send("Fun Farm server is running!");
});
app.post("/createUser", async (req, res) => {
    const { username } = req.body;

    try {
        const result = await query(
            "INSERT INTO users (username, created_at, updated_at) VALUES (?, NOW(), NOW())",
            [username]
        );

        res.json({ success: true, user_id: result.insertId });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
app.get("/profile/:user_id", async (req, res) => {
    const { user_id } = req.params;

    try {
        const user = await query("SELECT * FROM users WHERE id = ?", [user_id]);
        res.json(user[0]);
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
const RANDOM_ITEMS = ["Яйца", "Молоко", "Пшеница", "Семена"];
const QUEST_TYPES = ["collect", "plant"];

function generateRandomQuest() {
    const type = QUEST_TYPES[Math.floor(Math.random() * QUEST_TYPES.length)];
    const item = RANDOM_ITEMS[Math.floor(Math.random() * RANDOM_ITEMS.length)];
    const amount = Math.floor(Math.random() * 3) + 2;

    return {
        title: `Выполнить задание: ${type} ${amount} ${item}`,
        type,
        item,
        amount,
        reward_xp: 10 + amount * 5,
        reward_coins: 5 + amount * 3,
        reward_gems: Math.random() < 0.1 ? 1 : 0
    };
}
app.post("/generateSideQuest", async (req, res) => {
    const { user_id } = req.body;

    const q = generateRandomQuest();

    try {
        const result = await query(
            "INSERT INTO side_quests (title, type, item, amount, reward_xp, reward_coins, reward_gems, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
            [q.title, q.type, q.item, q.amount, q.reward_xp, q.reward_coins, q.reward_gems]
        );

        await query(
            "INSERT INTO user_side_quests (user_id, quest_id, status) VALUES (?, ?, 'active')",
            [user_id, result.insertId]
        );

        res.json({ success: true, quest_id: result.insertId, quest: q });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
app.get("/plants/:user_id", async (req, res) => {
    const { user_id } = req.params;

    try {
        const plants = await query(
            "SELECT * FROM user_plants WHERE user_id = ?",
            [user_id]
        );
        res.json(plants);
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
app.post("/plant", async (req, res) => {
    const { user_id, plant_type, grow_time } = req.body;

    const planted_at = new Date();
    const ready_at = new Date(Date.now() + grow_time * 1000);

    try {
        await query(
            "INSERT INTO user_plants (user_id, plant_type, planted_at, ready_at, status) VALUES (?, ?, ?, ?, 'growing')",
            [user_id, plant_type, planted_at, ready_at]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
app.post("/harvest", async (req, res) => {
    const { plant_id, user_id, item, amount } = req.body;

    try {
        // удалить растение
        await query("DELETE FROM user_plants WHERE id = ?", [plant_id]);

        // добавить в инвентарь
        await query(
            "INSERT INTO user_inventory (user_id, item, amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?",
            [user_id, item, amount, amount]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
app.get("/updatePlants/:user_id", async (req, res) => {
    const { user_id } = req.params;

    try {
        await query(
            "UPDATE user_plants SET status = 'ready' WHERE user_id = ? AND ready_at <= NOW()",
            [user_id]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
app.get("/animals/:user_id", async (req, res) => {
    const { user_id } = req.params;

    try {
        const animals = await query(
            "SELECT * FROM user_animals WHERE user_id = ?",
            [user_id]
        );
        res.json(animals);
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
app.post("/buyAnimal", async (req, res) => {
    const { user_id, animal_type, produce_time } = req.body;

    const now = new Date();
    const ready_at = new Date(Date.now() + produce_time * 1000);

    try {
        await query(
            "INSERT INTO user_animals (user_id, animal_type, last_produced_at, ready_at, status) VALUES (?, ?, ?, ?, 'producing')",
            [user_id, animal_type, now, ready_at]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
app.post("/collectAnimalProduct", async (req, res) => {
    const { animal_id, user_id, item, amount, produce_time } = req.body;

    const now = new Date();
    const next_ready = new Date(Date.now() + produce_time * 1000);

    try {
        // обновить животное
        await query(
            "UPDATE user_animals SET last_produced_at = ?, ready_at = ?, status = 'producing' WHERE id = ?",
            [now, next_ready, animal_id]
        );

        // добавить в инвентарь
        await query(
            "INSERT INTO user_inventory (user_id, item, amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + ?",
            [user_id, item, amount, amount]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
app.get("/updateAnimals/:user_id", async (req, res) => {
    const { user_id } = req.params;

    try {
        await query(
            "UPDATE user_animals SET status = 'ready' WHERE user_id = ? AND ready_at <= NOW()",
            [user_id]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
app.get("/energy/:user_id", async (req, res) => {
    const { user_id } = req.params;

    try {
        const user = await query("SELECT energy, max_energy FROM users WHERE id = ?", [user_id]);
        res.json(user[0]);
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
app.post("/energy/spend", async (req, res) => {
    const { user_id, amount } = req.body;

    try {
        const user = await query("SELECT energy FROM users WHERE id = ?", [user_id]);

        if (user[0].energy < amount) {
            return res.json({ success: false, message: "Недостаточно энергии" });
        }

        await query(
            "UPDATE users SET energy = energy - ? WHERE id = ?",
            [amount, user_id]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
app.post("/energy/restore", async (req, res) => {
    const { user_id, amount } = req.body;

    try {
        await query(
            "UPDATE users SET energy = LEAST(energy + ?, max_energy) WHERE id = ?",
            [amount, user_id]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
app.get("/energy/update/:user_id", async (req, res) => {
    const { user_id } = req.params;

    try {
        await query(`
            UPDATE users 
            SET energy = LEAST(max_energy, energy + 1)
            WHERE id = ? AND energy < max_energy
        `, [user_id]);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
const LEVELS = [
    { level: 1, xp_required: 0 },
    { level: 2, xp_required: 50 },
    { level: 3, xp_required: 120 },
    { level: 4, xp_required: 250 },
    { level: 5, xp_required: 500 },
    { level: 6, xp_required: 900 },
    { level: 7, xp_required: 1500 }
];
app.get("/xp/:user_id", async (req, res) => {
    const { user_id } = req.params;

    try {
        const user = await query(
            "SELECT xp, level FROM users WHERE id = ?",
            [user_id]
        );

        res.json(user[0]);
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
function checkLevelUp(currentXP) {
    let newLevel = 1;

    for (let lvl of LEVELS) {
        if (currentXP >= lvl.xp_required) {
            newLevel = lvl.level;
        }
    }

    return newLevel;
            }
app.post("/xp/add", async (req, res) => {
    const { user_id, amount } = req.body;

    try {
        // получить текущий XP
        const user = await query(
            "SELECT xp, level FROM users WHERE id = ?",
            [user_id]
        );

        const newXP = user[0].xp + amount;
        const newLevel = checkLevelUp(newXP);

        // обновить XP
        await query(
            "UPDATE users SET xp = ?, level = ? WHERE id = ?",
            [newXP, newLevel, user_id]
        );

        res.json({
            success: true,
            xp: newXP,
            level: newLevel,
            level_up: newLevel > user[0].level
        });

    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
// пример вызова
await fetch("/xp/add", {
    method: "POST",
    body: JSON.stringify({ user_id, amount: 10 })
});
const STORY_QUESTS = [
    {
        chapter: 1,
        quest_id: 1,
        title: "Добро пожаловать в Зелёную Долину",
        steps: [
            { id: 1, type: "talk", npc: "Bed MaZai" },
            { id: 2, type: "buy", item: "Курица", amount: 1 },
            { id: 3, type: "collect", item: "Яйца", amount: 3 },
            { id: 4, type: "plant", item: "Пшеница", amount: 1 }
        ],
        reward_xp: 50,
        reward_coins: 100,
        reward_gems: 1
    }
];
app.get("/story/:user_id", async (req, res) => {
    const { user_id } = req.params;

    try {
        const progress = await query(
            "SELECT * FROM story_progress WHERE user_id = ?",
            [user_id]
        );

        if (progress.length === 0) {
            // если игрок впервые — создаём прогресс
            await query(
                "INSERT INTO story_progress (user_id, chapter, quest_id, step_id, status) VALUES (?, 1, 1, 1, 'active')",
                [user_id]
            );

            return res.json({
                chapter: 1,
                quest_id: 1,
                step_id: 1,
                step: STORY_QUESTS[0].steps[0]
            });
        }

        const p = progress[0];
        const quest = STORY_QUESTS.find(q => q.quest_id === p.quest_id);
        const step = quest.steps.find(s => s.id === p.step_id);

        res.json({
            chapter: p.chapter,
            quest_id: p.quest_id,
            step_id: p.step_id,
            step
        });

    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
app.post("/story/completeStep", async (req, res) => {
    const { user_id } = req.body;

    try {
        const progress = await query(
            "SELECT * FROM story_progress WHERE user_id = ?",
            [user_id]
        );

        const p = progress[0];
        const quest = STORY_QUESTS.find(q => q.quest_id === p.quest_id);

        const nextStep = p.step_id + 1;

        if (nextStep > quest.steps.length) {
            // квест завершён
            await query(
                "UPDATE story_progress SET status = 'completed' WHERE user_id = ?",
                [user_id]
            );

            return res.json({ success: true, completed: true });
        }

        // перейти к следующему шагу
        await query(
            "UPDATE story_progress SET step_id = ? WHERE user_id = ?",
            [nextStep, user_id]
        );

        res.json({ success: true, next_step: nextStep });

    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});
app.post("/story/claimReward", async (req, res) => {
    const { user_id } = req.body;

    try {
        const progress = await query(
            "SELECT * FROM story_progress WHERE user_id = ?",
            [user_id]
        );

        const p = progress[0];

        if (p.status !== "completed") {
            return res.json({ success: false, message: "Квест ещё не завершён" });
        }

        const quest = STORY_QUESTS.find(q => q.quest_id === p.quest_id);

        // начислить награду
        await query(
            "UPDATE users SET coins = coins + ?, gems = gems + ?, xp = xp + ? WHERE id = ?",
            [quest.reward_coins, quest.reward_gems, quest.reward_xp, user_id]
        );

        // отметить награду как полученную
        await query(
            "UPDATE story_progress SET status = 'claimed' WHERE user_id = ?",
            [user_id]
        );

        res.json({
            success: true,
            reward: {
                coins: quest.reward_coins,
                gems: quest.reward_gems,
                xp: quest.reward_xp
            }
        });

    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});

app.listen(3000, () => {
    console.log("Fun Farm server running on port 3000");
});
