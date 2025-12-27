# 🚀 FIXED - Correct File Structure for Apify

## ✅ Issue Resolved

The error `Cannot find module '/usr/src/app/src/main.js'` was caused by incorrect file structure.

## 📁 Correct File Structure for Apify

Upload these files **directly to the root** of your Apify actor:

```
bradford-tax-scraper/
├── main.js                 ← ROOT LEVEL (not in src/)
├── INPUT_SCHEMA.json       ← ROOT LEVEL
├── package.json            ← ROOT LEVEL
└── .actor/
    └── actor.json          ← In .actor folder
```

## 🔧 How to Upload in Apify Console

### Step 1: Delete Everything
1. Go to your actor in Apify Console
2. Click "Source" tab
3. Delete the default files

### Step 2: Upload Files in This Order

**1. Create `.actor` folder:**
- Click "Add file" → "Add folder"
- Name it: `.actor`
- Upload `actor.json` into this folder

**2. Upload root files:**
- Click "Add file" → "Upload file"
- Upload these 3 files to the ROOT (not in any folder):
  - `main.js`
  - `package.json`
  - `INPUT_SCHEMA.json`

### Step 3: Verify Structure

Your file tree should look like:
```
📁 bradford-tax-scraper
  📁 .actor
    📄 actor.json
  📄 main.js           ← Must be at root
  📄 package.json      ← Must be at root
  📄 INPUT_SCHEMA.json ← Must be at root
```

### Step 4: Build & Run

1. Click "Build" (wait ~30 seconds)
2. Click "Start"
3. Enter your credentials
4. Run!

## ⚠️ Common Mistakes

❌ **Wrong:** Uploading main.js inside `src/` folder
✅ **Right:** Uploading main.js to the root level

❌ **Wrong:** Not creating the `.actor` folder
✅ **Right:** Creating `.actor` folder first, then uploading actor.json into it

## 🎯 Quick Fix Checklist

- [ ] Delete all existing files in Apify
- [ ] Create `.actor` folder
- [ ] Upload `actor.json` to `.actor/` folder
- [ ] Upload `main.js` to ROOT (not src/)
- [ ] Upload `package.json` to ROOT
- [ ] Upload `INPUT_SCHEMA.json` to ROOT
- [ ] Click "Build"
- [ ] Click "Start"

## 📦 Files You Need (4 total)

1. **main.js** - The scraper code
2. **package.json** - Dependencies
3. **INPUT_SCHEMA.json** - Input form
4. **.actor/actor.json** - Actor config

## 🔄 Alternative: Use Apify CLI

If you prefer CLI (easier):

```bash
# In the bradford-tax-scraper folder
apify login
apify push
```

The CLI will automatically handle the file structure correctly.

---

**Status:** This is now the correct structure! Should work immediately. 🚀
