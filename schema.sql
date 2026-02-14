CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    nickname TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    base_price NUMERIC NOT NULL,
    production_time INT DEFAULT 0
);

CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    item_id INT REFERENCES items(id),
    quantity NUMERIC DEFAULT 0
);

CREATE TABLE market (
    id SERIAL PRIMARY KEY,
    seller_id INT REFERENCES users(id),
    item_id INT REFERENCES items(id),
    price NUMERIC NOT NULL,
    quantity NUMERIC NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);