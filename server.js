const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

// ===== DATABASE =====
const db = new sqlite3.Database('./database.db', (err)=>{
    if(err) console.log(err);
    else console.log('SQLite ready');
});

db.serialize(()=>{
    // Users
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Orders
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT,
        user_id INTEGER,
        amount INTEGER,
        detail TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Reports
    db.run(`CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        whatsapp TEXT,
        message TEXT,
        file TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Stock
    db.run(`CREATE TABLE IF NOT EXISTS stock (
        product_name TEXT PRIMARY KEY,
        quantity INTEGER,
        last_restock DATETIME
    )`);
});

// ===== DEFAULT STOCK =====
const defaultStock = [
    {name:"Sewa Bot Jaga Grup WhatsApp 1 Bulan", qty:10},
    {name:"Panel Ptredoctuly Unlimited", qty:10},
    {name:"Nokos Brazil", qty:10}
];

defaultStock.forEach(p=>{
    db.run(`INSERT OR IGNORE INTO stock(product_name,quantity,last_restock) VALUES(?,?,?)`, [p.name,p.qty,new Date()]);
});

// ===== PAKASIR =====
const PAKASIR_SLUG_DEFAULT = 'sewa-bot-whatsapp-anon';

// ===== AUTH =====
app.post('/register',(req,res)=>{
    const {name,email,password} = req.body;
    db.run(`INSERT INTO users(name,email,password) VALUES(?,?,?)`,[name,email,password], function(err){
        if(err) return res.status(400).json({error:'Email sudah terdaftar'});
        res.json({user_id:this.lastID, name, email});
    });
});

app.post('/login',(req,res)=>{
    const {email,password} = req.body;
    db.get(`SELECT * FROM users WHERE email=? AND password=?`, [email,password], (err,row)=>{
        if(err || !row) return res.status(400).json({error:'User tidak ditemukan'});
        res.json({user_id:row.id, name:row.name, email:row.email});
    });
});

// ===== CREATE PAYMENT =====
app.post('/create-payment',(req,res)=>{
    const { order_id, amount, detail, user_id, slug } = req.body;
    db.run(`INSERT INTO orders(order_id,user_id,amount,detail) VALUES(?,?,?,?)`,
        [order_id,user_id,amount,detail], function(err){
        if(err) return res.status(500).json({error:'DB error'});
        const paySlug = slug || PAKASIR_SLUG_DEFAULT;
        const url = `https://app.pakasir.com/pay/${paySlug}/${amount}?order_id=${order_id}`;
        res.json({url});
    });
});

// ===== DASHBOARD =====
app.get('/dashboard/:user_id',(req,res)=>{
    const user_id=req.params.user_id;
    db.all(`SELECT * FROM orders WHERE user_id=?`,[user_id],(err,rows)=>{
        if(err) return res.status(500).json({error:'DB error'});
        res.json(rows);
    });
});

// ===== REPORT =====
app.post('/report',(req,res)=>{
    const {name,whatsapp,message,file} = req.body;
    db.run(`INSERT INTO reports(name,whatsapp,message,file) VALUES(?,?,?,?)`, [name,whatsapp,message,file||""], function(err){
        if(err) return res.status(500).json({error:'DB error'});
        res.json({success:true});
    });
});

// ===== ADMIN LOGIN =====
const ADMIN_PASSWORD = "admin123"; // ganti password
app.post('/admin/login',(req,res)=>{
    const {password} = req.body;
    if(password===ADMIN_PASSWORD) res.json({success:true});
    else res.status(401).json({error:"Password salah"});
});

// ===== ADMIN GET REPORTS =====
app.get('/admin/reports',(req,res)=>{
    db.all(`SELECT * FROM reports ORDER BY created_at DESC`,[],(err,rows)=>{
        if(err) return res.status(500).json({error:'DB error'});
        res.json(rows);
    });
});

// ===== STOCK =====
app.get('/stock',(req,res)=>{
    db.all(`SELECT * FROM stock`,[],(err,rows)=>{
        if(err) return res.status(500).json({error:'DB error'});
        res.json(rows);
    });
});

app.post('/stock/restock',(req,res)=>{
    const now = new Date();
    defaultStock.forEach(p=>{
        db.run(`UPDATE stock SET quantity=?, last_restock=? WHERE product_name=?`, [p.qty,now,p.name]);
    });
    res.json({success:true});
});

app.listen(PORT,()=>console.log(`Server running at http://localhost:${PORT}`));
