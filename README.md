# 💧 SMS Water Supply App — Supabase + Vercel

## Stack
- React + Vite (Frontend)
- Supabase (Database + Auth + Realtime)
- Vercel (Hosting — Free)

---

## Step 1: Install & Run Locally

```bash
npm install
npm run dev
```
Open: http://localhost:5173

---

## Step 2: Deploy to Vercel (Free)

1. Go to https://vercel.com → Sign up with GitHub
2. Push your project to a GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/sms-water-supply.git
   git push -u origin main
   ```
3. Go to Vercel → "New Project" → Import from GitHub
4. Select your repo → Click "Deploy"
5. Done! Your app is live at: https://your-app.vercel.app

## Redeploy After Changes
Just push to GitHub:
```bash
git add .
git commit -m "update"
git push
```
Vercel auto-deploys every time you push! ✅

---

## URLs
- Admin: https://your-app.vercel.app
- Delivery Boys: https://your-app.vercel.app/delivery

---

## Supabase Details
- URL: https://draofilyocdmazjfoblc.supabase.co
- Tables: customers, orders, trips, deliveries, truck_stock
