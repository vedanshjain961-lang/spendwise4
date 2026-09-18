const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.SUPABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.on('connect', () => {
    console.log('Connected to Supabase PostgreSQL database.');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

const initializeDatabase = async () => {
    try {
        // Create Users
        await pool.query(`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            college TEXT,
            course TEXT,
            semester INTEGER,
            monthly_allowance REAL DEFAULT 0.00,
            currency TEXT DEFAULT 'INR',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Create Categories
        await pool.query(`CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            icon TEXT DEFAULT 'bi-tag',
            color TEXT DEFAULT '#6c757d',
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        // Create Transactions
        await pool.query(`CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            category_id INTEGER NOT NULL,
            payment_method TEXT DEFAULT 'CASH',
            description TEXT,
            merchant TEXT,
            transaction_date DATE NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )`);

        // Create Budgets
        await pool.query(`CREATE TABLE IF NOT EXISTS budgets (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            category_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            month INTEGER NOT NULL,
            year INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )`);

        // Create Savings Goals
        await pool.query(`CREATE TABLE IF NOT EXISTS savings_goals (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            target_amount REAL NOT NULL,
            current_amount REAL DEFAULT 0.00,
            deadline DATE,
            description TEXT,
            status TEXT DEFAULT 'IN_PROGRESS',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        // Create Recurring Expenses
        await pool.query(`CREATE TABLE IF NOT EXISTS recurring_expenses (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            amount REAL NOT NULL,
            frequency TEXT NOT NULL,
            start_date DATE NOT NULL,
            next_due_date DATE NOT NULL,
            category_id INTEGER NOT NULL,
            is_active INTEGER DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )`);

        // Create Split Bills
        await pool.query(`CREATE TABLE IF NOT EXISTS split_bills (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            total_amount REAL NOT NULL,
            split_with INTEGER NOT NULL,
            amount_per_person REAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'PENDING',
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        // Create Debts / Loans
        await pool.query(`CREATE TABLE IF NOT EXISTS debts (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            lender_name TEXT NOT NULL,
            total_amount REAL NOT NULL,
            amount_paid REAL DEFAULT 0.00,
            due_date DATE,
            status TEXT DEFAULT 'ACTIVE',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        // Insert Default Categories if they don't exist
        const { rows } = await pool.query(`SELECT COUNT(*) as count FROM categories WHERE user_id IS NULL`);
        if (rows && parseInt(rows[0].count) === 0) {
            const defaults = [
                ['Food & Dining', 'EXPENSE', 'bi-cup-straw', '#FF5733'],
                ['Transportation', 'EXPENSE', 'bi-bus-front', '#335BFF'],
                ['Hostel/Rent', 'EXPENSE', 'bi-house-door', '#9033FF'],
                ['Education', 'EXPENSE', 'bi-book', '#33FF5B'],
                ['Entertainment', 'EXPENSE', 'bi-controller', '#FF33A8'],
                ['Shopping', 'EXPENSE', 'bi-bag', '#FF8F33'],
                ['Mobile/Internet', 'EXPENSE', 'bi-wifi', '#33FFF5'],
                ['Health', 'EXPENSE', 'bi-heart-pulse', '#FF3333'],
                ['Other', 'EXPENSE', 'bi-three-dots', '#6C757D'],
                ['Pocket Money', 'INCOME', 'bi-wallet2', '#28A745'],
                ['Scholarship', 'INCOME', 'bi-award', '#17A2B8'],
                ['Salary/Internship', 'INCOME', 'bi-briefcase', '#007BFF'],
                ['Family Support', 'INCOME', 'bi-people', '#E83E8C'],
                ['Other Income', 'INCOME', 'bi-cash-coin', '#20C997']
            ];
            
            for (const cat of defaults) {
                await pool.query(`INSERT INTO categories (name, type, icon, color) VALUES ($1, $2, $3, $4)`, cat);
            }
            console.log('Inserted default categories.');
        }
    } catch (err) {
        console.error("Database initialization error:", err);
    }
};

initializeDatabase();

// SQLite compatibility wrappers
// In SQLite, queries use `?` for parameters. In Postgres, they use `$1`, `$2`.
// This helper converts SQLite `?` to Postgres `$x`.
const convertQuery = (query) => {
    let index = 1;
    return query.replace(/\?/g, () => `$${index++}`);
};

const dbQuery = async (query, params = []) => {
    const { rows } = await pool.query(convertQuery(query), params);
    return rows;
};

const dbGet = async (query, params = []) => {
    const { rows } = await pool.query(convertQuery(query), params);
    return rows[0];
};

const dbRun = async (query, params = []) => {
    await pool.query(convertQuery(query), params);
};

module.exports = { pool, dbQuery, dbGet, dbRun };
