import sqlite3 from "sqlite3";
import crypto from "crypto";
import fetch from "node-fetch";

const db = new sqlite3.Database("/tmp/database.db");

// ================= DB =================
db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS orders(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT UNIQUE,
    username TEXT,
    ram TEXT,
    amount INTEGER,
    ip TEXT,
    status TEXT,
    created_at INTEGER
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS promo(
    id INTEGER PRIMARY KEY,
    start_ts INTEGER
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS ratelimit(
    ip TEXT,
    ts INTEGER
  )`);
});

db.get("SELECT * FROM promo WHERE id=1",(e,r)=>{
  if(!r) db.run("INSERT INTO promo VALUES(1,?)",[Date.now()]);
});

// ================= CONFIG =================
const PANEL_URL="https://anonpantatjebol.zonapanel.web.id";
const PANEL_API_KEY="ptla_vIsOlvAjjFVmhok5VRwl1fZiNvDYpP6cRAIF3kUlvup";

// ================= UTIL =================
function randPass(len=8){
  return crypto.randomBytes(len).toString("hex").slice(0,len);
}

function validRam(ram){
  return ram==="unlimited" || (Number(ram)>=1 && Number(ram)<=9);
}

async function priceRam(ram){
  return new Promise(res=>{
    db.get("SELECT start_ts FROM promo WHERE id=1",(e,r)=>{
      const promo = Date.now()-r.start_ts < 2*24*60*60*1000;
      if(ram==="unlimited") res(promo?5000:12000);
      else res(Number(ram)*1000);
    });
  });
}

function rateLimit(ip){
  return new Promise((resolve)=>{
    const now=Date.now();
    db.all("SELECT * FROM ratelimit WHERE ip=?",[ip],(e,r)=>{
      const recent=r.filter(x=>now-x.ts<60000);
      if(recent.length>=10) return resolve(false);
      db.run("INSERT INTO ratelimit VALUES(?,?)",[ip,now]);
      resolve(true);
    });
  });
}

// ================= PANEL =================
async function createUser(username,password){
  const r=await fetch(`${PANEL_URL}/api/application/users`,{
    method:"POST",
    headers:{
      Authorization:`Bearer ${PANEL_API_KEY}`,
      "Content-Type":"application/json",
      Accept:"application/json"
    },
    body:JSON.stringify({
      username,
      email:`${username}@anon.local`,
      first_name:username,
      last_name:"Anon",
      password
    })
  });
  const j=await r.json();
  return j?.attributes?.id;
}

async function createServer(userId,ram){
  const memory=ram==="unlimited"?0:Number(ram)*1024;
  await fetch(`${PANEL_URL}/api/application/servers`,{
    method:"POST",
    headers:{
      Authorization:`Bearer ${PANEL_API_KEY}`,
      "Content-Type":"application/json",
      Accept:"application/json"
    },
    body:JSON.stringify({
      name:"Panel Ptredoctly",
      user:userId,
      egg:1,
      docker_image:"ghcr.io/pterodactyl/yolks:nodejs_18",
      startup:"npm start",
      limits:{memory,swap:0,disk:0,io:500,cpu:0},
      feature_limits:{databases:1,backups:1,allocations:1},
      allocation:{default:1}
    })
  });
}

// ================= WEBHOOK =================
export default async function handler(req,res){
  if(req.method!=="POST") return res.status(200).send("OK");

  const ip=req.headers["x-forwarded-for"]||"unknown";
  if(!await rateLimit(ip))
    return res.status(429).json({error:"Too many requests"});

  let raw="";
  for await(const c of req) raw+=c;
  const data=JSON.parse(raw);

  if(data.status!=="PAID")
    return res.json({ignored:true});

  const {order_id,amount,custom_field}=data;
  const {username,ram}=custom_field||{};

  if(!order_id||!username||!validRam(ram))
    return res.status(400).json({error:"Invalid data"});

  db.get("SELECT * FROM orders WHERE order_id=?",[order_id],async(e,row)=>{
    if(row) return res.json({ignored:"duplicate order"});

    const realPrice=await priceRam(ram);
    if(Number(amount)!==realPrice)
      return res.status(400).json({error:"Invalid amount"});

    const password=randPass();
    const userId=await createUser(username,password);
    if(!userId) return res.status(500).json({error:"Panel error"});

    await createServer(userId,ram);

    db.run(
      "INSERT INTO orders(order_id,username,ram,amount,ip,status,created_at) VALUES(?,?,?,?,?,?,?)",
      [order_id,username,ram,amount,ip,"PAID",Date.now()]
    );

    res.json({
      success:true,
      panel:{
        url:PANEL_URL,
        username,
        password
      }
    });
  });
}
