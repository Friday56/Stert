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
app.listen(3000, () => {
    console.log("Fun Farm server running on port 3000");
});
