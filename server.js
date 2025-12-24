const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(express.static('.')); // Serve index.html & assets

// Database SQLite (Vercel: file akan dibuat di /tmp jika serverless)
const db = new sqlite3.Database('./database.db', err => {
  if(err) console.error(err);
});

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    password TEXT,
    ram TEXT,
    price INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS promo (
    id INTEGER PRIMARY KEY,
    start_ts INTEGER
  )`);
});

// Helper generate password random
function randomPassword(len=8){
  return crypto.randomBytes(len).toString('hex').slice(0,len);
}

// Get price (handle promo UNLIMITED)
function getPrice(ram){
  const now = Date.now();
  return new Promise((resolve,reject)=>{
    db.get("SELECT start_ts FROM promo WHERE id=1",(err,row)=>{
      let promoActive=false;
      if(row && row.start_ts){
        if(now-row.start_ts<2*24*3600*1000) promoActive=true;
      }
      if(ram==='unlimited'){
        resolve(promoActive ? 5000 : 12000);
      }else{
        resolve(parseInt(ram)*1000);
      }
    });
  });
}

// Set promo start if not exist
db.get("SELECT * FROM promo WHERE id=1",(err,row)=>{
  if(!row) db.run("INSERT INTO promo(id,start_ts) VALUES(1,?)",[Date.now()]);
});

// Endpoint create account
app.post('/create-account', async (req,res)=>{
  try{
    const {username,ram}=req.body;
    if(!username || !ram) return res.json({success:false});

    const password=randomPassword(8);
    const price=await getPrice(ram);

    // --- Panel Ptredoctly API call ---
    const panelApiKey='ptla_vIsOlvAjjFVmhok5VRwl1fZiNvDYpP6cRAIF3kUlvup';
    const apiUrl='http://anonpantatjebol.zonapanel.web.id/api/create'; // sesuaikan endpoint panel
    const bodyData={username,password,ram,apikey:panelApiKey};

    // Uncomment jika pakai API nyata
    /*
    const apiRes = await fetch(apiUrl,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(bodyData)
    });
    const panelResult = await apiRes.json();
    if(!panelResult.success) throw new Error("Gagal create akun di panel");
    */

    // Simulasi sukses (untuk testing)
    const panelResult={success:true};

    if(!panelResult.success) return res.json({success:false});

    // Save to SQLite
    db.run(`INSERT INTO accounts(username,password,ram,price) VALUES(?,?,?,?)`,
      [username,password,ram,price]);

    res.json({success:true,username,password,ram,price});
  }catch(e){
    console.error(e);
    res.json({success:false});
  }
});

// Vercel serverless, listen tidak perlu PORT fixed
const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log(`Server running at https://anonmarketshop.vercel.app`));
