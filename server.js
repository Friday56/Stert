const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pg = require("pg");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// Render PostgreSQL
const db = new pg.Pool({
    connectionString: "postgresql://db_farm_user:xjotQ7ALuIKcgV3ahcrM1lmnxipRz4BL@dpg-d67v226sb7us73c0nvhg-a.oregon-postgres.render.com/db_farm",
    ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = "supersecret";

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

// ------------------- START -------------------

app.listen(3000, () => console.log("Server running"));