const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'spendwise.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to SQLite database.');
        db.serialize(() => {
            // Create Users
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                college TEXT,
                course TEXT,
                semester INTEGER,
                monthly_allowance REAL DEFAULT 0.00,
                currency TEXT DEFAULT 'INR',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Create Categories
            db.run(`CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                icon TEXT DEFAULT 'bi-tag',
                color TEXT DEFAULT '#6c757d',
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`);

            // Create Transactions
            db.run(`CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                amount REAL NOT NULL,
                category_id INTEGER NOT NULL,
                payment_method TEXT DEFAULT 'CASH',
                description TEXT,
                merchant TEXT,
                transaction_date DATE NOT NULL,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (category_id) REFERENCES categories(id)
            )`);

            // Create Budgets
            db.run(`CREATE TABLE IF NOT EXISTS budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                category_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                month INTEGER NOT NULL,
                year INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (category_id) REFERENCES categories(id)
            )`);

            // Create Savings Goals
            db.run(`CREATE TABLE IF NOT EXISTS savings_goals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                target_amount REAL NOT NULL,
                current_amount REAL DEFAULT 0.00,
                deadline DATE,
                description TEXT,
                status TEXT DEFAULT 'IN_PROGRESS',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`);

            // Create Recurring Expenses
            db.run(`CREATE TABLE IF NOT EXISTS recurring_expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            db.run(`CREATE TABLE IF NOT EXISTS split_bills (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                total_amount REAL NOT NULL,
                split_with INTEGER NOT NULL,
                amount_per_person REAL NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'PENDING',
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`);

            // Create Debts / Loans
            db.run(`CREATE TABLE IF NOT EXISTS debts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                lender_name TEXT NOT NULL,
                total_amount REAL NOT NULL,
                amount_paid REAL DEFAULT 0.00,
                due_date DATE,
                status TEXT DEFAULT 'ACTIVE',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`);

            // Insert Default Categories if they don't exist
            db.get(`SELECT COUNT(*) as count FROM categories WHERE user_id IS NULL`, (err, row) => {
                if (row && row.count === 0) {
                    const stmt = db.prepare(`INSERT INTO categories (name, type, icon, color) VALUES (?, ?, ?, ?)`);
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
                    defaults.forEach(cat => stmt.run(cat));
                    stmt.finalize();
                    console.log('Inserted default categories.');
                }
            });
        });
    }
});

// Helper for promise-based queries
const dbQuery = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const dbGet = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const dbRun = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

module.exports = { db, dbQuery, dbGet, dbRun };
