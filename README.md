# SpendWise

SpendWise is a premium, localized personal finance dashboard designed for college students to track expenses, manage budgets, track debts, and achieve savings goals.

## Features
- **Dashboard**: Quick overview of your monthly allowance, expenses, income, and remaining budget.
- **Transactions & Custom Categories**: Log your daily expenses and income. Create custom categories for highly personalized tracking.
- **Budgets & Savings Goals**: Set monthly limits and visual savings targets.
- **Subscriptions Tracker**: Track recurring monthly payments (Netflix, Gym, etc.).
- **Roommate Bill Splitter**: Split shared bills with friends and automatically send WhatsApp reminders.
- **Debt Tracker**: Manage money you've borrowed or lent.
- **AI Advisor**: Get personalized financial advice based on your real spending habits powered by Google Gemini.
- **Analytics & Export**: Visual charts of your spending trends and CSV export.

## Tech Stack
- **Backend:** Node.js, Express.js
- **Database:** SQLite (Embedded, serverless)
- **Frontend:** EJS (Embedded JavaScript), Bootstrap 5, Chart.js
- **AI Integration:** Google Gemini API

## Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YOUR-USERNAME/SpendWise.git
   cd SpendWise
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   - Rename `.env.example` to `.env`
   - Add your Google Gemini API key to the `.env` file:
   ```env
   SESSION_SECRET=your_secret_key_here
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. **Run the server:**
   ```bash
   node server.js
   ```

5. **Open in Browser:**
   Go to `http://localhost:3000`
