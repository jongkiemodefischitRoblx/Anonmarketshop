const express = require("express");
const bodyParser = require("body-parser");
const sqlite3 = require("sqlite3").verbose();
const app = express();
const PORT = process.env.PORT || 3000;

// DATABASE
const db = new sqlite3.Database("./database.db", (err)=>{
  if(err) console.error(err.message);
  else console.log("Database connected!");
});

db.run(`CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT UNIQUE,
  product TEXT,
  username TEXT,
  ram TEXT,
  amount INTEGER,
  status TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// WEBHOOK PAKASIR
app.post("/webhook/pakasir", (req,res)=>{
  const data = req.body;
  console.log("Webhook received:", data);

  const { order_id, product_slug, amount } = data;
  let username="N/A", ram="N/A";

  db.run(`INSERT OR IGNORE INTO orders(order_id, product, username, ram, amount, status) VALUES(?,?,?,?,?,?)`,
    [order_id, product_slug, username, ram, amount, "PAID"],
    function(err){
      if(err) console.error(err.message);
      else console.log(`Order saved: ${order_id}`);
    });

  res.status(200).send("OK");
});

// GET ALL ORDERS
app.get("/orders",(req,res)=>{
  db.all(`SELECT * FROM orders ORDER BY created_at DESC`, [], (err,rows)=>{
    if(err) return res.status(500).send(err.message);
    res.json(rows);
  });
});

app.listen(PORT, ()=>{
  console.log(`Server running at http://localhost:${PORT}`);
});
