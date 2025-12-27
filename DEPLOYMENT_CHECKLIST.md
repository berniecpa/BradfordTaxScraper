# ✅ FINAL DEPLOYMENT CHECKLIST - v1.1.1

## 🎯 All Issues FIXED

- ✅ File structure corrected (main.js at root)
- ✅ Password selector fixed (txtUserPass)
- ✅ Permission error fixed (integrated login)
- ✅ Puppeteer error fixed (Docker + dependencies)

## 📦 Files to Upload (6 Total)

### Upload to Apify in this exact structure:

```
📁 Your Actor (root)
  📁 .actor/
    📄 actor.json          ← Upload this to .actor folder
  📄 Dockerfile            ← Upload to ROOT
  📄 .dockerignore        ← Upload to ROOT
  📄 main.js              ← Upload to ROOT
  📄 package.json         ← Upload to ROOT
  📄 INPUT_SCHEMA.json    ← Upload to ROOT
```

## 🚀 Step-by-Step Upload

### 1. Clean Slate
- Go to your actor in Apify Console
- Click "Source" tab
- **Delete everything** currently there

### 2. Create .actor Folder
- Click "Add file" → "Add folder"
- Name: `.actor` (with the dot!)
- Click "Create folder"

### 3. Upload to .actor Folder
- **Open the `.actor` folder** (click on it)
- Upload: `actor.json` ⬆️ (from downloads above)

### 4. Go Back to Root
- Click "bradford-tax-scraper" (or your actor name) to go back to root

### 5. Upload to Root (5 files)
- Upload: `Dockerfile` ⬆️
- Upload: `.dockerignore` ⬆️
- Upload: `main.js` ⬆️
- Upload: `package.json` ⬆️
- Upload: `INPUT_SCHEMA.json` ⬆️

### 6. Verify Structure
Your file tree should look EXACTLY like this:
```
📦 bradford-tax-scraper
  📁 .actor
    📄 actor.json
  📄 .dockerignore
  📄 Dockerfile
  📄 INPUT_SCHEMA.json
  📄 main.js
  📄 package.json
```

### 7. Build
- Click "Build" button (top right)
- Wait 60-90 seconds (first build with Puppeteer takes longer)
- Should see: "Build succeeded ✅"

### 8. Test Run
- Click "Start"
- Enter:
  - Email: `your@email.com`
  - Password: `••••••••`
  - Max Articles: `5` (start small!)
- Click "Start" button

### 9. Watch Logs
Expected output:
```
🚀 Starting Bradford Tax Institute Scraper
📊 Target: 5 articles max
🔐 Logging in to Bradford Tax Institute...
   Filling in credentials...
   Submitting login form...
✅ Login successful!

📋 Navigating to article list...
📋 Processing list page...
   Found 20 potential article links
   Enqueued 5 articles for scraping

📄 Scraping article 1/5...
   ✅ Saved article 1/5
📄 Scraping article 2/5...
   ✅ Saved article 2/5
...
```

### 10. Check Results
- Click "Dataset" tab
- Should see 5 articles with:
  - title
  - author
  - date
  - content
  - url
- Click "Export" → Download as JSON/CSV

## ⚠️ Common Upload Mistakes

| ❌ Wrong | ✅ Right |
|---------|----------|
| `src/main.js` | `main.js` (at root) |
| `actor/actor.json` | `.actor/actor.json` (note the dot) |
| `.dockerfile` | `Dockerfile` (capital D, no dot) |
| Forgetting `.dockerignore` | Upload `.dockerignore` |

## 🎯 Success Indicators

### ✅ Build Succeeded
You should see:
```
Installing dependencies...
✓ puppeteer@21.0.0
✓ crawlee@3.5.0
✓ apify@3.1.0
Build succeeded!
```

### ✅ Login Worked
You should see:
```
🔐 Logging in...
✅ Login successful!
```

### ✅ Articles Scraped
You should see:
```
📄 Scraping article 1/5...
   ✅ Saved article 1/5
```

## 🔧 If Something Goes Wrong

### Build Fails
- Double-check all 6 files are uploaded
- Verify `Dockerfile` is at root (not in folder)
- Check `.actor/actor.json` exists in .actor folder
- Click "Build" again

### Login Fails
- Verify credentials are correct
- Try logging in manually on Bradford's website first
- Check for error messages in logs

### No Articles Found
- Verify subscription is active
- Check you can access articles when logged in manually
- Look at logs to see what URLs were found

## 📊 Expected Costs

- **First Build**: Free (uses your $5/month credit)
- **Per Run (50 articles)**: ~$0.10
- **Monthly (500 articles)**: ~$1.00

Easily fits within free tier!

## 🎉 You're Done When...

- [ ] All 6 files uploaded correctly
- [ ] File structure matches exactly
- [ ] Build succeeds (green checkmark)
- [ ] Test run with 5 articles works
- [ ] Dataset shows article data
- [ ] Can export to JSON/CSV

---

## 🚀 Next Steps After Success

1. **Scale Up**: Change maxArticles to 50, 100, or more
2. **Schedule**: Set up daily/weekly runs
3. **Integrate**: Connect to Google Sheets, Airtable, etc.
4. **Monitor**: Check run history and costs

---

**Ready?** Download the 6 files above ⬆️ and follow this checklist! 🎯
