# GitHub Pages Deployment Guide

Complete step-by-step instructions to deploy GPIC Dashboard to GitHub Pages with automatic updates.

## Prerequisites

- GitHub account
- Git installed locally
- Node.js 16+ installed
- This repository cloned/forked

## Step 1: Prepare Your GitHub Repository

### 1.1 Create/Update Repository Settings

1. Go to your GitHub repository: `github.com/yourusername/gpic-dashboard`
2. Click **Settings** → **Pages**
3. Under "Source":
   - **Branch**: Select `gh-pages`
   - **Folder**: Select `/ (root)`
4. Click **Save**

Your page will be live at: `https://yourusername.github.io/gpic-dashboard/`

### 1.2 Enable GitHub Actions

1. Go to **Settings** → **Actions** → **General**
2. Under "Actions permissions": Select "Allow all actions and reusable workflows"
3. Click **Save**

This allows automatic deployment when you push to main branch.

## Step 2: Configure the Project

### 2.1 Update vite.config.js

**IMPORTANT**: Update the base path with YOUR repository name:

```javascript
// vite.config.js
export default defineConfig({
  plugins: [react()],
  base: '/gpic-dashboard/',  // ← YOUR REPO NAME HERE
  // ... rest of config
})
```

**If your repo name is different**, change `gpic-dashboard` to match.

Examples:
```javascript
base: '/my-dashboard/',      // For repo: my-dashboard
base: '/optimizer/',         // For repo: optimizer
base: '/',                   // For user pages (rare)
```

### 2.2 Update README.md

Change the demo link:
```markdown
## Live Demo

🔗 **https://yourusername.github.io/gpic-dashboard**

*(Replace yourusername with your GitHub username)*
```

## Step 3: First-Time Setup

### 3.1 Install Dependencies Locally

```bash
cd gpic-dashboard
npm install
```

### 3.2 Test Locally

```bash
npm run dev
```

Visit `http://localhost:5173` to verify it works.

### 3.3 Build Locally (Optional)

```bash
npm run build
```

Creates `dist/` folder with production build.

## Step 4: Deploy to GitHub

### Method A: Automatic Deployment (Recommended)

This uses GitHub Actions to automatically build and deploy on every push.

**4A.1 Commit and Push to Main**

```bash
# Make sure all changes are ready
git add .
git commit -m "Initial GPIC Dashboard with GLPK solver"
git push origin main
```

**4A.2 GitHub Actions Runs Automatically**

- Watch **Actions** tab in GitHub
- Workflow `Deploy to GitHub Pages` should run
- Shows green ✅ when complete

**4A.3 Access Your Site**

Wait 2-3 minutes, then visit:
```
https://yourusername.github.io/gpic-dashboard
```

### Method B: Manual Deployment

If automatic deployment doesn't work:

**4B.1 Build Locally**

```bash
npm run build
```

**4B.2 Deploy Using Git Subtree**

```bash
git add dist -f
git commit -m "Deploy to GitHub Pages"
git subtree push --prefix dist origin gh-pages
```

**4B.3 Verify**

- Check GitHub Pages status in Settings
- Visit your site URL
- Should see the dashboard

## Step 5: Verify Deployment

### Check 1: GitHub Pages Status

1. Go to repository **Settings** → **Pages**
2. Should see: "Your site is live at https://yourusername.github.io/gpic-dashboard/"
3. If shows error, check:
   - [ ] `gh-pages` branch exists
   - [ ] GitHub Actions ran successfully
   - [ ] Base path in `vite.config.js` is correct

### Check 2: Test the Application

1. Visit your site URL
2. Verify:
   - [ ] Page loads (no 404)
   - [ ] Dashboard displays
   - [ ] Inputs are interactive
   - [ ] Solver computes results
   - [ ] Values update in real-time

### Check 3: Browser Console

Open Developer Tools (F12):
1. **Console**: No red errors
2. **Network**: All assets load (200 status)
3. **Application**: Service worker registered (if applicable)

## Step 6: Making Updates

### Update the Code

```bash
# Make code changes
# Example: Edit Dashboard.jsx

git add .
git commit -m "Update dashboard styling"
git push origin main
```

### Automatic Deployment Happens

1. GitHub Actions automatically runs
2. Builds the project
3. Deploys to gh-pages
4. Your site updates in 2-3 minutes

### Manual Check

- Go to **Actions** tab
- See latest workflow run
- Should show green ✅
- Check your site for updates

## Troubleshooting

### Issue: "404 Not Found" or Blank Page

**Solution 1**: Verify base path
```javascript
// vite.config.js - Make sure this matches your repo name
base: '/gpic-dashboard/',
```

Then:
```bash
npm run build
git add dist
git commit -m "Fix base path"
git push origin main
```

**Solution 2**: Check GitHub Pages settings
1. Settings → Pages
2. Branch: `gh-pages` ✓
3. Folder: `/ (root)` ✓

**Solution 3**: Clear browser cache
- Press Ctrl+Shift+Delete (Cmd+Shift+Delete on Mac)
- Clear cached images/files
- Revisit site

### Issue: GitHub Actions Failed

1. Go to **Actions** tab
2. Click on failed workflow
3. Scroll down to see error details
4. Common fixes:
   - Check `deploy.yml` syntax
   - Ensure `npm ci` succeeds
   - Verify `npm run build` succeeds locally

### Issue: GLPK Not Loading

Check browser console for:
- `Uncaught TypeError: glpk is undefined`

Solutions:
- [ ] Refresh page (Ctrl+R)
- [ ] Hard refresh (Ctrl+Shift+R)
- [ ] Clear cache (see above)
- [ ] Try different browser
- [ ] Check internet connection

### Issue: Solver Returns Error

If solver fails to compute:
- Refresh the page
- Verify all inputs are positive numbers
- Check that capacities are reasonable
- Try test values: `Amm:325, Meth:250, Urea:400, Gas:5`

## Advanced Configuration

### Custom Domain (Optional)

To use your own domain (e.g., `optimizer.example.com`):

1. Add `CNAME` file to repo:
   ```bash
   echo "optimizer.example.com" > CNAME
   ```

2. Update GitHub Pages:
   - Settings → Pages
   - Custom domain: `optimizer.example.com`
   - Enforce HTTPS: ✓

3. Update DNS records with your registrar
   - Point to GitHub Pages IP (check GitHub docs)

### Environment Variables

If you need API keys or secrets:

1. Create `.env.example`:
   ```
   VITE_API_KEY=your_key_here
   ```

2. In **Settings** → **Secrets and Variables** → **Actions**:
   - Add secret: `VITE_API_KEY`

3. Update `.github/workflows/deploy.yml`:
   ```yaml
   - name: Build
     env:
       VITE_API_KEY: ${{ secrets.VITE_API_KEY }}
     run: npm run build
   ```

## Maintenance

### Keep Dependencies Updated

Monthly check:
```bash
npm outdated
npm update
```

Then commit and push:
```bash
git commit -am "Update dependencies"
git push origin main
```

### Monitor GitHub Actions

Check **Actions** tab regularly to ensure deployments succeed.

### Backup Your Work

Push frequently:
```bash
git push origin main
```

Git is version control - you can always revert bad changes:
```bash
git reset --hard HEAD~1
git push origin main -f
```

## Security

### GitHub Token

The GitHub Actions workflow uses a built-in token (`secrets.GITHUB_TOKEN`).

**DO NOT:**
- Hardcode personal access tokens
- Commit credentials to git
- Share `.env` files

**DO:**
- Use GitHub Secrets for sensitive data
- Use `.gitignore` for local .env files
- Review Actions permissions regularly

## Performance Tips

### 1. Caching

GitHub Actions caches `node_modules`:
```yaml
cache: 'npm'  # ← Already in deploy.yml
```

### 2. GLPK Optimization

GLPK WASM is loaded once and cached:
- First visit: ~2 seconds (WASM load)
- Subsequent: <200ms (browser cache)

### 3. Bundle Size

Current production build: ~150KB gzipped
- Vite minification: Enabled
- React production mode: Enabled

Monitor in build output:
```bash
npm run build
# → "dist/index.html                    0.45 kB"
# → "dist/assets/index-abc123.js   148.23 kB"
```

## Support & Questions

### Resources

- GitHub Pages Docs: https://docs.github.com/en/pages
- GitHub Actions: https://docs.github.com/en/actions
- GLPK.js: https://github.com/jlppc/glpk.js
- Vite Docs: https://vitejs.dev/

### Getting Help

1. Check this guide's **Troubleshooting** section
2. Review GitHub Issues in repository
3. Check browser Developer Tools (F12)
4. See error messages in **Actions** workflow logs

---

**Deployment Complete!** 🎉

Your GPIC Dashboard is now live and will automatically update whenever you push to the main branch.

Enjoy your LP optimizer!
