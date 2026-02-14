-- USERS
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50),
    level INT DEFAULT 1,
    xp INT DEFAULT 0,
    energy INT DEFAULT 20,
    max_energy INT DEFAULT 20,
    coins INT DEFAULT 0,
    gems INT DEFAULT 0,
    plant_slots INT DEFAULT 3,
    animal_slots INT DEFAULT 2,
    created_at DATETIME,
    updated_at DATETIME
);

-- USER PLANTS
CREATE TABLE user_plants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    plant_type VARCHAR(50),
    planted_at DATETIME,
    ready_at DATETIME,
    status ENUM('growing', 'ready'),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- USER ANIMALS
CREATE TABLE user_animals (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    animal_type VARCHAR(50),
    last_produced_at DATETIME,
    ready_at DATETIME,
    status ENUM('producing', 'ready'),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- USER INVENTORY
CREATE TABLE user_inventory (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    item VARCHAR(50),
    amount INT DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- SIDE QUESTS
CREATE TABLE side_quests (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(100),
    type ENUM('collect', 'plant'),
    item VARCHAR(50),
    amount INT,
    reward_xp INT,
    reward_coins INT,
    reward_gems INT,
    created_at DATETIME
);

-- USER SIDE QUESTS
CREATE TABLE user_side_quests (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    quest_id INT,
    progress INT DEFAULT 0,
    status ENUM('active', 'completed', 'claimed'),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (quest_id) REFERENCES side_quests(id)
);

-- USER BONUSES
CREATE TABLE user_bonuses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    bonus_type ENUM('max_energy', 'animal_slot', 'plant_slot'),
    amount INT DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- STORY PROGRESS
CREATE TABLE story_progress (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    chapter INT,
    quest_id INT,
    step_id INT,
    progress INT DEFAULT 0,
    status ENUM('active', 'completed', 'claimed'),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ACTION LOGS
CREATE TABLE action_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    action_type VARCHAR(50),
    item VARCHAR(50),
    amount INT,
    created_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
