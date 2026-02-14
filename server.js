const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pg = require("pg");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// Render PostgreSQL (EXTERNAL URL)
const db = new pg.Pool({
    connectionString: "postgresql://db_farm_user:xjotQ7ALuIKcgV3ahcrM1lmnxipRz4BL@dpg-d67v226sb7us73c0nvhg-a.oregon-postgres.render.com/db_farm",
    ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = "supersecret";

// ------------------- AUTO DB INIT -------------------

async function initDB() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                nickname TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                xp INT DEFAULT 0,
                level INT DEFAULT 1,
                energy INT DEFAULT 20,
                max_energy INT DEFAULT 20,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS items (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                base_price NUMERIC NOT NULL,
                production_time INT DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS inventory (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id),
                item_id INT REFERENCES items(id),
                quantity NUMERIC DEFAULT 0,
                UNIQUE(user_id, item_id)
            );

            CREATE TABLE IF NOT EXISTS plants (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id),
                item_id INT REFERENCES items(id),
                planted_at BIGINT,
                grow_time INT
            );

            CREATE TABLE IF NOT EXISTS animals (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id),
                item_id INT REFERENCES items(id),
                last_feed BIGINT,
                produce_time INT
            );

            CREATE TABLE IF NOT EXISTS market (
                id SERIAL PRIMARY KEY,
                seller_id INT REFERENCES users(id),
                item_id INT REFERENCES items(id),
                price NUMERIC NOT NULL,
                quantity NUMERIC NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await db.query(`
            INSERT INTO items (name, type, base_price, production_time) VALUES
            ('Семена пшеницы', 'seed', 0.1, 60),
            ('Сено', 'resource', 0.5, 0),
            ('Курица', 'animal', 5, 60),
            ('Корова', 'animal', 20, 120),
            ('Пшеница', 'crop', 1, 60),
            ('Яйца', 'product', 2, 0),
            ('Молоко', 'product', 4, 0)
            ON CONFLICT DO NOTHING;
        `);

        console.log("DATABASE INITIALIZED ✔");
    } catch (err) {
        console.error("DB INIT ERROR:", err);
    }
}

initDB();

// ------------------- XP SYSTEM -------------------

async function addXP(user_id, amount) {
    await db.query(`
        UPDATE users SET xp = xp + $1 WHERE id=$2
    `, [amount, user_id]);

    const u = await db.query("SELECT xp FROM users WHERE id=$1", [user_id]);
    const xp = u.rows[0].xp;

    const level = Math.floor(xp / 100) + 1;

    await db.query(`
        UPDATE users SET level=$1 WHERE id=$2
    `, [level, user_id]);
}

// ------------------- ENERGY SYSTEM -------------------

async function useEnergy(user_id, amount) {
    const u = await db.query("SELECT energy FROM users WHERE id=$1", [user_id]);
    if (u.rows[0].energy < amount) return false;

    await db.query(`
        UPDATE users SET energy = energy - $1 WHERE id=$2
    `, [amount, user_id]);

    return true;
}

// ------------------- AUTH -------------------

app.post("/register", async (req, res) => {
    const { nickname, password } = req.body;

    const hash = await bcrypt.hash(password, 10);

    try {
        await db.query(
            "INSERT INTO users (nickname, password_hash) VALUES ($1, $2)",
            [nickname, hash]
        );
        res.json({ ok: true });
    } catch {
        res.json({ ok: false, error: "Nickname already exists" });
    }
});

app.post("/login", async (req, res) => {
    const { nickname, password } = req.body;

    const user = await db.query(
        "SELECT * FROM users WHERE nickname=$1",
        [nickname]
    );

    if (!user.rows.length) return res.json({ ok: false });

    const valid = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!valid) return res.json({ ok: false });

    const token = jwt.sign({ id: user.rows[0].id }, JWT_SECRET);

    await addXP(user.rows[0].id, 10);

    res.json({ ok: true, token });
});

function auth(req, res, next) {
    const token = req.headers.authorization;
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: "Unauthorized" });
    }
}

// ------------------- PROFILE -------------------

app.get("/profile", auth, async (req, res) => {
    const u = await db.query("SELECT xp, level, energy, max_energy FROM users WHERE id=$1", [req.user.id]);
    res.json(u.rows[0]);
});

// ------------------- INVENTORY -------------------

app.get("/inventory", auth, async (req, res) => {
    const items = await db.query(`
        SELECT inventory.id, items.name, items.type, inventory.quantity
        FROM inventory
        JOIN items ON items.id = inventory.item_id
        WHERE user_id=$1
    `, [req.user.id]);

    res.json(items.rows);
});

// ------------------- BUY -------------------

app.post("/buy-basic", auth, async (req, res) => {
    const { item_id, quantity } = req.body;

    const item = await db.query("SELECT * FROM items WHERE id=$1", [item_id]);
    if (!item.rows.length) return res.json({ ok: false });

    await db.query(`
        INSERT INTO inventory (user_id, item_id, quantity)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, item_id)
        DO UPDATE SET quantity = inventory.quantity + $3
    `, [req.user.id, item_id, quantity]);

    await addXP(req.user.id, 5);

    res.json({ ok: true });
});

// ------------------- PLANTS -------------------

app.post("/plant", auth, async (req, res) => {
    const ok = await useEnergy(req.user.id, 2);
    if (!ok) return res.json({ ok: false, error: "Not enough energy" });

    const seed = await db.query("SELECT * FROM items WHERE name='Семена пшеницы'");
    const crop = await db.query("SELECT * FROM items WHERE name='Пшеница'");

    await db.query(`
        INSERT INTO plants (user_id, item_id, planted_at, grow_time)
        VALUES ($1, $2, $3, $4)
    `, [req.user.id, crop.rows[0].id, Date.now(), 60000]);

    await addXP(req.user.id, 10);

    res.json({ ok: true });
});

app.get("/plants", auth, async (req, res) => {
    const rows = await db.query("SELECT * FROM plants WHERE user_id=$1", [req.user.id]);
    res.json(rows.rows);
});

// ------------------- ANIMALS -------------------

app.post("/feed", auth, async (req, res) => {
    const ok = await useEnergy(req.user.id, 3);
    if (!ok) return res.json({ ok: false, error: "Not enough energy" });

    await db.query(`
        UPDATE animals SET last_feed=$1 WHERE user_id=$2
    `, [Date.now(), req.user.id]);

    await addXP(req.user.id, 10);

    res.json({ ok: true });
});

app.get("/animals", auth, async (req, res) => {
    const rows = await db.query("SELECT * FROM animals WHERE user_id=$1", [req.user.id]);
    res.json(rows.rows);
});

// ------------------- START SERVER -------------------

app.listen(3000, () => console.log("Server running on port 3000"));
