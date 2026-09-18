require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const { GoogleGenAI } = require('@google/genai');
const { dbGet, dbRun, dbQuery } = require('./database');

// Initialize Gemini Client
const ai = new GoogleGenAI({});


const app = express();
const PORT = 3000;

// Setup EJS and static files
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));

// Setup Session
app.use(session({
    secret: 'spendwise-secret-key-12345',
    resave: false,
    saveUninitialized: false
}));

// Middleware to protect routes
const requireAuth = (req, res, next) => {
    if (req.session && req.session.user) {
        // Expose user to all EJS templates
        res.locals.user = req.session.user;
        next();
    } else {
        res.redirect('/login');
    }
};

// ==== PUBLIC ROUTES ====

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('login', { error: req.query.error, registered: req.query.registered, logout: req.query.logout });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await dbGet(`SELECT * FROM users WHERE email = ?`, [email]);
        if (user && await bcrypt.compare(password, user.password_hash)) {
            req.session.user = user;
            res.redirect('/dashboard');
        } else {
            res.redirect('/login?error=Invalid email or password.');
        }
    } catch (err) {
        console.error(err);
        res.redirect('/login?error=Server error');
    }
});

app.get('/register', (req, res) => {
    res.render('register', { error: req.query.error });
});

app.post('/register', async (req, res) => {
    const { name, email, password, college, course, semester, allowance } = req.body;
    try {
        const existing = await dbGet(`SELECT * FROM users WHERE email = ?`, [email]);
        if (existing) {
            return res.redirect('/register?error=Email already exists.');
        }
        
        const hash = await bcrypt.hash(password, 10);
        await dbRun(
            `INSERT INTO users (name, email, password_hash, college, course, semester, monthly_allowance) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [name, email, hash, college, course, semester || 1, allowance || 0]
        );
        res.redirect('/login?registered=true');
    } catch (err) {
        console.error(err);
        res.redirect('/register?error=Registration failed.');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login?logout=true');
});

// ==== PROTECTED ROUTES ====

// Helper formatting functions for views
app.locals.formatCurrency = (amount) => '₹' + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
app.locals.formatDate = (dateString) => {
    if(!dateString) return '';
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};

app.get('/dashboard', requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    try {
        // Get totals
        const expenseRow = await dbGet(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'EXPENSE' AND cast(strftime('%m', transaction_date) as integer) = ? AND cast(strftime('%Y', transaction_date) as integer) = ?`, [userId, currentMonth, currentYear]);
        const incomeRow = await dbGet(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'INCOME' AND cast(strftime('%m', transaction_date) as integer) = ? AND cast(strftime('%Y', transaction_date) as integer) = ?`, [userId, currentMonth, currentYear]);
        
        const totalExpense = expenseRow.total;
        const totalIncome = incomeRow.total;
        const remainingBudget = req.session.user.monthly_allowance - totalExpense;

        // Get recent transactions
        const recentTransactions = await dbQuery(`
            SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color 
            FROM transactions t 
            JOIN categories c ON t.category_id = c.id 
            WHERE t.user_id = ? 
            ORDER BY t.transaction_date DESC, t.created_at DESC 
            LIMIT 5
        `, [userId]);

        // Get categories for modals
        const expenseCats = await dbQuery(`SELECT * FROM categories WHERE (user_id IS NULL OR user_id = ?) AND type = 'EXPENSE' ORDER BY name`, [userId]);
        const incomeCats = await dbQuery(`SELECT * FROM categories WHERE (user_id IS NULL OR user_id = ?) AND type = 'INCOME' ORDER BY name`, [userId]);

        res.render('dashboard', {
            totalExpense,
            totalIncome,
            remainingBudget,
            recentTransactions,
            expenseCategories: expenseCats,
            incomeCategories: incomeCats
        });
    } catch (err) {
        console.error(err);
        res.send("Error loading dashboard");
    }
});

app.get('/transactions', requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    const { search, month, type } = req.query;

    try {
        let query = `
            SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color 
            FROM transactions t 
            JOIN categories c ON t.category_id = c.id 
            WHERE t.user_id = ?
        `;
        let params = [userId];

        if (search) {
            query += ` AND (t.description LIKE ? OR c.name LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }
        if (month) {
            query += ` AND strftime('%Y-%m', t.transaction_date) = ?`;
            params.push(month);
        }
        if (type) {
            query += ` AND t.type = ?`;
            params.push(type.toUpperCase());
        }

        query += ` ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT 50`;

        const transactions = await dbQuery(query, params);
        const expenseCats = await dbQuery(`SELECT * FROM categories WHERE (user_id IS NULL OR user_id = ?) AND type = 'EXPENSE' ORDER BY name`, [userId]);
        const incomeCats = await dbQuery(`SELECT * FROM categories WHERE (user_id IS NULL OR user_id = ?) AND type = 'INCOME' ORDER BY name`, [userId]);

        res.render('transactions', { 
            transactions, 
            expenseCategories: expenseCats, 
            incomeCategories: incomeCats,
            filters: { search: search || '', month: month || '', type: type || '' }
        });
    } catch (err) {
        console.error(err);
        res.send("Error");
    }
});

app.post('/transactions', requireAuth, async (req, res) => {
    const { type, amount, categoryId, paymentMethod, description, transactionDate, origin } = req.body;
    try {
        await dbRun(
            `INSERT INTO transactions (user_id, type, amount, category_id, payment_method, description, transaction_date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.session.user.id, type, parseFloat(amount), categoryId, paymentMethod, description, transactionDate]
        );
        res.redirect(origin === 'dashboard' ? '/dashboard' : '/transactions');
    } catch(err) {
        console.error(err);
        res.send("Error saving transaction");
    }
});

app.get('/budgets', requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    try {
        const budgets = await dbQuery(`
            SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
                   (SELECT COALESCE(SUM(amount), 0) FROM transactions t WHERE t.user_id = b.user_id AND t.category_id = b.category_id AND cast(strftime('%m', t.transaction_date) as integer) = b.month AND cast(strftime('%Y', t.transaction_date) as integer) = b.year) as spent_amount 
            FROM budgets b 
            JOIN categories c ON b.category_id = c.id 
            WHERE b.user_id = ? AND b.month = ? AND b.year = ?
        `, [userId, currentMonth, currentYear]);

        const expenseCats = await dbQuery(`SELECT * FROM categories WHERE (user_id IS NULL OR user_id = ?) AND type = 'EXPENSE' ORDER BY name`, [userId]);

        // Calculate percentages
        budgets.forEach(b => {
            b.percentageUsed = b.amount > 0 ? (b.spent_amount / b.amount) * 100 : 0;
        });

        res.render('budgets', { budgets, expenseCategories: expenseCats, currentMonthName: monthNames[currentMonth-1] });
    } catch(err) {
        console.error(err);
        res.send("Error");
    }
});

app.post('/budgets', requireAuth, async (req, res) => {
    const { categoryId, amount } = req.body;
    const userId = req.session.user.id;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    try {
        const existing = await dbGet(`SELECT id FROM budgets WHERE user_id = ? AND category_id = ? AND month = ? AND year = ?`, [userId, categoryId, currentMonth, currentYear]);
        if (existing) {
            await dbRun(`UPDATE budgets SET amount = ? WHERE id = ?`, [parseFloat(amount), existing.id]);
        } else {
            await dbRun(`INSERT INTO budgets (user_id, category_id, amount, month, year) VALUES (?, ?, ?, ?, ?)`, [userId, categoryId, parseFloat(amount), currentMonth, currentYear]);
        }
        res.redirect('/budgets');
    } catch(err) {
        console.error(err);
        res.send("Error saving budget");
    }
});

// ==== SETTINGS ====
app.post('/settings/allowance', requireAuth, async (req, res) => {
    try {
        const newAllowance = parseFloat(req.body.allowance);
        await dbRun(`UPDATE users SET monthly_allowance = ? WHERE id = ?`, [newAllowance, req.session.user.id]);
        req.session.user.monthly_allowance = newAllowance; // update session
        res.redirect('/dashboard');
    } catch(err) {
        console.error(err);
        res.send("Error updating allowance");
    }
});

app.get('/savings', requireAuth, async (req, res) => {
    try {
        const goals = await dbQuery(`SELECT * FROM savings_goals WHERE user_id = ? ORDER BY created_at DESC`, [req.session.user.id]);
        goals.forEach(g => {
            g.percentage = g.target_amount > 0 ? Math.min((g.current_amount / g.target_amount) * 100, 100) : 0;
        });
        res.render('savings', { goals });
    } catch(err) {
        console.error(err);
        res.send("Error");
    }
});

app.post('/savings', requireAuth, async (req, res) => {
    const { action, goalId, amount, name, targetAmount, currentAmount, deadline, description } = req.body;
    const userId = req.session.user.id;

    try {
        if (action === 'addFund') {
            await dbRun(`UPDATE savings_goals SET current_amount = current_amount + ? WHERE id = ? AND user_id = ?`, [parseFloat(amount), goalId, userId]);
        } else {
            await dbRun(
                `INSERT INTO savings_goals (user_id, name, target_amount, current_amount, deadline, description) VALUES (?, ?, ?, ?, ?, ?)`,
                [userId, name, parseFloat(targetAmount), currentAmount ? parseFloat(currentAmount) : 0, deadline || null, description]
            );
        }
        res.redirect('/savings');
    } catch(err) {
        console.error(err);
        res.send("Error saving goal");
    }
});

app.post('/savings/delete', requireAuth, async (req, res) => {
    try {
        await dbRun(`DELETE FROM savings_goals WHERE id = ? AND user_id = ?`, [req.body.goalId, req.session.user.id]);
        res.redirect('/savings');
    } catch(err) {
        console.error(err);
        res.send("Error deleting goal");
    }
});

app.get('/analytics', requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    try {
        const transactions = await dbQuery(`
            SELECT t.*, c.name as category_name 
            FROM transactions t JOIN categories c ON t.category_id = c.id 
            WHERE t.user_id = ? AND t.type = 'EXPENSE' AND cast(strftime('%m', t.transaction_date) as integer) = ? AND cast(strftime('%Y', t.transaction_date) as integer) = ?
        `, [userId, currentMonth, currentYear]);

        // Group by category
        const categorySpending = {};
        let totalSpend = 0;
        transactions.forEach(t => {
            categorySpending[t.category_name] = (categorySpending[t.category_name] || 0) + t.amount;
            totalSpend += t.amount;
        });

        let topCategory = '';
        let maxSpend = 0;
        for (const [cat, amt] of Object.entries(categorySpending)) {
            if (amt > maxSpend) {
                maxSpend = amt;
                topCategory = cat;
            }
        }

        const avgDaily = totalSpend / now.getDate();
        let healthScore = 85;
        if (totalSpend > req.session.user.monthly_allowance) healthScore -= 30;
        else if (totalSpend > req.session.user.monthly_allowance * 0.8) healthScore -= 15;
        if (avgDaily > (req.session.user.monthly_allowance / 30)) healthScore -= 10;

        res.render('analytics', {
            categoryLabels: Object.keys(categorySpending),
            categoryData: Object.values(categorySpending),
            topCategory,
            avgDaily: avgDaily.toFixed(2),
            healthScore
        });
    } catch(err) {
        console.error(err);
        res.send("Error loading analytics");
    }
});

// API for Affordability
app.post('/api/affordability', requireAuth, async (req, res) => {
    const itemCost = parseFloat(req.body.cost);
    const userId = req.session.user.id;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    try {
        const expenseRow = await dbGet(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'EXPENSE' AND cast(strftime('%m', transaction_date) as integer) = ? AND cast(strftime('%Y', transaction_date) as integer) = ?`, [userId, currentMonth, currentYear]);
        const remainingAllowance = req.session.user.monthly_allowance - expenseRow.total;
        const actualDisposable = remainingAllowance; 

        let result, color, message;
        if (actualDisposable < itemCost) {
            result = "🔴 Not Recommended"; color = "text-danger";
            message = `This purchase will push you over your planned budget. You only have ₹${actualDisposable.toFixed(2)} disposable income left.`;
        } else if (actualDisposable * 0.4 < itemCost) {
            result = "🟡 Be Careful"; color = "text-warning";
            message = "You can afford this, but it takes up more than 40% of your remaining disposable budget for the month.";
        } else {
            result = "🟢 Yes"; color = "text-success";
            message = "You can afford this purchase comfortably while staying within your budget.";
        }
        res.json({ result, color, message });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==== SUBSCRIPTIONS ROUTES ====

app.get('/subscriptions', requireAuth, async (req, res) => {
    try {
        const subscriptions = await dbQuery(`
            SELECT r.*, c.name as category_name, c.icon as category_icon, c.color as category_color 
            FROM recurring_expenses r 
            JOIN categories c ON r.category_id = c.id 
            WHERE r.user_id = ? ORDER BY r.next_due_date ASC
        `, [req.session.user.id]);
        
        const expenseCats = await dbQuery(`SELECT * FROM categories WHERE (user_id IS NULL OR user_id = ?) AND type = 'EXPENSE' ORDER BY name`, [req.session.user.id]);
        
        // Calculate total monthly cost
        let monthlyTotal = 0;
        subscriptions.forEach(sub => {
            if (sub.is_active) {
                if (sub.frequency === 'MONTHLY') monthlyTotal += sub.amount;
                else if (sub.frequency === 'YEARLY') monthlyTotal += (sub.amount / 12);
                else if (sub.frequency === 'WEEKLY') monthlyTotal += (sub.amount * 4.33);
            }
        });

        res.render('subscriptions', { subscriptions, expenseCategories: expenseCats, monthlyTotal });
    } catch (err) {
        console.error(err);
        res.send("Error");
    }
});

app.post('/subscriptions', requireAuth, async (req, res) => {
    const { name, amount, frequency, startDate, categoryId } = req.body;
    
    // Calculate next due date simply based on start date
    const start = new Date(startDate);
    let nextDue = new Date(start);
    const now = new Date();
    
    // Fast forward to next future date
    while(nextDue < now) {
        if(frequency === 'MONTHLY') nextDue.setMonth(nextDue.getMonth() + 1);
        else if(frequency === 'YEARLY') nextDue.setFullYear(nextDue.getFullYear() + 1);
        else if(frequency === 'WEEKLY') nextDue.setDate(nextDue.getDate() + 7);
    }

    try {
        await dbRun(
            `INSERT INTO recurring_expenses (user_id, name, amount, frequency, start_date, next_due_date, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.session.user.id, name, parseFloat(amount), frequency, startDate, nextDue.toISOString().split('T')[0], categoryId]
        );
        res.redirect('/subscriptions');
    } catch (err) {
        console.error(err);
        res.send("Error saving subscription");
    }
});

app.post('/subscriptions/cancel', requireAuth, async (req, res) => {
    try {
        await dbRun(`UPDATE recurring_expenses SET is_active = 0 WHERE id = ? AND user_id = ?`, [req.body.subId, req.session.user.id]);
        res.redirect('/subscriptions');
    } catch (err) {
        console.error(err);
        res.send("Error");
    }
});

// ==== EXPORT CSV ====
app.get('/transactions/export', requireAuth, async (req, res) => {
    try {
        const transactions = await dbQuery(`
            SELECT t.transaction_date, t.description, c.name as category, t.payment_method, t.type, t.amount 
            FROM transactions t 
            JOIN categories c ON t.category_id = c.id 
            WHERE t.user_id = ? 
            ORDER BY t.transaction_date DESC
        `, [req.session.user.id]);

        let csv = 'Date,Description,Category,Payment Method,Type,Amount\n';
        transactions.forEach(t => {
            csv += `${t.transaction_date},"${t.description}",${t.category},${t.payment_method},${t.type},${t.amount}\n`;
        });

        res.header('Content-Type', 'text/csv');
        res.attachment('spendwise_transactions.csv');
        res.send(csv);
    } catch (err) {
        console.error(err);
        res.send("Error exporting data");
    }
});

// ==== SPLIT BILLS ROUTES ====

app.get('/split-bills', requireAuth, async (req, res) => {
    try {
        const bills = await dbQuery(`SELECT * FROM split_bills WHERE user_id = ? ORDER BY created_at DESC`, [req.session.user.id]);
        res.render('split-bills', { bills });
    } catch(err) {
        console.error(err);
        res.send("Error");
    }
});

app.post('/split-bills', requireAuth, async (req, res) => {
    const { title, totalAmount, splitWith } = req.body;
    const amountPerPerson = parseFloat(totalAmount) / (parseInt(splitWith) + 1); // +1 for the user themselves
    
    try {
        await dbRun(
            `INSERT INTO split_bills (user_id, title, total_amount, split_with, amount_per_person) VALUES (?, ?, ?, ?, ?)`,
            [req.session.user.id, title, parseFloat(totalAmount), parseInt(splitWith), amountPerPerson]
        );
        res.redirect('/split-bills');
    } catch(err) {
        console.error(err);
        res.send("Error");
    }
});

app.post('/split-bills/settle', requireAuth, async (req, res) => {
    try {
        await dbRun(`UPDATE split_bills SET status = 'SETTLED' WHERE id = ? AND user_id = ?`, [req.body.billId, req.session.user.id]);
        res.redirect('/split-bills');
    } catch(err) {
        console.error(err);
        res.send("Error");
    }
});

app.post('/split-bills/delete', requireAuth, async (req, res) => {
    try {
        await dbRun(`DELETE FROM split_bills WHERE id = ? AND user_id = ?`, [req.body.billId, req.session.user.id]);
        res.redirect('/split-bills');
    } catch(err) {
        console.error(err);
        res.send("Error");
    }
});

// ==== DEBT TRACKER ROUTES ====

app.get('/debts', requireAuth, async (req, res) => {
    try {
        const debts = await dbQuery(`SELECT * FROM debts WHERE user_id = ? ORDER BY status ASC, due_date ASC`, [req.session.user.id]);
        res.render('debts', { debts });
    } catch(err) {
        console.error(err);
        res.send("Error");
    }
});

app.post('/debts', requireAuth, async (req, res) => {
    const { action, debtId, amount } = req.body;
    try {
        if (action === 'create') {
            const { lenderName, totalAmount, dueDate } = req.body;
            await dbRun(
                `INSERT INTO debts (user_id, lender_name, total_amount, due_date) VALUES (?, ?, ?, ?)`,
                [req.session.user.id, lenderName, parseFloat(totalAmount), dueDate || null]
            );
        } else if (action === 'pay') {
            await dbRun(`UPDATE debts SET amount_paid = amount_paid + ? WHERE id = ? AND user_id = ?`, [parseFloat(amount), debtId, req.session.user.id]);
            // Auto-update status if fully paid
            await dbRun(`UPDATE debts SET status = 'PAID' WHERE id = ? AND user_id = ? AND amount_paid >= total_amount`, [debtId, req.session.user.id]);
        }
        res.redirect('/debts');
    } catch(err) {
        console.error(err);
        res.send("Error");
    }
});

app.post('/debts/delete', requireAuth, async (req, res) => {
    try {
        await dbRun(`DELETE FROM debts WHERE id = ? AND user_id = ?`, [req.body.debtId, req.session.user.id]);
        res.redirect('/debts');
    } catch(err) {
        console.error(err);
        res.send("Error");
    }
});

// ==== CATEGORY MANAGER ROUTES ====

app.get('/categories', requireAuth, async (req, res) => {
    try {
        const categories = await dbQuery(`SELECT * FROM categories WHERE user_id IS NULL OR user_id = ? ORDER BY type, name`, [req.session.user.id]);
        res.render('categories', { categories });
    } catch(err) {
        console.error(err);
        res.send("Error");
    }
});

app.post('/categories', requireAuth, async (req, res) => {
    const { name, type, icon, color } = req.body;
    try {
        await dbRun(
            `INSERT INTO categories (user_id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)`,
            [req.session.user.id, name, type, icon || 'bi-tag', color || '#6c757d']
        );
        res.redirect('/categories');
    } catch(err) {
        console.error(err);
        res.send("Error");
    }
});

app.post('/categories/delete', requireAuth, async (req, res) => {
    try {
        // Can only delete custom categories belonging to this user
        await dbRun(`DELETE FROM categories WHERE id = ? AND user_id = ?`, [req.body.categoryId, req.session.user.id]);
        res.redirect('/categories');
    } catch(err) {
        console.error(err);
        res.send("Error");
    }
});

// ==== AI ADVISOR ROUTES ====

app.get('/ai-advisor', requireAuth, (req, res) => {
    res.render('ai-advisor');
});

app.post('/api/ai-advisor', requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    try {
        // Fetch User Data for prompt
        const transactions = await dbQuery(`
            SELECT t.amount, t.description, c.name as category_name 
            FROM transactions t JOIN categories c ON t.category_id = c.id 
            WHERE t.user_id = ? AND t.type = 'EXPENSE' AND cast(strftime('%m', t.transaction_date) as integer) = ? AND cast(strftime('%Y', t.transaction_date) as integer) = ?
        `, [userId, currentMonth, currentYear]);

        const budgets = await dbQuery(`
            SELECT b.amount, c.name as category_name,
                   (SELECT COALESCE(SUM(amount), 0) FROM transactions t WHERE t.user_id = b.user_id AND t.category_id = b.category_id AND cast(strftime('%m', t.transaction_date) as integer) = b.month AND cast(strftime('%Y', t.transaction_date) as integer) = b.year) as spent_amount 
            FROM budgets b JOIN categories c ON b.category_id = c.id 
            WHERE b.user_id = ? AND b.month = ? AND b.year = ?
        `, [userId, currentMonth, currentYear]);

        const allowance = req.session.user.monthly_allowance;

        // Build the prompt
        let prompt = `You are an expert, friendly financial advisor for a college student named ${req.session.user.name}. 
Their monthly allowance is ₹${allowance}. 
Here are their budgets for this month: \n`;
        budgets.forEach(b => {
            prompt += `- ${b.category_name}: Budget ₹${b.amount}, Spent ₹${b.spent_amount}\n`;
        });
        
        prompt += `\nHere are their recent expenses this month: \n`;
        transactions.forEach(t => {
            prompt += `- ₹${t.amount} for "${t.description}" (${t.category_name})\n`;
        });

        prompt += `\nBased on this data, provide a short, actionable, and encouraging financial assessment (max 3-4 paragraphs). Tell them where they are spending too much, where they can save money, and give 2 specific tips to improve their habits. Format your response in Markdown. Do not use generic advice, rely strictly on their actual spending data. Keep it concise.`;

        // Call Gemini
        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: prompt,
        });

        res.json({ advice: response.text });

    } catch (err) {
        console.error("AI Error:", err);
        res.status(500).json({ error: 'Failed to generate AI advice. Check your API key in .env file and try again.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

process.on('exit', (code) => {
    console.log('Process exit event with code: ', code);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
