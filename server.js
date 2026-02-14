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
            ('Курица', 'animal', 5, 3600),
            ('Корова', 'animal', 20, 7200),
            ('Пшеница', 'crop', 1, 0),
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
    } catch (err) {
        console.log(err);
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

// ------------------- BASIC MARKET -------------------

app.post("/buy-basic", auth, async (req, res) => {
    const { item_id, quantity } = req.body;

    const item = await db.query("SELECT * FROM items WHERE id=$1", [item_id]);
    if (!item.rows.length) return res.json({ ok: false });

    const price = item.rows[0].base_price * quantity;

    await db.query(`
        INSERT INTO inventory (user_id, item_id, quantity)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, item_id)
        DO UPDATE SET quantity = inventory.quantity + $3
    `, [req.user.id, item_id, quantity]);

    res.json({ ok: true, spent: price });
});

// ------------------- P2P MARKET -------------------

app.post("/market/sell", auth, async (req, res) => {
    const { item_id, price, quantity } = req.body;

    await db.query(`
        INSERT INTO market (seller_id, item_id, price, quantity)
        VALUES ($1, $2, $3, $4)
    `, [req.user.id, item_id, price, quantity]);

    res.json({ ok: true });
});

app.post("/market/buy", auth, async (req, res) => {
    const { market_id, quantity } = req.body;

    const row = await db.query("SELECT * FROM market WHERE id=$1", [market_id]);
    if (!row.rows.length) return res.json({ ok: false });

    const offer = row.rows[0];

    if (quantity > offer.quantity)
        return res.json({ ok: false, error: "Not enough quantity" });

    await db.query(`
        UPDATE market SET quantity = quantity - $1 WHERE id=$2
    `, [quantity, market_id]);

    await db.query(`
        INSERT INTO inventory (user_id, item_id, quantity)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, item_id)
        DO UPDATE SET quantity = inventory.quantity + $3
    `, [req.user.id, offer.item_id, quantity]);

    res.json({ ok: true });
});

// ------------------- START SERVER -------------------

app.listen(3000, () => console.log("Server running on port 3000"));
