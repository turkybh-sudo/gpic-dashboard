# Quick Start Guide

Get GPIC Dashboard live in **5 minutes**.

## 1️⃣ Prerequisites

- GitHub account
- Git installed
- Node.js 16+ installed

## 2️⃣ Clone Repository

```bash
git clone https://github.com/yourusername/gpic-dashboard.git
cd gpic-dashboard
```

## 3️⃣ Update Configuration

Edit `vite.config.js` - change `gpic-dashboard` to your repo name:

```javascript
base: '/gpic-dashboard/',  // ← YOUR REPO NAME
```

## 4️⃣ Install & Test

```bash
npm install
npm run dev
```

Visit `http://localhost:5173` ✓

## 5️⃣ Deploy to GitHub Pages

```bash
git add .
git commit -m "Initial deploy with GLPK solver"
git push origin main
```

**Wait 2-3 minutes...**

## 6️⃣ Your Site is Live! 🎉

Visit: `https://yourusername.github.io/gpic-dashboard/`

---

## That's it!

For detailed instructions, see: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)

### Troubleshooting

**Page shows 404?**
- Check base path in `vite.config.js` matches repo name
- Verify GitHub Pages settings (Settings → Pages)

**Solver not working?**
- Open DevTools (F12)
- Check Console for errors
- Try different browser

**Need more help?**
- See [README.md](README.md) for full documentation
- Check [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for detailed steps
